"""
Smart Grid Cybersecurity System — FastAPI Backend
Simulates IEEE 9-bus SCADA telemetry, injects FDI attacks,
runs AGT-FDIA inference, and streams results over WebSocket.
"""

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn.functional as F
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from model import AGTFDIA

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("smartgrid")

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Smart Grid Cybersecurity API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants ──────────────────────────────────────────────────────────────────
NUM_NODES = 9          # IEEE 9-bus
NUM_FEATURES = 3       # P, Q, L (active power, reactive power, load)
WINDOW_SIZE = 5        # time steps fed to the model
DEVICE = torch.device("cpu")

# IEEE 9-bus edges (0-indexed)
EDGES = [
    (0, 3), (1, 6), (2, 8),
    (3, 4), (3, 5), (4, 5),
    (5, 6), (6, 7), (7, 8),
]

# ── Model ──────────────────────────────────────────────────────────────────────
# MODEL_PATH = Path(__file__).parent / "best_AGTFDIA.pt"
# model: Optional[AGTFDIA] = None
# USE_MOCK = False   # flipped to True when model file is absent

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "best_AGTFDIA.pt"

model: Optional[AGTFDIA] = None
USE_MOCK = False
def apply_mitigation(attacked_meas: np.ndarray, weights: list) -> np.ndarray:
    """
    Blend attacked measurements with the clean baseline
    using the model's adaptive per-node weights.
    """
    w = np.array(weights, dtype=np.float32).reshape(-1, 1)   # (N, 1)
    corrected = w * attacked_meas + (1 - w) * BASE_MEASUREMENTS
    return corrected
def load_model():
    global model, USE_MOCK
    m = AGTFDIA(in_dim=NUM_FEATURES, num_nodes=NUM_NODES)
    if MODEL_PATH.exists():
        try:
            state = torch.load(MODEL_PATH, map_location=DEVICE)
            # Accept both raw state_dict and {"model_state_dict": ...} wrappers
            if isinstance(state, dict) and "model_state_dict" in state:
                state = state["model_state_dict"]
            m.load_state_dict(state)
            log.info("✅  Loaded trained model from %s", MODEL_PATH)
        except Exception as e:
            log.warning("⚠️  Could not load model weights: %s — using random weights", e)
            USE_MOCK = True
    else:
        log.warning("⚠️  %s not found — using MOCK inference (random weights)", MODEL_PATH)
        USE_MOCK = True
    m.eval()
    return m.to(DEVICE)


# ── Grid State ─────────────────────────────────────────────────────────────────
# Base measurements for 9 buses [P, Q, L] — approximate IEEE 9-bus per-unit values
BASE_MEASUREMENTS = np.array([
    [1.00, 0.00, 0.00],   # bus 0 – slack
    [1.63, 0.00, 0.00],   # bus 1 – gen
    [0.85, 0.00, 0.00],   # bus 2 – gen
    [0.00, 0.00, 1.25],   # bus 3 – load
    [0.00, 0.00, 0.90],   # bus 4 – load
    [0.00, 0.00, 1.00],   # bus 5 – load
    [0.00, 0.00, 0.00],   # bus 6 – transit
    [0.00, 0.00, 0.00],   # bus 7 – transit
    [0.00, 0.00, 0.00],   # bus 8 – transit
], dtype=np.float32)

# Running state shared across requests
grid_state = {
    "current": BASE_MEASUREMENTS.copy(),
    "window": [],          # list of (NUM_NODES, NUM_FEATURES) arrays — last WINDOW_SIZE steps
    "attacks": {},         # bus_idx -> attack_magnitude
    "attack_type": "coordinated",
    "attack_magnitude": 1.20,
}


def random_walk_step(current: np.ndarray, sigma: float = 0.01) -> np.ndarray:
    noise = np.random.randn(*current.shape).astype(np.float32) * sigma
    new = current + noise
    # Clamp to reasonable per-unit range
    return np.clip(new, -3.0, 3.0)


def apply_attacks(meas: np.ndarray) -> np.ndarray:
    attacked = meas.copy()
    atk_type = grid_state["attack_type"]
    attacked_buses = list(grid_state["attacks"].keys())

    for bus in attacked_buses:
        mag = grid_state["attacks"][bus]
        if atk_type == "coordinated":
            factor = mag
        elif atk_type == "random":
            factor = 1.0 + np.random.uniform(0.0, mag - 1.0)
        elif atk_type == "stealth":
            factor = 1.0 + (mag - 1.0) * 0.3   # small perturbation
        else:
            factor = mag
        attacked[bus] = attacked[bus] * factor + np.random.randn(NUM_FEATURES).astype(np.float32) * 0.02

    return attacked


def build_window() -> np.ndarray:
    """Return (WINDOW_SIZE, NUM_NODES, NUM_FEATURES) tensor ready for model."""
    win = grid_state["window"]
    if len(win) < WINDOW_SIZE:
        pad = [win[0] if win else grid_state["current"]] * (WINDOW_SIZE - len(win))
        win = pad + list(win)
    return np.stack(win[-WINDOW_SIZE:], axis=0)  # (T, N, F)


def mock_inference(window: np.ndarray, attacked_buses: list) -> dict:
    """
    Deterministic mock used when the trained model is not available.
    Produces plausible outputs so the UI can be fully exercised.
    """
    N = NUM_NODES
    attack_probs = np.random.rand(N).astype(float) * 0.15  # low background
    for b in attacked_buses:
        attack_probs[b] = float(np.random.uniform(0.70, 0.98))

    vm_pred = (np.random.randn(N).astype(float) * 0.05 + 1.0).tolist()
    weights = (np.ones(N, dtype=float) * 0.9).tolist()
    for b in attacked_buses:
        weights[b] = float(np.random.uniform(0.2, 0.5))

    risk = np.random.dirichlet(np.ones(3), size=N).tolist()
    return {
        "attack_probs": attack_probs.tolist(),
        "vm_pred": vm_pred,
        "weights": weights,
        "risk": risk,
    }


def run_inference(window: np.ndarray) -> dict:
    # window: (T, N, F)
    x = torch.from_numpy(window).unsqueeze(0).to(DEVICE)   # (1, T, N, F)
    with torch.no_grad():
        out = model(x)

    attack_probs = F.softmax(out["attack_logits"], dim=-1)[0, :, 1].cpu().numpy()  # (N,) prob of attack
    vm_pred = out["vm"][0].cpu().numpy().tolist()
    weights = out["weights"][0].cpu().numpy().tolist()
    risk = out["risk_probs"][0].cpu().numpy().tolist()

    return {
        "attack_probs": attack_probs.tolist(),
        "vm_pred": vm_pred,
        "weights": weights,
        "risk": risk,
    }


# ── WebSocket Manager ──────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        log.info("WS client connected — total %d", len(self.active))

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)
        log.info("WS client disconnected — total %d", len(self.active))

    async def broadcast(self, data: dict):
        msg = json.dumps(data)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)


manager = ConnectionManager()


# ── Background simulation loop ─────────────────────────────────────────────────
async def simulation_loop():
    while True:
        try:
            # 1. Step the random walk
            grid_state["current"] = random_walk_step(grid_state["current"])

            # 2. Apply attacks
            attacked_meas = apply_attacks(grid_state["current"])
            attacked_buses = list(grid_state["attacks"].keys())

            # 3. Push to window
            grid_state["window"].append(attacked_meas)
            if len(grid_state["window"]) > WINDOW_SIZE:
                grid_state["window"].pop(0)

            # 4. Run inference
            window = build_window()
            if USE_MOCK:
                result = mock_inference(window, attacked_buses)
            else:
                result = run_inference(window)

            # 5. Build payload
            payload = {
                "timestamp": time.time(),
                "attacked_nodes": attacked_buses,
                "attack_type": grid_state["attack_type"],
                "attack_magnitude": grid_state["attack_magnitude"],
                "measurements": attacked_meas.tolist(),
                "use_mock": USE_MOCK,
                **result,
            }

            await manager.broadcast(payload)
        except Exception as e:
            log.error("Simulation loop error: %s", e)

        await asyncio.sleep(0.5)


@app.on_event("startup")
async def startup():
    global model
    model = load_model()
    # Pre-fill window with base measurements
    for _ in range(WINDOW_SIZE):
        grid_state["window"].append(BASE_MEASUREMENTS.copy())
    asyncio.create_task(simulation_loop())


# ── WebSocket endpoint ─────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive; data is pushed by simulation loop
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ── REST endpoints ─────────────────────────────────────────────────────────────
class AttackConfig(BaseModel):
    nodes: List[int]
    magnitude: float = 1.20
    attack_type: str = "coordinated"


@app.post("/attack/configure")
async def configure_attack(cfg: AttackConfig):
    grid_state["attack_type"] = cfg.attack_type
    grid_state["attack_magnitude"] = cfg.magnitude
    grid_state["attacks"] = {n: cfg.magnitude for n in cfg.nodes if 0 <= n < NUM_NODES}
    log.info("Attack configured: nodes=%s type=%s mag=%.2f", cfg.nodes, cfg.attack_type, cfg.magnitude)
    return {"status": "ok", "attacked_nodes": list(grid_state["attacks"].keys())}


@app.post("/attack/clear")
async def clear_attacks():
    grid_state["attacks"].clear()
    log.info("All attacks cleared")
    return {"status": "ok"}


SCENARIOS: Dict[str, dict] = {
    "normal": {"nodes": [], "magnitude": 1.0, "attack_type": "coordinated"},
    "single": {"nodes": [3], "magnitude": 1.25, "attack_type": "coordinated"},
    "multi":  {"nodes": [1, 4, 7], "magnitude": 1.35, "attack_type": "coordinated"},
    "stealth": {"nodes": [2, 5, 8], "magnitude": 1.10, "attack_type": "stealth"},
    "random": {"nodes": [0, 3, 6], "magnitude": 1.40, "attack_type": "random"},
    "high_risk": {"nodes": [0, 1, 2, 3, 4], "magnitude": 1.50, "attack_type": "coordinated"},
}


@app.get("/scenarios/{name}")
async def load_scenario(name: str):
    if name not in SCENARIOS:
        return {"status": "error", "message": f"Unknown scenario '{name}'"}
    s = SCENARIOS[name]
    grid_state["attack_type"] = s["attack_type"]
    grid_state["attack_magnitude"] = s["magnitude"]
    grid_state["attacks"] = {n: s["magnitude"] for n in s["nodes"]}
    log.info("Scenario '%s' loaded", name)
    return {"status": "ok", "scenario": name, **s}


@app.get("/status")
async def status():
    return {
        "use_mock": USE_MOCK,
        "attacked_nodes": list(grid_state["attacks"].keys()),
        "attack_type": grid_state["attack_type"],
        "ws_clients": len(manager.active),
    }


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
