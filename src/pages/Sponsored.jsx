// src/pages/Sponsored.jsx — the Sponsored page's adverts: review queue, every advert, advertising payments,
// packages and prices, and how adverts perform. Every decision is made by the backend with the app's own rules
// (backend/src/lib/sponsored.js): an advert can only go live once a confirmed payment (or the Premium
// allowance) covers it, and every action is written to the audit log.
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, TriangleAlert, Info, Flag, Wallet, Megaphone, Clock, Check } from 'lucide-react';
import AdminLayout from '../layouts/AdminLayout.jsx';
import Card from '../components/Card.jsx';
import Table from '../components/Table.jsx';
import Badge from '../components/Badge.jsx';
import StatCard from '../components/StatCard.jsx';
import Pagination from '../components/Pagination.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useAsync, useDebounced } from '../hooks/useAsync.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { sponsoredService } from '../services/sponsoredService.js';
import { money, dateTime, timeAgo, PAYMENT_LABEL } from '../utils/format.js';
import '../components/RecordDrawer.css';
import './Users.css';
import './Settings.css';
import './Subscriptions.css';
import './Sponsored.css';

const STATUS_LABEL = {
  pending_review: 'Waiting for review', awaiting_payment: 'Awaiting payment', active: 'Live', scheduled: 'Scheduled',
  expired: 'Ended', rejected: 'Rejected', suspended: 'Suspended', removed: 'Removed', withdrawn: 'Withdrawn',
  account_suspended: 'Account suspended', approved: 'Approved',
};
const PLACEMENT_LABEL = { standard: 'Standard', featured: 'Featured', priority: 'Priority' };
const EVENT_LABEL = {
  created: 'Created', renewal_created: 'Renewal created', submitted: 'Sent for review', resubmitted: 'Fixed and resubmitted',
  edited: 'Edited', changes_submitted: 'Changes sent for review', approved: 'Approved', rejected: 'Rejected',
  suspended: 'Suspended', reinstated: 'Reinstated', removed: 'Removed', withdrawn: 'Withdrawn by owner',
  changes_approved: 'Changes approved', changes_rejected: 'Changes rejected', expired: 'Campaign ended',
  closed_unpaid: 'Closed (not paid)', refunded: 'Payment refunded', paid_after_close: 'Paid after closing',
};
const REPORT_LABEL = { misleading: 'Misleading', inappropriate: 'Inappropriate', spam: 'Spam', impersonation: 'Pretending to be another business', other: 'Other' };
// Reasons admins give most often; clicking one fills the reason box (it can still be edited).
const REASON_TEMPLATES = [
  'The advert makes claims we could not verify. Please remove or support them.',
  'The picture is unclear or not suitable. Please upload a clear photo of your product or logo.',
  "The advert uses another company's name or logo. Please only use your own branding.",
  "The contact details don't work. Please check your WhatsApp number or website.",
  "The description doesn't match the business. Please describe what you actually offer.",
];

const statusBadge = (s) => <Badge status={s} label={STATUS_LABEL[s] || s} />;
const day = (v) => (v ? new Date(v).toLocaleDateString('en-ZA', { dateStyle: 'medium' }) : '—');

/* ---------------------------------------------------------------- review panel */

function AdPreview({ title, description, imageUrl, business, logoUrl, placement }) {
  return (
    <div className={`sp-preview sp-preview--${placement}`}>
      {imageUrl ? <img className="sp-preview__img" src={imageUrl} alt="" /> : <div className="sp-preview__img sp-preview__img--empty">No picture</div>}
      <div className="sp-preview__body">
        <div className="sp-preview__biz">
          {logoUrl ? <img src={logoUrl} alt="" /> : <span>{(business || '?').slice(0, 2).toUpperCase()}</span>}
          <strong>{business}</strong>
          {placement !== 'standard' && <Badge status={placement} label={PLACEMENT_LABEL[placement]} />}
        </div>
        <div className="sp-preview__title">{title}</div>
        <p className="sp-preview__desc">{description}</p>
        <div className="sp-preview__cta">Learn More</div>
      </div>
    </div>
  );
}

function Flags({ flags, problems }) {
  if (!flags?.length && !problems?.length) return <p className="sp-ok"><Check size={14} /> No automatic warnings. Still read the advert and the business page.</p>;
  return (
    <ul className="sp-flags">
      {(problems || []).map(p => <li key={p} className="sp-flag sp-flag--warning"><TriangleAlert size={14} /> {p}</li>)}
      {(flags || []).map(f => (
        <li key={f.code} className={`sp-flag sp-flag--${f.level}`}>
          {f.level === 'warning' ? <TriangleAlert size={14} /> : <Info size={14} />} {f.message}
        </li>
      ))}
    </ul>
  );
}

const PAGE_FIELDS = [
  ['displayName', 'Business name'], ['about', 'About'], ['category', 'Category'], ['location', 'Location'], ['hours', 'Hours'],
  ['whatsapp', 'WhatsApp'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website'], ['instagram', 'Instagram'], ['facebook', 'Facebook'],
];

function pageValue(key, v) {
  if (!v) return <span className="sp-muted">—</span>;
  if (['website', 'instagram', 'facebook'].includes(key)) return <a href={v} target="_blank" rel="noopener noreferrer nofollow" className="action-link">{v}</a>;
  if (key === 'whatsapp') return <a href={`https://wa.me/${v}`} target="_blank" rel="noopener noreferrer" className="action-link">+{v}</a>;
  if (key === 'phone') return `+${v}`;
  return v;
}

/** The business page: the version under review next to what is live now (changed fields highlighted). */
function BusinessPage({ published, draft }) {
  const shown = draft || published;
  if (!shown) return <p className="sp-muted">The business has not filled in its page.</p>;
  const comparing = Boolean(draft && published);
  return (
    <div className="sp-page">
      {shown.logoUrl && (
        <div className="sp-page__logo">
          <img src={shown.logoUrl} alt="Logo" />
          {comparing && published.logoUrl !== draft.logoUrl && <span className="sp-changed">New logo</span>}
        </div>
      )}
      <dl className="sp-dl">
        {PAGE_FIELDS.map(([k, label]) => {
          const changed = comparing && (published[k] || '') !== (draft[k] || '');
          if (!shown[k] && !changed) return null;
          return (
            <div key={k} className={changed ? 'sp-dl__row sp-dl__row--changed' : 'sp-dl__row'}>
              <dt>{label}</dt>
              <dd>
                {pageValue(k, shown[k])}
                {changed && <div className="sp-was">Live now: {published[k] ? pageValue(k, published[k]) : 'empty'}</div>}
              </dd>
            </div>
          );
        })}
      </dl>
      {shown.offerings?.length > 0 && (
        <>
          <div className="sp-subhead">Products & services</div>
          <ul className="sp-offerings">
            {shown.offerings.map(o => <li key={o.name}>{o.name}{o.price != null && <span> · {money(o.price)}</span>}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function ReasonBox({ label, confirmLabel, tone = 'danger', onConfirm, onCancel, busy }) {
  const [reason, setReason] = useState('');
  return (
    <div className="sp-reason">
      <label className="settings__label" htmlFor="sp-reason">{label}</label>
      <div className="sp-templates">
        {REASON_TEMPLATES.map(t => <button key={t} type="button" className="sp-chip" onClick={() => setReason(t)}>{t.split('.')[0]}</button>)}
      </div>
      <textarea id="sp-reason" className="settings__input drawer__textarea" value={reason} onChange={e => setReason(e.target.value)} placeholder="The business owner sees this message." />
      <div className="drawer__actions">
        <button className={`drawer__btn drawer__btn--${tone}`} disabled={busy || reason.trim().length < 5} onClick={() => onConfirm(reason.trim())}>{busy ? 'Working…' : confirmLabel}</button>
        <button className="drawer__btn drawer__btn--ghost" onClick={onCancel} disabled={busy}>Back</button>
      </div>
    </div>
  );
}

function AdReviewPanel({ id, onClose, onChanged }) {
  const detail = useAsync(useCallback(() => sponsoredService.getAd(id), [id]));
  const [mode, setMode] = useState(null); // reject | suspend | remove | rejectChanges
  const [startDate, setStartDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function run(action, body, message) {
    setBusy(true);
    setError('');
    try {
      await sponsoredService.adAction(id, action, body);
      setDone(message);
      setMode(null);
      await detail.refetch({ silent: true });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const d = detail.data;
  const ad = d?.ad;
  const page = d?.profile;
  const pageForCard = page?.draft || page?.published || {};
  const status = ad?.status;
  const live = status === 'active' || status === 'scheduled';

  return (
    <div className="user-detail-overlay" onClick={onClose}>
      <div className="user-detail-panel sp-panel" onClick={e => e.stopPropagation()} role="dialog" aria-label="Review advert">
        <button className="user-detail-panel__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {detail.loading ? <LoadingSpinner /> : detail.error ? <ErrorMessage message={detail.error} /> : (
          <>
            <div className="sp-panel__head">
              <h2>{ad.title}</h2>
              <div className="sp-panel__badges">
                {statusBadge(status)}
                {ad.changesPending && <Badge status="pending" label="Changes waiting" />}
                <Badge status={ad.placement} label={`${PLACEMENT_LABEL[ad.placement]} · ${ad.durationDays} days`} />
                <Badge status={ad.funding} label={ad.funding === 'included' ? 'Included with Premium' : money(ad.price)} />
              </div>
            </div>
            {error && <div className="drawer__error" role="alert">{error}</div>}
            {done && <div className="sp-done" role="status"><Check size={14} /> {done}</div>}

            {/* ---- decisions ---- */}
            <section className="sp-actions">
              {mode === 'reject' && <ReasonBox label="Why is it rejected?" confirmLabel="Reject advert" busy={busy} onCancel={() => setMode(null)} onConfirm={r => run('reject', { reason: r }, 'Rejected. The owner can fix it and resubmit without paying again.')} />}
              {mode === 'rejectChanges' && <ReasonBox label="Why are the changes rejected?" confirmLabel="Reject changes" busy={busy} onCancel={() => setMode(null)} onConfirm={r => run('changes/reject', { reason: r }, 'Changes rejected. The approved version stays live.')} />}
              {mode === 'suspend' && <ReasonBox label="Why is it suspended?" confirmLabel="Suspend advert" busy={busy} onCancel={() => setMode(null)} onConfirm={r => run('suspend', { reason: r }, 'Suspended. It is hidden from the Sponsored page.')} />}
              {mode === 'remove' && <ReasonBox label="Why is it removed? (This can't be undone.)" confirmLabel="Remove advert" busy={busy} onCancel={() => setMode(null)} onConfirm={r => run('remove', { reason: r }, 'Removed.')} />}
              {!mode && (
                <div className="sp-actions__row">
                  {status === 'pending_review' && (
                    <>
                      <label className="sp-start">
                        Start
                        <input type="date" value={startDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setStartDate(e.target.value)} />
                      </label>
                      <button className="drawer__btn drawer__btn--primary" disabled={busy || page?.problems?.length > 0} title={page?.problems?.length ? 'The business page is incomplete' : ''}
                        onClick={() => run('approve', startDate ? { startsAt: `${startDate}T06:00:00+02:00` } : {}, 'Approved. It goes live on its start date and ends automatically.')}>
                        {busy ? 'Working…' : startDate ? 'Approve and schedule' : 'Approve and publish now'}
                      </button>
                      <button className="drawer__btn drawer__btn--danger" onClick={() => setMode('reject')}>Reject</button>
                    </>
                  )}
                  {ad.changesPending && (
                    <>
                      <button className="drawer__btn drawer__btn--primary" disabled={busy} onClick={() => run('changes/approve', {}, 'Changes approved and live.')}>Approve changes</button>
                      <button className="drawer__btn drawer__btn--danger" onClick={() => setMode('rejectChanges')}>Reject changes</button>
                    </>
                  )}
                  {live && <button className="drawer__btn drawer__btn--ghost" onClick={() => setMode('suspend')}>Suspend</button>}
                  {status === 'suspended' && <button className="drawer__btn drawer__btn--primary" disabled={busy} onClick={() => run('reinstate', {}, 'Reinstated.')}>Reinstate</button>}
                  {['awaiting_payment', 'pending_review', 'rejected', 'active', 'scheduled', 'suspended'].includes(status) && (
                    <button className="drawer__btn drawer__btn--ghost sp-remove" onClick={() => setMode('remove')}>Remove</button>
                  )}
                </div>
              )}
              {status === 'pending_review' && !d.orders.some(o => o.status === 'success') && (
                <p className="sp-warn"><TriangleAlert size={14} /> No confirmed payment: approving will be refused.</p>
              )}
            </section>

            <section>
              <div className="sp-subhead">Automatic checks</div>
              <Flags flags={d.flags} problems={page?.problems} />
            </section>

            <section className="sp-grid2">
              <div>
                <div className="sp-subhead">{d.changes ? 'Live now' : 'As shown in the app'}</div>
                <AdPreview title={ad.title} description={ad.description} imageUrl={ad.imageUrl} business={pageForCard.displayName || ad.business} logoUrl={pageForCard.logoUrl} placement={ad.placement} />
              </div>
              {d.changes && (
                <div>
                  <div className="sp-subhead">Proposed changes</div>
                  <AdPreview title={d.changes.title ?? ad.title} description={d.changes.description ?? ad.description} imageUrl={d.changes.imageUrl !== undefined ? d.changes.imageUrl : ad.imageUrl} business={pageForCard.displayName || ad.business} logoUrl={pageForCard.logoUrl} placement={ad.placement} />
                </div>
              )}
            </section>
            {ad.reviewNote && <p className="sp-note"><strong>Last note to the owner:</strong> {ad.reviewNote}</p>}

            <section>
              <div className="sp-subhead">
                Business page {page.draft && page.published ? <Badge status="pending" label="Changes under review" /> : page.draft ? <Badge status="pending" label="First version" /> : null}
              </div>
              <BusinessPage published={page.published} draft={page.draft} />
            </section>

            <section className="sp-grid2">
              <div>
                <div className="sp-subhead">Registered business</div>
                {d.registeredBusiness ? (
                  <dl className="sp-dl sp-dl--compact">
                    <div className="sp-dl__row"><dt>Name</dt><dd>{d.registeredBusiness.name || '—'}</dd></div>
                    <div className="sp-dl__row"><dt>Type</dt><dd>{d.registeredBusiness.type || '—'}</dd></div>
                    <div className="sp-dl__row"><dt>Location</dt><dd>{d.registeredBusiness.location || '—'}</dd></div>
                  </dl>
                ) : <p className="sp-muted">Unknown</p>}
              </div>
              <div>
                <div className="sp-subhead">Owner</div>
                {d.owner ? (
                  <dl className="sp-dl sp-dl--compact">
                    <div className="sp-dl__row"><dt>Name</dt><dd><Link className="action-link" to={`/users/${d.owner.id}`}>{d.owner.name}</Link></dd></div>
                    <div className="sp-dl__row"><dt>Email</dt><dd>{d.owner.email}</dd></div>
                    <div className="sp-dl__row"><dt>Plan</dt><dd>{d.owner.plan}</dd></div>
                    <div className="sp-dl__row"><dt>Account</dt><dd><Badge status={d.owner.status} /></dd></div>
                  </dl>
                ) : <p className="sp-muted">Unknown</p>}
              </div>
            </section>

            <section>
              <div className="sp-subhead">Campaign</div>
              <dl className="sp-dl sp-dl--compact">
                <div className="sp-dl__row"><dt>Package</dt><dd>{ad.packageId} · {PLACEMENT_LABEL[ad.placement]} placement · {ad.durationDays} days</dd></div>
                <div className="sp-dl__row"><dt>Sent for review</dt><dd>{dateTime(ad.submittedAt)}</dd></div>
                <div className="sp-dl__row"><dt>Runs</dt><dd>{ad.startsAt ? `${day(ad.startsAt)} – ${day(ad.endsAt)}${ad.daysLeft != null && live ? ` (${ad.daysLeft} days left)` : ''}` : 'Starts when approved'}</dd></div>
                {ad.renewedFrom && <div className="sp-dl__row"><dt>Renewal of</dt><dd>an earlier advert (starts when that one ends)</dd></div>}
              </dl>
            </section>

            <section>
              <div className="sp-subhead">Payments</div>
              {d.orders.length === 0 ? <p className="sp-muted">None yet.</p> : (
                <ul className="sp-list">
                  {d.orders.map(o => (
                    <li key={o.reference}>
                      <Badge status={o.status} label={PAYMENT_LABEL[o.status] || o.status} />
                      <span>{o.kind === 'included' ? 'Premium allowance' : money(o.amount)}</span>
                      <code>{o.reference}</code>
                      {o.refundStatus !== 'none' && <Badge status={o.refundStatus} label={o.refundStatus === 'requested' ? 'Refund requested' : 'Refunded'} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(d.stats.totals.impressions > 0 || live || status === 'expired') && (
              <section>
                <div className="sp-subhead">Performance</div>
                <div className="sp-mini-stats">
                  <div><strong>{d.stats.totals.impressions}</strong><span>Views</span></div>
                  <div><strong>{d.stats.totals.clicks}</strong><span>Learn More</span></div>
                  <div><strong>{d.stats.totals.pageViews}</strong><span>Page visits</span></div>
                  <div><strong>{d.stats.totals.contacts}</strong><span>Contacts</span></div>
                  <div><strong>{d.stats.totals.clickRate == null ? '—' : `${d.stats.totals.clickRate}%`}</strong><span>Click rate</span></div>
                </div>
              </section>
            )}

            {d.reports.length > 0 && (
              <section>
                <div className="sp-subhead">Reports from users</div>
                <ul className="sp-list">
                  {d.reports.map(r => (
                    <li key={r.id}><Flag size={13} /> <strong>{REPORT_LABEL[r.reason]}</strong>{r.details && <span>“{r.details}”</span>}<Badge status={r.status} /><span className="sp-muted">{timeAgo(r.created_at)}</span></li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <div className="sp-subhead">History</div>
              <ol className="sp-history">
                {d.history.map((h, i) => (
                  <li key={i}>
                    <span className="sp-history__what">{EVENT_LABEL[h.action] || h.action}</span>
                    <span className="sp-muted">{dateTime(h.at)}{h.by ? ` · ${h.by}` : h.actor === 'owner' ? ' · owner' : ''}</span>
                    {h.note && <div className="sp-history__note">{h.note}</div>}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- review queue */

function QueueCard({ ad, onOpen, kind }) {
  return (
    <button className="sp-qcard" onClick={() => onOpen(ad.id)}>
      {ad.imageUrl ? <img src={ad.imageUrl} alt="" className="sp-qcard__img" /> : <div className="sp-qcard__img sp-qcard__img--empty"><Megaphone size={18} /></div>}
      <div className="sp-qcard__body">
        <div className="sp-qcard__title">{ad.title}</div>
        <div className="sp-qcard__meta">{ad.business} · {ad.categoryLabel}</div>
        <div className="sp-qcard__tags">
          <Badge status={ad.placement} label={PLACEMENT_LABEL[ad.placement]} />
          <Badge status={ad.funding} label={ad.funding === 'included' ? 'Premium allowance' : money(ad.price)} />
          {ad.reports > 0 && <Badge status="failed" label={`${ad.reports} report${ad.reports === 1 ? '' : 's'}`} />}
        </div>
      </div>
      <div className="sp-qcard__time"><Clock size={12} /> {kind === 'changes' ? 'Changed' : 'Sent'} {timeAgo(ad.submittedAt || ad.createdAt)}</div>
    </button>
  );
}

function ProfileReview({ item, onDone }) {
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(decision, reason) {
    setBusy(true);
    setError('');
    try {
      await sponsoredService.decideProfile(item.businessId, decision, reason ? { reason } : {});
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <div className="sp-profile">
      <div className="sp-profile__head">
        <div>
          <strong>{item.draft?.displayName || item.registeredName}</strong>
          <div className="sp-muted">Registered as {item.registeredName || '—'} · {item.ownerId ? <Link className="action-link" to={`/users/${item.ownerId}`}>{item.ownerEmail}</Link> : item.ownerEmail} · {timeAgo(item.submittedAt)}</div>
        </div>
        {!rejecting && (
          <div className="action-group">
            <button className="action-btn" disabled={busy || item.problems.length > 0} onClick={() => decide('approve')}>Approve</button>
            <button className="action-btn action-btn--danger" onClick={() => setRejecting(true)}>Reject</button>
          </div>
        )}
      </div>
      {error && <div className="drawer__error">{error}</div>}
      <Flags flags={item.flags} problems={item.problems} />
      <BusinessPage published={item.published} draft={item.draft} />
      {rejecting && <ReasonBox label="Why are these page changes rejected?" confirmLabel="Reject changes" busy={busy} onCancel={() => setRejecting(false)} onConfirm={r => decide('reject', r)} />}
    </div>
  );
}

function QueueTab({ onOpen, version, onChanged }) {
  const review = useAsync(useCallback(() => sponsoredService.listAds({ status: 'review', limit: 50 }), [version]));
  const changes = useAsync(useCallback(() => sponsoredService.listAds({ status: 'changes', limit: 50 }), [version]));
  const profiles = useAsync(useCallback(() => sponsoredService.listProfiles({ limit: 20 }), [version]));
  const reports = useAsync(useCallback(() => sponsoredService.listReports({ status: 'open', limit: 20 }), [version]));
  const [reportError, setReportError] = useState('');

  async function decideReport(id, decision) {
    setReportError('');
    try {
      await sponsoredService.decideReport(id, decision);
      reports.refetch({ silent: true });
      onChanged();
    } catch (err) {
      setReportError(err.message);
    }
  }

  const empty = !review.loading && !changes.loading && !profiles.loading && !reports.loading &&
    !review.data?.total && !changes.data?.total && !profiles.data?.total && !reports.data?.total && !review.error;

  if (review.error) return <ErrorMessage message={review.error} />;
  if (empty) return <Card><p className="sp-empty"><Check size={18} /> Nothing waiting. New adverts appear here as soon as they are paid for.</p></Card>;

  return (
    <div className="sp-queue">
      <Card title={`Adverts to review${review.data ? ` (${review.data.total})` : ''}`}>
        {review.loading ? <LoadingSpinner /> : review.data.total === 0 ? <p className="sp-muted">No new adverts.</p> : (
          <div className="sp-qgrid">{review.data.ads.map(a => <QueueCard key={a.id} ad={a} onOpen={onOpen} />)}</div>
        )}
        <p className="sp-hint">Oldest first. Only paid adverts (or Premium allowances) reach this list.</p>
      </Card>

      {(changes.data?.total > 0) && (
        <Card title={`Changes to live adverts (${changes.data.total})`}>
          <div className="sp-qgrid">{changes.data.ads.map(a => <QueueCard key={a.id} ad={a} onOpen={onOpen} kind="changes" />)}</div>
          <p className="sp-hint">The approved version stays live until you accept the changes.</p>
        </Card>
      )}

      {(profiles.data?.total > 0) && (
        <Card title={`Business page updates (${profiles.data.total})`}>
          {profiles.data.profiles.map(p => <ProfileReview key={p.businessId} item={p} onDone={() => { profiles.refetch({ silent: true }); onChanged(); }} />)}
        </Card>
      )}

      {(reports.data?.total > 0) && (
        <Card title={`Reports from users (${reports.data.total})`}>
          {reportError && <div className="drawer__error">{reportError}</div>}
          <Table
            columns={[
              { key: 'adTitle', label: 'Advert', render: r => <button className="sp-linkbtn" onClick={() => onOpen(r.ad_id)}>{r.adTitle || 'Advert'}</button> },
              { key: 'business', label: 'Business' },
              { key: 'reason', label: 'Reason', render: r => <><strong>{REPORT_LABEL[r.reason]}</strong>{r.details && <div className="sp-muted">“{r.details}”</div>}</> },
              { key: 'adStatus', label: 'Advert status', render: r => r.adStatus ? statusBadge(r.adStatus) : '—' },
              { key: 'created_at', label: 'Reported', render: r => timeAgo(r.created_at) },
              { key: 'actions', label: '', render: r => (
                <div className="action-group">
                  <button className="action-btn" onClick={() => decideReport(r.id, 'actioned')}>Dealt with</button>
                  <button className="action-btn" onClick={() => decideReport(r.id, 'dismiss')}>Dismiss</button>
                </div>
              ) },
            ]}
            rows={reports.data.reports}
          />
          <p className="sp-hint">Open the advert to suspend or remove it, then mark the report as dealt with.</p>
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- all adverts */

function AdsTab({ onOpen, version, categories }) {
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useDebounced(search);
  const ads = useAsync(useCallback(() => sponsoredService.listAds({ status, category, search: query, page, limit: 10 }), [status, category, query, page, version]));

  const cols = [
    { key: 'title', label: 'Advert', render: r => (
      <button className="sp-adcell" onClick={() => onOpen(r.id)}>
        {r.imageUrl ? <img src={r.imageUrl} alt="" /> : <span className="sp-adcell__empty"><Megaphone size={14} /></span>}
        <span><strong>{r.title}</strong><small>{r.categoryLabel}</small></span>
      </button>
    ) },
    { key: 'business', label: 'Business', render: r => <>{r.business}<div className="sp-muted">{r.ownerEmail}</div></> },
    { key: 'placement', label: 'Package', render: r => <><Badge status={r.placement} label={PLACEMENT_LABEL[r.placement]} /><div className="sp-muted">{r.funding === 'included' ? 'Premium allowance' : money(r.price)}</div></> },
    { key: 'status', label: 'Status', render: r => <>{statusBadge(r.status)}{r.changesPending && <div><Badge status="pending" label="Changes waiting" /></div>}</> },
    { key: 'runs', label: 'Runs', render: r => r.startsAt ? <>{day(r.startsAt)} – {day(r.endsAt)}{r.status === 'active' && <div className="sp-muted">{r.daysLeft} days left</div>}</> : '—' },
    { key: 'reports', label: 'Reports', render: r => r.reports ? <Badge status="failed" label={r.reports} /> : '—' },
    { key: 'actions', label: '', render: r => <button className="action-btn" onClick={() => onOpen(r.id)}>{r.status === 'pending_review' ? 'Review' : 'Open'}</button> },
  ];

  return (
    <Card>
      <div className="subs__toolbar">
        <div className="subs__search">
          <Search size={14} className="subs__search-icon" />
          <input placeholder="Search adverts, businesses or owners…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="subs__select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="all">All statuses</option>
          <option value="review">Waiting for review</option>
          <option value="changes">Changes waiting</option>
          <option value="active">Live</option>
          <option value="scheduled">Scheduled</option>
          <option value="awaiting_payment">Awaiting payment</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
          <option value="expired">Ended</option>
          <option value="removed">Removed</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <select className="subs__select" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
          <option value="all">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      {ads.loading ? <LoadingSpinner /> : ads.error ? <ErrorMessage message={ads.error} /> : (
        <>
          <Table columns={cols} rows={ads.data.ads} emptyMessage={query || status !== 'all' || category !== 'all' ? 'No adverts match your filters.' : 'No adverts yet.'} />
          <Pagination page={ads.data.page} totalPages={ads.data.totalPages} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- payments */

function PaymentsTab({ version, onChanged }) {
  const { admin } = useAuth();
  const isSuper = admin?.role === 'super_admin';
  const [status, setStatus] = useState('all');
  const [refund, setRefund] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const query = useDebounced(search);
  const orders = useAsync(useCallback(() => sponsoredService.listOrders({ status, refund, search: query, page, limit: 10 }), [status, refund, query, page, version]));

  async function act(reference, fn) {
    setBusy(reference);
    setError('');
    try {
      await fn(reference);
      orders.refetch({ silent: true });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const cols = [
    { key: 'id', label: 'Ref', render: r => <code className="sp-ref">{r.id}</code> },
    { key: 'adTitle', label: 'Advert' },
    { key: 'user', label: 'Paid by', render: r => r.userId ? <Link className="action-link" to={`/users/${r.userId}`}>{r.user}</Link> : r.user },
    { key: 'amount', label: 'Amount', render: r => r.kind === 'included' ? <Badge status="included" label="Premium allowance" /> : money(r.amount) },
    { key: 'status', label: 'Status', render: r => <span title={r.failureReason || ''}><Badge status={r.status} label={PAYMENT_LABEL[r.status]} /></span> },
    { key: 'refund', label: 'Refund', render: r => r.refundStatus === 'none' ? '—' : <Badge status={r.refundStatus} label={r.refundStatus === 'requested' ? 'Requested' : 'Refunded'} /> },
    { key: 'mode', label: 'Mode', render: r => r.mode ? <Badge status={r.mode} /> : '—' },
    { key: 'date', label: 'Date' },
    { key: 'actions', label: '', render: r => (
      <div className="action-group">
        {r.status === 'pending' && <button className="action-btn" disabled={busy === r.id} onClick={() => act(r.id, sponsoredService.verifyOrder)}>{busy === r.id ? 'Checking…' : 'Re-check'}</button>}
        {isSuper && r.kind === 'paid' && r.status === 'success' && (
          <button className="action-btn action-btn--danger" disabled={busy === r.id} title="Use after refunding in the Paystack dashboard"
            onClick={() => { if (window.confirm(`Mark ${r.id} as refunded? The advert it paid for stops.`)) act(r.id, sponsoredService.markRefunded); }}>Mark refunded</button>
        )}
      </div>
    ) },
  ];

  return (
    <Card>
      <p className="sp-hint sp-hint--top">Refunds are made in the Paystack dashboard. Paystack then tells the backend automatically; you can also mark a payment as refunded here. Either way, the advert it paid for stops.</p>
      <div className="subs__toolbar">
        <div className="subs__search">
          <Search size={14} className="subs__search-icon" />
          <input placeholder="Search by email or reference…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="subs__select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="all">All statuses</option>
          {Object.entries(PAYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="subs__select" value={refund} onChange={e => { setRefund(e.target.value); setPage(1); }}>
          <option value="all">Any refund state</option>
          <option value="requested">Refund requested</option>
        </select>
      </div>
      {error && <div className="drawer__error">{error}</div>}
      {orders.loading ? <LoadingSpinner /> : orders.error ? <ErrorMessage message={orders.error} /> : (
        <>
          <Table columns={cols} rows={orders.data.orders} emptyMessage="No advertising payments match." />
          <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- packages */

function PackageCard({ pkg, sales, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name: pkg.name, description: pkg.description, price: String(pkg.price), durationDays: String(pkg.durationDays), placement: pkg.placement, active: pkg.active });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...values };
      if (pkg.included) delete body.price;
      await sponsoredService.updatePackage(pkg.id, body);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`plan-card sp-pkg sp-pkg--${pkg.placement}${pkg.active ? '' : ' sp-pkg--off'}`}>
      {!editing ? (
        <>
          <div className="sp-pkg__top">
            <div className="plan-card__name">{pkg.name}</div>
            {!pkg.active && <Badge status="expired" label="Not on sale" />}
          </div>
          <div className="plan-card__price">{pkg.included ? 'Included' : money(pkg.price)}</div>
          <div className="plan-card__subs">{pkg.durationDays} days · {PLACEMENT_LABEL[pkg.placement]} placement</div>
          <p className="sp-pkg__desc">{pkg.description}</p>
          {!pkg.included && <div className="sp-muted">{sales?.sold || 0} sold · {money(sales?.revenue || 0)}</div>}
          {pkg.included && <div className="sp-muted">One a month for Premium subscribers</div>}
          {canEdit && <button className="action-btn sp-pkg__edit" onClick={() => setEditing(true)}>Edit</button>}
        </>
      ) : (
        <form onSubmit={save} className="drawer__form">
          {error && <div className="drawer__error">{error}</div>}
          <label className="settings__label">Name<input className="settings__input" value={values.name} onChange={set('name')} /></label>
          <label className="settings__label">Description<textarea className="settings__input drawer__textarea" value={values.description} onChange={set('description')} /></label>
          {!pkg.included && <label className="settings__label">Price (R)<input className="settings__input" inputMode="decimal" value={values.price} onChange={set('price')} /></label>}
          <label className="settings__label">Days<input className="settings__input" inputMode="numeric" value={values.durationDays} onChange={set('durationDays')} /></label>
          <label className="settings__label">Placement
            <select className="settings__input" value={values.placement} onChange={set('placement')}>
              <option value="standard">Standard</option><option value="featured">Featured</option><option value="priority">Priority</option>
            </select>
          </label>
          <label className="sp-check"><input type="checkbox" checked={values.active} onChange={set('active')} /> {pkg.included ? 'Premium allowance available' : 'On sale'}</label>
          <div className="drawer__actions">
            <button type="submit" className="drawer__btn drawer__btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save package'}</button>
            <button type="button" className="drawer__btn drawer__btn--ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

function PackagesTab({ summary, onChanged }) {
  const { admin } = useAuth();
  const pkgs = useAsync(useCallback(() => sponsoredService.getPackages(), []));
  const sales = new Map((summary?.packages || []).map(p => [p.id, p]));
  return (
    <>
      <p className="sp-hint sp-hint--top">
        Changes apply to new purchases only: running campaigns keep the price, days and placement they were bought with.
        {admin?.role !== 'super_admin' && ' Only super admins can change packages.'}
      </p>
      {pkgs.loading ? <LoadingSpinner /> : pkgs.error ? <ErrorMessage message={pkgs.error} /> : (
        <div className="subs__plans">
          {pkgs.data.map(p => <PackageCard key={p.id} pkg={p} sales={sales.get(p.id)} canEdit={admin?.role === 'super_admin'} onSaved={() => { pkgs.refetch({ silent: true }); onChanged(); }} />)}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- performance */

function PerformanceTab({ summary }) {
  const rows = summary?.engagement || [];
  return (
    <Card title="Engagement by category (last 30 days)">
      <Table
        columns={[
          { key: 'label', label: 'Category' },
          { key: 'impressions', label: 'Views' },
          { key: 'clicks', label: 'Learn More taps' },
          { key: 'pageViews', label: 'Page visits' },
          { key: 'contacts', label: 'Contacts', render: r => <span title="WhatsApp, phone, email and website taps">{r.contacts}</span> },
          { key: 'clickRate', label: 'Click rate', render: r => r.clickRate == null ? '—' : `${r.clickRate}%` },
        ]}
        rows={rows.map(r => ({ ...r, id: r.category }))}
        emptyMessage="No views recorded yet."
      />
      <p className="sp-hint">Each person counts once per advert per day; owners viewing their own adverts are not counted.</p>
    </Card>
  );
}

/* ---------------------------------------------------------------- page */

export default function Sponsored() {
  const [tab, setTab] = useState('queue');
  const [openAd, setOpenAd] = useState(null);
  const [version, setVersion] = useState(0);
  const summary = useAsync(useCallback(() => sponsoredService.getSummary(), [version]));
  const changed = useCallback(() => setVersion(v => v + 1), []);
  const s = summary.data;
  const queueTotal = s ? s.queue.ads + s.queue.revisions + s.queue.profiles + s.queue.reports : 0;
  const categories = s?.categories || [];

  const TABS = [
    ['queue', `Review queue${queueTotal ? ` (${queueTotal})` : ''}`],
    ['ads', 'All adverts'],
    ['payments', 'Payments'],
    ['packages', 'Packages'],
    ['performance', 'Performance'],
  ];

  return (
    <AdminLayout pageTitle="Sponsored Adverts" pageSubtitle="Business adverts shown on the app's Sponsored page">
      {summary.error ? <ErrorMessage message={summary.error} /> : (
        <div className="dashboard__stats">
          <StatCard label="Live adverts" value={s ? s.live : '…'} icon={Megaphone} color="purple" />
          <StatCard label="Waiting for review" value={s ? s.queue.ads : '…'} icon={Clock} color={s?.queue.ads ? 'coral' : 'gray'} />
          <StatCard label="Advertising revenue this month" value={s ? money(s.revenue.thisMonth) : '…'} icon={Wallet} color="green" />
          <StatCard label="Refunds to make" value={s ? s.revenue.refundsRequested : '…'} icon={TriangleAlert} color={s?.revenue.refundsRequested ? 'coral' : 'gray'} />
        </div>
      )}
      {s && <p className="sp-hint sp-hint--top">All-time advertising revenue: {money(s.revenue.total)} from {s.revenue.paidCount} confirmed Paystack payment{s.revenue.paidCount === 1 ? '' : 's'}{s.revenue.mode === 'test' ? ' (test mode)' : ''}.</p>}

      <div className="subs__tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`subs__tab${tab === id ? ' subs__tab--active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'queue' && <QueueTab onOpen={setOpenAd} version={version} onChanged={changed} />}
      {tab === 'ads' && <AdsTab onOpen={setOpenAd} version={version} categories={categories} />}
      {tab === 'payments' && <PaymentsTab version={version} onChanged={changed} />}
      {tab === 'packages' && <PackagesTab summary={s} onChanged={changed} />}
      {tab === 'performance' && <PerformanceTab summary={s} />}

      {openAd && <AdReviewPanel id={openAd} onClose={() => setOpenAd(null)} onChanged={changed} />}
    </AdminLayout>
  );
}
