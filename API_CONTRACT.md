# Admin API (served by the AI Co-Founder backend)

Base URL: `http://localhost:4000/admin-api` (code: `backend/src/admin/`).
All `/admin/*` routes need `Authorization: Bearer <token>` from an active admin. Errors are
`{ "error": "message", "code"?: "..." }` with a matching HTTP status. Money is in rand.

## Auth (`/auth/admin`)
| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/login` | `{ email, password }` | `{ token, refreshToken, expiresAt, admin }` (rate limited) |
| POST | `/refresh` | `{ refreshToken }` | same as login |
| GET | `/me` | | `{ id, name, email, role, lastLoginAt, notificationPrefs }` |
| POST | `/logout` | | `{ ok }` |
| PATCH | `/profile` | `{ name }` | admin |
| POST | `/password` | `{ currentPassword, newPassword }` | `{ ok }` |
| GET / PUT | `/preferences` | `{ newUser, payment, system }` (booleans) | prefs |

## Dashboard, monitoring, notifications, search (`/admin`)
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard/summary?from=&to=` | counts, `plans`, `revenueByPlan`, `activity`, `trends` (null with a date range), `revenueMode` |
| GET | `/dashboard/registrations?from=&to=` | `[{ month, users }]`, default last 6 months |
| GET | `/dashboard/recent-users?limit=` / `/dashboard/recent-payments?limit=` | |
| GET | `/monitoring/status` | `services[]` (status, latency, detail), `recentEvents[]`, `aiUsage` (`available:false` until admin.sql is run) |
| GET | `/notifications` · POST `/notifications/seen` | last 14 days, filtered by preferences |
| GET | `/search?q=` | up to 8 users / businesses |

## Users and business records (`/admin/users`)
| Method | Path | Notes |
|---|---|---|
| GET | `/users?search=&plan=&status=&page=&limit=` | `{ users, total, page, totalPages }` |
| GET | `/users/:id` | |
| PATCH | `/users/:id/status` | `{ status: 'active' \| 'suspended' }` (Supabase Auth ban; admins can't be suspended) |
| GET | `/users/:id/overview` | business, subscription, stats (`month`, `allTime`, stock, bookings, top sellers) |
| PUT | `/users/:id/business` | name, type, businessModel, currency, location, hours, goals, language |
| GET | `/users/:id/{transactions\|products\|services\|customers\|bookings}?search=&page=&limit=` | plus `type` (transactions) / `status` (products, bookings) |
| PUT | `/users/:id/{kind}/:recordId` | same rules as the app's own routes |
| DELETE | `/users/:id/{kind}/:recordId` | super admins only |
| GET | `/users/:id/payments` | |
| POST | `/users/:id/subscription/{cancel\|resume}` | cancel at period end / resume |

## Subscriptions and payments (`/admin`)
| Method | Path | Notes |
|---|---|---|
| GET | `/subscriptions/plans` | prices and features from `lib/plans.js`, subscriber counts |
| GET | `/subscriptions?search=&plan=&status=&page=` | status: active, cancelling, expired, free |
| GET | `/payments?search=&status=&page=` | status: success, pending, failed, cancelled, expired, mismatch, refunded |
| GET | `/payments/summary` | revenue, this month, pending, needs review, 6-month trend |
| POST | `/payments/:reference/verify` | asks Paystack again (`verifyAndSettle`) |

## Sponsored adverts (`/admin/sponsored`)
Setup check first: `503 { code: 'sponsored_not_setup' }` until `backend/supabase/sponsored.sql` has been run.

| Method | Path | Notes |
|---|---|---|
| GET | `/sponsored/summary` | `queue` (ads, revisions, profiles, reports), `live`, `byStatus`, `revenue` (total, thisMonth, paidCount, refundsRequested), `packages` with sales, `engagement` by category (30 days), `categories` |
| GET | `/sponsored/ads?status=&category=&search=&page=&limit=` | status: review, changes, active, scheduled, expired, awaiting_payment, rejected, suspended, removed, withdrawn |
| GET | `/sponsored/ads/:id` | ad, pending `changes`, business `profile` (published / draft / problems), `registeredBusiness`, `owner`, `orders`, `stats`, `history`, `reports`, automatic `flags` |
| POST | `/sponsored/ads/:id/approve` | `{ startsAt? }` (ISO, at most 60 days ahead). Refused (`not_paid`) without a confirmed payment or Premium allowance; also publishes the business page |
| POST | `/sponsored/ads/:id/{reject\|suspend\|remove}` | `{ reason }` (5+ characters, shown to the owner) |
| POST | `/sponsored/ads/:id/reinstate` | suspended → live again |
| POST | `/sponsored/ads/:id/changes/{approve\|reject}` | edits to a live advert; reject needs `{ reason }` |
| GET | `/sponsored/profiles` | business-page changes waiting for review |
| POST | `/sponsored/profiles/:businessId/{approve\|reject}` | reject needs `{ reason }` |
| GET | `/sponsored/reports?status=open\|dismissed\|actioned` | user reports |
| POST | `/sponsored/reports/:id/{dismiss\|actioned}` | |
| GET | `/sponsored/packages` | all packages, including ones not on sale |
| PUT | `/sponsored/packages/:id` | super admins: `{ name, description, price, durationDays, placement, active }` (new purchases only) |
| GET | `/sponsored/orders?status=&refund=requested&kind=&search=&page=` | advertising payments (`acfad-` references) and Premium allowances |
| POST | `/sponsored/orders/:reference/verify` | asks Paystack again |
| POST | `/sponsored/orders/:reference/refunded` | super admins, after refunding in Paystack; stops the advert |
