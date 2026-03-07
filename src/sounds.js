// ============================================================
// sounds.js — Web Audio API sound effects for TicTacTwist
// ============================================================

let ctx = null;
let enabled = true;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

/** Resume audio context (call on first user interaction). */
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

/** Enable or disable all sounds. */
export function setSoundEnabled(on) {
  enabled = on;
}

export function isSoundEnabled() {
  return enabled;
}

// ── Place Piece: crisp "pop" ───────────────────────────────
export function playPlace() {
  if (!enabled) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ac.currentTime + 0.08);
  gain.gain.setValueAtTime(0.25, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.12);
}

// ── Slide Board: low "whoosh" ──────────────────────────────
export function playSlide() {
  if (!enabled) return;
  const ac = getCtx();
  // White noise burst for a whoosh
  const dur = 0.15;
  const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, ac.currentTime);
  filter.frequency.linearRampToValueAtTime(200, ac.currentTime + dur);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.3, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(ac.currentTime);
}

// ── Rotate Board: ascending "twirl" ────────────────────────
export function playRotate() {
  if (!enabled) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(300, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.18);
  gain.gain.setValueAtTime(0.2, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.2);
}

// ── Win: cheerful rising arpeggio ──────────────────────────
export function playWin() {
  if (!enabled) return;
  const ac = getCtx();
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ac.currentTime + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.2, ac.currentTime + i * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.1 + 0.25);
    osc.connect(gain).connect(ac.destination);
    osc.start(ac.currentTime + i * 0.1);
    osc.stop(ac.currentTime + i * 0.1 + 0.25);
  });
}

// ── Lose: descending sad tone ──────────────────────────────
export function playLose() {
  if (!enabled) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.4);
  gain.gain.setValueAtTime(0.2, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.45);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.45);
}

// ── Draw: neutral double-beep ──────────────────────────────
export function playDraw() {
  if (!enabled) return;
  const ac = getCtx();
  [0, 0.15].forEach(delay => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.1, ac.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.1);
    osc.connect(gain).connect(ac.destination);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + 0.1);
  });
}

// ── Vanish: ghostly fade-out ───────────────────────────────
export function playVanish() {
  if (!enabled) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.25);
  gain.gain.setValueAtTime(0.15, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.3);
}
