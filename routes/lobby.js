const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

const { requireAuth } = require("../middleware/authMiddleware");

router.post("/find-match", requireAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Unauthorized: ไม่พบข้อมูลผู้ใช้" });
    }

    const userId = req.user.id;

    // หาห้องที่ยัง 'waiting' อยู่
    const { data: rooms, error: searchError } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("status", "waiting")
      .limit(1);

    if (searchError) throw searchError;

    let roomId;
    let isLeader = false;

    if (rooms && rooms.length > 0) {
      roomId = rooms[0].id;
      await supabase
        .from("room_players")
        .insert({ room_id: roomId, player_id: userId });
    } else {
      isLeader = true;
      const { data: newRoom, error: createError } = await supabase
        .from("game_rooms")
        .insert({ leader_id: userId, status: "waiting" })
        .select()
        .single();

      if (createError) throw createError;

      roomId = newRoom.id;
      await supabase
        .from("room_players")
        .insert({ room_id: roomId, player_id: userId });
    }

    const { count } = await supabase
      .from("room_players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId);

    res.json({ roomId, isLeader, playerCount: count || 1 });
  } catch (error) {
    console.error("Find match error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/start", requireAuth, async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user.id;

  // อัปเดตสถานะห้องเป็น 'playing'
  await supabase
    .from("game_rooms")
    .update({ status: "playing" })
    .eq("id", roomId)
    .eq("leader_id", userId);

  res.json({ success: true });
});

router.delete("/leave", requireAuth, async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user.id;
  try {
    const { data: room } = await supabase
      .from("game_rooms")
      .select("leader_id")
      .eq("id", roomId)
      .single();

    if (room && room.leader_id === userId) {
      await supabase.from("room_players").delete().eq("room_id", roomId);
      await supabase.from("game_rooms").delete().eq("id", roomId);
    } else {
      await supabase
        .from('room_players')
        .delete()
        .eq('room_id', roomId)
        .eq('player_id', userId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error leaving room:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:roomId/players", requireAuth, async (req, res) => {
  try {
    const { count } = await supabase
      .from("room_players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", req.params.roomId);

    res.json({ count: count || 0 });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
