// src/pages/Settings.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import AdminLayout from '../layouts/AdminLayout.jsx';
import Card from '../components/Card.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { authService } from '../services/authService.js';
import { dateTime } from '../utils/format.js';
import '../components/RecordDrawer.css';
import './Settings.css';

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="toggle__track" />
    </label>
  );
}

const ROLE_LABEL = { super_admin: 'Super admin', admin: 'Administrator' };
const Message = ({ msg }) => (msg ? <div className={msg.ok ? 'settings__saved' : 'drawer__error'} role="status">{msg.text}</div> : null);

export default function Settings() {
  const { admin, logout, setAdmin } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(admin?.name || '');
  const [profileMsg, setProfileMsg] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState(null);
  const [savingPw, setSavingPw] = useState(false);

  const [notifs, setNotifs] = useState(admin?.notificationPrefs || { newUser: true, payment: true, system: true });
  const [notifMsg, setNotifMsg] = useState(null);
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    authService.getPreferences().then(setNotifs).catch(() => {});
  }, []);

  const initials = admin?.name
    ? admin.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const updated = await authService.updateProfile(name);
      setAdmin(updated);
      setProfileMsg({ ok: true, text: 'Your name was saved.' });
    } catch (err) {
      setProfileMsg({ ok: false, text: err.message });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: 'The new passwords do not match.' });
    setSavingPw(true);
    try {
      await authService.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ ok: true, text: 'Password changed. Use the new one next time you sign in (to the portal and the app).' });
    } catch (err) {
      setPwMsg({ ok: false, text: err.message });
    } finally {
      setSavingPw(false);
    }
  }

  async function toggleNotif(key, value) {
    const next = { ...notifs, [key]: value };
    setNotifs(next);
    setSavingNotif(true);
    setNotifMsg(null);
    try {
      const saved = await authService.savePreferences({ [key]: value });
      setNotifs(saved);
      setAdmin(a => (a ? { ...a, notificationPrefs: saved } : a));
      setNotifMsg({ ok: true, text: 'Saved. The bell now shows only what you chose.' });
    } catch (err) {
      setNotifs(n => ({ ...n, [key]: !value }));
      setNotifMsg({ ok: false, text: err.message });
    } finally {
      setSavingNotif(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const setPwField = (k) => (e) => setPw(p => ({ ...p, [k]: e.target.value }));

  return (
    <AdminLayout pageTitle="Settings / Profile">
      <div className="settings__grid">
        {/* Profile */}
        <Card title="Admin Profile">
          <div className="settings__avatar-row">
            <div className="settings__avatar">{initials}</div>
            <div>
              <div className="settings__avatar-name">{admin?.name || '—'}</div>
              <div className="settings__avatar-info">{ROLE_LABEL[admin?.role] || 'Administrator'} · last sign-in {dateTime(admin?.lastLoginAt)}</div>
            </div>
          </div>

          <form onSubmit={saveProfile} noValidate>
            <div className="settings__field">
              <label className="settings__label" htmlFor="s-name">Name</label>
              <input id="s-name" className="settings__input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="settings__field">
              <label className="settings__label">Email</label>
              <input className="settings__input" value={admin?.email || ''} disabled readOnly />
            </div>
            <div className="settings__field">
              <label className="settings__label">Role</label>
              <input className="settings__input" value={ROLE_LABEL[admin?.role] || admin?.role || ''} disabled readOnly />
            </div>
            <Message msg={profileMsg} />
            <button type="submit" className="drawer__btn drawer__btn--primary" disabled={savingProfile || !name.trim() || name.trim() === admin?.name}>
              {savingProfile ? 'Saving…' : 'Save name'}
            </button>
          </form>
        </Card>

        {/* Notifications */}
        <Card title="Notification Preferences">
          {[
            { key: 'newUser',  label: 'New user registrations', sub: 'New accounts and businesses created in the app' },
            { key: 'payment',  label: 'Payment events',          sub: 'Paid, failed, refunded and payments that need review' },
            { key: 'system',   label: 'System alerts',           sub: 'Warnings from admin actions and service problems' },
          ].map(({ key, label, sub }) => (
            <div key={key} className="settings__toggle-row">
              <div>
                <div className="settings__toggle-label">{label}</div>
                <div className="settings__toggle-sub">{sub}</div>
              </div>
              <Toggle checked={Boolean(notifs[key])} disabled={savingNotif} onChange={v => toggleNotif(key, v)} />
            </div>
          ))}
          <div style={{ marginTop: 12 }}><Message msg={notifMsg} /></div>
        </Card>

        {/* Password */}
        <Card title="Change Password">
          <form onSubmit={savePassword} noValidate>
            {[
              ['current', 'Current password', 'current-password'],
              ['next', 'New password (at least 8 characters)', 'new-password'],
              ['confirm', 'Repeat new password', 'new-password'],
            ].map(([k, label, ac]) => (
              <div key={k} className="settings__field">
                <label className="settings__label" htmlFor={`pw-${k}`}>{label}</label>
                <input id={`pw-${k}`} type="password" autoComplete={ac} className="settings__input" value={pw[k]} onChange={setPwField(k)} />
              </div>
            ))}
            <Message msg={pwMsg} />
            <button type="submit" className="drawer__btn drawer__btn--primary" disabled={savingPw || !pw.current || !pw.next || !pw.confirm}>
              {savingPw ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </Card>
      </div>

      {/* Logout */}
      <div style={{ marginTop: 24 }}>
        <button className="logout-btn" onClick={handleLogout}>
          <LogOut size={16} /> Sign out of admin portal
        </button>
      </div>
    </AdminLayout>
  );
}
