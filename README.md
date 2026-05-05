# AGT-FDIA Smart Grid Cybersecurity System

**Detection and Mitigation of False Data Injection Attacks (FDIA) in Smart Grids using Deep Learning**

A full-stack, real-time web application demonstrating:
- Simulated IEEE 9-bus smart grid with live SCADA telemetry
- Interactive attacker dashboard for injecting FDI attacks
- AGT-FDIA deep learning model (Graph Transformer) for detection
- Adaptive mitigation via node weighting
- Real-time WebSocket streaming with live visualizations

---

## Project Structure

```
smartgrid-cyber/
├── backend/
│   ├── app.py                # FastAPI + WebSocket server
│   ├── model.py              # AGT-FDIA model definition (exact architecture)
│   ├── best_AGTFDIA.pt       # ← PLACE YOUR TRAINED MODEL HERE
│   └── requirements.txt
├── frontend/
│   ├── public/index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── GridVisualization.jsx   # Cytoscape IEEE 9-bus graph
│   │   │   ├── AttackerPanel.jsx       # Attack injection controls
│   │   │   ├── MetricsPanel.jsx        # Charts & metrics
│   │   │   ├── ScenarioPanel.jsx       # Preset attack scenarios
│   │   │   └── DataFlowView.jsx        # Pipeline flowchart
│   │   ├── App.jsx
│   │   ├── index.js
│   │   └── styles.css
│   └── package.json
└── README.md
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | ≥ 3.10 |
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| PyTorch | ≥ 2.0 |

---

## Setup & Running

### 1. Supply your trained model

Copy your trained model file to:
```
backend/best_AGTFDIA.pt
```

> **Note:** If the file is missing, the system runs in **MOCK mode** — all detection outputs are plausibly randomised so the full UI can still be exercised. A `MOCK INFERENCE` badge will appear in the header.

The model must be compatible with the `AGTFDIA` class in `backend/model.py`.  
Expected input: `(B, T, N, in_dim)` = `(batch, 5, 9, 3)`.  
Expected keys in `state_dict` OR wrapped as `{"model_state_dict": ...}`.

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The API runs on **http://localhost:8000**.  
Interactive docs available at: **http://localhost:8000/docs**

### 3. Start the frontend

```bash
cd frontend
npm install
npm start
```

The UI opens on **http://localhost:3000**.

---

## API Reference

### WebSocket — `/ws`
Streams a JSON payload every **0.5 s**:

```json
{
  "timestamp": 1718000000.0,
  "attacked_nodes": [3, 7],
  "attack_type": "coordinated",
  "attack_magnitude": 1.25,
  "measurements": [[...]],     // (9, 3) current sensor readings
  "attack_probs": [...],       // (9,) probability of attack per bus
  "vm_pred": [...],            // (9,) estimated voltage magnitude
  "weights": [...],            // (9,) adaptive mitigation weights
  "risk": [[...]],             // (9, 3) risk class probabilities
  "use_mock": false
}
```

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/attack/configure` | Set attacked buses, magnitude, type |
| `POST` | `/attack/clear` | Clear all active attacks |
| `GET`  | `/scenarios/{name}` | Load a preset scenario |
| `GET`  | `/status` | System status |

**`/attack/configure` body:**
```json
{
  "nodes": [2, 5],
  "magnitude": 1.30,
  "attack_type": "coordinated"
}
```

**Available attack types:** `coordinated`, `random`, `stealth`

**Available scenarios:** `normal`, `single`, `multi`, `stealth`, `random`, `high_risk`

---

## AGT-FDIA Model Architecture

```
Input (B, T=5, N=9, F=3)
   │
   ├─ Linear projection → (B, T, N, d_model=64)
   │
   ├─ Temporal Encoder (per node)
   │    TransformerEncoder × 2 layers
   │    + PositionalEncoding
   │    → mean-pool over time → (B, N, 64)
   │
   ├─ Spatial Encoder (graph attention)
   │    GraphTransformerLayer × 2
   │    MultiheadAttention (N nodes)
   │    → (B, N, 64)
   │
   └─ Multi-Task Heads
        ├─ attack_logits  → (B, N, 2)   binary classification
        ├─ vm             → (B, N)       voltage magnitude regression
        ├─ angle          → (B, N)       voltage angle regression
        ├─ risk_logits    → (B, N, 3)   risk level classification
        └─ weights        → (B, N)       adaptive mitigation scalar
```

---

## Simulation Details

- **Base measurements:** IEEE 9-bus per-unit approximations (P, Q, L per bus)
- **Random walk:** Gaussian noise (σ=0.01) applied each tick to simulate normal variation
- **Attack types:**
  - `coordinated` — all targeted buses scaled by `magnitude`
  - `random` — each targeted bus gets a random sub-factor in `[1.0, magnitude]`
  - `stealth` — scaling reduced to 30% of magnitude to evade detection
- **Window:** 5 time-steps fed to the model at each inference call

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Connection refused` on WebSocket | Ensure backend is running on port 8000 |
| Graph not rendering | Install `cytoscape-cose-bilkent` and check browser console |
| `RuntimeError` loading model | Ensure model weights match `model.py` architecture |
| CORS errors | Backend already allows all origins; check browser extensions |

---

## Citation

If you use this system in research, please cite your original AGT-FDIA paper and this codebase.

---

## License

MIT — research and educational use.
