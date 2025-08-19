const PADDLE_H = 14;
const PADDLE_S = 55;
const SPEED_UP = 1.05;
const MAX_SPEED = 120;
const SPIN_FACTOR = 0.25;
const BASE_SPEED = 50;
const SMOOTHING_FACTOR = 0.1;
const CLIENT_DELAY = 50;
const SFX = {
    wall: document.getElementById("sndWall"),
    paddle: document.getElementById("sndPaddle"),
    score: document.getElementById("sndScore"),
    countdown: document.getElementById("sndCountdown"),
};
var userInput;
(function (userInput) {
    userInput[userInput["unknown"] = 0] = "unknown";
    userInput[userInput["moveUpStart"] = 1] = "moveUpStart";
    userInput[userInput["moveUpEnd"] = 2] = "moveUpEnd";
    userInput[userInput["moveDownStart"] = 3] = "moveDownStart";
    userInput[userInput["moveDownEnd"] = 4] = "moveDownEnd";
})(userInput || (userInput = {}));
var paddleSide;
(function (paddleSide) {
    paddleSide[paddleSide["unknown"] = 0] = "unknown";
    paddleSide[paddleSide["left"] = 1] = "left";
    paddleSide[paddleSide["right"] = 2] = "right";
})(paddleSide || (paddleSide = {}));
class Paddle {
    x;
    y;
    targetY;
    width;
    height;
    speed;
    dy;
    constructor(x, y, width, height, speed) {
        this.x = x;
        this.y = y;
        this.targetY = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.dy = 0;
    }
    draw(ctx, canvasHeight) {
        let scaleFactor = canvasHeight / 100;
        ctx.fillStyle = "white";
        ctx.fillRect(this.x * scaleFactor, this.y * scaleFactor, this.width * scaleFactor, this.height * scaleFactor);
    }
    move(duration) {
        this.y += (this.dy * duration) / 1000;
        if (this.y < 0) {
            this.y = 0;
        }
        else if (this.y + this.height > 100) {
            this.y = 100 - this.height;
        }
        this.targetY += (this.dy * duration) / 1000;
        if (this.targetY < 0) {
            this.targetY = 0;
        }
        else if (this.targetY + this.height > 100) {
            this.targetY = 100 - this.height;
        }
        if (Math.abs(this.targetY - this.y) < 5) {
            this.y += (this.targetY - this.y) * SMOOTHING_FACTOR;
        }
        else {
            this.y = this.targetY;
        }
    }
}
class Ball {
    x;
    targetX;
    targetY;
    y;
    radius;
    speedX;
    speedY;
    constructor(x, y, radius, speed) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.radius = radius;
        this.speedX = speed;
        this.speedY = speed;
    }
    draw(ctx, canvasHeight) {
        let scaleFactor = canvasHeight / 100;
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(this.x * scaleFactor, this.y * scaleFactor, this.radius * scaleFactor, 0, Math.PI * 2);
        ctx.fill();
    }
    move(duration) {
        this.x += (this.speedX * duration) / 1000;
        this.y += (this.speedY * duration) / 1000;
        this.targetX += (this.speedX * duration) / 1000;
        this.targetY += (this.speedY * duration) / 1000;
        if (Math.abs(this.targetX - this.x) < 5 && Math.abs(this.targetY - this.y) < 5) {
            this.x += (this.targetX - this.x) * SMOOTHING_FACTOR;
            this.y += (this.targetY - this.y) * SMOOTHING_FACTOR;
        }
        else {
            this.x = this.targetX;
            this.y = this.targetY;
        }
    }
}
class Game {
    canvas;
    ctx;
    paddleLeft;
    paddleRight;
    ball;
    ws;
    lastMsgTime;
    prevTime;
    isRunning;
    prevCmd;
    messageQueue;
    serverTimeOffset;
    prevBallSpeedX;
    prevBallSpeedY;
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.paddleLeft = new Paddle(1, 45, 2, PADDLE_H, PADDLE_S);
        this.paddleRight = new Paddle(197, 45, 2, PADDLE_H, PADDLE_S);
        this.ball = new Ball(100, 50, 1, 30);
        this.ws = null;
        this.lastMsgTime = 0;
        this.prevTime = 0;
        this.isRunning = false;
        this.prevCmd = 0;
        this.messageQueue = [];
        this.serverTimeOffset = 0;
        this.prevBallSpeedX = this.ball.speedX;
        this.prevBallSpeedY = this.ball.speedY;
        this.handleInput();
    }
    updateWebSocket(ws) {
        this.ws = ws;
    }
    receiveMessage(message) {
        this.messageQueue.push(message);
        if (!this.isRunning) {
            this.serverTimeOffset = performance.now() - message.data.time;
            this.updateGameState(message);
        }
    }
    updateGameState(message) {
        const data = message.data;
        if (!data)
            return;
        if (data.paddleLeft !== undefined) {
            this.paddleLeft.targetY = data.paddleLeft.y;
            this.paddleLeft.dy = data.paddleLeft.speed;
        }
        if (data.paddleRight !== undefined) {
            this.paddleRight.targetY = data.paddleRight.y;
            this.paddleRight.dy = data.paddleRight.speed;
        }
        if (data.ball) {
            const prevSpeedX = this.prevBallSpeedX;
            const prevSpeedY = this.prevBallSpeedY;
            this.ball.targetX = data.ball.x;
            this.ball.targetY = data.ball.y;
            this.ball.speedX = data.ball.speedX;
            this.ball.speedY = data.ball.speedY;
            if (Math.sign(prevSpeedY) !== Math.sign(this.ball.speedY) &&
                (data.ball.y <= this.ball.radius ||
                    data.ball.y >= 100 - this.ball.radius)) {
                SFX.wall.currentTime = 0;
                SFX.wall.play();
            }
            if (Math.sign(prevSpeedX) !== Math.sign(this.ball.speedX) &&
                Math.abs(data.ball.x - 100) > 5) {
                SFX.paddle.currentTime = 0;
                SFX.paddle.play();
            }
            this.prevBallSpeedX = this.ball.speedX;
            this.prevBallSpeedY = this.ball.speedY;
        }
        let perfTime = performance.now();
        this.lastMsgTime = perfTime;
        this.prevTime = data.time + this.serverTimeOffset + CLIENT_DELAY;
        if (data.isRunning) {
            if (!this.isRunning) {
                this.isRunning = true;
                this.render();
            }
        }
        else {
            this.isRunning = false;
        }
    }
    handleInput() {
        window.addEventListener("keydown", (e) => {
            let input = userInput.unknown;
            let paddle = paddleSide.unknown;
            if (e.key === "w") {
                input = userInput.moveUpStart;
                paddle = paddleSide.left;
            }
            if (e.key === "s") {
                input = userInput.moveDownStart;
                paddle = paddleSide.left;
            }
            if (e.key === "ArrowUp") {
                input = userInput.moveUpStart;
                paddle = paddleSide.right;
            }
            if (e.key === "ArrowDown") {
                input = userInput.moveDownStart;
                paddle = paddleSide.right;
            }
            if (this.ws &&
                this.ws.readyState === WebSocket.OPEN &&
                input !== userInput.unknown &&
                input !== this.prevCmd) {
                this.ws.send(JSON.stringify({ type: "game", cmd: input, paddle: paddle }));
                this.prevCmd = input;
            }
        });
        window.addEventListener("keyup", (e) => {
            let input = userInput.unknown;
            let paddle = paddleSide.unknown;
            if (e.key === "w") {
                input = userInput.moveUpEnd;
                paddle = paddleSide.left;
            }
            if (e.key === "s") {
                input = userInput.moveDownEnd;
                paddle = paddleSide.left;
            }
            if (e.key === "ArrowUp") {
                input = userInput.moveUpEnd;
                paddle = paddleSide.right;
            }
            if (e.key === "ArrowDown") {
                input = userInput.moveDownEnd;
                paddle = paddleSide.right;
            }
            if (this.ws &&
                this.ws.readyState === WebSocket.OPEN &&
                input !== userInput.unknown &&
                input !== this.prevCmd) {
                this.ws.send(JSON.stringify({ type: "game", cmd: input, paddle: paddle }));
                this.prevCmd = input;
            }
        });
    }
    loop() {
        if (!this.isRunning)
            return;
        while (this.messageQueue.length > 0 && performance.now() - (this.messageQueue[0].data.time + this.serverTimeOffset) > CLIENT_DELAY) {
            const message = this.messageQueue.shift();
            this.updateGameState(message);
        }
        const timestamp = performance.now();
        if (timestamp - this.prevTime > 500) {
            this.prevTime = timestamp;
        }
        const dt = timestamp - this.prevTime;
        this.prevTime = timestamp;
        this.paddleLeft.move(dt);
        this.paddleRight.move(dt);
        this.ball.move(dt);
        this.render();
    }
    render() {
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = "#ff2d95";
        this.ctx.setLineDash([10, 10]);
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.paddleLeft.draw(this.ctx, this.canvas.height);
        this.paddleRight.draw(this.ctx, this.canvas.height);
        this.ball.draw(this.ctx, this.canvas.height);
        requestAnimationFrame(() => this.loop());
    }
}
const canvas = document.getElementById("pongCanvas");
const pongHeader = document.getElementById("pongHeader");
const game = new Game(canvas);
const scoreDisplay = document.getElementById("scoreDisplay");
if (scoreDisplay) {
    const scoreObserver = new MutationObserver(() => {
        SFX.score.currentTime = 0;
        SFX.score.play();
    });
    scoreObserver.observe(scoreDisplay, { childList: true, subtree: true });
}
const countDownDisplay = document.getElementById("countDownDisplay");
if (countDownDisplay) {
    let countdownPlayed = false;
    const countObserver = new MutationObserver(() => {
        const text = countDownDisplay.textContent?.trim();
        const isHidden = countDownDisplay.classList.contains("hidden");
        if (!countdownPlayed && text === "3" && !isHidden) {
            countdownPlayed = true;
            SFX.countdown.currentTime = 0;
            SFX.countdown.play();
        }
        if (isHidden || !text || text.includes("-")) {
            SFX.countdown.pause();
            SFX.countdown.currentTime = 0;
            countdownPlayed = false;
        }
    });
    countObserver.observe(countDownDisplay, {
        childList: true,
        subtree: true,
        attributes: true,
    });
}
function resizeCanvas() {
    if (!canvas)
        return;
    const aspectRatio = 2 / 1;
    const maxHeight = (window.innerHeight - 170) * 0.55;
    const maxWidth = window.innerWidth;
    let width = maxWidth;
    let height = width / aspectRatio;
    if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width;
    canvas.height = height;
    pongHeader.style.width = `${width}px`;
    game.render();
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
export { game };
