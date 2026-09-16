function goToLobby() { window.location.href = "/lobby"; }

function goToProfile() { window.location.href = "/profile"; }

function goToRanking() { window.location.href = "/leaderboard"; }

function goToFriends() { window.location.href = "/friends"; }

function goToShop() { window.location.href = "/shop"; }

function goToQuest() { window.location.href = "/quest"; }

function goToSettings() { window.location.href = "/settings"; }

function logout() {
    fetch("/api/auth/logout", { method: "POST" })
        .then(() => {
            window.location.href = "/login";
        })
        .catch(() => {
            window.location.href = "/login";
        });
}