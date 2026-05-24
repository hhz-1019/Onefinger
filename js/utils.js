'use strict';

const Utils = {
  dist(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  },

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  },

  lightenColor(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))},${Math.min(255, Math.round(g + (255 - g) * amount))},${Math.min(255, Math.round(b + (255 - b) * amount))})`;
  },

  darkenColor(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
  },

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
      h = 0;
    } else {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s, v };
  },

  // Generate a random position inside the table avoiding pockets and other balls
  randomTablePos(tableRect, pockets, existingBalls, radius) {
    const margin = radius * 3;
    const { x, y, w, h } = tableRect;
    let attempts = 0;
    while (attempts < 200) {
      const px = x + margin + Math.random() * (w - margin * 2);
      const py = y + margin + Math.random() * (h - margin * 2);
      let ok = true;
      // Check pockets
      for (const p of pockets) {
        if (Utils.dist(px, py, p.x, p.y) < radius * 4) { ok = false; break; }
      }
      // Check other balls
      if (ok) {
        for (const b of existingBalls) {
          if (Utils.dist(px, py, b.x, b.y) < radius * 2.5) { ok = false; break; }
        }
      }
      if (ok) return { x: px, y: py };
      attempts++;
    }
    return { x: x + w / 2, y: y + h / 2 };
  },
};
