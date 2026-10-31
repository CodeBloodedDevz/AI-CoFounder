import './Badge.css';

// `status` picks the colour; `label` (optional) is the text shown, e.g. status="success" label="Paid".
export default function Badge({ status, label }) {
  const key = String(status || 'unknown').toLowerCase().replace(/\s+/g, '-');
  return <span className={`badge badge--${key}`}>{label ?? status ?? '—'}</span>;
}
