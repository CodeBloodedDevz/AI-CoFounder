// src/pages/BusinessDetail.jsx
// One app user's business: profile, plan, figures and every record the app keeps for it.
// Edits go through the backend's admin API, which uses the app's own rules (stock moves with sales,
// completed bookings record their income, edits are kept in the transaction's history), so the
// owner sees the change in the mobile app on their next refresh.
import { useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Search, TrendingUp, TrendingDown, Wallet, BookUser, CalendarDays, Package } from 'lucide-react';
import AdminLayout from '../layouts/AdminLayout.jsx';
import Card from '../components/Card.jsx';
import Table from '../components/Table.jsx';
import Badge from '../components/Badge.jsx';
import StatCard from '../components/StatCard.jsx';
import Pagination from '../components/Pagination.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { RecordDrawer, ConfirmDrawer } from '../components/RecordDrawer.jsx';
import { useAsync, useDebounced } from '../hooks/useAsync.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { businessService } from '../services/businessService.js';
import { subscriptionsService } from '../services/subscriptionsService.js';
import { fmt, money, PAYMENT_LABEL } from '../utils/format.js';
import './Users.css';
import './Settings.css';
import './Subscriptions.css';
import './Dashboard.css';
import './BusinessDetail.css';

const BOOKING_OPTIONS = [
  { value: 'Pending', label: 'Scheduled' },
  { value: 'Confirmed', label: 'Confirmed' },
  { value: 'Completed', label: 'Completed' },
  { value: 'No-show', label: 'Missed' },
  { value: 'Cancelled', label: 'Cancelled' },
];
const CURRENCIES = ['South African Rand (R)', 'US Dollar ($)', 'Euro (€)', 'British Pound (£)'];
const opts = (list) => list.map(v => ({ value: v, label: v || '—' }));

// What each tab lists, how it is filtered, and which fields can be edited.
function tabConfig(sym) {
  return {
    transactions: {
      label: 'Transactions',
      search: 'Search item or note…',
      filter: { key: 'type', options: [['all', 'All types'], ['sale', 'Sales'], ['expense', 'Expenses']] },
      empty: 'No sales or expenses recorded yet.',
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type', render: r => <Badge status={r.type} /> },
        { key: 'item', label: 'Item / description' },
        { key: 'quantity', label: 'Qty', render: r => fmt(r.quantity) },
        { key: 'amount', label: 'Amount', render: r => money(r.amount, sym) },
        { key: 'source', label: 'Source', render: r => (r.fromBooking ? 'Booking' : 'Manual') + (r.edits ? ` · edited ${r.edits}×` : '') },
      ],
      name: r => `${r.type} "${r.item}" (${money(r.amount, sym)})`,
      deleteNote: r => (r.type === 'sale' && !r.fromBooking ? 'Its units go back into stock, exactly as when the owner deletes it in the app.' : 'Stock is not affected.'),
      fields: [
        { key: 'amount', label: `Amount (${sym})`, type: 'number' },
        { key: 'product', label: 'Item / description' },
        { key: 'quantity', label: 'Quantity', type: 'number', hint: 'Changing the quantity of a product sale moves stock accordingly.' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'note', label: 'Note', type: 'textarea' },
      ],
      toForm: r => ({ amount: r.amount, product: r.item, quantity: r.quantity, date: r.date, note: r.note }),
    },
    products: {
      label: 'Stock',
      search: 'Search products…',
      filter: { key: 'status', options: [['all', 'All stock'], ['in-stock', 'In stock'], ['low-stock', 'Low stock'], ['out-of-stock', 'Out of stock']] },
      empty: 'No products in stock yet.',
      columns: [
        { key: 'name', label: 'Product' },
        { key: 'category', label: 'Category' },
        { key: 'stock', label: 'In stock', render: r => fmt(r.stock) },
        { key: 'lowStockThreshold', label: 'Low at', render: r => fmt(r.lowStockThreshold) },
        { key: 'price', label: 'Price', render: r => money(r.price, sym) },
        { key: 'cost', label: 'Cost', render: r => money(r.cost, sym) },
        { key: 'status', label: 'Status', render: r => <Badge status={r.status} label={{ 'in-stock': 'In stock', 'low-stock': 'Low', 'out-of-stock': 'Out' }[r.status]} /> },
      ],
      name: r => `product "${r.name}"`,
      deleteNote: () => 'Past sales of it stay in the transaction history.',
      fields: [
        { key: 'name', label: 'Name' },
        { key: 'category', label: 'Category' },
        { key: 'price', label: `Selling price (${sym})`, type: 'number' },
        { key: 'cost', label: `Cost price (${sym})`, type: 'number' },
        { key: 'stock', label: 'Stock count', type: 'number', hint: 'A stock-take correction: sets the count directly and does not record an expense.' },
        { key: 'lowStockThreshold', label: 'Low-stock level', type: 'number' },
      ],
      toForm: r => ({ name: r.name, category: r.category, price: r.price, cost: r.cost, stock: r.stock, lowStockThreshold: r.lowStockThreshold }),
    },
    services: {
      label: 'Services',
      search: 'Search services…',
      empty: 'No services offered yet.',
      columns: [
        { key: 'name', label: 'Service' },
        { key: 'category', label: 'Category' },
        { key: 'duration', label: 'Duration', render: r => r.duration || '—' },
        { key: 'price', label: 'Price', render: r => money(r.price, sym) },
      ],
      name: r => `service "${r.name}"`,
      deleteNote: () => 'Existing bookings keep their details.',
      fields: [
        { key: 'name', label: 'Name' },
        { key: 'price', label: `Price (${sym})`, type: 'number' },
        { key: 'duration', label: 'Duration' },
        { key: 'category', label: 'Category' },
      ],
      toForm: r => ({ name: r.name, price: r.price, duration: r.duration, category: r.category }),
    },
    customers: {
      label: 'Customers',
      search: 'Search name, phone or email…',
      empty: 'No customers saved yet.',
      columns: [
        { key: 'name', label: 'Customer' },
        { key: 'phone', label: 'Phone', render: r => r.phone || '—' },
        { key: 'email', label: 'Email', render: r => r.email || '—' },
        { key: 'bookings', label: 'Bookings' },
        { key: 'visits', label: 'Visits' },
        { key: 'lastVisit', label: 'Last visit', render: r => r.lastVisit || '—' },
      ],
      name: r => `customer "${r.name}"`,
      deleteNote: () => 'Their bookings are kept but no longer linked to them (same as deleting in the app).',
      fields: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email', type: 'email' },
      ],
      toForm: r => ({ name: r.name, phone: r.phone, email: r.email }),
    },
    bookings: {
      label: 'Bookings',
      search: 'Search bookings…',
      filter: { key: 'status', options: [['all', 'All statuses'], ...BOOKING_OPTIONS.map(o => [o.value, o.label])] },
      empty: 'No bookings yet.',
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time', render: r => r.time || '—' },
        { key: 'title', label: 'Booking' },
        { key: 'customer', label: 'Customer', render: r => r.customer || '—' },
        { key: 'price', label: 'Price', render: r => (r.price == null ? '—' : money(r.price, sym)) },
        { key: 'status', label: 'Status', render: r => <Badge status={r.statusLabel} /> },
      ],
      name: r => `booking "${r.title}" on ${r.date}`,
      deleteNote: () => 'Income already recorded for it stays in Transactions.',
      fields: [
        { key: 'status', label: 'Status', type: 'select', options: BOOKING_OPTIONS, hint: 'Completing records the income (as in the app). A future booking can only be completed on the day.' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'time', label: 'Time (HH:MM)' },
        { key: 'price', label: `Agreed price (${sym})`, type: 'number' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
      toForm: r => ({ status: r.status, date: r.date, time: r.time, price: r.price ?? '', notes: r.notes }),
    },
  };
}

function RecordsTab({ userId, kind, config, canDelete, onChanged }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState(null);
  const query = useDebounced(search);
  const params = { search: query, page, limit: 10, ...(config.filter ? { [config.filter.key]: filter } : {}) };
  const list = useAsync(useCallback(() => businessService.list(userId, kind, params), [userId, kind, query, filter, page]));
  const rows = list.data?.[kind] || [];

  const changed = () => { list.refetch({ silent: true }); onChanged(); };
  const columns = [
    ...config.columns,
    {
      key: 'actions', label: '', render: r => (
        <div className="action-group">
          <button className="action-btn" onClick={() => setDrawer({ type: 'edit', row: r })}>Edit</button>
          {canDelete && <button className="action-btn action-btn--danger" onClick={() => setDrawer({ type: 'delete', row: r })}>Delete</button>}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="users__toolbar">
        <div className="users__search">
          <Search size={14} className="users__search-icon" />
          <input placeholder={config.search} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {config.filter && (
          <select className="users__select" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>
            {config.filter.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
      </div>
      {list.loading ? <LoadingSpinner /> : list.error ? <ErrorMessage message={list.error} /> : (
        <>
          <Table columns={columns} rows={rows} emptyMessage={query || filter !== 'all' ? 'Nothing matches your search.' : config.empty} />
          <Pagination page={list.data?.page || 1} totalPages={list.data?.totalPages || 1} onPage={setPage} />
        </>
      )}

      {drawer?.type === 'edit' && (
        <RecordDrawer
          title={`Edit ${config.label === 'Stock' ? 'product' : config.label.toLowerCase().replace(/s$/, '')}`}
          fields={config.fields}
          initial={config.toForm(drawer.row)}
          onSave={async (fields) => { await businessService.update(userId, kind, drawer.row.id, fields); changed(); }}
          onClose={() => setDrawer(null)}
        />
      )}
      {drawer?.type === 'delete' && (
        <ConfirmDrawer
          title="Delete record?"
          message={`This permanently deletes the ${config.name(drawer.row)} from the owner's business. ${config.deleteNote(drawer.row)}`}
          onConfirm={async () => { await businessService.remove(userId, kind, drawer.row.id); changed(); }}
          onClose={() => setDrawer(null)}
        />
      )}
    </Card>
  );
}

function PaymentsTab({ userId, onChanged }) {
  const pays = useAsync(useCallback(() => businessService.getPayments(userId), [userId]));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  async function recheck(ref) {
    setBusy(ref);
    setError('');
    try { await subscriptionsService.verifyPayment(ref); pays.refetch({ silent: true }); onChanged(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  const columns = [
    { key: 'id', label: 'Reference' },
    { key: 'plan', label: 'Plan', render: r => <Badge status={r.planId} label={r.plan} /> },
    { key: 'billingCycle', label: 'Billing' },
    { key: 'amount', label: 'Amount', render: r => money(r.amount) },
    { key: 'status', label: 'Status', render: r => <Badge status={r.status} label={PAYMENT_LABEL[r.status]} /> },
    { key: 'mode', label: 'Mode', render: r => <Badge status={r.mode} /> },
    { key: 'date', label: 'Date' },
    { key: 'actions', label: '', render: r => r.status === 'pending' ? <button className="action-btn" disabled={busy === r.id} onClick={() => recheck(r.id)}>{busy === r.id ? 'Checking…' : 'Re-check with Paystack'}</button> : null },
  ];
  return (
    <Card>
      {error && <div className="drawer__error">{error}</div>}
      {pays.loading ? <LoadingSpinner /> : pays.error ? <ErrorMessage message={pays.error} /> : (
        <Table columns={columns} rows={pays.data || []} emptyMessage="No payments made by this business yet." />
      )}
    </Card>
  );
}

export default function BusinessDetail() {
  const { id } = useParams();
  const { admin } = useAuth();
  const canDelete = admin?.role === 'super_admin';
  const overview = useAsync(useCallback(() => businessService.getOverview(id), [id]));
  const [tab, setTab] = useState('transactions');
  const [drawer, setDrawer] = useState(null);

  const d = overview.data;
  const user = d?.user;
  const business = d?.business;
  const sub = d?.subscription;
  const stats = d?.stats;
  const sym = business?.currencySymbol || 'R';
  const tabs = tabConfig(sym);
  const refresh = () => overview.refetch({ silent: true });

  const title = business?.name || user?.name || 'Business';
  const back = <Link to="/users" className="bd__back"><ArrowLeft size={14} /> Users &amp; Businesses</Link>;

  if (overview.loading) return <AdminLayout pageTitle="Business">{back}<LoadingSpinner /></AdminLayout>;
  if (overview.error) return <AdminLayout pageTitle="Business">{back}<ErrorMessage message={overview.error} /></AdminLayout>;

  return (
    <AdminLayout pageTitle={title} pageSubtitle={`${user.name} · ${user.email}${user.status === 'suspended' ? ' · suspended' : ''}`}>
      {back}

      {!business ? (
        <Card title="No business yet">
          <p className="bd__muted">{user.name} has an account but hasn't completed the business setup in the app, so there are no business records yet.</p>
        </Card>
      ) : (
        <>
          <div className="dashboard__stats bd__stats">
            <StatCard label="Sales this month"    value={money(stats.month.totalSales, sym)}    icon={TrendingUp}   color="green" />
            <StatCard label="Expenses this month" value={money(stats.month.totalExpenses, sym)} icon={TrendingDown} color="coral" />
            <StatCard label="Profit this month"   value={money(stats.month.profit, sym)}        icon={Wallet}       color={stats.month.profit < 0 ? 'coral' : 'purple'} />
            <StatCard label="Upcoming bookings"   value={fmt(stats.bookings.upcoming)}          icon={CalendarDays} color="purple" />
            <StatCard label="Customers"           value={fmt(stats.customers)}                  icon={BookUser}      color="green" />
            <StatCard label="Low / out of stock"  value={`${fmt(stats.lowStock)} / ${fmt(stats.outOfStock)}`} icon={Package} color="gray" />
          </div>

          <div className="settings__grid bd__grid">
            <Card title="Business Profile" action={<button className="action-btn" onClick={() => setDrawer('profile')}>Edit</button>}>
              {[
                ['Business type', business.type],
                ['Business model', business.business_model],
                ['Location', business.location],
                ['Hours', business.hours],
                ['Currency', business.currency],
                ['Language', business.language],
                ['Goals', business.goals],
                ['Created', business.created_at ? new Date(business.created_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' }) : null],
              ].map(([label, value]) => (
                <div key={label} className="user-detail-panel__row">
                  <div className="user-detail-panel__label">{label}</div>
                  <div className="user-detail-panel__value">{value || '—'}</div>
                </div>
              ))}
            </Card>

            <Card title="Subscription">
              <div className="user-detail-panel__row">
                <div className="user-detail-panel__label">Plan</div>
                <div className="user-detail-panel__value"><Badge status={sub.planId} label={sub.plan} /> {sub.cancelAtPeriodEnd && <Badge status="cancelling" />}{sub.expiredPlan && <Badge status="expired" label={`${sub.expiredPlan} expired`} />}</div>
              </div>
              {[
                ['Billing', sub.billingCycle],
                ['Started', sub.startedOn],
                ['Renews / ends', sub.renewsOn],
                ['Card', sub.paymentMethod ? `${sub.paymentMethod.brand} •••• ${sub.paymentMethod.last4}` : null],
                ['All-time sales', money(stats.allTime.totalSales, sym)],
                ['All-time profit', money(stats.allTime.profit, sym)],
                ['Stock value (at cost)', money(stats.stockValue, sym)],
              ].map(([label, value]) => (
                <div key={label} className="user-detail-panel__row">
                  <div className="user-detail-panel__label">{label}</div>
                  <div className="user-detail-panel__value">{value || '—'}</div>
                </div>
              ))}
              {sub.planId !== 'free' && (
                <div className="action-group" style={{ marginTop: 8 }}>
                  {sub.cancelAtPeriodEnd
                    ? <button className="action-btn" onClick={() => setDrawer('resume')}>Resume plan</button>
                    : <button className="action-btn action-btn--danger" onClick={() => setDrawer('cancel')}>Cancel at period end</button>}
                </div>
              )}
            </Card>
          </div>

          {stats.topProducts.length > 0 && (
            <Card title="Top sellers this month" className="bd__top">
              <div className="bd__chips">
                {stats.topProducts.map(p => <span key={p.name} className="bd__chip">{p.name} · {money(p.value, sym)}</span>)}
              </div>
            </Card>
          )}

          <div className="subs__tabs">
            {[...Object.entries(tabs).map(([k, c]) => [k, c.label]), ['payments', 'Payments']].map(([k, label]) => (
              <button key={k} className={`subs__tab${tab === k ? ' subs__tab--active' : ''}`} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>

          {tab === 'payments'
            ? <PaymentsTab userId={id} onChanged={refresh} />
            : <RecordsTab key={tab} userId={id} kind={tab} config={tabs[tab]} canDelete={canDelete} onChanged={refresh} />}
        </>
      )}

      {drawer === 'profile' && (
        <RecordDrawer
          title="Edit business profile"
          fields={[
            { key: 'name', label: 'Business name' },
            { key: 'type', label: 'Business type' },
            { key: 'businessModel', label: 'Business model', type: 'select', options: opts(['', 'Product-based', 'Service-based', 'Hybrid']) },
            { key: 'location', label: 'Location' },
            { key: 'hours', label: 'Hours' },
            { key: 'currency', label: 'Currency', type: 'select', options: opts(CURRENCIES.includes(business.currency) ? CURRENCIES : [business.currency || '', ...CURRENCIES]) },
            { key: 'language', label: 'Preferred language', type: 'select', options: opts(['', 'English', 'Afrikaans', 'isiZulu']) },
            { key: 'goals', label: 'Goals', type: 'textarea' },
          ]}
          initial={{ name: business.name, type: business.type, businessModel: business.business_model, location: business.location, hours: business.hours, currency: business.currency, language: business.language, goals: business.goals }}
          onSave={async (fields) => { await businessService.updateProfile(id, fields); refresh(); }}
          onClose={() => setDrawer(null)}
        />
      )}
      {(drawer === 'cancel' || drawer === 'resume') && (
        <ConfirmDrawer
          title={drawer === 'cancel' ? 'Cancel at the end of the period?' : 'Resume this plan?'}
          message={drawer === 'cancel'
            ? `${business.name} keeps ${sub.plan} until ${sub.renewsOn}, then moves to Free. Nothing is refunded. This is the same as the owner tapping Cancel in the app.`
            : `${business.name}'s ${sub.plan} plan will continue after ${sub.renewsOn}.`}
          confirmLabel={drawer === 'cancel' ? 'Cancel at period end' : 'Resume plan'}
          onConfirm={async () => { await businessService.subscription(id, drawer); refresh(); }}
          onClose={() => setDrawer(null)}
        />
      )}
    </AdminLayout>
  );
}
