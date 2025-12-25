const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

// Middleware: เช็คว่า Login หรือยัง
const checkAuth = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "No token provided" });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.user = user; // ฝากข้อมูล user ไว้ให้ route ถัดไปใช้
  next();
};

// API: บวกเหรียญ (เรียกใช้ coin_update RPC)
router.post("/add-coins", checkAuth, async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id; // ได้มาจาก Middleware ข้างบน

  // เรียกใช้ Function add_coins ใน Supabase 
  const { error } = await supabase.rpc("add_coins", { 
    user_id: userId, 
    amount: amount 
  });

  if (error) return res.status(500).json({ error: error.message });

  //ดึงยอดเงินล่าสุดส่งกลับไปอัปเดตหน้าเว็บ
  const { data: userData } = await supabase
    .from("users")
    .select("coins")
    .eq("id", userId)
    .single();

  res.json({ message: "ได้รับเหรียญแล้ว", newBalance: userData?.coins || 0 });
});

// API: ดูยอดเงิน เอาไว้โชว์หน้า Menu
router.get("/balance", checkAuth, async (req, res) => {
    try{
        const { data, error } = await supabase
            .from("users")
            .select("coins")
            .eq("id", req.user.id)
            .single();
    
        if (error) return res.status(500).json({ error: error.message });
        res.json({ coins: data ? data.coins : 0 });
    } catch(err){
        res.status(500).json({ error: "ดึงข้อมูลไม่สำเร็จ" });
    }
    
});

module.exports = router;