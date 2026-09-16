const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

const { requireAuth } = require("../middleware/authMiddleware");

router.get("/", requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("users")
            .select("id, username, coins, bio, profile_image")
            .eq("id", req.user.id)
            .single();

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        res.json(data);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "โหลด Profile ไม่สำเร็จ"
        });
    }
});

router.patch("/", requireAuth, async (req, res) => {
    try {
        const { bio, profile_image } = req.body;

        const updates = {};

        if (bio !== undefined) {
            updates.bio = bio;
        }

        if (profile_image !== undefined) {
            updates.profile_image = profile_image;
        }

        const { data, error } = await supabase
            .from("users")
            .update(updates)
            .eq("id", req.user.id)
            .select("id, username, coins, bio, profile_image")
            .single();

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        res.json(data);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "บันทึก Profile ไม่สำเร็จ"
        });
    }
});

module.exports = router;