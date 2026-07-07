const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");
const { requireAuth } = require("../middleware/authMiddleware");

router.post("/updatePlayerScore", requireAuth, async (req, res) => {
  try {
    const roomId = req.body.roomId;
    const userId = req.user.id;
    const newScore = req.body.score;

    await supabase
      .from("room_players")
      .update({ score: newScore })
      .eq("room_id", roomId)
      .eq("player_id", userId);

    res.json({ success: true });
  } catch (err) {
    console.error("update score err: ", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get("/room/:roomId", requireAuth, async (req, res) => {
  try {
    const { data: room, error } = await supabase
      .from("game_rooms")
      .select("end_time")
      .eq("id", req.params.roomId)
      .single();

    if (error) throw error;
    res.json(room);
  } catch (err) {
    console.error("fetch room error: ", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/endgame/:roomId", requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from("game_rooms")
      .update({ status: "end" })
      .eq("id", req.params.roomId);
    if (error) throw error;
    const { data: playerData, error: playerError } = await supabase
      .from("room_players")
      .select("score,reward_claimed")
      .eq("room_id", req.params.roomId)
      .eq("player_id", req.user.id)
      .single();

    if (playerData && playerData.score > 0 && playerData.reward_claimed === false) {
      const { error: updateScoreError } = await supabase.rpc("add_coins", {
        user_id: req.user.id,
        amount: playerData.score,
      });

      if(updateScoreError) throw updateScoreError;
      
      await supabase
      .from("room_players")
      .update({reward_claimed:true})
      .eq("room_id",req,params.roomId)
      .eq("player_id",req.user.id)
      
    }

    res.json({ success: true });
  } catch (err) {
    console.error("End game error.", err);
    res
      .status(500)
      .json({ error: "Unable to end the game messaging from server." });
  }
});

module.exports = router;
