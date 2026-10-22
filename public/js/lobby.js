//userId เรา ที่ server ส่งมาให้
let MY_USER_ID;
let MY_USERNAME = "";

// แปลงอักขระพิเศษให้เป็นตัวหนังสือธรรมดา กันข้อมูลจากผู้ใช้กลายเป็น HTML/สคริปต์
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

async function fetchProfile() {
  try {
    const response = await fetch("/api/user/profile");

    if (!response.ok) {
      throw new Error("โหลด Profile ไม่สำเร็จ");
    }

    const data = await response.json();

    document.getElementById("username").textContent =
      data.username || "Unknown";

    document.getElementById("profileBio").textContent = data.bio || "";

    const profileImage = document.getElementById("profileImage");

    if (data.profile_image) {
      profileImage.src = data.profile_image + "?t=" + Date.now();
    }
  } catch (error) {
    console.error("Error loading profile:", error);
  }
}

async function fetchUserData() {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();

    if (response.ok) {
      document.getElementById("username").textContent = data.username;
      MY_USER_ID = data.id;
      MY_USERNAME = data.username || "";
    } else {
      window.location.href = "/login";
    }
  } catch (err) {
    console.log("Error fetching user's data: ", err);
  }
}

async function goToGameMode1() {
  // เพิ่มเสียงกดปุ่มตรงนี้ได้
  window.location.href = "/gamemode1";
}

async function logout() {
  if (!confirm("Are you sure you want to log out?")) return;

  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
    });
    if (response.ok) {
      window.location.reload();
    } else {
      alert("logout failed");
    }
  } catch (err) {
    alert("Error to logout! : " + err.message);
  }
}

async function fetchBalance() {
  try {
    const res = await fetch("/api/user/balance");
    if (!res.ok) return;

    const data = await res.json();

    const coinSpan = document.getElementById("coinDisplay");
    if (coinSpan) {
      animateValue(coinSpan, 0, data.coins, 1000);
    }
  } catch (err) {
    console.error("Error fetching balance:", err);
  }
}

// ทำให้ coin เพิ่มขึ้นแบบ 0 - จำนวนที่มี
function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.textContent = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

let isTheGameMenuOpen = false;
let waitToOpenOrCloseTheMenuAgain = false;
function openGameMenu() {
  if (waitToOpenOrCloseTheMenuAgain) {
    return;
  }
  const gameMenu = document.getElementById("gameMenu");
  if (!isTheGameMenuOpen) {
    waitToOpenOrCloseTheMenuAgain = true;
    isTheGameMenuOpen = true;
    gameMenu.classList.remove("hidden");
    gameMenu.classList.remove("close-game-menu");
    gameMenu.classList.add("flex");
    gameMenu.classList.add("open-game-menu");
    setTimeout(() => {
      waitToOpenOrCloseTheMenuAgain = false;
    }, 500);
  } else {
    waitToOpenOrCloseTheMenuAgain = true;
    isTheGameMenuOpen = false;
    gameMenu.classList.remove("open-game-menu");
    gameMenu.classList.add("close-game-menu");
    setTimeout(() => {
      gameMenu.classList.remove("flex");
      gameMenu.classList.add("hidden");
      waitToOpenOrCloseTheMenuAgain = false;
    }, 500);
  }
}

let isGlobeOpen = false;
let openGlobeDelay = false;
function openGlobeSettings() {
  const wrapper = document.getElementById("globeWrapper");
  const currentState = wrapper.getAttribute("data-state");
  const newState = currentState === "closed" ? "open" : "closed";

  wrapper.setAttribute("data-state", newState);
}

const friendModal = document.getElementById("friendModal");
const friendModalBox = document.getElementById("friendModalBox");
function openFriendModal() {
  // ปิดเมนู Globe ก่อนเพื่อให้หน้าจอเคลียร์
  const wrapper = document.getElementById("globeWrapper");
  wrapper.setAttribute("data-state", "closed");

  friendModal.classList.remove("hidden");
  requestAnimationFrame(() => {
    friendModal.classList.remove("opacity-0");
    friendModalBox.classList.remove("scale-90");
    friendModalBox.classList.add("scale-100");
  });

  // โหลดข้อมูลเพื่อนและคำขอทันทีที่เปิด
  loadMyFriends();
  loadFriendRequests();
}

function closeFriendModal() {
  friendModal.classList.add("opacity-0");
  friendModalBox.classList.remove("scale-100");
  friendModalBox.classList.add("scale-90");
  setTimeout(() => {
    friendModal.classList.add("hidden");
  }, 300);
}

// 2. Tab Switching
function switchTab(tabName) {
  // Reset styles
  ["myFriends", "addFriend", "requests"].forEach((t) => {
    document.getElementById(`content-${t}`).classList.add("hidden");
    const btn = document.getElementById(`tab-${t}`);
    btn.classList.remove("bg-cyan-600", "text-white", "shadow-lg");
    btn.classList.add("text-gray-400", "hover:text-white", "hover:bg-white/10");
  });

  // Activate selected
  document.getElementById(`content-${tabName}`).classList.remove("hidden");
  const activeBtn = document.getElementById(`tab-${tabName}`);
  activeBtn.classList.remove(
    "text-gray-400",
    "hover:text-white",
    "hover:bg-white/10",
  );
  activeBtn.classList.add("bg-cyan-600", "text-white", "shadow-lg");

  // Load data specific to tab
  if (tabName === "myFriends") loadMyFriends();
  if (tabName === "requests") loadFriendRequests();
}

// 3. Update Badges (Red numbers)
function updateBadge(count) {
  const badge = document.getElementById("friendBadge");
  const tabBadge = document.getElementById("reqTabBadge");

  // Logic 99+
  const displayCount = count > 99 ? "99+" : count;

  if (count > 0) {
    badge.textContent = displayCount;
    badge.classList.remove("hidden");

    tabBadge.textContent = displayCount;
    tabBadge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
    tabBadge.classList.add("hidden");
  }
}

// --- API Interactions (Backend Connection) ---

// Load Requests & Update Badge
async function loadFriendRequests() {
  const container = document.getElementById("content-requests");
  try {
    const res = await fetch("/api/friends/pending"); // GET pending requests
    const data = await res.json();

    updateBadge(data.length); // อัปเดตตัวเลขแจ้งเตือน

    if (data.length === 0) {
      container.innerHTML =
        '<div class="text-center text-gray-500 mt-20">No pending requests.</div>';
      return;
    }

    container.innerHTML = data
      .map(
        (req) => `
            <div class="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center font-bold text-white shadow-md">
                        ${escapeHtml(req.username.charAt(0).toUpperCase())}
                    </div>
                    <div>
                        <div class="font-bold text-white">${escapeHtml(req.username)}</div>
                        <div class="text-xs text-gray-400">Wants to be your friend</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button data-accept-id="${escapeHtml(req.id)}" class="accept-btn w-8 h-8 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all flex items-center justify-center border border-green-500/30">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button data-reject-id="${escapeHtml(req.id)}" class="reject-btn w-8 h-8 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center border border-red-500/30">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
        `,
      )
      .join("");

    container.querySelectorAll(".accept-btn").forEach((btn) => {
      btn.addEventListener("click", () => acceptRequest(btn.dataset.acceptId));
    });
    container.querySelectorAll(".reject-btn").forEach((btn) => {
      btn.addEventListener("click", () => rejectRequest(btn.dataset.rejectId));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<div class="text-red-400 text-center">Error loading requests</div>';
  }
}

// Load My Friends
async function loadMyFriends() {
  const container = document.getElementById("content-myFriends");
  try {
    const res = await fetch("/api/friends/list"); // GET my friends
    const data = await res.json();

    if (data.length === 0) {
      container.innerHTML =
        '<div class="text-center text-gray-500 mt-20">You have no friends yet. <br> Go add someone!</div>';
      return;
    }

    container.innerHTML = data
      .map(
        (friend) => `
            <div class="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10 hover:border-cyan-500/30 transition-all">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center font-bold text-white shadow-md">
                        ${escapeHtml(friend.username.charAt(0).toUpperCase())}
                    </div>
                    <div>
                        <div class="font-bold text-white">${escapeHtml(friend.username)}</div>
                        <div class="text-xs text-green-400 flex items-center gap-1">
                            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div> Online
                        </div>
                    </div>
                </div>
                <div>
                <button class="text-xs bg-white/10 px-3 py-1 rounded-full text-gray-300 hover:bg-white/20">
                    Profile
                </button>
                <button data-chat-id="${escapeHtml(friend.id)}" data-chat-name="${escapeHtml(friend.username)}" class="chat-btn text-xs bg-white/10 px-3 py-1 rounded-full text-gray-300 hover:bg-white/20">
                    Chat <i class="fas fa-comment-dots"></i>
                </button>
                </div>
            </div>
        `,
      )
      .join("");

    // ผูกปุ่ม Chat ทีหลัง แทนการใส่ username ลงใน onclick ตรงๆ
    container.querySelectorAll(".chat-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        openChatWithFriend(btn.dataset.chatId, btn.dataset.chatName),
      );
    });
  } catch (err) {
    console.error(err);
  }
}

// Search Users
async function searchUsers() {
  const query = document.getElementById("searchFriendInput").value;
  const container = document.getElementById("searchResultArea");
  if (!query) return;

  container.innerHTML =
    '<div class="text-center text-gray-400"><i class="fa-solid fa-circle-notch fa-spin"></i> Searching...</div>';

  try {
    const res = await fetch("/api/friends/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();

    if (data.length === 0) {
      container.innerHTML =
        '<div class="text-center text-gray-500 mt-4">User not found.</div>';
      return;
    }

    container.innerHTML = data
      .map(
        (user) => `
            <div class="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold border border-gray-600">
                        ${escapeHtml(user.username.charAt(0).toUpperCase())}
                    </div>
                    <span class="text-white font-bold text-sm">${escapeHtml(user.username)}</span>
                </div>
                ${
                  user.isFriend
                    ? '<span class="text-xs text-gray-400">Already Friends</span>'
                    : user.isPending
                      ? '<span class="text-xs text-yellow-400">Request Sent</span>'
                      : `<button data-add-id="${escapeHtml(user.id)}" class="add-btn text-xs bg-cyan-600/20 text-cyan-400 px-3 py-1 rounded-lg border border-cyan-600/50 hover:bg-cyan-600 hover:text-white transition-all">
                        Add +
                    </button>`
                }
            </div>
        `,
      )
      .join("");

    container.querySelectorAll(".add-btn").forEach((btn) => {
      btn.addEventListener("click", () => sendRequest(btn.dataset.addId));
    });
  } catch (err) {
    console.error(err);
    container.textContent = "Error searching.";
  }
}

// Actions (Send, Accept, Reject)
async function sendRequest(targetId) {
  await fetch("/api/friends/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId }),
  });
  alert("Request Sent!");
  searchUsers(); // Refresh list
}

async function acceptRequest(requesterId) {
  await fetch("/api/friends/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesterId }),
  });
  loadFriendRequests(); // Refresh requests
  loadMyFriends(); // Refresh friend list
}

async function rejectRequest(requesterId) {
  //ยังไม่ได้เขียน
  loadFriendRequests();
}

// ขอ roomId จาก server (มีอยู่แล้ว หรือสร้างใหม่)
async function openChatWithFriend(friendId, friendName) {
  try {
    const res = await fetch("/api/chat/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId }),
    });

    const { roomId } = await res.json();

    // เปิด popup แชท
    openChat(roomId, friendName);
  } catch (err) {
    console.error("openChatWithFriend error:", err);
  }
}

//chat popup
let currentRoomId = null;

async function openChat(roomId, friendName) {
  closeFriendModal();
  currentRoomId = roomId;

  // แสดง popup
  document.getElementById("chatWindow").classList.remove("hidden");
  document.getElementById("ChatFriendName").textContent = friendName;

  // โหลดข้อความเก่า
  const res = await fetch(`/api/chat/${roomId}/messages`);
  const messages = await res.json();

  renderMessages(messages);

  // subscribe realtime
  subscribeChatRealtime(roomId);
}

async function closeChat() {
  document.getElementById("chatWindow").classList.add("hidden");
}

//ส่งข้อความ
async function sendMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text || !currentRoomId) return;

  await fetch("/api/chat/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomId: currentRoomId,
      message: text,
    }),
  });

  input.value = "";
}

//realtime ของ supabase
//unsubscribe ห้องเก่า (ถ้าเปลี่ยนแชท)
//subscribe ห้องใหม่
//มีข้อความใหม่ → append ทันที
let chatChannel = null;

function subscribeChatRealtime(roomId) {
  if (chatChannel) {
    supabase.removeChannel(chatChannel);
    chatChannel = null;
  }

  chatChannel = supabase
    .channel("chat-" + roomId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        appendMessage(payload.new);
      },
    )
    .subscribe();
}

//แสดงข้อความเก่า
function renderMessages(messages) {
  const box = document.getElementById("chatMessages");
  box.textContent = "";

  messages.forEach((msg) => {
    appendMessage(msg);
  });

  box.scrollTop = box.scrollHeight;
}

//เพิ่มข้อความทีละอัน ซ้ายของเขา ขวาของเรา
function appendMessage(msg) {
  const box = document.getElementById("chatMessages");

  const div = document.createElement("div");
  div.className =
    "flex " + (msg.sender_id === MY_USER_ID ? "justify-end" : "justify-start");

  const span = document.createElement("span");
  span.className =
    "inline-block bg-white/10 text-white px-3 py-1 rounded-lg max-w-[70%]";
  span.textContent = msg.message; // ข้อความจากผู้ใช้ → textContent เสมอ

  div.appendChild(span);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

let isTheHowToShown = false;
let waitToOpenOrCloseTheHowToAgain = false;
function howToPlayGM1() {
  const HowToWindow = document.getElementById("howto-gm1");
  if (waitToOpenOrCloseTheHowToAgain) return;
  if (!isTheHowToShown) {
    isTheHowToShown = true;
    waitToOpenOrCloseTheHowToAgain = true;
    HowToWindow.classList.remove("hidden");
    HowToWindow.classList.add("flex");
    HowToWindow.classList.remove("close-game-menu");
    HowToWindow.classList.add("open-game-menu");
    document.getElementById("background-darker").classList.remove("opacity-0");
    setTimeout(() => {
      document.getElementById("background-darker").classList.remove("hidden");
      waitToOpenOrCloseTheHowToAgain = false;
    }, 300);
  } else {
    isTheHowToShown = false;
    waitToOpenOrCloseTheHowToAgain = true;
    HowToWindow.classList.remove("flex");
    HowToWindow.classList.remove("open-game-menu");
    HowToWindow.classList.add("close-game-menu");
    document.getElementById("background-darker").classList.add("opacity-0");
    setTimeout(
      () => document.getElementById("background-darker").classList.add("hidden"),
      300,
    );
    setTimeout(() => {
      HowToWindow.classList.add("hidden");
      waitToOpenOrCloseTheHowToAgain = false;
    }, 500);
  }
}

//หาห้อง
let currentLobbyId = null;
let lobbyChannel = null;
let isLeader = false;

async function findMatch() {
  try {
    const res = await fetch("/api/lobby/find-match", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      console.error("Backend Error:", data.error);
      showRoomError("หาห้องไม่สำเร็จ: " + data.error);
      loadRooms();
      return; //ไม่ต้องเปิดหน้าต่าง Lobby
    }

    showRoomError("");
    enterLobby(data);
  } catch (err) {
    console.error("Matchmaking error:", err);
    showRoomError("หาห้องไม่สำเร็จ");
  }
}

// เปิดหน้าต่างห้องรอ (waiting room) จากผลของ find-match / create / join
// data = { roomId, isLeader, playerCount, roomStatus? }
function enterLobby(data) {
  // เข้าห้องที่เริ่มเกมไปแล้ว (join กลางเกม) → ไปหน้าเกมเลย ไม่ต้องเปิดห้องรอ
  if (IN_GAME_STATUSES.includes(data.roomStatus)) {
    goToGame(data.roomId);
    return;
  }

  currentLobbyId = data.roomId;
  isLeader = data.isLeader;

  document.getElementById("playerCountDisplay").textContent =
    `Players: ${data.playerCount} / 4`;

  const lobbyModal = document.getElementById("lobbyModal");
  lobbyModal.classList.remove("hidden");
  requestAnimationFrame(() => lobbyModal.classList.remove("opacity-0"));

  if (isLeader) {
    document.getElementById("startGameBtn").classList.remove("hidden");
    document.getElementById("time_input_area").classList.remove("hidden");
    document.getElementById("lobbyStatus").textContent =
      "You are the Room Leader";
  } else {
    document.getElementById("startGameBtn").classList.add("hidden");
    document.getElementById("time_input_area").classList.add("hidden");
    document.getElementById("lobbyStatus").textContent =
      "Waiting for Leader to start...";
  }

  subscribeLobbyRealtime(currentLobbyId);
}

// ===== Room Browser (เลือก/สร้างห้อง ก่อนเข้า WebGL) =====
let roomBrowserChannel = null;
let roomReloadTimer = null;
let roomBrowserPollTimer = null;

const ROOM_STATUS_LABEL = {
  waiting: { text: "OPEN", cls: "bg-green-500/20 text-green-400 border-green-500/40" },
  full: { text: "FULL", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
  loading: { text: "STARTING", cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  playing: { text: "IN GAME", cls: "bg-gray-500/20 text-gray-300 border-gray-500/40" },
};

function openRoomBrowser() {
  const modal = document.getElementById("roomBrowserModal");
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.remove("opacity-0"));
  loadRooms();
  subscribeRoomBrowser();
}

function closeRoomBrowser() {
  const modal = document.getElementById("roomBrowserModal");
  modal.classList.add("opacity-0");
  setTimeout(() => modal.classList.add("hidden"), 300);
  if (roomBrowserChannel) {
    supabase.removeChannel(roomBrowserChannel);
    roomBrowserChannel = null;
  }
  if (roomBrowserPollTimer) clearInterval(roomBrowserPollTimer);
  roomBrowserPollTimer = null;
}

function showRoomError(msg) {
  const el = document.getElementById("roomListError");
  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

async function loadRooms() {
  try {
    const res = await fetch("/api/lobby/rooms");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "โหลดรายการห้องไม่สำเร็จ");
    showRoomError("");
    renderRooms(data);
  } catch (err) {
    console.error("loadRooms error:", err);
    showRoomError(err.message);
  }
}

const IN_GAME_STATUSES = ["loading", "playing"];

function renderRooms(data) {
  const { rooms, activeCount, maxRooms, myRoomId, myRoomStatus } = data;
  const list = document.getElementById("roomList");
  const inGame = IN_GAME_STATUSES.includes(myRoomStatus);

  document.getElementById("roomQuotaDisplay").textContent =
    `${activeCount} / ${maxRooms} rooms`;

  // ปุ่มสร้างห้อง: ปิดเมื่อชนเพดาน (ยกเว้นเราค้างห้องรออยู่ ปุ่มจะพากลับห้องเดิม)
  // และปิดเมื่อเรายังอยู่ในเกม (ต้อง REJOIN หรือ LEAVE ก่อน)
  const createBtn = document.getElementById("createRoomBtn");
  const quickBtn = document.getElementById("quickMatchBtn");
  createBtn.disabled = inGame || (activeCount >= maxRooms && !myRoomId);
  createBtn.title = inGame
    ? "คุณยังอยู่ในเกม"
    : createBtn.disabled
      ? "ห้องเต็มทั้งระบบแล้ว"
      : "";
  quickBtn.disabled = inGame;
  quickBtn.title = inGame ? "คุณยังอยู่ในเกม" : "";

  if (!rooms || rooms.length === 0) {
    list.innerHTML =
      '<div class="text-center text-gray-500 mt-16">ยังไม่มีห้อง<br>กด CREATE ROOM เพื่อเป็นหัวหน้าห้อง</div>';
    return;
  }

  list.innerHTML = rooms
    .map((r) => {
      const st = ROOM_STATUS_LABEL[r.status] || { text: r.status, cls: "bg-white/10 text-gray-300 border-white/20" };
      let action;
      if (r.isMine && IN_GAME_STATUSES.includes(r.status)) {
        action = `
          <div class="flex gap-2">
            <button data-room-id="${escapeHtml(r.id)}" class="rejoin-game-btn px-4 py-1.5 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-500 transition-all cursor-pointer">REJOIN</button>
            <button data-room-id="${escapeHtml(r.id)}" class="leave-game-btn px-4 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-sm font-bold border border-red-500/50 hover:bg-red-500 hover:text-white transition-all cursor-pointer">LEAVE</button>
          </div>`;
      } else if (r.isMine) {
        action = `<button data-room-id="${escapeHtml(r.id)}" class="join-room-btn px-4 py-1.5 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-500 transition-all cursor-pointer">REJOIN</button>`;
      } else if (!myRoomId && r.status !== "full" && r.playerCount < r.maxPlayers) {
        // join ได้ทุกช่วง (รอ / กำลังโหลด / กำลังเล่น) ถ้ายังมีที่ว่าง
        action = `<button data-room-id="${escapeHtml(r.id)}" class="join-room-btn px-4 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-300 text-sm font-bold border border-cyan-600/50 hover:bg-cyan-600 hover:text-white transition-all cursor-pointer">JOIN</button>`;
      } else {
        action = `<button disabled class="px-4 py-1.5 rounded-lg bg-white/5 text-gray-500 text-sm font-bold border border-white/10 cursor-not-allowed">JOIN</button>`;
      }
      return `
        <div class="flex justify-between items-center bg-white/5 p-3 rounded-xl border ${r.isMine ? "border-cyan-400/60" : "border-white/10"}">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="font-bold text-white tracking-wider">#${escapeHtml(r.code)}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${st.cls}">${escapeHtml(st.text)}</span>
            </div>
            <div class="text-xs text-gray-400">
              <i class="fa-solid fa-crown text-yellow-400 mr-1"></i>${escapeHtml(r.leaderName)}
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm font-bold ${r.playerCount >= r.maxPlayers ? "text-yellow-400" : "text-gray-200"}">
              <i class="fa-solid fa-user mr-1"></i>${r.playerCount}/${r.maxPlayers}
            </span>
            ${action}
          </div>
        </div>`;
    })
    .join("");

  list.querySelectorAll(".join-room-btn").forEach((btn) => {
    btn.addEventListener("click", () => joinRoomById(btn.dataset.roomId));
  });
  list.querySelectorAll(".rejoin-game-btn").forEach((btn) => {
    btn.addEventListener("click", () => goToGame(btn.dataset.roomId));
  });
  list.querySelectorAll(".leave-game-btn").forEach((btn) => {
    btn.addEventListener("click", () => leaveGame(btn.dataset.roomId));
  });
}

function goToGame(roomId) {
  window.location.href =
    `/gamemode1?roomId=${encodeURIComponent(roomId)}` +
    `&name=${encodeURIComponent(MY_USERNAME)}`;
}

// ออกจากเกมที่เริ่มไปแล้ว (คนสุดท้ายออก ห้องจะถูกปิด)
async function leaveGame(roomId) {
  if (!confirm("ออกจากเกมนี้? คะแนนและรางวัลของเกมนี้จะไม่ได้รับ")) return;
  try {
    const res = await fetch("/api/lobby/leave", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showRoomError(data.error || "ออกจากเกมไม่สำเร็จ");
      return;
    }
    showRoomError("");
  } catch (err) {
    console.error("leaveGame error:", err);
    showRoomError("ออกจากเกมไม่สำเร็จ");
  }
  loadRooms();
}

async function createNewRoom() {
  const btn = document.getElementById("createRoomBtn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/lobby/create", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      showRoomError(data.error || "สร้างห้องไม่สำเร็จ");
      loadRooms();
      return;
    }
    showRoomError("");
    enterLobby(data);
  } catch (err) {
    console.error("createNewRoom error:", err);
    showRoomError("สร้างห้องไม่สำเร็จ");
  } finally {
    btn.disabled = false;
  }
}

async function joinRoomById(roomId) {
  try {
    const res = await fetch("/api/lobby/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
    const data = await res.json();
    if (!res.ok) {
      showRoomError(data.error || "เข้าห้องไม่สำเร็จ");
      loadRooms();
      return;
    }
    showRoomError("");
    enterLobby(data);
  } catch (err) {
    console.error("joinRoomById error:", err);
    showRoomError("เข้าห้องไม่สำเร็จ");
  }
}

// อัปเดต room list แบบ realtime เมื่อมีการสร้าง/ลบห้อง หรือคนเข้า/ออก
function subscribeRoomBrowser() {
  if (roomBrowserChannel) return;
  const scheduleReload = () => {
    clearTimeout(roomReloadTimer);
    roomReloadTimer = setTimeout(loadRooms, 300); // รวมหลาย event ให้เหลือโหลดครั้งเดียว
  };
  roomBrowserChannel = supabase
    .channel("room-browser")
    .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" }, scheduleReload)
    .subscribe();
  // room_players มองไม่เห็นจาก browser (RLS) → จำนวนคนในห้องรีเฟรชเป็นระยะแทน
  roomBrowserPollTimer = setInterval(loadRooms, 5000);
}

// รีเฟรชหน้าแล้วยังค้างห้องรออยู่ → เปิดห้องเดิมให้อัตโนมัติ
async function resumeMyRoom() {
  try {
    const res = await fetch("/api/lobby/rooms");
    if (!res.ok) return;
    const data = await res.json();
    // เปิดห้องรอให้อัตโนมัติเฉพาะห้องที่ยังไม่เริ่ม (ถ้าอยู่ในเกม ให้ผู้เล่นเลือก REJOIN/LEAVE เอง)
    if (data.myRoomId && !IN_GAME_STATUSES.includes(data.myRoomStatus)) {
      joinRoomById(data.myRoomId);
    }
  } catch (err) {
    console.error("resumeMyRoom error:", err);
  }
}

//ฟังก์ชันดักจับ Realtime เหมือนตอนทำระบบ Chat
function subscribeLobbyRealtime(roomId) {
  if (lobbyChannel) {
    supabase.removeChannel(lobbyChannel);
  }
  lobbyChannel = supabase
    .channel("lobby-" + roomId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        // เมื่อ Leader สั่งเปลี่ยนสถานะห้องเป็น 'loading'
        if (payload.new.status === "loading" && payload.eventType === "UPDATE") {
          // ย้ายผู้เล่นทุกคนที่อยู่ในห้องนี้ไปหน้า gamemode1
          // แนบ roomId ไปด้วย เพื่อให้ Unity หรือหน้า gamemode1 รู้ว่าเล่นอยู่ห้องไหน
          // แนบชื่อผู้เล่นไปด้วย ให้ Unity ใช้เป็น NickName ของ Photon (โชว์บน Scoreboard)
          goToGame(roomId);
        }
        // Supabase ไม่ filter event DELETE (ห้องอื่นถูกลบก็ส่งมา) ต้องเช็ค id เอง
        if (payload.eventType === "DELETE" && payload.old?.id === roomId) {
          onLobbyDissolved();
        }
      },
    )
    .subscribe();

  // room_players มองไม่เห็นจาก browser (RLS) realtime เลยไม่ยิง → ดึงจำนวนคนจาก server เป็นระยะแทน
  startLobbyPolling(roomId);
}

let lobbyPollTimer = null;

function startLobbyPolling(roomId) {
  stopLobbyPolling();
  const poll = async () => {
    if (currentLobbyId !== roomId) return stopLobbyPolling();
    try {
      const res = await fetch(`/api/lobby/${roomId}/players`);
      if (res.status === 404) return onLobbyDissolved();
      if (!res.ok) return;
      const data = await res.json();
      if (currentLobbyId !== roomId) return;
      document.getElementById("playerCountDisplay").textContent =
        `Players: ${data.count} / 4`;
      // กันพลาด realtime: หัวหน้ากดเริ่มแล้ว → ไปหน้าเกม
      if (["loading", "playing"].includes(data.status)) goToGame(roomId);
    } catch (err) {
      console.error("Failed to fetch player count", err);
    }
  };
  poll();
  lobbyPollTimer = setInterval(poll, 2000);
}

function stopLobbyPolling() {
  if (lobbyPollTimer) clearInterval(lobbyPollTimer);
  lobbyPollTimer = null;
}

// ปิดแท็บ/ออกจากหน้า ขณะอยู่ในห้องรอ → บอก server ว่ากำลังจะออก
// (ถ้า refresh แล้วกลับมาทันเวลา ห้องยังอยู่, ถ้าทุกคนหายไป server จะยุบห้องให้)
window.addEventListener("pagehide", () => {
  if (!currentLobbyId) return;
  navigator.sendBeacon(
    "/api/lobby/heartbeat",
    new Blob([JSON.stringify({ roomId: currentLobbyId, leaving: true })], {
      type: "application/json",
    }),
  );
});

// ห้องถูกยุบ (หัวหน้าออก) → ปิดหน้าต่างฝั่งเรา ไม่ต้องเรียก /leave ซ้ำ
function onLobbyDissolved() {
  if (!currentLobbyId) return;
  closeLobbyModal();
  alert("ห้องถูกยุบแล้ว.");
}

function closeLobbyModal() {
  stopLobbyPolling();
  if (lobbyChannel) supabase.removeChannel(lobbyChannel);
  lobbyChannel = null;
  currentLobbyId = null;
  isLeader = false;
  if (roomBrowserChannel) loadRooms();
  document.getElementById("lobbyModal").classList.add("opacity-0");
  setTimeout(
    () => document.getElementById("lobbyModal").classList.add("hidden"),
    300,
  );
}

//ฟังก์ชันสำหรับ Leader กดเริ่มเกม
async function startGameLobby() {
  if (!currentLobbyId || !isLeader) return;
  try {
    const { dayMinutes, dayCount } = readTimeLimit();

    const res = await fetch("/api/lobby/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: currentLobbyId,
        day_minutes: dayMinutes,
        day_count: dayCount,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert("ไม่สามารถเริ่มเกมได้: " + data.error);
    }
  } catch (err) {
    console.error("error message: ", err);
  }
  // (หลังจากยิงผ่าน Backend จะไป trigger Supabase Realtime ที่ทุกคนรออยู่ให้ทำงานอัตโนมัติ)
}

// กด LEAVE LOBBY: ออกเฉพาะตัวเรา (ถ้าเป็นหัวหน้า ห้องจะถูกยุบ)
async function leaveLobby() {
  if (!currentLobbyId) return;
  const roomId = currentLobbyId;
  stopLobbyPolling();
  try {
    await fetch("/api/lobby/leave", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
  } catch (err) {
    console.error("Failed to disconnect from server properly:", err);
  }
  closeLobbyModal();
}

// time limit ที่ host เลือก: เวลาต่อวัน (3/5/10 นาที) x จำนวนวัน (1/3/5/7)
function readTimeLimit() {
  return {
    dayMinutes: Number(document.getElementById("time_day_minutes").value),
    dayCount: Number(document.getElementById("time_day_count").value),
  };
}

function updateTimeTotalDisplay() {
  const { dayMinutes, dayCount } = readTimeLimit();
  document.getElementById("time_total_display").textContent =
    `รวม ${dayMinutes * dayCount} นาที`;
}

["time_day_minutes", "time_day_count"].forEach((id) => {
  document.getElementById(id).addEventListener("change", updateTimeTotalDisplay);
});

// Initial Load for Badge check
loadFriendRequests();
fetchBalance();
fetchUserData();
fetchProfile();
resumeMyRoom();
