const supabase = require("../config/supabaseClient"); // อย่าลืม require supabase ให้ถูก path

const requireAuth = async (req, res, next) => {
  const token = req.cookies.token;

  const handleUnauthorized = () => {
    // ถ้า Request เป็น API ให้ส่ง JSON ตอบกลับไป
    if (req.originalUrl.startsWith("/api/")) {
      return res
        .status(401)
        .json({ error: "Unauthorized: Token ไม่ถูกต้องหรือหมดอายุ" });
    }
    return res.redirect("/login");
  };

  if (!token) {
    return handleUnauthorized();
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error("Supabase Auth Error:", error?.message);
      return handleUnauthorized();
    }
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 60 * 60 * 1000,
    });
    req.user = user;
    next();
  } catch (err) {
    console.error("Middleware Error:", err.message);
    return handleUnauthorized();
  }
};

const hasAuth = (req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    if (req.originalUrl.startsWith("/api/")) {
      return res.status(403).json({ error: "คุณเข้าสู่ระบบอยู่แล้ว!" });
    }
    return res.redirect("/index");
  }
  next();
};

module.exports = { requireAuth, hasAuth };
