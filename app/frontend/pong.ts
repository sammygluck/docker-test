/* =========================================================================
 *  pong.ts – Stand-alone LOCAL (offline) browser version
 *  Expects the “localGamePage” markup from index.html:
 *     - <canvas id="localPongCanvas">
 *     - #localScoreDisplay  #localCountdown
 *     - buttons #localBtnPlay / #localBtnPause / #localBtnReset
 *  Coordinate system: X 0–200, Y 0–100  (% of canvas height).
 * =========================================================================*/

/* ------------------------------------------------------------------------
 * 1.  Constants  (these will eventually move to ../game/physics.ts)
 * --------------------------------------------------------------------- */

const PADDLE_H    = 14;
const PADDLE_S    = 55;
const SPEED_UP    = 1.05;   // +5 % each paddle hit
const MAX_SPEED   = 120;    // hard cap in %/s
const SPIN_FACTOR = 0.25;   // tweak 0.15-0.35 to taste
const BASE_SPEED  = 50;     // baseline serve speed (%/s)

/* ------------------------------------------------------------------------
 * 2.  DOM helpers
 * --------------------------------------------------------------------- */

// Non-null assertions (!) avoid the need for runtime null checks once we
// know the markup is present.
const scoreEl        = document.getElementById('localScoreDisplay')!  as HTMLSpanElement;
const canvas         = document.getElementById('localPongCanvas')!    as HTMLCanvasElement;
const countdownEl    = document.getElementById('localCountdown')!     as HTMLDivElement;

const btnPlay  = document.getElementById('localBtnPlay')!  as HTMLButtonElement;
const btnPause = document.getElementById('localBtnPause')! as HTMLButtonElement;
const btnReset = document.getElementById('localBtnReset')! as HTMLButtonElement;

/* Sound effects */
const SFX = {
  wall   : document.getElementById('sndWall')   as HTMLAudioElement,
  paddle : document.getElementById('sndPaddle') as HTMLAudioElement,
  score  : document.getElementById('sndScore')  as HTMLAudioElement,
  countdown : document.getElementById('sndCountdown') as HTMLAudioElement,
};

/* ------------------------------------------------------------------------
 * 3.  Model classes
 * --------------------------------------------------------------------- */

class Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  dy = 0;                           // current vertical velocity (%/s)

  constructor(x: number, y: number, width: number, height: number, speed: number) {
    this.x = x; this.y = y;
    this.width = width; this.height = height;
    this.speed = speed;
  }

  move(dt: number) {
    this.y += (this.dy * dt) / 1000;
    if (this.y < 0) this.y = 0;
    else if (this.y + this.height > 100) this.y = 100 - this.height;
  }

  draw(ctx: CanvasRenderingContext2D, canvasHeight: number) {
    const k = canvasHeight / 100;
    ctx.fillStyle = 'white';
    ctx.fillRect(this.x * k, this.y * k, this.width * k, this.height * k);
  }
}

class Ball {
  x: number;
  y: number;
  radius: number;
  speedX: number;
  speedY: number;

  constructor(x: number, y: number, radius: number, speed: number) {
    this.x = x; this.y = y; this.radius = radius;
    this.speedX =  speed;  // + = right, – = left
    this.speedY =  speed;  // + = down,  – = up
  }

  move(dt: number) {
    this.x += (this.speedX * dt) / 1000;
    this.y += (this.speedY * dt) / 1000;

    /* top / bottom walls */
    if (
      (this.y - this.radius <= 0 && this.speedY < 0) ||
      (this.y + this.radius >= 100 && this.speedY > 0)
    ) {
      this.speedY *= -1;
      SFX.wall.currentTime = 0;
      SFX.wall.play();
    }
  }

  /* Circle-vs-rect collision + “English” (spin) */
  checkCollision(p: Paddle) {
    const closestX = Math.max(p.x, Math.min(this.x, p.x + p.width));
    const closestY = Math.max(p.y, Math.min(this.y, p.y + p.height));
    const dx = this.x - closestX;
    const dy = this.y - closestY;

    if (dx * dx + dy * dy > this.radius * this.radius) return; // miss

    /* push out so ball never sinks into the paddle */
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const overlap = this.radius - dist;
    const nx = dx / dist, ny = dy / dist;
    this.x += nx * overlap;
    this.y += ny * overlap;

    /* new velocity from impact point */
    let speed = Math.hypot(this.speedX, this.speedY) * SPEED_UP;
    if (speed > MAX_SPEED) speed = MAX_SPEED;

    const relY  = -((this.y - (p.y + p.height / 2)) / (p.height / 2));
    const MAX   = 60 * Math.PI / 180;              // 60 °
    const angle = Math.sin(relY * Math.PI / 2) * MAX;
    const dir   = (p.x < 100) ? 1 : -1;            // send away

    this.speedX = speed *  Math.cos(angle) * dir;
    this.speedY = speed * -Math.sin(angle);

    /* add paddle motion then renormalise */
    this.speedY += p.dy * SPIN_FACTOR;
    const mag = Math.hypot(this.speedX, this.speedY);
    this.speedX *= speed / mag;
    this.speedY *= speed / mag;

    SFX.paddle.currentTime = 0;
    SFX.paddle.play();
  }

  draw(ctx: CanvasRenderingContext2D, canvasHeight: number) {
    const k = canvasHeight / 100;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(this.x * k, this.y * k, this.radius * k, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------------
 * 4.  Game controller
 * --------------------------------------------------------------------- */

class Game {
  private paddleLeft:  Paddle;
  private paddleRight: Paddle;
  private ball:        Ball;
  private prevTime = 0;
  private isRunning = false;
  private isPaused  = false;
  private scoreLeft  = 0;
  private scoreRight = 0;

  public get paused(): boolean {
    return this.isPaused;
  }

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context');
    this.ctx = ctx;

    this.paddleLeft  = new Paddle(  1, 45, 2, PADDLE_H, PADDLE_S);
    this.paddleRight = new Paddle(197, 45, 2, PADDLE_H, PADDLE_S);
    this.ball        = new Ball  (100, 50, 1, 30);

    this.handleKeyboard();
    this.loop(0);
  }

  private ctx: CanvasRenderingContext2D;

  /* --- Input --------------------------------------------------------- */
  private handleKeyboard() {
    window.addEventListener('keydown', e => {

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    if (e.key === 'w')         this.paddleLeft .dy = -this.paddleLeft.speed;
    if (e.key === 's')         this.paddleLeft .dy =  this.paddleLeft.speed;
    if (e.key === 'ArrowUp')   this.paddleRight.dy = -this.paddleRight.speed;
    if (e.key === 'ArrowDown') this.paddleRight.dy =  this.paddleRight.speed;
    });

    window.addEventListener('keyup', e => {
      if (e.key === 'w'        && this.paddleLeft .dy < 0) this.paddleLeft .dy = 0;
      if (e.key === 's'        && this.paddleLeft .dy > 0) this.paddleLeft .dy = 0;
      if (e.key === 'ArrowUp'  && this.paddleRight.dy < 0) this.paddleRight.dy = 0;
      if (e.key === 'ArrowDown'&& this.paddleRight.dy > 0) this.paddleRight.dy = 0;
    });
  }

  /* --- Main loop ----------------------------------------------------- */
  private loop(timestamp: number) {
    const dt = timestamp - this.prevTime;
    if (this.isRunning && !this.isPaused && dt < 1000) this.update(dt);
    this.render();
    this.prevTime = timestamp;
    requestAnimationFrame(ts => this.loop(ts));
  }

  private update(dt: number) {
    this.paddleLeft .move(dt);
    this.paddleRight.move(dt);

    this.ball.move(dt);
    this.ball.checkCollision(this.paddleLeft);
    this.ball.checkCollision(this.paddleRight);

    /* scoring */
    if (this.ball.x < this.paddleLeft.x - this.ball.radius) {
      this.scoreRight++; this.resetBall(); SFX.score.currentTime = 0; SFX.score.play();
    } else if (this.ball.x >
               this.paddleRight.x + this.paddleRight.width + this.ball.radius) {
      this.scoreLeft++;  this.resetBall(); SFX.score.currentTime = 0; SFX.score.play();
    }
  }

  private resetBall() {
    const dir = this.ball.speedX < 0 ? 1 : -1;   // serve toward loser
    this.ball.x = 100; this.ball.y = 50;
    this.ball.speedX = BASE_SPEED * dir;
    this.ball.speedY = 0;
  }

  /* --- Rendering ----------------------------------------------------- */
  private render() {
    /* background + centre net */
    this.ctx.fillStyle = 'rgba(0,0,0,0.85)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.strokeStyle = '#ff2d95';
    this.ctx.setLineDash([10, 10]);
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    /* objects */
    this.paddleLeft .draw(this.ctx, this.canvas.height);
    this.paddleRight.draw(this.ctx, this.canvas.height);
    this.ball.draw(this.ctx, this.canvas.height);

    /* scoreboard */
    scoreEl.textContent = `${this.scoreLeft} - ${this.scoreRight}`;
    const leftLeading = this.scoreLeft > this.scoreRight;
    scoreEl.classList.remove('text-\[\#ff2d95\]', 'text-\[\#00bfff\]', 'drop-shadow-\[0_0_6px_\#ff2d95\]', 'drop-shadow-\[0_0_6px_\#00bfff\]');
    if (leftLeading) {
      scoreEl.classList.add('text-\[\#ff2d95\]', 'drop-shadow-[0_0_6px_#ff2d95]');
    } else {
      scoreEl.classList.add('text-\[\#00bfff\]', 'drop-shadow-[0_0_6px_#00bfff]');
    }
  }

  /* --- Countdown ----------------------------------------------------- */
  private showCountdown(callback: () => void) {
    countdownEl.classList.remove('hidden');
    let n = 3;
    countdownEl.textContent = n.toString();
    SFX.countdown.currentTime = 0;
    SFX.countdown.play();
    const iv = setInterval(() => {
      n--;
      if (n === 0) {
        clearInterval(iv);
        countdownEl.classList.add('hidden');
        callback();
      } else {
        countdownEl.textContent = n.toString();
        /* play the countdown sound only once at the beginning */
      }
    }, 800);
  }

  /* --- Public control API ------------------------------------------- */
  start() {
    if (this.isRunning) return;
    this.showCountdown(() => {
      this.isRunning = true;
      this.prevTime  = performance.now();
    });
  }
  togglePause() {
    if (!this.isRunning) return;
    this.isPaused = !this.isPaused;
  }
  reset() {
    this.isRunning = false;
    this.isPaused  = false;
    this.scoreLeft = this.scoreRight = 0;
    this.resetBall();
    this.render();
  }
}

/* ------------------------------------------------------------------------
 * 5.  Boot + UI wiring
 * --------------------------------------------------------------------- */

function resizeCanvas(): void {
	if (!canvas) return;

	const aspectRatio = 2 / 1;
	const maxHeight = (window.innerHeight - 210) * 0.5;
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
}

// Run on page load
resizeCanvas();

// Update on window resize
window.addEventListener("resize", resizeCanvas);

const game = new Game(canvas);

btnPlay.onclick = () => {
  game.start();
  btnPlay.disabled  = true;
  btnPause.disabled = btnReset.disabled = false;
};

btnPause.onclick = () => {
  game.togglePause();
  btnPause.textContent = game.paused ? 'Resume' : 'Pause';
};

btnReset.onclick = () => {
  game.reset();
  btnPlay.disabled  = false;
  btnPause.disabled = btnReset.disabled = true;
  btnPause.textContent = 'Pause';
};