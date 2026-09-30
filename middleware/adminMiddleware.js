const supabaseAdmin = require("../config/supabaseAdmin");
const { requireAuth } = require("./authMiddleware");

// เช็ค role จาก DB ทุก request (ถอดสิทธิ์แล้วมีผลทันที)
async function checkAdmin(req, res, next) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", req.user.id)
    .single();

  if (error || data?.role !== "admin") {
    if (req.originalUrl.startsWith("/api/")) {
      return res.status(403).json({ error: "Admin only" });
    }
    return res.redirect("/mainmenu");
  }
  next();
}

// ใช้เป็น middleware ได้เลย: router.use(requireAdmin) หรือ app.get('/admin', requireAdmin, ...)
const requireAdmin = [requireAuth, checkAdmin];

module.exports = { requireAdmin };
