import React from 'react';

const FLOW_STEPS = [
  { icon: '📡', label: 'Sensor\nData', key: 'sensor' },
  { icon: '💉', label: 'Attack\nInjection', key: 'attack' },
  { icon: '🧠', label: 'AI\nDetection', key: 'ai' },
  { icon: '🛡️', label: 'Mitigation\nWeights', key: 'mitigation' },
  { icon: '✅', label: 'Protected\nOutput', key: 'output' },
];

export default function DataFlowView({ data }) {
  const hasAttack = data?.attacked_nodes?.length > 0;
  const maxProb = Math.max(...(data?.attack_probs ?? [0]));
  const detected = maxProb > 0.5;

  const getClass = (key) => {
    if (key === 'sensor') return 'active';
    if (key === 'attack') return hasAttack ? 'attack' : '';
    if (key === 'ai') return 'active';
    if (key === 'mitigation') return detected ? 'attack' : 'active';
    if (key === 'output') return 'active';
    return '';
  };

  return (
    <div className="flow-strip">
      {FLOW_STEPS.map((step, i) => (
        <React.Fragment key={step.key}>
          <div className={`flow-node ${getClass(step.key)}`}>
            <span className="flow-icon">{step.icon}</span>
            <span className="flow-label">{step.label}</span>
          </div>
          {i < FLOW_STEPS.length - 1 && (
            <span className="flow-arrow">
              {i === 1 && hasAttack ? '⚠' : '›'}
            </span>
          )}
        </React.Fragment>
      ))}
      <div style={{
        marginLeft: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: detected ? 'var(--danger)' : 'var(--safe)',
        textAlign: 'right',
        minWidth: 80,
      }}>
        {detected ? '⚠ ATTACK\nDETECTED' : '✓ NORMAL\nOPERATION'}
      </div>
    </div>
  );
}
