const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

// Route Register
router.post("/register", async (req, res) => {
  const { tempEmail, tempPassword, username } = req.body; // Supabase ใช้ email เป็นหลัก
  if (!tempEmail || !tempPassword || !username) {
    return res
      .status(400)
      .json({ error: "กรุณากรอก Email และ Password และ username ให้ครบถ้วน" });
  }

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .single();

  if (existing) {
    return res.status(400).json({ error: "Username ซ้ำ" });
  }
  const { data: existingEmail } = await supabase
    .from("users")
    .select("id")
    .eq("email", tempEmail)
    .single();

  if (existingEmail) {
    return res.status(400).json({ error: "Email นี้ถูกใช้งานแล้ว" });
  }

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

  const {data:insertError} = await supabase.from("users").upsert({
    id: data.user.id,
    email: tempEmail,
    username,
    coins: 0,
  });

  if (insertError) return res.status(400).json({ error: insertError.message });

  res.status(201).json({ message: "สมัครสมาชิกสำเร็จ", user: data.user });
});

// Route Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) return res.status(401).json({ error: error.message });
  res.cookie("token", data.session.access_token, {
    httpOnly: true, // httpOnly: true แปลว่า JavaScript ฝั่ง Client จะแอบอ่านไม่ได้
    maxAge: 5 * 60 * 1000, // maxAge: อายุของ Cookie ในที่นี้ตั้ง 5 นาที
  });

  res.json({ message: "เข้าสู่ระบบสำเร็จ", user: data.user });
});

//route สำหรับไว้ดึง email id username
router.get("/me", async (req, res) => {
  const token = req.cookies.token;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: "Token ไม่ถูกต้อง หรือหมดอายุ" });
  }

  // ดึงข้อมูล profile จาก table users 
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("username, coins")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return res.status(500).json({ error: "ไม่พบข้อมูลผู้ใช้" });
  }

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 5 * 60 * 1000,
  });

  res.json({
    id: user.id,
    email: user.email,
    username: profile.username,
    coins: profile.coins,
  });
});

router.post("/logout", (req, res) => {
  res.clearCookie("token"); // ลบ Cookie ออก
  res.json({ message: "ออกจากระบบแล้ว" });
});

module.exports = router;
