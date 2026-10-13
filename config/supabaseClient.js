const {createClient} = require("@supabase/supabase-js")
const env = require("dotenv")
env.config()

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, opts);

module.exports = supabase;
module.exports.supabaseAuth = supabaseAuth;