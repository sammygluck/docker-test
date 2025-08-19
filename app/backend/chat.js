const chatClients = require("./user_routes").chatClients; // import the chatClients set from user_routes.js
const jwt = require("jsonwebtoken");
const WebSocket = require("ws");

const fs = require("fs");
const secret = 'jwtsecret';//fs.readFileSync("/run/secrets/jwt_secret"); // move to .env file

async function chat(fastify) {
	fastify.get("/chat", { websocket: true }, async (socket, req) => {
		// authenticate the user
		const token = req.query.token;
		if (!token) {
			socket.close(4000, "No token provided");
			return;
		}
		jwt.verify(token, secret, (err, decoded) => {
			if (err) {
				socket.close(4001, "Invalid token");
				return;
			}
			socket.user = decoded;
		});
		if (!socket.user) return;
		try{
			const result = await fastify.sqlite.get(
				"SELECT users.id, users.username FROM users WHERE id = ?",
				[socket.user.id]
				);
			if (result) {
				socket.user.username = result.username;
			}
		}finally{
			chatClients.add(socket);
			console.log("Client connected to chat");
		}
		socket.on("message", async (wsmessage) => {
			try {
				const parsedMessage = JSON.parse(wsmessage);
				const destId = parsedMessage.destId;
				const content = parsedMessage.message;

				if (destId === 0) {
					// Handle live chat message
					broadcastToLiveChat(content, socket);
				} else {
					// Handle direct message
					const destinationUser = await findUserById(destId);
					if (!destinationUser) {
						socket.send(
							JSON.stringify({
								type: "error",
								message: "[Server]: User is offline.",
							})
						);
						return;
					}
					sendDirectMessage(destinationUser, content, socket);
				}
			} catch (e) {
				socket.send(
					JSON.stringify({
						type: "error",
						message: "[Server]: Invalid message format.",
					})
				);
			}
		});
		socket.on("close", () => {
			chatClients.delete(socket);
			console.log("Client disconnected from chat");
		});
	});
}

// Helper functions
function broadcastToLiveChat(content, socket) {
	if (!socket) {
		for (const client of chatClients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(
					JSON.stringify({
						message: "[System]: " + content.toString(),
						type: "public",
					})
				);
			}
		}
	} else {
		for (const client of chatClients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(
					JSON.stringify({
						sendId: socket.user.id,
						message: "[" + socket.user.username + "]: " + content.toString(),
						type: "public",
					})
				);
			}
		}
	}
	return null;
}

async function findUserById(userId) {
	for (const client of chatClients) {
		if (
			parseInt(client.user.id) === parseInt(userId) &&
			client.readyState === WebSocket.OPEN
		) {
			return client;
		}
	}
}

function sendDirectMessage(client, content, socket) {
	client.send(
		JSON.stringify({
			sendId: socket.user.id,
			message: "[" + socket.user.username + "]: " + content.toString(),
			type: "private",
		})
	);
	socket.send(
		JSON.stringify({
			sendId: client.user.id,
			message: "[" + socket.user.username + "]: " + content.toString(),
			type: "private",
		})
	);
}

module.exports.broadcastToLiveChat = broadcastToLiveChat;
module.exports.chat = chat;
