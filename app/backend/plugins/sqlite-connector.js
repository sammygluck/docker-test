const fp = require("fastify-plugin");
const sqlite3 = require("sqlite3").verbose(); // remove verbose for production
const sqlite = require("sqlite"); // Sqlite is a wrapper around sqlite3 to add async/await support

async function sqliteConnector(fastify, options) {
	const db = await sqlite.open({
		filename: "../db/db.sqlite", // relative path -> current folder
		driver: sqlite3.cached.Database,
	});

	if (!fastify.sqlite) {
		fastify.decorate("sqlite", db);
	}
	fastify.addHook("onClose", async (fastify) => {
		await db.close();
	});
}

module.exports = fp(sqliteConnector);
