async function routes(fastify, options) {
	//todo: route for match history based on userId
	fastify.get(
		"/matchhistory/:userid",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			if (!request.params.userid) {
				reply.statusCode = 400;
				return { error: "Missing required fields" };
			}
			let userId = parseInt(request.params.userid)
			try {
				const result = await fastify.sqlite.all(
					`SELECT
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
					LIMIT 2000;`,
					[userId, userId]
				);
				if (!result) {
					reply.statusCode = 404;
					return { error: "history not found" };
				}
				return result;
			}
			catch (error) {
				console.error("Error getting match history: " + error.message);
				reply.statusCode = 500;
				return { error: "Error getting match history" };
			}
		}
	);
}

module.exports.routes = routes;
