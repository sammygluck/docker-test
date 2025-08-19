const broadcast = require("./game_management.js").broadcast;

// Coordinate system: X 0–200, Y 0–100  (percentage of canvas height).
const PADDLE_H = 14;
const PADDLE_S = 55; // speed of paddle movement
const SPEED_UP = 1.05; // +5 % ball speed each paddle hit
const MAX_SPEED = 120; // hard cap in %/s  – raise or delete if you want
const SPIN_FACTOR = 0.25; // tweak 0.15-0.35 to taste
const BASE_SPEED = 50; // 50 %/s baseline

enum userInput {
	unknown = 0,
	moveUpStart = 1,
	moveUpEnd = 2,
	moveDownStart = 3,
	moveDownEnd = 4,
}

enum paddleSide {
	unknown = 0,
	left = 1,
	right = 2,
}

interface player {
	id: number;
	username: string;
	score: number;
}

interface matchData {
	player1: player;
	player2: player;
	winner: player | null;
	round: number;
}

class Paddle {
	x: number;
	y: number;
	width: number;
	height: number;
	speed: number;
	dy: number;
	nextDy: number; // used to store the speed based on the user input

	constructor(
		x: number,
		y: number,
		width: number,
		height: number,
		speed: number
	) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
		this.speed = speed;
		this.dy = 0;
		this.nextDy = 0;
	}

	move(duration: number): void {
		this.y += (this.dy * duration) / 1000;
		if (this.y < 0) {
			this.y = 0;
		} else if (this.y + this.height > 100) {
			this.y = 100 - this.height;
		}
		this.dy = this.nextDy; // update dy to nextDy after moving
	}

	handleInput(command: userInput): void {
		switch (command) {
			case userInput.moveUpStart:
				this.nextDy = -this.speed;
				break;
			case userInput.moveUpEnd:
				if (this.nextDy < 0) this.nextDy = 0;
				break;
			case userInput.moveDownEnd:
				if (this.nextDy > 0) this.nextDy = 0;
				break;
			case userInput.moveDownStart:
				this.nextDy = this.speed;
				break;
		}
	}
	getData(): { y: number, speed: number } {
		return { y: this.y, speed: this.dy };
	}
}

class Ball {
	x: number;
	y: number;
	radius: number;
	speedX: number;
	speedY: number;

	constructor(x: number, y: number, radius: number, speed: number) {
		this.x = x;
		this.y = y;
		this.radius = radius;
		this.speedX = speed; // positive → right, negative → left
		this.speedY = speed; // positive → down,  negative → up
	}

	move(duration: number): Boolean {
		this.x += (this.speedX * duration) / 1000;
		this.y += (this.speedY * duration) / 1000;

		if (
			(this.y - this.radius <= 0 && this.speedY < 0) ||
			(this.y + this.radius >= 100 && this.speedY > 0)
		) {
			this.speedY *= -1;
			return true;
		}
		return false;
	}

	checkCollision(paddle: Paddle): Boolean {
		const closestX = Math.max(
			paddle.x,
			Math.min(this.x, paddle.x + paddle.width)
		);
		const closestY = Math.max(
			paddle.y,
			Math.min(this.y, paddle.y + paddle.height)
		);
		const dx = this.x - closestX;
		const dy = this.y - closestY;

		/* no hit if centre–to–closest distance longer than radius */
		const dist2 = dx * dx + dy * dy;
		if (dist2 > this.radius * this.radius) 
			return false;

		/* push out so ball never sinks into the paddle */
		const dist = Math.sqrt(dist2) || 1e-6;
		const overlap = this.radius - dist;
		const nx = dx / dist;
		const ny = dy / dist;
		this.x += nx * overlap;
		this.y += ny * overlap;

		/* compute new velocity based on impact point */
		let speed = Math.hypot(this.speedX, this.speedY) * SPEED_UP;
		if (speed > MAX_SPEED) speed = MAX_SPEED;

		const relY = -(
			(this.y - (paddle.y + paddle.height / 2)) /
			(paddle.height / 2)
		);
		const MAX = (60 * Math.PI) / 180; // 60°, easier to track
		const angle = Math.sin((relY * Math.PI) / 2) * MAX;
		const dir = paddle.x < 100 ? 1 : -1; // left paddle sends right, vice-versa

		this.speedX = speed * Math.cos(angle) * dir;
		this.speedY = speed * -Math.sin(angle); // minus because canvas Y grows downward

		this.speedY += paddle.dy * SPIN_FACTOR; // add paddle motion
		const mag = Math.hypot(this.speedX, this.speedY); // keep overall speed constant
		this.speedX *= speed / mag;
		this.speedY *= speed / mag;
		return true;
	}

	getData(): { x: number; y: number, speedX: number, speedY: number } {
		return { x: this.x, y: this.y, speedX: this.speedX, speedY: this.speedY };
	}
}

class Game {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	paddleLeft: Paddle;
	paddleRight: Paddle;
	ball: Ball;
	prevTime: number;
	setIntervalId: NodeJS.Timeout | null;
	matchData: matchData;
	scoreToWin: number;
	isRunning: boolean;
	isPaused: boolean;
	sendAtNextTick: boolean;
	resolver: (value?: void) => void; // start promise will resolve when game ends

	constructor(matchData: matchData, scoreToWin: number = 10) {
		this.paddleLeft = new Paddle(1, 45, 2, PADDLE_H, PADDLE_S);
		this.paddleRight = new Paddle(197, 45, 2, PADDLE_H, PADDLE_S);
		this.ball = new Ball(100, 50, 1, 30);
		this.prevTime = 0;
		this.setIntervalId = null;
		this.matchData = matchData;
		this.scoreToWin = scoreToWin;
		this.isRunning = false;
		this.isPaused = false;
		this.sendAtNextTick = false;
	}

	start(): Promise<void> {
		// start the game loop
		this.setIntervalId = setInterval(() => this.loop(), 1000 / 60);
		this.prevTime = performance.now();
		this.isRunning = true;
		this.send(); // send initial state
		return new Promise((resolve) => {
			// start promise will resolve when game ends
			this.resolver = resolve;
		});
	}

	pause(): void {
		// stop the game loop
		if (this.setIntervalId !== null) {
			clearInterval(this.setIntervalId);
			this.setIntervalId = null;
			this.isPaused = true;
		}
	}

	end(): void {
		// stop the game loop
		this.isRunning = false;
		this.isPaused = false;
		this.send(); // send final state
		if (this.setIntervalId !== null) {
			clearInterval(this.setIntervalId);
			this.setIntervalId = null;
		}
		// resolve the start promise
		if (this.resolver) {
			this.resolver(); // return matchdata?
			this.resolver = undefined;
		}
	}

	handleInput(cmd: userInput, userid: number): void {
		if (this.matchData.player1.id === userid) {
			this.paddleLeft.handleInput(cmd);
			this.sendAtNextTick = true; // send at next loop iteration
		} else if (this.matchData.player2.id === userid) {
			this.paddleRight.handleInput(cmd);
			this.sendAtNextTick = true; // send at next loop iteration
		}
	}

	private addPoint(paddle: paddleSide): void {
		if (paddle === paddleSide.left) {
			this.matchData.player1.score += 1;
		} else if (paddle === paddleSide.right) {
			this.matchData.player2.score += 1;
		}
		broadcast({ type: "tournamentUpdate", data: this.matchData });
		if (
			this.matchData.player1.score >= this.scoreToWin ||
			this.matchData.player2.score >= this.scoreToWin
		) {
			this.end();
		}
	}

	private loop(): void {
		const timestamp = performance.now();
		const dt = timestamp - this.prevTime;
		if (this.isRunning && !this.isPaused && dt < 1000) this.update(dt);
		this.prevTime = timestamp;
		// send info over websocket
		if (this.sendAtNextTick) {
			this.send();
		}
	}

	private send(): void {
		const data = {
			paddleLeft: this.paddleLeft.getData(),
			paddleRight: this.paddleRight.getData(),
			ball: this.ball.getData(),
			isRunning: this.isRunning,
			time: performance.now(),
		};
		broadcast({ type: "game", data: data });
		this.sendAtNextTick = false; // reset flag
	}

	private update(duration: number): void {
		this.paddleLeft.move(duration);
		this.paddleRight.move(duration);
		if(this.ball.move(duration)){
			this.send();
		}
		if (this.ball.checkCollision(this.paddleLeft) || this.ball.checkCollision(this.paddleRight)){
			this.send();
		};

		if (this.ball.x < this.paddleLeft.x - this.ball.radius) {
			this.addPoint(paddleSide.right);
			this.resetBall();
		} else if (
			this.ball.x >
			this.paddleRight.x + this.paddleRight.width + this.ball.radius
		) {
			this.addPoint(paddleSide.left);
			this.resetBall();
		}
	}

	private resetBall(): void {
		this.ball.x = 100;
		this.ball.y = 50;
		// serve **toward** the player who just lost the point
		const dir = this.ball.speedX < 0 ? 1 : -1; // pre-reset sign tells us who lost
		this.ball.speedX = BASE_SPEED * dir;
		this.ball.speedY = 0; // start flat; first paddle sets angle
		this.send();
	}
}

module.exports = {
	Game: Game,
};
