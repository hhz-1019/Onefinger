'use strict';

class CameraTracker {
  constructor() {
    this.video = null;
    this.offCanvas = document.createElement('canvas');
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true });
    this.enabled = false;

    // Public control-point state. In camera mode this is the palm center;
    // in skin fallback mode it is the detected skin centroid.
    this.fingerPos = null;       // {x, y} in screen coords
    this.prevPos = null;
    this.velocity = { x: 0, y: 0 };
    this.isFist = false;

    // Stroke (out-cue) mechanics
    this._pullback = 0;          // current pullback distance (px)
    this._maxPullback = 0;       // peak pullback in this stroke cycle
    this._aimAngle = 0;          // updated each frame by game
    this._lastAxialVel = 0;
    this._shotCooldown = 0;      // frames until next shot allowed
    this._noFingerFrames = 0;    // consecutive frames without finger
    this._positionVersion = 0;
    this._strokeVersion = 0;
    this._fistShotQueued = false;

    this._frameW = 160;
    this._frameH = 120;

    // MediaPipe Hands state. If the library is unavailable, fall back to the
    // old skin-color detector so the touch game remains playable.
    this.hands = null;
    this.handTrackingReady = false;
    this.handTrackingFailed = false;
    this._processingHandFrame = false;
    this._screenW = 0;
    this._screenH = 0;
  }

  // ── Camera lifecycle ────────────────────────────────────────────────────────
  async start(videoEl) {
    this.video = videoEl;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      this.offCanvas.width  = this._frameW;
      this.offCanvas.height = this._frameH;
      await this._initHandTracking();
      this.enabled = true;
      return true;
    } catch (e) {
      console.warn('Camera unavailable:', e);
      this.enabled = false;
      return false;
    }
  }

  stop() {
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
    if (this.hands && typeof this.hands.close === 'function') {
      try { this.hands.close(); } catch (_) {}
    }
    this.hands = null;
    this.handTrackingReady = false;
    this.enabled = false;
  }

  // ── Called by game each frame to supply current aim angle ──────────────────
  setAimAngle(angle) {
    this._aimAngle = angle;
  }

  async _initHandTracking() {
    const HandsCtor =
      (typeof Hands !== 'undefined' && Hands)
      || (typeof window !== 'undefined' && window.Hands);

    if (!HandsCtor) return false;

    try {
      this.hands = new HandsCtor({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.55,
      });
      this.hands.onResults(results => this._handleHandResults(results));
      this.handTrackingReady = true;
      return true;
    } catch (e) {
      console.warn('Hand tracking unavailable, falling back to skin detection:', e);
      this.handTrackingFailed = true;
      this.handTrackingReady = false;
      this.hands = null;
      return false;
    }
  }

  // ── Main per-frame processing ───────────────────────────────────────────────
  /**
   * Detect finger via skin-color, map to screen coords.
   * Also updates pullback based on axial (along-cue) movement.
   * Returns {x, y} in screen coords, or null.
   */
  processFrame(screenW, screenH) {
    if (!this.enabled || !this.video || this.video.readyState < 2) return null;

    this._screenW = screenW;
    this._screenH = screenH;

    if (this.handTrackingReady) {
      this._queueHandFrame();
      const skinPos = this._processSkinFrame(screenW, screenH);
      return this.fingerPos || skinPos;
    }

    return this._processSkinFrame(screenW, screenH);
  }

  _queueHandFrame() {
    if (this._processingHandFrame || !this.hands) return;

    this._processingHandFrame = true;
    Promise.resolve(this.hands.send({ image: this.video }))
      .catch(e => {
        console.warn('Hand tracking frame failed, falling back to skin detection:', e);
        this.handTrackingFailed = true;
        this.handTrackingReady = false;
      })
      .finally(() => {
        this._processingHandFrame = false;
      });
  }

  _handleHandResults(results) {
    const hands = results && results.multiHandLandmarks;
    const landmarks = hands && hands[0];
    if (!landmarks) {
      this._handleNoFingerFrame();
      return;
    }

    this._updateHandFromLandmarks(landmarks, this._screenW, this._screenH);
  }

  _updateFingerFromLandmarks(landmarks, screenW, screenH) {
    const tip = landmarks && landmarks[8]; // index fingertip
    if (!tip || !screenW || !screenH) return null;

    const x = (1 - Utils.clamp(tip.x, 0, 1)) * screenW;
    const y = Utils.clamp(tip.y, 0, 1) * screenH;
    return this._setFingerPosition({ x, y });
  }

  _updateHandFromLandmarks(landmarks, screenW, screenH) {
    if (!landmarks || !screenW || !screenH) return null;
    const palmIndexes = [0, 5, 9, 13, 17];
    const palmPoints = palmIndexes
      .map(index => landmarks[index])
      .filter(Boolean);
    if (palmPoints.length < 3) return null;

    const palm = palmPoints.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }), { x: 0, y: 0 });
    palm.x /= palmPoints.length;
    palm.y /= palmPoints.length;

    this._setFistState(this._detectFist(landmarks, palm));

    return this._setFingerPosition({
      x: (1 - Utils.clamp(palm.x, 0, 1)) * screenW,
      y: Utils.clamp(palm.y, 0, 1) * screenH,
    });
  }

  _detectFist(landmarks, palm) {
    const palmBase = palm || this._averageLandmarks(landmarks, [0, 5, 9, 13, 17]);
    if (!palmBase) return false;
    const palmRefs = [5, 9, 13, 17].map(index => landmarks[index]).filter(Boolean);
    const tips = [8, 12, 16, 20].map(index => landmarks[index]).filter(Boolean);
    if (palmRefs.length < 3 || tips.length < 3) return false;

    const palmRadius = palmRefs.reduce((sum, point) => sum + this._landmarkDistance(point, palmBase), 0) / palmRefs.length;
    const tipDistance = tips.reduce((sum, point) => sum + this._landmarkDistance(point, palmBase), 0) / tips.length;
    return tipDistance < palmRadius * 1.25;
  }

  _averageLandmarks(landmarks, indexes) {
    const points = indexes.map(index => landmarks[index]).filter(Boolean);
    if (!points.length) return null;
    const total = points.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }), { x: 0, y: 0 });
    return { x: total.x / points.length, y: total.y / points.length };
  }

  _landmarkDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  _setFistState(isFist) {
    const closedNow = Boolean(isFist);
    if (closedNow && !this.isFist && this._shotCooldown <= 0) {
      this._fistShotQueued = true;
    }
    this.isFist = closedNow;
  }

  _setFingerPosition(pos) {
    this._noFingerFrames = 0;
    this.prevPos = this.fingerPos;
    this.fingerPos = { x: pos.x, y: pos.y };

    if (this.prevPos) {
      this.velocity = {
        x: this.fingerPos.x - this.prevPos.x,
        y: this.fingerPos.y - this.prevPos.y,
      };
    } else {
      this.velocity = { x: 0, y: 0 };
    }

    this._positionVersion++;
    return this.fingerPos;
  }

  _handleNoFingerFrame() {
    this._noFingerFrames++;
    if (this._noFingerFrames > 8) {
      this.fingerPos = null;
      this.prevPos = null;
      this.velocity = { x: 0, y: 0 };
      this._pullback = 0;
      this._maxPullback = 0;
      this._lastAxialVel = 0;
      this.isFist = false;
      this._fistShotQueued = false;
    }
    return null;
  }

  _processSkinFrame(screenW, screenH) {
    const fw = this._frameW, fh = this._frameH;
    this.offCtx.drawImage(this.video, 0, 0, fw, fh);
    const data = this.offCtx.getImageData(0, 0, fw, fh).data;

    let sumX = 0, sumY = 0, count = 0;
    for (let py = 0; py < fh; py++) {
      for (let px = 0; px < fw; px++) {
        const i = (py * fw + px) * 4;
        if (this._isSkin(data[i], data[i + 1], data[i + 2])) {
          sumX += px; sumY += py; count++;
        }
      }
    }

    if (count < CONFIG.MIN_SKIN_PIXELS) {
      return this._handleNoFingerFrame();
    }

    // Mirror X (front camera), map to screen
    const nx = 1 - sumX / (count * fw);
    const ny =     sumY / (count * fh);

    return this._setFingerPosition({ x: nx * screenW, y: ny * screenH });
  }

  // ── Pullback state from axial motion ───────────────────────────────────────
  updateStroke(angle = this._aimAngle) {
    this._aimAngle = angle;
    if (!this.fingerPos || !this.prevPos) return null;
    if (this._strokeVersion === this._positionVersion) return this._lastAxialVel;
    this._strokeVersion = this._positionVersion;

    // Shot direction unit vector (from ball toward target)
    const shotDx = Math.cos(this._aimAngle);
    const shotDy = Math.sin(this._aimAngle);

    // Axial velocity: positive = finger moving toward ball (forward = shot dir)
    //                negative = finger moving away from ball (pullback)
    const axialVel = this.velocity.x * shotDx + this.velocity.y * shotDy;
    this._lastAxialVel = axialVel;

    if (axialVel < -0.5) {
      // Pulling back — accumulate pullback
      this._pullback = Math.min(CONFIG.CUE_MAX_PULLBACK,
                                this._pullback + (-axialVel) * 0.9);
      this._maxPullback = Math.max(this._maxPullback, this._pullback);
    } else if (axialVel > 0.5) {
      // Pushing forward — reduce pullback (cue tip approaching ball)
      this._pullback = Math.max(0, this._pullback - axialVel * 1.4);
    }
    // No movement → pullback stays (cue held still)
    return axialVel;
  }

  /** Returns current pullback distance in pixels (0 … CUE_MAX_PULLBACK). */
  getPullback() {
    return this._pullback;
  }

  /**
   * Call after processFrame. Returns shot power [0.2–1.0] if a strike
   * is detected (fast forward thrust after meaningful pullback), else null.
   */
  detectShot() {
    if (this._shotCooldown > 0) { this._shotCooldown--; return null; }
    if (this._fistShotQueued) {
      this._fistShotQueued = false;
      this._pullback = 0;
      this._maxPullback = 0;
      this._lastAxialVel = 0;
      this._shotCooldown = 35;
      return 0.72;
    }
    if (!this.fingerPos || !this.prevPos) return null;

    // Strike = fast forward motion AND had a meaningful pullback
    if (this._lastAxialVel > 14 && this._maxPullback > 8) {
      const power = Utils.clamp(this._lastAxialVel / 45, 0.2, 1.0);
      // Reset stroke cycle
      this._pullback    = 0;
      this._maxPullback = 0;
      this._lastAxialVel = 0;
      this._shotCooldown = 50;  // ~0.85 s at 60fps
      return power;
    }
    return null;
  }

  // ── Skin color detection (HSV) ──────────────────────────────────────────────
  _isSkin(r, g, b) {
    const { h, s, v } = Utils.rgbToHsv(r, g, b);
    const hOk = (h >= CONFIG.SKIN_H_MIN && h <= CONFIG.SKIN_H_MAX) || h >= 340;
    return hOk
        && s >= CONFIG.SKIN_S_MIN && s <= CONFIG.SKIN_S_MAX
        && v >= CONFIG.SKIN_V_MIN && v <= CONFIG.SKIN_V_MAX;
  }
}
