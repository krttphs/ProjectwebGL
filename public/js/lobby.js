//userId เรา ที่ server ส่งมาให้
let MY_USER_ID;
async function fetchProfile() {
    try {
        const response = await fetch("/api/user/profile");

        if (!response.ok) {
            throw new Error("โหลด Profile ไม่สำเร็จ");
        }

        const data = await response.json();

        document.getElementById("username").textContent =
            data.username || "Unknown";

        document.getElementById("profileBio").textContent =
            data.bio || "";

        const profileImage =
            document.getElementById("profileImage");

        if (data.profile_image) {
            profileImage.src =
                data.profile_image + "?t=" + Date.now();
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
    alert("Error to logout! : ", err);
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
    obj.innerHTML = Math.floor(progress * (end - start) + start);
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
    btn.classList.add(
      "text-gray-400",
      "hover:text-white",
      "hover:bg-white/10",
    );
  });

  // Activate selected
  document
    .getElementById(`content-${tabName}`)
    .classList.remove("hidden");
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
                        ${req.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="font-bold text-white">${req.username}</div>
                        <div class="text-xs text-gray-400">Wants to be your friend</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="acceptRequest('${req.id}')" class="w-8 h-8 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all flex items-center justify-center border border-green-500/30">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button onclick="rejectRequest('${req.id}')" class="w-8 h-8 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center border border-red-500/30">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
        `,
      )
      .join("");
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
                        ${friend.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="font-bold text-white">${friend.username}</div>
                        <div class="text-xs text-green-400 flex items-center gap-1">
                            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div> Online
                        </div>
                    </div>
                </div>
                <div>
                <button class="text-xs bg-white/10 px-3 py-1 rounded-full text-gray-300 hover:bg-white/20">
                    Profile
                </button>
                <button onclick="openChatWithFriend('${friend.id}', '${friend.username}')" class="text-xs bg-white/10 px-3 py-1 rounded-full text-gray-300 hover:bg-white/20">
                    Chat <i class="fas fa-comment-dots"></i>
                </button>
                </div>
            </div>
        `,
      )
      .join("");
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
                        ${user.username.charAt(0).toUpperCase()}
                    </div>
                    <span class="text-white font-bold text-sm">${user.username}</span>
                </div>
                ${user.isFriend
            ? '<span class="text-xs text-gray-400">Already Friends</span>'
            : user.isPending
              ? '<span class="text-xs text-yellow-400">Request Sent</span>'
              : `<button onclick="sendRequest('${user.id}')" class="text-xs bg-cyan-600/20 text-cyan-400 px-3 py-1 rounded-lg border border-cyan-600/50 hover:bg-cyan-600 hover:text-white transition-all">
                        Add +
                    </button>`
          }
            </div>
        `,
      )
      .join("");
  } catch (err) {
    console.error(err);
    container.innerHTML = "Error searching.";
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
  document.getElementById("ChatFriendName").innerText = friendName;

  // โหลดข้อความเก่า
  const res = await fetch(`/api/chat/${roomId}/messages`);
  const messages = await res.json();

  console.log("CHAT HISTORY:", messages);

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
  box.innerHTML = "";

  messages.forEach((msg) => {
    appendMessage(msg);
  });

  box.scrollTop = box.scrollHeight;
}

//เพิ่มข้อความทีละอัน ซ้ายของเขา ขวาของเรา
function appendMessage(msg) {
  const box = document.getElementById("chatMessages");

  const div = document.createElement("div");
  div.className = "flex";
  console.log(msg.sender_id);
  console.log(MY_USER_ID);
  div.classList.add(
    msg.sender_id === MY_USER_ID ? "justify-end" : "justify-start",
  );

  div.innerHTML = `
    <span class="inline-block bg-white/10 text-white px-3 py-1 rounded-lg max-w-[70%]">
      ${msg.message}
    </span>
  `;

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
    document
      .getElementById("background-darker")
      .classList.remove("opacity-0");
    setTimeout(() => {
      document
        .getElementById("background-darker")
        .classList.remove("hidden");
      waitToOpenOrCloseTheHowToAgain = false;
    }, 300);
  } else {
    isTheHowToShown = false;
    waitToOpenOrCloseTheHowToAgain = true;
    HowToWindow.classList.remove("flex");
    HowToWindow.classList.remove("open-game-menu");
    HowToWindow.classList.add("close-game-menu");
    document
      .getElementById("background-darker")
      .classList.add("opacity-0");
    setTimeout(
      () =>
        document
          .getElementById("background-darker")
          .classList.add("hidden"),
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
      alert("หาห้องไม่สำเร็จ: " + data.error);
      return; //ไม่ต้องเปิดหน้าต่าง Lobby
    }

    currentLobbyId = data.roomId;
    isLeader = data.isLeader;

    document.getElementById("playerCountDisplay").innerText =
      `Players: ${data.playerCount} / 4`;

    const lobbyModal = document.getElementById("lobbyModal");
    lobbyModal.classList.remove("hidden");
    requestAnimationFrame(() => lobbyModal.classList.remove("opacity-0"));

    if (isLeader) {
      document.getElementById("startGameBtn").classList.remove("hidden");
      document
        .getElementById("time_input_area")
        .classList.remove("hidden");
      document.getElementById("lobbyStatus").innerText =
        "You are the Room Leader";
    } else {
      document.getElementById("startGameBtn").classList.add("hidden");
      document.getElementById("time_input_area").classList.add("hidden");
      document.getElementById("lobbyStatus").innerText =
        "Waiting for Leader to start...";
    }

    subscribeLobbyRealtime(currentLobbyId);
  } catch (err) {
    console.error("Matchmaking error:", err);
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
        // เมื่อ Leader สั่งเปลี่ยนสถานะห้องเป็น 'playing'
        if (
          payload.new.status === "loading" &&
          payload.eventType === "UPDATE"
        ) {
          // ย้ายผู้เล่นทุกคนที่อยู่ในห้องนี้ไปหน้า gamemode1
          // แนบ roomId ไปด้วย เพื่อให้ Unity หรือหน้า gamemode1 รู้ว่าเล่นอยู่ห้องไหน
          window.location.href = `/gamemode1?roomId=${roomId}`;
        }
        if (payload.eventType === "DELETE") {
          alert("ห้องถูกยุบแล้ว.");
          leaveLobby();
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_players",
        filter: `room_id=eq.${roomId}`,
      },
      async (payload) => {
        // เมื่อมีคนเข้าหรือออก ยิง API ไปอัปเดตตัวเลขใหม่ทันที
        try {
          const res = await fetch(`/api/lobby/${roomId}/players`);
          const data = await res.json();
          document.getElementById("playerCountDisplay").innerText =
            `Players: ${data.count} / 4`;
        } catch (err) {
          console.error("Failed to fetch player count", err);
        }
      },
    )
    .subscribe();
}

//ฟังก์ชันสำหรับ Leader กดเริ่มเกม
async function startGameLobby() {
  if (!currentLobbyId || !isLeader) return;
  try {
    let morning =
      parseInt(document.getElementById("time_morning").value) || 300;
    let noon = parseInt(document.getElementById("time_noon").value) || 60;
    let evening =
      parseInt(document.getElementById("time_evening").value) || 300;

    const res = await fetch("/api/lobby/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: currentLobbyId,
        morning_time: morning,
        noon_time: noon,
        evening_time: evening,
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

async function leaveLobby() {
  try {
    await fetch("/api/lobby/leave", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: currentLobbyId }),
    });
  } catch (err) {
    console.error("Failed to disconnect from server properly:", err);
  }
  if (lobbyChannel) supabase.removeChannel(lobbyChannel);
  currentLobbyId = null;
  document.getElementById("lobbyModal").classList.add("opacity-0");
  setTimeout(
    () => document.getElementById("lobbyModal").classList.add("hidden"),
    300,
  );
}

["time_morning", "time_noon", "time_evening"].forEach((id) => {
  const input = document.getElementById(id);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "-" || e.key === "e") e.preventDefault();
    });
  }
});

// Initial Load for Badge check
loadFriendRequests();
fetchBalance();
fetchUserData();
fetchProfile();