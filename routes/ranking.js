const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

const LIMIT = Number(process.env.RANKING_LIMIT) || 50;

// ไม่ส่ง id ของผู้เล่นออกไปหน้าเว็บ ส่งแค่ is_me ให้ไฮไลต์แถวของตัวเอง

// GET /api/ranking/points : จัดอันดับตาม points (ได้จาก reward ตอนส่งเควสถูก)
router.get("/points", async (req, res) => {
    try {
        const myId = req.user.id;

        const { data, error } = await supabase
            .from("users")
            .select("id, username, profile_image, points")
            .order("points", { ascending: false, nullsFirst: false })
            .order("username", { ascending: true })
            .limit(LIMIT);
        if (error) throw error;

        // คะแนนเท่ากัน = อันดับเท่ากัน
        let rank = 0;
        let prev = null;
        const list = data.map((u, i) => {
            const pts = u.points || 0;
            if (pts !== prev) {
                rank = i + 1;
                prev = pts;
            }
            return {
                rank,
                username: u.username,
                profile_image: u.profile_image,
                points: pts,
                is_me: u.id === myId,
            };
        });

        // อันดับของตัวเอง (ถ้าไม่ติดรายการ top ก็คำนวณแยก)
        let me = list.find((r) => r.is_me);
        let inList = Boolean(me);
        if (!me) {
            const { data: mine, error: mineErr } = await supabase
                .from("users")
                .select("points")
                .eq("id", myId)
                .single();
            if (mineErr) throw mineErr;
            const myPoints = mine?.points || 0;

            const { count, error: countErr } = await supabase
                .from("users")
                .select("id", { count: "exact", head: true })
                .gt("points", myPoints);
            if (countErr) throw countErr;

            me = { rank: (count || 0) + 1, points: myPoints };
        }

        res.json({ list, me: { rank: me.rank, points: me.points, in_list: inList } });
    } catch (err) {
        console.error("GET /api/ranking/points error:", err);
        res.status(500).json({ error: "โหลดอันดับไม่สำเร็จ" });
    }
});

// GET /api/ranking/endless : รอบ Endless ที่อยู่รอดนานสุด + ใครอยู่ในห้องบ้าง
router.get("/endless", async (req, res) => {
    try {
        const myId = req.user.id;

        const { data: runs, error } = await supabase
            .from("endless_records")
            .select("id, duration_time, days_survived, player_ids, created_at")
            .order("duration_time", { ascending: false })
            .limit(LIMIT);
        if (error) throw error;
        if (!runs || runs.length === 0) return res.json({ list: [] });

        const ids = [...new Set(runs.flatMap((r) => r.player_ids || []))];
        const users = new Map();
        if (ids.length) {
            const { data: rows, error: userErr } = await supabase
                .from("users")
                .select("id, username, profile_image")
                .in("id", ids);
            if (userErr) throw userErr;
            (rows || []).forEach((u) => users.set(u.id, u));
        }

        const list = runs.map((r, i) => {
            const players = (r.player_ids || []).map((id) => {
                const u = users.get(id);
                return {
                    username: u?.username || "ผู้เล่นที่ถูกลบ",
                    profile_image: u?.profile_image || null,
                    is_me: id === myId,
                };
            });
            return {
                rank: i + 1,
                duration_time: r.duration_time,
                days_survived: r.days_survived,
                played_at: r.created_at,
                players,
                includes_me: players.some((p) => p.is_me),
            };
        });

        res.json({ list });
    } catch (err) {
        console.error("GET /api/ranking/endless error:", err);
        res.status(500).json({ error: "โหลดอันดับ Endless ไม่สำเร็จ" });
    }
});

module.exports = router;