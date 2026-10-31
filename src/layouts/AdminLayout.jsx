// src/layouts/AdminLayout.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, Activity, Settings, Megaphone,
  Menu, X, Bell, Search, LogOut, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDebounced } from '../hooks/useAsync.js';
import { notificationsService } from '../services/notificationsService.js';
import { timeAgo } from '../utils/format.js';
import './AdminLayout.css';

const NAV = [
  { to: '/dashboard',     label: 'Dashboard',               icon: LayoutDashboard },
  { to: '/users',         label: 'Users & Businesses',       icon: Users },
  { to: '/subscriptions', label: 'Subscriptions & Payments', icon: CreditCard },
  { to: '/sponsored',     label: 'Sponsored Adverts',        icon: Megaphone },
  { to: '/monitoring',    label: 'AI & System Monitoring',   icon: Activity },
  { to: '/settings',      label: 'Settings',                 icon: Settings },
];

const BREADCRUMB = {
  '/dashboard':     'Dashboard',
  '/users':         'Users & Businesses',
  '/subscriptions': 'Subscriptions & Payments',
  '/sponsored':     'Sponsored Adverts',
  '/monitoring':    'AI & System Monitoring',
  '/settings':      'Settings',
};

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Administrator' };

export default function AdminLayout({ children, pageTitle, pageSubtitle }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifsOpen,  setNotifsOpen]  = useState(false);
  const [search, setSearch] = useState('');
  const { admin, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  async function handleLogout() { await logout(); navigate('/login'); }

  const initials = admin?.name
    ? admin.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'SA';

  // ── Notifications: real events from the shared database, refreshed every minute ──
  const [notifs, setNotifs] = useState({ items: [], unread: 0 });
  const [notifError, setNotifError] = useState('');
  const loadNotifs = useCallback(() => {
    notificationsService.list()
      .then(d => { setNotifs(d); setNotifError(''); })
      .catch(err => setNotifError(err.message));
  }, []);
  useEffect(() => {
    loadNotifs();
    const t = setInterval(loadNotifs, 60_000);
    return () => clearInterval(t);
  }, [loadNotifs]);

  function toggleNotifs() {
    const opening = !notifsOpen;
    setNotifsOpen(opening);
    setResultsOpen(false);
    // Opening the panel marks everything as read (items stay highlighted until it is closed).
    if (opening && notifs.unread > 0) notificationsService.markSeen().catch(() => {});
    if (!opening) setNotifs(n => ({ items: n.items.map(i => ({ ...i, unread: false })), unread: 0 }));
  }

  // ── Search: users and businesses ──
  const [results, setResults] = useState([]);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const query = useDebounced(search.trim(), 250);
  const searchRef = useRef(null);
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    let live = true;
    setSearching(true);
    notificationsService.search(query)
      .then(d => { if (live) { setResults(d.results); setResultsOpen(true); } })
      .catch(() => { if (live) setResults([]); })
      .finally(() => { if (live) setSearching(false); });
    return () => { live = false; };
  }, [query]);
  useEffect(() => {
    const close = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setResultsOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  function openResult(id) {
    setResultsOpen(false);
    setSearch('');
    navigate(`/users/${id}`);
  }

  const unread = notifs.unread;
  const crumb  = BREADCRUMB[location.pathname] || (location.pathname.startsWith('/users/') ? 'Business Records' : pageTitle);

  return (
    <div className="al-root">
      {/* ── Overlay ── */}
      {sidebarOpen && (
        <div className="al-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`al-sidebar${sidebarOpen ? ' al-sidebar--open' : ''}`}>
        {/* Logo */}
        <div className="al-logo">
          <img src="/logo.jpeg" alt="AI Co-founder" className="al-logo__img" />
          <div className="al-logo__sub">Admin Portal</div>
        </div>

        {/* Nav */}
        <nav className="al-nav">
          <p className="al-nav__label">Navigation</p>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `al-link${isActive ? ' al-link--active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Admin footer */}
        <div className="al-admin">
          <div className="al-admin__avatar">{initials}</div>
          <div className="al-admin__info">
            <div className="al-admin__name">{admin?.name || 'System Administrator'}</div>
            <div className="al-admin__role">{ROLE_LABEL[admin?.role] || 'Administrator'}</div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="al-main">
        {/* Topbar */}
        <header className="al-topbar">
          <div className="al-topbar__left">
            <button className="al-menu-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="al-breadcrumb">
              <span className="al-breadcrumb__root">Admin</span>
              <ChevronRight size={14} className="al-breadcrumb__sep" />
              <span className="al-breadcrumb__page">{crumb}</span>
            </div>
          </div>

          <div className="al-topbar__right">
            {/* Search */}
            <div className="al-search" ref={searchRef}>
              <Search size={15} className="al-search__icon" />
              <input
                className="al-search__input"
                placeholder="Search users & businesses…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={() => results.length && setResultsOpen(true)}
                onKeyDown={e => { if (e.key === 'Enter' && results[0]) openResult(results[0].id); if (e.key === 'Escape') setResultsOpen(false); }}
                aria-label="Search users and businesses"
              />
              {resultsOpen && query.length >= 2 && (
                <div className="al-notif-panel al-search__results">
                  {searching && !results.length ? (
                    <div className="al-notif-item"><p className="al-notif-item__time">Searching…</p></div>
                  ) : !results.length ? (
                    <div className="al-notif-item"><p className="al-notif-item__time">No users or businesses match "{query}".</p></div>
                  ) : results.map(r => (
                    <button key={r.id} className="al-notif-item al-search__result" onClick={() => openResult(r.id)}>
                      <p className="al-notif-item__text">{r.name}{r.business ? ` · ${r.business}` : ''}</p>
                      <span className="al-notif-item__time">{r.email} · {r.plan}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="al-notif-wrap">
              <button
                className="al-icon-btn"
                onClick={toggleNotifs}
                aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
              >
                <Bell size={18} />
                {unread > 0 && <span className="al-notif-dot">{unread > 9 ? '9+' : unread}</span>}
              </button>

              {notifsOpen && (
                <div className="al-notif-panel">
                  <div className="al-notif-panel__head">
                    <span>Notifications</span>
                    <button onClick={toggleNotifs} aria-label="Close"><X size={14} /></button>
                  </div>
                  <div className="al-notif-list">
                    {notifError ? (
                      <div className="al-notif-item"><p className="al-notif-item__time">{notifError}</p></div>
                    ) : !notifs.items.length ? (
                      <div className="al-notif-item"><p className="al-notif-item__time">Nothing new in the last 14 days.</p></div>
                    ) : notifs.items.map(n => (
                      <button
                        key={n.id}
                        className={`al-notif-item al-search__result${n.unread ? ' al-notif-item--unread' : ''}`}
                        onClick={() => { setNotifsOpen(false); if (n.link) navigate(n.link); }}
                      >
                        <p className="al-notif-item__text">{n.text}</p>
                        <span className="al-notif-item__time">{timeAgo(n.time)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Avatar */}
            <div className="al-avatar">{initials}</div>

            {/* Sign out */}
            <button className="al-signout" onClick={handleLogout} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="al-content">
          {(pageTitle || pageSubtitle) && (
            <div className="al-page-header">
              {pageTitle    && <h1 className="al-page-title">{pageTitle}</h1>}
              {pageSubtitle && <p  className="al-page-sub">{pageSubtitle}</p>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
