const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../config/supabaseAdmin");
const { requireAdmin } = require("../middleware/adminMiddleware");

// ทุก route ในไฟล์นี้ต้องเป็น admin เท่านั้น
router.use(requireAdmin);

router.get("/me", (req, res) => res.json({ ok: true }));

// ===================================================================
// Quests
// ===================================================================

// เอาเฉพาะช่องที่อนุญาตจากฟอร์ม (กันไม่ให้ส่ง id หรือคอลัมน์อื่นมาแก้)
function questFromBody(b) {
  return {
    title: b.title,
    description: b.description,
    input_run: b.input_run,
    input_submit: b.input_submit,
    expected_output: b.expected_output,
    show_expect_output: b.show_expect_output,
    level: b.level,
    rewards: b.rewards,
    setup_code: b.setup_code,
    is_active: b.is_active,
  };
}

router.get("/quests", async (req, res) => {
  const { data, error } = await supabaseAdmin.from("quests").select("*").order("id");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/quests", async (req, res) => {
  const row = questFromBody(req.body);
  if (!row.title || !row.title.trim()) return res.status(400).json({ error: "กรุณากรอกชื่อโจทย์" });

  const { data, error } = await supabaseAdmin.from("quests").insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put("/quests/:id", async (req, res) => {
  const row = questFromBody(req.body);
  if (!row.title || !row.title.trim()) return res.status(400).json({ error: "กรุณากรอกชื่อโจทย์" });

  const { data, error } = await supabaseAdmin
    .from("quests").update(row).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete("/quests/:id", async (req, res) => {
  const { error } = await supabaseAdmin.from("quests").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ===================================================================
// Languages: บันทึกลง DB แล้วสั่ง judge ให้ติดตั้ง image
// ===================================================================

// เอาเฉพาะช่องที่อนุญาตจากฟอร์ม
function langFromBody(b) {
  return {
    name: b.name,
    judge0_id: b.judge0_id,
    image: b.image,
    file_name: b.file_name,
    compile_cmd: b.compile_cmd,
    run_cmd: b.run_cmd,
  };
}

// ตรวจข้อมูลภาษา: ผ่าน -> คืน null / ไม่ผ่าน -> คืนข้อความ error
function checkLang(row) {
  if (!row.name || !row.judge0_id || !row.image || !row.file_name || !row.run_cmd)
    return "กรุณากรอกชื่อภาษา, Judge0 ID, Docker image, ชื่อไฟล์ และคำสั่งรันให้ครบ";

  // image ต้องเป็น official image + มี tag เช่น gcc:13 (ห้ามมี "/" = image ของคนอื่นบน Docker Hub)
  if (row.image.includes("/") || !row.image.includes(":"))
    return 'Docker image ต้องเป็น official image ที่มี tag เช่น gcc:13 (ห้ามมี "/")';

  // ห้ามมี "/" กันการเขียนไฟล์ออกไปนอกโฟลเดอร์บนเครื่อง judge
  if (row.file_name.includes("/"))
    return 'ชื่อไฟล์ต้องเป็นแบบ main.cpp (ห้ามมี "/")';

  return null;
}

// เรียก judge server พร้อมรหัสลับ (รอไม่เกิน 10 วินาที)
async function judgeFetch(method, path, body) {
  const res = await fetch(process.env.JUDGE_URL + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-judge-secret": process.env.JUDGE_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "judge ตอบกลับ " + res.status);
  return json;
}

// แปลงแถวใน DB เป็นชื่อที่ judge ต้องการ
function toJudgeSpec(l) {
  return {
    image: l.image,
    file: l.file_name,
    compile: l.compile_cmd || "",
    run: l.run_cmd,
  };
}

// รายการภาษา + สถานะการติดตั้งบน judge
router.get("/languages", async (req, res) => {
  const { data, error } = await supabaseAdmin.from("languages").select("*").order("id");
  if (error) return res.status(500).json({ error: error.message });

  // ถามสถานะจาก judge (ถ้า judge ล่ม judgeLangs จะยังเป็น null)
  let judgeLangs = null;
  try {
    judgeLangs = await judgeFetch("GET", "/languages");
  } catch (e) {
    console.warn("judge unreachable:", e.message);
  }

  const result = data.map((l) => {
    let status = "offline";
    let judgeError = null;
    if (judgeLangs) {
      const j = judgeLangs[l.judge0_id];
      status = j ? j.status : "missing";
      judgeError = j ? j.error : null;
    }
    return { ...l, judge_status: status, judge_error: judgeError };
  });

  res.json(result);
});

// เพิ่มภาษา: บันทึก DB -> สั่ง judge ติดตั้ง -> ถ้า judge ไม่รับ ลบแถวที่เพิ่งเพิ่มทิ้ง
router.post("/languages", async (req, res) => {
  const row = langFromBody(req.body);
  const msg = checkLang(row);
  if (msg) return res.status(400).json({ error: msg });

  const { data, error } = await supabaseAdmin.from("languages").insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });

  try {
    await judgeFetch("PUT", "/languages/" + data.judge0_id, toJudgeSpec(data));
  } catch (e) {
    await supabaseAdmin.from("languages").delete().eq("id", data.id);
    return res.status(502).json({ error: "เครื่อง judge: " + e.message });
  }

  res.status(201).json(data);
});

// แก้ภาษา (หรือกด Retry): อัปเดต DB -> ส่งข้อมูลใหม่ให้ judge
router.put("/languages/:id", async (req, res) => {
  const row = langFromBody(req.body);
  const msg = checkLang(row);
  if (msg) return res.status(400).json({ error: msg });

  // จำ judge0_id เดิมไว้ก่อนอัปเดต ถ้าไม่ซ้ำ จะได้ลบอันเก่าทิ้งด้วย
  const { data: old, error: oldErr } = await supabaseAdmin
    .from("languages").select("judge0_id").eq("id", req.params.id).single();
  if (oldErr) return res.status(404).json({ error: "ไม่พบภาษานี้" });

  const { data, error } = await supabaseAdmin
    .from("languages").update(row).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });

  try {
    // เปลี่ยน judge0_id -> สั่ง judge ลบ ID เก่าทิ้ง
    if (old.judge0_id !== data.judge0_id) {
      await judgeFetch("DELETE", "/languages/" + old.judge0_id);
    }
    await judgeFetch("PUT", "/languages/" + data.judge0_id, toJudgeSpec(data));
  } catch (e) {
    return res.status(502).json({ error: "บันทึกแล้ว แต่เครื่อง judge ทำงานไม่สำเร็จ: " + e.message + ' กด "ลองใหม่"' });
  }

  res.json(data);
});

// ลบภาษา: ลบจาก DB -> บอก judge ให้ลบด้วย
router.delete("/languages/:id", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("languages").delete().eq("id", req.params.id).select("judge0_id").single();
  if (error) return res.status(400).json({ error: error.message });

  try {
    await judgeFetch("DELETE", "/languages/" + data.judge0_id);
  } catch (e) {
    console.warn("judge delete failed:", e.message);
  }

  res.json({ ok: true });
});

module.exports = router;
