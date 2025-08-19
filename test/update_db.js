const sqlite3 = require("sqlite3");

const db = new sqlite3.Database("db.sqlite", (err) => {
	if (err) {
		console.error(err.message);
		process.exit(1);
	}
});

db.run(
	`UPDATE users SET friends = ? where id = 3`, [
        '["1"]'
    ],
	(err) => {
		if (err) {
			console.error(err.message);
		}
	}
);

db.close((err) => {
	if (err) {
		console.error(err.message);
	}
});


