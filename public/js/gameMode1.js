var canvas = document.querySelector("#unity-canvas");
var unityInstance = null; // เก็บ instance ไว้ใช้ภายนอก

// --- Unity Loader Logic ---
var buildUrl = "Build";
var loaderUrl = buildUrl + "/Build.loader.js";
var config = {
  dataUrl: buildUrl + "/Build.data",
  frameworkUrl: buildUrl + "/Build.framework.js",
  codeUrl: buildUrl + "/Build.wasm",
  streamingAssetsUrl: "StreamingAssets",
  companyName: "DefaultCompany",
  productName: "My Game",
  productVersion: "2.0.1",
};
canvas.style.width = window.innerWidth + "px";
canvas.style.height = window.innerHeight + "px";

document.querySelector("#unity-loading-bar").style.display = "block";
//ดึง roomId จาก URL (ที่ส่งมาจาก lobby)
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get("roomId");

// heartbeat บอก server ว่ายังอยู่ในเกม (ทุกคนปิดแท็บ → server ปิดห้องให้อัตโนมัติ)
// เริ่มส่งตั้งแต่ก่อนโหลด Unity เสร็จ เพราะไฟล์เกมใหญ่ โหลดนาน
function sendHeartbeat(leaving = false) {
  if (!currentRoomId) return;
  const body = JSON.stringify({ roomId: currentRoomId, leaving });
  if (leaving) {
    navigator.sendBeacon(
      "/api/lobby/heartbeat",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }
  fetch("/api/lobby/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
}
sendHeartbeat();
const heartbeatTimer = setInterval(sendHeartbeat, 5000);
window.addEventListener("pagehide", () => sendHeartbeat(true));
var script = document.createElement("script");
script.src = loaderUrl;
script.onload = () => {
  createUnityInstance(canvas, config, (progress) => {
    document.querySelector("#unity-progress-bar-full").style.width =
      100 * progress + "%";
  })
    .then(async (instance) => {
      unityInstance = instance;
      document.querySelector("#unity-loading-bar").style.display = "none";
      document.getElementById("waiting-screen").style.display = "flex";
      if (instance.Module) {
        instance.Module.captureAllKeyboardInput = false;
      }
      await fetch("/api/game/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: currentRoomId }),
      });
      subscribeGameStatus(currentRoomId);
      fetch(`/api/game/mycomputer/${currentRoomId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.computer_id) {
            myComputerId = data.computer_id;
            unityInstance.SendMessage(
              "GameManager",
              "RestoreMyComputer",
              myComputerId,
            );
          }
        })
        .catch((err) => console.error("Error fetching my computer:", err));
    })
    .catch((message) => {
      alert(message);
    });
};
document.body.appendChild(script);
// --- UI Functions ---
let currentObjectId = null;
let myComputerId = null;
let currentObjectType = "editor";
let editorOpen = false;
let terminalOpen = false;
function toggleWebUI() {
  if (currentObjectType === "terminal") {
    setTerminalOpen(!terminalOpen);
  } else {
    setEditorOpen(!editorOpen);
  }
}

window.addEventListener("resize", () => {
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
});

// ------- จัดการ input ใน editor -------
(function () {
  const codePart2 = document.getElementById("code-part2");
  const codePart3 = document.getElementById("code-part3");

  // ฟังก์ชันสำหรับให้ผู้เล่นกดปุ่ม Tab เพื่อย่อหน้าโค้ดได้
  function handleTab(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      let s = this.selectionStart;
      let ePos = this.selectionEnd;
      this.value =
        this.value.substring(0, s) + "\t" + this.value.substring(ePos);
      this.selectionStart = this.selectionEnd = s + 1;
    }
  }

  // อนุญาตให้กด Tab ได้ในช่องที่ 2 และ 3
  if (codePart2) codePart2.addEventListener("keydown", handleTab);
  if (codePart3) codePart3.addEventListener("keydown", handleTab);
})();
// -------- Progress (Red/Green) --------
// level ของโจทย์ (ตั้งตอนสุ่มโจทย์) — ไม่ได้ใช้คำนวณ progress แล้ว (progress = นับบอลเขียวรายวันของทั้งห้อง)
let PROGRESS_INCREMENT_DECREMENT = 0;

// ===== Progress = โควต้ารายวันของทั้งห้อง =====
// ทั้งห้องต้องส่งบอลเขียวให้ NPC ให้ครบในแต่ละวัน (3 / 5 / 7 / 8 / 9 / 10 / 12) — ไม่ครบ → heat ต่อการส่งผิดขึ้นขั้น
// ค่าอยู่ใน DB (routes/game.js) → ทุกคนเห็นเท่ากัน: ได้ทันทีผ่าน realtime ของ game_rooms + poll /heat สำรอง
const DAILY_QUOTA = [3, 5, 7, 8, 9, 10, 12]; // ตรงกับ routes/game.js
const HEAT_STEPS = [10, 20, 40, 80, 100];
const QUOTA_STATE_COLUMN = "difficulty"; // "q:<วัน>:<ขั้น heat>" (ตรงกับ routes/game.js)

function setQuotaUI(info) {
  const quota = info.quota || 1;
  const delivered = info.delivered || 0;
  const met = delivered >= quota;

  document.getElementById("progress-bar-full").style.width =
    Math.min(100, (delivered / quota) * 100) + "%";
  document.getElementById("quota-text").textContent =
    `Day ${info.day + 1} · ${delivered}/${quota}${met ? " ✓" : ""}`;
  document.getElementById("quota-heat-text").textContent =
    `ส่งผิด = +${info.heatPerWrong} heat`;
  document.getElementById("progress-board").classList.toggle("quota-met", met);
}

// แถวของ game_rooms จาก realtime → ข้อมูลโควต้า
function quotaInfoFromRow(row) {
  const m = /^q:(\d+):(\d+)$/.exec(row[QUOTA_STATE_COLUMN] || "");
  const day = m ? Number(m[1]) : 0;
  const step = m ? Number(m[2]) : 0;
  return {
    day,
    delivered: row.progress || 0,
    quota: DAILY_QUOTA[Math.min(day, DAILY_QUOTA.length - 1)],
    heatPerWrong: HEAT_STEPS[Math.min(step, HEAT_STEPS.length - 1)],
  };
}

// แถบโควต้าโชว์ตลอดตอนเล่น
function showProgressBoard() {
  document.getElementById("progress-board").classList.add("visible");
}

// ===== ส่งบอลให้ NPC (Unity → เว็บ ผ่าน WebGLBridge.jslib) =====
// ballName คือชื่อ Object ของลูกบอล เช่น "GreenBall(Clone)" หรือ "RedBall(Clone)"
// แจ้ง server ว่าบอลถึง NPC แล้ว — บอลเขียวนับโควต้าวันนี้ +1 (บอลแดงไม่นับ)
async function applyBallProgress(ballName) {
  const name = (ballName || "").toLowerCase();
  const color = name.includes("green") ? "green" : name.includes("red") ? "red" : null;
  if (!color) {
    console.warn("[ball] ไม่รู้จักชนิดของลูกบอล (ไม่มีคำว่า green/red ในชื่อ):", ballName);
    return;
  }
  try {
    const res = await fetch("/api/game/ball-delivered", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: currentRoomId, color }),
    });
    if (res.ok) setQuotaUI(await res.json());
  } catch (err) {
    console.error("ball-delivered error:", err);
  }
}

// Unity: บอลที่ "เรา" submit ได้ถูกส่งให้ NPC แล้ว (เราส่งเอง หรือเพื่อนถือไปส่งแทน — ItemThrower.BallDeliveredRPC)
// → เคลียร์โจทย์ค้าง ให้สุ่มโจทย์ใหม่ได้ + อัปเดต progress
window.OnMyBallDelivered = function (ballName) {
  console.log("บอลของเราถูกส่งให้ NPC แล้ว:", ballName);
  applyBallProgress(ballName);
  myQuest = null;
};

// Unity: เราส่งบอลของคนที่ออกจากห้องไปแล้ว → อัปเดต progress แทนเขา (ไม่แตะโจทย์ของเรา)
window.OnBallSubmitted = function (ballName) {
  console.log("ส่งบอลแทนคนที่ออกจากห้องแล้ว:", ballName);
  applyBallProgress(ballName);
};

let myScore = 0;
function setScoreUI(score) {
  myScore = score;
  document.getElementById("score-number").textContent = score;
}

// ===== Server Heat (ค่าของทั้งห้อง: submit ผิด +10, ครบ 100 = overheat) =====
const HEAT_MAX = 100;
const HEAT_COLUMN = "max_players"; // คอลัมน์ใน game_rooms ที่ใช้เก็บ heat (ตรงกับ routes/game.js)
let roomHeat = 0;
let heatPollTimer = null;

function isOverheated() {
  return roomHeat >= HEAT_MAX;
}

let heatSentToUnity = null;
const HEAT_WARNING = 70;

// ป้ายเตือนกลางจอ: ≥70% เตือนสีส้ม, 100% overheat สีแดงกะพริบ (ซ่อนเมื่อเกมจบ)
function renderHeatWarning() {
  const el = document.getElementById("heat-warning");
  el.classList.remove("warn", "overheat");
  el.replaceChildren();
  if (isGameEnded) return;

  if (isOverheated()) {
    el.classList.add("overheat");
    el.append("🔥 SERVER OVERHEAT!");
    const detail = document.createElement("small");
    detail.textContent =
      "Server พัง — เกมจบ You got fired";
    el.appendChild(detail);
  } else if (roomHeat >= HEAT_WARNING) {
    el.classList.add("warn");
    el.append(`⚠️ Server เริ่มร้อนแล้ว (${roomHeat}%) — ถึง 100% = โดนไล่ออก! ไประบายความร้อนที่ Server Terminal`);
  }
}

function setHeatUI(heat) {
  roomHeat = Math.max(0, Math.min(HEAT_MAX, Number(heat) || 0));
  const overheated = isOverheated();

  renderHeatWarning();

  // ให้ Unity แสดงแถบ heat ใน HUD + ควัน/ไฟแดงที่ server (ServerHeatFX.cs) — ส่งเฉพาะตอนค่าเปลี่ยน
  if (unityInstance && roomHeat !== heatSentToUnity) {
    heatSentToUnity = roomHeat;
    unityInstance.SendMessage("ServerHeatFX", "SetHeat", String(roomHeat));
  }

  // overheat = server พัง → เกมจบทั้งห้อง (fired) — server เปลี่ยนสถานะห้องแล้ว จบฝั่งเราเลยไม่ต้องรอ realtime
  if (overheated && isGameStarted) endGame();

  if (terminalOpen && !coolingChallenge) renderTerminalIdle();
}

// ดึง heat (จาก DB) + คะแนนของเราเป็นระยะ — สำรองไว้เผื่อ realtime หลุด
async function refreshHeat() {
  if (!currentRoomId) return;
  try {
    const res = await fetch(`/api/game/heat/${currentRoomId}`);
    if (!res.ok) return;
    const data = await res.json();
    setHeatUI(data.heat);
    if (typeof data.quota === "number") setQuotaUI(data);
    if (typeof data.score === "number" && data.score !== myScore) setScoreUI(data.score);
  } catch (err) {
    console.error("refreshHeat error:", err);
  }
}

function startHeatPolling() {
  showProgressBoard();
  if (heatPollTimer) return;
  refreshHeat();
  // ค่าหลักมาทาง realtime แล้ว — poll ไว้สำรอง (เผื่อ realtime หลุด) และอัปเดตคะแนนของเรา
  heatPollTimer = setInterval(refreshHeat, 5000);
}

function stopHeatPolling() {
  clearInterval(heatPollTimer);
  heatPollTimer = null;
  renderHeatWarning(); // isGameEnded แล้ว → ซ่อนป้าย
  // จบเกม → ปิดเอฟเฟกต์ overheat ใน Unity
  if (unityInstance) unityInstance.SendMessage("ServerHeatFX", "SetHeat", "0");
}

// ===== Server Terminal: mini game ระบายความร้อน =====
// เริ่มได้ทุกเมื่อที่ heat > 0: พิมพ์คำสั่งที่โชว์ให้ครบทุกบรรทัดภายในเวลา → heat กลับเป็น 0
const terminalInput = document.getElementById("terminal-input");
let coolingChallenge = null; // { commands, answers, step, deadline, timer }

function setTerminalMessage(text, isError = false) {
  const el = document.getElementById("terminal-message");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function renderTerminalIdle() {
  const status = document.getElementById("terminal-status");
  const startBtn = document.getElementById("terminal-start-btn");
  document.getElementById("terminal-command").classList.add("hidden");
  startBtn.style.display = "block";

  // ระบายความร้อนได้ทุกเมื่อที่ heat > 0
  if (isOverheated()) {
    status.textContent = `> TEMPERATURE CRITICAL (${roomHeat}%)`;
    startBtn.disabled = false;
  } else if (roomHeat > 0) {
    status.textContent = `> Temperature ${roomHeat}% — ระบายความร้อนได้`;
    startBtn.disabled = false;
  } else {
    status.textContent = "> Temperature 0% — Server เย็นอยู่ ไม่ต้องระบายความร้อน";
    startBtn.disabled = true;
  }
}

function setTerminalOpen(open) {
  terminalOpen = open;
  const panel = document.getElementById("terminal-panel");
  const btn = document.getElementById("toggle-editor-btn");
  const unityCanvas = document.getElementById("unity-canvas");

  if (open) {
    btn.textContent = "Close Terminal";
    if (document.pointerLockElement) document.exitPointerLock();
    if (unityCanvas) unityCanvas.style.pointerEvents = "none";
    setTerminalMessage("");
    renderTerminalIdle();
    panel.classList.remove("hidden");
  } else {
    btn.textContent = "Open Terminal";
    stopCoolingChallenge();
    terminalInput.blur();
    panel.classList.add("hidden");
    // คืนเมาส์/คีย์บอร์ดให้ Unity ทันที ไม่งั้นกดเดินไม่ได้จนกว่าจะคลิกเกม
    if (unityCanvas) {
      unityCanvas.style.pointerEvents = "";
      if (!unityCanvas.hasAttribute("tabindex")) unityCanvas.tabIndex = -1;
      unityCanvas.focus();
    }
    // ปลดล็อกตัวละครใน Unity — ส่งไปที่ ServerHeatFX (ชื่อไม่ซ้ำ) ให้ปลดล็อก server ที่เปิดอยู่
    // (object ของ server ในฉากชื่อซ้ำกันหลายตัว SendMessage ตามชื่อจึงอาจไปผิดตัว)
    if (unityInstance) unityInstance.SendMessage("ServerHeatFX", "OnTerminalClosed");
  }
}

function stopCoolingChallenge() {
  if (coolingChallenge) clearInterval(coolingChallenge.timer);
  coolingChallenge = null;
  terminalInput.value = "";
  terminalInput.classList.remove("wrong");
}

function showCoolingStep() {
  const c = coolingChallenge;
  document.getElementById("terminal-step").textContent =
    `${c.step + 1}/${c.commands.length}`;
  document.getElementById("terminal-target").textContent = c.commands[c.step];
  terminalInput.value = "";
  terminalInput.focus();
}

async function startCoolingChallenge() {
  setTerminalMessage("");
  try {
    const res = await fetch("/api/game/heat/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: currentRoomId }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (typeof data.heat === "number") setHeatUI(data.heat);
      setTerminalMessage(data.error || "เริ่มไม่สำเร็จ", true);
      return;
    }

    stopCoolingChallenge();
    coolingChallenge = {
      commands: data.commands,
      answers: [],
      step: 0,
      deadline: Date.now() + data.timeLimit * 1000,
      timer: null,
    };
    document.getElementById("terminal-status").textContent = "> COOLING IN PROGRESS...";
    document.getElementById("terminal-start-btn").style.display = "none";
    document.getElementById("terminal-command").classList.remove("hidden");

    const timerEl = document.getElementById("terminal-timer");
    const tick = () => {
      const left = Math.max(0, Math.ceil((coolingChallenge.deadline - Date.now()) / 1000));
      timerEl.textContent = left;
      if (left <= 0) {
        stopCoolingChallenge();
        renderTerminalIdle();
        setTerminalMessage("หมดเวลา! ลองใหม่อีกครั้ง", true);
      }
    };
    tick();
    coolingChallenge.timer = setInterval(tick, 250);
    showCoolingStep();
  } catch (err) {
    console.error("startCoolingChallenge error:", err);
    setTerminalMessage("เริ่มไม่สำเร็จ", true);
  }
}

async function submitCoolingChallenge() {
  const c = coolingChallenge;
  try {
    const res = await fetch("/api/game/heat/cool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: currentRoomId, answers: c.answers }),
    });
    const data = await res.json();
    stopCoolingChallenge();
    if (!res.ok) {
      renderTerminalIdle();
      setTerminalMessage(data.error || "ระบายความร้อนไม่สำเร็จ", true);
      return;
    }
    setHeatUI(data.heat);
    renderTerminalIdle();
    setTerminalMessage("✔ Server cooled down! Submit ได้ตามปกติแล้ว");
  } catch (err) {
    console.error("submitCoolingChallenge error:", err);
    stopCoolingChallenge();
    renderTerminalIdle();
    setTerminalMessage("ระบายความร้อนไม่สำเร็จ", true);
  }
}

// กด Enter / ปุ่ม Enter → submit form (ฟัง keydown ตรงๆ ไม่ได้ เพราะตัวดักคีย์กัน Unity หยุด event ไว้ที่ window)
document.getElementById("terminal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!coolingChallenge) return;
  const c = coolingChallenge;
  const typed = terminalInput.value.trim();

  if (typed !== c.commands[c.step]) {
    terminalInput.classList.add("wrong");
    setTerminalMessage("คำสั่งไม่ถูกต้อง พิมพ์ใหม่", true);
    return;
  }

  terminalInput.classList.remove("wrong");
  setTerminalMessage("");
  c.answers.push(typed);
  c.step++;
  if (c.step < c.commands.length) showCoolingStep();
  else submitCoolingChallenge();
});

document
  .getElementById("terminal-start-btn")
  .addEventListener("click", startCoolingChallenge);
document
  .getElementById("terminal-close-btn")
  .addEventListener("click", () => setTerminalOpen(false));
// -------- Judge0 --------
const runBtn = document.getElementById("runBtn");
const output = document.getElementById("output");
let timeout = null;
let currentQuest = null;
let myQuest = null;

function fillSetupCode(quest) {
  const langId = document.getElementById("lang").value;
  document.getElementById("code-part1").value = quest?.setup_code?.[langId] || "";
}

runBtn.addEventListener("click", async () => {
  if (!currentQuest) {
    output.textContent = "⚠️ กรุณาสุ่มโจทย์ก่อน";
    return;
  }
  clearInterval(timeout);
  let dots = 0;
  timeout = setInterval(() => {
    dots = (dots % 3) + 1;
    output.textContent = "⏳ กำลังรันโค้ด" + ".".repeat(dots);
  }, 500);

  const lang = document.getElementById("lang").value;
  const part1 = document.getElementById("code-part1").value;
  const part2 = document.getElementById("code-part2").value;
  const part3 = document.getElementById("code-part3").value;

  const finalCode = `${part1}\n${part2}\n${part3}`;

  try {
    let res = await fetch(
      "/api/game/submissions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: finalCode,
          language_id: lang,
          roomId: currentRoomId,
          computerId: currentObjectId,
          type:"run",
        }),
      },
    );
    let result = await res.json();
    console.log("โค้ดที่ส่งไปรัน:\n", finalCode);
    console.log("Judge0 ตอบกลับมาว่า:", result);
    clearInterval(timeout);
    if (result.stdout) {
      output.textContent =
        result.stdout +
        "\nเวลาที่ใช้: " +
        result.time +
        " วินาที"
    }
    if (!res.ok) {
      output.textContent = "⚠️ " + (result.error || "รันไม่สำเร็จ");
    } else if (result.status?.id === 6) {
      output.textContent = "Compile Error:\n" + result.compile_output;
    } else if (result.status?.id === 5) {
      output.textContent = "⏱️ เกินเวลา (Time Limit Exceeded)";
    } else if (result.status?.id !== 3) {
      output.textContent = "Error:\n" + (result.stderr || result.status?.description);
    } else {
      output.textContent =
        (result.stdout || "(ไม่มี output)") + "\nเวลาที่ใช้: " + result.time + " วินาที";
    }
  } catch (err) {
    clearInterval(timeout);
    output.textContent = "เกิดข้อผิดพลาด: " + err.message;
  }
});
//ส่ง Submit เข้า Unity
const submitBtn = document.getElementById("submitBtn");
let submitTimeout = null;
document.getElementById("submitBtn").addEventListener("click", async () => {
  if (!currentQuest) {
    output.textContent = "⚠️ กรุณาสุ่มโจทย์ก่อน";
    return;
  }

  clearInterval(submitTimeout);
  let dots = 0;
  submitTimeout = setInterval(() => {
    dots = (dots % 3) + 1;
    output.textContent =
      "ส่งโค้ดเรียบร้อยแล้ว ! \r⏳ กำลังรันโค้ด" + ".".repeat(dots);
  }, 500);

  const lang = document.getElementById("lang").value;
  const part1 = document.getElementById("code-part1").value;
  const part2 = document.getElementById("code-part2").value;
  const part3 = document.getElementById("code-part3").value;

  const finalCode = `${part1}\n${part2}\n${part3}`;

  try {
    let res = await fetch("/api/game/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: finalCode,
        language_id: lang,
        roomId: currentRoomId,
        computerId: currentObjectId,
        type: "submit",
      }),
    });
    let result = await res.json();
    clearInterval(submitTimeout);

    if (!res.ok) {
      if (result.overheated) setHeatUI(result.heat);
      output.textContent = "⚠️ " + (result.error || "ส่งไม่สำเร็จ");
      return;
    }

    isGetATask = false;
    setScoreUI(result.score);
    if (typeof result.heat === "number") setHeatUI(result.heat);
    output.textContent = "เสร็จสิ้น！";

    if (unityInstance) {
      unityInstance.SendMessage(
        "GameManager",
        "SpawnResultBall",
        result.success ? "correct" : "wrong",
      );
      if (currentObjectId) {
        unityInstance.SendMessage(currentObjectId, "UpdateHavingTask", "false");
      }
    }
  } catch (err) {
    clearInterval(submitTimeout);
    output.textContent = "เกิดข้อผิดพลาด: " + err.message;
  }
});

document
  .getElementById("randomQuestBtn")
  .addEventListener("click", async () => {
    if(myQuest) return alert("ต้องนำบอลไปส่งหัวหน้าก่อน!");
    try {
      let res = await fetch(`/api/game/quests/random`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: currentRoomId,
        }),
      });
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      let quest = await res.json();
      isGetATask = true;
      if (unityInstance && currentObjectId) {
        console.log("บอก unity ว่าได้ task แล้วที่ :", currentObjectId);
        unityInstance.SendMessage(currentObjectId, "UpdateHavingTask", "true");
      } else {
        console.warn("❌ ไม่มี objectId หรือ unityInstance", currentObjectId);
      }

      currentQuest = quest;
      myQuest = quest;
      await setEditorOpen(true);
      // แสดงผลใน UI
      document.getElementById("taskTitle").textContent = quest.title;
      document.getElementById("problem").value = quest.description;
      document.getElementById("difficulty").textContent = quest.level;
      console.log("ระดับความยาก:" + quest.level);
      output.textContent = "สุ่มได้โจทย์: " + quest.title + "\n";
      output.textContent += "Input ที่ใช้: " + quest.input_run + "\n";
      output.textContent += "ผลลัพธ์ที่ต้องการ:\n" + quest.show_expect_output;
      fillSetupCode(currentQuest);
      document.getElementById("code-part2").value = "";
      document.getElementById("code-part3").value =
        "";
      if (myQuest.level === "easy") {
        PROGRESS_INCREMENT_DECREMENT = 10;
      } else if (myQuest.level === "medium") {
        PROGRESS_INCREMENT_DECREMENT = 20;
      } else {
        PROGRESS_INCREMENT_DECREMENT = 30;
      }
    } catch (err) {
      console.error(err);
      output.textContent = "สุ่มโจทย์ไม่สำเร็จ: " + err.message;
    }
  });

document.getElementById("lang").addEventListener("change", (e) => {
  if (currentQuest) fillSetupCode(currentQuest);
});
function back() {
  window.location.href = "/";
}
// ประกาศฟังก์ชันให้ Global (window) เพื่อให้ Unity หาเจอ
// --- Editor Open/Close State ---

function notifyUnityEditorClosed() {
  if (unityInstance && currentObjectId) {
    console.log("📤 ส่งกลับ Unity:", currentObjectId);
    unityInstance.SendMessage(currentObjectId, "OnWebEditorClosed");
  } else {
    console.warn("❌ ไม่มี objectId หรือ unityInstance", currentObjectId);
  }
}
let isGetATask = false;
let friendTask = false;
let isLanguagesLoaded = false;
async function setEditorOpen(open) {
  editorOpen = open;
  const editorPanel = document.getElementById("editor-panel");
  const getATaskPanel = document.getElementById("getATask-panel");
  const btn = document.getElementById("toggle-editor-btn");
  const codeTextarea = document.getElementById("code-part2");
  const unityCanvas = document.getElementById("unity-canvas");
  const langBody = document.getElementById("lang");
  if (open) {
    if (!isLanguagesLoaded) {
      try {
        const langs = await fetch("/api/game/languages");
        if (langs.ok) {
          const languages = await langs.json();
          const list = Array.isArray(languages) ? languages : languages.data;

          if (Array.isArray(list)) {
            langBody.innerHTML = "";
            list.forEach((l) => {
              const op = document.createElement("option");
              op.value = l.judge0_id;
              op.textContent = l.name;
              langBody.appendChild(op);
            });
            isLanguagesLoaded = true;
          } else {
            console.error("Languages data format is invalid:", languages);
          }
        } else {
          console.error("Failed to load languages, status:", langs.status);
        }
      } catch (err) {
        console.error("Error fetching languages:", err);
      }
    }
    btn.textContent = "Close Editor";

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (unityCanvas) {
      unityCanvas.tabIndex = -1;
      unityCanvas.style.pointerEvents = "none";
      unityCanvas.blur();
    }
    if (unityInstance && unityInstance.Module) {
      unityInstance.Module.captureAllKeyboardInput = false;
    }
    if (currentObjectId === myComputerId && isGetATask) {
      editorPanel.classList.remove("hidden");
      getATaskPanel.classList.add("hidden");
      setTimeout(() => {
        if (codeTextarea) codeTextarea.focus();
      }, 50);
    } else if (currentObjectId !== myComputerId && friendTask) {
      editorPanel.classList.remove("hidden");
      getATaskPanel.classList.add("hidden");
      setTimeout(() => {
        if (codeTextarea) codeTextarea.focus();
      }, 50);
    } else {
      getATaskPanel.classList.remove("hidden");
      editorPanel.classList.add("hidden");
    }
  } else {
    getATaskPanel.classList.add("hidden");
    editorPanel.classList.add("hidden");
  }
}

window.ShowCodeEditor = async function (dataString) {
  try {
    let parts = dataString.split("|");
    let objectId = parts[0];
    let uiType = parts[1] || "editor";
    let isMine = parts[2] === "true";
    currentObjectId = objectId;
    console.log(
      "Unity บอกให้เปิด UI ประเภท " + uiType + " ที่เครื่อง: " + objectId,
    );
    // Server Terminal ไม่ใช่คอมเขียนโค้ด → เปิด mini game ระบายความร้อนเลย
    if (uiType === "terminal") {
      currentObjectType = "terminal";
      setTerminalOpen(true);
      return;
    }
    if (myComputerId == null && isMine) {
      const res = await fetch("/api/game/mycomputer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          myComputer_id: objectId,
          roomId: currentRoomId,
        }),
      });
      const data = await res.json();
      myComputerId = data.computer_id;
    }
    if (!isMine) {
      const res = await fetch(
        `/api/game/computerCode/${currentRoomId}/${currentObjectId}`,
      );
      const data = await res.json();
      if (data && data.code.current_quest_id === null) {
        notifyUnityEditorClosed();
        return friendNotDoingTaskRNAlert();
      }
      currentQuest = data.quest;
      friendTask = true;
      document.getElementById("taskTitle").textContent = data.quest.title;
      document.getElementById("problem").value = data.quest.description;
      document.getElementById("difficulty").textContent = data.quest.level;
      output.textContent = "สุ่มได้โจทย์: " + data.quest.title + "\n";
      output.textContent += "Input ที่ใช้: " + data.quest.input_run + "\n";
      output.textContent +=
        "ผลลัพธ์ที่ต้องการ:\n" + data.quest.show_expect_output;
      fillSetupCode(data.quest); 
      document.getElementById("code-part2").value =
        data.code.code_part_2 || "";
      document.getElementById("code-part3").value =
        data.code.code_part_3 || "";
      if (unityInstance) {
        unityInstance.SendMessage(currentObjectId, "UpdateHavingTask", "true");
      }
    } else if (isMine && myComputerId !== null) {
      friendTask = false;
      const res = await fetch(
        `/api/game/computerCode/${currentRoomId}/${myComputerId}`,
      );
      const data = await res.json();
      if (data && data.code.current_quest_id === null) {
      } else {
        isGetATask = true;
        currentQuest = data.quest;
        document.getElementById("taskTitle").textContent = currentQuest.title;
        document.getElementById("problem").value = currentQuest.description;
        document.getElementById("difficulty").textContent = currentQuest.level;
        output.textContent = "สุ่มได้โจทย์: " + currentQuest.title + "\n";
        output.textContent += "Input ที่ใช้: " + currentQuest.input_run + "\n";
        output.textContent +=
          "ผลลัพธ์ที่ต้องการ:\n" + currentQuest.show_expect_output;
          fillSetupCode(currentQuest); 
        document.getElementById("code-part2").value =
          data.code.code_part_2 || "";
        document.getElementById("code-part3").value =
          data.code.code_part_3 || "";
        if (unityInstance) {
          unityInstance.SendMessage(
            currentObjectId,
            "UpdateHavingTask",
            "true",
          );
        }
      }
    }
    setupCodeSync(currentRoomId, currentObjectId, isMine);
    if (uiType === "terminal") {
      currentObjectType = "terminal";
      setTerminalOpen(!terminalOpen);
    } else {
      currentObjectType = "editor";
      setEditorOpen(true);
    }
  } catch (error) {
    console.error("ShowCodeEditor: ", error);
  }
};

window.HideCodeEditor = function (dataString) {
  const editorBtn = document.getElementById("toggle-editor-btn");
  let parts = dataString.split("|");
  let objectId = parts[0];
  let uiType = parts[1] || "editor";
  console.log(
    "Unity บอกให้ปิด UI ประเภท " + uiType + " ที่เครื่อง: " + objectId,
  );
  currentObjectId = objectId;
  // กด E ซ้ำที่ server ใน Unity → ปิด Server Terminal (Unity ปลดล็อกตัวละครเองแล้ว)
  if (uiType === "terminal") {
    currentObjectType = "terminal";
    if (terminalOpen) setTerminalOpen(false);
    return;
  }
  currentObjectType = "editor";
  editorBtn.innerText = "Open Editor";
  setEditorOpen(false);
  if (codingSyncChannel) {
    supabase.removeChannel(codingSyncChannel);
    codingSyncChannel = null;
  }
};

window.ShowEditorButton = function (dataString) {
  let parts = dataString.split("|");
  currentObjectId = parts[0];
  let uiType = parts[1] || "editor";

  const btn = document.getElementById("toggle-editor-btn");
  if (uiType === "terminal") {
    currentObjectType = "terminal";
    btn.innerText = "Open Terminal";
  } else {
    currentObjectType = "editor";
    btn.innerText = "Open Editor";
  }
  btn.style.display = "flex";
};
window.HideEditorButton = function (dataString) {
  let parts = dataString.split("|");
  currentObjectId = parts[0];

  const btn = document.getElementById("toggle-editor-btn");
  btn.style.display = "none";

  if (editorOpen) setEditorOpen(false);
  if (terminalOpen) setTerminalOpen(false);
};

const codeInput1 = document.getElementById("code-part1");
const codeInput2 = document.getElementById("code-part2");
const codeInput3 = document.getElementById("code-part3");
const problemInput = document.getElementById("problem");
const langSelect = document.getElementById("lang");

const editableElements = [
  codeInput1,
  codeInput2,
  codeInput3,
  problemInput,
  langSelect,
];

editableElements.forEach((el) => {
  if (!el) return;
  el.addEventListener("mousedown", () => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (unityInstance && unityInstance.Module) {
      unityInstance.Module.captureAllKeyboardInput = false;
    }
  });
});

let isGameStarted = false;
let isGameEnded = false;

async function subscribeGameStatus(roomId) {
  supabase
    .channel("game-room-" + roomId)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "game_rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        const newStatus = payload.new?.status;
        if (newStatus === "playing" && !isGameStarted) {
          isGameStarted = true;
          document.getElementById("waiting-screen").style.display = "none";
          startTimer();
        }
        // heat อยู่ใน game_rooms → ทุกคนในห้องได้ค่าใหม่พร้อมกันทันที (แบบเดียวกับ timer / day)
        // เก็บในคอลัมน์ max_players (ดู HEAT_COLUMN ใน routes/game.js) — อ่านเฉพาะตอนเกมเล่นอยู่ (ก่อนเริ่มยังเป็น 4)
        if (newStatus === "playing" && typeof payload.new?.[HEAT_COLUMN] === "number") {
          setHeatUI(payload.new[HEAT_COLUMN]);
        }
        // โควต้ารายวัน (progress) ก็อยู่ใน game_rooms → ทุกคนเห็นเท่ากันทันที
        if (newStatus === "playing" && payload.new) setQuotaUI(quotaInfoFromRow(payload.new));
        if (newStatus === "finished" && !isGameEnded) {
          isGameEnded = true;
          if (countdownInterval) clearInterval(countdownInterval);
          endGame();
        }
      },
    )
    .subscribe();
  try {
    const res = await fetch(`/api/game/room/${roomId}`);
    if (res.ok) {
      const roomData = await res.json();
      if (roomData.status === "playing" && !isGameStarted) {
        isGameStarted = true;
        document.getElementById("waiting-screen").style.display = "none";
        startTimer();
      }
    }
  } catch (err) {
    console.error("Error fetching initial room status:", err);
  }
}

let countdownInterval;

async function giveUp() {
  const res = await fetch("/api/game/giveup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: currentRoomId }),
  });
  const result = await res.json();
  if (!res.ok) {
    console.warn("giveUp:", result.error);
    return;
  }

  isGetATask = false;
  setScoreUI(result.score);
  if (typeof result.heat === "number") setHeatUI(result.heat);
  if (unityInstance) {
    unityInstance.SendMessage("GameManager", "SpawnResultBall", "wrong");
    if (currentObjectId) {
      unityInstance.SendMessage(currentObjectId, "UpdateHavingTask", "false");
    }
  }
}

async function saveCode() {
  try {
    const code_part_2 = document.getElementById("code-part2").value;
    const code_part_3 = document.getElementById("code-part3").value;

    if (!currentRoomId || !currentObjectId) return;

    await fetch("/api/game/code-part2-part3", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: currentRoomId,
        computerId: currentObjectId,
        codePart2: code_part_2,
        codePart3: code_part_3,
      }),
    });
    console.log("auto-saved code!");
  } catch (error) {
    console.error("failed to auto-save code");
  }
}

async function startTimer() {
  if (!currentRoomId) return;
  startHeatPolling();

  try {
    const res = await fetch(`/api/game/room/${currentRoomId}`);
    if (!res.ok) throw new Error("Fetch time error");
    const roomData = await res.json();
    //แปลงเป็น Timestamp
    const endTime = new Date(roomData.end_time).getTime();

    if (unityInstance) {
      // "เช้า,เที่ยง,เย็น,จำนวนวัน,วินาทีที่ผ่านไปแล้ว" (คนที่ join กลางเกมจะได้แสง/วันตรงกับคนอื่น)
      const dayCount = roomData.day_count || 1;
      const dayLength =
        roomData.morning_time + roomData.noon_time + roomData.evening_time;
      const elapsed = Math.max(
        0,
        dayLength * dayCount - (endTime - Date.now()) / 1000,
      );
      const timeString =
        `${roomData.morning_time},${roomData.noon_time},${roomData.evening_time},` +
        `${dayCount},${elapsed.toFixed(1)}`;
      unityInstance.SendMessage("GameManager", "SetupTime", timeString);
    }

    countdownInterval = setInterval(() => {
      const now = new Date().getTime();
      const distance = endTime - now;

      if (distance <= 0) {
        clearInterval(countdownInterval);
        endGame();
      } else {
        // คำนวณนาทีและวินาที
        // นาทีรวม (เกม 7 วันยาวเกิน 1 ชั่วโมงได้ ไม่ตัดชั่วโมงทิ้ง)
        let m = Math.floor(distance / (1000 * 60));
        let s = Math.floor((distance % (1000 * 60)) / 1000);
        document.getElementById("timer-display").innerText =
          (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
      }
    }, 1000);
  } catch (err) {
    console.error("Timer start failed:", err);
  }
}

window.ForceCloseWebUI = function () {
  console.log("Unity สั่งบังคับปิด Editor!");

  document.getElementById("toggle-editor-btn").style.display = "none";

  if (editorOpen) setEditorOpen(false);
  if (terminalOpen) setTerminalOpen(false);
};

let isStressMessageShowing = false;
window.AlertMessageStress = function () {
  if (isStressMessageShowing) {
    return;
  }
  console.log("เรียก AlertMessageStress");
  isStressMessageShowing = true;

  document.getElementById("stress-message").style.display = "flex";

  setTimeout(() => {
    document.getElementById("stress-message").style.display = "none";
    isStressMessageShowing = false;
  }, 3000);
};
let isOwn_a_computer_message_showing = false;
window.AlertMessageOwnAComputer = function () {
  if (isOwn_a_computer_message_showing) {
    return;
  }
  console.log("เรียก AlertMessageOwnAComputer");
  isOwn_a_computer_message_showing = true;

  document.getElementById("own_a_computer_message").style.display = "flex";

  setTimeout(() => {
    document.getElementById("own_a_computer_message").style.display = "none";
    isOwn_a_computer_message_showing = false;
  }, 3000);
};
let is_not_right_now_message_showing = false;
function friendNotDoingTaskRNAlert() {
  if (is_not_right_now_message_showing) {
    return;
  }
  is_not_right_now_message_showing = true;

  document.getElementById("not-right-now-message").style.display = "flex";

  setTimeout(() => {
    document.getElementById("not-right-now-message").style.display = "none";
    is_not_right_now_message_showing = false;
  }, 3000);
}
let codingSyncChannel = null;
let autoSaveTimer = null;
function setupCodeSync(roomId, computerId, isMine) {
  if (codingSyncChannel) {
    supabase.removeChannel(codingSyncChannel);
  }

  // สร้าง Channel โดยใช้ชื่อคอมพิวเตอร์
  codingSyncChannel = supabase.channel(`sync-${roomId}-${computerId}`);

  const part1 = document.getElementById("code-part1");
  const part2 = document.getElementById("code-part2");
  const part3 = document.getElementById("code-part3");
  const runBtn = document.getElementById("runBtn");
  const submitBtn = document.getElementById("submitBtn");

  //ปลดล็อกให้ทั้งสองคนแก้ไขโค้ดและเห็นปุ่ม Run/Submit ได้
  part2.readOnly = false;
  part3.readOnly = false;
  runBtn.style.display = "block";
  if (isMine) {
    submitBtn.style.display = "block";
  } else {
    submitBtn.style.display = "none";
  }
  //ดักรับข้อมูล Broadcast จากเพื่อนร่วมทีม
  codingSyncChannel
    .on("broadcast", { event: "typing" }, (payload) => {
      const { id, text } = payload.payload;
      const el = document.getElementById(id);

      if (el) {
        // เก็บตำแหน่ง Cursor ของเราไว้ก่อน เพื่อไม่ให้มันกระโดดเวลาค่าถูกอัปเดตจากเพื่อน
        const start = el.selectionStart;
        const end = el.selectionEnd;

        el.value = text;

        // คืนค่าตำแหน่ง Cursor ให้เราพิมพ์ต่อได้สมูทๆ
        el.setSelectionRange(start, end);
      }
    })
    .subscribe();

  //ส่งข้อมูล Broadcast ออกไปหาเพื่อนเวลาที่เราพิมพ์
  const broadcastCode = (e) => {
    codingSyncChannel.send({
      type: "broadcast",
      event: "typing",
      payload: { id: e.target.id, text: e.target.value },
    });
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveCode();
    }, 3000);
  };

  // ผูก Event ให้ส่งข้อมูลเมื่อมีการเปลี่ยนแปลงในกล่องที่ 2 และ 3 (กล่อง 1 ปกติล็อคไว้ให้ดูโจทย์)
  part2.oninput = broadcastCode;
  part3.oninput = broadcastCode;
}

// ออกจากเกมกลางคัน → กลับหน้า lobby (คนสุดท้ายออก ห้องจะถูกปิด)
async function leaveGame() {
  if (document.pointerLockElement) document.exitPointerLock();
  if (!confirm("ออกจากเกมนี้? คะแนนและรางวัลของเกมนี้จะไม่ได้รับ")) return;
  try {
    const res = await fetch("/api/lobby/leave", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: currentRoomId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert("ออกจากเกมไม่สำเร็จ: " + (data.error || res.status));
      return;
    }
  } catch (err) {
    console.error("Unable to leave the game: ", err);
    alert("ออกจากเกมไม่สำเร็จ");
    return;
  }
  window.location.href = "/lobby";
}

// Unity ส่งผลสรุปวันสุดท้ายมา (DailyAwards.cs ผ่าน WebGLBridge.jslib)
// { day, outcome: "awards"|"solo"|"tie"|"none", tieScore, employees:[{name,score}], slackers:[...] }
window.OnDayAwards = function (json) {
  let result;
  try {
    result = JSON.parse(json);
  } catch (err) {
    console.error("Invalid day awards from Unity:", err);
    return;
  }
  renderFinalDayAwards(result);
};

function renderFinalDayAwards(result) {
  const box = document.getElementById("final-day-awards");
  box.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = `สรุปวันที่ ${result.day} (วันสุดท้าย)`;
  box.appendChild(heading);

  const addAward = (cls, label, players) => {
    const row = document.createElement("div");
    row.className = `award ${cls}`;
    const tag = document.createElement("span");
    tag.className = "award-label";
    tag.textContent = label;
    row.appendChild(tag);
    // ชื่อผู้เล่นมาจากผู้ใช้ → ใส่เป็น textContent กันโดนแทรก HTML
    row.appendChild(
      document.createTextNode(
        (players || []).map((p) => `${p.name} (${p.score})`).join(", "),
      ),
    );
    box.appendChild(row);
  };

  const addNote = (text) => {
    const note = document.createElement("div");
    note.className = "award-note";
    note.textContent = text;
    box.appendChild(note);
  };

  if (result.outcome === "awards" || result.outcome === "solo") {
    addAward("award-employee", "EMPLOYEE OF THE DAY", result.employees);
    if (result.slackers && result.slackers.length > 0) {
      addAward("award-slacker", "THE SLACKER", result.slackers);
    }
  } else if (result.outcome === "tie") {
    addNote(`ทุกคนเสมอกัน (${result.tieScore})`);
  } else {
    addNote("วันนี้ยังไม่มีใครส่งงาน");
  }

  box.style.display = "block";
}

// หัวข้อหน้าสรุปตามเหตุผลที่เกมจบ (server ส่ง reason มาจาก /api/game/endgame)
const END_SCREENS = {
  timeup: { title: "Time's Up!", subtitle: "สรุปผลการแข่งขัน", color: "#ff79c6" },
  completed: { title: "Project Complete!", subtitle: "ทีมทำงานครบ 100% ก่อนหมดเวลา", color: "#50fa7b" },
  fired: { title: "SERVER OVERHEAT", subtitle: "🔥 YOU GOT FIRED 🔥", color: "#ff5555" },
};

let endGameShown = false;

async function endGame() {
  if (endGameShown) return; // เรียกได้หลายทาง (หมดเวลา / realtime / overheat) → แสดงครั้งเดียว
  endGameShown = true;
  try {
    isGameEnded = true;
    clearInterval(heartbeatTimer);
    stopHeatPolling();
    if (terminalOpen) setTerminalOpen(false);
    document.getElementById("leave-game-btn").style.display = "none";
    const res = await fetch(`/api/game/endgame/${currentRoomId}`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.log("Error:", data.error);
    const reason = data.reason || (isOverheated() ? "fired" : "timeup");

    const screen = END_SCREENS[reason] || END_SCREENS.timeup;
    const title = document.getElementById("summary-title");
    title.textContent = screen.title;
    title.style.color = screen.color;
    document.getElementById("summary-subtitle").textContent = screen.subtitle;

    document.getElementById("timer-display").innerText = "00:00";

    if (editorOpen) setEditorOpen(false);
    document.getElementById("toggle-editor-btn").style.display = "none";

    //ตัดการควบคุม Unity ไม่ให้ขยับตัวละครได้
    if (document.pointerLockElement) document.exitPointerLock();

    const finalScore = myScore;
    document.getElementById("final-score").innerText = finalScore;

    // โดนไล่ออก (server overheat) = ไม่ได้เหรียญ
    const coinsEarned = reason === "fired" ? 0 : finalScore > 0 ? finalScore : 0;
    document.getElementById("final-coins").innerText = coinsEarned;

    document.getElementById("summary-modal").style.display = "flex";
  } catch (err) {
    console.error("Unable to end the game: ", err);
  }
}
// Unity bind keyboard listeners ที่ window ด้วย capture:true
// วิธีเดียวที่ตัดได้คือดักที่ window capture phase ก่อน Unity
// แล้วเช็คว่า activeElement เป็น textarea -> stopImmediatePropagation ตัด Unity
// แต่ไม่ preventDefault เพื่อให้ browser ยังแสดงตัวอักษรใน textarea ได้ปกติ
["keydown", "keypress", "keyup"].forEach((evtType) => {
  window.addEventListener(
    evtType,
    (e) => {
      if (
        document.activeElement === codeInput1 ||
        document.activeElement === codeInput2 ||
        document.activeElement === codeInput3 ||
        document.activeElement === terminalInput
      ) {
        e.stopImmediatePropagation();
        // ไม่ preventDefault — ให้ browser จัดการ input ตามปกติ
      }
    },
    true,
  ); // capture:true — ทำงานก่อน Unity listener
});
