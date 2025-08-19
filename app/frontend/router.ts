import { getAvatarUrl } from "./profile.js";

type Routes = Record<string, string>;

interface userInfo {
        id: number;
        token: string;
        username: string;
        avatar: string | null;
        updated_at?: string | null;
}

const routes: Routes = {
	"/home": "home",
	"/login": "loginPage",
	"/tournament": "tournamentPage",
	"/pong": "gamePage",
	"/": "tournamentPage",
	"/local": "localGamePage",
	"/404": "notFound",
};

// display chat window on these pages
const showChat: string[] = [
	"home",
	"tournamentPage",
	"gamePage",
	"localGamePage",
];

function checkLoggedIn(): userInfo | null {
	// This function checks if the user is logged in
	const userInfo = localStorage.getItem("userInfo");
	if (!userInfo) {
		return null;
	}
	try {
		const parsedUserInfo: userInfo = JSON.parse(userInfo);
		if (parsedUserInfo && parsedUserInfo.token) {
			return parsedUserInfo;
		}
	} catch (error) {
		console.error("Error parsing user info:", error);
		return null;
	}
}

function showView(viewId: string | undefined): void {
        document.querySelectorAll<HTMLElement>(".route-view").forEach((el) => {
                el.classList.add("hidden");
        });

        if (!viewId) {
                document.body.innerHTML = "<h1>404 - Not Found</h1>";
                return;
        }

        const view = document.getElementById(viewId) as HTMLElement | null;
        const chatWindow = document.getElementById(
                "chat-block"
        ) as HTMLElement | null;
        const chatToggle = document.getElementById(
                "chat-toggle"
        ) as HTMLElement | null;
        const user = checkLoggedIn();
        if (view) {
                view.classList.remove("hidden");
        } else {
                document.body.innerHTML = "<h1>404 - Not Found</h1>";
        }
        if (chatWindow && chatToggle) {
                if (showChat.includes(viewId) && user) {
                        chatWindow.classList.remove("hidden");
                        chatToggle.classList.remove("hidden");
                } else {
                        chatWindow.classList.add("hidden");
                        chatToggle.classList.add("hidden");
                }
        }
}

function handleRouteChange(): void {
	let path = window.location.pathname;
        const user = checkLoggedIn();
        const navBar = document.getElementById("navbar");
        if (!user) {
                navBar?.classList.add("hidden");
                path = "/login";
        } else {
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

// Delegate click events on links with data-link attribute

document.addEventListener("click", (e: MouseEvent) => {
	const target = e.target as Element;
	const link = target.closest<HTMLElement>("[data-link]");

	if (link) {
		e.preventDefault();
		const href = link.getAttribute("href");
		if (href) {
			history.pushState({}, "", href);
			handleRouteChange();
		}
	}
});

// Toggle mobile menu
document.getElementById("menuToggle").addEventListener("click", () => {
	const menu = document.getElementById("mobileMenu");
	menu.classList.toggle("hidden");
});

// Handle browser navigation events

window.addEventListener("popstate", handleRouteChange);
window.addEventListener("DOMContentLoaded", handleRouteChange);

export { handleRouteChange };