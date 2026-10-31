// src/pages/Dashboard.jsx
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, Building2, UserCheck, Gift, CreditCard, DollarSign, Receipt, CalendarDays, BookUser, Package, TriangleAlert, Wrench } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import AdminLayout from '../layouts/AdminLayout.jsx';
import StatCard from '../components/StatCard.jsx';
import Card from '../components/Card.jsx';
import Table from '../components/Table.jsx';
import Badge from '../components/Badge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { dashboardService } from '../services/dashboardService.js';
import { fmt, money, PAYMENT_LABEL } from '../utils/format.js';
import './Dashboard.css';

const PIE_COLORS = ['#6b7280', '#7c3aed', '#f97316'];

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

export default function Dashboard() {
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');

  const filters  = { ...(from && { from }), ...(to && { to }) };
  const summary  = useAsync(useCallback(() => dashboardService.getSummary(filters), [from, to]));
  const chart    = useAsync(useCallback(() => dashboardService.getRegistrationChart(filters), [from, to]));
  const recUsers = useAsync(useCallback(() => dashboardService.getRecentUsers(5), []));
  const recPay   = useAsync(useCallback(() => dashboardService.getRecentPayments(5), []));

  const s = summary.data || {};

  const plans   = s.plans || { free: 0, pro: 0, premium: 0 };
  const pieData = [
    { name: 'Free',    value: plans.free },
    { name: 'Pro',     value: plans.pro },
    { name: 'Premium', value: plans.premium },
  ];
  const hasUsers   = pieData.some(d => d.value > 0);
  const revenue    = s.revenueByPlan || [];
  const hasRevenue = revenue.some(r => r.revenue > 0);
  const regs       = chart.data || [];
  const hasRegs    = regs.some(m => m.users > 0);
  const t          = s.trends || {};
  const a          = s.activity || {};
  const testMode   = s.revenueMode === 'test';

  const userCols = [
    { key: 'name',         label: 'Name',   render: r => <Link className="action-link" to={`/users/${r.id}`}>{r.name}</Link> },
    { key: 'email',        label: 'Email' },
    { key: 'plan',         label: 'Plan',   render: r => <Badge status={r.planId} label={r.plan} /> },
    { key: 'registeredAt', label: 'Joined' },
  ];

  const payCols = [
    { key: 'user',   label: 'User',   render: r => <Link className="action-link" to={`/users/${r.userId}`}>{r.user}</Link> },
    { key: 'plan',   label: 'Plan',   render: r => <Badge status={r.planId} label={r.plan} /> },
    { key: 'amount', label: 'Amount', render: r => money(r.amount) },
    { key: 'status', label: 'Status', render: r => <Badge status={r.status} label={PAYMENT_LABEL[r.status]} /> },
    { key: 'date',   label: 'Date' },
  ];

  return (
    <AdminLayout pageTitle="Dashboard">
      {/* Date filter */}
      <div className="dashboard__filter">
        <label>From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <label>To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        {(from || to) && (
          <button className="dashboard__filter-clear" onClick={() => { setFrom(''); setTo(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Summary cards */}
      {summary.loading ? <LoadingSpinner /> : summary.error ? <ErrorMessage message={summary.error} /> : (
        <>
          <div className="dashboard__stats">
            <StatCard label="Total Users"      value={fmt(s.totalUsers)}      icon={Users}      color="purple" trend={t.totalUsers}      trendLabel="growth this month" />
            <StatCard label="Total Businesses" value={fmt(s.totalBusinesses)} icon={Building2}  color="purple" trend={t.totalBusinesses} trendLabel="growth this month" />
            <StatCard label="Active Users (30 days)" value={fmt(s.activeUsers)} icon={UserCheck} color="green" />
            <StatCard label="Free Subscribers" value={fmt(s.freeSubscribers)} icon={Gift}       color="gray" />
            <StatCard label="Paid Subscribers" value={fmt(s.paidSubscribers)} icon={CreditCard} color="coral" />
            <StatCard label={testMode ? 'Verified Revenue (test mode)' : 'Verified Revenue'} value={money(s.verifiedRevenue)} icon={DollarSign} color="coral" trend={t.verifiedRevenue} trendLabel="vs same days last month" />
          </div>

          <h2 className="dashboard__section-title">Platform Activity</h2>
          <div className="dashboard__stats">
            <StatCard label="Transactions Recorded" value={fmt(a.transactions)}     icon={Receipt}       color="purple" />
            <StatCard label="Bookings"              value={fmt(a.bookings)}         icon={CalendarDays}  color="purple" />
            <StatCard label="Upcoming Bookings"     value={fmt(a.upcomingBookings)} icon={CalendarDays}  color="green" />
            <StatCard label="Customers"             value={fmt(a.customers)}        icon={BookUser}       color="green" />
            <StatCard label="Stock Items"           value={fmt(a.products)}         icon={Package}       color="gray" />
            <StatCard label="Low / Out of Stock"    value={fmt(a.lowStock)}         icon={TriangleAlert} color="coral" />
            <StatCard label="Services Offered"      value={fmt(a.services)}         icon={Wrench}        color="purple" />
          </div>
        </>
      )}

      {/* Charts row */}
      <div className="dashboard__charts">
        <Card title="User Registrations">
          {chart.loading ? <LoadingSpinner /> : chart.error ? <ErrorMessage message={chart.error} /> : !hasRegs ? (
            <p className="dashboard__empty">No registrations in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chart.data || []} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="users" name="Users" stroke="#7c3aed" strokeWidth={2} fill="url(#regGrad)" dot={{ r: 4, fill: '#7c3aed' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Subscription Breakdown">
          {summary.loading ? <LoadingSpinner /> : summary.error ? <ErrorMessage message={summary.error} /> : !hasUsers ? (
            <p className="dashboard__empty">No users in this period.</p>
          ) : (
            <div className="dashboard__pie-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v.toLocaleString(), n]} />
                  <Legend iconType="circle" iconSize={10} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Revenue bar chart */}
      {!summary.loading && !summary.error && (
        <Card title={`Revenue Overview (ZAR)${testMode ? ' · Paystack test mode' : ''}`}>
          {!hasRevenue ? (
            <p className="dashboard__empty">No verified payments in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenue} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `R${v}`} />
                <Tooltip formatter={v => [money(v), 'Revenue']} />
                <Bar dataKey="revenue" name="Revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      {/* Recent tables */}
      <div className="dashboard__tables">
        <Card title="Recent Registrations">
          {recUsers.loading ? <LoadingSpinner /> : recUsers.error ? <ErrorMessage message={recUsers.error} /> : (
            <Table columns={userCols} rows={recUsers.data || []} emptyMessage="No registrations yet." />
          )}
        </Card>
        <Card title="Recent Payments">
          {recPay.loading ? <LoadingSpinner /> : recPay.error ? <ErrorMessage message={recPay.error} /> : (
            <Table columns={payCols} rows={recPay.data || []} emptyMessage="No payments yet." />
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
