import { getAvatarUrl } from "./profile.js";
const routes = {
    "/home": "home",
    "/login": "loginPage",
    "/tournament": "tournamentPage",
    "/pong": "gamePage",
    "/": "tournamentPage",
    "/local": "localGamePage",
    "/404": "notFound",
};
const showChat = [
    "home",
    "tournamentPage",
    "gamePage",
    "localGamePage",
];
function checkLoggedIn() {
    const userInfo = localStorage.getItem("userInfo");
    if (!userInfo) {
        return null;
    }
    try {
        const parsedUserInfo = JSON.parse(userInfo);
        if (parsedUserInfo && parsedUserInfo.token) {
            return parsedUserInfo;
        }
    }
    catch (error) {
        console.error("Error parsing user info:", error);
        return null;
    }
}
function showView(viewId) {
    document.querySelectorAll(".route-view").forEach((el) => {
        el.classList.add("hidden");
    });
    if (!viewId) {
        document.body.innerHTML = "<h1>404 - Not Found</h1>";
        return;
    }
    const view = document.getElementById(viewId);
    const chatWindow = document.getElementById("chat-block");
    const chatToggle = document.getElementById("chat-toggle");
    const user = checkLoggedIn();
    if (view) {
        view.classList.remove("hidden");
    }
    else {
        document.body.innerHTML = "<h1>404 - Not Found</h1>";
    }
    if (chatWindow && chatToggle) {
        if (showChat.includes(viewId) && user) {
            chatWindow.classList.remove("hidden");
            chatToggle.classList.remove("hidden");
        }
        else {
            chatWindow.classList.add("hidden");
            chatToggle.classList.add("hidden");
        }
    }
}
function handleRouteChange() {
    let path = window.location.pathname;
    const user = checkLoggedIn();
    const navBar = document.getElementById("navbar");
    if (!user) {
        navBar?.classList.add("hidden");
        path = "/login";
    }
    else {
        navBar?.classList.remove("hidden");
        const usernameVal = user.username.trim() || "Guest";
        document.getElementById("navUsername").textContent = usernameVal;
        const navAv = document.getElementById("navAvatar");
        if (navAv)
            navAv.setAttribute("src", user.avatar ? getAvatarUrl(user.avatar, user.updated_at) : "/assets/default-avatar.png");
        if (path === "/login") {
            history.replaceState({}, "", "/tournament");
            path = "/tournament";
        }
    }
    const viewId = routes[path] || "notFound";
    showView(viewId);
}
document.addEventListener("click", (e) => {
    const target = e.target;
    const link = target.closest("[data-link]");
    if (link) {
        e.preventDefault();
        const href = link.getAttribute("href");
        if (href) {
            history.pushState({}, "", href);
            handleRouteChange();
        }
    }
});
document.getElementById("menuToggle").addEventListener("click", () => {
    const menu = document.getElementById("mobileMenu");
    menu.classList.toggle("hidden");
});
window.addEventListener("popstate", handleRouteChange);
window.addEventListener("DOMContentLoaded", handleRouteChange);
export { handleRouteChange };
