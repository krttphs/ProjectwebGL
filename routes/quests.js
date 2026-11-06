const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

const QUEST_TABLE = "quests";
const HISTORY_TABLE = "player_quest_history";

// เลือกเฉพาะคอลัมน์ที่หน้าเว็บต้องใช้ — ห้ามใช้ select("*")
// เพราะตาราง quests มี input_submit / expected_output (คำตอบจริง) ที่ผู้เล่นไม่ควรเห็น
const QUEST_COLUMNS =
    "id, title, description, input_run, show_expect_output, level, rewards, is_active, setup_code";

// GET /api/quests : เฉพาะโจทย์ที่ผู้เล่นที่ล็อกอินอยู่เคยทำ (route นี้ต้องผ่าน requireAuth)
router.get("/", async (req, res) => {
    try {
        const playerId = req.user.id;

        const { data: history, error: historyErr } = await supabase
            .from(HISTORY_TABLE)
            .select("quest_id, result, created_at")
            .eq("player_id", playerId)
            .order("created_at", { ascending: false }); // ใหม่สุดก่อน
        if (historyErr) throw historyErr;
        if (!history || history.length === 0) return res.json([]);

        // รวมเป็นรายโจทย์: ถ้าเคย "ผ่าน" ครั้งใดครั้งหนึ่งให้ถือว่าผ่าน ไม่งั้นใช้ผลครั้งล่าสุด
        const byQuest = new Map();
        for (const h of history) {
            const cur = byQuest.get(h.quest_id);
            if (!cur) {
                byQuest.set(h.quest_id, { result: h.result, times: 1, last_played: h.created_at });
            } else {
                cur.times += 1;
                if (h.result === "passed") cur.result = "passed";
            }
        }

        const { data: quests, error: questErr } = await supabase
            .from(QUEST_TABLE)
            .select(QUEST_COLUMNS)
            .in("id", [...byQuest.keys()])
            .order("title", { ascending: true });
        if (questErr) throw questErr;

        res.json((quests || []).map((q) => ({ ...q, ...byQuest.get(q.id) })));
    } catch (err) {
        console.error("GET /api/quests error:", err);
        res.status(500).json({ error: "โหลดรายการเควสไม่สำเร็จ" });
    }
});

module.exports = router;