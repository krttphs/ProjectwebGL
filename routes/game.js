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
      .select("end_time, morning_time, noon_time, evening_time")
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
      
      const { error: claimError } = await supabase
      .from("room_players")
      .update({reward_claimed:true})
      .eq("room_id",req.params.roomId)
      .eq("player_id",req.user.id)
      
      if(claimError) throw claimError
      
    }

    res.json({ success: true });
  } catch (err) {
    console.error("End game error.", err);
    res
      .status(500)
      .json({ error: "Unable to end the game messaging from server." });
  }
});

router.post("/ready", requireAuth, async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user.id;

  await supabase.from("player_ready_status").upsert({ room_id: roomId, player_id: userId, is_ready: true });

  const { count: readyCount } = await supabase.from("player_ready_status").select("*", {count: 'exact'}).eq("room_id", roomId).eq("is_ready", true);
  const { count: totalPlayers } = await supabase.from("room_players").select("*", {count: 'exact'}).eq("room_id", roomId);

  if (readyCount >= totalPlayers) {
    const {data:room} = await supabase.from("game_rooms").select("morning_time, noon_time, evening_time").eq("id",roomId).single()
    const totalSeconds = room.morning_time + room.noon_time + room.evening_time;
    const timeEnd = new Date(Date.now() + totalSeconds * 1000).toISOString();
    await supabase.from("game_rooms").update({ status: "playing", end_time: timeEnd }).eq("id", roomId);
  }
  res.json({ success: true });
});

router.post("/quests/random", requireAuth,async (req, res) => {
  const {roomId} = req.body
  const levels = ["easy","medium","hard"];
  const randomLevel = levels[Math.floor(Math.random() * levels.length)];

  const { data, error } = await supabase.rpc("get_random_quest", { diff_level: randomLevel });
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) {
    return res.status(404).json({ message: "ไม่พบโจทย์ในระดับความยาก: " + randomLevel });
  }
  const {error:error_update} = await supabase.from("room_players").update({"current_quest_id":data[0].id}).eq("room_id",roomId).eq("player_id",req.user.id)
  if (error_update) return res.status(500).json({ error: error_update.message });
  res.json(data[0]);
});

router.patch("/mycomputer",requireAuth,async(req,res)=>{
  try{
    const {myComputer_id,roomId} = req.body;
    const {data,error:find_error} = await supabase.from("room_players").select("computer_id").eq("player_id",req.user.id).eq("room_id",roomId).single()
    if(data && data.computer_id){
      return res.json({ computer_id: data.computer_id });
    }
    const { data: takenComputer } = await supabase
      .from("room_players")
      .select("player_id")
      .eq("room_id", roomId)
      .eq("computer_id", myComputer_id);

    if (takenComputer && takenComputer.length > 0) {
      return res.status(400).json({ message: "คอมพิวเตอร์เครื่องนี้ถูกยึดไปแล้ว" });
    }

    const {error} = await supabase.from("room_players").update({"computer_id":myComputer_id}).eq("room_id",roomId).eq("player_id",req.user.id)

    res.json({ computer_id: myComputer_id });
  } catch(error){
    console.error("Update computer id error: ", error);
    res.status(500).json({ message: "ไม่สามารถบันทึกหมายเลขเครื่องได้: ", error: error.message });
  }
})

router.get("/mycomputer/:roomId", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("room_players")
      .select("computer_id")
      .eq("room_id", req.params.roomId)
      .eq("player_id", req.user.id)
      .single();

    if (error) throw error;
    res.json({ computer_id: data?.computer_id || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/currentQuest",requireAuth,async(req,res)=>{
  try{
    const {roomId} = req.body
    const {error} = await supabase
    .from("room_players")
    .update({ 
        "current_quest_id": null, 
        "code_part_2": null,
        "code_part_3": null
      })
    .eq("room_id",roomId)
    .eq("player_id",req.user.id)
    if (error) throw error;
    res.json({success: true})
  } catch(error){
     res.status(500).json({ error: error.message });
  }
})

router.get("/computerCode/:roomId/:comId",requireAuth,async(req,res)=>{
  try{
    const {roomId,comId} = req.params
    const {data,error} = await supabase
    .from("room_players")
    .select("current_quest_id,code_part_2,code_part_3")
    .eq("room_id",roomId)
    .eq("computer_id",comId)
    .single()
    if(error) throw error;
    if(data && data.current_quest_id){
      const {data:questData,error:questError} = await supabase
      .from("quests")
      .select("*")
      .eq("id",data.current_quest_id)
      .single()
      if(questError) throw questError
      return res.json({code:data,quest:questData})
    }
    return res.json({code: data, quest: null})
  } catch(error){
    res.status(500).json({ error: error.message });
  }
})

router.patch("/code-part2-part3",requireAuth,async(req,res)=>{
  try{
    const {roomId,computerId,codePart2,codePart3} = req.body
    const {error} = await supabase
    .from("room_players")
    .update({"code_part_2":codePart2,"code_part_3":codePart3})
    .eq("room_id",roomId)
    .eq("computer_id",computerId)
    if(error) throw error
    res.json({success: true})
  } catch(error){
    res.status(500).json({ error: error.message });
  }
})

module.exports = router;
