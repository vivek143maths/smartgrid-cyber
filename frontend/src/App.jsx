import React, { useState, useEffect, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import GridVisualization from './components/GridVisualization';
import AttackerPanel from './components/AttackerPanel';
import MetricsPanel from './components/MetricsPanel';
import ScenarioPanel from './components/ScenarioPanel';
import DataFlowView from './components/DataFlowView';
import './styles.css';

const WS_URL = 'ws://localhost:8000/ws';

export default function App() {
  const [gridData, setGridData] = useState(null);
  const [logs, setLogs] = useState([]);
  const prevAttackedRef = useRef([]);

  const { readyState, lastMessage } = useWebSocket(WS_URL, {
    reconnectAttempts: 20,
    reconnectInterval: 1500,
    shouldReconnect: () => true,
  });

  // Parse incoming WebSocket message
  useEffect(() => {
    if (!lastMessage?.data) return;
    try {
      const parsed = JSON.parse(lastMessage.data);
      setGridData(parsed);

      // Generate log entry if attack status changed
      const attacked = parsed.attacked_nodes ?? [];
      const prev = prevAttackedRef.current;
      const newAttacks = attacked.filter((n) => !prev.includes(n));
      const cleared = prev.filter((n) => !attacked.includes(n));
      const ts = new Date().toLocaleTimeString();
      const maxProb = Math.max(...(parsed.attack_probs ?? [0]));

      const newLogs = [];
      if (newAttacks.length > 0) {
        newLogs.push({ type: 'danger', msg: `[${ts}] ATTACK on bus(es) ${newAttacks.map((n) => n + 1).join(', ')} — type: ${parsed.attack_type}` });
      }
      if (cleared.length > 0) {
        newLogs.push({ type: 'ok', msg: `[${ts}] Attack cleared on bus(es) ${cleared.map((n) => n + 1).join(', ')}` });
      }
      if (maxProb > 0.7 && attacked.length === 0) {
        newLogs.push({ type: 'warn', msg: `[${ts}] Anomaly detected — prob ${(maxProb * 100).toFixed(1)}%` });
      }

      if (newLogs.length > 0) {
        setLogs((prev) => [...newLogs, ...prev].slice(0, 20));
      }
      prevAttackedRef.current = attacked;
    } catch (e) {
      console.error('WS parse error', e);
    }
  }, [lastMessage]);

  const connStatus = {
    [ReadyState.CONNECTING]: { label: 'CONNECTING', cls: 'warn' },
    [ReadyState.OPEN]:       { label: 'LIVE',       cls: '' },
    [ReadyState.CLOSING]:    { label: 'CLOSING',    cls: 'warn' },
    [ReadyState.CLOSED]:     { label: 'OFFLINE',    cls: 'danger' },
  }[readyState] ?? { label: 'UNKNOWN', cls: 'warn' };

  const isUnderAttack = (gridData?.attacked_nodes?.length ?? 0) > 0;

  return (
    <div className="app-shell">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div>
          <h1>AGT-FDIA</h1>
          <div className="header-sub">SMART GRID CYBERSECURITY SYSTEM — IEEE 9-BUS</div>
        </div>
        <div className="status-pill">
          <div className={`status-dot ${connStatus.cls}`} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
            WS: {connStatus.label}
          </span>
          {isUnderAttack && (
            <span style={{
              padding: '2px 10px',
              background: 'rgba(255,45,85,0.15)',
              border: '1px solid var(--danger)',
              borderRadius: 3,
              color: 'var(--danger)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 2,
              animation: 'pulse 1s ease-in-out infinite',
            }}>
              ⚠ UNDER ATTACK
            </span>
          )}
          {gridData?.use_mock && <span className="mock-badge">MOCK INFERENCE</span>}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="app-body">

        {/* Left column: graph + dataflow */}
        <div className="col-left">
          <GridVisualization data={gridData} />
          <DataFlowView data={gridData} />
        </div>

        {/* Right column: controls + metrics */}
        <div className="col-right">
          <AttackerPanel />
          <ScenarioPanel />
          <MetricsPanel data={gridData} />

          {/* System log */}
          <div className="card">
            <div className="card-title"><span className="icon">🖥</span>SYSTEM LOG</div>
            <div className="log-area" style={{ maxHeight: 130 }}>
              {logs.length === 0 && (
                <div className="log-line">Awaiting events…</div>
              )}
              {logs.map((l, i) => (
                <div key={i} className={`log-line ${l.type}`}>{l.msg}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
