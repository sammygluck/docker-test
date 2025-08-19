const { type } = require("os");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const broadcastToLiveChat = require("./chat.js").broadcastToLiveChat;

const fs = require("fs");
const secret = 'jwtsecret';//fs.readFileSync("/run/secrets/jwt_secret");
let clients = []; // all connected websocket clients
let game = null; // current game instance

function broadcast(obj) {
	const data = JSON.stringify(obj);
	clients.forEach((client) => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	});
}
module.exports.broadcast = broadcast; // export broadcast function

async function game_management(fastify) {
	let openTournaments = [];
	let waitingGames = []; // regular games based on invites
	let currentTournament = null; // current tournament in progress
	let tournamentCounter = 0; // counter for tournament ids

	fastify.post(
		"/invitetournament",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			if (!request.body.id) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			try {
				const result = await fastify.sqlite.get(
					"SELECT users.id, users.username, users.email FROM users WHERE id = ?",
					[request.body.id]
				);
				const inviterResult = await fastify.sqlite.get(
					"SELECT users.id, users.username, users.email FROM users WHERE id = ?",
					[request.user.id]
				);
				if (!result || !inviterResult) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				if (result.id === request.user.id) {
					reply.statusCode = 500;
					return { error: "Can't invite yourself" };
				}
				tournamentCounter++;
				const tournament = {
					id: tournamentCounter, // temporary id, replace with database id when saving to db
					name: "tournament " + tournamentCounter,
					creator: {
						id: inviterResult.id,
						username: inviterResult.username,
						email: inviterResult.email,
					},
					scoreToWin: 10,
					players: [
						{
							id: result.id,
							username: result.username,
							email: result.email,
						},
						{
							id: inviterResult.id,
							username: inviterResult.username,
							email: inviterResult.email,
						},
					],
					started: false,
				};
				openTournaments.push(tournament);
				broadcast({ type: "tournaments", data: openTournaments });
			} catch (error) {
				console.error("Error inviting user: " + error.message);
				reply.statusCode = 500;
				return { error: "Error inviting user" };
			}
		}
	);

	fastify.get("/game", { websocket: true }, (socket, req) => {
		// authenticate the user
		const token = req.query.token;
		if (!token) {
			socket.close(4000, "No token provided");
			console.log("Websocket game: No token provided");
			return;
		}
		jwt.verify(token, secret, (err, decoded) => {
			if (err) {
				socket.close(4001, "Invalid token");
				console.log("Websocket game: Invalid token");
				return;
			}
			socket.user = decoded;
			socket.user.type = "both"; // testing
		});
		if (!socket.user) {
			return;
		}
		clients.push(socket);
		socket.onmessage = async (message) => {
			const msg = JSON.parse(message.data);
			if (msg.type === "game") {
				if (game) {
					game.handleInput(msg.cmd, socket.user.id);
				}
			} else if (msg.type === "create_tournament") {
				let creator = {
						id: socket.user.id,
						username: socket.user.username,
						email: socket.user.email,
					};
				try{
					const result = await fastify.sqlite.get(
					"SELECT users.id, users.username, users.email FROM users WHERE id = ?",
					[socket.user.id]
					);
					if (result) {
						creator = {
							id: result.id,
							username: result.username,
							email: result.email,
						};
					}
				}finally{
					tournamentCounter++;
					const tournament = {
						id: tournamentCounter, // temporary id, replace with database id when saving to db
						name: msg.name,
						creator: creator,
						scoreToWin: 10,
						players: [],
						started: false,
					};
					openTournaments.push(tournament);
					broadcast({ type: "tournaments", data: openTournaments });
				}	
			} else if (msg.type === "subscribe") {
				const tournament = openTournaments.find((t) => t.id === msg.tournament);
				if (
					tournament &&
					!tournament.players.find((p) => p.id === socket.user.id)
				) {
					let player = {
						id: socket.user.id,
						username: socket.user.username,
						email: socket.user.email,
					}
					try{
						const result = await fastify.sqlite.get(
							"SELECT users.id, users.username, users.email FROM users WHERE id = ?",
							[socket.user.id]
						);
						if (result) {
							player = {
								id: result.id,
								username: result.username,
								email: result.email,
							};
						}
					}finally{
					tournament.players.push(player);
					}
				}
				broadcast({ type: "tournaments", data: openTournaments });
			} else if (msg.type === "unsubscribe") {
				const tournament = openTournaments.find((t) => t.id === msg.tournament);
				if (tournament) {
					tournament.players = tournament.players.filter(
						(p) => p.id !== socket.user.id
					);
				}
				broadcast({ type: "tournaments", data: openTournaments });
			} else if (msg.type === "delete_tournament") {
				const index = openTournaments.findIndex((t) => t.id === msg.tournament);
				if (
					index !== -1 &&
					openTournaments[index].creator.id === socket.user.id &&
					!openTournaments[index].started
				) {
					openTournaments.splice(index, 1);
				}
				broadcast({ type: "tournaments", data: openTournaments });
			} else if (msg.type === "start_tournament") {
				const tournament = openTournaments.find((t) => t.id === msg.tournament);
				if (
					tournament &&
					tournament.creator.id === socket.user.id &&
					!tournament.started &&
					tournament.players.length > 1
				) {
					tournament.started = true;
					tournament.playersCurrentRound = tournament.players.slice(); // copy array
					tournament.playersNextRound = [];
					tournament.matches = [];
					tournament.round = 1;
					tournament.startTime = Date.now();
					await startTournament();
					broadcast({ type: "tournaments", data: openTournaments });
				}
			} else if (msg.type === "list_tournaments") {
				socket.send(
					JSON.stringify({ type: "tournaments", data: openTournaments })
				);
				if (currentTournament && currentTournament.matches.length) {
					let currentMatch =
						currentTournament.matches[currentTournament.matches.length - 1];
					broadcast({ type: "nextMatch", data: currentMatch });
				}
			}
		};
		socket.onclose = () => {
			clients = clients.filter((w) => w !== socket);
			console.log("WebSocket closed:", socket.user.username);
		};
		socket.onerror = (event) => {
			console.error("WebSocket error observed:", event);
		};
		console.log("client connected to game");
	});

	async function startTournament() {
		if (currentTournament) {
			//game already in progress
			return;
		} else if (waitingGames.length > 0) {
			// take first one from invites list, and remove it from the list
			currentTournament = waitingGames.shift();
		} else if (openTournaments.length > 0) {
			let firstTimeStamp = 9999999999999;
			let index = -1;
			for (let i = 0; i < openTournaments.length; i++) {
				if (
					openTournaments[i].started &&
					openTournaments[i].startTime < firstTimeStamp
				) {
					firstTimeStamp = openTournaments[i].startTime;
					index = i;
				}
			}
			if (index >= 0) {
				const tournament = openTournaments[index];
				openTournaments.splice(index, 1); // remove 1 element at index
				// insert in database and update id here
				const result = await fastify.sqlite.run(
					"INSERT INTO tournament (name, creator, players, scoreToWin) VALUES (?, ?, ?, ?)",
					[
						tournament.name,
						tournament.creator.id,
						JSON.stringify(tournament.players.map((p) => p.id)),
						tournament.scoreToWin,
					]
				);
				if (result) {
					// update id with database id
					tournament.id = result.lastID;
				}
				currentTournament = tournament;
			}
		}
		if (currentTournament) {
			//currentTournament.started = true;
			//currentTournament.startTime = Date.now();
			broadcast({ type: "tournamentStarted", data: currentTournament });
			await tournamentNextMatch();
		}
	}

	async function endTournament() {
		if (!currentTournament) {
			return;
		} else if (!currentTournament.id) {
			// regular game, not a tournament
			console.log("Regular game finished");
			currentTournament = null;
		} else if (currentTournament.winner) {
			// database update
			await fastify.sqlite.run(
				"UPDATE tournament SET winnerId = ? WHERE tournamentId = ?",
				[currentTournament.winner.id, currentTournament.id]
			);
			// announce tournament winner
			broadcast({ type: "tournamentWinner", data: currentTournament.winner });
			broadcastToLiveChat(
				"Tournament winner: " + currentTournament.winner.username,
				null
			);
			console.log("Tournament finished");
			currentTournament = null;
		} else if (currentTournament.players.length === 0) {
			console.log("Empty tournament");
			currentTournament = null;
		} else {
			console.log("Tournament is not finished yet");
		}
		if (!currentTournament) {
			await startTournament();
		}
	}

	async function tournamentNextMatch() {
		if (!currentTournament) {
			return;
		}
		if (currentTournament.matches.length) {
			//finish current match
			let currentMatch =
				currentTournament.matches[currentTournament.matches.length - 1];
			currentMatch.round = currentTournament.round;
			if (currentMatch.player1.score > currentMatch.player2.score) {
				currentMatch.winner = currentMatch.player1;
				currentMatch.loser = currentMatch.player2;
				currentTournament.playersNextRound.push({ ...currentMatch.player1 });
			} else {
				currentMatch.winner = currentMatch.player2;
				currentMatch.loser = currentMatch.player1;
				currentTournament.playersNextRound.push({ ...currentMatch.player2 });
			}
			// insert into database
			await fastify.sqlite.run(
				"INSERT INTO game_history (winnerId, loserId, scoreWinner, scoreLoser, tournamentId) VALUES (?, ?, ?, ?, ?)",
				[
					currentMatch.winner.id,
					currentMatch.loser.id,
					currentMatch.winner.score,
					currentMatch.loser.score,
					currentTournament.id,
				]
			);
		}
		//next match
		if (
			currentTournament.playersCurrentRound.length +
				currentTournament.playersNextRound.length <
			2
		) {
			//tournament is finished
			if (currentTournament.playersCurrentRound.length)
				currentTournament.winner = currentTournament.playersCurrentRound[0];
			else currentTournament.winner = currentTournament.playersNextRound[0];
			await endTournament();
			return;
		}
		let numberOfPlayers = 0;
		let currentMatch = null;
		while (
			numberOfPlayers < 2 &&
			currentTournament.playersCurrentRound.length > 0
		) {
			let index = Math.floor(
				Math.random() * currentTournament.playersCurrentRound.length
			);
			if (!numberOfPlayers) {
				currentMatch = {
					player1: {
						...currentTournament.playersCurrentRound[index],
						score: 0,
					},
					player2: null,
				};
				currentTournament.matches.push(currentMatch);
			} else {
				currentMatch.player2 = {
					...currentTournament.playersCurrentRound[index],
					score: 0,
				};
				currentMatch.round = currentTournament.round;
			}
			//remove player from playersCurrentRound
			currentTournament.playersCurrentRound.splice(index, 1); // remove 1 element at index
			numberOfPlayers++;
		}
		if (
			numberOfPlayers < 2 &&
			currentTournament.playersCurrentRound.length === 0
		) {
			currentTournament.playersCurrentRound =
				currentTournament.playersNextRound;
			currentTournament.playersNextRound = [];
			currentTournament.round++;
		}
		while (
			numberOfPlayers < 2 &&
			currentTournament.playersCurrentRound.length > 0
		) {
			let index = Math.floor(
				Math.random() * currentTournament.playersCurrentRound.length
			);
			if (!numberOfPlayers) {
				currentMatch = {
					player1: {
						...currentTournament.playersCurrentRound[index],
						score: 0,
					},
					player2: null,
				};
				currentTournament.matches.push(currentMatch);
			} else {
				currentMatch.player2 = {
					...currentTournament.playersCurrentRound[index],
					score: 0,
				};
				currentMatch.round = currentTournament.round;
			}
			//remove player from playersCurrentRound
			currentTournament.playersCurrentRound.splice(index, 1); // remove 1 element at index
			numberOfPlayers++;
		}
		if (currentMatch) {
			startMatch(currentMatch, currentTournament.scoreToWin);
		}
	}

	function countDown(seconds) {
		return new Promise((resolve) => {
			let counter = seconds;

			const intervalId = setInterval(() => {
				broadcast({
					type: "countDown",
					time: counter,
				});
				counter--;

				if (counter < 0) {
					clearInterval(intervalId);
					resolve(); // Resolve the promise to continue the code
				}
			}, 1000);
		});
	}

	async function startMatch(currentMatch, scoreToWin) {
		broadcast({ type: "nextMatch", data: currentMatch });
		broadcastToLiveChat(
			"Next match: " +
				currentMatch.player1.username +
				" vs " +
				currentMatch.player2.username,
			null
		);
		game = new Game(currentMatch, scoreToWin);
		// coutndown to start match
		await countDown(5);
		await game.start();
		tournamentNextMatch(); // start next match after current match is finished
	}

	const Game = require("./pong_server.js").Game; // import game class, circular dependency gives problems when importing at the top

	//simulation
	/*	setInterval(() => {
		if (currentTournament) {
			// simulate game
			let currentMatch =
				currentTournament.matches[currentTournament.matches.length - 1];
			if (currentMatch && currentMatch.player1 && currentMatch.player2) {
				let random = Math.floor(Math.random() * 2);
				if (random === 0) {
					addPoint(currentMatch.player1.id);
				} else {
					addPoint(currentMatch.player2.id);
				}
			}
		}
	}, 2000); // every 2 seconds*/

	// examples
	/*currentTournament = {
		name: "Summer Cup",
		creator: { id: "1", name: "Alice" },
		id: "12345", // generate id when creating a game, replace by database id when saving to db
		scoreToWin: 10,
		type: "tournament", // tournament or invite
		started: true,
		startTime: 1747127100000, //epochtime
		players: [
			{ id: 1, username: "Alice" },
			 { id: 2, username: "Bob" },
			{ id: 3, username: "Carol" },
			{ id: 4, username: "Dave" },
			{ id: 5, username: "Alice" },
			{ id: 6, username: "Bob" },
			{ id: 7, username: "Carol" },
			{ id: 8, username: "Dave" },]
		playersCurrentRound: [
			{ id: 1, username: "Alice" },
			{ id: 2, username: "Bob" },
			{ id: 3, username: "Carol" },
			{ id: 4, username: "Dave" },
		],
		playersNextRound: [
			{ id: 5, username: "Alice" },
			{ id: 6, username: "Bob" },
			{ id: 7, username: "Carol" },
			{ id: 8, username: "Dave" },
		],
		matches: [
			{
				player1: { id: 1, username: "Alice", score: 10 },
				player2: { id: 2, username: "Bob", score: 6 },
				winner: { id: 1, username: "Alice", score: 10 },
				round: 1,
			},
			{
				player1: { id: 3, username: "Carol", score: 2 },
				player2: { id: 4, username: "Dave", score: 10 },
				winner: { id: 4, username: "Dave", score: 10 },
				round: 1,
			},
			{
				player1: { id: 5, username: "Alice" },
				player2: { id: 8, username: "Dave" },
				winner: null,
				round: 2,
			}, // not played yet
		],
		/*
	rounds: [
		{
			round: 1,
			matches: [
				{ player1: { id: 1, username: "Alice", score: 10 }, player2: { id: 2, username: "Bob", score: 6 }, winner: 1 },
				{ player1: { id: 3, username: "Carol", score: 2 }, player2: { id: 4, username: "Dave", score: 10 }, winner: 4 },
			],
		},
		{
			round: 2,
			matches: [
				{ player1: { id: 5, username: "Alice" }, player2:{ id: 8, username: "Dave" }, winner: null }, // not played yet
			],
		},
	],
	};*/
}

module.exports.game_management = game_management;
