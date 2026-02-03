const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

//middleware ตรวจสอบสิทธิ์ก่อน
router.use(async (req, res, next) => {
  const token = req.cookies.token;
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = user;
  next();
});

// เปิดแชทกับเพื่อน (หา room เดิม / สร้างใหม่)
router.post("/open", async (req, res) => {
  const userId = req.user.id;
  const { friendId } = req.body;

  if (!friendId) {
    return res.status(400).json({ error: "friendId is required" });
  }

  // จัดลำดับ user กัน room ซ้ำ (A-B = B-A)
  const user1 = userId < friendId ? userId : friendId;
  const user2 = userId < friendId ? friendId : userId;

  // หา room ที่มีอยู่แล้ว
  const { data: existingRoom, error: findError } = await supabase
    .from("chat_rooms")
    .select("id")
    .eq("user1", user1)
    .eq("user2", user2)
    .maybeSingle();

  if (findError) {
    return res.status(500).json(findError);
  }

  if (existingRoom) {
    return res.json({ roomId: existingRoom.id });
  }

  // ถ้าไม่มี -> สร้างใหม่
  const { data: newRoom, error: createError } = await supabase
    .from("chat_rooms")
    .insert({
      user1,
      user2,
      last_message_at: new Date(),
    })
    .select()
    .single();

  if (createError) {
    return res.status(500).json(createError);
  }

  res.json({ roomId: newRoom.id });
});

//โหลดประวัติข้อความทั้งหมดใน room เรียงจากเก่า → ใหม่
router.get("/:roomId/messages", async (req, res) => {
  const { roomId } = req.params;

  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json(error);
  res.json(data);
});

//ส่งข้อความ
router.post("/send", async (req, res) => {
  const { roomId, message } = req.body;
  const senderId = req.user.id;

  const { error } = await supabase.from("chat_messages").insert({
    room_id: roomId,
    sender_id: senderId,
    message,
  });

  // update last_message_at
  await supabase
    .from("chat_rooms")
    .update({ last_message_at: new Date() })
    .eq("id", roomId);

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

module.exports = router;
