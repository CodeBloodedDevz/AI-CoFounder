// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldAlert, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import './Login.css';

export default function Login() {
  const [form,     setForm]     = useState({ email: '', password: '', remember: false });
  const [errors,   setErrors]   = useState({});
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [apiError, setApiError] = useState('');
  const { login }  = useAuth();
  const navigate   = useNavigate();

  function validate() {
    const e = {};
    if (!form.email)    e.email    = 'Email address is required.';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email address.';
    if (!form.password) e.password = 'Password is required.';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({}); setApiError(''); setLoading(true);
    try {
      await login(form);
      navigate('/dashboard');
    } catch (err) {
      setApiError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lp-root">
      {/* ── Left illustration panel ── */}
      <div className="lp-panel">
        <div className="lp-panel__logo">
          <img src="/logo.jpeg" alt="AI Co-founder" className="lp-panel__logo-img" />
        </div>

        <div className="lp-panel__body">
          <h2 className="lp-panel__heading">Build better businesses with AI</h2>
          <p className="lp-panel__desc">
            Manage users, monitor performance, track payments and keep the platform running smoothly.
          </p>

          {/* Abstract SVG illustration */}
          <div className="lp-illustration" aria-hidden="true">
            <svg viewBox="0 0 360 280" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Background circles */}
              <circle cx="180" cy="140" r="120" fill="rgba(255,255,255,.04)" />
              <circle cx="180" cy="140" r="80"  fill="rgba(255,255,255,.04)" />
              {/* Coral accent shapes */}
              <circle cx="290" cy="60"  r="40" fill="#FF747C" opacity=".18" />
              <circle cx="70"  cy="220" r="30" fill="#FF747C" opacity=".14" />
              <circle cx="310" cy="200" r="20" fill="#7C4DFF" opacity=".25" />
              {/* Chart bars */}
              <rect x="60"  y="160" width="28" height="60" rx="6" fill="rgba(255,255,255,.15)" />
              <rect x="100" y="130" width="28" height="90" rx="6" fill="rgba(255,255,255,.20)" />
              <rect x="140" y="100" width="28" height="120" rx="6" fill="#FF747C" opacity=".55" />
              <rect x="180" y="120" width="28" height="100" rx="6" fill="rgba(255,255,255,.20)" />
              <rect x="220" y="90"  width="28" height="130" rx="6" fill="#7C4DFF" opacity=".55" />
              <rect x="260" y="110" width="28" height="110" rx="6" fill="rgba(255,255,255,.15)" />
              {/* Line chart */}
              <polyline points="60,155 100,125 140,95 180,115 220,85 260,105 300,80"
                stroke="#FF747C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".7" />
              {/* Dots on line */}
              {[[60,155],[100,125],[140,95],[180,115],[220,85],[260,105],[300,80]].map(([cx,cy],i) => (
                <circle key={i} cx={cx} cy={cy} r="4" fill="#FF747C" opacity=".9" />
              ))}
              {/* Stat cards */}
              <rect x="40"  y="30" width="90" height="44" rx="8" fill="rgba(255,255,255,.10)" />
              <rect x="145" y="30" width="90" height="44" rx="8" fill="rgba(255,255,255,.10)" />
              <rect x="250" y="30" width="70" height="44" rx="8" fill="rgba(255,255,255,.10)" />
              <text x="55"  y="50" fill="rgba(255,255,255,.5)" fontSize="9">Total Users</text>
              <text x="55"  y="65" fill="#fff" fontSize="14" fontWeight="700">2,481</text>
              <text x="160" y="50" fill="rgba(255,255,255,.5)" fontSize="9">Revenue</text>
              <text x="160" y="65" fill="#FF747C" fontSize="14" fontWeight="700">R 48k</text>
              <text x="262" y="50" fill="rgba(255,255,255,.5)" fontSize="9">Active</text>
              <text x="262" y="65" fill="#fff" fontSize="14" fontWeight="700">94%</text>
            </svg>
          </div>
        </div>

      </div>

      {/* ── Right form panel ── */}
      <div className="lp-form-panel">
        <div className="lp-form-wrap">
          <h1 className="lp-form__heading">Admin Login</h1>
          <p className="lp-form__sub">This area is restricted to authorised administrators only.</p>

          <div className="lp-restricted">
            <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Unauthorised access is strictly prohibited.</span>
          </div>

          <form onSubmit={handleSubmit} noValidate className="lp-form">
            <div className="lp-field">
              <label className="lp-label" htmlFor="email">Email address</label>
              <input
                id="email" type="email"
                className={`lp-input${errors.email ? ' lp-input--err' : ''}`}
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                autoComplete="email"
                placeholder="admin@aicofounder.dev"
              />
              {errors.email && <p className="lp-err">{errors.email}</p>}
            </div>

            <div className="lp-field">
              <label className="lp-label" htmlFor="password">Password</label>
              <div className="lp-pw-wrap">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  className={`lp-input${errors.password ? ' lp-input--err' : ''}`}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button type="button" className="lp-pw-toggle" onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="lp-err">{errors.password}</p>}
            </div>

            <div className="lp-remember">
              <label className="lp-check">
                <input type="checkbox" checked={form.remember}
                  onChange={e => setForm(f => ({ ...f, remember: e.target.checked }))} />
                <span>Remember me</span>
              </label>
            </div>

            <button type="submit" className="lp-btn" disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> Signing in…</> : 'Sign In'}
            </button>

            {apiError && (
              <div className="lp-api-err">
                <AlertCircle size={15} /> {apiError}
              </div>
            )}
          </form>

        </div>
      </div>
    </div>
  );
}
