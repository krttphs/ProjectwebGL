const express = require("express");
const router = express.Router();
const supabase = require("../config/supabaseClient");

// Middleware ตรวจสอบ user (ต้องมี ไม่งั้น req.user.id จะหาไม่เจอและ Error)
const verifyToken = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Unauthorized: No token provided" });

    try {
        // ใช้ Supabase ตรวจสอบ Token ให้ (เหมือนใน auth.js)
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.log("Supabase Auth Error:", error?.message);
            return res.status(403).json({ error: "Invalid token" });
        }

        // ถ้าผ่าน ให้เก็บข้อมูล user ไว้ใช้ใน route ถัดไป
        req.user = user; 
        next();
    } catch (err) {
        console.error("Server Auth Error:", err);
        return res.status(500).json({ error: "Server error during authentication" });
    }
};

// ใช้ middleware กับทุก route
router.use(verifyToken);

// 1. Search Users
router.post('/search', async (req, res) => {
    const { query } = req.body;
    const myId = req.user.id; 

    const { data: users, error } = await supabase
        .from('users')
        .select('id, username, friends, friend_requests')
        .ilike('username', `%${query}%`)
        .neq('id', myId)
        .limit(10);

    if (error) return res.status(500).json({ error: error.message });

    const results = users.map(u => ({
        id: u.id,
        username: u.username,
        isFriend: u.friends?.includes(myId) || false,
        isPending: u.friend_requests?.includes(myId) || false
    }));

    res.json(results);
});

// 2. Send Friend Request
router.post('/request', async (req, res) => {
    const { targetId } = req.body;
    const myId = req.user.id;

    const { data: target } = await supabase.from('users').select('friend_requests').eq('id', targetId).single();
    
    let currentRequests = target.friend_requests || [];
    if (!currentRequests.includes(myId)) {
        currentRequests.push(myId);
    }

    const { error } = await supabase
        .from('users')
        .update({ friend_requests: currentRequests })
        .eq('id', targetId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// 3. Get Pending Requests
router.get('/pending', async (req, res) => {
    const myId = req.user.id;

    const { data: me } = await supabase.from('users').select('friend_requests').eq('id', myId).single();
    
    if (!me?.friend_requests || me.friend_requests.length === 0) {
        return res.json([]);
    }

    const { data: requestUsers } = await supabase
        .from('users')
        .select('id, username')
        .in('id', me.friend_requests);

    res.json(requestUsers || []);
});

// 4. Accept Request
router.post('/accept', async (req, res) => {
    const { requesterId } = req.body;
    const myId = req.user.id;

    // A. อัปเดตฝั่งเรา
    const { data: me } = await supabase.from('users').select('friends, friend_requests').eq('id', myId).single();
    let myFriends = me.friends || [];
    let myRequests = me.friend_requests || [];
    
    if (!myFriends.includes(requesterId)) myFriends.push(requesterId);
    myRequests = myRequests.filter(id => id !== requesterId);

    await supabase.from('users').update({ friends: myFriends, friend_requests: myRequests }).eq('id', myId);

    // B. อัปเดตฝั่งเขา
    const { data: them } = await supabase.from('users').select('friends').eq('id', requesterId).single();
    let theirFriends = them.friends || [];
    if (!theirFriends.includes(myId)) theirFriends.push(myId);

    await supabase.from('users').update({ friends: theirFriends }).eq('id', requesterId);

    res.json({ success: true });
});

// 5. Get My Friends List
router.get('/list', async (req, res) => {
    const myId = req.user.id;
    
    const { data: me } = await supabase.from('users').select('friends').eq('id', myId).single();
    
    if (!me?.friends || me.friends.length === 0) return res.json([]);

    const { data: friends } = await supabase
        .from('users')
        .select('id, username')
        .in('id', me.friends);

    res.json(friends || []);
});

module.exports = router;