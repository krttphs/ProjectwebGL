const {createClient} = require("@supabase/supabase-js")
const env = require("dotenv")
env.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY

if(!SUPABASE_URL || !SUPABASE_KEY){
    throw new Error("Supabase URL or KEY is missing in .env")
}

const supabase = createClient(SUPABASE_URL,SUPABASE_KEY)

module.exports = supabase