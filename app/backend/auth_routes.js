const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");

const fs = require("fs");
const tempSecret = '2fasecret'; //fs.readFileSync("/run/secrets/2fa_secret"); // move to .env file

async function routes(fastify, options) {
	let twoFactorWaiting = []; // [{id: 1, code: 21687, timestamp: 1745488464000, token: xxxxx, attempts: 0}]
	function sendTwoFactorEmail(address, code) {
		// Create a transporter
		const transporter = nodemailer.createTransport({
			service: "gmail",
			auth: {
				user: "joerinijs19@gmail.com", // your Gmail address
				pass: fs.readFile("/run/secrets/mail_secret"), // use an App Password (not your Gmail password)
			},
		});

		// Set up email data
		const mailOptions = {
			from: "joerinijs19@gmail.com",
			to: address,
			subject: "ft_transcendence login code",
			text: "Use this code to login: " + code,
		};

		// Send the email
		transporter.sendMail(mailOptions, (error, info) => {
			if (error) {
				return console.log("Error sending email:", error);
			}
			console.log("Email sent:", info.response);
		});
	}

	fastify.post("/login", async (request, reply) => {
		if (!request.body.email || !request.body.password) {
			reply.statusCode = 400;
			return { error: "Missing required fields" };
		}
		try {
			const result = await fastify.sqlite.get(
				"SELECT id, email, password_hash, two_factor_auth, username, blocked_users, friends, avatar FROM users WHERE email = ?",
				[request.body.email]
			);
			if (!result) {
				reply.statusCode = 404;
				return { error: "User not found" };
			}
			const match = await bcrypt.compare(
				request.body.password,
				result.password_hash
			);
			if (!match) {
				reply.statusCode = 401;
				return { error: "Invalid password" };
			}
			if (result.two_factor_auth) {
				// delete curent user from twoFactorWaiting
				twoFactorWaiting = twoFactorWaiting.filter(
					(obj) => obj.id !== result.id
				);
				let code = Math.floor(100000 + Math.random() * 100000);
				let token = jwt.sign(
					{
						id: result.id,
					},
					tempSecret,
					{ expiresIn: "10m" }
				);
				twoFactorWaiting.push({
					id: result.id,
					code: code,
					token: token,
					timestamp: Date.now(),
					attempts: 0,
				});
				sendTwoFactorEmail(result.email, code);
				return {
					id: result.id,
					message: "Enter two factor code",
					twoFactorToken: token,
				};
			}
			// delete curent user from twoFactorWaiting
			twoFactorWaiting = twoFactorWaiting.filter((obj) => obj.id !== result.id);
			const token = fastify.jwt.sign(
				{
					id: result.id,
					email: request.body.email,
					username: result.username,
				},
				{ expiresIn: "8h" }
			);
			return {
				id: result.id,
				token: token,
				blocked_users: result.blocked_users,
				friends: result.friends,
				avatar: result.avatar,
				username: result.username,
			};
		} catch (error) {
			reply.statusCode = 500;
			console.error("Error logging in: " + error.message);
			return { error: "Error logging in" };
		}
	});

	fastify.post("/twofactor", async (request, reply) => {
		// filter out expired codes or codes with too may attempts from twoFactorWaiting
		twoFactorWaiting = twoFactorWaiting.filter(
			(obj) => Date.now() - obj.timestamp < 10 * 60 * 1000
		);
		twoFactorWaiting = twoFactorWaiting.filter((obj) => obj.attempts < 5);
		if (request.body.twoFactorCode && request.body.twoFactorToken) {
			let id = null;
			// verify the token
			try {
				const decoded = await jwt.verify(
					request.body.twoFactorToken,
					tempSecret
				);
				// Token is valid, proceed with decoded
				id = decoded.id;
			} catch (err) {
				// Token is invalid or some error occurred
				reply.statusCode = 401;
				return { error: "Invalid two factor token" };
			}
			// check if 2fa code is correct
			const found = twoFactorWaiting.find((obj) => obj.id === id);
			if (!found) {
				reply.statusCode = 401;
				return { error: "2 factor authentication failed" };
			}
			found.attempts++;
			if (
				found.code.toString() !== request.body.twoFactorCode ||
				found.token !== request.body.twoFactorToken
			) {
				reply.statusCode = 401;
				return { error: "2 factor authentication failed" };
			}
			// delete user from twoFactorWaiting
			twoFactorWaiting = twoFactorWaiting.filter((obj) => obj.id !== id);
			try {
				const result = await fastify.sqlite.get(
					"SELECT id, email, username, blocked_users, friends, avatar FROM users WHERE id = ?",
					[id]
				);
				if (!result) {
					reply.statusCode = 404;
					return { error: "User not found" };
				}
				const token = fastify.jwt.sign(
					{
						id: result.id,
						email: request.body.email,
						username: result.username,
					},
					{ expiresIn: "8h" }
				);
				return {
					id: result.id,
					token: token,
					blocked_users: result.blocked_users,
					friends: result.friends,
					avatar: result.avatar,
					username: result.username,
				};
			} catch (error) {
				reply.statusCode = 500;
				console.error("Error logging in: " + error.message);
				return { error: "Error logging in" };
			}
		} else {
			reply.statusCode = 400;
			return { error: "Missing required fields" };
		}
	});

	// google auth
	async function verifyGoogleToken(token) {
		const GOOGLE_PUBLIC_KEY_URL = "https://www.googleapis.com/oauth2/v1/certs";
		const GOOGLE_APP_CLIENT_ID =
			"244561649148-pbll9pc66oig5mcul4ivjp9igql4emef.apps.googleusercontent.com";
		try {
			// Fetch Google's public keys
			const response = await fetch(GOOGLE_PUBLIC_KEY_URL);
			const keys = await response.json();

			// Find the matching key for this token
			const decodedHeader = JSON.parse(
				Buffer.from(token.split(".")[0], "base64").toString()
			);

			const key = keys[decodedHeader.kid];
			if (!key) throw new Error("Invalid key ID");

			// Verify the token
			const verifiedToken = jwt.verify(token, key, { algorithms: ["RS256"] });
			if (verifiedToken.aud !== GOOGLE_APP_CLIENT_ID) {
				throw new Error("Invalid client ID");
			}
			if (
				verifiedToken.iss !== "accounts.google.com" &&
				verifiedToken.iss !== "https://accounts.google.com"
			) {
				throw new Error("Invalid issuer");
			}
			return verifiedToken;
		} catch (error) {
			console.error("Google token verification failed:", error);
			return null;
		}
	}

	fastify.post("/googleauth", async (request, reply) => {
		const credential = request.body.credential;
		if (!credential) {
			reply.statusCode = 400;
			return { error: "Missing required fields" };
		}
		const verifiedToken = await verifyGoogleToken(credential);
		if (!verifiedToken) {
			reply.statusCode = 401;
			return { error: "Invalid token" };
		}
		try {
			const result = await fastify.sqlite.get(
				"SELECT id, google_sign_in, username, blocked_users, friends, avatar FROM users WHERE email = ?",
				[verifiedToken.email]
			);
			if (result) {
				if (!result.google_sign_in) {
					reply.statusCode = 409;
					return { error: "User with this email already exists" };
				} else {
					const token = fastify.jwt.sign(
						{
							id: result.id,
							email: verifiedToken.email,
							username: result.username,
						},
						{ expiresIn: "8h" }
					);
					return {
						id: result.id,
						token: token,
						blocked_users: result.blocked_users,
						friends: result.friends,
						username: result.username,
						avatar: result.avatar,
					};
				}
			} else {
				// user does not exist -> create user in db
				let username = request.body.username || null;
				let avatar = verifiedToken.picture || null;
				if (!username) {
					return {
						message: "Enter username",
					};
				}
				try {
					const result = await fastify.sqlite.run(
						"INSERT INTO users (username, email, google_sign_in, avatar) VALUES (?, ?, ?, ?)",
						[username, verifiedToken.email, 1, null]
					);
					const token = fastify.jwt.sign(
						{
							id: result.lastID,
							email: verifiedToken.email,
							username: username,
						},
						{ expiresIn: "8h" }
					);
					reply.statusCode = 201; // created
					return {
						id: result.lastID,
						token: token,
						blocked_users: null,
						friends: null,
						username: username,
						avatar: avatar,
					};
				} catch (error) {
					console.error("Error creating user: " + error.message);
					if (error.message.includes("UNIQUE constraint failed")) {
						reply.statusCode = 409;
						return {
							error: "User already exists",
							message: "User already exists",
						};
					}
					reply.statusCode = 500;
					return { error: "Error creating user" };
				}
			}
		} catch (error) {
			console.error("Error google sign in: " + error.message);
			reply.statusCode = 500;
			return { error: "Error logging in" };
		}
	});
}

module.exports.routes = routes;
