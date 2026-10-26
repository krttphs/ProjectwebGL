const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../config/supabaseAdmin");
const { requireAdmin } = require("../middleware/adminMiddleware");

router.use(requireAdmin);

router.get("/me", (req, res) => res.json({ ok: true }));

const QUEST_FIELDS = ["title", "description", "input_run", "input_submit", "expected_output",
  "show_expect_output", "level", "rewards", "setup_code", "is_active"];

// setup_code ต้องเป็น { "judge0_id": "โค้ด", ... } เท่านั้น
const MAX_SETUP_CODE = 20_000; // ตัวอักษรต่อภาษา
function checkSetupCode(sc) {
  if (sc === undefined) return null; // ไม่ได้ส่งมา = ไม่แก้
  if (sc === null || typeof sc !== "object" || Array.isArray(sc))
    return "setup_code must be an object like { \"71\": \"...\" }";
  for (const [id, code] of Object.entries(sc)) {
    if (!/^\d{1,4}$/.test(id)) return `setup_code key "${id}" must be a Judge0 ID`;
    if (typeof code !== "string") return `setup_code for ${id} must be text`;
    if (code.length > MAX_SETUP_CODE) return `setup_code for ${id} is too long`;
  }
  return null;
}

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

function crud(path, table, fields, validate) {
  router.get(path, async (req, res) => {
    const { data, error } = await supabaseAdmin.from(table).select("*").order("id");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  router.post(path, async (req, res) => {
    const row = pick(req.body, fields);
    const msg = validate(row);
    if (msg) return res.status(400).json({ error: msg });
    const { data, error } = await supabaseAdmin.from(table).insert(row).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  });

  router.put(`${path}/:id`, async (req, res) => {
    const row = pick(req.body, fields);
    const msg = validate(row);
    if (msg) return res.status(400).json({ error: msg });
    const { data, error } = await supabaseAdmin.from(table).update(row).eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  });

  router.delete(`${path}/:id`, async (req, res) => {
    const { error } = await supabaseAdmin.from(table).delete().eq("id", req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });
}

crud("/quests", "quests", QUEST_FIELDS, (r) =>
  !r.title?.trim() ? "Title is required"
    : !["easy", "medium", "hard"].includes(r.level) ? "Level must be easy, medium or hard"
      : checkSetupCode(r.setup_code));

// ===================================================================
// Languages: บันทึกลง DB แล้วสั่ง judge ให้ติดตั้ง image
// ===================================================================

const LANG_FIELDS = ["name", "judge0_id", "image", "file_name", "compile_cmd", "run_cmd"];
const IMAGE_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*:[A-Za-z0-9._-]{1,128}$/;
const FILE_RE = /^[A-Za-z0-9_]{1,50}\.[A-Za-z0-9]{1,10}$/;

// เรียก judge server พร้อมรหัสลับ
async function judgeFetch(method, path, body, timeoutMs = 15_000) {
  const res = await fetch(`${process.env.JUDGE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-judge-secret": process.env.JUDGE_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `judge responded ${res.status}`);
  return json;
}

// กรอง + จัดรูปข้อมูลภาษา
function cleanLang(body) {
  const row = pick(body || {}, LANG_FIELDS);
  for (const k of ["name", "image", "file_name", "compile_cmd", "run_cmd"]) {
    if (typeof row[k] === "string") row[k] = row[k].trim();
  }
  if ("judge0_id" in row) row.judge0_id = Number(row.judge0_id);
  if (!row.compile_cmd) row.compile_cmd = null;
  return row;
}

function validateLang(r) {
  if (!r.name) return "Name is required";
  if (!Number.isInteger(r.judge0_id) || r.judge0_id < 1 || r.judge0_id > 9999)
    return "Judge0 ID must be a whole number (1-9999)";
  if (!IMAGE_RE.test(r.image || ""))
    return "Image must be an official Docker image with a tag, e.g. gcc:13";
  if (!FILE_RE.test(r.file_name || "")) return "File name must look like main.cpp";
  if (!r.run_cmd) return "Run command is required";
  if (r.run_cmd.length > 300 || (r.compile_cmd || "").length > 300) return "Commands must be under 300 characters";
  return null;
}

// แปลงแถวใน DB เป็นรูปแบบที่ judge ต้องการ
const toJudgeSpec = (l) => ({
  image: l.image,
  file: l.file_name,
  compile: l.compile_cmd || "",
  run: l.run_cmd,
});

// รายการภาษา + สถานะการติดตั้งบน judge
router.get("/languages", async (req, res) => {
  const { data, error } = await supabaseAdmin.from("languages").select("*").order("id");
  if (error) return res.status(500).json({ error: error.message });

  let judgeLangs = null;
  try {
    judgeLangs = await judgeFetch("GET", "/languages", null, 5_000);
  } catch (e) {
    console.warn("judge unreachable:", e.message);
  }

  res.json(
    data.map((l) => {
      const j = judgeLangs?.[l.judge0_id];
      return {
        ...l,
        judge_status: !judgeLangs ? "offline" : j ? j.status : "missing",
        judge_error: j?.error ?? null,
      };
    }),
  );
});

// เพิ่มภาษา: บันทึก DB → สั่ง judge ติดตั้ง → ถ้า judge ไม่รับ ลบแถวที่เพิ่งเพิ่มทิ้ง
router.post("/languages", async (req, res) => {
  const row = cleanLang(req.body);
  const msg = validateLang(row);
  if (msg) return res.status(400).json({ error: msg });

  const { data, error } = await supabaseAdmin.from("languages").insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });

  try {
    await judgeFetch("PUT", `/languages/${data.judge0_id}`, toJudgeSpec(data));
  } catch (e) {
    await supabaseAdmin.from("languages").delete().eq("id", data.id);
    return res.status(502).json({ error: "Judge server: " + e.message });
  }

  res.status(201).json(data);
});

// แก้ภาษา (หรือกด Retry): อัปเดต DB → ส่งข้อมูลใหม่ให้ judge
router.put("/languages/:id", async (req, res) => {
  const row = cleanLang(req.body);
  const msg = validateLang(row);
  if (msg) return res.status(400).json({ error: msg });

  const { data: old, error: oldErr } = await supabaseAdmin
    .from("languages").select("judge0_id").eq("id", req.params.id).single();
  if (oldErr) return res.status(404).json({ error: "Language not found" });
       
  const { data, error } = await supabaseAdmin
    .from("languages").update(row).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });

  try {
    if (old.judge0_id !== data.judge0_id) {
      await judgeFetch("DELETE", `/languages/${old.judge0_id}`);
    }
    await judgeFetch("PUT", `/languages/${data.judge0_id}`, toJudgeSpec(data));
  } catch (e) {
    return res.status(502).json({ error: "Saved, but judge server failed: " + e.message + ". Press Retry." });
  }

  res.json(data);
});

// ลบภาษา: ลบจาก DB → บอก judge ให้ลบด้วย
router.delete("/languages/:id", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("languages").delete().eq("id", req.params.id).select("judge0_id").single();
  if (error) return res.status(400).json({ error: error.message });

  try {
    await judgeFetch("DELETE", `/languages/${data.judge0_id}`);
  } catch (e) {
    console.warn("judge delete failed:", e.message);
  }
  res.json({ ok: true });
});

module.exports = router;
