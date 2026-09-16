function goToMainMenu() {
    window.location.href = "/mainmenu";
}


async function loadProfile() {
    try {
        const response = await fetch("/api/user/profile");

        if (!response.ok) {
            throw new Error("โหลด Profile ไม่สำเร็จ");
        }

        const data = await response.json();

        document.getElementById("username").textContent =
            data.username || "USERNAME";

        document.getElementById("playerId").textContent =
            data.id || "000000";

        document.getElementById("bio").value =
            data.bio || "";

        document.getElementById("coins").textContent =
            data.coins || 0;


        // โหลดรูป Profile จาก Database
        if (data.profile_image) {
            document.getElementById("profileImage").src =
                data.profile_image + "?t=" + Date.now();
        }

        updateBioCount();

    } catch (error) {

        console.error(error);

        alert("โหลดข้อมูล Profile ไม่สำเร็จ");
    }
}


// ===============================
// Profile Image Upload
// ===============================

async function uploadProfileImage(file) {

    if (!file) return;


    // ตรวจสอบประเภทไฟล์
    if (!file.type.startsWith("image/")) {

        alert("กรุณาเลือกไฟล์รูปภาพ");

        return;
    }


    // จำกัดขนาด 6MB
    if (file.size > 6 * 1024 * 1024) {

        alert("รูปต้องมีขนาดไม่เกิน 6MB");

        return;
    }


    const profileImage =
        document.getElementById("profileImage");


    try {

        // Preview รูปทันที
        const previewURL =
            URL.createObjectURL(file);

        profileImage.src =
            previewURL;


        // สร้าง FormData
        const formData =
            new FormData();

        formData.append(
            "profileImage",
            file
        );


        // ส่งไฟล์ไป Backend
        const response =
            await fetch(
                "/api/user/profile/image",
                {
                    method: "POST",
                    body: formData
                }
            );


        const data =
            await response.json();


        // ตรวจสอบผลลัพธ์
        if (!response.ok) {

            throw new Error(
                data.error ||
                "อัปโหลดรูปไม่สำเร็จ"
            );
        }


        // เอา URL ที่ Backend บันทึกแล้วมาใช้
        if (data.profile_image) {

            profileImage.src =
                data.profile_image +
                "?t=" +
                Date.now();

        }


        // ล้าง Preview URL
        URL.revokeObjectURL(
            previewURL
        );


        alert(
            "เปลี่ยนรูปโปรไฟล์เรียบร้อยแล้ว"
        );


    } catch (error) {

        console.error(
            "Profile Image Error:",
            error
        );


        alert(
            error.message ||
            "เกิดข้อผิดพลาดในการอัปโหลดรูป"
        );
    }
}


// ===============================
// Select Profile Image
// ===============================

window.addEventListener(
    "DOMContentLoaded",
    () => {

        const input =
            document.getElementById(
                "profileImageInput"
            );


        if (input) {

            input.addEventListener(
                "change",
                async (event) => {

                    const file =
                        event.target.files[0];


                    if (!file) return;


                    await uploadProfileImage(
                        file
                    );
                }
            );
        }


        // โหลดข้อมูล Profile
        loadProfile();


        // Bio Character Count
        const bio =
            document.getElementById("bio");


        if (bio) {

            bio.addEventListener(
                "input",
                updateBioCount
            );
        }

    }
);


// ===============================
// Save Bio
// ===============================

async function saveBio() {

    const bio =
        document.getElementById("bio").value;


    try {

        const response =
            await fetch(
                "/api/user/profile",
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        bio: bio
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "บันทึก Profile ไม่สำเร็จ"
            );
        }


        alert("Bio saved!");


    } catch (error) {

        console.error(error);


        alert(
            "บันทึก Bio ไม่สำเร็จ"
        );
    }
}


// ===============================
// Bio Character Count
// ===============================

function updateBioCount() {

    const bio =
        document.getElementById("bio");


    const count =
        document.getElementById("bioCount");


    if (!bio || !count) return;


    count.textContent =
        `${bio.value.length} / 150`;
}