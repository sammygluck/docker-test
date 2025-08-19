const sqlite3 = require("sqlite3");

const db = new sqlite3.Database("../db/db.sqlite", (err) => {
	if (err) {
		console.error(err.message);
		process.exit(1);
	}
});

//friends is a json array, for example  '[2, 3, 5, 7]'

db.run(
        `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT DEFAULT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
	google_sign_in BOOLEAN DEFAULT FALSE,
	two_factor_auth	BOOLEAN DEFAULT FALSE,
	blocked_users TEXT DEFAULT NULL,
	friends TEXT DEFAULT NULL,
        avatar TEXT DEFAULT NULL
        )`,
        (err) => {
                if (err) {
                        console.error(err.message);
                }
        }
);

db.run(`
	CREATE TABLE IF NOT EXISTS game_history (
    gameId INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    winnerId INTEGER NOT NULL,
    loserId INTEGER NOT NULL,
    scoreWinner INTEGER NOT NULL,
    scoreLoser INTEGER NOT NULL,
    tournamentId INTEGER,
    FOREIGN KEY (winnerId) REFERENCES users(id),
    FOREIGN KEY (loserId) REFERENCES users(id),
    FOREIGN KEY (tournamentId) REFERENCES tournament(tournamentId)
)`);

//players is a json array, for example  '[2, 3, 5, 7]'

db.run(`
	CREATE TABLE IF NOT EXISTS tournament (
    tournamentId INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    creator INTEGER NOT NULL,
    players TEXT NOT NULL, -- JSON string representing an array of userIds
    scoreToWin INTEGER NOT NULL,
    winnerId INTEGER,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator) REFERENCES users(id),
    FOREIGN KEY (winnerId) REFERENCES users(id)
);`);

db.close((err) => {
        if (err) {
                console.error(err.message);
        }
});