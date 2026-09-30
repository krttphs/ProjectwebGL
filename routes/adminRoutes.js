const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../config/supabaseAdmin");
const { requireAdmin } = require("../middleware/adminMiddleware");

router.use(express.json());
router.use(requireAdmin);

router.get("/me", (req, res) => res.json({ ok: true }));

const QUEST_FIELDS = ["title", "description", "input_run", "input_submit", "expected_output",
  "show_expect_output", "level", "rewards", "setup_code_python", "setup_code_js",
  "setup_code_java", "is_active"];
const LANG_FIELDS = ["name", "judge0_id"];

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
      : null);

crud("/languages", "languages", LANG_FIELDS, (r) =>
  !r.name?.trim() || !Number.isInteger(r.judge0_id) ? "Name and Judge0 ID are required" : null);

module.exports = router;
