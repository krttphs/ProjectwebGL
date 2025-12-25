const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

// Route Register
router.post("/register", async (req, res) => {
  const { tempEmail, tempPassword, username } = req.body; // Supabase ใช้ email เป็นหลัก
  if (!tempEmail || !tempPassword || !username) {
    return res.status(400).json({ error: "กรุณากรอก Email และ Password และ username ให้ครบถ้วน" });
  }

  const { data, error } = await supabase.auth.signUp({
    email: tempEmail,
    password: tempPassword,
    options: {
      //ส่ง username เข้าไปเป็น data (Metadata)
      data: {
        username: username 
      }
    }
  });

  if (error && error.message !== "Database error saving new user") return res.status(400).json({ error: error.message });
  if(data.user){
    res.status(201).json({ message: "สมัครสมาชิกสำเร็จ", user: data.user });
  } else {
    res.status(400).json({ error: "Username ซ้ำ" });
  }
  
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

router.get("/me", async(req,res)=>{
  const token = req.cookies.token
  const {data:{user}, error} = await supabase.auth.getUser(token)
  if(error || !user){
    return res.status(401).json({ error: "Token ไม่ถูกต้อง หรือหมดอายุ" });
  }
  res.json({
    email: user.email,
    id: user.id,
    username: user.user_metadata.username || "Guest"
  })
})

router.post("/logout", (req, res) => {
    res.clearCookie("token"); // ลบ Cookie ออก
    res.json({ message: "ออกจากระบบแล้ว" });
});

module.exports = router;