function goToLogin() {
    window.location.href = "/login";
}

function goToRegister() {
    window.location.href = "/register";
}

function scrollToInfo() {
    document.getElementById("info").scrollIntoView({
        behavior: "smooth"
    });
}