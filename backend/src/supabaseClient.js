// Always read backend/.env, whichever folder the server is started from.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill in your project values.'
  );
}

// IMPORTANT: this uses the SERVICE ROLE key, which bypasses Row Level
// Security. That's fine here because this file only runs on our own
// server (never shipped to the phone), and every route below manually
// checks that the logged-in user owns the business_id it's touching
// before it reads or writes anything.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = supabase;