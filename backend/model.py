"""
AGT-FDIA Model Definition
Adaptive Graph Transformer for False Data Injection Attack Detection
in Smart Grids (IEEE 9-bus topology).

This file mirrors the architecture used during training.
Replace best_AGTFDIA.pt with your own trained weights.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


# ── Positional Encoding ────────────────────────────────────────────────────────
class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 512, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(dropout)
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float) * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, d_model)
        x = x + self.pe[:, : x.size(1)]
        return self.dropout(x)


# ── Graph Transformer Layer ────────────────────────────────────────────────────
class GraphTransformerLayer(nn.Module):
    """
    Attention over node features, optionally biased by a learned adjacency.
    """

    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, num_heads, dropout=dropout, batch_first=True)
        self.ff = nn.Sequential(
            nn.Linear(d_model, d_model * 4),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 4, d_model),
        )
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.drop = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, adj_bias: torch.Tensor | None = None) -> torch.Tensor:
        # x: (B, N, d_model)
        residual = x
        attn_out, _ = self.attn(x, x, x, attn_mask=adj_bias)
        x = self.norm1(residual + self.drop(attn_out))
        x = self.norm2(x + self.drop(self.ff(x)))
        return x


# ── Spatial Encoder ────────────────────────────────────────────────────────────
class SpatialEncoder(nn.Module):
    """
    Stack of Graph Transformer Layers over the node dimension.
    Input: (B, N, d_model)  →  Output: (B, N, d_model)
    """

    def __init__(self, d_model: int, num_heads: int, num_layers: int, dropout: float = 0.1):
        super().__init__()
        self.layers = nn.ModuleList(
            [GraphTransformerLayer(d_model, num_heads, dropout) for _ in range(num_layers)]
        )
        # Learnable adjacency bias (N, N) – made into (1, N, N) for broadcasting
        self.adj_bias = None  # set externally after construction if desired

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for layer in self.layers:
            x = layer(x, self.adj_bias)
        return x


# ── Temporal Encoder ───────────────────────────────────────────────────────────
class TemporalEncoder(nn.Module):
    """
    Transformer encoder over the time dimension for each node.
    Input: (B*N, T, d_model)  →  Output: (B*N, T, d_model)
    """

    def __init__(self, d_model: int, num_heads: int, num_layers: int, dropout: float = 0.1):
        super().__init__()
        self.pos_enc = PositionalEncoding(d_model, dropout=dropout)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=num_heads,
            dim_feedforward=d_model * 4,
            dropout=dropout,
            batch_first=True,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.pos_enc(x)
        return self.encoder(x)


# ── Gumbel-Softmax ─────────────────────────────────────────────────────────────
class GumbelSoftmax(nn.Module):
    def __init__(self, tau: float = 1.0, hard: bool = False):
        super().__init__()
        self.tau = tau
        self.hard = hard

    def forward(self, logits: torch.Tensor) -> torch.Tensor:
        if self.training:
            return F.gumbel_softmax(logits, tau=self.tau, hard=self.hard)
        return F.softmax(logits / self.tau, dim=-1)


# ── Multi-Task Heads ───────────────────────────────────────────────────────────
class MultiTaskHeads(nn.Module):
    def __init__(self, d_model: int, num_nodes: int, num_risk_levels: int = 3):
        super().__init__()
        # Attack detection per node (binary)
        self.attack_head = nn.Linear(d_model, 2)
        # Voltage magnitude regression per node
        self.vm_head = nn.Linear(d_model, 1)
        # Voltage angle regression per node
        self.angle_head = nn.Linear(d_model, 1)
        # Risk classification per node
        self.risk_head = nn.Linear(d_model, num_risk_levels)
        # Adaptive mitigation weight per node (scalar in [0,1])
        self.weight_head = nn.Sequential(
            nn.Linear(d_model, 1),
            nn.Sigmoid(),
        )

    def forward(self, node_feats: torch.Tensor):
        # node_feats: (B, N, d_model)
        return {
            "attack_logits": self.attack_head(node_feats),   # (B, N, 2)
            "vm":            self.vm_head(node_feats).squeeze(-1),      # (B, N)
            "angle":         self.angle_head(node_feats).squeeze(-1),   # (B, N)
            "risk_logits":   self.risk_head(node_feats),     # (B, N, num_risk_levels)
            "weights":       self.weight_head(node_feats).squeeze(-1),  # (B, N)
        }


# ── AGT-FDIA ───────────────────────────────────────────────────────────────────
class AGTFDIA(nn.Module):
    """
    Adaptive Graph Transformer for FDIA Detection.

    Args
    ----
    in_dim     : number of measurement features per bus per time-step (e.g. 3 for P, Q, L)
    num_nodes  : number of buses in the grid (9 for IEEE 9-bus)
    config     : dict with model hyper-parameters
    """

    DEFAULT_CONFIG = {
        "d_model": 64,
        "spatial_heads": 4,
        "spatial_layers": 2,
        "temporal_heads": 4,
        "temporal_layers": 2,
        "num_risk_levels": 3,
        "dropout": 0.1,
        "gumbel_tau": 1.0,
    }

    def __init__(self, in_dim: int, num_nodes: int, config: dict | None = None):
        super().__init__()
        cfg = {**self.DEFAULT_CONFIG, **(config or {})}
        d = cfg["d_model"]

        self.num_nodes = num_nodes
        self.d_model = d

        # Input projection  (in_dim → d_model)
        self.input_proj = nn.Linear(in_dim, d)

        # Temporal encoder  operates on (B*N, T, d)
        self.temporal_enc = TemporalEncoder(
            d, cfg["temporal_heads"], cfg["temporal_layers"], cfg["dropout"]
        )

        # Spatial encoder   operates on (B, N, d)
        self.spatial_enc = SpatialEncoder(
            d, cfg["spatial_heads"], cfg["spatial_layers"], cfg["dropout"]
        )

        # Gumbel-softmax for discrete graph routing
        self.gumbel = GumbelSoftmax(tau=cfg["gumbel_tau"])

        # Multi-task output heads
        self.heads = MultiTaskHeads(d, num_nodes, cfg["num_risk_levels"])

    # ------------------------------------------------------------------
    def forward(self, x: torch.Tensor) -> dict:
        """
        x : (B, T, N, in_dim)
        """
        B, T, N, C = x.shape

        # ── 1. Input projection ──────────────────────────────────────
        x = self.input_proj(x)              # (B, T, N, d)

        # ── 2. Temporal encoding (per node) ─────────────────────────
        x = x.permute(0, 2, 1, 3)          # (B, N, T, d)
        x = x.reshape(B * N, T, self.d_model)
        x = self.temporal_enc(x)            # (B*N, T, d)
        # Pool over time → (B*N, d)
        x = x.mean(dim=1)
        x = x.reshape(B, N, self.d_model)  # (B, N, d)

        # ── 3. Spatial encoding (graph attention) ────────────────────
        x = self.spatial_enc(x)             # (B, N, d)

        # ── 4. Multi-task heads ──────────────────────────────────────
        out = self.heads(x)

        # Apply Gumbel-softmax to attack logits for routing
        out["attack_probs"] = self.gumbel(out["attack_logits"])   # (B, N, 2)
        out["risk_probs"] = F.softmax(out["risk_logits"], dim=-1)  # (B, N, R)

        return out


# ── Quick sanity check ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    model = AGTFDIA(in_dim=3, num_nodes=9)
    dummy = torch.randn(2, 5, 9, 3)   # batch=2, T=5, N=9, features=3
    out = model(dummy)
    for k, v in out.items():
        print(f"{k:20s}: {tuple(v.shape)}")
