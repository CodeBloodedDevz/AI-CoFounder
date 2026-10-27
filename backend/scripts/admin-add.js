// Gives an EXISTING account (one that can log in to the app, or one made in Supabase → Authentication →
// Users) access to the admin portal.
//   npm run admin:add -- you@example.com              super admin (can also delete records)
//   npm run admin:add -- you@example.com --admin      admin (everything except deleting records)
//   npm run admin:add -- you@example.com --remove     takes admin access away
// (In PowerShell, if the email is not passed through, use: node scripts/admin-add.js you@example.com)

const supabase = require('../src/supabaseClient');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const remove = process.argv.includes('--remove');
  const role = process.argv.includes('--admin') ? 'admin' : 'super_admin';
  if (!email.includes('@')) {
    console.error('\nUsage:  node scripts/admin-add.js you@example.com [--admin | --remove]\n');
    process.exit(1);
  }

  let user = null;
  for (let page = 1; page <= 100 && !user; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error(`\nCould not read users: ${error.message}\n`);
      process.exit(1);
    }
    user = data.users.find((u) => String(u.email || '').toLowerCase() === email) || null;
    if (data.users.length < 1000) break;
  }
  if (!user) {
    console.error(`\nNo account with the email ${email}.`);
    console.error('Register it in the app first, or create it in Supabase → Authentication → Users (tick "Auto Confirm User").\n');
    process.exit(1);
  }

  const fail = (error) => {
    console.error(`\n${error.message}`);
    if (/admin_users/.test(error.message)) console.error('Run backend/supabase/admin.sql in the Supabase SQL Editor first.');
    process.exit(1);
  };

  if (remove) {
    const { error } = await supabase.from('admin_users').update({ is_active: false }).eq('user_id', user.id);
    if (error) fail(error);
    console.log(`\n${email} can no longer sign in to the admin portal.\n`);
    return;
  }

  const meta = user.user_metadata || {};
  const { error } = await supabase.from('admin_users').upsert(
    { user_id: user.id, email: user.email, full_name: meta.full_name || meta.name || email.split('@')[0], role, is_active: true },
    { onConflict: 'user_id' }
  );
  if (error) fail(error);
  console.log(`\n${email} is now ${role === 'super_admin' ? 'a super admin' : 'an admin'}. Sign in to the admin portal with the same password.\n`);
})();
