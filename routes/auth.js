const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");
const {requireAuth,hasAuth} = require("../middleware/authMiddleware");

// Route Register
router.post("/register",hasAuth, async (req, res) => {
  const { tempEmail, tempPassword, username } = req.body; // Supabase ใช้ email เป็นหลัก
  if (!tempEmail || !tempPassword || !username) {
    return res
      .status(400)
      .json({ error: "กรุณากรอก Email และ Password และ username ให้ครบถ้วน" });
  }

  const { data: existing_username, error: checkError_username } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existing_username) {
    return res.status(400).json({ error: "Username ซ้ำ" });
  }

  if (checkError_username) return res.status(500).json({ error: "Database error" });
  
  const { data: existing_email, error: checkError_email } = await supabase
    .from("users")
    .select("id")
    .eq("email", tempEmail)
    .maybeSingle();

  if (existing_email) {
    return res.status(400).json({ error: "Email นี้ถูกใช้งานแล้ว" });
  }

  if (checkError_email) return res.status(500).json({ error: "Database error" });

  const { data, error } = await supabase.auth.signUp({
    email: tempEmail,
    password: tempPassword,
  });

  if (error) return res.status(400).json({ error: error.message });

  if (!data || !data.user) {
    return res
      .status(500)
      .json({ error: "สมัครสมาชิกไม่สำเร็จ (No user data returned)" });
  }

  const {error:insertError} = await supabase.from("users").upsert({
    id: data.user.id,
    email: tempEmail,
    username,
    coins: 0,
  });

  if (insertError) return res.status(400).json({ error: insertError.message });

  res.status(201).json({ message: "สมัครสมาชิกสำเร็จ", user: data.user });
});

// Route Login
router.post("/login", hasAuth,async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) return res.status(401).json({ error: error.message });
  res.cookie("token", data.session.access_token, {
    httpOnly: true, // httpOnly: true แปลว่า JavaScript ฝั่ง Client จะแอบอ่านไม่ได้
    maxAge: 60 * 60 * 1000, // maxAge: อายุของ Cookie
  });

  res.json({ message: "เข้าสู่ระบบสำเร็จ", user: data.user });
});

//route สำหรับไว้ดึง email id username
router.get("/me", requireAuth,async (req, res) => {
  const userId = req.user.id;
  const userEmail = req.user.email;

  // ดึงข้อมูล profile จาก table users 
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("username, coins")
    .eq("id", req.user.id)
    .single();

  if (profileError) {
    return res.status(500).json({ error: "ไม่พบข้อมูลผู้ใช้" });
  }

  res.json({
    id: userId,
    email: userEmail,
    username: profile.username,
    coins: profile.coins,
  });
});

router.post("/logout",requireAuth, (req, res) => {
  res.clearCookie("token");
  res.json({ message: "ออกจากระบบแล้ว" });
});

module.exports = router;
