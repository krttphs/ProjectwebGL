const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

const { requireAuth } = require("../middleware/authMiddleware");

async function createRoom(userId) {
  const { data: newRoom, error: createError } = await supabase
    .from("game_rooms")
    .insert({ leader_id: userId, status: "waiting" })
    .select()
    .single();

  if (createError) throw createError;

  const newRoomId = newRoom.id;
  await supabase
    .from("room_players")
    .insert({ room_id: newRoomId, player_id: userId });

  return newRoomId;
}

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
    //rooms = [{id:"123",leader_id:"555",status:"waiting",created_at:"2026-06-07"}] , [{name:"krit",age:21},"b","c"]
    if (rooms && rooms.length > 0) {
      const { count } = await supabase
        .from("room_players")
        .select("*", { count: "exact", head: true })
        .eq("room_id", rooms[0].id);

      if (count < 4) {
        roomId = rooms[0].id;
        await supabase
          .from("room_players")
          .insert({ room_id: roomId, player_id: userId });

        if (count + 1 === 4) {
          await supabase
            .from("game_rooms")
            .update({ status: "full" })
            .eq("id", roomId);
        }
      } else {
        isLeader = true;
        roomId = await createRoom(userId);
      }
    } else {
      isLeader = true;
      roomId = await createRoom(userId);
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
  const roomId = req.body.roomId;
  const userId = req.user.id;
  const { morning_time, noon_time, evening_time } = req.body;
  try {

    const { error } = await supabase
      .from("game_rooms")
      .update({
        status: "loading",
        morning_time: morning_time,
        noon_time: noon_time,
        evening_time: evening_time,
      })
      .eq("id", roomId)
      .eq("leader_id", userId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("Start game failed: ", err);
    res.status(500).json({ error: "Failed to start game" });
  }
});

router.delete("/leave", requireAuth, async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user.id;
  try {
    const { data: room } = await supabase
      .from("game_rooms")
      .select("leader_id , status")
      .eq("id", roomId)
      .maybeSingle();

    if (room && room.leader_id === userId) {
      await supabase.from("room_players").delete().eq("room_id", roomId);
      await supabase.from("game_rooms").delete().eq("id", roomId);
    } else {
      await supabase
        .from("room_players")
        .delete()
        .eq("room_id", roomId)
        .eq("player_id", userId);

      if (room.status === "full") {
        await supabase
          .from("game_rooms")
          .update({ status: "waiting" })
          .eq("id", roomId);
      }
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

router.post("/ready", requireAuth, async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user.id;

  await supabase.from("player_ready_status").upsert({ room_id: roomId, player_id: userId, is_ready: true });

  const { count: readyCount } = await supabase.from("player_ready_status").select("*", {count: 'exact'}).eq("room_id", roomId).eq("is_ready", true);
  const { count: totalPlayers } = await supabase.from("room_players").select("*", {count: 'exact'}).eq("room_id", roomId);

  if (readyCount >= totalPlayers) {
    const {data:room} = (await supabase.from("game_rooms").select("morning_time, noon_time, evening_time")).eq("id",roomId).single()
    const totalSeconds = room.morning_time + room.noon_time + room.evening_time;
    const timeEnd = new Date(Date.now() + totalSeconds * 1000).toISOString();
    await supabase.from("game_rooms").update({ status: "playing", end_time: timeEnd }).eq("id", roomId);
  }
  res.json({ success: true });
});

module.exports = router;
