import { handleRouteChange } from "../router.js";
import {
        connectGameServer,
        disconnectGameServer,
} from "../tournament/script.js";
import { connectChat, disconnectChat } from "../chat/chatWSocket.js";
import { initNavProfile } from "../profile.js";

let isLogin: boolean = true;

function toggleForm(): void {
	isLogin = !isLogin;
	const formTitle = document.getElementById("auth-form-title");
	const authButton = document.getElementById("auth-button");
	const toggleText = document.querySelector(".toggle");
	const usernameField = document.getElementById("auth-username");
	const twoFactorCheckbox = document.getElementById("auth-2fa-checkbox");

	if (formTitle) {
		formTitle.textContent = isLogin ? "Login" : "Sign Up";
	}
	if (authButton) {
		authButton.textContent = isLogin ? "Login" : "Sign Up";
	}
	if (toggleText) {
		toggleText.textContent = isLogin
			? "Don't have an account? Sign up"
			: "Already have an account? Login";
	}
	if (usernameField) {
		usernameField.classList.toggle("hidden", isLogin);
	}
	if (twoFactorCheckbox) {
		twoFactorCheckbox.classList.toggle("hidden", isLogin);
	}
}

interface AuthResponse {
	token: string;
	message?: string;
	[key: string]: any;
}

async function authenticate(): Promise<void> {
	const usernameInput = document.getElementById(
		"auth-username"
	) as HTMLInputElement | null;
	const emailInput = document.getElementById(
		"auth-email"
	) as HTMLInputElement | null;
	const passwordInput = document.getElementById(
		"auth-password"
	) as HTMLInputElement | null;
	const messageElem = document.getElementById(
		"auth-message"
	) as HTMLElement | null;
	const twoFactorCheckbox = document.getElementById(
		"enable-2fa"
	) as HTMLInputElement | null;

	if (!emailInput || !passwordInput || !messageElem) {
		console.error("Missing required form elements");
		return;
	}

	const username = usernameInput?.value;
	const email = emailInput.value;
	const password = passwordInput.value;
	const endpoint = isLogin ? "/login" : "/user";
	const twoFactorEnabled = twoFactorCheckbox?.checked || false;
	const bodyData = isLogin
		? { email, password }
		: { email, username, password, twoFactorEnabled };

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(bodyData),
		});

		const data: AuthResponse = await response.json();

        if (response.ok) {
                        messageElem.classList.remove("text-red-500");
                        messageElem.classList.add("text-green-500");
                        messageElem.textContent = isLogin
                                ? "Login successful!"
                                : "Signup successful!";
			if (isLogin && data.token) {
				localStorage.setItem("userInfo", JSON.stringify(data));
				localStorage.setItem("token", data.token);
				handleRouteChange(); // Update the view after successful auth
                        connectGameServer(); // Connect to the game server after login
                        connectChat(); // Connect to the chat server after login
                        initNavProfile();
			} else if (
				isLogin &&
				data.message &&
				data.message === "Enter two factor code" &&
				data.twoFactorToken
			) {
				document.getElementById("loginPage")?.classList.add("hidden");
				document.getElementById("twoFactorPage")?.classList.remove("hidden");
				localStorage.setItem("twoFactorToken", data.twoFactorToken);
			} else if (isLogin) {
				messageElem.textContent = "Login successful, but no token received.";
			}
        } else {
                        messageElem.classList.remove("text-green-500");
                        messageElem.classList.add("text-red-500");
                        messageElem.textContent =
                                data.message || (isLogin ? "Login failed!" : "Signup failed!");
		}
        } catch (error) {
                        console.error("Authentication error:", error);
                        messageElem.classList.remove("text-green-500");
                        messageElem.classList.add("text-red-500");
                        messageElem.textContent = "An error occurred during authentication.";
	}
}

// 2 factor
async function twoFactorAuthenticate(): Promise<void> {
	const verifyButton = document.getElementById(
		"auth-2fa-button"
	) as HTMLButtonElement;
	const codeInput = document.getElementById(
		"auth-2fa-code"
	) as HTMLInputElement;
	const messageDisplay = document.getElementById(
		"auth-2fa-message"
	) as HTMLParagraphElement;
	const backToLogin = document.getElementById(
		"auth-2fa-back"
	) as HTMLParagraphElement;

	const twoFactorToken = localStorage.getItem("twoFactorToken");
	if (!twoFactorToken) {
		console.error("No two-factor token found in localStorage.");
		messageDisplay.textContent =
			"No two-factor token found. Please try logging in again.";
		return;
	}
	try {
		verifyButton.disabled = true;
		verifyButton.textContent = "Verifying...";

		const response = await fetch("/twofactor", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				twoFactorCode: codeInput.value,
				twoFactorToken: twoFactorToken,
			}),
		});

		const data: AuthResponse = await response.json();

		if (response.ok) {
			messageDisplay.textContent = "";
			localStorage.setItem("userInfo", JSON.stringify(data));
			localStorage.setItem("token", data.token);
			localStorage.removeItem("twoFactorToken"); // Clear the two-factor token after successful verification
			document.getElementById("twoFactorPage")?.classList.add("hidden");
			handleRouteChange(); // Update the view after successful auth
			connectGameServer(); // Connect to the game server after login
                        connectChat(); // Connect to the chat server after login
                        initNavProfile();
                } else {
			messageDisplay.textContent = data.error || "Verification failed.";
		}
	} catch (error) {
		console.error("2FA request error:", error);
		messageDisplay.textContent = "An error occurred. Please try again.";
	} finally {
		verifyButton.disabled = false;
		verifyButton.textContent = "Verify Code";
	}
}

function logout(): void {
	const messageElem = document.getElementById(
		"auth-message"
	) as HTMLElement | null;
	if (messageElem) {
		messageElem.textContent = "";
	}

	localStorage.removeItem("userInfo");
	localStorage.removeItem("token");
	disconnectGameServer(); // Disconnect from the game server
	disconnectChat(); // Disconnect from the chat server
	window.location.href = "/"; // Reload the page to reset the Google Identity Services state (necessary for google sign in)
	//handleRouteChange(); // Update the view after logout
}

let passwordField = document.getElementById("auth-password");
passwordField.addEventListener("keydown", (e) => {
	if (e.code === "Enter") {
		authenticate();
	}
});

document.getElementById("auth-button").addEventListener("click", () => {
	authenticate();
});

document.getElementById("auth-toggle").addEventListener("click", () => {
	toggleForm();
});

//logout button in navbar
document.getElementById("logoutBtn")?.addEventListener("click", () => {
	logout();
});

document.getElementById("auth-2fa-button")?.addEventListener("click", () => {
	twoFactorAuthenticate();
});

document.getElementById("auth-2fa-back")?.addEventListener("click", () => {
	document.getElementById("loginPage")?.classList.remove("hidden");
	document.getElementById("twoFactorPage")?.classList.add("hidden");
});

export { logout };