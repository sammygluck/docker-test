import { logout } from "../login/script.js";
import { game } from "../game_websocket/pong_websocket.js";
import { getAvatarUrl } from "../profile.js";
const tournamentList = document.getElementById("tournamentList");
const createTournamentForm = document.getElementById("createTournamentForm");
const tournamentNameInput = document.getElementById("tournamentName");
let selectedTitle = null;
let playerList = null;
let subscribeBtn = null;
let unsubscribeBtn = null;
let startBtn = null;
let deleteBtn = null;
let statusMessage = null;
let tournamentOverlay = null;
let tournaments = [];
let selectedTournament = null;
let userInfo = null;
let ws = null;
function connectGameServer() {
    const userInfoStr = localStorage.getItem("userInfo");
    if (!userInfoStr) {
        return;
    }
    userInfo = JSON.parse(userInfoStr);
    if (!userInfo || !userInfo.token) {
        return;
    }
    if (ws) {
        console.warn("Already connected to the game server");
        return;
    }
    ws = new WebSocket(`wss://${window.location.host}/game?token=${userInfo.token}`);
    ws.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
        disconnectGameServer();
    });
    ws.addEventListener("close", (e) => {
        switch (e.code) {
            case 4000:
                console.log("No token provided");
                logout();
                break;
            case 4001:
                console.log("Invalid token");
                logout();
                break;
            default:
                console.log("Game websocket connection closed");
        }
    });
    ws.addEventListener("open", () => {
        const msg = { type: "list_tournaments" };
        ws.send(JSON.stringify(msg));
        game.updateWebSocket(ws);
    });
    ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "tournaments") {
            tournaments = msg.data;
            renderTournamentList();
            if (selectedTournament !== null) {
                selectTournament(selectedTournament);
            }
        }
        else if (msg.type === "game") {
            game.receiveMessage(msg);
        }
        else if (msg.type === "nextMatch") {
            const tournamentUpdate = msg;
            updateGameHeader(tournamentUpdate);
        }
        else if (msg.type === "tournamentUpdate") {
            updateScore(msg.data.player1.score, msg.data.player2.score);
        }
        else if (msg.type === "countDown") {
            updateCountDown(msg.time);
        }
    });
    createTournamentForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = tournamentNameInput.value.trim();
        if (!name)
            return;
        const msg = { type: "create_tournament", name };
        ws.send(JSON.stringify(msg));
        tournamentNameInput.value = "";
    });
    console.log("Connected to the game server");
}
function disconnectGameServer() {
    if (ws) {
        ws.close();
        ws = null;
        console.log("Disconnected from the game server");
    }
    selectedTournament = null;
    tournaments = [];
    renderTournamentList();
    closeTournamentModal();
}
function startBtnClick() {
    if (selectedTournament === null)
        return;
    const msg = {
        type: "start_tournament",
        tournament: selectedTournament,
    };
    ws.send(JSON.stringify(msg));
}
function subscribeBtnClick() {
    if (selectedTournament === null)
        return;
    const msg = {
        type: "subscribe",
        tournament: selectedTournament,
    };
    ws.send(JSON.stringify(msg));
}
function unsubscribeBtnClick() {
    if (selectedTournament === null)
        return;
    const msg = {
        type: "unsubscribe",
        tournament: selectedTournament,
    };
    ws.send(JSON.stringify(msg));
}
function deleteBtnClick() {
    if (selectedTournament === null)
        return;
    const msg = {
        type: "delete_tournament",
        tournament: selectedTournament,
    };
    ws.send(JSON.stringify(msg));
}
async function renderTournamentList() {
    tournamentList.innerHTML = "";
    for (const t of tournaments) {
        const li = document.createElement("li");
        const subscribed = userInfo && t.players.some((p) => p.id === userInfo.id);
        li.className =
            "relative cursor-pointer p-4 rounded border border-pink-500 text-center shadow hover:shadow-lg transition-shadow ";
        li.className += subscribed
            ? "bg-pink-700/75 text-white"
            : "bg-[#1e1e3f] hover:bg-[#2a2a55] text-pink-100";
        let creatorName = t.creator.username;
        try {
            const res = await fetch(`/user/${t.creator.id}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            const data = await res.json();
            if (res.ok && data) {
                creatorName = (data.username ?? "").trim();
            }
        }
        catch (e) { }
        li.replaceChildren();
        const titleDiv = document.createElement("div");
        titleDiv.className = "font-semibold";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = t.name;
        titleDiv.appendChild(nameSpan);
        if (subscribed) {
            const checkSpan = document.createElement("span");
            checkSpan.className = "ml-1 text-pink-300/75";
            checkSpan.textContent = "✓";
            titleDiv.appendChild(checkSpan);
        }
        li.appendChild(titleDiv);
        const creatorDiv = document.createElement("div");
        creatorDiv.className = "text-sm text-pink-300";
        creatorDiv.textContent = `Creator: ${creatorName}`;
        li.appendChild(creatorDiv);
        const playersDiv = document.createElement("div");
        playersDiv.className = "text-sm text-pink-300";
        playersDiv.textContent = `${t.players.length} player${t.players.length !== 1 ? "s" : ""}`;
        li.appendChild(playersDiv);
        const iconStack = document.createElement("div");
        iconStack.className =
            "absolute top-1 right-1 flex flex-col items-center space-y-1";
        li.appendChild(iconStack);
        if (userInfo && userInfo.id === t.creator.id && !t.started) {
            const playBtn = document.createElement("button");
            playBtn.textContent = "▶️";
            if (t.players.length < 2) {
                playBtn.className =
                    "text-gray-400 cursor-not-allowed";
                playBtn.disabled = true;
            }
            else {
                playBtn.className =
                    "text-green-500 hover:text-green-700";
            }
            playBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (playBtn.disabled)
                    return;
                const msg = {
                    type: "start_tournament",
                    tournament: t.id,
                };
                ws?.send(JSON.stringify(msg));
            });
            iconStack.appendChild(playBtn);
        }
        const subBtn = document.createElement("button");
        subBtn.className = "text-blue-500 hover:text-blue-700";
        if (subscribed) {
            subBtn.textContent = "➖";
            subBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const msg = {
                    type: "unsubscribe",
                    tournament: t.id,
                };
                ws?.send(JSON.stringify(msg));
            });
        }
        else {
            subBtn.textContent = "➕";
            subBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const msg = {
                    type: "subscribe",
                    tournament: t.id,
                };
                ws?.send(JSON.stringify(msg));
            });
        }
        iconStack.appendChild(subBtn);
        if (userInfo && userInfo.id === t.creator.id && !t.started) {
            const delBtn = document.createElement("button");
            delBtn.className = "text-red-500 hover:text-red-700";
            delBtn.textContent = "🗑️";
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const msg = {
                    type: "delete_tournament",
                    tournament: t.id,
                };
                ws?.send(JSON.stringify(msg));
            });
            iconStack.appendChild(delBtn);
        }
        li.addEventListener("click", () => openTournamentModal(t.id));
        tournamentList.appendChild(li);
    }
}
function openTournamentModal(id) {
    const tpl = document.getElementById("tournament-tpl");
    if (!tpl)
        return;
    closeTournamentModal();
    const frag = tpl.content.cloneNode(true);
    tournamentOverlay = frag.firstElementChild;
    document.body.appendChild(tournamentOverlay);
    selectedTitle = tournamentOverlay.querySelector("#selectedTournamentTitle");
    statusMessage = tournamentOverlay.querySelector("#statusMessage");
    playerList = tournamentOverlay.querySelector("#playerList");
    subscribeBtn = tournamentOverlay.querySelector("#subscribeBtn");
    unsubscribeBtn = tournamentOverlay.querySelector("#unsubscribeBtn");
    startBtn = tournamentOverlay.querySelector("#startBtn");
    deleteBtn = tournamentOverlay.querySelector("#deleteBtn");
    tournamentOverlay.querySelector(".close-btn")?.addEventListener("click", closeTournamentModal);
    subscribeBtn?.addEventListener("click", subscribeBtnClick);
    unsubscribeBtn?.addEventListener("click", unsubscribeBtnClick);
    startBtn?.addEventListener("click", startBtnClick);
    deleteBtn?.addEventListener("click", deleteBtnClick);
    selectTournament(id);
}
function closeTournamentModal() {
    subscribeBtn?.removeEventListener("click", subscribeBtnClick);
    unsubscribeBtn?.removeEventListener("click", unsubscribeBtnClick);
    startBtn?.removeEventListener("click", startBtnClick);
    deleteBtn?.removeEventListener("click", deleteBtnClick);
    tournamentOverlay?.remove();
    tournamentOverlay = null;
    selectedTitle = null;
    statusMessage = null;
    playerList = null;
    subscribeBtn = null;
    unsubscribeBtn = null;
    startBtn = null;
    deleteBtn = null;
    selectedTournament = null;
}
async function selectTournament(id) {
    console.log("Selected tournament:", id);
    selectedTournament = id;
    if (!selectedTitle || !statusMessage || !playerList || !subscribeBtn || !startBtn) {
        return;
    }
    const tournament = tournaments.find((t) => t.id === id) || null;
    if (!tournament) {
        selectedTitle.textContent = "Select a tournament";
        statusMessage.textContent = "No tournament";
        playerList.innerHTML = "";
        subscribeBtn.classList.add("hidden");
        startBtn.classList.add("hidden");
        unsubscribeBtn?.classList.add("hidden");
        deleteBtn?.classList.add("hidden");
        return;
    }
    selectedTitle.textContent = `Players in "${tournament.name}"`;
    let creatorName = tournament.creator.username;
    try {
        const res = await fetch(`/user/${tournament.creator.id}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
        });
        const data = await res.json();
        if (res.ok && data) {
            creatorName = (data.username ?? "").trim();
        }
    }
    catch (e) { }
    statusMessage.textContent = tournament.started
        ? "🏁 This tournament is starting."
        : `Creator: ${creatorName}`;
    playerList.innerHTML = "";
    for (const player of tournament.players) {
        let playerName = player.username;
        try {
            const res = await fetch(`/user/${player.id}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            const data = await res.json();
            if (res.ok && data) {
                playerName = (data.username ?? "").trim();
            }
        }
        catch (e) { }
        const li = document.createElement("li");
        li.textContent = playerName;
        li.className =
            "border border-pink-500 p-2 rounded bg-[#1e1e3f] text-pink-100 text-center";
        playerList.appendChild(li);
    }
    const isCreator = userInfo && userInfo.id === tournament.creator.id;
    const playerIds = tournament.players.map((p) => p.id);
    if (!tournament.started && userInfo && !playerIds.includes(userInfo.id)) {
        subscribeBtn.classList.remove("hidden");
    }
    else {
        subscribeBtn.classList.add("hidden");
    }
    if (!tournament.started && userInfo && playerIds.includes(userInfo.id)) {
        unsubscribeBtn?.classList.remove("hidden");
    }
    else {
        unsubscribeBtn?.classList.add("hidden");
    }
    if (!tournament.started && isCreator) {
        startBtn.classList.remove("hidden");
        deleteBtn?.classList.remove("hidden");
    }
    else {
        startBtn.classList.add("hidden");
        deleteBtn?.classList.add("hidden");
    }
}
if (localStorage.getItem("userInfo")) {
    connectGameServer();
}
const player1Avatar = document.getElementById("player1Avatar");
const player2Avatar = document.getElementById("player2Avatar");
const player1Name = document.getElementById("player1Name");
const player2Name = document.getElementById("player2Name");
const scoreDisplay = document.getElementById("scoreDisplay");
const countDownDisplay = document.getElementById("countDownDisplay");
async function updateGameHeader(tournamentUpdateMessage) {
    const { player1, player2 } = tournamentUpdateMessage.data;
    player1Name.dataset.userid = String(player1.id);
    player2Name.dataset.userid = String(player2.id);
    player1Avatar.dataset.userid = String(player1.id);
    player2Avatar.dataset.userid = String(player2.id);
    let response = await fetch("/user/" + player1.id, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
    });
    const player1Data = await response.json();
    if (response.ok && player1Data) {
        const username1 = (player1Data.username ?? "").trim();
        player1Name.textContent = username1;
        player1Avatar.src = player1Data.avatar
            ? getAvatarUrl(player1Data.avatar, player1Data.updated_at)
            : "/assets/default-avatar.png";
    }
    response = await fetch("/user/" + player2.id, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
    });
    const player2Data = await response.json();
    if (response.ok && player2Data) {
        const username2 = (player2Data.username ?? "").trim();
        player2Name.textContent = username2;
        player2Avatar.src = player2Data.avatar
            ? getAvatarUrl(player2Data.avatar, player2Data.updated_at)
            : "/assets/default-avatar.png";
    }
    const player1Score = player1.score || 0;
    const player2Score = player2.score || 0;
    scoreDisplay.textContent = `${player1Score} - ${player2Score}`;
}
function updateCountDown(time) {
    countDownDisplay.textContent = time.toString();
    if (time <= 0) {
        countDownDisplay.textContent = "Go!";
    }
    scoreDisplay.classList.add("hidden");
    countDownDisplay.classList.remove("hidden");
}
function updateScore(player1Score, player2Score) {
    scoreDisplay.textContent = `${player1Score} - ${player2Score}`;
    countDownDisplay.classList.add("hidden");
    scoreDisplay.classList.remove("hidden");
}
export { connectGameServer, disconnectGameServer };
