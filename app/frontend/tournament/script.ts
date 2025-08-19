import { logout } from "../login/script.js";
import { game, GameMessage } from "../game_websocket/pong_websocket.js";
import { getAvatarUrl } from "../profile.js";

interface Player {
	id: number;
	username: string;
	score?: number;
}

interface Tournament {
	id: number;
	name: string;
	creator: Player;
	players: Player[];
	started: boolean;
}

interface UserInfo {
        id: number;
        token: string;
        username: string;
        avatar: string | null;
        updated_at?: string | null;
}

type ClientMessage =
        | { type: "list_tournaments" }
        | { type: "create_tournament"; name: string }
        | { type: "subscribe"; tournament: number }
        | { type: "unsubscribe"; tournament: number }
        | { type: "delete_tournament"; tournament: number }
        | { type: "start_tournament"; tournament: number };

interface TournamentsMessage {
	type: "tournaments";
	data: Tournament[];
}

interface matchData {
	player1: Player;
	player2: Player;
	winner?: Player | null;
	round: number;
}

interface tournamentUpdateMessage {
	type: "nextMatch" | "tournamentUpdate";
	data: matchData;
}

interface countDownMessage {
	type: "countDown";
	time: number;
}

type ServerMessage =
	| TournamentsMessage
	| GameMessage
	| tournamentUpdateMessage
	| countDownMessage;

// Element references
const tournamentList = document.getElementById(
	"tournamentList"
) as HTMLUListElement;
const createTournamentForm = document.getElementById(
	"createTournamentForm"
) as HTMLFormElement;
const tournamentNameInput = document.getElementById(
	"tournamentName"
) as HTMLInputElement;

// Elements inside the tournament modal will be resolved when opened
let selectedTitle: HTMLElement | null = null;
let playerList: HTMLUListElement | null = null;
let subscribeBtn: HTMLButtonElement | null = null;
let unsubscribeBtn: HTMLButtonElement | null = null;
let startBtn: HTMLButtonElement | null = null;
let deleteBtn: HTMLButtonElement | null = null;
let statusMessage: HTMLElement | null = null;
let tournamentOverlay: HTMLElement | null = null;

// State
let tournaments: Tournament[] = [];
let selectedTournament: number | null = null;
let userInfo: UserInfo | null = null;
let ws: WebSocket | null = null;

function connectGameServer(): void {
	// This function is called to connect to the game server
	// Load user info
	const userInfoStr = localStorage.getItem("userInfo");
	if (!userInfoStr) {
		return;
	}
	userInfo = JSON.parse(userInfoStr!);
	if (!userInfo || !userInfo.token) {
		return;
	}

	// WebSocket setup
	if (ws) {
		console.warn("Already connected to the game server");
		return;
	}
	ws = new WebSocket(
		`wss://${window.location.host}/game?token=${userInfo.token}`
	);

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
		/*console.log("Reconnecting in 5 seconds...");
		setTimeout(() => {
			connectGameServer();
		}, 5000);*/
	});

	ws.addEventListener("open", () => {
		const msg: ClientMessage = { type: "list_tournaments" };
		ws.send(JSON.stringify(msg));
		game.updateWebSocket(ws);
	});

	ws.addEventListener("message", (event) => {
		const msg: ServerMessage = JSON.parse(event.data);

		if (msg.type === "tournaments") {
			tournaments = msg.data;
			renderTournamentList();
			if (selectedTournament !== null) {
				selectTournament(selectedTournament);
			}
		} else if (msg.type === "game") {
			// Handle game updates
			game.receiveMessage(msg as GameMessage);
		} else if (msg.type === "nextMatch") {
			// Handle next match updates
			const tournamentUpdate = msg as tournamentUpdateMessage;
			updateGameHeader(tournamentUpdate);
		} else if (msg.type === "tournamentUpdate") {
			updateScore(msg.data.player1.score, msg.data.player2.score);
		} else if (msg.type === "countDown") {
			updateCountDown(msg.time);
		}
	});

	// Form: create tournament
	createTournamentForm.addEventListener("submit", (e) => {
		e.preventDefault();
		const name = tournamentNameInput.value.trim();
		if (!name) return;

		const msg: ClientMessage = { type: "create_tournament", name };
		ws.send(JSON.stringify(msg));
		tournamentNameInput.value = "";
	});

        // Buttons will be wired when the tournament modal is opened
        console.log("Connected to the game server");
}

function disconnectGameServer(): void {
	if (ws) {
		ws.close();
		ws = null;
		console.log("Disconnected from the game server");
	}
	selectedTournament = null;
	tournaments = [];
        renderTournamentList();
        // Ensure modal is closed and listeners removed
        closeTournamentModal();
}

function startBtnClick(): void {
	if (selectedTournament === null) return;
	const msg: ClientMessage = {
		type: "start_tournament",
		tournament: selectedTournament,
	};
	ws.send(JSON.stringify(msg));
}

function subscribeBtnClick(): void {
        if (selectedTournament === null) return;
        const msg: ClientMessage = {
                type: "subscribe",
                tournament: selectedTournament,
        };
        ws.send(JSON.stringify(msg));
}

function unsubscribeBtnClick(): void {
        if (selectedTournament === null) return;
        const msg: ClientMessage = {
                type: "unsubscribe",
                tournament: selectedTournament,
        };
        ws.send(JSON.stringify(msg));
}

function deleteBtnClick(): void {
        if (selectedTournament === null) return;
        const msg: ClientMessage = {
                type: "delete_tournament",
                tournament: selectedTournament,
        };
        ws.send(JSON.stringify(msg));
}

// Render list of tournaments
async function renderTournamentList(): Promise<void> {
        tournamentList.innerHTML = "";
        for (const t of tournaments) {
                const li = document.createElement("li");
                const subscribed =
                        userInfo && t.players.some((p) => p.id === userInfo!.id);
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
                } catch (e) {}

                // Clear li contents
				li.replaceChildren();

				// First line: title + optional checkmark
				const titleDiv = document.createElement("div");
				titleDiv.className = "font-semibold";

				const nameSpan = document.createElement("span");
				nameSpan.textContent = t.name; // SAFE — no HTML parsing
				titleDiv.appendChild(nameSpan);

				if (subscribed) {
				const checkSpan = document.createElement("span");
				checkSpan.className = "ml-1 text-pink-300/75";
				checkSpan.textContent = "✓";
				titleDiv.appendChild(checkSpan);
				}
				li.appendChild(titleDiv);

				// Second line: creator
				const creatorDiv = document.createElement("div");
				creatorDiv.className = "text-sm text-pink-300";
				creatorDiv.textContent = `Creator: ${creatorName}`;
				li.appendChild(creatorDiv);

				// Third line: player count
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
                        } else {
                                playBtn.className =
                                        "text-green-500 hover:text-green-700";
                        }
                        playBtn.addEventListener("click", (e) => {
                                e.stopPropagation();
                                if (playBtn.disabled) return;
                                const msg: ClientMessage = {
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
                                const msg: ClientMessage = {
                                        type: "unsubscribe",
                                        tournament: t.id,
                                };
                                ws?.send(JSON.stringify(msg));
                        });
                } else {
                        subBtn.textContent = "➕";
                        subBtn.addEventListener("click", (e) => {
                                e.stopPropagation();
                                const msg: ClientMessage = {
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
                                const msg: ClientMessage = {
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

// Open the modal displaying tournament details
function openTournamentModal(id: number): void {
        const tpl = document.getElementById("tournament-tpl") as HTMLTemplateElement | null;
        if (!tpl) return;

        // Remove any existing overlay
        closeTournamentModal();

        const frag = tpl.content.cloneNode(true) as DocumentFragment;
        tournamentOverlay = frag.firstElementChild as HTMLElement;
        document.body.appendChild(tournamentOverlay);

        selectedTitle = tournamentOverlay.querySelector("#selectedTournamentTitle");
        statusMessage = tournamentOverlay.querySelector("#statusMessage");
        playerList = tournamentOverlay.querySelector("#playerList");
        subscribeBtn = tournamentOverlay.querySelector("#subscribeBtn");
        unsubscribeBtn = tournamentOverlay.querySelector("#unsubscribeBtn");
        startBtn = tournamentOverlay.querySelector("#startBtn");
        deleteBtn = tournamentOverlay.querySelector("#deleteBtn");

        tournamentOverlay.querySelector<HTMLButtonElement>(".close-btn")?.addEventListener("click", closeTournamentModal);

        subscribeBtn?.addEventListener("click", subscribeBtnClick);
        unsubscribeBtn?.addEventListener("click", unsubscribeBtnClick);
        startBtn?.addEventListener("click", startBtnClick);
        deleteBtn?.addEventListener("click", deleteBtnClick);

        selectTournament(id);
}

function closeTournamentModal(): void {
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

// Select a tournament
async function selectTournament(id: number): Promise<void> {
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
        } catch (e) {}

        statusMessage.textContent = tournament.started
                ? "🏁 This tournament is starting."
                : `Creator: ${creatorName}`;

	// Render players
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
                } catch (e) {}

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
        } else {
                subscribeBtn.classList.add("hidden");
        }

        if (!tournament.started && userInfo && playerIds.includes(userInfo.id)) {
                unsubscribeBtn?.classList.remove("hidden");
        } else {
                unsubscribeBtn?.classList.add("hidden");
        }

        if (!tournament.started && isCreator) {
                startBtn.classList.remove("hidden");
                deleteBtn?.classList.remove("hidden");
        } else {
                startBtn.classList.add("hidden");
                deleteBtn?.classList.add("hidden");
        }
}

// if logged in on page load, connect to the game server
if (localStorage.getItem("userInfo")) {
	connectGameServer();
}

// Game header
const player1Avatar = document.getElementById(
	"player1Avatar"
) as HTMLImageElement;
const player2Avatar = document.getElementById(
	"player2Avatar"
) as HTMLImageElement;
const player1Name = document.getElementById("player1Name") as HTMLElement;
const player2Name = document.getElementById("player2Name") as HTMLElement;
const scoreDisplay = document.getElementById("scoreDisplay") as HTMLElement;
const countDownDisplay = document.getElementById(
	"countDownDisplay"
) as HTMLElement;

// Update game header with player info
async function updateGameHeader(
        tournamentUpdateMessage: tournamentUpdateMessage
): Promise<void> {
        const { player1, player2 } = tournamentUpdateMessage.data;

        player1Name.dataset.userid = String(player1.id);
        player2Name.dataset.userid = String(player2.id);
        player1Avatar.dataset.userid = String(player1.id);
        player2Avatar.dataset.userid = String(player2.id);

	//player1Name.textContent = player1.username;
	//player2Name.textContent = player2.username;

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
function updateCountDown(time: number): void {
	countDownDisplay.textContent = time.toString();
	if (time <= 0) {
		countDownDisplay.textContent = "Go!";
	}
	scoreDisplay.classList.add("hidden");
	countDownDisplay.classList.remove("hidden");
}
function updateScore(player1Score: number, player2Score: number): void {
	scoreDisplay.textContent = `${player1Score} - ${player2Score}`;
	countDownDisplay.classList.add("hidden");
	scoreDisplay.classList.remove("hidden");
}

export { connectGameServer, disconnectGameServer };