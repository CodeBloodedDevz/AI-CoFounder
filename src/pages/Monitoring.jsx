// src/pages/Monitoring.jsx
import { useCallback, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadialBarChart, RadialBar, Legend,
} from 'recharts';
import AdminLayout from '../layouts/AdminLayout.jsx';
import Card from '../components/Card.jsx';
import Table from '../components/Table.jsx';
import Badge from '../components/Badge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { monitoringService } from '../services/monitoringService.js';
import { fmt, dateTime } from '../utils/format.js';
import './Dashboard.css';
import './Monitoring.css';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
};

export default function Monitoring() {
  const { data, loading, error, refetch } = useAsync(useCallback(() => monitoringService.getStatus(), []));
  // Live page: refresh quietly every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => refetch({ silent: true }), 30_000);
    return () => clearInterval(t);
  }, [refetch]);

  const services = data?.services || [];
  const events   = data?.recentEvents || [];
  const ai       = data?.aiUsage || {};

  const radialData = services.map((s) => ({
    name: s.name,
    value: s.status === 'healthy' ? 100 : s.status === 'warning' ? 60 : 5,
    fill: s.status === 'healthy' ? '#22c55e' : s.status === 'warning' ? '#eab308' : '#ef4444',
  }));

  const eventCols = [
    { key: 'level',     label: 'Level',   render: r => <span className={`event-level--${r.level}`}>{r.level.toUpperCase()}</span> },
    { key: 'message',   label: 'Message' },
    { key: 'timestamp', label: 'Time',    render: r => dateTime(r.timestamp) },
  ];

  return (
    <AdminLayout pageTitle="AI & System Monitoring">
      {loading ? <LoadingSpinner /> : error ? <ErrorMessage message={error} /> : (
        <>
          {/* Service status cards */}
          <div className="monitoring__services">
            {services.map(s => (
              <div key={s.name} className="service-card">
                <div className={`service-card__dot service-card__dot--${s.status}`} />
                <div className="service-card__body">
                  <div className="service-card__name">{s.name}</div>
                  <div className="service-card__status">
                    {s.detail || s.status}
                    {s.latency != null ? ` · ${s.latency}ms` : ''}
                  </div>
                </div>
                <Badge status={s.status} />
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="monitoring__charts">
            {/* AI usage trend */}
            <Card title="AI Usage — Last 7 Days">
              {!ai.available ? (
                <p className="dashboard__empty">AI usage tracking isn't set up yet. Run backend/supabase/admin.sql in Supabase to start recording it.</p>
              ) : !(ai.trend || []).some(d => d.requests > 0) ? (
                <p className="dashboard__empty">No AI requests in the last 7 days.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={ai.trend} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={10} />
                    <Line yAxisId="left"  type="monotone" dataKey="requests" name="Requests" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="tokens"   name="Tokens"   stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Service health radial */}
            <Card title="Service Health">
              <ResponsiveContainer width="100%" height={220}>
                <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={radialData} startAngle={180} endAngle={0}>
                  <RadialBar minAngle={15} label={{ position: 'insideStart', fill: '#fff', fontSize: 10 }} background dataKey="value" />
                  <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" />
                  <Tooltip formatter={v => [`${v}%`, 'Health']} />
                </RadialBarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* AI usage metrics */}
          <div className="monitoring__ai">
            {[
              ['AI Requests (today)', fmt(ai.totalRequests), ai.available ? `${fmt(ai.weekRequests)} in the last 7 days` : null],
              ['Tokens Used (today)', fmt(ai.tokensUsed), ai.available ? 'Chat and voice, from Groq' : null],
              ['Avg Response Time', ai.avgResponseMs != null ? `${fmt(ai.avgResponseMs)} ms` : '—', ai.available ? 'Today' : null],
              ['Error Rate', ai.errorRate != null ? `${ai.errorRate}%` : '—', ai.available ? (ai.weekErrorRate != null ? `${ai.weekErrorRate}% over 7 days` : 'No requests yet') : null],
            ].map(([label, value, note]) => (
              <div key={label} className="ai-metric">
                <div className="ai-metric__label">{label}</div>
                <div className="ai-metric__value">{ai.available ? value : '—'}</div>
                <div className="ai-metric__note">{note || 'Not recorded yet (run admin.sql)'}</div>
              </div>
            ))}
          </div>

          {/* Events */}
          <Card title="Recent System Events">
            <Table columns={eventCols} rows={events} emptyMessage="No events yet. Admin actions and Paystack webhooks appear here." />
          </Card>
        </>
      )}
    </AdminLayout>
  );
}
