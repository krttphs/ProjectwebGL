function goToLobby() { window.location.href = "/lobby"; }

function goToProfile() { window.location.href = "/profile"; }

function goToRanking() { window.location.href = "/leaderboard"; }

function goToQuest() { window.location.href = "/quest"; }

function goToAdmin() { window.location.href = "/admin"; }

fetch("/api/admin/me").then((r) => {
  if (r.ok) document.getElementById("adminBtn").hidden = false;
});

function logout() {
    fetch("/api/auth/logout", { method: "POST" })
        .then(() => {
            window.location.href = "/login";
        })
        .catch(() => {
            window.location.href = "/login";
        });
}