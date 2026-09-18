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
      .select("end_time, morning_time, noon_time, evening_time, status")
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
    const { roomId } = req.params;
    const userId = req.user.id;
 
    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .select("status, end_time, morning_time, noon_time, evening_time")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const isTimeUp = new Date() >= new Date(room.end_time);

    if (room.status === "playing" && isTimeUp) {
      const totalTime = (room.morning_time || 0) + (room.noon_time || 0) + (room.evening_time || 0);

      await supabase
        .from("game_rooms")
        .update({ status: "finished", duration_time: totalTime })
        .eq("id", roomId)
        .eq("status", "playing");
        
      room.status = "finished";
    }

    if (room.status !== "finished") {
      return res.status(400).json({ error: "Game has not finished yet" });
    }

    const { data: rewardData, error: rewardError } = await supabase.rpc("claim_player_reward", {
      p_room_id: roomId,
      p_player_id: userId,
    });

    if (rewardError) throw rewardError;

    res.json({ success: true, result: rewardData });
  } catch (err) {
    console.error("End game error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/ready", requireAuth, async (req, res) => {
  const { roomId } = req.body;
  const userId = req.user.id;

  const { error: upsertError } = await supabase
    .from("player_ready_status")
    .upsert({ room_id: roomId, player_id: userId, is_ready: true });

  if (upsertError) return res.status(500).json({ error: upsertError.message });

  const { data: room, error: roomError } = await supabase
    .from("game_rooms")
    .select("status, morning_time, noon_time, evening_time")
    .eq("id", roomId)
    .single();

  if (roomError) return res.status(500).json({ error: roomError.message });

  const { count: readyCount } = await supabase
    .from("player_ready_status")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("is_ready", true);

  const { count: totalPlayers } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);

  const safeReady = readyCount ?? 0;
  const safeTotal = totalPlayers ?? 0;

  if (safeTotal > 0 && safeReady >= safeTotal && room.status === "loading") {
    const totalSeconds = (room.morning_time || 0) + (room.noon_time || 0) + (room.evening_time || 0);
    const timeEnd = new Date(Date.now() + totalSeconds * 1000).toISOString();

    await supabase
      .from("game_rooms")
      .update({ status: "playing", end_time: timeEnd })
      .eq("id", roomId);
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

router.patch("/updateProgress",requireAuth,async(req,res)=>{
  try{
    const {roomId , progress} = req.body
    const { data, error } = await supabase.rpc("update_room_progress", {
      p_room_id: roomId,
      p_progress: progress,
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
  } catch(error){
    res.status(500).json({error:error.message})
  }
})

module.exports = router;
