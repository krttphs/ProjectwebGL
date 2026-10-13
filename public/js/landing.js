/* ===== Game Frame Controller =====
   หน้านี้เป็น "หน้าแม่" ที่มีกรอบเกม (iframe) เป็นพื้นที่หลัก
   หน้าลูก (login / mainmenu / lobby / gamemode1) ส่ง postMessage มาบอกให้เปลี่ยนหน้า */

const gameFrameBox = document.getElementById("game-frame");
const gameIframe   = document.getElementById("game-iframe");

const ALLOWED_TYPES = new Set([
    "LOGIN_SUCCESS",
    "OPEN_LOBBY",
    "START_GAME",
    "BACK_TO_LOBBY",
    "BACK_TO_MENU",
    "BACK_TO_LANDING"
]);

function setFrameState(state) {
    gameFrameBox.classList.remove("running", "loading");
    if (state) gameFrameBox.classList.add(state);
}

function loadInFrame(url) {
    setFrameState("loading");
    gameIframe.onload = () => setFrameState("running");
    gameIframe.src = url;
}

// ---- เริ่มเกม: ถ้า login แล้วไป mainmenu, ถ้ายังไปหน้า login ----
async function startGame() {
    if (gameFrameBox.classList.contains("loading")) return;

    document.getElementById("play")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFrameState("loading");

    let target = "/login";
    try {
        const res = await fetch("/api/auth/me");
        if (res.ok) target = "/mainmenu";
    } catch (err) {
        console.error("Auth check error:", err);
    }
    loadInFrame(target);
}

// ชื่อเดิมที่ปุ่มใน landing.html เรียกใช้อยู่
function goToLogin()    { startGame(); }
function goToRegister() { startGame(); }

function exitGame() {
    if (document.fullscreenElement) document.exitFullscreen();
    gameIframe.onload = null;
    gameIframe.src = "about:blank";
    setFrameState(null);
}

function reloadGame() {
    if (!gameIframe.src || gameIframe.src === "about:blank") return;
    setFrameState("loading");
    gameIframe.onload = () => setFrameState("running");
    gameIframe.contentWindow.location.reload();
}

function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        gameFrameBox.requestFullscreen?.();
    }
}

// ---- รับข้อความจากหน้าลูก ----
window.addEventListener("message", (event) => {
    // รับเฉพาะจาก origin เดียวกัน และมาจาก iframe ของเราเท่านั้น
    if (event.origin !== window.location.origin) return;
    if (event.source !== gameIframe.contentWindow) return;

    const { type, roomId } = event.data || {};
    if (!ALLOWED_TYPES.has(type)) return;

    switch (type) {
        case "LOGIN_SUCCESS":
        case "BACK_TO_MENU":
            loadInFrame("/mainmenu");
            break;

        case "OPEN_LOBBY":
        case "BACK_TO_LOBBY":
            loadInFrame("/lobby");
            break;

        case "START_GAME":
            if (roomId) {
                loadInFrame("/gamemode1?roomId=" + encodeURIComponent(roomId));
            }
            break;

        case "BACK_TO_LANDING":
            exitGame();
            break;
    }
});

function scrollToInfo() {
    document.getElementById("info")?.scrollIntoView({ behavior: "smooth" });
}