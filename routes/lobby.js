const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

const { requireAuth } = require("../middleware/authMiddleware");
const { tryStartGame } = require("./game");

// กติกาห้อง: ห้องละ 4 คน, ทั้งระบบเปิดพร้อมกันได้สูงสุด 5 ห้อง
// (5 x 4 = 20 คน = เพดาน CCU ของ Photon แผนฟรีพอดี)
const MAX_PLAYERS_PER_ROOM = 4;
const MAX_ACTIVE_ROOMS = 5;
// สถานะที่ถือว่าห้องยัง "ใช้งานอยู่" และกินโควต้า 5 ห้อง
const ACTIVE_STATUSES = ["waiting", "full", "loading", "playing"];
// ลำดับการแสดงใน room list (ห้องที่ join ได้ขึ้นก่อน)
const STATUS_ORDER = { waiting: 0, full: 1, loading: 2, playing: 3 };
// ตัวเลือก time limit ที่ host เลือกได้
const DAY_MINUTE_OPTIONS = [3, 5, 10];
const DAY_COUNT_OPTIONS = [1, 3, 5, 7];

// ห้องที่ค้างนานเกินนี้ (หัวหน้าปิดแท็บทิ้ง / ค้าง loading) ถือว่าร้าง ไม่กินโควต้า
const STALE_ROOM_MS = 2 * 60 * 60 * 1000;

// ห้องร้าง: playing ที่เลย end_time แล้ว หรือห้องที่ยังไม่เริ่มเล่นแต่สร้างไว้นานเกิน STALE_ROOM_MS
function isStaleRoom(r, now = Date.now()) {
  if (r.status === "playing") {
    return !!r.end_time && new Date(r.end_time).getTime() <= now;
  }
  return !!r.created_at && now - new Date(r.created_at).getTime() > STALE_ROOM_MS;
}

// ห้องที่ยังใช้งานอยู่ทั้งหมด (ไม่รวมห้องร้าง) เรียงจากเก่าไปใหม่
async function getActiveRooms() {
  const { data, error } = await supabase
    .from("game_rooms")
    .select("id, leader_id, status, end_time, created_at")
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const now = Date.now();
  return (data || []).filter((r) => !isStaleRoom(r, now));
}

const OPEN_STATUSES = ["waiting", "full"];
const IN_GAME_STATUSES = ["loading", "playing"];
const IN_GAME_ERROR = "คุณยังอยู่ในเกมอื่น กด REJOIN เพื่อกลับเข้าเกม หรือ LEAVE เพื่อออกก่อน";

// ห้องที่ผู้ใช้ยังค้างอยู่ (ทั้งห้องรอ และเกมที่ยังเล่นไม่จบ) — ใช้กันอยู่ 2 ห้องพร้อมกัน
async function findMyRoom(userId) {
  const { data: myRows, error: myErr } = await supabase
    .from("room_players")
    .select("room_id")
    .eq("player_id", userId);
  if (myErr) throw myErr;

  const myRoomIds = (myRows || []).map((r) => r.room_id);
  if (myRoomIds.length === 0) return null;

  const { data: myRooms, error: roomErr } = await supabase
    .from("game_rooms")
    .select("id, leader_id, status, created_at, end_time")
    .in("id", myRoomIds)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false });
  if (roomErr) throw roomErr;
  return (myRooms || []).find((r) => !isStaleRoom(r)) || null;
}

// ผู้ใช้ค้างห้องอยู่แล้ว: ห้องรอ → พากลับห้องเดิม, อยู่ในเกม → ห้ามเข้า/สร้างห้องใหม่
async function respondWithMyRoom(res, myRoom, userId) {
  if (IN_GAME_STATUSES.includes(myRoom.status)) {
    return res.status(409).json({
      error: IN_GAME_ERROR,
      inGame: true,
      myRoomId: myRoom.id,
    });
  }
  return res.json({
    roomId: myRoom.id,
    isLeader: myRoom.leader_id === userId,
    playerCount: await countPlayers(myRoom.id),
    rejoined: true,
  });
}

// เพิ่มผู้เล่นเข้าห้อง (ตรวจสถานะ + เพดาน 4 คน) คืน { ok, status, body }
async function joinRoom(roomId, userId) {
  const { data: room, error } = await supabase
    .from("game_rooms")
    .select("id, leader_id, status, created_at, end_time")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;

  // join ได้ทุกช่วง (รอ / กำลังโหลด / กำลังเล่น) ขอแค่ห้องยังไม่จบและคนยังไม่ครบ 4
  if (!room || !ACTIVE_STATUSES.includes(room.status) || isStaleRoom(room)) {
    return { ok: false, status: 404, body: { error: "ไม่พบห้องนี้ (อาจถูกยุบหรือจบเกมไปแล้ว)" } };
  }
  const isOpen = OPEN_STATUSES.includes(room.status);

  const count = await countPlayers(roomId);
  if (count >= MAX_PLAYERS_PER_ROOM) {
    if (isOpen) await supabase.from("game_rooms").update({ status: "full" }).eq("id", roomId);
    return { ok: false, status: 409, body: { error: "ห้องเต็มแล้ว" } };
  }

  const { error: joinErr } = await supabase
    .from("room_players")
    .insert({ room_id: roomId, player_id: userId });
  if (joinErr) throw joinErr;

  // นับซ้ำหลัง insert กันกรณีหลายคนกด join พร้อมกันจนเกิน 4
  const after = await countPlayers(roomId);
  if (after > MAX_PLAYERS_PER_ROOM) {
    await supabase.from("room_players").delete().eq("room_id", roomId).eq("player_id", userId);
    return { ok: false, status: 409, body: { error: "ห้องเต็มแล้ว" } };
  }
  // สถานะ full ใช้เฉพาะห้องรอ (ห้องที่เริ่มเกมแล้วดูจากจำนวนคนแทน)
  if (isOpen && after >= MAX_PLAYERS_PER_ROOM) {
    await supabase.from("game_rooms").update({ status: "full" }).eq("id", roomId);
  }

  return {
    ok: true,
    status: 200,
    body: {
      roomId,
      isLeader: room.leader_id === userId,
      playerCount: after,
      roomStatus: room.status,
    },
  };
}

async function createRoom(userId) {
  const { data: newRoom, error: createError } = await supabase
    .from("game_rooms")
    .insert({ leader_id: userId, status: "waiting" })
    .select()
    .single();

  if (createError) throw createError;

  const newRoomId = newRoom.id;

  // เช็คโควต้าซ้ำหลังสร้าง กันกรณีหลายคนกดสร้างพร้อมกันจนเกิน 5 ห้อง
  // (ห้องที่สร้างทีหลังเกินโควต้าจะถูกลบทิ้ง)
  const active = await getActiveRooms();
  const index = active.findIndex((r) => r.id === newRoomId);
  if (index >= MAX_ACTIVE_ROOMS) {
    await supabase.from("game_rooms").delete().eq("id", newRoomId);
    return null;
  }

  const { error: joinErr } = await supabase
    .from("room_players")
    .insert({
      room_id: newRoomId,
      player_id: userId
    });
  if (joinErr) {
    await supabase.from("game_rooms").delete().eq("id", newRoomId);
    throw joinErr;
  }

  return newRoomId;
}

const ROOM_QUOTA_ERROR = `ห้องเต็มทั้งระบบแล้ว (${MAX_ACTIVE_ROOMS}/${MAX_ACTIVE_ROOMS}) รอให้มีห้องว่างก่อน`;

async function countPlayers(roomId) {
  const { count } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  return count || 0;
}

// ===== Heartbeat: ทุกคนปิดแท็บ → ยุบห้องอัตโนมัติ =====
// หน้าห้องรอ/หน้าเกม ส่ง heartbeat มาเป็นระยะ ถ้าทั้งห้องเงียบเกิน HEARTBEAT_TIMEOUT_MS ถือว่าไม่มีใครอยู่แล้ว
// (เก็บในหน่วยความจำของ server พอ: server restart แล้วทุกคนได้เวลาผ่อนผันใหม่)
const HEARTBEAT_TIMEOUT_MS = 90 * 1000; // เผื่อแท็บที่อยู่เบื้องหลังโดน browser หน่วง timer
const LEAVING_GRACE_MS = 15 * 1000; // ปิดแท็บแล้ว ถ้าไม่กลับมา (refresh) ภายในนี้ถือว่าออก
const SWEEP_INTERVAL_MS = 10 * 1000;
const heartbeats = new Map(); // roomId -> Map(playerId -> lastSeen)

function recordHeartbeat(roomId, playerId, leaving = false) {
  if (!heartbeats.has(roomId)) heartbeats.set(roomId, new Map());
  // ปิดแท็บ: ตั้งเวลาให้หมดอายุในอีก LEAVING_GRACE_MS (refresh จะส่ง heartbeat ใหม่ทันเวลา)
  const lastSeen = leaving ? Date.now() - HEARTBEAT_TIMEOUT_MS + LEAVING_GRACE_MS : Date.now();
  heartbeats.get(roomId).set(playerId, lastSeen);
}

// ยุบห้องรอ (ลบห้อง + ผู้เล่น) — ใช้ตอนหัวหน้าออก และตอนทุกคนหายไป
async function dissolveOpenRoom(roomId) {
  await supabase.from("room_players").delete().eq("room_id", roomId);
  await supabase.from("game_rooms").delete().eq("id", roomId);
  heartbeats.delete(roomId);
}

// ปิดเกมที่ไม่เหลือใครแล้ว (เก็บห้องไว้เป็นประวัติ แค่เปลี่ยนเป็น finished)
async function closeEmptyGame(roomId) {
  await supabase
    .from("game_rooms")
    .update({ status: "finished" })
    .eq("id", roomId)
    .in("status", IN_GAME_STATUSES);
  heartbeats.delete(roomId);
}

async function sweepAbandonedRooms() {
  const rooms = await getActiveRooms();
  const activeIds = new Set(rooms.map((r) => r.id));
  for (const id of heartbeats.keys()) {
    if (!activeIds.has(id)) heartbeats.delete(id);
  }
  if (rooms.length === 0) return;

  const { data: players, error } = await supabase
    .from("room_players")
    .select("room_id, player_id")
    .in("room_id", [...activeIds]);
  if (error) throw error;

  const now = Date.now();
  for (const room of rooms) {
    const roomPlayers = (players || []).filter((p) => p.room_id === room.id);
    if (!heartbeats.has(room.id)) heartbeats.set(room.id, new Map());
    const seen = heartbeats.get(room.id);

    // ผู้เล่นที่ยังไม่เคยส่ง heartbeat (เพิ่งเข้า / server เพิ่ง restart) ได้เวลาผ่อนผันนับจากตอนนี้
    roomPlayers.forEach((p) => {
      if (!seen.has(p.player_id)) seen.set(p.player_id, now);
    });

    const someoneHere = roomPlayers.some(
      (p) => now - seen.get(p.player_id) < HEARTBEAT_TIMEOUT_MS,
    );
    if (someoneHere) continue;

    console.log(`Dissolving abandoned room ${room.id} (${room.status})`);
    if (OPEN_STATUSES.includes(room.status)) await dissolveOpenRoom(room.id);
    else await closeEmptyGame(room.id);
  }
}

setInterval(() => {
  sweepAbandonedRooms().catch((err) => console.error("Room sweep error:", err));
}, SWEEP_INTERVAL_MS).unref();

// POST /api/lobby/heartbeat { roomId, leaving? } — หน้าเกมส่งมาเป็นระยะ / ตอนปิดแท็บ (sendBeacon)
router.post("/heartbeat", requireAuth, (req, res) => {
  const { roomId, leaving } = req.body || {};
  if (!roomId || typeof roomId !== "string") {
    return res.status(400).json({ error: "roomId is required" });
  }
  recordHeartbeat(roomId, req.user.id, leaving === true);
  res.json({ ok: true });
});

router.post("/find-match", requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. ยังค้างอยู่ในห้องไหนไหม → ห้องรอกลับห้องเดิม, อยู่ในเกมห้ามหาห้องใหม่
    const myRoom = await findMyRoom(userId);
    if (myRoom) return respondWithMyRoom(res, myRoom, userId);

    // 2. หาห้องที่ยังมีที่ว่าง: ห้องรอก่อน แล้วค่อยเกมที่กำลังเล่นอยู่ (join กลางเกมได้)
    const active = await getActiveRooms();
    const candidates = active
      .filter((r) => r.status !== "full")
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

    for (const r of candidates) {
      const result = await joinRoom(r.id, userId);
      if (result.ok) return res.json(result.body);
    }

    // 3. ไม่มีห้องว่าง → สร้างใหม่ (ถ้ายังไม่ชนเพดาน 5 ห้อง)
    if (active.length >= MAX_ACTIVE_ROOMS) {
      return res.status(409).json({ error: ROOM_QUOTA_ERROR });
    }
    const roomId = await createRoom(userId);
    if (!roomId) return res.status(409).json({ error: ROOM_QUOTA_ERROR });
    return res.json({ roomId, isLeader: true, playerCount: 1 });
  } catch (error) {
    console.error("Find match error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/start", requireAuth, async (req, res) => {

  const roomId = req.body.roomId;
  const userId = req.user.id;

  // host เลือกได้แค่ค่าที่กำหนด: ความยาว 1 วัน (นาที) และจำนวนวัน
  const dayMinutes = Number(req.body.day_minutes);
  const dayCount = Number(req.body.day_count);
  if (!DAY_MINUTE_OPTIONS.includes(dayMinutes) || !DAY_COUNT_OPTIONS.includes(dayCount)) {
    return res.status(400).json({
      error: `เลือกเวลาได้ ${DAY_MINUTE_OPTIONS.join("/")} นาที และ ${DAY_COUNT_OPTIONS.join("/")} วัน`,
    });
  }

  // แบ่ง 1 วันเป็น เช้า 45% / เที่ยง (พัก) 10% / เย็น 45%
  const daySeconds = dayMinutes * 60;
  const morning_time = Math.round(daySeconds * 0.45);
  const evening_time = morning_time;
  const noon_time = daySeconds - morning_time - evening_time;

  try {

    // เริ่มได้เฉพาะห้องที่ยังรออยู่ (กันกดซ้ำ / เริ่มห้องที่เริ่มไปแล้ว)
    const { data: started, error } = await supabase
      .from("game_rooms")
      .update({
        status: "loading",
        morning_time: morning_time,
        noon_time: noon_time,
        evening_time: evening_time,
        day_count: dayCount
      })
      .eq("id", roomId)
      .eq("leader_id", userId)
      .in("status", ["waiting", "full"])
      .select("id");

    if (error) throw error;
    if (!started || started.length === 0) {
      return res.status(409).json({ error: "ห้องนี้เริ่มไปแล้ว หรือคุณไม่ใช่หัวหน้าห้อง" });
    }

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

    if (room && IN_GAME_STATUSES.includes(room.status)) {

      // ออกจากเกมที่เริ่มแล้ว: เอาแค่ตัวเองออก (หัวหน้าออกก็ไม่ยุบห้อง คนอื่นเล่นต่อได้)
      const { error: delErr } = await supabase
        .from("room_players")
        .delete()
        .eq("room_id", roomId)
        .eq("player_id", userId);
      if (delErr) throw delErr;

      await supabase
        .from("player_ready_status")
        .delete()
        .eq("room_id", roomId)
        .eq("player_id", userId);

      // คนสุดท้ายออก → ปิดห้อง ไม่ให้ค้างกินโควต้า
      if ((await countPlayers(roomId)) === 0) {
        await closeEmptyGame(roomId);
      } else if (room.status === "loading") {
        // คนที่ออกอาจเป็นคนเดียวที่ยังไม่ ready → คนที่เหลือเริ่มเกมได้เลย
        await tryStartGame(roomId);
      }

    } else if (room && room.leader_id === userId) {

      await dissolveOpenRoom(roomId);

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

    // ห้องถูกยุบแล้ว → 404 ให้หน้าเว็บปิดหน้าต่างห้องรอ
    const { data: room, error: roomErr } = await supabase
      .from("game_rooms")
      .select("status")
      .eq("id", req.params.roomId)
      .maybeSingle();
    if (roomErr) throw roomErr;
    if (!room) return res.status(404).json({ error: "Room not found" });

    // หน้าห้องรอเรียก endpoint นี้ทุก 2 วิ → ใช้เป็น heartbeat ไปด้วย
    recordHeartbeat(req.params.roomId, req.user.id);

    const count = await countPlayers(req.params.roomId);

    res.json({
      count,
      status: room.status
    });

  } catch (error) {

    res.status(500).json({
      error: "Server error"
    });

  }

});

// ===== Room list / Create / Join (หน้าเลือกห้องก่อนเข้า WebGL) =====

// GET /api/lobby/rooms — รายการห้องที่ใช้งานอยู่ + โควต้า
router.get("/rooms", requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const rooms = await getActiveRooms();
    const ids = rooms.map((r) => r.id);
    const leaderIds = [...new Set(rooms.map((r) => r.leader_id))];

    const counts = {};
    if (ids.length > 0) {
      const { data: players, error: pErr } = await supabase
        .from("room_players")
        .select("room_id")
        .in("room_id", ids);
      if (pErr) throw pErr;
      (players || []).forEach((p) => {
        counts[p.room_id] = (counts[p.room_id] || 0) + 1;
      });
    }

    const names = {};
    if (leaderIds.length > 0) {
      const { data: leaders, error: uErr } = await supabase
        .from("users")
        .select("id, username")
        .in("id", leaderIds);
      if (uErr) throw uErr;
      (leaders || []).forEach((u) => (names[u.id] = u.username));
    }

    const myRoom = await findMyRoom(userId);

    // ทุกห้องที่เราอยู่ (ข้อมูลเก่าอาจค้างหลายห้อง) ให้กด REJOIN/LEAVE ได้ทุกห้อง
    const myRoomIds = new Set();
    if (ids.length > 0) {
      const { data: mine, error: mErr } = await supabase
        .from("room_players")
        .select("room_id")
        .eq("player_id", userId)
        .in("room_id", ids);
      if (mErr) throw mErr;
      (mine || []).forEach((p) => myRoomIds.add(p.room_id));
    }

    const list = rooms
      .map((r) => ({
        id: r.id,
        code: String(r.id).replace(/-/g, "").slice(0, 6).toUpperCase(),
        leaderName: names[r.leader_id] || "Unknown",
        playerCount: counts[r.id] || 0,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        status: r.status,
        isMine: myRoomIds.has(r.id),
      }))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

    res.json({
      rooms: list,
      activeCount: rooms.length,
      maxRooms: MAX_ACTIVE_ROOMS,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      myRoomId: myRoom ? myRoom.id : null,
      myRoomStatus: myRoom ? myRoom.status : null,
    });
  } catch (err) {
    console.error("List rooms error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/lobby/create — สร้างห้องใหม่ (ผู้สร้างเป็น leader)
router.post("/create", requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    // ค้างอยู่ห้องไหนอยู่แล้ว → กลับห้องเดิม / อยู่ในเกมห้ามสร้างซ้ำ
    const myRoom = await findMyRoom(userId);
    if (myRoom) return respondWithMyRoom(res, myRoom, userId);

    const active = await getActiveRooms();
    if (active.length >= MAX_ACTIVE_ROOMS) {
      return res.status(409).json({ error: ROOM_QUOTA_ERROR });
    }

    const roomId = await createRoom(userId);
    if (!roomId) return res.status(409).json({ error: ROOM_QUOTA_ERROR });
    res.json({ roomId, isLeader: true, playerCount: 1 });
  } catch (err) {
    console.error("Create room error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/lobby/join { roomId } — เข้าห้องที่เลือกจาก list
router.post("/join", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { roomId } = req.body || {};
  if (!roomId || typeof roomId !== "string") {
    return res.status(400).json({ error: "roomId is required" });
  }

  try {
    const myRoom = await findMyRoom(userId);
    if (myRoom) {
      if (String(myRoom.id) === roomId || IN_GAME_STATUSES.includes(myRoom.status)) {
        return respondWithMyRoom(res, myRoom, userId);
      }
      return res.status(409).json({
        error: "คุณยังอยู่ในห้องอื่น ออกจากห้องเดิมก่อน",
        myRoomId: myRoom.id,
      });
    }

    const result = await joinRoom(roomId, userId);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Join room error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
