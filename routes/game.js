const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");
const { requireAuth } = require("../middleware/authMiddleware");

function normalize(s) {
  return (s || "")
    .replace(/\r\n/g, "\n") // Windows newline -> ปกติ
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

// ===== Server Heat (ค่าความร้อนของทั้งห้อง 0-100) =====
// submit ผิด / ยอมแพ้ (ได้ red ball) +heat ตามขั้น (เริ่ม 10 — ดูโควต้ารายวันด้านล่าง), ครบ 100 = overheat -> เกมจบทันที "You got fired" (ไม่ได้เหรียญ)
//   ลด heat ได้ด้วย mini game ที่ server terminal (heat กลับเป็น 0) — ทำได้ทุกเมื่อที่ heat > 0
const HEAT_MAX = 100;
const COOLING_COMMAND_COUNT = 5;
const COOLING_TIME_LIMIT_S = 40;
const COOLING_COMMANDS = [
  "fan --speed max",
  "coolant --flush",
  "sudo systemctl restart cooling",
  "kill -9 overheat",
  "temp --check",
  "rm -rf /tmp/cache",
  "service fan restart",
  "throttle --cpu 50",
  "vent --open all",
  "reboot --safe",
];

// heat เก็บใน DB -> ทุกคนในห้องเห็นค่าเดียวกัน แม้ต่อเข้า server คนละตัว (แบบเดียวกับ timer / day)
// และหน้าเว็บได้ค่าใหม่ทันทีผ่าน realtime ของ game_rooms
// ⚠️ ไม่ได้เพิ่มคอลัมน์ใหม่ (ไม่ใช้ SQL): ใช้คอลัมน์ game_rooms.max_players ที่ไม่ได้ถูกใช้ (เดิมเป็น 4 ทุกห้อง)
//    เก็บค่า heat แทน — เปลี่ยนที่เดียวตรง HEAT_COLUMN (หน้าเว็บ gameMode1.js ใช้ชื่อเดียวกัน)
const HEAT_COLUMN = "max_players";

function heatOf(room) {
  return Number(room?.[HEAT_COLUMN]) || 0;
}

async function getRoom(roomId) {
  const { data, error } = await supabase
    .from("game_rooms")
    .select(`status, ${HEAT_COLUMN}`)
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// จบเพราะ server overheat = โดนไล่ออก (ห้องจบแล้ว และ heat ค้างที่ 100)
function isFired(room) {
  return !!room && room.status === "finished" && heatOf(room) >= HEAT_MAX;
}

// เพิ่ม/ลด heat — ถ้าแตะ 100 = server overheat -> จบเกมทั้งห้อง (fired)
// compare-and-swap: อัปเดตเฉพาะเมื่อค่ายังเท่าเดิม ถ้าคนอื่นเปลี่ยนไปก่อนก็อ่านใหม่แล้วลองอีกรอบ
// (กันหลายคน submit ผิดพร้อมกันแล้วค่าหาย โดยไม่ต้องเขียน SQL function)
async function addRoomHeat(roomId, amount, reason) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await getRoom(roomId);
    if (!room || room.status !== "playing") return heatOf(room); // เกมไม่ได้เล่นอยู่ -> ไม่เปลี่ยน

    const before = heatOf(room);
    const heat = Math.min(HEAT_MAX, Math.max(0, before + amount));
    const { data: updated, error } = await supabase
      .from("game_rooms")
      .update({ [HEAT_COLUMN]: heat })
      .eq("id", roomId)
      .eq("status", "playing")
      .eq(HEAT_COLUMN, room[HEAT_COLUMN])
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) continue; // มีคนแก้ก่อน -> ลองใหม่

    console.log(`[heat] room ${roomId}: ${before} -> ${heat} (${reason})`);
    if (before < HEAT_MAX && heat >= HEAT_MAX) await fireRoom(roomId);
    return heat;
  }
  throw new Error("heat update conflict, please retry");
}

async function fireRoom(roomId) {
  const { data: room, error } = await supabase
    .from("game_rooms")
    .select("status, mode, started_at, end_time, morning_time, noon_time, evening_time, day_count")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!room || room.status !== "playing") return;

  // เล่นไปได้จริงกี่วินาที
  let played;
  if (isEndless(room)) {
    // Endless นับจากเวลาเริ่มเกมถึงตอนนี้
    played = Math.round((Date.now() - new Date(room.started_at).getTime()) / 1000);
  } else {
    // โหมดปกติ เวลาเต็ม - เวลาที่เหลือ
    const total = gameDurationSeconds(room);
    const remaining = room.end_time ? Math.max(0, (new Date(room.end_time) - Date.now()) / 1000) : 0;
    played = Math.max(0, Math.round(total - remaining));
  }

  const { error: updErr } = await supabase
    .from("game_rooms")
    .update({ status: "finished", duration_time: played })
    .eq("id", roomId)
    .eq("status", "playing");
  if (updErr) throw updErr;
  console.log(`[heat] room ${roomId}: SERVER OVERHEAT -> game over (fired) after ${played}s`);
}

// ===== โควต้ารายวัน (ทั้งห้องต้องส่งบอลเขียวให้ NPC ให้ครบในแต่ละวัน) =====
// วันที่ 1..7 ต้องส่ง 3 / 5 / 7 / 8 / 9 / 10 / 12 ลูก — วันไหนไม่ครบ heat ต่อการส่งผิดขึ้น 1 ขั้น
// 10 -> 20 -> 40 -> 80 -> 100 (ขึ้นอย่างเดียว ไม่ลด) · บอลแดงไม่นับ
// เก็บใน DB (ไม่เพิ่มคอลัมน์): game_rooms.progress = จำนวนบอลเขียวของวันนี้ (ทุกคนเห็นเท่ากันผ่าน realtime)
//                            game_rooms.difficulty = "q:<วัน (เริ่ม 0)>:<ขั้น heat>" (คอลัมน์เดิมไม่ได้ใช้)
const DAILY_QUOTA = [3, 5, 7, 8, 9, 10, 12];
const HEAT_STEPS = [10, 20, 40, 80, 100];
const QUOTA_STATE_COLUMN = "difficulty";
const ROOM_FIELDS = `status, mode, started_at, end_time, morning_time, noon_time, evening_time, day_count, progress, ${HEAT_COLUMN}, ${QUOTA_STATE_COLUMN}`;

// ===== Endless mode =====
// ไม่มีวันจบ เล่นไปจนกว่า heat ถึง 100
// โควต้าคิดต่อคน: วันแรก 1 ลูก/คน เพิ่มวันละ 0.25 จนถึง 2 ลูก/คน แล้วคูณจำนวนคนในห้อง
const ENDLESS_QUOTA_START = 1;
const ENDLESS_QUOTA_PER_DAY = 0.25;
const ENDLESS_QUOTA_MAX = 2;

function isEndless(room) {
  return room?.mode === "endless";
}

async function countPlayers(roomId) {
  const { count, error } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  if (error) throw error;
  return count || 0;
}

// โควต้าของวัน day (เริ่ม 0)
// โหมดปกติ: ดูจากตาราง DAILY_QUOTA / Endless: ต่อคน x จำนวนคนในห้องตอนนี้
async function quotaFor(roomId, room, day) {
  if (!isEndless(room)) {
    return DAILY_QUOTA[Math.min(Math.max(0, day), DAILY_QUOTA.length - 1)];
  }
  const perPlayer = Math.min(ENDLESS_QUOTA_MAX, ENDLESS_QUOTA_START + ENDLESS_QUOTA_PER_DAY * day);
  const players = await countPlayers(roomId);
  return Math.max(1, Math.round(perPlayer * players));
}

function parseQuotaState(value) {
  const m = /^q:(\d+):(\d+)$/.exec(value || "");
  return m ? { day: Number(m[1]), step: Number(m[2]) } : { day: 0, step: 0 };
}

function formatQuotaState(day, step) {
  return `q:${day}:${step}`;
}

// วันที่เท่าไรแล้ว (เริ่ม 0) จากเวลาจบเกม (end_time) — ตรงกับ Day ใน Unity
function currentDayIndex(room) {
  const dayLength = (room.morning_time || 0) + (room.noon_time || 0) + (room.evening_time || 0);
  // Endless ไม่มี end_time นับวันจากเวลาเริ่มเกม และไม่มีวันสุดท้าย
  if (isEndless(room)) {
    if (!room.started_at || dayLength <= 0) return 0;
    const elapsed = Date.now() - new Date(room.started_at).getTime();
    return Math.max(0, Math.floor(elapsed / (dayLength * 1000)));
  }
  const days = room.day_count || 1;
  if (!room.end_time || dayLength <= 0) return 0;
  const start = new Date(room.end_time).getTime() - dayLength * days * 1000;
  const index = Math.floor((Date.now() - start) / (dayLength * 1000));
  return Math.min(Math.max(0, index), days - 1);
}

function heatPerWrong(room) {
  const { step } = parseQuotaState(room?.[QUOTA_STATE_COLUMN]);
  return HEAT_STEPS[Math.min(step, HEAT_STEPS.length - 1)];
}

// ข้อมูลโควต้าส่งให้หน้าเว็บ
async function quotaInfo(roomId, room) {
  const { day, step } = parseQuotaState(room?.[QUOTA_STATE_COLUMN]);
  return {
    day,
    delivered: room?.progress ?? 0,
    quota: await quotaFor(roomId, room, day),
    heatStep: step,
    heatPerWrong: heatPerWrong(room),
    mode: room?.mode || "normal",
  };
}

// ปิดวันที่ผ่านไปแล้ว: วันไหนส่งไม่ครบโควต้า -> heat ต่อการส่งผิดขึ้น 1 ขั้น แล้วเริ่มนับวันใหม่จาก 0
// เรียกได้เรื่อยๆ (ตอน poll / ส่งบอล / ส่งผิด) — ทำงานจริงแค่ครั้งแรกหลังขึ้นวันใหม่ (compare-and-swap)
async function rollQuotaDays(roomId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: room, error } = await supabase
      .from("game_rooms")
      .select(ROOM_FIELDS)
      .eq("id", roomId)
      .maybeSingle();
    if (error) throw error;
    if (!room || room.status !== "playing") return room;

    const state = parseQuotaState(room[QUOTA_STATE_COLUMN]);
    const today = currentDayIndex(room);
    if (today <= state.day) return room;

    // วันที่เพิ่งจบ: ส่งครบโควต้าไหม
    const quota = await quotaFor(roomId, room, state.day);
    const met = (room.progress ?? 0) >= quota;
    const maxStep = HEAT_STEPS.length - 1;
    let step = state.step;
    let missedHeat = 0; // Endless heat ที่ต้องเพิ่มเพราะส่งไม่ครบ กันยื่นนิ่งๆไม่ส่งบอลเขียวเลย

    if (!met) {
      missedHeat += HEAT_STEPS[step];                      // โดน heat ตามขั้นของวันที่เพิ่งจบ
      step = Math.min(step + 1, maxStep);                  // แล้วค่อยขึ้น 1 ขั้น
    }

    // วันที่ข้ามไปทั้งวัน (ไม่มีใครออนไลน์) = ไม่ครบ ทีละวัน
    for (let d = state.day + 1; d < today; d++) {
      missedHeat += HEAT_STEPS[step];
      step = Math.min(step + 1, maxStep);
    }
    const missed = met ? 0 : 1;
    const next = formatQuotaState(today, step);

    const { data: updated, error: updErr } = await supabase
      .from("game_rooms")
      .update({ progress: 0, [QUOTA_STATE_COLUMN]: next })
      .eq("id", roomId)
      .eq("status", "playing")
      .eq(QUOTA_STATE_COLUMN, room[QUOTA_STATE_COLUMN])
      .select("id");
    if (updErr) throw updErr;
    if (!updated || updated.length === 0) continue; // อีกคนปิดวันไปก่อนแล้ว -> อ่านใหม่

    console.log(
      `[quota] room ${roomId}: day ${state.day + 1} delivered ${room.progress ?? 0}/${quota}` +
      ` -> day ${today + 1}, heat per wrong ${HEAT_STEPS[step]} (missed ${missed})`,
    );
    let heat = heatOf(room);
    if (isEndless(room) && missedHeat > 0) {
      heat = await addRoomHeat(roomId, missedHeat, "missed daily quota");
    }
    return { ...room, progress: 0, [QUOTA_STATE_COLUMN]: next, [HEAT_COLUMN]: heat };
  }
  throw new Error("quota update conflict, please retry");
}

// บอลเขียว 1 ลูกถึง NPC -> นับโควต้าของวันนี้ +1
async function addQuotaDelivery(roomId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await rollQuotaDays(roomId);
    if (!room || room.status !== "playing") return room;

    const delivered = (room.progress ?? 0) + 1;
    const { data: updated, error } = await supabase
      .from("game_rooms")
      .update({ progress: delivered })
      .eq("id", roomId)
      .eq("status", "playing")
      .eq("progress", room.progress ?? 0)
      .eq(QUOTA_STATE_COLUMN, room[QUOTA_STATE_COLUMN])
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) continue;
    return { ...room, progress: delivered };
  }
  throw new Error("quota update conflict, please retry");
}

// mini game ที่ออกให้แต่ละคน (เก็บในหน่วยความจำพอ: หลุดแล้วขอใหม่ได้)
const coolingChallenges = new Map(); // `${roomId}:${userId}` -> { commands, issuedAt }

function pickCoolingCommands() {
  const pool = [...COOLING_COMMANDS];
  const picked = [];
  while (picked.length < COOLING_COMMAND_COUNT && pool.length > 0) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}

// เวลาทั้งเกม (วินาที) = ความยาว 1 วัน (เช้า+เที่ยง+เย็น) x จำนวนวัน
function gameDurationSeconds(room) {
  const dayLength =
    (room.morning_time || 0) + (room.noon_time || 0) + (room.evening_time || 0);
  return dayLength * (room.day_count || 1);
}

router.get("/room/:roomId", requireAuth, async (req, res) => {
  try {
    const { data: room, error } = await supabase
      .from("game_rooms")
      .select("end_time, morning_time, noon_time, evening_time, day_count, status, mode, started_at")
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
      .select(`status, mode, started_at, end_time, morning_time, noon_time, evening_time, day_count, progress, duration_time, ${HEAT_COLUMN}, ${QUOTA_STATE_COLUMN}`)
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Endless จบได้ทางเดียวคือ heat ถึง 100 แต่ได้เหรียญตามคะแนนปกติ
    if (isEndless(room)) {
      if (room.status === "playing" && heatOf(room) >= HEAT_MAX) {
        await fireRoom(roomId);
        room.status = "finished";
      }
      if (room.status !== "finished") {
        return res.status(400).json({ error: "Game has not finished yet" });
      }
      const { data: rewardData, error: rewardError } = await supabase.rpc(
        "claim_player_reward",
        { p_room_id: roomId, p_player_id: userId },
      );
      if (rewardError) throw rewardError;
      // อยู่รอดครบกี่วัน = เวลาที่เล่นได้ / ความยาว 1 วัน (ปัดลง) เช่น แพ้วันที่ 4 จะนับว่าอยู่รอด 3 วัน วันที่ 4 เล่นไม่จบ
      const dayLength = (room.morning_time || 0) + (room.noon_time || 0) + (room.evening_time || 0);
      const playedSeconds =
        room.duration_time ?? (Date.now() - new Date(room.started_at).getTime()) / 1000;
      const daysSurvived = dayLength > 0 ? Math.floor(playedSeconds / dayLength) : 0;
      return res.json({
        success: true,
        result: rewardData,
        reason: "endless",
        daysSurvived,
      });
    }

    // server overheat -> โดนไล่ออก เกมจบ ไม่ได้เหรียญ
    if (isFired(room)) {
      return res.json({ success: true, reason: "fired" });
    }

    const isTimeUp = new Date() >= new Date(room.end_time);

    if (room.status === "playing" && isTimeUp) {
      const totalTime = gameDurationSeconds(room);

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

    const reason = "timeup";
    res.json({ success: true, result: rewardData, reason });
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

  try {
    await tryStartGame(roomId);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ success: true });
});

// ถ้าห้องยัง loading และผู้เล่นที่เหลือ ready ครบ -> เริ่มเกม (เรียกตอน ready และตอนมีคนออก)
async function tryStartGame(roomId) {
  const { data: room, error: roomError } = await supabase
    .from("game_rooms")
        .select("status, mode, morning_time, noon_time, evening_time, day_count")
    .eq("id", roomId)
    .single();

  if (roomError) throw roomError;

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
    const now = Date.now();
    // Endless ไม่มีเวลาจบ (end_time = null) / โหมดปกติ -> ตอนนี้ + เวลาทั้งเกม
    const timeEnd = isEndless(room)
      ? null
      : new Date(now + gameDurationSeconds(room) * 1000).toISOString();

    await supabase
      .from("game_rooms")
      .update({
        status: "playing",
        started_at: new Date(now).toISOString(), // เวลาเริ่มเกม (Endless ใช้นับวัน)
        end_time: timeEnd,
        [HEAT_COLUMN]: 0, // เริ่มเกม heat = 0
      })
      .eq("id", roomId)
      .eq("status", "loading");

    // เริ่มนับโควต้าวันที่ 1 (แยก update ไว้ ถ้าเขียนไม่ได้ เกมยังเริ่มได้ตามปกติ)
    const { error: quotaErr } = await supabase
      .from("game_rooms")
      .update({ progress: 0, [QUOTA_STATE_COLUMN]: formatQuotaState(0, 0) })
      .eq("id", roomId);
    if (quotaErr) console.error("[quota] cannot reset quota state:", quotaErr.message);
  }
}

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
    setup_code,
  } = data[0];
  return res.json({
    id,
    title,
    description,
    show_expect_output,
    input_run,
    level,
    setup_code,
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
    // ยอมแพ้ = ได้ red ball -> server ร้อนขึ้น
    const room = await rollQuotaDays(roomId);
    const heat = await addRoomHeat(roomId, heatPerWrong(room), "give up");
    res.json({ score, heat });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/game/heat/:roomId — ค่า heat + โควต้าวันนี้ของห้อง (จาก DB) + คะแนนของเรา
// (หน้าเว็บเรียกทุก 5 วิ -> ตรงนี้ปิดวันที่ผ่านไปแล้วด้วย ขั้น heat จะขึ้นภายในไม่กี่วิหลังขึ้นวันใหม่)
router.get("/heat/:roomId", requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await rollQuotaDays(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const { data: me, error } = await supabase
      .from("room_players")
      .select("score")
      .eq("room_id", roomId)
      .eq("player_id", req.user.id)
      .maybeSingle();
    if (error) throw error;

    res.json({ heat: heatOf(room), maxHeat: HEAT_MAX, score: me?.score ?? null, ...(await quotaInfo(roomId, room)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/game/ball-delivered { roomId, color: "green" | "red" }
// เจ้าของบอล (หรือคนส่งแทนถ้าเจ้าของออกไปแล้ว) แจ้งว่าบอลถึง NPC แล้ว — บอลเขียวนับโควต้าวันนี้ +1
router.post("/ball-delivered", requireAuth, async (req, res) => {
  try {
    const { roomId, color } = req.body || {};
    if (!roomId) return res.status(400).json({ error: "roomId is required" });

    const room = color === "green" ? await addQuotaDelivery(roomId) : await rollQuotaDays(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(await quotaInfo(roomId, room));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/game/heat/challenge { roomId } — เริ่ม mini game ระบายความร้อน (ได้ทุกเมื่อที่ heat > 0)
router.post("/heat/challenge", requireAuth, async (req, res) => {
  try {
    const { roomId } = req.body || {};
    const room = await getRoom(roomId);
    if (!room || room.status !== "playing") {
      return res.status(409).json({ error: "เกมยังไม่เริ่ม หรือจบไปแล้ว" });
    }
    // ระบายความร้อนได้ทุกเมื่อที่ heat > 0 (ไม่ต้องรอให้ overheat)
    const heat = heatOf(room);
    if (heat <= 0) {
      return res.status(409).json({ error: "Server ยังเย็นอยู่ ไม่ต้องระบายความร้อน", heat });
    }

    const commands = pickCoolingCommands();
    coolingChallenges.set(`${roomId}:${req.user.id}`, { commands, issuedAt: Date.now() });
    res.json({ commands, timeLimit: COOLING_TIME_LIMIT_S });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/game/heat/cool { roomId, answers: [...] } — พิมพ์คำสั่งครบและทันเวลา -> heat กลับเป็น 0
router.post("/heat/cool", requireAuth, async (req, res) => {
  try {
    const { roomId, answers } = req.body || {};
    const key = `${roomId}:${req.user.id}`;
    const challenge = coolingChallenges.get(key);
    if (!challenge) return res.status(400).json({ error: "ยังไม่ได้เริ่ม mini game" });
    coolingChallenges.delete(key);

    // เผื่อเวลาเน็ตช้า 5 วิ
    if (Date.now() - challenge.issuedAt > (COOLING_TIME_LIMIT_S + 5) * 1000) {
      return res.status(408).json({ error: "หมดเวลา! ลองใหม่อีกครั้ง" });
    }
    const correct =
      Array.isArray(answers) &&
      answers.length === challenge.commands.length &&
      challenge.commands.every((cmd, i) => String(answers[i] ?? "").trim() === cmd);
    if (!correct) return res.status(400).json({ error: "คำสั่งไม่ถูกต้อง ลองใหม่อีกครั้ง" });

    // คนแรกที่ทำสำเร็จเป็นคนลด (ถ้ามีคนลดไปแล้วก็ถือว่าสำเร็จเหมือนกัน)
    await addRoomHeat(roomId, -HEAT_MAX, "cooled by mini game");
    res.json({ success: true, heat: 0 });
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
          "id, title, description, show_expect_output, input_run, level, setup_code",
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
  if (!Number.isInteger(Number(language_id)))
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

    // server overheat ไปแล้ว = เกมจบ (fired) -> ส่งงานต่อไม่ได้
    if (type === "submit" && isFired(await getRoom(roomId))) {
      return res.status(409).json({ error: "Server overheat — เกมจบแล้ว", fired: true });
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
      // ผิด = ได้ red ball -> server ร้อนขึ้น (ถูกไม่เพิ่ม)
      const heat = success
        ? heatOf(await getRoom(roomId))
        : await addRoomHeat(roomId, heatPerWrong(await rollQuotaDays(roomId)), "wrong submit");
      return res.json({ success, status, score, heat });
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
    if (!judgeRes.ok){
      const j = await judgeRes.json().catch(() => ({}));
      return res.status(judgeRes.status === 409 ? 409 : 502).json({ error: j.error || "judge error" });
    }
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
module.exports.tryStartGame = tryStartGame;
