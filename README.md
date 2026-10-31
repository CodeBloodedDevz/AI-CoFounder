# AI Co-Founder — Admin Portal

React + Vite website for running the AI Co-Founder platform. It has no backend or database of its own:
it talks to the **AI Co-Founder backend** (the same server the mobile app uses) at `/admin-api`, so every
figure comes from the app's real records and every change shows up in the app.

## Run it

1. Start the AI Co-Founder backend first (in `AI-CoFounder/backend`: `npm run dev`, port 4000).
   One-time setup there: run `backend/supabase/admin.sql` in Supabase, then
   `npm run admin:add -- you@example.com` (see the backend README, section 4).
2. Here:
   ```
   npm install
   npm run dev
   ```
3. Open http://localhost:5173 and sign in with that account's normal password.

`.env` holds one public setting, `VITE_API_BASE_URL` (default `http://localhost:4000/admin-api`).
No secret keys ever go in this project.

## Pages

| Page | Shows | Actions |
|---|---|---|
| Dashboard | Users, businesses, active users (signed in or recorded something in 30 days), plans, verified revenue, platform activity, registrations, recent users and payments | Date range filter |
| Users & Businesses | Every app account with its business and plan | Search, filter, suspend / reactivate |
| Business records (`/users/:id`) | Profile, plan, this month's sales / expenses / profit, top sellers, transactions, stock, services, customers, bookings, payments | Edit profile and records, delete records (super admins), cancel / resume plan, re-check payments |
| Subscriptions & Payments | Plans and prices from the backend, subscriptions, payment history, revenue and 6-month trend | Search, filters, re-check pending payments |
| Sponsored Adverts | Review queue (new adverts, changes to live adverts, business page updates, user reports), every advert, advertising payments, packages, engagement by category | Approve now or on a date, reject / suspend / reinstate / remove with a reason the owner sees, approve or reject changes, re-check payments with Paystack, mark refunded (super admins), edit package prices (super admins) |
| AI & System Monitoring | Backend, database, AI (Groq) and Paystack status, AI usage for 7 days, recent admin and Paystack events | Refreshes every 30 s |
| Settings | Your profile and role | Change name, password and notification preferences |

The bell shows real events from the last 14 days (new users and businesses, payments, warnings, adverts waiting for review),
filtered by your notification preferences. The top search finds users and businesses.

## Roles

- **super_admin**: everything, including deleting a business's records.
- **admin**: everything except deleting.

All requests are checked by the backend (valid Supabase login + active row in `admin_users`), and every
change is recorded in `admin_audit_log`. "Remember me" keeps you signed in on this computer (the session
renews itself); otherwise the session ends when the tab is closed.

See `API_CONTRACT.md` for the endpoints.
