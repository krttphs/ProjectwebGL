const SUPABASE_URL = "https://kwqxukrwlkrrcyrrbxbo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cXh1a3J3bGtycmN5cnJieGJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNjU2ODIsImV4cCI6MjA3NDc0MTY4Mn0.JVxlxUPnoa5C0TG1w1OyFn95QuLfip9lT683Z1SUo5Q";

window.supabase = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
