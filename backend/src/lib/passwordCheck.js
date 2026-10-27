// Checks an email + password against Supabase Auth on the server, without touching the shared admin client
// (signing in on it would replace its service-role session). A throwaway client is used and its session is
// ended straight away (this session only: the person's other devices stay logged in).
//   -> 'ok' | 'unconfirmed' (correct password, account not confirmed yet) | 'wrong'
const { createClient } = require('@supabase/supabase-js');

async function checkPassword(email, password) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (!error) {
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    return data?.user ? 'ok' : 'wrong';
  }
  // Supabase only says "email not confirmed" after the password was accepted.
  if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message || '')) return 'unconfirmed';
  if (error.status >= 500 || error.code === 'unexpected_failure') {
    const e = new Error('Could not check the password right now.');
    e.status = 503;
    throw e;
  }
  return 'wrong';
}

module.exports = { checkPassword };
