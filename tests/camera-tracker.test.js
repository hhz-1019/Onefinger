'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

const sandbox = {
  console,
  CONFIG: {
    CUE_MAX_PULLBACK: 60,
    MIN_SKIN_PIXELS: 120,
    SKIN_H_MIN: 0,
    SKIN_H_MAX: 35,
    SKIN_S_MIN: 0.15,
    SKIN_S_MAX: 0.90,
    SKIN_V_MIN: 0.35,
    SKIN_V_MAX: 1.0,
  },
  Utils: {
    clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    },
    rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      const s = max === 0 ? 0 : d / max;
      if (max !== min) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }
      return { h: h * 360, s, v: max };
    },
  },
  document: {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() {
              return { data: new Uint8ClampedArray(160 * 120 * 4) };
            },
          };
        },
      };
    },
  },
  window: {},
};

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, 'js/camera.js'), 'utf8') +
    '\nglobalThis.CameraTracker = CameraTracker;',
  sandbox,
  { filename: 'js/camera.js' },
);

const CameraTracker = sandbox.CameraTracker;

function makeLandmarks(overrides = {}) {
  return Array.from({ length: 21 }, (_, i) => ({
    x: overrides[i]?.x ?? 0.5,
    y: overrides[i]?.y ?? 0.5,
    z: overrides[i]?.z ?? 0,
  }));
}

function makeOpenHandLandmarks() {
  return makeLandmarks({
    0: { x: 0.5, y: 0.78 },
    5: { x: 0.38, y: 0.56 },
    9: { x: 0.5, y: 0.52 },
    13: { x: 0.62, y: 0.56 },
    17: { x: 0.72, y: 0.62 },
    8: { x: 0.34, y: 0.20 },
    12: { x: 0.5, y: 0.16 },
    16: { x: 0.66, y: 0.21 },
    20: { x: 0.78, y: 0.30 },
  });
}

function makeFistLandmarks() {
  return makeLandmarks({
    0: { x: 0.5, y: 0.78 },
    5: { x: 0.38, y: 0.56 },
    9: { x: 0.5, y: 0.52 },
    13: { x: 0.62, y: 0.56 },
    17: { x: 0.72, y: 0.62 },
    8: { x: 0.43, y: 0.58 },
    12: { x: 0.51, y: 0.57 },
    16: { x: 0.59, y: 0.59 },
    20: { x: 0.67, y: 0.62 },
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('maps MediaPipe palm landmarks to mirrored screen coordinates', () => {
  const tracker = new CameraTracker();

  const pos = tracker._updateHandFromLandmarks(makeOpenHandLandmarks(), 1000, 500);

  assert.equal(Math.round(pos.x), 456);
  assert.equal(Math.round(pos.y), 304);
  assert.equal(Math.round(tracker.fingerPos.x), 456);
  assert.equal(Math.round(tracker.fingerPos.y), 304);
  assert.equal(tracker.isFist, false);
});

test('uses skin detection fallback while MediaPipe has not found a full hand', () => {
  const tracker = new CameraTracker();
  tracker.enabled = true;
  tracker.video = { readyState: 2 };
  tracker.handTrackingReady = true;
  tracker.hands = { send() {} };
  tracker._processSkinFrame = () => tracker._setFingerPosition({ x: 360, y: 180 });

  const pos = tracker.processFrame(720, 360);

  assert.equal(pos.x, 360);
  assert.equal(pos.y, 180);
  assert.equal(tracker.fingerPos.x, 360);
  assert.equal(tracker.fingerPos.y, 180);
});

test('detects a cue stroke only after pullback followed by a forward thrust', () => {
  const tracker = new CameraTracker();

  tracker._setFingerPosition({ x: 300, y: 100 });
  tracker.updateStroke(0);
  tracker._setFingerPosition({ x: 294, y: 100 });
  tracker.updateStroke(0);
  tracker._setFingerPosition({ x: 288, y: 100 });
  tracker.updateStroke(0);
  tracker._setFingerPosition({ x: 282, y: 100 });
  tracker.updateStroke(0);

  assert.equal(tracker.detectShot(), null);
  assert.ok(tracker.getPullback() > 8);

  tracker._setFingerPosition({ x: 306, y: 100 });
  tracker.updateStroke(0);

  assert.equal(tracker.detectShot(), 0.5333333333333333);
});

test('detects a fist close as a camera shot trigger', () => {
  const tracker = new CameraTracker();

  tracker._updateHandFromLandmarks(makeOpenHandLandmarks(), 1000, 500);
  assert.equal(tracker.isFist, false);
  assert.equal(tracker.detectShot(), null);

  tracker._updateHandFromLandmarks(makeFistLandmarks(), 1000, 500);

  assert.equal(tracker.isFist, true);
  assert.equal(tracker.detectShot(), 0.72);
  assert.equal(tracker.detectShot(), null);
});
