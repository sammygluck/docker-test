import { handleRouteChange } from "../router.js";
import { connectGameServer } from "../tournament/script.js";
import { connectChat } from "../chat/chatWSocket.js";
import { initNavProfile } from "../profile.js";
async function handleGoogleCredentialResponse(googleResponse) {
    try {
        const response = await fetch("/googleauth", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ credential: googleResponse.credential }),
        });
        const data = await response.json();
        if (!response.ok) {
            document.getElementById("username-message").textContent =
                "Authentication failed. Please try again.";
            return;
        }
        else if (data.message === "Enter username") {
            document.getElementById("loginPage")?.classList.add("hidden");
            document.getElementById("chooseUsernamePage")?.classList.remove("hidden");
            localStorage.setItem("googleCredential", googleResponse.credential);
            return;
        }
        else {
            localStorage.setItem("userInfo", JSON.stringify(data));
            localStorage.setItem("token", data.token);
            handleRouteChange();
            connectGameServer();
            connectChat();
            initNavProfile();
        }
    }
    catch (error) {
        console.error("Error:", error);
    }
}
async function sendUsername(username) {
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
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem("userInfo", JSON.stringify(data));
            localStorage.setItem("token", data.token);
            localStorage.removeItem("googleCredential");
            document.getElementById("chooseUsernamePage")?.classList.add("hidden");
            handleRouteChange();
            connectGameServer();
            connectChat();
            initNavProfile();
        }
        else if (response.status === 409 &&
            data.message === "User already exists") {
            document.getElementById("username-message").textContent =
                "Name already exists. Please choose another.";
        }
        else {
            document.getElementById("username-message").textContent =
                data.message || "Failed to set username.";
        }
    }
    catch (error) {
        console.error("Error:", error);
    }
}
window.onload = () => {
    if (typeof google !== "undefined") {
        google.accounts.id.initialize({
            client_id: "244561649148-pbll9pc66oig5mcul4ivjp9igql4emef.apps.googleusercontent.com",
            callback: handleGoogleCredentialResponse,
            ux_mode: "popup",
        });
        const googleLoginButton = document.getElementById("google-login-button");
        if (googleLoginButton) {
            googleLoginButton.addEventListener("click", () => {
                try {
                    google.accounts.id.prompt();
                }
                catch (err) {
                    console.error("Google Sign-In failed:", err);
                }
            });
        }
    }
    else {
        console.error("Google API not loaded.");
    }
};
document
    .getElementById("username-submit-button")
    .addEventListener("click", () => {
    const usernameInput = document.getElementById("username-input");
    const username = usernameInput.value.trim();
    if (username) {
        sendUsername(username);
    }
    else {
        document.getElementById("username-message").textContent =
            "Please enter a valid username.";
    }
});
