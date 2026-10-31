// src/components/BarChart.jsx
// Lightweight pure-CSS bar chart — no external charting library needed.
import './BarChart.css';

export default function BarChart({ data, valueKey = 'value', labelKey = 'label' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="bar-chart">
      <div className="bar-chart__bars">
        {data.map((d, i) => (
          <div key={i} className="bar-chart__col">
            <div
              className="bar-chart__bar"
              style={{ height: `${(d[valueKey] / max) * 100}%` }}
              data-value={d[valueKey]}
            />
            <span className="bar-chart__label">{d[labelKey]}</span>
          </div>
        ))}
      </div>
      <div className="bar-chart__axis" />
    </div>
  );
}
