require("dotenv").config();

console.log("URL loaded:", !!process.env.SUPABASE_URL);
console.log(
  "SERVICE ROLE KEY loaded:",
  !!process.env.SUPABASE_SERVICE_ROLE_KEY
);