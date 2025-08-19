const sqlite = require("sqlite"); // Sqlite is a wrapper around sqlite3 to add async/await support
const sqlite3 = require("sqlite3").verbose(); // remove verbose for production

async function executeQuery() {
	const db = await sqlite.open({
		filename: "db.sqlite", // relative path -> current folder
		driver: sqlite3.cached.Database,
	});

	let result = await db.all(`SELECT
    gh.gameId,
    gh.timestamp,
	gh.winnerId,
	gh.loserId,
	gh.tournamentId,
    uw.username   AS winner_username,
    ul.username   AS loser_username,
    gh.scoreWinner,
    gh.scoreLoser,
    t.name        AS tournament_name
	FROM
    game_history AS gh
    JOIN users AS uw
      ON gh.winnerId = uw.id
    JOIN users AS ul
      ON gh.loserId  = ul.id
    LEFT JOIN tournament AS t
      ON gh.tournamentId = t.tournamentId
	WHERE
    gh.winnerId = ? OR gh.loserId = ?
	ORDER BY
    gh.timestamp DESC
	LIMIT 2000;`, [3, 3]);

	console.log(result);

	db.close((err) => {
		if (err) {
			console.error(err.message);
		}
	});
}

executeQuery();
