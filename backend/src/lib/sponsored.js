// The Sponsored page: everything that reads or writes its tables (backend/supabase/sponsored.sql).
// Used by the app's routes (routes/sponsored.js), the admin portal (admin/sponsored.js) and the payment
// code (lib/sponsoredPayments.js), so every path follows the same rules (lib/sponsoredRules.js):
//
//   • An advert is only ever shown while it is approved by an admin, paid for (or covered by the Premium
//     allowance), inside its campaign dates, and its owner's account is not suspended. That check runs in the
//     database query AND again in isLive() before anything is returned.
//   • Owners can only see and change their own business's adverts, page and statistics (every query is
//     filtered by the business the login belongs to). Admins act through admin/sponsored.js.
//   • Prices and durations come from sponsored_packages on the server; the app never sends an amount.

const crypto = require('node:crypto');
const supabase = require('../supabaseClient');
const rules = require('./sponsoredRules');
const { mediaBaseFor } = require('./sponsoredMedia');
const { ok, HttpError, badRequest, notFound, todayInSA, dbError, isUuid } = require('./http');

const T = {
  packages: 'sponsored_packages',
  profiles: 'sponsored_profiles',
  ads: 'sponsored_ads',
  orders: 'sponsored_orders',
  events: 'sponsored_events',
  reports: 'sponsored_reports',
  log: 'sponsored_ad_log',
};

const nowIso = () => new Date().toISOString();
const conflict = (message, code) => Object.assign(new HttpError(409, message), { code });
const httpCode = (status, message, code) => Object.assign(new HttpError(status, message), { code });
const trackingSecret = () => process.env.SPONSORED_TRACKING_SECRET || process.env.RECOVERY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sponsored';
const viewerOf = (userId) => rules.viewerHash(userId, trackingSecret());

/* ----------------------------------- history ----------------------------------- */

async function logAd(adId, { actor = 'system', email = null, action, note = null }) {
  const { error } = await supabase.from(T.log).insert({ ad_id: adId, actor, actor_email: email, action, note: note ? String(note).slice(0, 500) : null });
  if (error) console.warn(`[sponsored] could not write history for ${adId}: ${error.message}`);
}

async function historyOf(adId, { forOwner = false } = {}) {
  const rows = ok(await supabase.from(T.log).select('actor, actor_email, action, note, created_at').eq('ad_id', adId).order('created_at', { ascending: false }).limit(50));
  // Owners see what happened and why, but not which admin did it.
  return rows.map((r) => ({ actor: r.actor, by: forOwner ? null : r.actor_email, action: r.action, note: r.note, at: r.created_at }));
}

/* ----------------------------------- packages ----------------------------------- */

function packageDto(p) {
  return p ? {
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price_cents) / 100,
    durationDays: p.duration_days,
    placement: p.placement,
    included: Boolean(p.is_included),
    active: Boolean(p.is_active),
    sort: p.sort,
  } : null;
}

async function listPackages({ includeInactive = false } = {}) {
  let q = supabase.from(T.packages).select('*').order('sort');
  if (!includeInactive) q = q.eq('is_active', true);
  return ok(await q);
}
async function getPackage(id) {
  if (typeof id !== 'string' || !/^[a-z0-9_]{1,40}$/.test(id)) return null;
  return ok(await supabase.from(T.packages).select('*').eq('id', id).maybeSingle());
}

/* ----------------------------------- business page ----------------------------------- */

async function getProfileRow(businessId) {
  return ok(await supabase.from(T.profiles).select('*').eq('business_id', businessId).maybeSingle());
}

/** The owner's view of their business page: what is live, what they are editing and what an admin said. */
function profileView(row) {
  const latest = row?.draft || row?.published || null;
  return {
    published: row?.published || null,
    publishedAt: row?.published_at || null,
    current: latest,
    hasChanges: Boolean(row?.draft && !rules.sameProfile(row.draft, row.published)),
    reviewStatus: row?.review_status || 'none',
    reviewNote: row?.review_status === 'rejected' ? row.review_note : null,
    problems: rules.profileProblems(latest),
  };
}

/** Suggestions for a first business page, taken from what the business already saved in the app. */
async function prefillFor(business) {
  const [products, services] = await Promise.all([
    supabase.from('products').select('name, price').eq('business_id', business.id).order('name').limit(40),
    supabase.from('services').select('name, price').eq('business_id', business.id).order('name').limit(40),
  ]);
  const offerings = [
    ...(services.data || []).map((s) => ({ name: s.name, kind: 'service', price: s.price == null ? null : Number(s.price) })),
    ...(products.data || []).map((p) => ({ name: p.name, kind: 'product', price: p.price == null ? null : Number(p.price) })),
  ].filter((o) => o.name);
  return {
    ...rules.emptyProfile(),
    displayName: business.name || '',
    location: business.location || '',
    hours: business.hours || '',
    about: business.products_text ? String(business.products_text).slice(0, rules.LIMITS.about) : '',
    offerings: offerings.slice(0, rules.LIMITS.offerings),
  };
}

/** True when the business has an advert an admin is looking at or that people can see. */
async function hasAdsInReview(businessId) {
  const { count, error } = await supabase.from(T.ads).select('id', { count: 'exact', head: true }).eq('business_id', businessId).in('status', ['pending_review', 'approved', 'suspended']);
  if (error) throw dbError(error);
  return (count || 0) > 0;
}

/**
 * Saves the owner's edits as a draft. The approved page stays live until an admin accepts the changes; the
 * draft only joins the review queue once the business has an advert (before that there is nothing to show).
 */
async function saveProfile(business, body) {
  const row = await getProfileRow(business.id);
  const base = row?.draft || row?.published || (await prefillFor(business));
  const next = rules.profileFields(body, base, { mediaBase: mediaBaseFor(business.id) });
  const unchanged = row?.published && rules.sameProfile(next, row.published);
  const review = unchanged ? 'none' : (await hasAdsInReview(business.id)) ? 'pending' : 'none';
  const fields = {
    draft: unchanged ? null : next,
    draft_updated_at: unchanged ? row?.draft_updated_at || null : nowIso(),
    review_status: review,
    review_note: null,
    updated_at: nowIso(),
  };
  if (row) ok(await supabase.from(T.profiles).update(fields).eq('business_id', business.id));
  else {
    const { error } = await supabase.from(T.profiles).insert({ business_id: business.id, ...fields });
    if (error && error.code === '23505') ok(await supabase.from(T.profiles).update(fields).eq('business_id', business.id));
    else if (error) throw dbError(error);
  }
  return profileView(await getProfileRow(business.id));
}

/** An advert went to review: unreviewed page changes go with it. */
async function queueProfileWithAd(businessId) {
  await supabase.from(T.profiles).update({ review_status: 'pending', updated_at: nowIso() }).eq('business_id', businessId).not('draft', 'is', null).neq('review_status', 'pending');
}

/** Admin: makes the draft the live page. */
async function publishProfile(businessId, admin) {
  const row = await getProfileRow(businessId);
  if (!row?.draft) {
    if (row?.published) return row;
    throw badRequest('This business has not filled in its business page yet.');
  }
  const problems = rules.profileProblems(row.draft);
  if (problems.length) throw badRequest(`The business page is incomplete: ${problems.join(' ')}`);
  forgetLive();
  return ok(await supabase.from(T.profiles).update({
    published: row.draft,
    published_at: nowIso(),
    draft: null,
    review_status: 'none',
    review_note: null,
    reviewed_by: admin?.id || null,
    reviewed_at: nowIso(),
    updated_at: nowIso(),
  }).eq('business_id', businessId).select().single());
}

async function rejectProfile(businessId, admin, reason) {
  const row = await getProfileRow(businessId);
  if (!row?.draft) throw badRequest('There are no page changes waiting for review.');
  return ok(await supabase.from(T.profiles).update({ review_status: 'rejected', review_note: reason, reviewed_by: admin?.id || null, reviewed_at: nowIso(), updated_at: nowIso() }).eq('business_id', businessId).select().single());
}

/** The approved page as everyone sees it (contact links ready to open). */
function publicProfile(businessId, published) {
  if (!published) return null;
  const p = published;
  return {
    businessId,
    name: p.displayName,
    about: p.about,
    logoUrl: p.logoUrl || null,
    category: p.category || null,
    location: p.location || null,
    hours: p.hours || null,
    website: p.website || null,
    whatsapp: p.whatsapp ? `+${p.whatsapp}` : null,
    whatsappUrl: rules.whatsappLink(p.whatsapp, `Hi ${p.displayName}, I found your business on AI Co-Founder.`),
    phone: p.phone ? `+${p.phone}` : null,
    email: p.email || null,
    instagram: p.instagram || null,
    facebook: p.facebook || null,
    offerings: Array.isArray(p.offerings) ? p.offerings : [],
  };
}

/* ----------------------------------- adverts: shapes ----------------------------------- */

const AD_COLUMNS = 'id, business_id, owner_id, title, description, image_url, category, package_id, placement, duration_days, price_cents, funding, status, paid_at, submitted_at, reviewed_at, review_note, starts_at, ends_at, pending_changes, revision_status, revision_note, account_suspended, renewed_from, created_at, updated_at';

function orderSummary(o) {
  return o ? {
    reference: o.reference,
    kind: o.kind,
    amount: Number(o.amount) / 100,
    currency: o.currency,
    status: o.status,
    mode: o.mode,
    paidAt: o.paid_at,
    refundStatus: o.refund_status,
    createdAt: o.created_at,
  } : null;
}

/** An advert as its owner sees it. */
function ownerAdDto(ad, { order = null, stats = null } = {}) {
  const now = Date.now();
  return {
    id: ad.id,
    title: ad.title,
    description: ad.description,
    imageUrl: ad.image_url,
    category: ad.category,
    packageId: ad.package_id,
    placement: ad.placement,
    durationDays: ad.duration_days,
    price: Number(ad.price_cents) / 100,
    funding: ad.funding,
    status: ad.account_suspended && ad.status === 'approved' ? 'suspended' : rules.effectiveStatus(ad, now),
    storedStatus: ad.status,
    submittedAt: ad.submitted_at,
    paidAt: ad.paid_at,
    startsAt: ad.starts_at,
    endsAt: ad.ends_at,
    daysLeft: ad.status === 'approved' ? rules.daysLeft(ad, now) : null,
    reviewNote: ['rejected', 'suspended', 'removed', 'withdrawn'].includes(ad.status) ? ad.review_note : null,
    revision: ad.revision_status !== 'none' ? { status: ad.revision_status, note: ad.revision_note, changes: ad.pending_changes } : null,
    renewedFrom: ad.renewed_from,
    canEdit: rules.DIRECT_EDIT_STATUSES.includes(ad.status) || (ad.status === 'approved' && rules.effectiveStatus(ad, now) !== 'expired'),
    canWithdraw: rules.DIRECT_EDIT_STATUSES.includes(ad.status),
    canRenew: ['approved', 'expired'].includes(ad.status),
    payment: orderSummary(order),
    stats,
    createdAt: ad.created_at,
  };
}

/** An advert card on the Sponsored page. */
function publicAdDto(ad, profile) {
  return {
    id: ad.id,
    businessId: ad.business_id,
    title: ad.title,
    description: ad.description,
    imageUrl: ad.image_url || null,
    category: ad.category,
    placement: ad.placement,
    business: { name: profile?.displayName || '', logoUrl: profile?.logoUrl || null },
  };
}

async function getAdRow(adId) {
  if (!isUuid(adId)) return null;
  return ok(await supabase.from(T.ads).select(AD_COLUMNS).eq('id', adId).maybeSingle());
}
async function ownAd(businessId, adId) {
  const ad = await getAdRow(adId);
  if (!ad || ad.business_id !== businessId) throw notFound('Advert not found.');
  return ad;
}

async function latestOrders(adIds) {
  if (!adIds.length) return new Map();
  const rows = ok(await supabase.from(T.orders).select('*').in('ad_id', adIds).order('created_at', { ascending: false }));
  const out = new Map();
  for (const o of rows) {
    const cur = out.get(o.ad_id);
    // The order that funds the advert wins over later failed / open attempts.
    if (!cur || (cur.status !== 'success' && o.status === 'success')) out.set(o.ad_id, o);
  }
  return out;
}

/* ----------------------------------- statistics ----------------------------------- */

const emptyTotals = () => Object.fromEntries(rules.EVENTS.map((e) => [e, 0]));

/** -> Map(adId -> { totals, daily: Map(day -> totals) }) counted in the database. */
async function eventCounts(adIds, sinceDay = '2000-01-01') {
  const out = new Map(adIds.map((id) => [id, { totals: emptyTotals(), daily: new Map() }]));
  if (!adIds.length) return out;
  const rows = ok(await supabase.rpc('sponsored_event_counts', { p_ad_ids: adIds, p_since: sinceDay }));
  for (const r of rows || []) {
    const s = out.get(r.ad_id);
    if (!s || !(r.event in s.totals)) continue;
    const n = Number(r.n) || 0;
    s.totals[r.event] += n;
    if (!s.daily.has(r.day)) s.daily.set(r.day, emptyTotals());
    s.daily.get(r.day)[r.event] += n;
  }
  return out;
}

/** Totals in the shape the app and the portal show: views, Learn More taps, page visits, contacts, CTR. */
function statsDto(totals) {
  const t = totals || emptyTotals();
  const contacts = t.website_click + t.whatsapp_click + t.call_click + t.email_click;
  return {
    impressions: t.impression,
    clicks: t.click,
    pageViews: t.detail_view,
    websiteClicks: t.website_click,
    whatsappClicks: t.whatsapp_click,
    callClicks: t.call_click,
    emailClicks: t.email_click,
    contacts,
    clickRate: t.impression ? Math.round((t.click / t.impression) * 1000) / 10 : null, // %
  };
}

function addDaysIso(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** One advert's figures: totals since it started and a day-by-day series for the last `days` days. */
async function adStats(ad, days = 30) {
  const span = Math.min(90, Math.max(7, Number(days) || 30));
  const today = todayInSA();
  const since = addDaysIso(today, -(span - 1));
  const all = (await eventCounts([ad.id])).get(ad.id);
  const series = [];
  for (let i = 0; i < span; i++) {
    const day = addDaysIso(since, i);
    const t = all.daily.get(day) || emptyTotals();
    series.push({ day, impressions: t.impression, clicks: t.click, pageViews: t.detail_view, contacts: t.website_click + t.whatsapp_click + t.call_click + t.email_click });
  }
  return { totals: statsDto(all.totals), series, days: span };
}

/* ----------------------------------- the Sponsored page ----------------------------------- */

// The live list is read on every page view; a few seconds of caching keeps that cheap. Anything an admin
// changes clears it at once (forgetLive), and isLive() is checked again on every read, so an advert that has
// just ended is never shown even from the cache.
const LIVE_CACHE_MS = 15_000;
let liveCache = null;
const forgetLive = () => { liveCache = null; };

/** Every advert that may be shown right now, with its business's approved page. */
async function liveAdsWithProfiles() {
  if (liveCache && liveCache.until > Date.now()) return liveCache.items.filter((i) => rules.isLive(i.ad));
  const items = await loadLiveAds();
  liveCache = { until: Date.now() + LIVE_CACHE_MS, items };
  return items;
}

async function loadLiveAds() {
  const now = nowIso();
  const rows = ok(await supabase.from(T.ads).select(AD_COLUMNS).eq('status', 'approved').eq('account_suspended', false).lte('starts_at', now).gt('ends_at', now).limit(2000));
  const live = rows.filter((a) => rules.isLive(a));
  const ids = [...new Set(live.map((a) => a.business_id))];
  const profiles = ids.length ? ok(await supabase.from(T.profiles).select('business_id, published').in('business_id', ids)) : [];
  const byBiz = new Map(profiles.map((p) => [p.business_id, p.published]));
  // An advert without an approved business page has nowhere for "Learn More" to go: it is not shown.
  return live.filter((a) => byBiz.get(a.business_id)).map((a) => ({ ad: a, profile: byBiz.get(a.business_id) }));
}

function matches(item, q) {
  if (!q) return true;
  const label = rules.CATEGORIES.find((c) => c.id === item.ad.category)?.label || '';
  const hay = `${item.ad.title}\n${item.ad.description}\n${item.profile.displayName}\n${label}\n${(item.profile.offerings || []).map((o) => o.name).join('\n')}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/**
 * The Sponsored page: featured strip (priority, then featured) and the paged list of standard adverts.
 * `seed` keeps the rotation stable while one person scrolls, and different for different people / days.
 */
async function browse({ category, q, seed, page = 1, limit = 20 }) {
  const all = await liveAdsWithProfiles();
  const counts = {};
  all.forEach((i) => { counts[i.ad.category] = (counts[i.ad.category] || 0) + 1; });
  const search = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const filtered = all.filter((i) => (!category || i.ad.category === category) && matches(i, search));
  const s = String(seed || todayInSA()).slice(0, 40);
  const byId = new Map(filtered.map((i) => [i.ad.id, i]));
  const { featured, standard } = rules.arrangeAds(filtered.map((i) => i.ad), s);
  const size = Math.min(50, Math.max(1, Number(limit) || 20));
  const totalPages = Math.max(1, Math.ceil(standard.length / size));
  const p = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const card = (a) => publicAdDto(a, byId.get(a.id).profile);
  return {
    featured: p === 1 ? featured.slice(0, 12).map(card) : [],
    ads: standard.slice((p - 1) * size, p * size).map(card),
    page: p,
    totalPages,
    total: filtered.length,
    categories: rules.CATEGORIES.filter((c) => counts[c.id]).map((c) => ({ id: c.id, count: counts[c.id] })),
  };
}

/** "Learn More": the advert and its business page. Owners may preview their own advert in any state. */
async function publicAd(adId, user) {
  const ad = await getAdRow(adId);
  const isOwner = ad && user && ad.owner_id === user.id;
  if (!ad || (!rules.isLive(ad) && !isOwner)) throw notFound('This advert is no longer available.');
  const row = await getProfileRow(ad.business_id);
  const page = isOwner ? row?.draft || row?.published : row?.published;
  if (!page) throw notFound('This business page is not available yet.');
  // Other adverts the same business is running now, for "More from this business".
  const others = rules.isLive(ad)
    ? (await liveAdsWithProfiles()).filter((i) => i.ad.business_id === ad.business_id && i.ad.id !== ad.id).slice(0, 5).map((i) => publicAdDto(i.ad, i.profile))
    : [];
  return {
    ad: publicAdDto(ad, page),
    business: publicProfile(ad.business_id, page),
    moreFromBusiness: others,
    preview: isOwner && !rules.isLive(ad) ? { status: rules.effectiveStatus(ad), unpublishedPage: !row?.published || Boolean(row?.draft) } : null,
  };
}

/** Views and clicks from the app. Only live adverts, never the owner's own, once per person per day. */
async function recordEvents(user, events) {
  if (!Array.isArray(events) || !events.length) return { recorded: 0 };
  const wanted = new Map();
  for (const e of events.slice(0, 60)) {
    const adId = String(e?.adId || '');
    const type = String(e?.type || '');
    if (isUuid(adId) && rules.EVENTS.includes(type)) wanted.set(`${adId}|${type}`, { adId, type });
  }
  if (!wanted.size) return { recorded: 0 };
  const ids = [...new Set([...wanted.values()].map((w) => w.adId))];
  const ads = ok(await supabase.from(T.ads).select('id, business_id, owner_id, status, starts_at, ends_at, account_suspended').in('id', ids));
  const byId = new Map(ads.filter((a) => rules.isLive(a) && a.owner_id !== user.id).map((a) => [a.id, a]));
  const day = todayInSA();
  const viewer = viewerOf(user.id);
  const rows = [...wanted.values()].filter((w) => byId.has(w.adId)).map((w) => ({ ad_id: w.adId, business_id: byId.get(w.adId).business_id, event: w.type, viewer_hash: viewer, day }));
  if (!rows.length) return { recorded: 0 };
  ok(await supabase.from(T.events).upsert(rows, { onConflict: 'ad_id,event,viewer_hash,day', ignoreDuplicates: true }));
  return { recorded: rows.length };
}

async function reportAd(user, adId, { reason, details }) {
  if (!rules.REPORT_REASONS.includes(reason)) throw badRequest('Choose why you are reporting this advert.');
  const ad = await getAdRow(adId);
  if (!ad || !rules.isLive(ad)) throw notFound('This advert is no longer available.');
  if (ad.owner_id === user.id) throw badRequest("You can't report your own advert.");
  const { error } = await supabase.from(T.reports).insert({ ad_id: ad.id, reporter_hash: viewerOf(user.id), reason, details: details ? String(details).replace(/\s+/g, ' ').trim().slice(0, 500) : null });
  if (error && error.code !== '23505') throw dbError(error);
  return { ok: true, alreadyReported: Boolean(error) };
}

/* ----------------------------------- the owner's adverts ----------------------------------- */

/** What this business may do on the Sponsored page right now (plan, allowance, payments). */
async function eligibility(business, subscription) {
  const e = rules.adEligibility(subscription?.entitlements);
  let includedUsed = 0;
  const period = rules.includedPeriod(todayInSA());
  if (business && e.includedPerMonth > 0) {
    const { count, error } = await supabase.from(T.orders).select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('kind', 'included').eq('status', 'success').eq('included_period', period);
    if (error) throw dbError(error);
    includedUsed = count || 0;
  }
  const [y, m] = period.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return {
    planId: subscription?.planId || 'free',
    canPurchase: e.canPurchase,
    includedPerMonth: e.includedPerMonth,
    includedUsed,
    includedAvailable: Math.max(0, e.includedPerMonth - includedUsed),
    includedRenewsOn: nextMonth,
  };
}

async function listMyAds(businessId) {
  const ads = ok(await supabase.from(T.ads).select(AD_COLUMNS).eq('business_id', businessId).order('created_at', { ascending: false }).limit(100));
  const ids = ads.map((a) => a.id);
  const [orders, counts] = await Promise.all([latestOrders(ids), eventCounts(ids)]);
  return ads.map((a) => ownerAdDto(a, { order: orders.get(a.id), stats: statsDto(counts.get(a.id)?.totals) }));
}

async function myAd(businessId, adId) {
  const ad = await ownAd(businessId, adId);
  const [orders, stats, history] = await Promise.all([latestOrders([ad.id]), adStats(ad, 30), historyOf(ad.id, { forOwner: true })]);
  return { ...ownerAdDto(ad, { order: orders.get(ad.id), stats: stats.totals }), series: stats.series, history };
}

/** Checks the plan, package, open-advert limit and business page before an advert is created. */
async function prepareNewAd({ business, subscription, packageId, useIncluded }) {
  const elig = await eligibility(business, subscription);
  let pkg;
  if (useIncluded) {
    if (elig.includedPerMonth <= 0) throw httpCode(402, 'An included advert is part of the Premium plan. Upgrade in More > Subscription, or choose a package.', 'upgrade_required');
    if (elig.includedAvailable <= 0) throw conflict(`You have used this month's included advert. The next one is available on ${elig.includedRenewsOn}.`, 'included_used');
    pkg = (await listPackages()).find((p) => p.is_included);
    if (!pkg) throw conflict('The included advert is not available right now.', 'package_unavailable');
  } else {
    if (!elig.canPurchase) throw httpCode(402, 'Advertising is available on the Pro and Premium plans. Upgrade in More > Subscription to advertise your business.', 'upgrade_required');
    pkg = await getPackage(packageId);
    if (!pkg || pkg.is_included || !pkg.is_active) throw badRequest('Choose one of the advertising packages.');
  }
  const { count, error } = await supabase.from(T.ads).select('id', { count: 'exact', head: true }).eq('business_id', business.id).in('status', rules.OPEN_STATUSES);
  if (error) throw dbError(error);
  // Expired approvals still carry status 'approved' until the hourly sweep: count only the ones still running.
  if ((count || 0) >= rules.LIMITS.maxOpenAdsPerBusiness) {
    const open = ok(await supabase.from(T.ads).select('status, starts_at, ends_at').eq('business_id', business.id).in('status', rules.OPEN_STATUSES));
    if (open.filter((a) => rules.effectiveStatus(a) !== 'expired').length >= rules.LIMITS.maxOpenAdsPerBusiness) {
      throw conflict(`You can have up to ${rules.LIMITS.maxOpenAdsPerBusiness} adverts open at once. Withdraw one or wait for one to end.`, 'too_many_ads');
    }
  }
  const page = profileView(await getProfileRow(business.id));
  if (!page.current || page.problems.length) throw httpCode(400, `Set up your business page first: ${page.problems.join(' ')}`, 'profile_incomplete');
  return { pkg, elig };
}

/** Claims this month's Premium advert for an advert (the database refuses a second claim in the same month). */
async function claimIncluded({ ad, business, user, pkg }) {
  const now = nowIso();
  const { error } = await supabase.from(T.orders).insert({
    ad_id: ad.id,
    business_id: business.id,
    user_id: user.id,
    email: user.email ? String(user.email).toLowerCase() : null,
    kind: 'included',
    package_id: pkg.id,
    included_period: rules.includedPeriod(todayInSA()),
    reference: `acfinc-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`,
    amount: 0,
    currency: 'ZAR',
    status: 'success',
    applied_at: now,
    verified_at: now,
    paid_at: now,
  });
  if (error) {
    if (error.code === '23505') throw conflict("You have used this month's included advert.", 'included_used');
    throw dbError(error);
  }
}

/** Moves an advert into the review queue (after payment, or straight away for the Premium allowance). */
async function sendToReview(adId, businessId, note) {
  const now = nowIso();
  const rows = ok(await supabase.from(T.ads).update({ status: 'pending_review', submitted_at: now, paid_at: now, updated_at: now }).eq('id', adId).eq('status', 'awaiting_payment').select('id'));
  if (rows.length) {
    await queueProfileWithAd(businessId);
    await logAd(adId, { action: 'submitted', note });
  }
  return rows.length > 0;
}

/**
 * Creates an advert. Included (Premium) adverts go straight to review; paid ones wait for Paystack:
 *   -> { ad, checkout: { reference, authorizationUrl, amount, currency, mode } | null }
 */
async function createAd({ business, user, subscription, body, callbackUrl, renewedFrom = null }) {
  const useIncluded = Boolean(body?.useIncluded);
  const { pkg } = await prepareNewAd({ business, subscription, packageId: body?.packageId, useIncluded });
  const fields = rules.adFields(body, { mediaBase: mediaBaseFor(business.id) });
  const ad = ok(await supabase.from(T.ads).insert({
    business_id: business.id,
    owner_id: user.id,
    ...fields,
    package_id: pkg.id,
    placement: pkg.placement,
    duration_days: pkg.duration_days,
    price_cents: pkg.price_cents,
    funding: useIncluded ? 'included' : 'paid',
    status: 'awaiting_payment',
    renewed_from: renewedFrom,
  }).select(AD_COLUMNS).single());
  await logAd(ad.id, { actor: 'owner', email: user.email, action: renewedFrom ? 'renewal_created' : 'created', note: `${pkg.name} package` });

  if (useIncluded) {
    try {
      await claimIncluded({ ad, business, user, pkg });
    } catch (err) {
      await supabase.from(T.ads).delete().eq('id', ad.id); // nothing was claimed: don't leave an orphan advert
      throw err;
    }
    await sendToReview(ad.id, business.id, 'Included with Premium');
    return { ad: ownerAdDto(await getAdRow(ad.id)), checkout: null };
  }

  const pay = require('./sponsoredPayments'); // loaded here: sponsoredPayments also uses this file
  let checkout = null;
  try {
    const { order } = await pay.createCheckout({ ad, pkg, business, user, callbackUrl });
    checkout = { reference: order.reference, authorizationUrl: order.authorization_url, amount: Number(order.amount) / 100, currency: order.currency, mode: order.mode };
  } catch (err) {
    // The advert is kept (as "awaiting payment") so the person can try paying again from My adverts.
    return { ad: ownerAdDto(await getAdRow(ad.id)), checkout: null, paymentError: err.message || 'Payment could not be started.' };
  }
  return { ad: ownerAdDto(await getAdRow(ad.id)), checkout };
}

/** Pay for an advert that is still waiting for payment (reuses the open checkout). */
async function checkoutAd({ business, user, adId, callbackUrl }) {
  const ad = await ownAd(business.id, adId);
  // An included advert whose move to review was interrupted: finish it instead of asking for money.
  if (ad.status === 'awaiting_payment' && ad.funding === 'included' && (await fundingOrder(ad.id))) {
    await sendToReview(ad.id, business.id, 'Included with Premium');
    return { ad: ownerAdDto(await getAdRow(ad.id)), checkout: null };
  }
  if (ad.status !== 'awaiting_payment' || ad.funding !== 'paid') throw conflict('This advert does not need a payment.', 'not_awaiting_payment');
  const pkg = await getPackage(ad.package_id);
  if (!pkg) throw conflict('This package is no longer available. Withdraw the advert and create a new one.', 'package_unavailable');
  const pay = require('./sponsoredPayments');
  // A payment made in another tab may already have gone through.
  const settled = await pay.settleOpenOrdersFor(ad.id);
  if (settled) return { ad: ownerAdDto(await getAdRow(ad.id)), checkout: null };
  // The price stays the one shown when the advert was created.
  const { order } = await pay.createCheckout({ ad, pkg: { ...pkg, price_cents: ad.price_cents }, business, user, callbackUrl });
  return { ad: ownerAdDto(ad), checkout: { reference: order.reference, authorizationUrl: order.authorization_url, amount: Number(order.amount) / 100, currency: order.currency, mode: order.mode } };
}

/**
 * Edits an advert. Not yet visible -> changed directly (and "resubmit" sends a rejected one back to review).
 * Approved -> the changes wait for an admin while the approved version stays live.
 */
async function editAd(business, user, adId, body) {
  const ad = await ownAd(business.id, adId);
  const fields = rules.adFields(body, { mediaBase: mediaBaseFor(business.id), partial: true });
  const now = nowIso();
  const status = rules.effectiveStatus(ad);

  if (rules.DIRECT_EDIT_STATUSES.includes(ad.status)) {
    const update = { ...fields, updated_at: now };
    const resubmit = ad.status === 'rejected' && body?.resubmit !== false;
    if (resubmit) Object.assign(update, { status: 'pending_review', submitted_at: now, review_note: null });
    const rows = ok(await supabase.from(T.ads).update(update).eq('id', ad.id).eq('status', ad.status).select(AD_COLUMNS));
    if (!rows.length) throw conflict('This advert changed in the meantime. Please refresh and try again.', 'stale');
    if (resubmit) {
      await queueProfileWithAd(business.id);
      await logAd(ad.id, { actor: 'owner', email: user.email, action: 'resubmitted' });
    } else await logAd(ad.id, { actor: 'owner', email: user.email, action: 'edited' });
    return ownerAdDto(rows[0]);
  }

  if (ad.status === 'approved' && status !== 'expired') {
    const changes = { ...(ad.revision_status === 'pending' ? ad.pending_changes || {} : {}), ...fields };
    // Nothing differs from what is live: drop any waiting revision.
    const differs = Object.keys(changes).some((k) => changes[k] !== ad[k]);
    const rows = ok(await supabase.from(T.ads).update({
      pending_changes: differs ? changes : null,
      revision_status: differs ? 'pending' : 'none',
      revision_note: null,
      updated_at: now,
    }).eq('id', ad.id).eq('status', 'approved').select(AD_COLUMNS));
    if (!rows.length) throw conflict('This advert changed in the meantime. Please refresh and try again.', 'stale');
    if (differs) await logAd(ad.id, { actor: 'owner', email: user.email, action: 'changes_submitted' });
    return ownerAdDto(rows[0]);
  }
  throw conflict(status === 'expired' ? 'This advert has ended. Renew it to run it again.' : 'This advert can no longer be changed.', 'not_editable');
}

/** The owner withdraws an advert that hasn't gone live. The Premium allowance is given back; a paid advert is
 *  marked for a refund, which an admin completes in Paystack. */
async function withdrawAd(business, user, adId) {
  let ad = await ownAd(business.id, adId);
  if (!rules.DIRECT_EDIT_STATUSES.includes(ad.status)) throw conflict('Only adverts that are not live yet can be withdrawn.', 'not_withdrawable');
  const pay = require('./sponsoredPayments');
  await pay.settleOpenOrdersFor(ad.id, { returned: true }); // they may have just paid
  ad = await ownAd(business.id, adId);
  if (!rules.DIRECT_EDIT_STATUSES.includes(ad.status)) throw conflict('Only adverts that are not live yet can be withdrawn.', 'not_withdrawable');
  const now = nowIso();
  const rows = ok(await supabase.from(T.ads).update({ status: 'withdrawn', review_note: 'Withdrawn by the owner.', updated_at: now }).eq('id', ad.id).eq('status', ad.status).select(AD_COLUMNS));
  if (!rows.length) throw conflict('This advert changed in the meantime. Please refresh and try again.', 'stale');
  const orders = ok(await supabase.from(T.orders).select('*').eq('ad_id', ad.id));
  let refund = false;
  for (const o of orders) {
    if (o.status === 'pending') await supabase.from(T.orders).update({ status: 'cancelled', failure_reason: 'advert withdrawn', updated_at: now }).eq('id', o.id).eq('status', 'pending');
    if (o.status === 'success' && o.kind === 'included') await supabase.from(T.orders).update({ status: 'cancelled', failure_reason: 'advert withdrawn before going live', updated_at: now }).eq('id', o.id);
    if (o.status === 'success' && o.kind === 'paid') {
      refund = true;
      await supabase.from(T.orders).update({ refund_status: 'requested', updated_at: now }).eq('id', o.id).eq('refund_status', 'none');
    }
  }
  await logAd(ad.id, { actor: 'owner', email: user.email, action: 'withdrawn', note: refund ? 'Refund requested' : null });
  return { ad: ownerAdDto(rows[0]), refundRequested: refund };
}

/** Runs an approved / ended advert again with a new package (it is reviewed again; if the current one is still
 *  running, the new campaign starts when it ends). */
async function renewAd({ business, user, subscription, adId, body, callbackUrl }) {
  const src = await ownAd(business.id, adId);
  if (!['approved', 'expired'].includes(src.status)) throw conflict('Only approved or ended adverts can be renewed.', 'not_renewable');
  return createAd({
    business,
    user,
    subscription,
    callbackUrl,
    renewedFrom: src.id,
    body: { title: src.title, description: src.description, imageUrl: src.image_url, category: src.category, packageId: body?.packageId, useIncluded: body?.useIncluded },
  });
}

/* ----------------------------------- admin actions ----------------------------------- */

/** The order that pays for (or covers) an advert, if any. */
async function fundingOrder(adId) {
  const rows = ok(await supabase.from(T.orders).select('*').eq('ad_id', adId).eq('status', 'success').order('created_at', { ascending: false }).limit(1));
  return rows[0] || null;
}

async function approveAd(admin, adId, { startsAt } = {}) {
  const ad = await getAdRow(adId);
  if (!ad) throw notFound('Advert not found.');
  if (ad.status !== 'pending_review') throw conflict(`Only adverts waiting for review can be approved (this one is ${rules.effectiveStatus(ad)}).`, 'not_pending');
  if (ad.account_suspended) throw conflict("The owner's account is suspended.", 'account_suspended');
  const order = await fundingOrder(ad.id);
  if (!order || order.refund_status !== 'none') throw conflict('There is no confirmed payment for this advert, so it cannot go live.', 'not_paid');

  await publishProfile(ad.business_id, admin); // the page "Learn More" opens must be approved with it

  let start = Date.now();
  if (startsAt) {
    const t = Date.parse(startsAt);
    if (!Number.isFinite(t)) throw badRequest('Start date is not valid.');
    if (t > Date.now() + 60 * 86_400_000) throw badRequest('The start date can be at most 60 days ahead.');
    start = Math.max(start, t);
  }
  // A renewal of a campaign that is still running starts when that one ends, so the days are not wasted.
  if (ad.renewed_from) {
    const prev = await getAdRow(ad.renewed_from);
    if (prev && prev.status === 'approved' && Date.parse(prev.ends_at) > start) start = Date.parse(prev.ends_at);
  }
  const window = rules.campaignWindow(ad.duration_days, start);
  const now = nowIso();
  const rows = ok(await supabase.from(T.ads).update({ status: 'approved', ...window, reviewed_at: now, reviewed_by: admin.id, review_note: null, updated_at: now }).eq('id', ad.id).eq('status', 'pending_review').select(AD_COLUMNS));
  if (!rows.length) throw conflict('This advert changed in the meantime. Refresh and try again.', 'stale');
  forgetLive();
  await logAd(ad.id, { actor: 'admin', email: admin.email, action: 'approved', note: `Runs ${window.starts_at.slice(0, 10)} to ${window.ends_at.slice(0, 10)}` });
  return rows[0];
}

const needReason = (reason) => {
  const r = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (r.length < 5) throw badRequest('Give a reason (the business owner sees it).');
  return r;
};

async function setStatus(admin, adId, { from, to, reason, action }) {
  const ad = await getAdRow(adId);
  if (!ad) throw notFound('Advert not found.');
  if (!from.includes(ad.status)) throw conflict(`This advert is ${rules.effectiveStatus(ad)}, so it can't be ${action}.`, 'wrong_status');
  const now = nowIso();
  const update = { status: to, updated_at: now, reviewed_at: now, reviewed_by: admin.id };
  if (reason !== undefined) update.review_note = reason;
  const rows = ok(await supabase.from(T.ads).update(update).eq('id', ad.id).eq('status', ad.status).select(AD_COLUMNS));
  if (!rows.length) throw conflict('This advert changed in the meantime. Refresh and try again.', 'stale');
  forgetLive();
  await logAd(ad.id, { actor: 'admin', email: admin.email, action, note: reason || null });
  return rows[0];
}

const rejectAd = async (admin, adId, reason) => setStatus(admin, adId, { from: ['pending_review'], to: 'rejected', reason: needReason(reason), action: 'rejected' });
const suspendAd = async (admin, adId, reason) => setStatus(admin, adId, { from: ['approved'], to: 'suspended', reason: needReason(reason), action: 'suspended' });
const reinstateAd = async (admin, adId) => setStatus(admin, adId, { from: ['suspended'], to: 'approved', reason: null, action: 'reinstated' });
const removeAd = async (admin, adId, reason) => setStatus(admin, adId, { from: ['awaiting_payment', 'pending_review', 'rejected', 'approved', 'suspended'], to: 'removed', reason: needReason(reason), action: 'removed' });

async function decideRevision(admin, adId, { approve, reason }) {
  const ad = await getAdRow(adId);
  if (!ad) throw notFound('Advert not found.');
  if (ad.revision_status !== 'pending' || !ad.pending_changes) throw conflict('There are no changes waiting for review.', 'no_revision');
  const now = nowIso();
  const update = approve
    ? { ...pickAdChanges(ad.pending_changes), pending_changes: null, revision_status: 'none', revision_note: null, updated_at: now }
    : { revision_status: 'rejected', revision_note: needReason(reason), updated_at: now };
  const rows = ok(await supabase.from(T.ads).update(update).eq('id', ad.id).eq('revision_status', 'pending').select(AD_COLUMNS));
  if (!rows.length) throw conflict('This advert changed in the meantime. Refresh and try again.', 'stale');
  forgetLive();
  await logAd(ad.id, { actor: 'admin', email: admin.email, action: approve ? 'changes_approved' : 'changes_rejected', note: approve ? null : update.revision_note });
  return rows[0];
}
const pickAdChanges = (c) => Object.fromEntries(['title', 'description', 'image_url', 'category'].filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));

/** Admin suspended / reactivated an account: its adverts disappear / come back with it. */
async function setAccountSuspended(ownerId, suspended) {
  forgetLive();
  const { error } = await supabase.from(T.ads).update({ account_suspended: Boolean(suspended), updated_at: nowIso() }).eq('owner_id', ownerId);
  if (error && !/sponsored_ads/.test(error.message || '')) console.warn('[sponsored] could not update adverts of a suspended account:', error.message);
}

/** Admin notifications: what is waiting for review. */
async function reviewQueueCounts() {
  const [ads, revisions, profiles, reports] = await Promise.all([
    supabase.from(T.ads).select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from(T.ads).select('id', { count: 'exact', head: true }).eq('revision_status', 'pending').eq('status', 'approved'),
    supabase.from(T.profiles).select('business_id', { count: 'exact', head: true }).eq('review_status', 'pending'),
    supabase.from(T.reports).select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);
  for (const r of [ads, revisions, profiles, reports]) if (r.error) throw dbError(r.error);
  // When the newest item arrived (so the bell only lights up again for something new).
  const newest = async (table, col, build) => {
    const { data } = await build(supabase.from(table).select(col)).order(col, { ascending: false }).limit(1);
    return data?.[0]?.[col] || null;
  };
  const times = await Promise.all([
    ads.count ? newest(T.ads, 'submitted_at', (q) => q.eq('status', 'pending_review')) : null,
    revisions.count ? newest(T.ads, 'updated_at', (q) => q.eq('revision_status', 'pending').eq('status', 'approved')) : null,
    profiles.count ? newest(T.profiles, 'draft_updated_at', (q) => q.eq('review_status', 'pending')) : null,
    reports.count ? newest(T.reports, 'created_at', (q) => q.eq('status', 'open')) : null,
  ]);
  const latest = times.filter(Boolean).sort().pop() || null;
  return { ads: ads.count || 0, revisions: revisions.count || 0, profiles: profiles.count || 0, reports: reports.count || 0, latest };
}

/* ----------------------------------- housekeeping ----------------------------------- */

const ABANDON_AFTER_DAYS = 14;

/** Ended campaigns are marked expired; adverts nobody paid for in 14 days are closed. Runs hourly. */
async function sweep() {
  const now = nowIso();
  const expired = ok(await supabase.from(T.ads).update({ status: 'expired', updated_at: now }).eq('status', 'approved').lte('ends_at', now).select('id'));
  for (const a of expired) await logAd(a.id, { action: 'expired' });
  const cutoff = new Date(Date.now() - ABANDON_AFTER_DAYS * 86_400_000).toISOString();
  const stale = ok(await supabase.from(T.ads).select('id').eq('status', 'awaiting_payment').lt('created_at', cutoff).limit(200));
  if (stale.length) {
    const pay = require('./sponsoredPayments');
    for (const a of stale) {
      if (await pay.settleOpenOrdersFor(a.id, { returned: true })) continue; // paid after all
      const rows = ok(await supabase.from(T.ads).update({ status: 'withdrawn', review_note: 'Closed because the payment was not completed.', updated_at: now }).eq('id', a.id).eq('status', 'awaiting_payment').select('id'));
      if (rows.length) await logAd(a.id, { action: 'closed_unpaid' });
    }
  }
  return { expired: expired.length, closed: stale.length };
}

let sweeper = null;
function startSweeper() {
  if (sweeper) return;
  const run = () => sweep().catch((err) => console.warn(`[sponsored] housekeeping skipped: ${err.message}`));
  setTimeout(run, 15_000).unref();
  sweeper = setInterval(run, 60 * 60_000);
  sweeper.unref();
}

/** Start-up check: are the tables there? -> null when ready, or what to do. */
async function checkSetup() {
  const { error } = await supabase.from(T.packages).select('id').limit(1);
  if (!error) return null;
  return /does not exist|could not find/i.test(error.message || '') || error.code === 'PGRST205' || error.code === '42P01'
    ? 'tables missing - run backend/supabase/sponsored.sql in the Supabase SQL Editor'
    : error.message;
}

module.exports = {
  T, AD_COLUMNS, logAd, historyOf,
  packageDto, listPackages, getPackage,
  getProfileRow, profileView, prefillFor, saveProfile, publishProfile, rejectProfile, publicProfile, queueProfileWithAd,
  getAdRow, ownAd, ownerAdDto, forgetLive, publicAdDto, orderSummary, latestOrders, fundingOrder,
  eventCounts, statsDto, adStats, emptyTotals,
  browse, publicAd, recordEvents, reportAd,
  eligibility, listMyAds, myAd, createAd, checkoutAd, editAd, withdrawAd, renewAd, sendToReview,
  approveAd, rejectAd, suspendAd, reinstateAd, removeAd, decideRevision, setAccountSuspended, reviewQueueCounts,
  sweep, startSweeper, checkSetup,
};
