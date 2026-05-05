import React, { useState } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

export default function AttackerPanel({ onAttackChange }) {
  const [selectedBuses, setSelectedBuses] = useState([]);
  const [magnitude, setMagnitude] = useState(1.20);
  const [attackType, setAttackType] = useState('coordinated');
  const [status, setStatus] = useState(null);

  const toggleBus = (idx) => {
    setSelectedBuses((prev) =>
      prev.includes(idx) ? prev.filter((b) => b !== idx) : [...prev, idx]
    );
  };

  const applyAttack = async () => {
    try {
      await axios.post(`${API}/attack/configure`, {
        nodes: selectedBuses,
        magnitude,
        attack_type: attackType,
      });
      setStatus({ type: 'danger', msg: `⚠ ATTACK INJECTED — ${selectedBuses.length} node(s)` });
      onAttackChange?.();
    } catch {
      setStatus({ type: 'warn', msg: 'Connection error' });
    }
    setTimeout(() => setStatus(null), 3000);
  };

  const clearAttacks = async () => {
    try {
      await axios.post(`${API}/attack/clear`);
      setSelectedBuses([]);
      setStatus({ type: 'ok', msg: '✓ All attacks cleared' });
      onAttackChange?.();
    } catch {
      setStatus({ type: 'warn', msg: 'Connection error' });
    }
    setTimeout(() => setStatus(null), 3000);
  };

  const busLabels = [
    'B1 (Slack)', 'B2 (Gen)', 'B3 (Gen)',
    'B4 (Load)', 'B5 (Load)', 'B6 (Load)',
    'B7 (Trans)', 'B8 (Trans)', 'B9 (Trans)',
  ];

  return (
    <div className="card">
      <div className="card-title"><span className="icon">💀</span>ATTACKER PANEL</div>

      {/* Bus selection */}
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
        SELECT TARGET BUSES
      </div>
      <div className="bus-grid">
        {busLabels.map((label, idx) => (
          <button
            key={idx}
            className={`bus-btn${selectedBuses.includes(idx) ? ' sel' : ''}`}
            onClick={() => toggleBus(idx)}
            title={label}
          >
            {label.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Magnitude slider */}
      <div className="control-row">
        <span className="control-label">Magnitude</span>
        <input
          type="range"
          min={1.05} max={1.50} step={0.01}
          value={magnitude}
          onChange={(e) => setMagnitude(parseFloat(e.target.value))}
        />
        <span className="val-badge">{magnitude.toFixed(2)}×</span>
      </div>

      {/* Attack type */}
      <div className="control-row">
        <span className="control-label">Attack Type</span>
        <select value={attackType} onChange={(e) => setAttackType(e.target.value)}>
          <option value="coordinated">Coordinated</option>
          <option value="random">Random</option>
          <option value="stealth">Stealth</option>
        </select>
      </div>

      {/* Attack type description */}
      <div style={{
        fontSize: 10, fontFamily: 'var(--font-mono)',
        color: 'var(--text-dim)', marginBottom: 12,
        padding: '6px 8px',
        background: 'var(--bg-void)',
        border: '1px solid var(--border)',
        borderRadius: 4,
      }}>
        {attackType === 'coordinated' && '→ All target nodes scaled by same factor'}
        {attackType === 'random' && '→ Each node scaled by random sub-factor'}
        {attackType === 'stealth' && '→ Small perturbation (30% of magnitude) — harder to detect'}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn-primary"
          onClick={applyAttack}
          disabled={selectedBuses.length === 0}
          style={{ flex: 1, opacity: selectedBuses.length === 0 ? 0.5 : 1 }}
        >
          ⚡ Apply Attack
        </button>
        <button className="btn-danger" onClick={clearAttacks} style={{ flex: 1 }}>
          ✕ Clear All
        </button>
      </div>

      {/* Status */}
      {status && (
        <div className={`log-line ${status.type}`} style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {status.msg}
        </div>
      )}
    </div>
  );
}
