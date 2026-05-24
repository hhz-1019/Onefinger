'use strict';

const CONFIG = {
  // Physics
  FRICTION: 0.987,
  MIN_VELOCITY: 0.15,
  RESTITUTION: 0.92,
  MAX_SHOT_POWER: 22,

  // Table
  BORDER_RATIO: 0.06,   // border width as fraction of table width
  POCKET_RADIUS_RATIO: 0.035,
  BALL_RADIUS_RATIO: 0.022,

  // Game
  TIME_LIMIT: 120,      // seconds
  BALL_COUNT: 9,        // colored balls (excluding cue)

  // Camera skin detection (HSV ranges)
  SKIN_H_MIN: 0, SKIN_H_MAX: 35,
  SKIN_S_MIN: 0.15, SKIN_S_MAX: 0.90,
  SKIN_V_MIN: 0.35, SKIN_V_MAX: 1.0,
  MIN_SKIN_PIXELS: 120,

  // Cue
  CUE_LENGTH_RATIO: 0.55,
  CUE_MAX_PULLBACK: 60,

  BALL_COLORS: [
    '#f5c518', // yellow
    '#e74c3c', // red
    '#2980b9', // blue
    '#8e44ad', // purple
    '#e67e22', // orange
    '#27ae60', // green
    '#c0392b', // dark red
    '#1abc9c', // teal
    '#2c3e50', // dark blue
  ],
};
