// src/pages/Users.jsx
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import AdminLayout from '../layouts/AdminLayout.jsx';
import Card from '../components/Card.jsx';
import Table from '../components/Table.jsx';
import Badge from '../components/Badge.jsx';
import Pagination from '../components/Pagination.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useAsync, useDebounced } from '../hooks/useAsync.js';
import { usersService } from '../services/usersService.js';
import { dateTime } from '../utils/format.js';
import '../components/RecordDrawer.css';
import './Users.css';

function UserDetailPanel({ user, onClose, onStatusChange }) {
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  if (!user) return null;
  const suspending = user.status !== 'suspended';

  async function toggleStatus() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await usersService.updateUserStatus(user.id, suspending ? 'suspended' : 'active');
      setConfirming(false);
      onStatusChange(updated);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="user-detail-overlay" onClick={onClose}>
      <div className="user-detail-panel" onClick={e => e.stopPropagation()}>
        <button className="user-detail-panel__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <h2>User Details</h2>
        {[
          ['Name',         user.name],
          ['Email',        user.email],
          ['Phone',        user.phone || '—'],
          ['Business',     user.business],
          ['Business type', user.businessType || '—'],
          ['Plan',         <Badge key="p" status={user.planId} label={user.plan} />],
          ['Status',       <Badge key="s" status={user.status} />],
          ['Registered',   user.registeredAt],
          ['Last sign-in', dateTime(user.lastSignInAt)],
        ].map(([label, val]) => (
          <div key={label} className="user-detail-panel__row">
            <div className="user-detail-panel__label">{label}</div>
            <div className="user-detail-panel__value">{val}</div>
          </div>
        ))}

        <div className="action-group" style={{ marginTop: 24, flexWrap: 'wrap' }}>
          {user.businessId && (
            <Link className="action-btn" to={`/users/${user.id}`}>Open business records</Link>
          )}
          {!user.isAdmin && !confirming && (
            <button className={`action-btn${suspending ? ' action-btn--danger' : ''}`} onClick={() => (suspending ? setConfirming(true) : toggleStatus())} disabled={saving}>
              {saving ? 'Saving…' : suspending ? 'Suspend user' : 'Reactivate user'}
            </button>
          )}
        </div>

        {confirming && (
          <div className="suspend-notice">
            <strong>Suspend {user.name}?</strong>
            They will be signed out of the AI Co-Founder app straight away and won't be able to sign in until you reactivate them. Their business data is kept.
            <div className="action-group" style={{ marginTop: 10 }}>
              <button className="action-btn action-btn--danger" onClick={toggleStatus} disabled={saving}>{saving ? 'Suspending…' : 'Yes, suspend'}</button>
              <button className="action-btn" onClick={() => setConfirming(false)} disabled={saving}>Cancel</button>
            </div>
          </div>
        )}
        {user.isAdmin && <p className="drawer__hint" style={{ marginTop: 16 }}>Administrator accounts can't be suspended here.</p>}
        {saveError && <div className="drawer__error" style={{ marginTop: 12 }}>{saveError}</div>}
      </div>
    </div>
  );
}

export default function Users() {
  const [search, setSearch]   = useState('');
  const [plan, setPlan]       = useState('all');
  const [status, setStatus]   = useState('all');
  const [page, setPage]       = useState(1);
  const [selected, setSelected] = useState(null);
  const query = useDebounced(search);

  const { data, loading, error, refetch } = useAsync(
    useCallback(() => usersService.getUsers({ search: query, plan, status, page, limit: 8 }), [query, plan, status, page])
  );

  const columns = [
    { key: 'name',         label: 'Name' },
    { key: 'email',        label: 'Email' },
    { key: 'registeredAt', label: 'Registered' },
    { key: 'business',     label: 'Business', render: r => r.businessId ? <Link className="action-link" to={`/users/${r.id}`}>{r.business}</Link> : '—' },
    { key: 'plan',         label: 'Plan',   render: r => <Badge status={r.planId} label={r.plan} /> },
    { key: 'status',       label: 'Status', render: r => <Badge status={r.status} /> },
    { key: 'actions',      label: '',       render: r => <button className="action-btn" onClick={() => setSelected(r)}>View</button> },
  ];

  function handleSearch(e) { setSearch(e.target.value); setPage(1); }
  function handlePlan(e)   { setPlan(e.target.value);   setPage(1); }
  function handleStatus(e) { setStatus(e.target.value); setPage(1); }

  return (
    <AdminLayout pageTitle="Users & Businesses" pageSubtitle={data ? `${data.total} account${data.total === 1 ? '' : 's'} using the AI Co-Founder app` : undefined}>
      <Card>
        <div className="users__toolbar">
          <div className="users__search">
            <Search size={14} className="users__search-icon" />
            <input placeholder="Search by name, email or business…" value={search} onChange={handleSearch} />
          </div>
          <select className="users__select" value={plan} onChange={handlePlan}>
            <option value="all">All Plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="premium">Premium</option>
          </select>
          <select className="users__select" value={status} onChange={handleStatus}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {loading ? <LoadingSpinner /> : error ? <ErrorMessage message={error} /> : (
          <>
            <Table
              columns={columns}
              rows={data?.users || []}
              emptyMessage={query || plan !== 'all' || status !== 'all' ? 'No users match your filters.' : 'No one has registered in the app yet.'}
            />
            <Pagination page={data?.page || 1} totalPages={data?.totalPages || 1} onPage={setPage} />
          </>
        )}
      </Card>

      {selected && (
        <UserDetailPanel
          user={selected}
          onClose={() => setSelected(null)}
          onStatusChange={updated => { setSelected(updated); refetch({ silent: true }); }}
        />
      )}
    </AdminLayout>
  );
}
