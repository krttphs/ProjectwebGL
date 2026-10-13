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
    .insert({
      room_id: newRoomId,
      player_id: userId
    });

  return newRoomId;
}

async function countPlayers(roomId) {
  const { count } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  return count || 0;
}

router.post("/find-match", requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. ยังค้างอยู่ในห้องที่ยังไม่เริ่มไหม → ถ้าใช่ กลับไปห้องเดิม
    const { data: myRows, error: myErr } = await supabase
      .from("room_players")
      .select("room_id")
      .eq("player_id", userId);
    if (myErr) throw myErr;

    const myRoomIds = (myRows || []).map((r) => r.room_id);
    if (myRoomIds.length > 0) {
      const { data: myRoom, error: roomErr } = await supabase
        .from("game_rooms")
        .select("id, leader_id")
        .in("id", myRoomIds)
        .in("status", ["waiting", "full"])
        .limit(1)
        .maybeSingle();
      if (roomErr) throw roomErr;

      if (myRoom) {
        return res.json({
          roomId: myRoom.id,
          isLeader: myRoom.leader_id === userId,
          playerCount: await countPlayers(myRoom.id),
        });
      }
    }

    // 2. หาห้องว่างของคนอื่น
    const { data: rooms, error: searchError } = await supabase
      .from("game_rooms")
      .select("id")
      .eq("status", "waiting")
      .neq("leader_id", userId)
      .limit(1);
    if (searchError) throw searchError;

    if (rooms && rooms.length > 0) {
      const roomId = rooms[0].id;
      const count = await countPlayers(roomId);

      if (count < 4) {
        const { error: joinErr } = await supabase
          .from("room_players")
          .insert({ room_id: roomId, player_id: userId });
        if (joinErr) throw joinErr;

        if (count + 1 >= 4) {
          await supabase.from("game_rooms").update({ status: "full" }).eq("id", roomId);
        }

        return res.json({ roomId, isLeader: false, playerCount: count + 1 });
      }
    }

    // 3. ไม่มีห้องว่าง → สร้างใหม่
    const roomId = await createRoom(userId);
    return res.json({ roomId, isLeader: true, playerCount: 1 });
  } catch (error) {
    console.error("Find match error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/start", requireAuth, async (req, res) => {

  const roomId = req.body.roomId;
  const userId = req.user.id;

  const {
    morning_time,
    noon_time,
    evening_time
  } = req.body;

  try {

    const { error } = await supabase
      .from("game_rooms")
      .update({
        status: "loading",
        morning_time: morning_time,
        noon_time: noon_time,
        evening_time: evening_time
      })
      .eq("id", roomId)
      .eq("leader_id", userId);

    if (error) throw error;

    res.json({
      success: true
    });

  } catch (err) {

    console.error("Start game failed: ", err);

    res.status(500).json({
      error: "Failed to start game"
    });

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

      await supabase
        .from("room_players")
        .delete()
        .eq("room_id", roomId);

      await supabase
        .from("game_rooms")
        .delete()
        .eq("id", roomId);

    } else {

      await supabase
        .from("room_players")
        .delete()
        .eq("room_id", roomId)
        .eq("player_id", userId);

      if (room?.status === "full") {

        await supabase
          .from("game_rooms")
          .update({
            status: "waiting"
          })
          .eq("id", roomId);

      }

    }

    res.json({
      success: true
    });

  } catch (err) {

    console.error("Error leaving room:", err);

    res.status(500).json({
      error: "Server error"
    });

  }

});

router.get("/:roomId/players", requireAuth, async (req, res) => {

  try {

    const { count } = await supabase
      .from("room_players")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("room_id", req.params.roomId);

    res.json({
      count: count || 0
    });

  } catch (error) {

    res.status(500).json({
      error: "Server error"
    });

  }

});

module.exports = router;