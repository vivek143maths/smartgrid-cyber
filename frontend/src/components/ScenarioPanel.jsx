import React, { useState } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

const SCENARIOS = [
  {
    key: 'normal',
    icon: '🟢',
    label: 'Normal Operation',
    desc: 'No attacks — baseline monitoring',
    color: 'var(--safe)',
  },
  {
    key: 'single',
    icon: '🎯',
    label: 'Single-Node Attack',
    desc: 'Bus 4 targeted (coordinated, ×1.25)',
    color: 'var(--warn)',
  },
  {
    key: 'multi',
    icon: '⚡',
    label: 'Multi-Node Coordinated',
    desc: 'Buses 2, 5, 8 — coordinated ×1.35',
    color: 'var(--accent-2)',
  },
  {
    key: 'stealth',
    icon: '👻',
    label: 'Stealth Attack',
    desc: 'Buses 3, 6, 9 — low-amplitude evasion',
    color: '#a78bfa',
  },
  {
    key: 'random',
    icon: '🎲',
    label: 'Random Injection',
    desc: 'Buses 1, 4, 7 — random magnitudes',
    color: 'var(--accent-1)',
  },
  {
    key: 'high_risk',
    icon: '☠️',
    label: 'High-Risk Instability',
    desc: '5 buses compromised — grid destabilized',
    color: 'var(--danger)',
  },
];

export default function ScenarioPanel() {
  const [active, setActive] = useState(null);
  const [log, setLog] = useState([]);

  const loadScenario = async (key) => {
    try {
      const res = await axios.get(`${API}/scenarios/${key}`);
      setActive(key);
      const s = SCENARIOS.find((x) => x.key === key);
      const ts = new Date().toLocaleTimeString();
      setLog((prev) => [
        { ts, msg: `[${ts}] SCENARIO: ${s?.label} loaded`, type: key === 'normal' ? 'ok' : 'danger' },
        ...prev.slice(0, 7),
      ]);
    } catch {
      setLog((prev) => [{ ts: '', msg: 'Connection error', type: 'warn' }, ...prev.slice(0, 7)]);
    }
  };

  return (
    <div className="card">
      <div className="card-title"><span className="icon">🎮</span>SCENARIO PRESETS</div>

      {SCENARIOS.map((s) => (
        <button
          key={s.key}
          className={`btn-scenario${active === s.key ? ' active' : ''}`}
          onClick={() => loadScenario(s.key)}
          style={active === s.key ? { borderColor: s.color, color: s.color } : {}}
        >
          <span style={{ fontSize: 16 }}>{s.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>{s.desc}</div>
          </div>
        </button>
      ))}

      {log.length > 0 && (
        <div className="log-area" style={{ marginTop: 8 }}>
          {log.map((l, i) => (
            <div key={i} className={`log-line ${l.type}`}>{l.msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
