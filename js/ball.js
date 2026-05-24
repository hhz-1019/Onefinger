'use strict';

class Ball {
  constructor(x, y, color, number, isCue = false) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.color = color;
    this.number = number;
    this.isCue = isCue;
    this.pocketed = false;
    this.sinkProgress = 0; // 0→1 animation
    this.r = 14; // will be set dynamically
    this.spin = 0; // visual spin angle
  }

  get isMoving() {
    return Math.abs(this.vx) > CONFIG.MIN_VELOCITY || Math.abs(this.vy) > CONFIG.MIN_VELOCITY;
  }

  update(tableRect) {
    if (this.pocketed) {
      this.sinkProgress = Math.min(1, this.sinkProgress + 0.06);
      return;
    }
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= CONFIG.FRICTION;
    this.vy *= CONFIG.FRICTION;
    if (Math.abs(this.vx) < CONFIG.MIN_VELOCITY) this.vx = 0;
    if (Math.abs(this.vy) < CONFIG.MIN_VELOCITY) this.vy = 0;

    // Spin visual
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.spin += speed * 0.05;

    // Wall bounce
    const { x, y, w, h } = tableRect;
    const minX = x + this.r, maxX = x + w - this.r;
    const minY = y + this.r, maxY = y + h - this.r;
    if (this.x < minX) { this.x = minX; this.vx = Math.abs(this.vx) * CONFIG.RESTITUTION; }
    if (this.x > maxX) { this.x = maxX; this.vx = -Math.abs(this.vx) * CONFIG.RESTITUTION; }
    if (this.y < minY) { this.y = minY; this.vy = Math.abs(this.vy) * CONFIG.RESTITUTION; }
    if (this.y > maxY) { this.y = maxY; this.vy = -Math.abs(this.vy) * CONFIG.RESTITUTION; }
  }

  draw(ctx) {
    if (this.pocketed) return;
    const r = this.r;
    ctx.save();

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    // Base gradient
    const grd = ctx.createRadialGradient(
      this.x - r * 0.35, this.y - r * 0.35, r * 0.05,
      this.x, this.y, r
    );
    if (this.isCue) {
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.5, '#f5f5f5');
      grd.addColorStop(1, '#cccccc');
    } else {
      grd.addColorStop(0, Utils.lightenColor(this.color, 0.55));
      grd.addColorStop(0.55, this.color);
      grd.addColorStop(1, Utils.darkenColor(this.color, 0.45));
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.restore();

    // Number label (no shadow here)
    if (!this.isCue) {
      // White circle background for number
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.font = `bold ${Math.round(r * 0.7)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#222';
      ctx.fillText(this.number, this.x, this.y + 0.5);
      ctx.restore();
    }

    // Specular highlight
    ctx.save();
    const hl = ctx.createRadialGradient(
      this.x - r * 0.28, this.y - r * 0.3, 0,
      this.x - r * 0.2, this.y - r * 0.2, r * 0.45
    );
    hl.addColorStop(0, 'rgba(255,255,255,0.55)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();
    ctx.restore();
  }

  sink(centerX, centerY, ctx) {
    if (!this.pocketed || this.sinkProgress >= 1) return;
    const t = this.sinkProgress;
    const r = this.r * (1 - t * 0.8);
    const alpha = 1 - t;
    ctx.save();
    ctx.globalAlpha = alpha;
    const grd = ctx.createRadialGradient(
      centerX - r * 0.3, centerY - r * 0.3, r * 0.1,
      centerX, centerY, r
    );
    if (this.isCue) {
      grd.addColorStop(0, '#fff');
      grd.addColorStop(1, '#ccc');
    } else {
      grd.addColorStop(0, Utils.lightenColor(this.color, 0.5));
      grd.addColorStop(1, this.color);
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(0, r), 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.restore();
  }
}
