const bcrypt = require("bcrypt");
const path = require("node:path");
const fs = require("node:fs/promises");
const mime = require("mime");

const chatClients = new Set();
async function routes(fastify, options) {
	fastify.get(
		"/user/:id",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			try {
                                const result = await fastify.sqlite.get(
                                        "SELECT users.id, users.username, users.email, users.created_at, users.updated_at, users.blocked_users, users.friends, users.avatar, users.full_name, users.google_sign_in, users.two_factor_auth FROM users WHERE id = ?",
                                        [request.params.id]
                                );
				if (!result) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				//online status
				const online = Array.from(chatClients).find(
					(client) => client.user.id.toString() === request.params.id
				);
				if (online) {
					result.online = true;
				} else {
					result.online = false;
				}
                               if (!request.user || +request.user.id !== +request.params.id) {
                                               delete result.email;
                                               delete result.full_name;
                                               // delete result.created_at;
                                               delete result.two_factor_auth;
                               }
				return result; 
		} catch (error) {
			reply.statusCode = 500;
			console.error("Error getting user: " + error.message);
			return { error: "Error getting user" };
		}
	}
	);

	fastify.get(
		"/currentuser",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			try {
                                const result = await fastify.sqlite.get(
                                        "SELECT users.id, users.username, users.email, users.created_at, users.updated_at, users.blocked_users, users.friends, users.avatar, users.full_name, users.google_sign_in, users.two_factor_auth FROM users WHERE id = ?",
                                        [request.user.id]
                                );
				if (!result) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				return result;
			} catch (error) {
				reply.statusCode = 500;
				console.error("Error getting user: " + error.message);
				return { error: "Error getting user" };
			}
		}
	);

	fastify.post("/user", async (request, reply) => {
		if (
			!request.body.username ||
			!request.body.email ||
			!request.body.password
		) {
			reply.statusCode = 400;
			return { error: "Missing required fields" };
		}
		// verify email format
		const atIndex = request.body.email.indexOf("@");
		const dotIndex = request.body.email.lastIndexOf(".");
		if (
			atIndex < 1 ||
			dotIndex < atIndex + 2 ||
			dotIndex + 2 >= request.body.email.length
		) {
			reply.statusCode = 400;
			return { error: "Invalid email format" };
		}
		//verify password length
		if (request.body.password.length < 4) {
			reply.statusCode = 400;
			return { error: "Password must be at least 4 characters long" };
		}
		try {
			const salt = await bcrypt.genSalt();
			const hash = await bcrypt.hash(request.body.password, salt);
			const result = await fastify.sqlite.run(
				"INSERT INTO users (username, email, password_hash, two_factor_auth) VALUES (?, ?, ?, ?)",
				[
					request.body.username,
					request.body.email,
					hash,
					request.body.twoFactorEnabled || 0,
				]
			);
			reply.statusCode = 201; // created
			return { id: result.lastID };
		} catch (error) {
			console.error("Error creating user: " + error.message);
			if (error.message.includes("UNIQUE constraint failed")) {
				reply.statusCode = 409;
				return { error: "User already exists" };
			}
			reply.statusCode = 500;
			return { error: "Error creating user" };
		}
	});

	// update user information (username, avatar, blocked_users, friends)
	// email cannot be updated at the moment
	// password cannot be updated with this api
	fastify.put(
		"/user",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			if (!request.body.username) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			const username = request.body.username;
			const avatar = request.body.avatar || null;
			const updated_at = new Date()
				.toISOString()
				.slice(0, 19)
				.replace("T", " ");
			let blocked_users = request.body.blocked_users || null;
			let friends = request.body.friends || null;
			let twoFactorEnabled = request.body.twoFactorEnabled || 0;
			if (
				blocked_users &&
				!(typeof blocked_users === "string" || blocked_users instanceof String)
			) {
				blocked_users = JSON.stringify(blocked_users);
			}
			if (
				friends &&
				!(typeof friends === "string" || friends instanceof String)
			) {
				friends = JSON.stringify(friends);
			}
			try {
				const result = await fastify.sqlite.run(
					"UPDATE users SET username = ?, avatar = ?, blocked_users = ?, friends = ?, updated_at = ?, two_factor_auth = ? WHERE id = ?",
					[
						username,
						avatar,
						blocked_users,
						friends,
						updated_at,
						twoFactorEnabled,
						request.user.id,
					]
				);
				if (result.changes === 0) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				reply.statusCode = 204; // no content
				return;
			} catch (error) {
				console.error("Error updating user: " + error.message);
				reply.statusCode = 500;
				return { error: "Error updating user" };
			}
		}
	);

// PUT /profile – update username, full_name and email (for *your own* profile only)
fastify.put(
        "/profile",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
                const { username = null, full_name = null, email = null } = request.body || {};
                if (!username && !full_name && !email) {
                        reply.statusCode = 400;
                        return { error: "Nothing to update" };
                }
                try {
                        const updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
                        const sql = `
                                UPDATE users
                                SET username = COALESCE(?,username),
                                        full_name = COALESCE(?,full_name),
                                        email = COALESCE(?,email),
                                        updated_at = ?
                                WHERE id = ?`;
                        const params = [username, full_name, email, updated_at, request.user.id];
                        const res = await fastify.sqlite.run(sql, params);
                        if (res.changes === 0) {
                                reply.statusCode = 404;
                                return { error: "User not found" };
                        }
						// update username for chat clients
						if (username) {
							for (const client of chatClients) {
								if (client.user.id === request.user.id) {
									client.user.username = username;
									break;
								}
							}
						}		
                        return { username, full_name, email };
                } catch (err) {
                        if (err && err.code && err.code.startsWith("SQLITE_CONSTRAINT")) {
                                reply.statusCode = 409;
                                let msg = "Conflict";
                                if (err.message && err.message.includes("users.username")) {
                                        msg = "Username already taken";
                                } else if (err.message && err.message.includes("users.email")) {
                                        msg = "Email already taken";
                                }
                                return { error: msg };
                        }
                        reply.statusCode = 500;
                        return { error: "DB error" };
                }

        }
);

// PUT /twofactor – toggle two factor authentication (for *your own* account)
fastify.put(
        "/twofactor",
        { onRequest: [fastify.authenticate] },
        async (request, reply) => {
                if (typeof request.body.enabled !== "boolean") {
                        reply.statusCode = 400;
                        return { error: "Missing required fields" };
                }
                try {
                        const account = await fastify.sqlite.get(
                                "SELECT google_sign_in FROM users WHERE id = ?",
                                [request.user.id]
                        );
                        if (account && account.google_sign_in) {
                                reply.statusCode = 403;
                                return { error: "Google sign-in users cannot toggle two factor auth" };
                        }
                        const updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
                        const res = await fastify.sqlite.run(
                                "UPDATE users SET two_factor_auth = ?, updated_at = ? WHERE id = ?",
                                [request.body.enabled ? 1 : 0, updated_at, request.user.id]
                        );
                        if (res.changes === 0) {
                                reply.statusCode = 404;
                                return { error: "User not found" };
                        }
                        return { two_factor_auth: !!request.body.enabled };
                } catch (err) {
                        reply.statusCode = 500;
                        console.error("Error updating two factor auth: " + err.message);
                        return { error: "Error updating two factor auth" };
                }
        }
);



        // add friend
        fastify.post(
                "/friend",
                {
                        onRequest: [fastify.authenticate],
                },
                async (request, reply) => {
                        if (!request.body.friendId) {
                                reply.statusCode = 400;
                                return { error: "Missing required fields" };
                        }
                        const friendId = Number(request.body.friendId);
                        if (Number.isNaN(friendId) || friendId === Number(request.user.id)) {
                                reply.statusCode = 400;
                                return { error: "Invalid friend id" };
                        }
                        try {
                                const target = await fastify.sqlite.get(
                                        "SELECT id FROM users WHERE id = ?",
                                        [friendId]
                                );
                                if (!target) {
                                        reply.statusCode = 404;
                                        return { error: "User not found" };
                                }
                                const result = await fastify.sqlite.get(
                                        "SELECT friends FROM users WHERE id = ?",
                                        [request.user.id]
                                );
                                if (!result) {
                                        reply.statusCode = 404;
                                        return { error: "User not found" };
                                }
                                let friends = result.friends ? JSON.parse(result.friends).map(Number) : [];
                                if (friends.includes(friendId)) {
                                        reply.statusCode = 409;
                                        return { error: "Friend already added", friends: friends };
                                }
                                friends.push(friendId);
                                const updated_at = new Date()
                                        .toISOString()
                                        .slice(0, 19)
                                        .replace("T", " ");
                                const updateResult = await fastify.sqlite.run(
                                        "UPDATE users SET friends = ?, updated_at = ? WHERE id = ?",
                                        [JSON.stringify(friends), updated_at, request.user.id]
                                );
                                if (updateResult.changes === 0) {
                                        reply.statusCode = 404;
                                        return { error: "User not found" };
                                }
                                return { friends: friends };
                        } catch (error) {
                                console.error("Error adding friend: " + error.message);
                                reply.statusCode = 500;
                                return { error: "Error adding friend" };
                        }
                }
        );

	// remove friend
	fastify.delete(
		"/friend",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			if (!request.body.friendId) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			try {
				const result = await fastify.sqlite.get(
					"SELECT friends FROM users WHERE id = ?",
					[request.user.id]
				);
				if (!result) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				let friends = result.friends ? JSON.parse(result.friends) : [];
				const friendId = request.body.friendId;
				if (!friends.includes(friendId)) {
					reply.statusCode = 409;
					return { error: "Friend not found", friends: friends };
				}
				friends = friends.filter((id) => id !== friendId);
				const updated_at = new Date()
					.toISOString()
					.slice(0, 19)
					.replace("T", " ");
				const updateResult = await fastify.sqlite.run(
					"UPDATE users SET friends = ?, updated_at = ? WHERE id = ?",
					[JSON.stringify(friends), updated_at, request.user.id]
				);
				if (updateResult.changes === 0) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				return { friends: friends };
			} catch (error) {
				console.error("Error removing friend: " + error.message);
				reply.statusCode = 500;
				return { error: "Error removing friend" };
			}
		}
	);

	// block user
	fastify.post(
		"/block",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			if (!request.body.userId) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			try {
				const result = await fastify.sqlite.get(
					"SELECT blocked_users FROM users WHERE id = ?",
					[request.user.id]
				);
				if (!result) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				let blocked_users = result.blocked_users
					? JSON.parse(result.blocked_users)
					: [];
				const userId = request.body.userId;
				if (blocked_users.includes(userId)) {
					reply.statusCode = 409;
					return {
						error: "User already blocked",
						blocked_users: blocked_users,
					};
				}
				blocked_users.push(userId);
				const updated_at = new Date()
					.toISOString()
					.slice(0, 19)
					.replace("T", " ");
				const updateResult = await fastify.sqlite.run(
					"UPDATE users SET blocked_users = ?, updated_at = ? WHERE id = ?",
					[JSON.stringify(blocked_users), updated_at, request.user.id]
				);
				if (updateResult.changes === 0) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				return { blocked_users: blocked_users };
			} catch (error) {
				console.error("Error blocking user: " + error.message);
				reply.statusCode = 500;
				return { error: "Error blocking user" };
			}
		}
	);

	// unblock user
	fastify.delete(
		"/block",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			if (!request.body.userId) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			try {
				const result = await fastify.sqlite.get(
					"SELECT blocked_users FROM users WHERE id = ?",
					[request.user.id]
				);
				if (!result) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				let blocked_users = result.blocked_users
					? JSON.parse(result.blocked_users)
					: [];
				const userId = request.body.userId;
				if (!blocked_users.includes(userId)) {
					reply.statusCode = 409;
					return {
						error: "User not blocked",
						blocked_users: blocked_users,
					};
				}
				blocked_users = blocked_users.filter((id) => id !== userId);
				const updated_at = new Date()
					.toISOString()
					.slice(0, 19)
					.replace("T", " ");
				const updateResult = await fastify.sqlite.run(
					"UPDATE users SET blocked_users = ?, updated_at = ? WHERE id = ?",
					[JSON.stringify(blocked_users), updated_at, request.user.id]
				);
				if (updateResult.changes === 0) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				return { blocked_users: blocked_users };
			} catch (error) {
				console.error("Error unblocking user: " + error.message);
				reply.statusCode = 500;
				return { error: "Error unblocking user" };
			}
		}
	);

	// search user by username
	fastify.get(
		"/search/:username",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			if (!request.params.username) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			try {
				const result = await fastify.sqlite.all(
					"SELECT id, username, email FROM users WHERE username LIKE ?",
					["%" + request.params.username + "%"]
				);
				if (!result) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				return result;
			} catch (error) {
				reply.statusCode = 500;
				console.error("Error searching user: " + error.message);
				return { error: "Error searching user" };
			}
		}
	);

	// avatar (picture upload)
	fastify.post(
		"/avatar",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			const options = { limits: { fileSize: 5 * 1024 * 1024 } };
			const data = await request.file(options); // this gets the first file only
			const buffer = await data.toBuffer();
			if (!data) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			// check if the file is an image
			const mimeTypes = ["image/jpeg", "image/png", "image/gif"];
			if (!mimeTypes.includes(data.mimetype)) {
				reply.statusCode = 400;
				return { error: "Invalid file type" };
			}
			try {
				const uploadDir = path.join(__dirname, "..", "frontend", "uploads");
				// const uploadDir = path.join(__dirname, "uploads");
				// check if the directory exists, if not create it
				try {
					await fs.stat(uploadDir);
				} catch {
					console.log("Creating upload directory: " + uploadDir);
					await fs.mkdir(uploadDir);
				}
				const filename = request.user.id + "." + data.mimetype.split("/")[1]; // create a filename based on user id
				const filePath = path.join(uploadDir, filename);
				await fs.writeFile(filePath, buffer);
				// update the user avatar in the database
				const updated_at = new Date()
					.toISOString()
					.slice(0, 19)
					.replace("T", " ");
				const result = await fastify.sqlite.run(
					"UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?",
					[filename, updated_at, request.user.id]
				);
				if (result.changes === 0) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				// return the filename to the client
				reply.statusCode = 201; // created
				return { filename: filename };
			} catch (error) {
				console.error("Error uploading avatar: " + error.message);
				reply.statusCode = 500;
				return { error: "Error uploading avatar" };
			}
		}
	);

	// get avatar picture
	fastify.get(
		"/avatar/:id",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			if (!request.params.id) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			try {
				const result = await fastify.sqlite.get(
					"SELECT avatar FROM users WHERE id = ?",
					[request.params.id]
				);
				if (!result) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				if (!result.avatar) {
					reply.statusCode = 404;
					return { error: "Avatar not found" };
				}
				const filePath = path.join(__dirname, "uploads", result.avatar);
				try {
					const file = await fs.readFile(filePath);
					const mimeType = mime.getType(filePath) || "application/octet-stream";
					reply.type(mimeType);
					return reply.send(file);
				} catch (error) {
					console.error("Error reading avatar file: " + error.message);
					reply.statusCode = 404;
					return { error: "Avatar not found" };
				}
			} catch (error) {
				console.error("Error getting avatar: " + error.message);
				reply.statusCode = 500;
				return { error: "Error getting avatar" };
			}
		}
	);

        /* ----------  GET /friends/:id  ---------- */
fastify.get("/friends/:id",
        { onRequest:[fastify.authenticate] },
        async (req, reply) => {
          const u = await fastify.sqlite.get(
                "SELECT friends FROM users WHERE id = ?",
                [req.params.id]
          );
          if (!u || !u.friends) return [];
          const ids = JSON.parse(u.friends)
                  .map(Number)
                  .filter((id) => id !== Number(req.params.id));
          if (!ids.length) return [];
          const placeholders = ids.map(() => "?").join(",");
          const query =
            "SELECT id, username FROM users WHERE id IN (" + placeholders + ")";
          const rows = await fastify.sqlite.all(query, ids);
          return rows;
        }
  );
  
  /* ----------  GET /history/:id  ---------- */
  fastify.get("/history/:id",
	{ onRequest:[fastify.authenticate] },
	async (req, reply) => {
	  return await fastify.sqlite.all(
		`SELECT timestamp, winnerId, loserId,
				scoreWinner, scoreLoser
		 FROM   game_history
		 WHERE  winnerId = ? OR loserId = ?
		 ORDER  BY timestamp DESC
		 LIMIT  20`,
		[req.params.id, req.params.id]
	  );
	}
  );
  
}

module.exports.routes = routes;
module.exports.chatClients = chatClients;