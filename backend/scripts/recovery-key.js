// Run:  npm run recovery-key -- person@example.com
// For the person who runs this server: gives a user who lost BOTH their password and their recovery key a new
// recovery key (their old key stops working). Only do this after you have confirmed who they are yourself
// (in person, or on a phone number you already know). The key is printed here once and not stored readable.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../src/supabaseClient');
const recovery = require('../src/lib/recovery');

(async () => {
  const email = recovery.normEmail(process.argv[2]);
  if (!email || !email.includes('@')) {
    console.log('Usage: npm run recovery-key -- person@example.com');
    process.exitCode = 1;
    return;
  }
  let user = null;
  for (let page = 1; page <= 20 && !user; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return console.log(`Could not read accounts: ${error.message}`);
    user = (data?.users || []).find((u) => String(u.email || '').toLowerCase() === email) || null;
    if ((data?.users || []).length < 200) break;
  }
  if (!user) {
    console.log(`No account with the email ${email}.`);
    process.exitCode = 1;
    return;
  }
  const key = await recovery.issueKey(email, user.id);
  console.log(`New recovery key for ${email}:\n\n    ${key}\n`);
  console.log('Give it to the account owner privately. They use it on "Forgot password?" to choose a new password.');
})();
