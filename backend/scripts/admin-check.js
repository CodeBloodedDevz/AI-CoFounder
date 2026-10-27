// Checks that everything the admin portal needs is in place:   npm run admin:check
const supabase = require('../src/supabaseClient');
const paystack = require('../src/lib/paystack');
const llm = require('../src/lib/llm');

const TABLES = {
  businesses: 'id', subscriptions: 'business_id', payments: 'id', payment_events: 'event_key', transactions: 'id',
  products: 'id', services: 'id', customers: 'id', upcoming_work: 'id',
  admin_users: 'user_id, notification_prefs, notifications_seen_at', admin_audit_log: 'id', ai_usage_events: 'id',
};

(async () => {
  let ok = true;
  console.log(`\nSupabase project: ${process.env.SUPABASE_URL}\n`);
  const auth = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (auth.error) {
    console.log(`✗ Cannot use the service role key: ${auth.error.message}\n`);
    process.exit(1);
  }
  console.log('✓ Connected with the service role key');

  for (const [table, cols] of Object.entries(TABLES)) {
    const { error, count } = await supabase.from(table).select(cols, { count: 'exact' }).limit(1);
    if (error) {
      ok = false;
      const hint = /^(admin_|ai_usage)/.test(table) ? ' → run backend/supabase/admin.sql' : '';
      console.log(`✗ ${table}: ${error.message}${hint}`);
    } else console.log(`✓ ${table} (${count ?? 0} rows)`);
  }

  const admins = await supabase.from('admin_users').select('email, role, is_active');
  if (!admins.error) {
    const active = admins.data.filter((a) => a.is_active);
    if (active.length) console.log(`✓ Admins: ${active.map((a) => `${a.email} (${a.role})`).join(', ')}`);
    else {
      ok = false;
      console.log('! No active admins yet → npm run admin:add -- you@example.com');
    }
  }

  const pay = paystack.config();
  console.log(pay.enabled ? `✓ Payments: Paystack ${pay.mode} mode (revenue figures use ${pay.mode} payments)` : `! Payments are off (${pay.reason}); revenue shows live payments only`);
  console.log(llm.isConfigured() ? '✓ AI: Groq key set (AI usage is recorded for the Monitoring page)' : '! AI: no GROQ_API_KEY (rule-based answers; AI usage stays at 0)');
  console.log(ok ? '\nEverything the admin portal needs is in place.\n' : '\nFix the items marked ✗ / ! above, then run this again.\n');
  process.exit(ok ? 0 : 1);
})();
