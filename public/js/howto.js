/* ===== คู่มือสอนเล่น (ภาพนิ่ง + คลิป) =====
   เปิดด้วย openHowTo("normal") หรือ openHowTo("endless")
   ใช้ได้ทั้งหน้า lobby และ gamemode1 แค่ใส่ howto.css + howto.js */

// ใส่รหัสคลิปยูทูบตรงนี้ (ตัวหลัง v= ในลิงก์) ถ้ายังไม่มีให้ปล่อยว่าง
const yt_tutorial_id = "nBeF6NetCj0";

const howtoSteps = {
    normal: [
        { img: "normal-01", title: "สร้างห้อง", text: "กด PLAY ที่โหมด Work office แล้วกด Create Room หรือกด Join เข้าห้องเพื่อน" },
        { img: "normal-02", title: "ตั้งค่าห้อง", text: "หัวหน้าห้องเลือกได้ว่าวันละกี่นาที และต้องทำงานกี่วัน แล้วกด Start" },
        { img: "normal-03", title: "จับจองคอมพิวเตอร์", text: "เดินไปที่คอมที่ยังว่าง แล้วกด E เพื่อเริ่มเขียนโค้ด" },
        { img: "normal-04", title: "สุ่มโจทย์", text: "กดปุ่ม Start random a task เพื่อรับโจทย์" },
        { img: "normal-05", title: "เลือกภาษา", text: "เลือกภาษาที่ถนัดได้ที่ช่อง Language โค้ดในช่อง 1 จะเปลี่ยนตาม" },
        { img: "normal-06", title: "เขียนโค้ด", text: "ช่อง 1 เตรียม input ไว้ให้แล้ว เขียนฟังก์ชันในช่อง 2 แล้วเรียกใช้ในช่อง 3" },
        { img: "normal-07", title: "ทดสอบด้วย Run", text: "กด Run เพื่อดูผลลัพธ์ด้านล่างก่อน ยังไม่ถูกตรวจคะแนน" },
        { img: "normal-08", title: "ส่งงานด้วย Submit", text: "มั่นใจแล้วกด Submit จะได้กล่องพัสดุตกลงมากลางห้อง ถ้าโค้ดผิด Server Heat จะเพิ่ม" },
        { img: "normal-09", title: "ส่งกล่องให้หัวหน้า", text: "กด E หยิบกล่อง แล้วเดินไปส่งหัวหน้า ถ้าโค้ดถูกโควตารายวันด้านบนจะเพิ่มขึ้น ถ้าโค้ดผิดโควตารายวันจะไม่เพิ่ม แต่ก็ต้องถือกล่องมาส่งอยู่ดีนะ ไม่งั้นเขียนโค้ดต่อไม่ได้จ้า" },
        { img: "normal-10", title: "ระวัง Server Heat", text: "ส่งผิดแล้ว heat จะเพิ่ม ถ้าถึง 100% = โดนไล่ออก!" },
        { img: "normal-11", title: "ลดความร้อน", text: "ไปห้อง server กด E จากนั้นกด Start cooling แล้วพิมพ์คำสั่งตามจอให้ทันเวลา heat จะลดลง" },
        { img: "normal-12", title: "ความหิวและความเครียด", text: "บริหารค่า Hunger และ Stress ที่มุมซ้ายล่าง ถ้าปล่อยให้ความหิวหมดจะโดนสตั้น ถ้าความเครียดเต็ม 100% จะถูกบังคับปิด Code editor" },
        { img: "normal-13", title: "ตู้ขายของเติมพลัง", text: "กด E ที่ตู้ กด 1 เพื่อซื้อขนม (เพิ่มความอิ่ม) หรือ 2 เพื่อซื้อบุหรี่ (ลดความเครียด)" },
        { img: "normal-14", title: "เครื่องกาแฟ", text: "กด E ที่เครื่องกาแฟเพื่อชงกาแฟ ช่วยเพิ่มความอิ่มและลดความเครียดเล็กน้อย" },
        { img: "normal-15", title: "ข้ามวัน", text: "ถ้าโควตาวันนี้ครบแล้ว กด Skip to next day เพื่อข้ามไปวันถัดไปได้เลย" }
    ],
    endless: [
        { img: "endless-01", title: "เข้าโหมด Endless", text: "กด PLAY ที่ Endless mode เล่นได้ไม่มีวันจบ จนกว่าจะโดนไล่ออก (server heat ถึง 100%)" },
        { img: "endless-02", title: "วันละ 8 นาที", text: "เกมกำหนดให้วันละ 8 นาที หัวหน้าห้องเปลี่ยนเองไม่ได้" },
        { img: "endless-03", title: "งานหนักขึ้นทุกวัน", text: "กติกาเหมือนโหมดปกติ แต่โควตาและ heat ตอนส่งผิดจะเพิ่มขึ้นทุกวัน ยิ่งคนเยอะงานยิ่งเยอะ" },
        { img: "endless-04", title: "ทำโควตาไม่ครบ = heat ขึ้น", text: "วันไหนส่งงานไม่ครบ Server Heat จะเพิ่มทันที ถ้าถึง 100% เกมจบ" }
    ]
};

let howtoMode = "normal";
let howtoIndex = 0;

function buildHowTo() {
    if (document.getElementById("howto-modal")) return;

    const modal = document.createElement("div");
    modal.id = "howto-modal";
    modal.className = "howto-modal";
    modal.innerHTML = `
        <div class="howto-box" role="dialog" aria-modal="true" aria-labelledby="howto-heading">
            <div class="howto-head">
                <h2 id="howto-heading">How to play</h2>
                <div class="howto-modes">
                    <button data-mode="normal" onclick="openHowTo('normal')">Work office</button>
                    <button data-mode="endless" onclick="openHowTo('endless')">Endless</button>
                </div>
                <button class="howto-close" onclick="closeHowTo()" aria-label="ปิด">&times;</button>
            </div>

            <div class="howto-tabs">
                <button data-tab="steps" class="active" onclick="howtoTab('steps')">ภาพนิ่ง</button>
                <button data-tab="video" onclick="howtoTab('video')">คลิปสอนเล่น</button>
            </div>

            <div class="howto-steps">
                <div class="howto-img-wrap">
                    <img id="howto-img" alt="">
                    <span id="howto-count" class="howto-count"></span>
                </div>
                <h3 id="howto-title"></h3>
                <p id="howto-text"></p>
                <div class="howto-nav">
                    <button id="howto-prev" onclick="howtoGo(-1)">&larr; ก่อนหน้า</button>
                    <div id="howto-dots" class="howto-dots"></div>
                    <button id="howto-next" onclick="howtoGo(1)">ถัดไป &rarr;</button>
                </div>
            </div>

            <div class="howto-video" hidden>
                <div id="howto-video-box"></div>
            </div>
        </div>`;

    // คลิกพื้นหลังมืด = ปิด
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeHowTo();
    });
    document.body.appendChild(modal);

    document.addEventListener("keydown", howtoKey);
}

// ปุ่มลัด: ซ้าย/ขวา เปลี่ยนรูป, Esc ปิด
// ในเกมเรียกฟังก์ชันนี้เองจากตัวดักคีย์ของ gameMode1.js (เพราะต้องตัดคีย์ไม่ให้ถึง Unity)
function howtoKey(e) {
    if (!isHowToOpen()) return;
    if (e.type !== "keydown") return;
    if (e.key === "ArrowRight") howtoGo(1);
    if (e.key === "ArrowLeft") howtoGo(-1);
    if (e.key === "Escape") closeHowTo();
}

// start = ขั้นที่จะเปิดก่อน (เริ่มนับ 0) เช่น ในเกมข้ามขั้นสร้างห้องไปเลย
function openHowTo(mode, start = 0) {
    buildHowTo();
    howtoMode = howtoSteps[mode] ? mode : "normal";
    howtoIndex = Math.min(start, howtoSteps[howtoMode].length - 1);
    document.querySelectorAll(".howto-modes button").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === howtoMode);
    });
    document.getElementById("howto-heading").textContent =
        howtoMode === "endless" ? "How to play: Endless mode" : "How to play: Work office";
    howtoTab("steps");
    showHowToStep();
    document.getElementById("howto-modal").classList.add("open");
}

function closeHowTo() {
    const modal = document.getElementById("howto-modal");
    if (!modal) return;
    modal.classList.remove("open");
    document.getElementById("howto-video-box").innerHTML = ""; // หยุดคลิป
    // ให้หน้าที่เรียกใช้ทำงานต่อหลังปิด (เช่นในเกม: คืนเมาส์ให้ Unity)
    if (typeof window.onHowToClose === "function") window.onHowToClose();
}

function isHowToOpen() {
    return document.getElementById("howto-modal")?.classList.contains("open") || false;
}

function howtoGo(step) {
    const steps = howtoSteps[howtoMode];
    howtoIndex = Math.min(steps.length - 1, Math.max(0, howtoIndex + step));
    showHowToStep();
}

function showHowToStep() {
    const steps = howtoSteps[howtoMode];
    const s = steps[howtoIndex];

    const img = document.getElementById("howto-img");
    img.src = `/img/howto/${s.img}.jpg`;
    img.alt = s.title;
    document.getElementById("howto-title").textContent = `${howtoIndex + 1}. ${s.title}`;
    document.getElementById("howto-text").textContent = s.text;
    document.getElementById("howto-count").textContent = `${howtoIndex + 1} / ${steps.length}`;

    document.getElementById("howto-prev").disabled = howtoIndex === 0;
    const next = document.getElementById("howto-next");
    const last = howtoIndex === steps.length - 1;
    next.innerHTML = last ? "เข้าใจแล้ว ✓" : "ถัดไป &rarr;";
    next.onclick = last ? closeHowTo : () => howtoGo(1);

    const dots = document.getElementById("howto-dots");
    dots.innerHTML = steps
        .map((_, i) => `<span class="${i === howtoIndex ? "on" : ""}" onclick="howtoIndex=${i};showHowToStep()"></span>`)
        .join("");
}

function howtoTab(tab) {
    const modal = document.getElementById("howto-modal");
    modal.querySelectorAll(".howto-tabs button").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === tab);
    });
    modal.querySelector(".howto-steps").hidden = tab !== "steps";
    modal.querySelector(".howto-video").hidden = tab !== "video";

    const box = document.getElementById("howto-video-box");
    if (tab === "video") {
        box.innerHTML = yt_tutorial_id
            ? `<iframe src="https://www.youtube-nocookie.com/embed/${yt_tutorial_id}"
                 title="OVERCODE สอนวิธีเล่น" allow="autoplay; encrypted-media; picture-in-picture"
                 referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`
            : `<p class="howto-empty">ยังไม่ได้ใส่คลิป</p>`;
    } else {
        box.innerHTML = ""; // ออกจากแท็บคลิป = หยุดคลิป
    }
}
