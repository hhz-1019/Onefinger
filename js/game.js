'use strict';

const AIM_LOCK_HOLD_MS = 2000;
const AIM_LOCK_MOVE_TOLERANCE = 48;
const AIM_ASSIST_MAX_ANGLE = 0.24;

class Game {
  constructor() {
    this.canvas  = document.getElementById('gameCanvas');
    this.ctx     = this.canvas.getContext('2d');
    this.renderer = new Renderer(this.canvas);
    this.camera   = new CameraTracker();
    this.videoEl  = document.getElementById('cameraVideo');

    // ── State machine ─────────────────────────────────────────────────────────
    // MENU → CALIBRATE → PLAYING → WIN | LOSE → MENU
    this.state = 'MENU';

    // ── Game objects ──────────────────────────────────────────────────────────
    this.balls     = [];
    this.cueBall   = null;
    this.pockets   = [];
    this.tableRect = null;

    // ── Scoring / timer ───────────────────────────────────────────────────────
    this.shotCount = 0;
    this.startTime = 0;
    this.timeLeft  = CONFIG.TIME_LIMIT;
    this.timeUsed  = 0;
    this.isFirstShot = true;
    this.particles = [];

    // ── Touch aiming ──────────────────────────────────────────────────────────
    this.aimAngle    = 0;
    this.aimPower    = 0;
    this.pullback    = 0;
    this.pulling     = false;
    this.touchOrigin = null;

    // ── Camera / calibration state ────────────────────────────────────────────
    this._fingerPos          = null;
    this._fingerEverDetected = false;
    this._fingerDetectedAt   = 0;
    this._fingerRippleT      = 1;
    this._aimLocked          = false;
    this._aimLockPos         = null;
    this._aimLockStartedAt   = 0;
    this._aimLockProgress    = 0;
    this._aimLockAngle       = 0;
    this._aimAssistActive    = false;

    // Calibration (CALIBRATE state)
    this._calibProgress = 0;   // 0 → 1 (fills as finger is held steady)
    this._calibSuccess  = false;

    // ── Animation ─────────────────────────────────────────────────────────────
    this.animT    = 0;
    this.lastTime = 0;
    this.menuBtn  = null;
    this.endBtn   = null;

    this._resize();
    this._bindEvents();
    this._loop(0);
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  _resize() {
    const W = this.canvas.width  = window.innerWidth;
    const H = this.canvas.height = window.innerHeight;
    const isLandscape = W > H;

    let tw, th;
    if (isLandscape) {
      th = H * 0.82; tw = th * 1.9;
      if (tw > W * 0.92) { tw = W * 0.92; th = tw / 1.9; }
    } else {
      tw = W * 0.92; th = tw / 1.9;
      if (th > H * 0.72) { th = H * 0.72; tw = th * 1.9; }
    }

    const bw      = Math.round(tw * CONFIG.BORDER_RATIO);
    const tx      = (W - tw) / 2;
    const ty      = (H - th) / 2 + (isLandscape ? 0 : 28);
    const pocketR = Math.round(tw * CONFIG.POCKET_RADIUS_RATIO);
    const ballR   = Math.round(tw * CONFIG.BALL_RADIUS_RATIO);

    this.tableRect = { x: tx, y: ty, w: tw, h: th, borderWidth: bw, ballRadius: ballR };
    this.pockets = [
      { x: tx + pocketR,      y: ty + pocketR,           r: pocketR },
      { x: tx + tw / 2,       y: ty - pocketR * 0.3,     r: pocketR },
      { x: tx + tw - pocketR, y: ty + pocketR,           r: pocketR },
      { x: tx + pocketR,      y: ty + th - pocketR,      r: pocketR },
      { x: tx + tw / 2,       y: ty + th + pocketR * 0.3, r: pocketR },
      { x: tx + tw - pocketR, y: ty + th - pocketR,      r: pocketR },
    ];

    for (const b of this.balls)    b.r = ballR;
    if (this.cueBall) this.cueBall.r = ballR;
    this.renderer.setTableRect(this.tableRect);
  }

  // ── Ball setup ────────────────────────────────────────────────────────────
  _setupBalls() {
    this.balls = [];
    const { x, y, w, h } = this.tableRect;
    const r = this.tableRect.ballRadius;

    this.cueBall = new Ball(x + w * 0.25, y + h / 2, '#fff', 0, true);
    this.cueBall.r = r;
    this.balls.push(this.cueBall);

    for (let i = 0; i < CONFIG.BALL_COUNT; i++) {
      const pos = Utils.randomTablePos(this.tableRect, this.pockets, this.balls, r);
      const b = new Ball(pos.x, pos.y, CONFIG.BALL_COLORS[i % CONFIG.BALL_COLORS.length], i + 1);
      b.r = r;
      this.balls.push(b);
    }
  }

  // ── Game-state transitions ────────────────────────────────────────────────

  /** Called when "开始游戏" is tapped from MENU. */
  startGame() {
    this._calibProgress = 0;
    this._calibSuccess  = false;
    this.state = 'CALIBRATE';
    this._tryStartCamera();
  }

  async _tryStartCamera() {
    const ok = await this.camera.start(this.videoEl);
    if (!ok) {
      // No camera → skip calibration, go straight to play
      this._beginPlaying();
    }
    // Camera OK → stay in CALIBRATE, loop will detect finger
  }

  /** Transition from CALIBRATE → PLAYING. */
  _beginPlaying() {
    this._setupBalls();
    this.shotCount   = 0;
    this.timeLeft    = CONFIG.TIME_LIMIT;
    this.startTime   = performance.now();
    this.isFirstShot = true;
    this.particles   = [];
    this.pullback    = 0;
    this.pulling     = false;
    this._fingerEverDetected = false;
    this._fingerDetectedAt   = 0;
    this._fingerRippleT      = 1;
    this._fingerPos          = null;
    this.aimAngle = 0;
    this.aimPower = 0;
    this._resetAimLock();
    this.state = 'PLAYING';
  }

  // ── Calibration loop ──────────────────────────────────────────────────────
  _updateCalibrate() {
    if (!this.camera.enabled) return;
    const W = this.canvas.width, H = this.canvas.height;
    const fp = this.camera.processFrame(W, H);
    this._fingerPos = fp;

    if (fp) {
      // Fill progress bar; require ~1 second of steady detection (≈60 frames)
      this._calibProgress = Math.min(1, this._calibProgress + 0.018);
    } else {
      // Decay slowly (brief occlusion shouldn't reset)
      this._calibProgress = Math.max(0, this._calibProgress - 0.025);
    }

    if (this._calibProgress >= 1 && !this._calibSuccess) {
      this._calibSuccess = true;
      // Brief success animation then enter game
      setTimeout(() => this._beginPlaying(), 1400);
    }
  }

  // ── Game score ────────────────────────────────────────────────────────────
  _checkWin() {
    if (this.balls.filter(b => !b.isCue && !b.pocketed).length === 0) {
      this.timeUsed = (performance.now() - this.startTime) / 1000;
      this.state    = 'WIN';
      this._saveScore();
    }
  }

  _saveScore() {
    try {
      const score = Math.max(0, Math.round(1000 - this.shotCount * 50 - this.timeUsed * 3));
      const best  = parseInt(localStorage.getItem('qingtai_best') || '0');
      if (score > best) localStorage.setItem('qingtai_best', String(score));
    } catch (_) {}
  }

  // ── Shot mechanics ────────────────────────────────────────────────────────
  _fireShot(angle, power) {
    if (!this.cueBall || this.cueBall.pocketed) return;
    if (this._anyMoving()) return;
    const speed = power * CONFIG.MAX_SHOT_POWER;
    this.cueBall.vx = Math.cos(angle) * speed;
    this.cueBall.vy = Math.sin(angle) * speed;
    this.shotCount++;
    this.isFirstShot = false;
    this.pullback = 0;
    this.pulling  = false;
    this._spawnParticles(this.cueBall.x, this.cueBall.y, '#ffffffaa', 6);
  }

  _anyMoving() {
    return this.balls.some(b => !b.pocketed && b.isMoving);
  }

  // ── Physics ───────────────────────────────────────────────────────────────
  _updatePhysics() {
    for (const b of this.balls) b.update(this.tableRect);

    for (let i = 0; i < this.balls.length; i++) {
      if (this.balls[i].pocketed) continue;
      for (let j = i + 1; j < this.balls.length; j++) {
        if (this.balls[j].pocketed) continue;
        this._resolveCollision(this.balls[i], this.balls[j]);
      }
    }

    for (const b of this.balls) {
      if (b.pocketed) continue;
      for (const p of this.pockets) {
        if (Utils.dist(b.x, b.y, p.x, p.y) < p.r) {
          b.pocketed = true; b.vx = 0; b.vy = 0;
          this._spawnParticles(b.x, b.y, b.isCue ? '#ffffff' : b.color, 10);
          if (b.isCue) {
            setTimeout(() => {
              b.pocketed = false; b.sinkProgress = 0;
              b.x = this.tableRect.x + this.tableRect.w * 0.25;
              b.y = this.tableRect.y + this.tableRect.h / 2;
            }, 900);
          }
          break;
        }
      }
    }
  }

  _resolveCollision(b1, b2) {
    const dx = b2.x - b1.x, dy = b2.y - b1.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    const md = b1.r + b2.r;
    if (d >= md || d === 0) return;
    const nx = dx / d, ny = dy / d;
    const ov = (md - d) / 2;
    b1.x -= nx * ov; b1.y -= ny * ov;
    b2.x += nx * ov; b2.y += ny * ov;
    const dvx = b2.vx - b1.vx, dvy = b2.vy - b1.vy;
    const dot = dvx * nx + dvy * ny;
    if (dot > 0) return;
    const imp = dot * CONFIG.RESTITUTION;
    b1.vx += imp * nx; b1.vy += imp * ny;
    b2.vx -= imp * nx; b2.vy -= imp * ny;
    this._spawnParticles((b1.x + b2.x) / 2, (b1.y + b2.y) / 2, 'rgba(255,255,200,0.6)', 4);
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  _spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 3 + 1;
      this.particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
                             r: Math.random()*3+1, alpha: 0.8, color });
    }
  }

  _updateParticles() {
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.08; p.alpha -= 0.022; p.r *= 0.97;
    }
    this.particles = this.particles.filter(p => p.alpha > 0.02);
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _bindEvents() {
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));

    this.canvas.addEventListener('touchstart', e => { e.preventDefault(); this._handlePointerDown(this._getTouchPos(e)); }, { passive: false });
    this.canvas.addEventListener('touchmove',  e => { e.preventDefault(); this._handlePointerMove(this._getTouchPos(e)); }, { passive: false });
    this.canvas.addEventListener('touchend',   e => { e.preventDefault(); this._handlePointerUp(this._getTouchPos(e));   }, { passive: false });
    this.canvas.addEventListener('mousedown',  e => this._handlePointerDown({ x: e.offsetX, y: e.offsetY }));
    this.canvas.addEventListener('mousemove',  e => this._handlePointerMove({ x: e.offsetX, y: e.offsetY }));
    this.canvas.addEventListener('mouseup',    e => this._handlePointerUp({ x: e.offsetX, y: e.offsetY }));
  }

  _getTouchPos(e) {
    const t = e.changedTouches[0], rect = this.canvas.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  _handlePointerDown(pos) {
    if (this.state === 'MENU') {
      if (this.menuBtn && this._inRect(pos, this.menuBtn)) this.startGame();
      return;
    }
    if (this.state === 'WIN' || this.state === 'LOSE') {
      if (this.endBtn && this._inRect(pos, this.endBtn)) {
        this.camera.stop(); this.videoEl.style.display = 'none'; this.state = 'MENU';
      }
      return;
    }
    if (this.state !== 'PLAYING') return;
    if (this._anyMoving() || !this.cueBall || this.cueBall.pocketed) return;

    this.touchOrigin = pos;
    this.pulling     = true;
    this.aimAngle    = Utils.angle(pos.x, pos.y, this.cueBall.x, this.cueBall.y);
    this.pullback    = 0;
  }

  _handlePointerMove(pos) {
    if (this.state !== 'PLAYING' || !this.pulling) return;
    if (!this.touchOrigin || !this.cueBall) return;
    this.aimAngle = Utils.angle(pos.x, pos.y, this.cueBall.x, this.cueBall.y);
    const d = Utils.dist(pos.x, pos.y, this.touchOrigin.x, this.touchOrigin.y);
    this.pullback  = Utils.clamp(d * 0.5, 0, CONFIG.CUE_MAX_PULLBACK);
    this.aimPower  = this.pullback / CONFIG.CUE_MAX_PULLBACK;
  }

  _handlePointerUp(pos) {
    if (this.state !== 'PLAYING' || !this.pulling) return;
    this.pulling = false;
    if (this.aimPower > 0.05) this._fireShot(this.aimAngle, this.aimPower);
    this.aimPower = 0; this.pullback = 0; this.touchOrigin = null;
  }

  _inRect(pos, btn) {
    return pos.x >= btn.btnX && pos.x <= btn.btnX + btn.btnW &&
           pos.y >= btn.btnY && pos.y <= btn.btnY + btn.btnH;
  }

  // ── Camera aiming (PLAYING state) ─────────────────────────────────────────
  _resetAimLock() {
    this._aimLocked = false;
    this._aimLockPos = null;
    this._aimLockStartedAt = 0;
    this._aimLockProgress = 0;
    this._aimLockAngle = this.aimAngle || 0;
    this._aimAssistActive = false;
  }

  _angleDelta(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  _pointSegmentDistance(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) return Utils.dist(px, py, ax, ay);
    const t = Utils.clamp(((px - ax) * vx + (py - ay) * vy) / lenSq, 0, 1);
    return Utils.dist(px, py, ax + vx * t, ay + vy * t);
  }

  _isPathBlocked(ax, ay, bx, by, ignoredBalls = []) {
    const ignored = new Set(ignoredBalls);
    const r = this.cueBall?.r || this.tableRect?.ballRadius || 10;
    for (const b of this.balls || []) {
      if (!b || b.pocketed || ignored.has(b)) continue;
      const d = this._pointSegmentDistance(b.x, b.y, ax, ay, bx, by);
      if (d < r * 1.85) return true;
    }
    return false;
  }

  _assistAimAngle(rawAngle) {
    if (!this.cueBall || !this.balls || !this.pockets) {
      return rawAngle;
    }

    const r = this.cueBall.r || this.tableRect?.ballRadius || 10;
    let best = null;

    for (const target of this.balls) {
      if (!target || target === this.cueBall || target.pocketed) continue;
      for (const pocket of this.pockets) {
        const toPocketX = pocket.x - target.x;
        const toPocketY = pocket.y - target.y;
        const toPocketLen = Math.hypot(toPocketX, toPocketY);
        if (toPocketLen < r * 3) continue;

        const ux = toPocketX / toPocketLen;
        const uy = toPocketY / toPocketLen;
        const contactX = target.x - ux * r * 2;
        const contactY = target.y - uy * r * 2;
        const assistedAngle = Utils.angle(this.cueBall.x, this.cueBall.y, contactX, contactY);
        const angleError = Math.abs(this._angleDelta(rawAngle, assistedAngle));
        if (angleError > AIM_ASSIST_MAX_ANGLE) continue;

        if (this._isPathBlocked(this.cueBall.x, this.cueBall.y, contactX, contactY, [this.cueBall, target])) continue;
        if (this._isPathBlocked(target.x, target.y, pocket.x, pocket.y, [this.cueBall, target])) continue;

        const score = angleError + Utils.dist(this.cueBall.x, this.cueBall.y, target.x, target.y) * 0.00005;
        if (!best || score < best.score) {
          best = { angle: assistedAngle, score };
        }
      }
    }

    this._aimAssistActive = !!best;
    return best ? best.angle : rawAngle;
  }

  _updateAimLock(fp, now) {
    if (!fp) {
      this._resetAimLock();
      return;
    }

    if (this._aimLocked) {
      this.aimAngle = this._aimLockAngle;
      return;
    }

    if (!this._aimLockPos) {
      this._aimLockPos = { x: fp.x, y: fp.y };
      this._aimLockStartedAt = now;
      this._aimLockProgress = 0;
      return;
    }

    const drift = Math.hypot(fp.x - this._aimLockPos.x, fp.y - this._aimLockPos.y);
    if (drift > AIM_LOCK_MOVE_TOLERANCE) {
      this._aimLockPos = { x: fp.x, y: fp.y };
      this._aimLockStartedAt = now;
      this._aimLockProgress = 0;
      return;
    }

    this._aimLockProgress = Utils.clamp(
      (now - this._aimLockStartedAt) / AIM_LOCK_HOLD_MS,
      0,
      1,
    );

    if (this._aimLockProgress >= 1) {
      this._aimLocked = true;
      this._aimLockPos = { x: fp.x, y: fp.y };
      this._aimLockAngle = this.aimAngle;
      this._fingerRippleT = 0;
    }
  }

  _processCameraInput() {
    if (!this.camera.enabled) return;
    const W = this.canvas.width, H = this.canvas.height;
    const fp = this.camera.processFrame(W, H);
    this._fingerPos = fp;

    if (this._anyMoving() || !this.cueBall || this.cueBall.pocketed) return;

    if (fp) {
      // Record first detection for guide/ripple
      if (!this._fingerEverDetected) {
        this._fingerEverDetected = true;
        this._fingerDetectedAt   = performance.now();
        this._fingerRippleT      = 0;
      }

      if (!this._aimLocked) {
        // Camera aim: palm is the target point the cue ball should travel toward.
        const rawAngle = Utils.angle(this.cueBall.x, this.cueBall.y, fp.x, fp.y);
        this.aimAngle = this._assistAimAngle(rawAngle);
      }
      this._updateAimLock(fp, performance.now());

      const effectiveAngle = this._aimLocked ? this._aimLockAngle : this.aimAngle;
      this.aimAngle = effectiveAngle;
      this.camera.setAimAngle(effectiveAngle);
      this.camera.updateStroke(effectiveAngle);

      // Pullback from axial retreat
      this.pullback = this.camera.getPullback();
      this.aimPower = this.pullback / CONFIG.CUE_MAX_PULLBACK;

      // Shot: fist close or fast forward thrust after meaningful pullback
      const shotPower = this.camera.detectShot();
      if (shotPower !== null && this._aimLocked) {
        this._fireShot(effectiveAngle, shotPower);
        this._resetAimLock();
      }
    } else {
      this._resetAimLock();
      this.camera.setAimAngle(this.aimAngle);
    }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  _loop(ts) {
    try {
      this.lastTime = this.lastTime || ts;
      this.animT   += 0.016;
      this.lastTime = ts;

      if (this.state === 'CALIBRATE') {
        this._updateCalibrate();
      }

      if (this.state === 'PLAYING') {
        this.timeLeft = Math.max(0,
          CONFIG.TIME_LIMIT - (performance.now() - this.startTime) / 1000);
        if (this.timeLeft <= 0) { this.state = 'LOSE'; this.timeUsed = CONFIG.TIME_LIMIT; }

        this._processCameraInput();
        this._updatePhysics();
        this._updateParticles();
        this._checkWin();
      }

      this._draw();
    } catch (e) {
      console.error(e);
      document.getElementById('errorOverlay').style.display = 'flex';
    }
    requestAnimationFrame(ts => this._loop(ts));
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  _draw() {
    const W = this.canvas.width, H = this.canvas.height;
    const r = this.renderer;
    const ctx = this.ctx;

    r.clear();
    r.drawBackground();

    // ── MENU ──────────────────────────────────────────────────────────────
    if (this.state === 'MENU') {
      this.menuBtn = r.drawMenu(W, H, this.animT);
      return;
    }

    // ── CALIBRATE ─────────────────────────────────────────────────────────
    if (this.state === 'CALIBRATE') {
      r.drawCalibrationScreen(
        this.videoEl,
        !!this._fingerPos,
        this._calibProgress,
        this._calibSuccess,
        this.animT, W, H
      );
      return;
    }

    // ── PLAYING / WIN / LOSE ──────────────────────────────────────────────
    r.drawTable(this.tableRect, this.pockets);

    const canAim = this.state === 'PLAYING'
                && !this._anyMoving()
                && this.cueBall && !this.cueBall.pocketed;

    if (canAim) r.drawGhostBall(this.cueBall, this.aimAngle, this.pockets, this.balls);

    // Sink animations
    for (const p of this.pockets)
      for (const b of this.balls)
        if (b.pocketed && b.sinkProgress < 1) b.sink(p.x, p.y, ctx);

    for (const b of this.balls) b.draw(ctx);

    // Cue stick
    if (canAim) {
      // Camera mode treats the palm as a target point, so keep the cue anchored at the ball.
      r.drawCue(this.cueBall, this.aimAngle, this.pullback, null);
      if (this.aimPower > 0.02) r.drawPowerArc(this.cueBall, this.aimAngle, this.aimPower);
    }

    r.drawParticles(this.particles);

    // Camera HUD overlay
    if (this.camera.enabled && this.state === 'PLAYING') {
      // Advance ripple
      if (this._fingerRippleT < 1) this._fingerRippleT = Math.min(1, this._fingerRippleT + 0.035);

      // Small preview
      const pvW = 100, pvH = 72;
      r.drawCameraPreview(this.videoEl, W - pvW - 8, 60, pvW, pvH);

      // Guide (waiting / flash)
      r.drawCameraGuide(!!this._fingerPos, this._fingerEverDetected,
                        this._fingerDetectedAt, this.animT, W, H,
                        this._aimLockProgress, this._aimLocked,
                        this._aimAssistActive);

      // Finger cursor
      const cursorPos = this._aimLocked && this._aimLockPos ? this._aimLockPos : this._fingerPos;
      if (cursorPos) r.drawFingerCursor(cursorPos, this._fingerRippleT, this._aimLocked);
    }

    if (this.state === 'PLAYING') {
      r.drawHUD(this.shotCount, this.timeLeft, this.isFirstShot, this.camera.enabled);
    }

    if (this.state === 'WIN' || this.state === 'LOSE') {
      this.endBtn = r.drawEndScreen(
        this.state === 'WIN', this.shotCount, this.timeUsed || 0, W, H);
    }
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  try { window._game = new Game(); }
  catch (e) {
    console.error(e);
    document.getElementById('errorOverlay').style.display = 'flex';
  }
});
