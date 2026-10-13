const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");
const { requireAuth } = require("../middleware/authMiddleware");

function normalize(s) {
  return (s || "")
    .replace(/\r\n/g, "\n") // Windows newline → ปกติ
    .split("\n")
    .map((line) => line.trimEnd()) // ตัดช่องว่างท้ายบรรทัด
    .join("\n")
    .trim(); // ตัดบรรทัดว่างหัว-ท้าย
}

const SCORE_CORRECT = 50;
const SCORE_WRONG = -25;

async function finishQuest(roomId, playerId, questId, delta) {
  const { data, error } = await supabase.rpc("finish_quest", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_quest_id: questId,
    p_delta: delta,
  });
  if (error) throw error;
  return data; // คะแนนใหม่ หรือ null ถ้าส่งไปแล้ว
}

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
      const totalTime =
        (room.morning_time || 0) +
        (room.noon_time || 0) +
        (room.evening_time || 0);

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

    const { data: rewardData, error: rewardError } = await supabase.rpc(
      "claim_player_reward",
      {
        p_room_id: roomId,
        p_player_id: userId,
      },
    );

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
    const totalSeconds =
      (room.morning_time || 0) +
      (room.noon_time || 0) +
      (room.evening_time || 0);
    const timeEnd = new Date(Date.now() + totalSeconds * 1000).toISOString();

    await supabase
      .from("game_rooms")
      .update({ status: "playing", end_time: timeEnd })
      .eq("id", roomId);
  }

  res.json({ success: true });
});

router.post("/quests/random", requireAuth, async (req, res) => {
  const { roomId } = req.body;
  const levels = ["easy", "medium", "hard"];
  const randomLevel = levels[Math.floor(Math.random() * levels.length)];

  const { data, error } = await supabase.rpc("get_random_quest", {
    diff_level: randomLevel,
  });
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) {
    return res
      .status(404)
      .json({ message: "ไม่พบโจทย์ในระดับความยาก: " + randomLevel });
  }
  const { data: updated, error: error_update } = await supabase
    .from("room_players")
    .update({ current_quest_id: data[0].id })
    .eq("room_id", roomId)
    .eq("player_id", req.user.id)
    .is("current_quest_id", null)   // สุ่มได้เฉพาะตอนไม่มีโจทย์ค้าง
    .select("player_id");
  if (error_update)
    return res.status(500).json({ error: error_update.message });
  if (!updated || updated.length === 0)
    return res.status(409).json({ error: "มีโจทย์ค้างอยู่ ต้องส่งหรือยอมแพ้ก่อน" });
  const {
    id,
    title,
    description,
    show_expect_output,
    input_run,
    level,
    setup_code_python,
    setup_code_js,
    setup_code_java,
  } = data[0];
  return res.json({
    id,
    title,
    description,
    show_expect_output,
    input_run,
    level,
    setup_code_python,
    setup_code_js,
    setup_code_java,
  });
});

router.patch("/mycomputer", requireAuth, async (req, res) => {
  try {
    const { myComputer_id, roomId } = req.body;
    const { data, error: find_error } = await supabase
      .from("room_players")
      .select("computer_id")
      .eq("player_id", req.user.id)
      .eq("room_id", roomId)
      .single();
    if (data && data.computer_id) {
      return res.json({ computer_id: data.computer_id });
    }
    if (find_error) throw find_error;
    const { data: takenComputer } = await supabase
      .from("room_players")
      .select("player_id")
      .eq("room_id", roomId)
      .eq("computer_id", myComputer_id);

    if (takenComputer && takenComputer.length > 0) {
      return res
        .status(400)
        .json({ message: "คอมพิวเตอร์เครื่องนี้ถูกยึดไปแล้ว" });
    }

    const { error } = await supabase
      .from("room_players")
      .update({ computer_id: myComputer_id })
      .eq("room_id", roomId)
      .eq("player_id", req.user.id);
    if (error) throw error;
    res.json({ computer_id: myComputer_id });
  } catch (error) {
    console.error("Update computer id error: ", error);
    res.status(500).json({
      message: "ไม่สามารถบันทึกหมายเลขเครื่องได้: ",
      error: error.message,
    });
  }
});

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

router.post("/giveup", requireAuth, async (req, res) => {
  try {
    const { roomId } = req.body;
    const { data: me, error } = await supabase
      .from("room_players")
      .select("current_quest_id")
      .eq("room_id", roomId)
      .eq("player_id", req.user.id)
      .single();
    if (error) throw error;
    if (!me?.current_quest_id) {
      return res.status(400).json({ error: "ไม่มีโจทย์ให้ยอมแพ้" });
    }

    const score = await finishQuest(roomId, req.user.id, me.current_quest_id, SCORE_WRONG);
    if (score === null) {
      return res.status(409).json({ error: "โจทย์นี้จบไปแล้ว" });
    }
    res.json({ score });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/computerCode/:roomId/:comId", requireAuth, async (req, res) => {
  try {
    const { roomId, comId } = req.params;
    const { data, error } = await supabase
      .from("room_players")
      .select("current_quest_id,code_part_2,code_part_3")
      .eq("room_id", roomId)
      .eq("computer_id", comId)
      .single();
    if (error) throw error;
    if (data && data.current_quest_id) {
      const { data: questData, error: questError } = await supabase
        .from("quests")
        .select(
          "id, title, description, show_expect_output, input_run, level, setup_code_python, setup_code_js, setup_code_java",
        )
        .eq("id", data.current_quest_id)
        .single();
      if (questError) throw questError;
      return res.json({ code: data, quest: questData });
    }
    return res.json({ code: data, quest: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/code-part2-part3", requireAuth, async (req, res) => {
  try {
    const { roomId, computerId, codePart2, codePart3 } = req.body;
    const { error } = await supabase
      .from("room_players")
      .update({ code_part_2: codePart2, code_part_3: codePart3 })
      .eq("room_id", roomId)
      .eq("computer_id", computerId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/updateProgress", requireAuth, async (req, res) => {
  try {
    const { roomId, progress } = req.body;
    const { data, error } = await supabase.rpc("update_room_progress", {
      p_room_id: roomId,
      p_progress: progress,
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/languages", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("languages")
      .select("name, judge0_id");
    if (error) {
      throw error;
    }
    if (data) {
      res.json(data || []);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/submissions", requireAuth, async (req, res) => {
  const { source_code, language_id, roomId, computerId, type } = req.body;
  if (!["62", "63", "71"].includes(String(language_id)))
    return res.status(400).json({ error: "unsupported language" });
  if (typeof source_code !== "string" || !roomId || !computerId) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
  }
  try {
    //หาโจทย์จากเครื่อง (เพื่อนจะได้กดรันได้ด้วย)
    const { data: owner, error: ownerErr } = await supabase
      .from("room_players")
      .select("player_id, current_quest_id")
      .eq("room_id", roomId)
      .eq("computer_id", computerId)
      .single();
    if (ownerErr || !owner?.current_quest_id) {
      return res.status(400).json({ error: "เครื่องนี้ยังไม่มีโจทย์" });
    }

    //Submit ได้เฉพาะเจ้าของเครื่อง
    if (type === "submit" && owner.player_id !== req.user.id) {
      return res.status(403).json({ error: "ส่งได้เฉพาะเจ้าของเครื่อง" });
    }

    const sendSubmitResult = async (success, status) => {
      const score = await finishQuest(
        roomId,
        req.user.id,
        owner.current_quest_id,
        success ? SCORE_CORRECT : SCORE_WRONG,
      );
      if (score === null) {
        return res.status(409).json({ error: "โจทย์นี้ถูกส่งไปแล้ว" });
      }
      return res.json({ success, status, score });
    };

    //ดึง input / คำตอบจาก DB
    const { data: quest, error: questErr } = await supabase
      .from("quests")
      .select("input_run, input_submit, expected_output")
      .eq("id", owner.current_quest_id)
      .single();
    if (questErr) throw questErr;

    //ส่งไปให้ judge service รัน
    const stdin = type === "submit" ? quest.input_submit : quest.input_run;
    const judgeRes = await fetch(`${process.env.JUDGE_URL}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-judge-secret": process.env.JUDGE_SECRET,
      },
      body: JSON.stringify({ source_code, language_id, stdin: stdin ?? "" }),
      signal: AbortSignal.timeout(90_000), // เผื่อ judge ตื่นจากหลับ
    });
    if (!judgeRes.ok) throw new Error("judge error " + judgeRes.status);
    const r = await judgeRes.json();

    //คอมไพล์ไม่ผ่าน
    if (r.status.id === 6) {
      if (type === "submit") return sendSubmitResult(false, r.status);
      return res.json(r);
    }

    //เทียบคำตอบ
    if (type === "submit") {
      const success =
        r.status.id === 3 &&
        normalize(r.stdout) === normalize(quest.expected_output);
      return sendSubmitResult(success, r.status);
    }

    return res.json({
      stdout: r.stdout,
      stderr: r.stderr,
      time: r.time,
      status: r.status,
    });
  } catch (error) {
    console.error("submission error:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
