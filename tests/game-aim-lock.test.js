'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

let now = 0;
const sandbox = {
  console,
  performance: {
    now: () => now,
  },
  CONFIG: {
    CUE_MAX_PULLBACK: 60,
  },
  Utils: {
    angle(x1, y1, x2, y2) {
      return Math.atan2(y2 - y1, x2 - x1);
    },
    clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    },
  },
  window: {
    addEventListener() {},
  },
};

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, 'js/game.js'), 'utf8') +
    '\nglobalThis.Game = Game;',
  sandbox,
  { filename: 'js/game.js' },
);

const Game = sandbox.Game;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

function makeGame(frames, shotFrames = []) {
  const shots = [];
  const game = Object.create(Game.prototype);
  game.canvas = { width: 1000, height: 800 };
  game.camera = {
    enabled: true,
    setAimAngle(angle) { this.lastAimAngle = angle; },
    updateStroke(angle) { this.lastStrokeAngle = angle; },
    getPullback() { return 0; },
    processFrame() { return frames.shift() || null; },
    detectShot() { return shotFrames.shift() ?? null; },
  };
  game.cueBall = { x: 500, y: 400, pocketed: false };
  game._anyMoving = () => false;
  game._fireShot = (angle, power) => shots.push({ angle, power });
  game._fingerPos = null;
  game._fingerEverDetected = false;
  game._fingerDetectedAt = 0;
  game._fingerRippleT = 1;
  game._aimLocked = false;
  game._aimLockPos = null;
  game._aimLockStartedAt = 0;
  game._aimLockProgress = 0;
  game._aimLockAngle = 0;
  game.aimAngle = 0;
  game.aimPower = 0;
  game.pullback = 0;
  return { game, shots };
}

test('keeps the locked aim angle when a fist shifts the palm center', () => {
  const { game, shots } = makeGame(
    [
      { x: 300, y: 400 },
      { x: 300, y: 400 },
      { x: 300, y: 400 },
      { x: 420, y: 500 },
    ],
    [null, null, null, 0.72],
  );

  now = 0;
  game._processCameraInput();
  now = 1000;
  game._processCameraInput();
  now = 2000;
  game._processCameraInput();
  now = 2100;
  game._processCameraInput();

  assert.equal(shots.length, 1);
  assert.equal(shots[0].power, 0.72);
  assert.equal(shots[0].angle, 0);
  assert.equal(game._aimLocked, false);
});

test('ignores a fist shot before the aim has locked', () => {
  const { game, shots } = makeGame(
    [
      { x: 300, y: 400 },
      { x: 420, y: 500 },
    ],
    [null, 0.72],
  );

  now = 0;
  game._processCameraInput();
  now = 500;
  game._processCameraInput();

  assert.equal(shots.length, 0);
  assert.equal(game._aimLocked, false);
});
