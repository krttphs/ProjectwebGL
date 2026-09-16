const express = require("express");
const router = express.Router();
const multer = require("multer");
const supabase = require("../config/supabaseClient");
const {requireAuth,hasAuth} = require("../middleware/authMiddleware");

// Multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {

    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("กรุณาเลือกไฟล์รูปภาพ"));
    }

    cb(null, true);
  }
});


// API: ดู Profile ของผู้ใช้
router.get("/profile", requireAuth, async (req, res) => {

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

    res.status(500).json({
      error: "ดึงข้อมูล Profile ไม่สำเร็จ"
    });

  }

});


// API: อัปโหลดรูป Profile
router.post(
  "/profile/image",
  requireAuth,
  upload.single("profileImage"),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          error: "ไม่พบไฟล์รูปภาพ"
        });
      }

      const userId = req.user.id;

      const fileExt =
        req.file.originalname.split(".").pop();

      const filePath =
        `${userId}/profile-${Date.now()}.${fileExt}`;


      // Upload ไป Supabase Storage
      const { error: uploadError } =
        await supabase.storage
          .from("avatars")
          .upload(
            filePath,
            req.file.buffer,
            {
              contentType: req.file.mimetype,
              cacheControl: "3600",
              upsert: true
            }
          );


      if (uploadError) {

        console.error(
          "Storage Upload Error:",
          uploadError
        );

        return res.status(500).json({
          error: uploadError.message
        });
      }


      // สร้าง Public URL
      const { data: publicUrlData } =
        supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);


      const imageUrl =
        publicUrlData.publicUrl;


      // บันทึก URL ลง users.profile_image
      const { data, error } =
        await supabase
          .from("users")
          .update({
            profile_image: imageUrl
          })
          .eq("id", userId)
          .select()
          .single();


      if (error) {

        console.error(
          "Database Update Error:",
          error
        );

        return res.status(500).json({
          error: error.message
        });
      }


      res.json({
        message: "เปลี่ยนรูปโปรไฟล์เรียบร้อยแล้ว",
        profile_image: imageUrl,
        user: data
      });


    } catch (error) {

      console.error(
        "Profile Image Error:",
        error
      );

      res.status(500).json({
        error: error.message ||
          "อัปโหลดรูปไม่สำเร็จ"
      });

    }

  }
);


// API: บันทึก Profile
router.patch("/profile", requireAuth, async (req, res) => {

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
      .select()
      .single();

    if (error) {

      console.error(error);

      return res.status(500).json({
        error: error.message
      });
    }

    res.json(data);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "เกิดข้อผิดพลาด"
    });

  }

});


// API: บวกเหรียญ
router.post("/add-coins", requireAuth, async (req, res) => {

  const { amount } = req.body;
  const userId = req.user.id;

  const { error } = await supabase.rpc("add_coins", {
    user_id: userId,
    amount: amount
  });

  if (error) {

    return res.status(500).json({
      error: error.message
    });

  }

  const { data: userData } = await supabase
    .from("users")
    .select("coins")
    .eq("id", userId)
    .single();

  res.json({
    message: "ได้รับเหรียญแล้ว",
    newBalance: userData?.coins || 0
  });

});


// API: ดูยอดเงิน
router.get("/balance", requireAuth, async (req, res) => {

  try {

    const { data, error } = await supabase
      .from("users")
      .select("coins")
      .eq("id", req.user.id)
      .single();

    if (error) {

      return res.status(500).json({
        error: error.message
      });

    }

    res.json({
      coins: data ? data.coins : 0
    });

  } catch (err) {

    res.status(500).json({
      error: "ดึงข้อมูลไม่สำเร็จ"
    });

  }

});


module.exports = router;