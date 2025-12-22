const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

router.get("/quests/random/:level", async (req, res) => {
  const { level } = req.params;
  
  const { data, error } = await supabase.rpc("get_random_quest", { diff_level: level });

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) {
    return res.status(404).json({ message: "ไม่พบโจทย์ในระดับความยาก: " + level });
  }
  
  res.json(data[0]);
});

module.exports = router;