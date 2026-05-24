'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawBackground() {
    const ctx = this.ctx;
    const grd = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    grd.addColorStop(0, '#0d1117');
    grd.addColorStop(1, '#1a2030');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawTable(tableRect, pockets) {
    const ctx = this.ctx;
    const { x, y, w, h } = tableRect;
    const bw = tableRect.borderWidth;

    // Outer wood frame
    ctx.save();
    const woodGrd = ctx.createLinearGradient(x - bw, y - bw, x - bw + bw * 2, y - bw + bw * 2);
    woodGrd.addColorStop(0, '#c8873a');
    woodGrd.addColorStop(0.4, '#a0622a');
    woodGrd.addColorStop(0.7, '#8B4513');
    woodGrd.addColorStop(1, '#6b3210');
    ctx.fillStyle = woodGrd;
    ctx.beginPath();
    ctx.roundRect(x - bw, y - bw, w + bw * 2, h + bw * 2, bw * 0.4);
    ctx.fill();

    // Wood grain texture
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const gy = y - bw + (h + bw * 2) * (i / 20);
      ctx.beginPath();
      ctx.moveTo(x - bw, gy + Math.sin(i) * 3);
      ctx.lineTo(x + w + bw, gy + Math.sin(i + 1) * 3);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();

    // Inner cushion (darker border inside felt area)
    ctx.save();
    ctx.fillStyle = '#1a4d20';
    ctx.beginPath();
    ctx.roundRect(x - bw * 0.15, y - bw * 0.15, w + bw * 0.3, h + bw * 0.3, bw * 0.2);
    ctx.fill();
    ctx.restore();

    // Green felt
    ctx.save();
    const feltGrd = ctx.createRadialGradient(
      x + w / 2, y + h / 2, 0,
      x + w / 2, y + h / 2, Math.max(w, h) * 0.7
    );
    feltGrd.addColorStop(0, '#2e8040');
    feltGrd.addColorStop(0.5, '#256935');
    feltGrd.addColorStop(1, '#1a4d25');
    ctx.fillStyle = feltGrd;
    ctx.fillRect(x, y, w, h);

    // Felt weave texture
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 6) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i, y + h);
      ctx.stroke();
    }
    for (let j = 0; j < h; j += 6) {
      ctx.beginPath();
      ctx.moveTo(x, y + j);
      ctx.lineTo(x + w, y + j);
      ctx.stroke();
    }
    ctx.restore();

    // Table markings
    const ballR = tableRect.ballRadius;
    // Balk line (1/4 from left)
    const balkX = x + w * 0.25;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(balkX, y + h * 0.1);
    ctx.lineTo(balkX, y + h * 0.9);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // D arc
    ctx.save();
    const arcR = h * 0.18;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(balkX, y + h / 2, arcR, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.restore();

    // Spots
    const spots = [
      { x: x + w * 0.5, y: y + h / 2 },       // center spot
      { x: x + w * 0.75, y: y + h / 2 },      // pink spot
      { x: x + w * 0.875, y: y + h / 2 },     // black spot
      { x: balkX, y: y + h / 2 },              // brown spot
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (const sp of spots) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Draw pockets
    for (const pocket of pockets) {
      // Black hole
      const pGrd = ctx.createRadialGradient(
        pocket.x, pocket.y, 0,
        pocket.x, pocket.y, pocket.r
      );
      pGrd.addColorStop(0, '#000');
      pGrd.addColorStop(0.6, '#111');
      pGrd.addColorStop(1, '#2a1a0a');
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, pocket.r, 0, Math.PI * 2);
      ctx.fillStyle = pGrd;
      ctx.fill();

      // Rim
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, pocket.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,140,60,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * Draw the cue stick.
   *
   * TOUCH mode  (fingerPos = null)
   *   Classic: cue extends from near-ball backward with pullback gap.
   *
   * CAMERA mode (fingerPos supplied)
   *   The cue is a FIXED-LENGTH stick. The GRIP POINT (65% from tip)
   *   is pinned to the finger position. The cue always points from the
   *   finger toward the ball. The WHOLE STICK moves freely with the finger
   *   — it does NOT just rotate around the ball.
   *   Pulling the finger back retreats the grip (and therefore the tip)
   *   away from the ball; a fast forward thrust fires the shot.
   */
  drawCue(cueBall, angle, pullback, fingerPos = null) {
    if (!cueBall || cueBall.pocketed) return;
    const ctx = this.ctx;
    const cx = cueBall.x, cy = cueBall.y;
    const r  = cueBall.r;

    // Unit vector: FROM finger TOWARD ball (shot direction)
    const ca = Math.cos(angle);           // shot direction x
    const sa = Math.sin(angle);           // shot direction y
    // Butt direction (from ball toward finger)
    const ba = Math.cos(angle + Math.PI);
    const bs = Math.sin(angle + Math.PI);

    const perpX = -sa, perpY = ca;       // perpendicular for trapezoid
    const tipW = 2.5, buttW = 9;

    let tipX, tipY, endX, endY;

    if (fingerPos) {
      // ── CAMERA MODE: fixed-length cue, grip at finger ──
      //
      // The cue has a fixed length. The grip (65% from tip end) is at the
      // finger position, adjusted backward by pullback distance.
      //
      // Layout: TIP ----(frontLen)---- GRIP ----(backLen)---- BUTT
      //                                  ^finger
      const cueLen  = Math.min(this.canvas.width, this.canvas.height) * 0.42;
      const frontLen = cueLen * 0.38;  // tip side of grip
      const backLen  = cueLen * 0.62;  // butt side of grip

      // Grip retreats along butt direction when pulling back
      const gripX = fingerPos.x + ba * pullback * 0.6;
      const gripY = fingerPos.y + bs * pullback * 0.6;

      // Tip extends TOWARD ball from grip
      tipX = gripX + ca * frontLen;
      tipY = gripY + sa * frontLen;

      // Butt extends AWAY from ball from grip
      endX = gripX - ca * backLen;
      endY = gripY - sa * backLen;
    } else {
      // ── TOUCH MODE: tip near ball, extend backward ──
      const cueLen   = this.canvas.height * 0.45;
      const tipOffset = r + 4 + pullback;
      tipX = cx + ba * tipOffset;   // near ball, in butt direction
      tipY = cy + bs * tipOffset;
      endX = tipX + ba * cueLen;
      endY = tipY + bs * cueLen;
    }

    ctx.save();
    ctx.shadowColor    = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur     = 8;
    ctx.shadowOffsetX  = 3;
    ctx.shadowOffsetY  = 3;

    // Cue body
    ctx.beginPath();
    ctx.moveTo(tipX + perpX * tipW,  tipY + perpY * tipW);
    ctx.lineTo(endX + perpX * buttW, endY + perpY * buttW);
    ctx.lineTo(endX - perpX * buttW, endY - perpY * buttW);
    ctx.lineTo(tipX - perpX * tipW,  tipY - perpY * tipW);
    ctx.closePath();

    const cueGrd = ctx.createLinearGradient(tipX, tipY, endX, endY);
    cueGrd.addColorStop(0,    '#e8d5a3');
    cueGrd.addColorStop(0.06, '#3a8c3a');
    cueGrd.addColorStop(0.12, '#c8a050');
    cueGrd.addColorStop(0.55, '#deb887');
    cueGrd.addColorStop(0.82, '#c8a050');
    cueGrd.addColorStop(1,    '#4a2800');
    ctx.fillStyle = cueGrd;
    ctx.fill();

    // Shine stripe
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.moveTo(tipX + perpX * tipW  * 0.45, tipY + perpY * tipW  * 0.45);
    ctx.lineTo(endX + perpX * buttW * 0.45, endY + perpY * buttW * 0.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Wrap bands
    const bandColors = ['#c8203a', '#1a5ca8', '#c8203a'];
    for (let i = 0; i < 3; i++) {
      const t  = 0.88 + i * 0.035;
      const bx = tipX + (endX - tipX) * t;
      const by = tipY + (endY - tipY) * t;
      const bw2 = tipW + (buttW - tipW) * t;
      ctx.beginPath();
      ctx.moveTo(bx + perpX * bw2, by + perpY * bw2);
      ctx.lineTo(bx - perpX * bw2, by - perpY * bw2);
      ctx.strokeStyle = bandColors[i];
      ctx.lineWidth   = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Draw an arc power indicator around the cue ball. */
  drawPowerArc(cueBall, angle, power) {
    if (!cueBall || cueBall.pocketed || power <= 0) return;
    const ctx = this.ctx;
    const r = cueBall.r + 8;
    // Arc from (angle+PI - 0.4) sweeping clockwise by power * 1.2 rad
    const start = angle + Math.PI - 0.6;
    const end   = start + power * 1.2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cueBall.x, cueBall.y, r, start, end);
    const arcColor = power > 0.7 ? '#ff5533' : power > 0.4 ? '#ffaa22' : '#55ee88';
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = arcColor;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.restore();
  }

  drawGhostBall(cueBall, angle, pockets, balls) {
    if (!cueBall || cueBall.pocketed) return;
    const ctx = this.ctx;
    // Ray cast from cue ball in aim direction
    const r = cueBall.r;
    const dx = Math.cos(angle), dy = Math.sin(angle);

    // Find first intersection with wall or ball
    let minT = Infinity;
    let hitType = 'wall';
    let hitBall = null;

    const { x: tx, y: ty, w: tw, h: th } = this._tableRect;

    // Wall intersections (parametric ray)
    const walls = [
      { t: (tx + r - cueBall.x) / dx },
      { t: (tx + tw - r - cueBall.x) / dx },
      { t: (ty + r - cueBall.y) / dy },
      { t: (ty + th - r - cueBall.y) / dy },
    ];
    for (const w of walls) {
      if (w.t > 1 && w.t < minT) minT = w.t;
    }

    // Ball intersections
    for (const b of balls) {
      if (b === cueBall || b.pocketed) continue;
      // Quadratic for ray-circle
      const fx = cueBall.x - b.x, fy = cueBall.y - b.y;
      const a = 1;
      const bCoef = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - (r * 2) * (r * 2);
      const disc = bCoef * bCoef - 4 * a * c;
      if (disc >= 0) {
        const t = (-bCoef - Math.sqrt(disc)) / 2;
        if (t > 0.1 && t < minT) {
          minT = t;
          hitType = 'ball';
          hitBall = b;
        }
      }
    }

    if (minT === Infinity) return;

    const ghostX = cueBall.x + dx * minT;
    const ghostY = cueBall.y + dy * minT;

    // Trajectory line
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cueBall.x, cueBall.y);
    ctx.lineTo(ghostX, ghostY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ghost ball
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(ghostX, ghostY, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  setTableRect(tableRect) {
    this._tableRect = tableRect;
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }
  }

  drawHUD(shotCount, timeLeft, isFirstShot, cameraEnabled) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    // Top bar bg
    ctx.save();
    const barH = 52;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, barH);
    ctx.restore();

    // Timer
    const tColor = timeLeft <= 20 ? '#ff4444' : '#e8d5a3';
    ctx.save();
    ctx.font = 'bold 22px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tColor;
    const mins = Math.floor(timeLeft / 60);
    const secs = Math.floor(timeLeft % 60);
    ctx.fillText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, W / 2, 26);
    ctx.restore();

    // Shot count
    ctx.save();
    ctx.font = '15px "PingFang SC", Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#aaa';
    ctx.fillText(`杆数: ${shotCount}`, 14, 26);
    ctx.restore();

    // Camera indicator
    if (cameraEnabled) {
      ctx.save();
      ctx.font = '13px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#4caf50';
      ctx.fillText('📷 感应中', W - 14, 26);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = '13px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#888';
      ctx.fillText('触控模式', W - 14, 26);
      ctx.restore();
    }

    // First shot hint
    if (isFirstShot) {
      ctx.save();
      ctx.font = '14px "PingFang SC", Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,220,100,0.9)';
      ctx.fillText('第1杆：自由球', W / 2, barH + 18);
      ctx.restore();
    }
  }

  drawMenu(W, H, animT) {
    const ctx = this.ctx;

    // Starfield background
    ctx.save();
    const bgGrd = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H));
    bgGrd.addColorStop(0, '#1a2a3a');
    bgGrd.addColorStop(1, '#050a10');
    ctx.fillStyle = bgGrd;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Decorative table preview (mini)
    ctx.save();
    const tw = Math.min(W * 0.7, 900), th = tw * 0.55;
    const tx = (W - tw) / 2, ty = H * 0.28;
    ctx.fillStyle = '#2e8040';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 10;
    ctx.strokeRect(tx - 5, ty - 5, tw + 10, th + 10);
    // Pulsing cue ball
    const pulse = Math.sin(animT * 2) * 0.15 + 1;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 20 * pulse;
    const ballGrd = ctx.createRadialGradient(tx + tw * 0.3 - 4, ty + th / 2 - 4, 2, tx + tw * 0.3, ty + th / 2, 14);
    ballGrd.addColorStop(0, '#fff');
    ballGrd.addColorStop(1, '#ccc');
    ctx.beginPath();
    ctx.arc(tx + tw * 0.3, ty + th / 2, 14 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = ballGrd;
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // Title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Glow effect
    ctx.shadowColor = 'rgba(46,128,64,0.8)';
    ctx.shadowBlur = 30;
    ctx.font = `bold ${Math.min(112, Math.round(W * 0.12))}px "PingFang SC", "Microsoft YaHei", Arial`;
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText('一指清台', W / 2, H * 0.13);
    ctx.shadowBlur = 0;
    ctx.font = `${Math.min(34, Math.round(W * 0.04))}px "PingFang SC", Arial`;
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    ctx.fillText('隔空击球  台球对决', W / 2, H * 0.2);
    ctx.restore();

    // Start button
    const btnW = Math.min(W * 0.55, 720), btnH = 54;
    const btnX = (W - btnW) / 2, btnY = H * 0.72;
    ctx.save();
    const btnGrd = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrd.addColorStop(0, '#3aad5c');
    btnGrd.addColorStop(1, '#1e7a38');
    ctx.shadowColor = 'rgba(46,200,80,0.4)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 27);
    ctx.fillStyle = btnGrd;
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,255,120,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = `bold ${Math.min(46, Math.round(W * 0.06))}px "PingFang SC", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('开始游戏', W / 2, btnY + btnH / 2);
    ctx.restore();

    // Instructions
    ctx.save();
    ctx.font = `${Math.min(24, Math.round(W * 0.034))}px "PingFang SC", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(180,180,180,0.7)';
    ctx.fillText('停稳手掌锁定瞄准  握拳击球  或直接触摸拖拽', W / 2, H * 0.84);
    ctx.fillText(`限时 ${CONFIG.TIME_LIMIT} 秒  用最少杆数清台`, W / 2, H * 0.89);
    ctx.restore();

    return { btnX, btnY, btnW, btnH };
  }

  drawEndScreen(won, shotCount, timeUsed, W, H) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);

    const cardW = W * 0.82, cardH = H * 0.55;
    const cardX = (W - cardW) / 2, cardY = (H - cardH) / 2;

    const cardGrd = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    if (won) {
      cardGrd.addColorStop(0, '#1a3a25');
      cardGrd.addColorStop(1, '#0d1a10');
    } else {
      cardGrd.addColorStop(0, '#3a1a1a');
      cardGrd.addColorStop(1, '#1a0d0d');
    }
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 20);
    ctx.fillStyle = cardGrd;
    ctx.fill();
    ctx.strokeStyle = won ? 'rgba(80,200,100,0.4)' : 'rgba(200,80,80,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Main result text
    ctx.font = `bold ${Math.round(W * 0.1)}px "PingFang SC", Arial`;
    ctx.fillStyle = won ? '#5cdb7a' : '#db5c5c';
    ctx.fillText(won ? '🏆 清台成功！' : '⏰ 时间到！', W / 2, cardY + cardH * 0.22);

    // Score
    const score = won ? Math.max(0, Math.round(1000 - shotCount * 50 - timeUsed * 3)) : 0;
    ctx.font = `bold ${Math.round(W * 0.13)}px Arial`;
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(score, W / 2, cardY + cardH * 0.45);
    ctx.font = `${Math.round(W * 0.04)}px "PingFang SC", Arial`;
    ctx.fillStyle = '#aaa';
    ctx.fillText('得分', W / 2, cardY + cardH * 0.57);

    // Stats
    ctx.font = `${Math.round(W * 0.038)}px "PingFang SC", Arial`;
    ctx.fillStyle = '#ccc';
    ctx.fillText(`共用 ${shotCount} 杆  |  耗时 ${Math.floor(timeUsed)}s`, W / 2, cardY + cardH * 0.7);

    // Replay button
    const btnW = cardW * 0.55, btnH = 48;
    const btnX = (W - btnW) / 2, btnY = cardY + cardH * 0.82;
    const btnGrd2 = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrd2.addColorStop(0, won ? '#3aad5c' : '#8a3a3a');
    btnGrd2.addColorStop(1, won ? '#1e7a38' : '#5a1e1e');
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 24);
    ctx.fillStyle = btnGrd2;
    ctx.fill();
    ctx.font = `bold ${Math.round(W * 0.055)}px "PingFang SC", Arial`;
    ctx.fillStyle = '#fff';
    ctx.fillText('再来一局', W / 2, btnY + btnH / 2);
    ctx.restore();

    return { btnX, btnY, btnW, btnH };
  }

  /** Draw the finger hover cursor (camera mode).
   * @param {Object} pos       - {x, y} screen position
   * @param {number} rippleT   - 0→1 ripple animation progress (0 = just detected)
   */
  drawFingerCursor(pos, rippleT = 1, locked = false) {
    if (!pos) return;
    const ctx = this.ctx;

    // Expanding ripple ring (fresh detection burst)
    if (rippleT < 1) {
      const ringR  = 18 + rippleT * 48;
      const ringA  = (1 - rippleT) * 0.7;
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = locked
        ? `rgba(80,210,255,${ringA})`
        : `rgba(80,255,140,${ringA})`;
      ctx.lineWidth = 3 * (1 - rippleT);
      ctx.shadowColor = locked
        ? `rgba(80,210,255,${ringA * 0.8})`
        : `rgba(80,255,140,${ringA * 0.8})`;
      ctx.shadowBlur  = 12;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    // Glow
    const grd = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 28);
    grd.addColorStop(0,   locked ? 'rgba(90,210,255,0.8)' : 'rgba(255,220,80,0.75)');
    grd.addColorStop(0.5, locked ? 'rgba(70,170,255,0.36)' : 'rgba(255,180,40,0.35)');
    grd.addColorStop(1,   locked ? 'rgba(70,170,255,0)' : 'rgba(255,180,40,0)');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 28, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    // Outer ring
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
    ctx.strokeStyle = locked ? 'rgba(110,220,255,0.95)' : 'rgba(255,220,80,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Dot centre
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw camera interaction guide overlay.
   *
   * @param {boolean} fingerPresent  - finger detected THIS frame
   * @param {boolean} everDetected   - finger has been detected at least once
   * @param {number}  detectedAt     - performance.now() when finger was first detected (0 = never)
   * @param {number}  animT          - global animation time (seconds)
   * @param {number}  W, H           - canvas dimensions
   */
  drawCameraGuide(fingerPresent, everDetected, detectedAt, animT, W, H, lockProgress = 0, aimLocked = false) {
    const ctx = this.ctx;
    const now = performance.now();

    // ── 1. Waiting state: pulsing instruction strip ────────────────────────
    if (!everDetected) {
      // Semi-transparent backdrop pill at bottom
      const pillW = Math.min(W * 0.88, 380);
      const pillH = 56;
      const pillX = (W - pillW) / 2;
      const pillY = H - pillH - 28;

      ctx.save();

      // Pulsing glow behind pill
      const pulse = Math.sin(animT * 2.8) * 0.5 + 0.5; // 0→1
      ctx.shadowColor = `rgba(80,200,255,${0.25 + pulse * 0.3})`;
      ctx.shadowBlur  = 20 + pulse * 10;

      const pillGrd = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
      pillGrd.addColorStop(0, 'rgba(20,60,90,0.88)');
      pillGrd.addColorStop(1, 'rgba(10,30,50,0.92)');
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fillStyle = pillGrd;
      ctx.fill();

      // Border
      ctx.strokeStyle = `rgba(80,180,255,${0.35 + pulse * 0.35})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Camera icon (animated brightness)
      ctx.save();
      ctx.font = `${Math.round(pillH * 0.52)}px Arial`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      ctx.fillText('📷', pillX + 16, pillY + pillH / 2);
      ctx.restore();

      // Text
      ctx.save();
      ctx.font = `${Math.min(16, Math.round(W * 0.037))}px "PingFang SC", Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#c8e8ff';
      ctx.fillText('请将手掌举在摄像头前方', W / 2 + 14, pillY + pillH * 0.38);
      ctx.font = `${Math.min(12, Math.round(W * 0.028))}px "PingFang SC", Arial`;
      ctx.fillStyle = 'rgba(160,210,255,0.7)';
      ctx.fillText('停稳 2 秒锁定瞄准，锁定后握拳击球', W / 2 + 14, pillY + pillH * 0.7);
      ctx.restore();
      return;
    }

    // ── 2. First-detection flash: green success pill ───────────────────────
    const flashDur = 1800; // ms
    const elapsed  = now - detectedAt;
    if (elapsed < flashDur) {
      const t   = elapsed / flashDur;           // 0→1
      // Ease: quick in, slow out
      const eased = 1 - Math.pow(t, 2.5);
      const alpha = eased * (t < 0.15 ? t / 0.15 : 1); // fade in fast

      const pillW = Math.min(W * 0.7, 280);
      const pillH = 50;
      const pillX = (W - pillW) / 2;
      // Rise upward from bottom over time
      const pillY = H - pillH - 28 - t * 30;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Green glow
      ctx.shadowColor = 'rgba(50,220,100,0.6)';
      ctx.shadowBlur  = 24;
      const pillGrd = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
      pillGrd.addColorStop(0, 'rgba(30,120,60,0.95)');
      pillGrd.addColorStop(1, 'rgba(15,80,35,0.95)');
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fillStyle = pillGrd;
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,255,130,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.round(W * 0.042)}px "PingFang SC", Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#aaffc8';
      ctx.shadowColor = 'rgba(80,255,130,0.4)';
      ctx.shadowBlur  = 8;
      ctx.fillText('✅ 感应到手掌！', W / 2, pillY + pillH / 2);
      ctx.restore();
    }

    // ── 3. Active state: ripple ring at finger cursor position ─────────────
    if (fingerPresent) {
      const pillW = Math.min(W * 0.82, 360);
      const pillH = 58;
      const pillX = (W - pillW) / 2;
      const pillY = H - pillH - 28;
      const progress = Utils.clamp(lockProgress, 0, 1);
      const pulse = Math.sin(animT * 4) * 0.5 + 0.5;

      ctx.save();
      ctx.shadowColor = aimLocked ? 'rgba(80,220,255,0.45)' : 'rgba(255,210,90,0.32)';
      ctx.shadowBlur = aimLocked ? 22 : 14 + pulse * 6;
      const pillGrd = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
      pillGrd.addColorStop(0, aimLocked ? 'rgba(20,70,95,0.92)' : 'rgba(58,45,20,0.9)');
      pillGrd.addColorStop(1, aimLocked ? 'rgba(9,36,56,0.95)' : 'rgba(34,25,12,0.94)');
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fillStyle = pillGrd;
      ctx.fill();
      ctx.strokeStyle = aimLocked ? 'rgba(110,230,255,0.5)' : 'rgba(255,220,120,0.38)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const barX = pillX + 24;
      const barY = pillY + pillH - 13;
      const barW = pillW - 48;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, 4, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * (aimLocked ? 1 : progress), 4, 2);
      ctx.fillStyle = aimLocked ? '#72dcff' : '#ffd76a';
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.min(16, Math.round(W * 0.036))}px "PingFang SC", Arial`;
      ctx.fillStyle = aimLocked ? '#bff4ff' : '#fff2c8';
      ctx.fillText(aimLocked ? '瞄准已锁定' : '停稳 2 秒锁定瞄准', W / 2, pillY + 22);
      ctx.font = `${Math.min(13, Math.round(W * 0.026))}px "PingFang SC", Arial`;
      ctx.fillStyle = aimLocked ? 'rgba(190,240,255,0.72)' : 'rgba(255,236,190,0.72)';
      ctx.fillText(aimLocked ? '握拳击球' : '锁定后握拳击球', W / 2, pillY + 40);
      ctx.restore();
    }

    // (handled in drawFingerCursor; tiny status dot in corner shown in HUD)
  }

  /**
   * Full-screen calibration overlay shown in CALIBRATE state.
   * @param {HTMLVideoElement} videoEl
   * @param {boolean} fingerDetected  - finger seen this frame
   * @param {number}  progress        - 0→1 detection confidence
   * @param {boolean} success         - progress reached 1
   * @param {number}  animT           - global timer (s)
   * @param {number}  W, H
   */
  drawCalibrationScreen(videoEl, fingerDetected, progress, success, animT, W, H) {
    const ctx  = this.ctx;
    const now  = performance.now();

    // Dark backdrop
    ctx.save();
    const bgGrd = ctx.createRadialGradient(W/2, H*0.38, 0, W/2, H*0.38, Math.max(W,H)*0.8);
    bgGrd.addColorStop(0, '#0f1e2e');
    bgGrd.addColorStop(1, '#050a10');
    ctx.fillStyle = bgGrd;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Floating particle dots
    ctx.save();
    for (let i = 0; i < 18; i++) {
      const px = W * ((Math.sin(i * 2.7 + animT * 0.4) + 1) / 2);
      const py = H * ((Math.cos(i * 1.9 + animT * 0.3) + 1) / 2);
      const pr = 1.5 + Math.sin(i + animT) * 1;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(80,160,255,${0.12 + Math.sin(i + animT) * 0.06})`;
      ctx.fill();
    }
    ctx.restore();

    // Title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(W * 0.075)}px "PingFang SC", Arial`;
    ctx.fillStyle = '#e8d5a3';
    ctx.shadowColor = 'rgba(46,128,64,0.6)';
    ctx.shadowBlur  = 20;
    ctx.fillText('一指清台', W / 2, H * 0.08);
    ctx.restore();

    // ── Camera circle ─────────────────────────────────────────────────────
    const circR  = Math.min(W, H) * 0.28;
    const circX  = W / 2;
    const circY  = H * 0.38;

    // Outer scanning ring (rotating)
    const scanSpeed = success ? 0 : 1.8;
    const scanAngle = animT * scanSpeed;
    for (let i = 0; i < 3; i++) {
      const a     = scanAngle + (i * Math.PI * 2) / 3;
      const alpha = success ? 0.3 : (fingerDetected ? 0.55 : 0.25);
      const ringR = circR + 18 + i * 10;
      ctx.save();
      ctx.beginPath();
      ctx.arc(circX, circY, ringR, a, a + Math.PI * 0.55);
      ctx.strokeStyle = fingerDetected
        ? `rgba(60,220,100,${alpha - i*0.1})`
        : `rgba(60,140,255,${alpha - i*0.1})`;
      ctx.lineWidth = 3 - i * 0.5;
      ctx.lineCap   = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // Progress arc (fills clockwise as detection progresses)
    if (progress > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(circX, circY, circR + 8,
              -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.strokeStyle = success ? '#44ee88' :
                        fingerDetected ? '#66ccff' : '#4488ff';
      ctx.lineWidth  = 5;
      ctx.lineCap    = 'round';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur  = 10;
      ctx.stroke();
      ctx.restore();
    }

    // Camera video circle clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(circX, circY, circR, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1520';
    ctx.fill();
    if (videoEl && videoEl.readyState >= 2) {
      ctx.save();
      ctx.clip();
      // Mirror front cam
      ctx.translate(circX + circR, circY - circR);
      ctx.scale(-1, 1);
      ctx.drawImage(videoEl, 0, 0, circR * 2, circR * 2);
      ctx.restore();
    } else {
      // Camera not ready: show icon
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(circR * 0.55)}px Arial`;
      ctx.fillStyle = 'rgba(100,160,220,0.5)';
      ctx.fillText('📷', circX, circY);
    }

    // Success green overlay
    if (success) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(circX, circY, circR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,180,80,0.35)';
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(circR * 0.65)}px Arial`;
      ctx.fillText('✅', circX, circY);
      ctx.restore();
    }

    // Circle border
    ctx.save();
    ctx.beginPath();
    ctx.arc(circX, circY, circR, 0, Math.PI * 2);
    ctx.strokeStyle = fingerDetected
      ? (success ? 'rgba(60,220,100,0.9)' : 'rgba(60,200,120,0.7)')
      : 'rgba(60,120,200,0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ── Text below circle ─────────────────────────────────────────────────
    const textY = circY + circR + 36;
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    if (success) {
      ctx.font = `bold ${Math.round(W * 0.055)}px "PingFang SC", Arial`;
      ctx.fillStyle   = '#66ffaa';
      ctx.shadowColor = 'rgba(60,220,100,0.5)';
      ctx.shadowBlur  = 14;
      ctx.fillText('识别成功！即将开始…', W / 2, textY);
    } else if (fingerDetected) {
      ctx.font = `bold ${Math.round(W * 0.048)}px "PingFang SC", Arial`;
      ctx.fillStyle   = '#66ddff';
      ctx.shadowColor = 'rgba(60,160,255,0.4)';
      ctx.shadowBlur  = 10;
      ctx.fillText('✓ 检测到手掌，保持不动…', W / 2, textY);
      // Progress percentage
      ctx.font      = `${Math.round(W * 0.036)}px Arial`;
      ctx.fillStyle = 'rgba(100,210,255,0.7)';
      ctx.shadowBlur = 0;
      ctx.fillText(`${Math.round(progress * 100)}%`, W / 2, textY + 34);
    } else {
      // Pulse opacity
      const pulse = Math.sin(animT * 2.2) * 0.25 + 0.75;
      ctx.font = `bold ${Math.round(W * 0.048)}px "PingFang SC", Arial`;
      ctx.fillStyle   = `rgba(160,210,255,${pulse})`;
      ctx.shadowColor = `rgba(60,140,255,${pulse * 0.4})`;
      ctx.shadowBlur  = 12;
      ctx.fillText('请将手掌举在摄像头前方', W / 2, textY);
      ctx.font      = `${Math.round(W * 0.032)}px "PingFang SC", Arial`;
      ctx.fillStyle = `rgba(120,180,230,${pulse * 0.7})`;
      ctx.shadowBlur = 0;
      ctx.fillText('✋  张开手掌，靠近前置摄像头', W / 2, textY + 34);
    }
    ctx.restore();

    // ── Bottom hint ───────────────────────────────────────────────────────
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `${Math.round(W * 0.03)}px "PingFang SC", Arial`;
    ctx.fillStyle    = 'rgba(140,160,180,0.55)';
    ctx.fillText('识别后自动进入游戏  ·  停稳 2 秒锁定瞄准  ·  握拳击球', W / 2, H * 0.9);
    ctx.restore();
  }

  drawCameraPreview(videoEl, x, y, w, h) {
    if (!videoEl || videoEl.readyState < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.clip();
    // Mirror for selfie cam
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, 0, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.stroke();
    ctx.restore();
  }
}
