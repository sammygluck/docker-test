import { handleRouteChange } from "../router.js";
import { connectGameServer } from "../tournament/script.js";
import { connectChat } from "../chat/chatWSocket.js";
import { initNavProfile } from "../profile.js";

declare const google: any;

interface GoogleAuthResponse {
	credential: string;
}

interface AuthResponse {
	token?: string;
	message?: string;
}

async function handleGoogleCredentialResponse(
	googleResponse: GoogleAuthResponse
): Promise<void> {
	// Send the credential to the server
	try {
		const response = await fetch("/googleauth", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ credential: googleResponse.credential }),
		});
		const data: AuthResponse = await response.json();
		if (!response.ok) {
			document.getElementById("username-message").textContent =
				"Authentication failed. Please try again.";
			return;
		} else if (data.message === "Enter username") {
			document.getElementById("loginPage")?.classList.add("hidden");
			document.getElementById("chooseUsernamePage")?.classList.remove("hidden");
			localStorage.setItem("googleCredential", googleResponse.credential);
			return;
		} else {
			localStorage.setItem("userInfo", JSON.stringify(data));
			localStorage.setItem("token", data.token);
			handleRouteChange(); // Update the view after successful auth
			connectGameServer(); // Connect to the game server after login
                        connectChat(); // Connect to the chat server after login
                        initNavProfile();
		}
	} catch (error) {
		console.error("Error:", error);
	}
}

async function sendUsername(username: string): Promise<void> {
	// Send the username to the server
	try {
		const credential = localStorage.getItem("googleCredential");
		if (!credential) {
			console.error("No Google credential found in local storage.");
			return;
		}

		const response = await fetch("/googleauth", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ username, credential }),
		});

		const data: AuthResponse = await response.json();
		if (response.ok) {
			localStorage.setItem("userInfo", JSON.stringify(data));
			localStorage.setItem("token", data.token);
			localStorage.removeItem("googleCredential"); // Clear the token after successful verification
			document.getElementById("chooseUsernamePage")?.classList.add("hidden");
			handleRouteChange(); // Update the view after successful auth
			connectGameServer(); // Connect to the game server after login
			connectChat(); // Connect to the chat server after login
                        initNavProfile();
		} else if (
			response.status === 409 &&
			data.message === "User already exists"
		) {
			document.getElementById("username-message").textContent =
				"Name already exists. Please choose another.";
		} else {
			document.getElementById("username-message").textContent =
				data.message || "Failed to set username.";
		}
	} catch (error) {
		console.error("Error:", error);
	}
}

// On window load, initialize the Google Sign-In button
window.onload = (): void => {
	if (typeof google !== "undefined") {
		google.accounts.id.initialize({
			client_id:
				"244561649148-pbll9pc66oig5mcul4ivjp9igql4emef.apps.googleusercontent.com",
			callback: handleGoogleCredentialResponse,
			ux_mode: "popup", // important for login button flow
		});

		const googleLoginButton = document.getElementById("google-login-button");
		if (googleLoginButton) {
			googleLoginButton.addEventListener("click", () => {
				try {
					google.accounts.id.prompt();
				} catch (err) {
					console.error("Google Sign-In failed:", err);
				}
			});
		}
	} else {
		console.error("Google API not loaded.");
	}
};

document
	.getElementById("username-submit-button")
	.addEventListener("click", () => {
		const usernameInput = document.getElementById(
			"username-input"
		) as HTMLInputElement;
		const username = usernameInput.value.trim();
		if (username) {
			sendUsername(username);
		} else {
			document.getElementById("username-message").textContent =
				"Please enter a valid username.";
		}
	});