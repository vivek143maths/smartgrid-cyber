import React, { useRef, useEffect, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';

cytoscape.use(coseBilkent);

// IEEE 9-bus topology (0-indexed)
const NODES = Array.from({ length: 9 }, (_, i) => ({
  data: { id: `bus${i}`, label: `B${i + 1}` },
}));

const EDGES = [
  [0, 3], [1, 6], [2, 8],
  [3, 4], [3, 5], [4, 5],
  [5, 6], [6, 7], [7, 8],
].map(([s, t], i) => ({
  data: { id: `e${i}`, source: `bus${s}`, target: `bus${t}` },
}));

const elements = [...NODES, ...EDGES];

const BASE_STYLE = [
  {
    selector: 'node',
    style: {
      'background-color': '#0d2640',
      'border-color': '#1a4080',
      'border-width': 2,
      'label': 'data(label)',
      'color': '#6a8ab0',
      'font-size': 11,
      'font-family': 'Share Tech Mono, monospace',
      'text-valign': 'center',
      'text-halign': 'center',
      'width': 42,
      'height': 42,
    },
  },
  {
    selector: 'edge',
    style: {
      'line-color': '#1a3050',
      'width': 2,
      'curve-style': 'bezier',
      'opacity': 0.8,
    },
  },
  {
    selector: '.normal',
    style: {
      'background-color': '#0d3020',
      'border-color': '#39ff14',
      'border-width': 2.5,
      'color': '#39ff14',
    },
  },
  {
    selector: '.suspicious',
    style: {
      'background-color': '#302010',
      'border-color': '#ffb830',
      'border-width': 3,
      'color': '#ffb830',
    },
  },
  {
    selector: '.attacked',
    style: {
      'background-color': '#3a0010',
      'border-color': '#ff2d55',
      'border-width': 4,
      'color': '#ff2d55',
      'border-style': 'solid',
    },
  },
  {
    selector: 'edge.hot',
    style: { 'line-color': '#ff6b35', 'width': 3 },
  },
];

const LAYOUT = {
  name: 'preset',
  positions: {
    bus0: { x: 200, y: 60  },
    bus1: { x: 420, y: 60  },
    bus2: { x: 320, y: 240 },
    bus3: { x: 120, y: 180 },
    bus4: { x: 200, y: 290 },
    bus5: { x: 310, y: 340 },
    bus6: { x: 430, y: 200 },
    bus7: { x: 500, y: 310 },
    bus8: { x: 400, y: 390 },
  },
};

export default function GridVisualization({ data }) {
  const cyRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  // Update node classes based on incoming WebSocket data
  useEffect(() => {
    if (!cyRef.current || !data) return;
    const cy = cyRef.current;
    const { attack_probs = [], attacked_nodes = [], vm_pred = [], risk = [] } = data;

    cy.nodes().forEach((node) => {
      const idx = parseInt(node.id().replace('bus', ''), 10);
      const prob = attack_probs[idx] ?? 0;
      const isAttacked = attacked_nodes.includes(idx);

      node.removeClass('normal suspicious attacked');
      if (isAttacked) {
        node.addClass('attacked');
      } else if (prob > 0.5) {
        node.addClass('suspicious');
      } else {
        node.addClass('normal');
      }

      const vm = vm_pred[idx] !== undefined ? vm_pred[idx].toFixed(3) : '—';
      const riskArr = risk[idx] ?? [0.33, 0.33, 0.34];
      const riskLevel = riskArr.indexOf(Math.max(...riskArr));
      const riskLabel = ['LOW', 'MED', 'HIGH'][riskLevel];
      node.data('label', `B${idx + 1}\n${vm}`);
    });

    // Highlight edges connected to attacked nodes
    cy.edges().forEach((edge) => {
      const srcIdx = parseInt(edge.source().id().replace('bus', ''), 10);
      const tgtIdx = parseInt(edge.target().id().replace('bus', ''), 10);
      if (attacked_nodes.includes(srcIdx) || attacked_nodes.includes(tgtIdx)) {
        edge.addClass('hot');
      } else {
        edge.removeClass('hot');
      }
    });
  }, [data]);

  const handleMouseOver = (evt) => {
    if (!data) return;
    const node = evt.target;
    if (node.isNode && node.isNode()) {
      const idx = parseInt(node.id().replace('bus', ''), 10);
      const prob = data.attack_probs?.[idx] ?? 0;
      const vm = data.vm_pred?.[idx]?.toFixed(4) ?? '—';
      const w = data.weights?.[idx]?.toFixed(3) ?? '—';
      const riskArr = data.risk?.[idx] ?? [0.33, 0.33, 0.34];
      const riskLevel = ['LOW', 'MED', 'HIGH'][riskArr.indexOf(Math.max(...riskArr))];
      const pos = node.renderedPosition();
      setTooltip({ idx, prob: (prob * 100).toFixed(1), vm, w, riskLevel, x: pos.x, y: pos.y });
    }
  };

  const handleMouseOut = () => setTooltip(null);

  return (
    <div className="grid-vis-wrap">
      <div className="card-title" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-deep)' }}>
        <span className="icon">⚡</span>
        IEEE 9-BUS SMART GRID — LIVE TOPOLOGY
        {data?.use_mock && <span className="mock-badge" style={{ marginLeft: 'auto' }}>MOCK MODE</span>}
      </div>
      <div className="cyto-container" style={{ position: 'relative' }}>
        <CytoscapeComponent
          elements={elements}
          style={{ width: '100%', height: '100%' }}
          stylesheet={BASE_STYLE}
          layout={LAYOUT}
          cy={(cy) => {
            cyRef.current = cy;
            cy.on('mouseover', 'node', handleMouseOver);
            cy.on('mouseout', 'node', handleMouseOut);
          }}
          userZoomingEnabled={true}
          userPanningEnabled={true}
          minZoom={0.5}
          maxZoom={2.5}
        />

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: tooltip.x + 20,
            top: tooltip.y - 20,
            background: 'rgba(6,11,20,0.95)',
            border: '1px solid var(--accent-1)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontFamily: 'Share Tech Mono, monospace',
            fontSize: '11px',
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            zIndex: 100,
            minWidth: '140px',
            boxShadow: '0 0 16px rgba(0,212,255,0.3)',
          }}>
            <div style={{ color: 'var(--accent-1)', fontWeight: 'bold', marginBottom: 4 }}>BUS {tooltip.idx + 1}</div>
            <div>Attack Prob: <span style={{ color: tooltip.prob > 50 ? 'var(--danger)' : 'var(--safe)' }}>{tooltip.prob}%</span></div>
            <div>V-Magnitude: <span style={{ color: 'var(--accent-1)' }}>{tooltip.vm} pu</span></div>
            <div>Mit. Weight: <span style={{ color: 'var(--warn)' }}>{tooltip.w}</span></div>
            <div>Risk: <span style={{ color: tooltip.riskLevel === 'HIGH' ? 'var(--danger)' : tooltip.riskLevel === 'MED' ? 'var(--warn)' : 'var(--safe)' }}>{tooltip.riskLevel}</span></div>
          </div>
        )}

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          display: 'flex', gap: 12,
          fontFamily: 'Share Tech Mono, monospace', fontSize: 10,
        }}>
          {[['var(--safe)', 'NORMAL'], ['var(--warn)', 'SUSPICIOUS'], ['var(--danger)', 'ATTACKED']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}` }} />
              <span style={{ color: c }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
