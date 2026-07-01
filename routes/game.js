const express = require('express')
const router = express.Router()
const supabase = require("../config/supabaseClient")
const { requireAuth } = require("../middleware/authMiddleware");

router.post("/updatePlayerScore",requireAuth,async (req,res) => {
    try{
        const roomId  = req.body.roomId;
    const userId = req.user.id;
    const newScore = req.body.score

    await supabase
    .from("room_players")
    .update({score: newScore})
    .eq("room_id",roomId)
    .eq("player_id",userId)

    res.json({success: true})
    } catch (err){
        console.error("update score err: ",err);
        res.status(500).json({ success: false, error: "Server error" });
    }
    
})

module.exports = router