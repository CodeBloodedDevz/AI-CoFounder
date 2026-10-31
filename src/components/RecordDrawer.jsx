// src/components/RecordDrawer.jsx
// Side panel for editing a record or confirming a delete. Uses the same panel styles as the
// user details panel, so every form in the portal looks the same.
import { useState } from 'react';
import { X } from 'lucide-react';
import '../pages/Users.css';
import '../pages/Settings.css';
import './RecordDrawer.css';

/**
 * fields: [{ key, label, type: 'text'|'number'|'date'|'select'|'textarea'|'email', options, hint }]
 * onSave(values) -> Promise; throw to show the error in the panel.
 */
export function RecordDrawer({ title, fields, initial, onSave, onClose, saveLabel = 'Save changes' }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(f => [f.key, initial?.[f.key] ?? ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    // Only send what changed, so nothing else is touched.
    const changed = Object.fromEntries(
      Object.entries(values).filter(([k, v]) => String(v ?? '') !== String(initial?.[k] ?? ''))
    );
    try {
      if (Object.keys(changed).length) await onSave(changed);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  return (
    <div className="user-detail-overlay" onClick={onClose}>
      <div className="user-detail-panel" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <button className="user-detail-panel__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <h2>{title}</h2>
        {error && <div className="drawer__error" role="alert">{error}</div>}
        <form className="drawer__form" onSubmit={submit} noValidate>
          {fields.map(f => (
            <div key={f.key} className="settings__field">
              <label className="settings__label" htmlFor={`f-${f.key}`}>{f.label}</label>
              {f.type === 'select' ? (
                <select id={`f-${f.key}`} className="settings__input" value={values[f.key]} onChange={set(f.key)}>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea id={`f-${f.key}`} className="settings__input drawer__textarea" value={values[f.key]} onChange={set(f.key)} />
              ) : (
                <input
                  id={`f-${f.key}`}
                  className="settings__input"
                  type={f.type === 'number' ? 'text' : f.type || 'text'}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  value={values[f.key]}
                  onChange={set(f.key)}
                />
              )}
              {f.hint && <div className="drawer__hint">{f.hint}</div>}
            </div>
          ))}
          <div className="drawer__actions">
            <button type="submit" className="drawer__btn drawer__btn--primary" disabled={saving}>{saving ? 'Saving…' : saveLabel}</button>
            <button type="button" className="drawer__btn drawer__btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** "Are you sure?" panel. onConfirm -> Promise; throw to show the error. */
export function ConfirmDrawer({ title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <div className="user-detail-overlay" onClick={onClose}>
      <div className="user-detail-panel" onClick={e => e.stopPropagation()} role="alertdialog" aria-label={title}>
        <button className="user-detail-panel__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <h2>{title}</h2>
        {error && <div className="drawer__error" role="alert">{error}</div>}
        <p className="drawer__text">{message}</p>
        <div className="drawer__actions">
          <button className="drawer__btn drawer__btn--danger" onClick={go} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
          <button className="drawer__btn drawer__btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
