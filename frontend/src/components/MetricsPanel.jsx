import React, { useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

const BUS_LABELS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'];

function buildBarColor(probs, attacked) {
  return probs.map((p, i) => {
    if (attacked.includes(i)) return 'rgba(255,45,85,0.85)';
    if (p > 0.5) return 'rgba(255,184,48,0.85)';
    return 'rgba(57,255,20,0.75)';
  });
}

export default function MetricsPanel({ data }) {
  const attackProbs = data?.attack_probs ?? Array(9).fill(0);
  const vmPred = data?.vm_pred ?? Array(9).fill(1.0);
  const weights = data?.weights ?? Array(9).fill(1.0);
  const risk = data?.risk ?? Array(9).fill([0.33, 0.33, 0.34]);
  const attackedNodes = data?.attacked_nodes ?? [];

  const avgWeight = weights.length ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(3) : '—';
  const maxProb = (Math.max(...attackProbs) * 100).toFixed(1);
  const highRiskCount = risk.filter((r) => {
    const idx = r.indexOf(Math.max(...r));
    return idx === 2;
  }).length;

  const attackChartData = {
    labels: BUS_LABELS,
    datasets: [
      {
        label: 'Attack Probability',
        data: attackProbs.map((p) => (p * 100).toFixed(1)),
        backgroundColor: buildBarColor(attackProbs, attackedNodes),
        borderColor: attackedNodes.map((_, i) => 'rgba(255,45,85,1)'),
        borderWidth: 1,
        borderRadius: 3,
      },
    ],
  };

  const vmChartData = {
    labels: BUS_LABELS,
    datasets: [
      {
        label: 'Voltage Magnitude (pu)',
        data: vmPred.map((v) => v.toFixed(4)),
        backgroundColor: 'rgba(0,212,255,0.15)',
        borderColor: 'rgba(0,212,255,0.8)',
        borderWidth: 1.5,
        borderRadius: 3,
      },
    ],
  };

  const chartOptions = (title, yLabel, yMin, yMax) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(6,11,20,0.95)',
        titleColor: '#00d4ff',
        bodyColor: '#e8f4ff',
        borderColor: '#1a4080',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: { color: '#6a8ab0', font: { family: 'Share Tech Mono', size: 10 } },
        grid: { color: 'rgba(26,45,74,0.5)' },
      },
      y: {
        min: yMin, max: yMax,
        title: { display: true, text: yLabel, color: '#3a5070', font: { size: 9 } },
        ticks: { color: '#6a8ab0', font: { family: 'Share Tech Mono', size: 9 } },
        grid: { color: 'rgba(26,45,74,0.5)' },
      },
    },
  });

  return (
    <div className="card">
      <div className="card-title"><span className="icon">📊</span>DETECTION METRICS</div>

      {/* Summary row */}
      <div className="metrics-row">
        <div className="metric-box">
          <div className="metric-val" style={{ color: parseFloat(maxProb) > 50 ? 'var(--danger)' : 'var(--safe)' }}>
            {maxProb}%
          </div>
          <div className="metric-lbl">MAX ATK PROB</div>
        </div>
        <div className="metric-box">
          <div className="metric-val" style={{ color: 'var(--accent-1)' }}>{avgWeight}</div>
          <div className="metric-lbl">AVG MIT WGHT</div>
        </div>
        <div className="metric-box">
          <div className="metric-val" style={{ color: highRiskCount > 0 ? 'var(--danger)' : 'var(--safe)' }}>
            {highRiskCount}
          </div>
          <div className="metric-lbl">HIGH-RISK BUSES</div>
        </div>
      </div>

      {/* Attack probability chart */}
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: 4 }}>
        ATTACK PROBABILITY PER BUS (%)
      </div>
      <div className="chart-wrap">
        <Bar data={attackChartData} options={chartOptions('Attack Prob', '%', 0, 100)} />
      </div>

      {/* Voltage chart */}
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: 4 }}>
        ESTIMATED VOLTAGE MAGNITUDE (pu)
      </div>
      <div className="chart-wrap">
        <Bar data={vmChartData} options={chartOptions('Voltage (pu)', 'pu', -0.5, 3)} />
      </div>

      {/* Mitigation weights row */}
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginBottom: 6 }}>
        ADAPTIVE MITIGATION WEIGHTS
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {weights.map((w, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              height: `${Math.max(4, w * 40)}px`,
              background: `rgba(0,212,255,${0.3 + w * 0.5})`,
              border: '1px solid rgba(0,212,255,0.4)',
              borderRadius: '2px 2px 0 0',
              marginBottom: 2,
              transition: 'height 0.3s',
            }} />
            <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
              B{i + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
