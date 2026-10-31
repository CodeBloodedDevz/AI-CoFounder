// src/pages/Subscriptions.jsx
import { useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import AdminLayout from '../layouts/AdminLayout.jsx';
import Card from '../components/Card.jsx';
import Table from '../components/Table.jsx';
import Badge from '../components/Badge.jsx';
import Pagination from '../components/Pagination.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { Link } from 'react-router-dom';
import { useAsync, useDebounced } from '../hooks/useAsync.js';
import { subscriptionsService } from '../services/subscriptionsService.js';
import { money, PAYMENT_LABEL } from '../utils/format.js';
import '../components/RecordDrawer.css';
import './Dashboard.css';
import './Subscriptions.css';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{money(p.value)}</strong>
        </p>
      ))}
    </div>
  );
};

function PlanCards({ plans }) {
  return (
    <div className="subs__plans">
      {plans.map(p => (
        <div key={p.id} className={`plan-card plan-card--${p.id}`}>
          <div className="plan-card__name">{p.name}</div>
          <div className={`plan-card__price${p.price === 0 ? ' plan-card__price--free' : ''}`}>
            {p.price === 0 ? 'Free' : `R ${p.price}/mo`}
          </div>
          <div className="plan-card__subs">
            {p.priceAnnual > 0 && <>or R {p.priceAnnual.toLocaleString('en-ZA')}/yr · </>}
            {p.subscribers} subscriber{p.subscribers !== 1 ? 's' : ''}
          </div>
          <ul className="plan-card__features">{(p.features || []).map(f => <li key={f}>{f}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

export default function Subscriptions() {
  const [tab, setTab]         = useState('subscriptions');
  const [search, setSearch]   = useState('');
  const [plan, setPlan]       = useState('all');
  const [subStatus, setSubStatus] = useState('all');
  const [status, setStatus]   = useState('all');
  const [subPage, setSubPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [checking, setChecking] = useState(null);
  const [actionError, setActionError] = useState('');
  const query = useDebounced(search);

  const plans   = useAsync(useCallback(() => subscriptionsService.getPlans(), []));
  const subs    = useAsync(useCallback(() => subscriptionsService.getSubscriptions({ search: query, plan, status: subStatus, page: subPage, limit: 8 }), [query, plan, subStatus, subPage]));
  const pays    = useAsync(useCallback(() => subscriptionsService.getPayments({ search: query, status, page: payPage, limit: 8 }), [query, status, payPage]));
  const summary = useAsync(useCallback(() => subscriptionsService.getPaymentSummary(), []));

  async function recheck(reference) {
    setChecking(reference);
    setActionError('');
    try {
      await subscriptionsService.verifyPayment(reference);
      pays.refetch({ silent: true });
      summary.refetch({ silent: true });
      subs.refetch({ silent: true });
      plans.refetch({ silent: true });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setChecking(null);
    }
  }

  const subCols = [
    { key: 'name',         label: 'User',     render: r => <Link className="action-link" to={`/users/${r.id}`}>{r.name}</Link> },
    { key: 'email',        label: 'Email' },
    { key: 'business',     label: 'Business' },
    { key: 'plan',         label: 'Plan',     render: r => <Badge status={r.planId} label={r.plan} /> },
    { key: 'status',       label: 'Status',   render: r => <Badge status={r.status} label={r.status === 'expired' && r.expiredPlan ? `${r.expiredPlan} expired` : r.status} /> },
    { key: 'billingCycle', label: 'Billing' },
    { key: 'subscribedAt', label: 'Since' },
    { key: 'renewsAt',     label: 'Renews' },
  ];

  const payCols = [
    { key: 'id',     label: 'Ref' },
    { key: 'user',   label: 'User',   render: r => r.userId ? <Link className="action-link" to={`/users/${r.userId}`}>{r.user}</Link> : r.user },
    { key: 'plan',   label: 'Plan',   render: r => <Badge status={r.planId} label={`${r.plan}${r.billingCycle === 'annual' ? ' (annual)' : ''}`} /> },
    { key: 'amount', label: 'Amount', render: r => money(r.amount) },
    { key: 'status', label: 'Status', render: r => <span title={r.failureReason || ''}><Badge status={r.status} label={PAYMENT_LABEL[r.status]} /></span> },
    { key: 'mode',   label: 'Mode',   render: r => <Badge status={r.mode} /> },
    { key: 'date',   label: 'Date' },
    { key: 'actions', label: '',      render: r => r.status === 'pending'
        ? <button className="action-btn" disabled={checking === r.id} onClick={() => recheck(r.id)}>{checking === r.id ? 'Checking…' : 'Re-check'}</button>
        : null },
  ];

  const sm = summary.data;
  const trend = sm?.trend || [];
  const hasTrend = trend.some(m => m.pro > 0 || m.premium > 0);

  function handleSearch(e) { setSearch(e.target.value); setSubPage(1); setPayPage(1); }

  return (
    <AdminLayout pageTitle="Subscriptions & Payments">
      {plans.loading ? <LoadingSpinner /> : plans.error ? <ErrorMessage message={plans.error} /> : (
        <PlanCards plans={plans.data || []} />
      )}

      <div className="subs__tabs">
        <button className={`subs__tab${tab === 'subscriptions' ? ' subs__tab--active' : ''}`} onClick={() => setTab('subscriptions')}>Subscriptions</button>
        <button className={`subs__tab${tab === 'payments' ? ' subs__tab--active' : ''}`} onClick={() => setTab('payments')}>Payment History</button>
      </div>

      {tab === 'subscriptions' && (
        <Card>
          <div className="subs__toolbar">
            <div className="subs__search">
              <Search size={14} className="subs__search-icon" />
              <input placeholder="Search users or businesses…" value={search} onChange={handleSearch} />
            </div>
            <select className="subs__select" value={plan} onChange={e => { setPlan(e.target.value); setSubPage(1); }}>
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
            </select>
            <select className="subs__select" value={subStatus} onChange={e => { setSubStatus(e.target.value); setSubPage(1); }}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="cancelling">Cancelling</option>
              <option value="expired">Expired</option>
              <option value="free">Free</option>
            </select>
          </div>
          {subs.loading ? <LoadingSpinner /> : subs.error ? <ErrorMessage message={subs.error} /> : (
            <>
              <Table columns={subCols} rows={subs.data?.subscriptions || []} emptyMessage={query || plan !== 'all' || subStatus !== 'all' ? 'No subscriptions match your filters.' : 'No users yet.'} />
              <Pagination page={subs.data?.page || 1} totalPages={subs.data?.totalPages || 1} onPage={setSubPage} />
            </>
          )}
        </Card>
      )}

      {tab === 'payments' && (
        <>
          {summary.loading ? <LoadingSpinner /> : summary.error ? <ErrorMessage message={summary.error} /> : (
            <div className="revenue-summary">
              <div className="revenue-card">
                <div className="revenue-card__label">Verified Revenue</div>
                <div className="revenue-card__value">{money(sm.verifiedRevenue)}</div>
                <div className="revenue-card__note">{sm.paidCount} confirmed Paystack payment{sm.paidCount === 1 ? '' : 's'}{sm.revenueMode === 'test' ? ' · test mode' : ''}</div>
              </div>
              <div className="revenue-card">
                <div className="revenue-card__label">This Month</div>
                <div className="revenue-card__value">{money(sm.thisMonth)}</div>
                <div className="revenue-card__note">Paid since the 1st</div>
              </div>
              <div className="revenue-card">
                <div className="revenue-card__label">Awaiting Payment</div>
                <div className="revenue-card__value">{sm.pending}</div>
                <div className="revenue-card__note">Open checkouts not yet paid</div>
              </div>
              <div className="revenue-card">
                <div className="revenue-card__label">Needs Review</div>
                <div className="revenue-card__value">{sm.needsReview}</div>
                <div className="revenue-card__note">Paystack didn't match the order</div>
              </div>
            </div>
          )}

          <Card title="Monthly Revenue Trend" style={{ marginBottom: 24 }} className="subs__trend">
            {summary.loading ? <LoadingSpinner /> : !hasTrend ? (
              <p className="dashboard__empty">No verified payments in the last 6 months.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trend} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `R${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={10} />
                  <Bar dataKey="pro"     name="Pro"     fill="#7c3aed" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="premium" name="Premium" fill="#f97316" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <div className="subs__toolbar">
              <div className="subs__search">
                <Search size={14} className="subs__search-icon" />
                <input placeholder="Search by user, email or reference…" value={search} onChange={handleSearch} />
              </div>
              <select className="subs__select" value={status} onChange={e => { setStatus(e.target.value); setPayPage(1); }}>
                <option value="all">All Statuses</option>
                <option value="success">Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
                <option value="mismatch">Needs review</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            {actionError && <div className="drawer__error">{actionError}</div>}
            {pays.loading ? <LoadingSpinner /> : pays.error ? <ErrorMessage message={pays.error} /> : (
              <>
                <Table columns={payCols} rows={pays.data?.payments || []} emptyMessage={query || status !== 'all' ? 'No payments match your filters.' : 'No payments yet.'} />
                <Pagination page={pays.data?.page || 1} totalPages={pays.data?.totalPages || 1} onPage={setPayPage} />
              </>
            )}
          </Card>
        </>
      )}
    </AdminLayout>
  );
}
