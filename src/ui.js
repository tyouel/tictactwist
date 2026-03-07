// ============================================================
// ui.js — All DOM rendering, event handling, animation engine,
//         replay system for TicTacTwist
// ============================================================

import { createBoard, getWinner, isDraw, applyMove, applyMoveVanish, getValidMoves, nextPlayer, WINNING_LINES, MAX_PIECES_PER_PLAYER } from './game.js?v=49sounds';
import { getAIMove } from './ai.js?v=49sounds';
import {
  createSlideState, cloneSlideState, piecesToBoard,
  isValidShift, getValidShifts, applyShift,
  applySlideMove, applySlideMoveByIndex, applySlideMoveByIndexVanish,
  getValidPlacements, getSlideWinner, isSlideDraw,
  applyRotation
} from './slide-game.js?v=49sounds';
import { getSlideAIMove } from './slide-ai.js?v=49sounds';
import { loadSettings, saveSettings, loadScore, saveScore, resetScore } from './storage.js?v=49sounds';
import { resumeAudio, setSoundEnabled, playPlace, playSlide, playRotate, playWin, playLose, playDraw, playVanish } from './sounds.js?v=49sounds';

// ── Confetti Effect ────────────────────────────────────────
function launchConfetti(durationMs = 3000) {
  let canvas = document.getElementById('confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    document.body.appendChild(canvas);
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const COLORS = ['#F97316','#A3E635','#60A5FA','#F43F5E','#FBBF24','#A78BFA','#34D399','#FB923C'];
  const NUM = 150;
  const particles = [];

  for (let i = 0; i < NUM; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
    });
  }

  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fadeStart = durationMs * 0.7;
    for (const p of particles) {
      p.x += p.vx;
      p.vy += 0.04;           // gravity
      p.y += p.vy;
      p.rot += p.rotSpeed;
      if (elapsed > fadeStart) {
        p.opacity = Math.max(0, 1 - (elapsed - fadeStart) / (durationMs - fadeStart));
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}

// ── Module State ───────────────────────────────────────────
let board = createBoard();
let slideState = createSlideState();
let currentPlayer = 'X';
let gameOver = false;
let settings = loadSettings();
let score = loadScore(settings.variant);
let moveHistory = [];
let redoStack = [];
let winningLine = null;
let isReplaying = false;
let savedMoveHistory = [];

// Slide-specific
let slidePhase = 'shift';
let accumulatedShift = { dx: 0, dy: 0 };
let accumulatedRotation = 0;
let preShiftState = null;
let isAnimating = false;
let pendingCellAnim = null;
let visualRotationDeg = 0;
let aivaiRunning = false;

// Vanishing pieces (Expert mode)
let classicMoveOrder = [];  // tracks placement order for Classic vanishing
const VANISH_ANIM_MS = 500;
const MAX_VANISH_TURNS = 50; // draw limit for vanishing mode
let vanishTurnCount = 0;

// ── Animation Constants ────────────────────────────────────
const ANIM_DURATION_FAST = 380;
const ANIM_DURATION_SHIFT = 500;
const ANIM_EASING_FAST = 'cubic-bezier(0.22, 1, 0.36, 1)';
const ANIM_DURATION_HUMAN = 250;
const ANIM_SETTLE_DURATION = 400;
const ANIM_PLACEMENT_DURATION = 600;
const ANIM_PAUSE_AFTER_SETTLE = 300;

const REPLAY_STEP_DELAY = 1000;
const REPLAY_ANIM_SHIFT = 400;
const REPLAY_ANIM_ROTATE = 400;

// ── Index maps for rotation ────────────────────────────────
const CW_INDEX_MAP = { 0:3, 1:0, 2:1, 3:6, 4:4, 5:2, 6:7, 7:8, 8:5 };
const CCW_INDEX_MAP = {};
for (const [from, to] of Object.entries(CW_INDEX_MAP)) {
  CCW_INDEX_MAP[to] = Number(from);
}

const ROTATION_LABELS = ['', '45° CW', '90° CW', '135° CW', '180°', '135° CCW', '90° CCW', '45° CCW'];

// ── DOM References ─────────────────────────────────────────
let boardEl, boardWrapperEl, piecesLayerEl, statusEl, resultEl, phaseIndicatorEl, phaseTextEl;
let scoreXEl, scoreOEl, scoreDrawEl;
let newGameBtn, newGameBtn2, replayBtn, replayBtn2, resetScoreBtn;
let hintBtn;
let variantSel, modeSel, difficultySel, difficultyGroup, difficultyLabel;
let difficulty2Sel, difficulty2Group;
let shiftControlsEl, shiftExtrasEl, shiftResetBtn;
let rotateCWBtn, rotateCCWBtn;
let boardAreaEl;
let srAnnounceEl;
let howToPlayOverlay, howToPlayLink, howToPlayBtn, modalCloseBtn, modalGotItBtn, dontShowAgainCb;

// ── Helpers ────────────────────────────────────────────────
function isSlide() { return settings.variant === 'slide'; }
function isAIvsAI() { return settings.mode === 'aivai'; }
function getAIPlayer() {
  if (settings.mode === 'aivh') return settings.startingPlayer;
  return nextPlayer(settings.startingPlayer);
}
function isAITurn() {
  if (settings.mode === 'aivai') return true;
  if (settings.mode === 'aivh') return currentPlayer === settings.startingPlayer;
  return settings.mode === 'hvai' && currentPlayer === getAIPlayer();
}
function getDifficultyFor(player) {
  if (settings.mode === 'aivai') {
    return player === 'X' ? settings.difficulty : (settings.difficulty2 || 'easy');
  }
  return settings.difficulty;
}
function currentBoard() { return isSlide() ? piecesToBoard(slideState) : board; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function prefersReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function isVanishMode() { return settings.difficulty === 'hard'; }

function openHowToPlay() {
  howToPlayOverlay.classList.remove('hidden');
}

function closeHowToPlay() {
  if (dontShowAgainCb.checked) {
    localStorage.setItem('ttt_hide_instructions', '1');
  }
  howToPlayOverlay.classList.add('hidden');
}

// ── Init ───────────────────────────────────────────────────
export function init() {
  boardEl = document.getElementById('board');
  boardWrapperEl = document.querySelector('.board-wrapper');
  piecesLayerEl = document.getElementById('pieces-layer');
  statusEl = document.getElementById('status');
  resultEl = document.getElementById('result');
  phaseIndicatorEl = document.getElementById('phase-indicator');
  phaseTextEl = document.getElementById('phase-text');
  scoreXEl = document.getElementById('score-x');
  scoreOEl = document.getElementById('score-o');
  scoreDrawEl = document.getElementById('score-draw');
  newGameBtn = document.getElementById('new-game-btn');
  newGameBtn2 = document.getElementById('new-game-btn-2');
  replayBtn = document.getElementById('replay-btn');
  replayBtn2 = document.getElementById('replay-btn-2');
  resetScoreBtn = document.getElementById('reset-score-btn');
  hintBtn = document.getElementById('hint-btn');
  variantSel = document.getElementById('variant');
  modeSel = document.getElementById('mode');
  difficultySel = document.getElementById('difficulty');
  difficultyLabel = document.getElementById('difficulty-label');
  difficulty2Sel = document.getElementById('difficulty2');
  difficulty2Group = document.getElementById('difficulty2-group');
  difficultyGroup = document.getElementById('difficulty-group');
  shiftControlsEl = document.getElementById('shift-controls');
  shiftExtrasEl = document.getElementById('shift-extras');
  shiftResetBtn = document.getElementById('shift-reset-btn');
  rotateCWBtn = document.getElementById('rotate-cw-btn');
  rotateCCWBtn = document.getElementById('rotate-ccw-btn');
  boardAreaEl = document.getElementById('board-area');
  srAnnounceEl = document.getElementById('sr-announce');

  // Sound toggle
  const soundToggle = document.getElementById('sound-toggle');
  soundToggle.checked = settings.soundEnabled !== false;
  setSoundEnabled(soundToggle.checked);
  soundToggle.addEventListener('change', () => {
    settings.soundEnabled = soundToggle.checked;
    setSoundEnabled(soundToggle.checked);
    saveSettings(settings);
  });

  // How to Play modal
  howToPlayOverlay = document.getElementById('how-to-play-overlay');
  howToPlayLink = document.getElementById('how-to-play-link');
  howToPlayBtn = document.getElementById('how-to-play-btn');
  modalCloseBtn = document.getElementById('modal-close-btn');
  modalGotItBtn = document.getElementById('modal-got-it-btn');
  dontShowAgainCb = document.getElementById('dont-show-again');

  // Apply saved settings
  variantSel.value = settings.variant;
  modeSel.value = settings.mode;
  difficultySel.value = settings.difficulty;
  difficulty2Sel.value = settings.difficulty2 || 'easy';
  settings.startingPlayer = 'X';

  // Bind events
  newGameBtn.addEventListener('click', handlePlayAgain);
  newGameBtn2.addEventListener('click', handlePlayAgain);
  replayBtn.addEventListener('click', startReplay);
  replayBtn2.addEventListener('click', handleReplayClick);
  resetScoreBtn.addEventListener('click', handleResetScore);
  hintBtn.addEventListener('click', showHint);

  [variantSel, modeSel, difficultySel, difficulty2Sel].forEach(el => {
    el.addEventListener('change', onSettingsChange);
  });

  document.querySelectorAll('.shift-btn').forEach(btn => {
    const dx = parseInt(btn.dataset.dx);
    const dy = parseInt(btn.dataset.dy);
    btn.addEventListener('click', () => handleShift(dx, dy));
  });

  shiftResetBtn.addEventListener('click', handleResetShift);
  rotateCWBtn.addEventListener('click', () => handleRotate('cw'));
  rotateCCWBtn.addEventListener('click', () => handleRotate('ccw'));

  document.addEventListener('keydown', onKeyDown);

  // Resume audio context on first user interaction
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('keydown', resumeAudio, { once: true });

  // Re-render pieces on resize/orientation change so they stay centered
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderPieces(), 100);
  });

  // How to Play modal events
  howToPlayLink.addEventListener('click', (e) => { e.preventDefault(); openHowToPlay(); });
  howToPlayBtn.addEventListener('click', openHowToPlay);
  modalCloseBtn.addEventListener('click', closeHowToPlay);
  modalGotItBtn.addEventListener('click', closeHowToPlay);
  howToPlayOverlay.addEventListener('click', (e) => {
    if (e.target === howToPlayOverlay) closeHowToPlay();
  });

  renderScore();
  newGame();

  // Show instructions on first visit
  if (!localStorage.getItem('ttt_hide_instructions')) {
    openHowToPlay();
  }
}

// ── Settings ───────────────────────────────────────────────
function onSettingsChange() {
  aivaiRunning = false;
  const oldVariant = settings.variant;
  settings.variant = variantSel.value;
  settings.mode = modeSel.value;
  settings.difficulty = difficultySel.value;
  settings.difficulty2 = difficulty2Sel.value;
  settings.startingPlayer = 'X';
  saveSettings(settings);

  if (settings.variant !== oldVariant) {
    score = loadScore(settings.variant);
    renderScore();
  }

  // Difficulty visible for slide + (hvai, aivh, or aivai)
  const showDiff = (settings.mode === 'hvai' || settings.mode === 'aivh' || settings.mode === 'aivai') && settings.variant === 'slide';
  difficultyGroup.style.display = showDiff ? '' : 'none';

  // Second difficulty only for AI vs AI
  const isAA = settings.mode === 'aivai';
  difficulty2Group.classList.toggle('hidden', !isAA || !showDiff);
  difficultyLabel.textContent = isAA ? 'AI (X)' : 'AI Difficulty';

  newGame();
}

// ── New Game ───────────────────────────────────────────────
function newGame() {
  board = createBoard();
  slideState = createSlideState(isVanishMode());
  currentPlayer = settings.startingPlayer;
  gameOver = false;
  moveHistory = [];
  redoStack = [];
  winningLine = null;
  isAnimating = false;
  visualRotationDeg = 0;
  slidePhase = 'shift';
  accumulatedShift = { dx: 0, dy: 0 };
  accumulatedRotation = 0;
  preShiftState = null;
  pendingCellAnim = null;
  classicMoveOrder = [];
  vanishTurnCount = 0;

  // Reset board CSS
  boardWrapperEl.classList.remove('animating', 'human-move');
  boardWrapperEl.style.transition = '';
  boardWrapperEl.style.transform = '';

  updateSlideUI();
  renderBoard();
  renderStatus();
  updateUndoRedoButtons();

  // Difficulty visibility
  const showDiff = (settings.mode === 'hvai' || settings.mode === 'aivh' || settings.mode === 'aivai') && settings.variant === 'slide';
  difficultyGroup.style.display = showDiff ? '' : 'none';
  const isAA = settings.mode === 'aivai';
  difficulty2Group.classList.toggle('hidden', !isAA || !showDiff);
  difficultyLabel.textContent = isAA ? 'AI (X)' : 'AI Difficulty';

  // AI goes first
  if (isAITurn()) {
    disableBoard();
    if (isAIvsAI()) {
      aivaiRunning = true;
      setTimeout(() => runAIvsAILoop(), 800);
    } else {
      setTimeout(() => doAIMove(), 300);
    }
  }
}

// ── Slide UI Management ────────────────────────────────────
function updateSlideUI() {
  if (!isSlide()) {
    shiftControlsEl.classList.add('hidden');
    shiftExtrasEl.classList.add('hidden');
    phaseIndicatorEl.classList.add('hidden');
    return;
  }

  if (gameOver || isAIvsAI()) {
    shiftControlsEl.classList.add('hidden');
    shiftExtrasEl.classList.add('hidden');
    phaseIndicatorEl.classList.add('hidden');
    return;
  }

  const piecesOnBoard = slideState.pieces.size;
  const inShiftPhase = slidePhase === 'shift';
  const hasTransforms = accumulatedShift.dx !== 0 || accumulatedShift.dy !== 0 || accumulatedRotation !== 0;

  // Show shift controls on moves 2-5 (pieces 1-4)
  const canTransform = piecesOnBoard >= 1 && piecesOnBoard <= 3;
  if (inShiftPhase && canTransform && !isAITurn()) {
    shiftControlsEl.classList.remove('hidden');

    // Enable/disable individual shift buttons
    document.querySelectorAll('.shift-btn').forEach(btn => {
      const dx = parseInt(btn.dataset.dx);
      const dy = parseInt(btn.dataset.dy);
      // Data shift is opposite of visual direction
      btn.disabled = !isValidShift(slideState, -dx, -dy);
    });

    // Rotation always allowed during transform window
    rotateCWBtn.disabled = false;
    rotateCCWBtn.disabled = false;
  } else {
    shiftControlsEl.classList.add('hidden');
  }

  // Reset button
  if (hasTransforms && !isAITurn()) {
    shiftExtrasEl.classList.remove('hidden');
    shiftResetBtn.disabled = false;
  } else {
    shiftExtrasEl.classList.add('hidden');
    shiftResetBtn.disabled = true;
  }

  // Phase indicator
  phaseIndicatorEl.classList.remove('hidden');

  if (piecesOnBoard < 1 || piecesOnBoard > 3) {
    phaseTextEl.textContent = `${currentPlayer}: Place your mark`;
  } else if (inShiftPhase && !hasTransforms) {
    phaseTextEl.textContent = `${currentPlayer}: Shift, rotate, or place your mark`;
  } else if (hasTransforms) {
    const parts = [];
    if (accumulatedRotation !== 0) parts.push(`Rotated ${ROTATION_LABELS[accumulatedRotation]}`);
    if (accumulatedShift.dx !== 0 || accumulatedShift.dy !== 0) {
      parts.push(`Shifted (${accumulatedShift.dx}, ${accumulatedShift.dy})`);
    }
    phaseTextEl.textContent = `${currentPlayer}: ${parts.join(', ')} \u2014 place your mark (or Reset)`;
  } else {
    phaseTextEl.textContent = `${currentPlayer}: Place your mark`;
  }
}

// ── Board Rendering ────────────────────────────────────────
function renderBoard(migrations) {
  const b = currentBoard();
  boardEl.innerHTML = '';

  for (let i = 0; i < 9; i++) {
    const btn = document.createElement('button');
    btn.className = 'cell';
    btn.dataset.index = i;
    btn.setAttribute('aria-label', cellAriaLabel(i, b));

    if (b[i]) {
      btn.classList.add(b[i] === 'X' ? 'cell-x' : 'cell-o');
    }

    if (winningLine && winningLine.includes(i)) {
      btn.classList.add('cell-win');
    }

    if (gameOver || b[i]) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => handleCellClick(i));
    }

    boardEl.appendChild(btn);
  }

  renderPieces(migrations);
}

function getOldestIndices() {
  if (!isVanishMode() || gameOver) return new Set();
  const oldest = new Set();
  if (isSlide()) {
    for (const p of ['X', 'O']) {
      const moves = slideState.moveOrder.filter(m => m.player === p);
      if (moves.length >= MAX_PIECES_PER_PLAYER) {
        const [c, r] = moves[0].key.split(',').map(Number);
        oldest.add(r * 3 + c);
      }
    }
  } else {
    for (const p of ['X', 'O']) {
      const moves = classicMoveOrder.filter(m => m.player === p);
      if (moves.length >= MAX_PIECES_PER_PLAYER) {
        oldest.add(moves[0].index);
      }
    }
  }
  return oldest;
}

function renderPieces(migrations) {
  piecesLayerEl.innerHTML = '';
  const b = currentBoard();
  const oldestSet = getOldestIndices();

  for (let i = 0; i < 9; i++) {
    if (!b[i]) continue;

    const div = document.createElement('div');
    div.className = `piece-marker piece-${b[i].toLowerCase()}`;
    div.dataset.index = i;
    div.textContent = b[i];

    if (winningLine && winningLine.includes(i)) {
      div.classList.add('piece-win');
    }

    if (oldestSet.has(i)) {
      div.classList.add('piece-oldest');
    }

    const pos = getVisualCellPos(i);
    div.style.left = pos.x + 'px';
    div.style.top = pos.y + 'px';
    div.style.width = pos.w + 'px';
    div.style.height = pos.h + 'px';

    // Migration animation
    if (migrations) {
      const mig = migrations.find(m => m.index === i);
      if (mig) {
        const offsetX = mig.fromX - pos.x;
        const offsetY = mig.fromY - pos.y;
        if (Math.abs(offsetX) > 0.5 || Math.abs(offsetY) > 0.5) {
          div.style.setProperty('--migrate-x', offsetX + 'px');
          div.style.setProperty('--migrate-y', offsetY + 'px');
          div.classList.add('migrating');
        }
      }
    }

    piecesLayerEl.appendChild(div);
  }
}

function cellAriaLabel(index, b) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const piece = b[index];
  return piece
    ? `Cell (${col}, ${row}), occupied by ${piece}`
    : `Cell (${col}, ${row}), empty`;
}

// ── Visual Position Helpers ────────────────────────────────
function getBoardSize() {
  // Read actual rendered size of the board element
  if (boardEl && boardEl.offsetWidth > 0) return boardEl.offsetWidth;
  return 340; // fallback
}

function getCellRect(index) {
  const boardSize = getBoardSize();
  const gap = 6;
  const cellSize = (boardSize - 2 * gap) / 3;
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: col * (cellSize + gap),
    y: row * (cellSize + gap),
    w: cellSize,
    h: cellSize
  };
}

function getVisualCellPos(index) {
  // Pieces always at grid positions — wrapper transform handles visual rotation
  return getCellRect(index);
}

function getCellPx() {
  const boardSize = getBoardSize();
  const gap = 6;
  return (boardSize - 2 * gap) / 3 + gap;
}

function getBaseTransform() {
  return visualRotationDeg !== 0 ? `rotate(${visualRotationDeg}deg)` : '';
}

// ── Animation Engine ───────────────────────────────────────

function animateBoard(transformCSS, duration) {
  return new Promise(resolve => {
    if (prefersReducedMotion()) {
      resolve();
      return;
    }
    isAnimating = true;
    boardWrapperEl.classList.add('animating');
    boardWrapperEl.style.transition = `transform ${duration}ms ${ANIM_EASING_FAST}`;
    boardWrapperEl.style.transform = transformCSS;

    setTimeout(() => {
      boardWrapperEl.style.transition = '';
      boardWrapperEl.style.transform = getBaseTransform();
      boardWrapperEl.classList.remove('animating');
      isAnimating = false;
      resolve();
    }, duration + 30);
  });
}

function animateBoardHuman(targetEl, transformCSS, duration = ANIM_DURATION_HUMAN) {
  return new Promise(resolve => {
    if (prefersReducedMotion()) {
      resolve();
      return;
    }
    isAnimating = true;
    targetEl.classList.add('human-move');

    const wobbleAngle = 1.5 + Math.random() * 1.5;
    const wobbleShift = 2 + Math.random() * 3;

    const keyframes = [
      { transform: 'none', offset: 0 },
      { transform: `rotate(${wobbleAngle}deg) translate(${wobbleShift}px, ${-wobbleShift}px)`, offset: 0.12 },
      { transform: `rotate(${-wobbleAngle * 0.7}deg) translate(${-wobbleShift * 0.5}px, ${wobbleShift * 0.5}px)`, offset: 0.28 },
      { transform: `rotate(${wobbleAngle * 0.4}deg) translate(${wobbleShift * 0.3}px, ${-wobbleShift * 0.3}px)`, offset: 0.45 },
      { transform: `rotate(${-wobbleAngle * 0.2}deg)`, offset: 0.65 },
      { transform: transformCSS, offset: 1.0 }
    ];

    const anim = targetEl.animate(keyframes, {
      duration,
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      fill: 'forwards'
    });

    anim.onfinish = () => {
      anim.cancel();
      targetEl.classList.remove('human-move');
      targetEl.style.transform = '';
      isAnimating = false;
      resolve();
    };
  });
}

function animatePieceDrop(cellIndex) {
  const markers = piecesLayerEl.querySelectorAll('.piece-marker');
  for (const marker of markers) {
    if (parseInt(marker.dataset.index) === cellIndex) {
      marker.classList.add('piece-drop');
      break;
    }
  }
}

function animateGhostOut(cellIndex) {
  if (cellIndex === null || cellIndex === undefined) return;
  const markers = piecesLayerEl.querySelectorAll('.piece-marker');
  for (const marker of markers) {
    if (parseInt(marker.dataset.index) === cellIndex) {
      marker.classList.add('piece-ghost');
      setTimeout(() => marker.remove(), VANISH_ANIM_MS);
      break;
    }
  }
}

function snapshotPiecePositions() {
  const b = currentBoard();
  const positions = new Map();
  for (let i = 0; i < 9; i++) {
    if (b[i]) {
      const pos = getVisualCellPos(i);
      positions.set(i, { x: pos.x, y: pos.y, player: b[i] });
    }
  }
  return positions;
}

function buildRotationMigrations(direction, oldPositions) {
  const migrations = [];
  const b = currentBoard();
  const inverseMap = direction === 'cw' ? CCW_INDEX_MAP : CW_INDEX_MAP;

  for (let newIdx = 0; newIdx < 9; newIdx++) {
    if (!b[newIdx]) continue;
    const oldIdx = inverseMap[newIdx];
    if (oldIdx === undefined) continue;
    const oldPos = oldPositions.get(oldIdx);
    if (!oldPos) continue;
    migrations.push({ index: newIdx, fromX: oldPos.x, fromY: oldPos.y });
  }
  return migrations;
}

// ── Cell Click Handler ─────────────────────────────────────
function handleCellClick(index) {
  if (gameOver || isAnimating || isReplaying) return;
  if (isAITurn()) return;

  if (isSlide()) {
    handleSlideClick(index);
  } else {
    handleClassicClick(index);
  }
}

function handleClassicClick(index) {
  let removedIndex = null;

  if (isVanishMode()) {
    const result = applyMoveVanish(board, index, currentPlayer, classicMoveOrder);
    if (!result) return;
    board = result.board;
    classicMoveOrder = result.moveOrder;
    removedIndex = result.removed;
  } else {
    const newBoard = applyMove(board, index, currentPlayer);
    if (!newBoard) return;
    board = newBoard;
  }

  clearHintPanel();
  moveHistory.push({ type: 'classic', index, player: currentPlayer, removed: removedIndex });
  redoStack = [];

  if (removedIndex !== null) {
    animateGhostOut(removedIndex);
    playVanish();
  }

  checkEndConditions();
  renderBoard();
  animatePieceDrop(index);
  playPlace();
  renderStatus();
  updateSlideUI();
  updateUndoRedoButtons();

  if (!gameOver && isAITurn()) {
    disableBoard();
    setTimeout(() => doAIMove(), 300);
  }
}

function handleSlideClick(index) {
  // Auto-confirm transforms if in shift phase
  if (slidePhase === 'shift') {
    autoConfirmPosition();
    slidePhase = 'place';
  }

  handleSlidePlacement(index);
}

// ── Slide Placement ────────────────────────────────────────
function handleSlidePlacement(index) {
  if (slidePhase !== 'place' || isAnimating) return;

  clearHintPanel();

  const savedPreShift = preShiftState ? cloneSlideState(preShiftState) : cloneSlideState(slideState);
  const transformedState = cloneSlideState(slideState);

  let removedIndex = null;

  if (isVanishMode()) {
    const result = applySlideMoveByIndexVanish(slideState, index, currentPlayer);
    if (!result) return;
    slideState = result.state;
    removedIndex = result.removed;
  } else {
    const newState = applySlideMoveByIndex(slideState, index, currentPlayer);
    if (!newState) return;
    slideState = newState;
  }

  moveHistory.push({
    type: 'slide',
    rotation: accumulatedRotation,
    shift: { ...accumulatedShift },
    transformedState,
    index,
    player: currentPlayer,
    prevState: savedPreShift,
    removed: removedIndex
  });
  redoStack = [];

  // Reset transforms
  accumulatedShift = { dx: 0, dy: 0 };
  accumulatedRotation = 0;
  preShiftState = null;

  if (removedIndex !== null) {
    animateGhostOut(removedIndex);
    playVanish();
  }

  checkEndConditions();

  if (!gameOver) {
    slidePhase = 'shift';
  }

  renderBoard();
  animatePieceDrop(index);
  playPlace();
  renderStatus();
  updateSlideUI();
  updateUndoRedoButtons();

  if (!gameOver && isAITurn()) {
    disableBoard();
    setTimeout(() => doAIMove(), 600);
  }
}

// ── Shift Handling ─────────────────────────────────────────
async function handleShift(dx, dy) {
  if (gameOver || slidePhase !== 'shift' || isAITurn() || isAnimating || isReplaying) return;

  // Data shift is opposite of visual direction
  const pieceDx = -dx;
  const pieceDy = -dy;

  if (!isValidShift(slideState, pieceDx, pieceDy)) return;

  // Save pre-shift state on first transform
  if (!preShiftState) {
    preShiftState = cloneSlideState(slideState);
  }

  // Animate grid in visual direction
  const px = getCellPx();
  const translateX = dx * px;
  const translateY = dy * px;
  await animateBoard(
    `${getBaseTransform()} translate(${translateX}px, ${translateY}px)`,
    ANIM_DURATION_SHIFT
  );

  // Apply shift
  slideState = applyShift(slideState, pieceDx, pieceDy);
  accumulatedShift.dx += pieceDx;
  accumulatedShift.dy += pieceDy;
  playSlide();

  renderBoard();
  updateSlideUI();
}

// ── Rotate Handling ────────────────────────────────────────
async function handleRotate(direction) {
  if (gameOver || slidePhase !== 'shift' || isAITurn() || isAnimating || isReplaying) return;

  if (!preShiftState) {
    preShiftState = cloneSlideState(slideState);
  }

  const oldPositions = snapshotPiecePositions();

  const deg = direction === 'cw' ? 45 : -45;
  await animateBoard(
    `${getBaseTransform()} rotate(${deg}deg)`,
    ANIM_DURATION_FAST
  );

  visualRotationDeg += deg;

  slideState = applyRotation(slideState, direction);
  accumulatedRotation = (accumulatedRotation + (direction === 'cw' ? 1 : 7)) % 8;
  playRotate();

  const migrations = buildRotationMigrations(direction, oldPositions);
  renderBoard(migrations);
  updateSlideUI();

  // After 2 seconds, rotate back to 0°
  await sleep(2000);

  if (visualRotationDeg !== 0) {
    boardWrapperEl.style.transition = `transform ${ANIM_DURATION_FAST}ms ${ANIM_EASING_FAST}`;
    boardWrapperEl.style.transform = 'rotate(0deg)';
    await sleep(ANIM_DURATION_FAST + 30);
    boardWrapperEl.style.transition = '';
    boardWrapperEl.style.transform = '';
    visualRotationDeg = 0;
    renderBoard();
  }
}

// ── Reset Shift ────────────────────────────────────────────
function handleResetShift() {
  if (!preShiftState) return;

  slideState = preShiftState;
  preShiftState = null;
  accumulatedShift = { dx: 0, dy: 0 };
  accumulatedRotation = 0;
  visualRotationDeg = 0;
  slidePhase = 'shift';

  boardWrapperEl.style.transition = '';
  boardWrapperEl.style.transform = '';

  renderBoard();
  updateSlideUI();
}

// ── Auto-Confirm ───────────────────────────────────────────
function autoConfirmPosition() {
  // Snap to 0° immediately (no animation)
  visualRotationDeg = 0;
  boardWrapperEl.style.transition = '';
  boardWrapperEl.style.transform = '';
  slidePhase = 'place';
  renderBoard();
}

// ── AI Move ────────────────────────────────────────────────
async function doAIMove() {
  try {
    if (gameOver) return;
    isAnimating = true;

    if (isSlide()) {
      await doSlideAIMove(currentPlayer);
    } else {
      await doClassicAIMove(currentPlayer);
    }
  } catch (e) {
    console.error('AI error:', e);
    isAnimating = false;
    boardWrapperEl.classList.remove('animating', 'human-move');
    boardWrapperEl.style.transform = '';
    renderBoard();
    renderStatus();
    updateSlideUI();
    updateUndoRedoButtons();
  }
}

async function doClassicAIMove(aiPlayer) {
  // Classic mode: always play optimally (hard/minimax) regardless of difficulty setting
  const vanish = isVanishMode();
  const move = getAIMove(board, aiPlayer, 'hard', vanish, classicMoveOrder);
  if (move === null || move === undefined) { isAnimating = false; return; }

  let removedIndex = null;
  if (vanish) {
    const result = applyMoveVanish(board, move, aiPlayer, classicMoveOrder);
    board = result.board;
    classicMoveOrder = result.moveOrder;
    removedIndex = result.removed;
  } else {
    board = applyMove(board, move, aiPlayer);
  }
  moveHistory.push({ type: 'classic', index: move, player: aiPlayer, removed: removedIndex });
  redoStack = [];

  checkEndConditions();

  isAnimating = false;
  renderBoard();
  animatePieceDrop(move);
  playPlace();
  if (removedIndex !== null) { animateGhostOut(removedIndex); playVanish(); }
  renderStatus();
  updateUndoRedoButtons();
}

async function doSlideAIMove(aiPlayer) {
  const prevState = cloneSlideState(slideState);
  const result = getSlideAIMove(slideState, aiPlayer, getDifficultyFor(aiPlayer));

  const { rotation, shift, placement } = result;

  let transformedState;
  const hasRotation = rotation !== 0;
  const hasShift = shift.dx !== 0 || shift.dy !== 0;

  // Apply transforms to data first to prepare transformedState
  let workingState = cloneSlideState(slideState);

  if (hasRotation || hasShift) {
    // Snapshot before transforms
    const oldPositions = snapshotPiecePositions();

    // Apply rotation to data — animate each 45° step individually
    if (hasRotation) {
      let steps, dir;
      if (rotation <= 4) {
        steps = rotation;
        dir = 'cw';
      } else {
        steps = 8 - rotation;
        dir = 'ccw';
      }

      const stepDeg = dir === 'cw' ? 45 : -45;
      let totalDeg = 0;

      for (let i = 0; i < steps; i++) {
        workingState = applyRotation(workingState, dir);
        totalDeg += stepDeg;
        // Animate each 45° step separately so the player can follow
        await animateBoardHuman(boardWrapperEl, `rotate(${totalDeg}deg)`, ANIM_DURATION_HUMAN);
        playRotate();
        await sleep(150); // brief pause between steps
      }
    }

    // Apply shift to data
    if (hasShift) {
      workingState = applyShift(workingState, shift.dx, shift.dy);

      // If we already rotated, reset the visual first so shift is clear
      if (hasRotation) {
        // Snap board to post-rotation state before animating shift
        slideState = cloneSlideState(workingState);
        // Undo the shift from workingState temporarily to render the rotated-only state
        // Actually: we need to render the rotated state, then animate the shift
        // Re-snapshot from the rotated position
        const rotatedOnly = applyShift(workingState, -shift.dx, -shift.dy) || workingState;
        // Temporarily set slideState to pre-shift rotated state for rendering
        const savedState = cloneSlideState(slideState);
        slideState = rotatedOnly;
        boardWrapperEl.style.transition = '';
        boardWrapperEl.style.transform = '';
        renderBoard();
        await sleep(50);
        slideState = savedState;
      }

      // Visual direction is opposite of data
      const visDx = -shift.dx;
      const visDy = -shift.dy;
      const px = getCellPx();
      await animateBoardHuman(
        boardWrapperEl,
        `translate(${visDx * px}px, ${visDy * px}px)`,
        ANIM_DURATION_HUMAN
      );
      playSlide();
    }

    slideState = workingState;

    // Build migration data — for each piece at newIdx, find old position
    const newBoard = piecesToBoard(slideState);
    const migrations = [];
    for (let newIdx = 0; newIdx < 9; newIdx++) {
      if (!newBoard[newIdx]) continue;
      // Find which old index mapped to this new index
      let origIdx = newIdx;

      // Undo shift to find pre-shift index
      if (hasShift) {
        const col = origIdx % 3;
        const row = Math.floor(origIdx / 3);
        const origCol = col - shift.dx;
        const origRow = row - shift.dy;
        if (origCol >= 0 && origCol <= 2 && origRow >= 0 && origRow <= 2) {
          origIdx = origRow * 3 + origCol;
        }
      }

      // Undo rotation to find pre-rotation index
      if (hasRotation) {
        let steps, inverseMap;
        if (rotation <= 4) {
          steps = rotation;
          inverseMap = CCW_INDEX_MAP;
        } else {
          steps = 8 - rotation;
          inverseMap = CW_INDEX_MAP;
        }
        for (let s = 0; s < steps; s++) {
          origIdx = inverseMap[origIdx] ?? origIdx;
        }
      }

      const oldPos = oldPositions.get(origIdx);
      if (oldPos) {
        migrations.push({ index: newIdx, fromX: oldPos.x, fromY: oldPos.y });
      }
    }

    renderBoard(migrations);
    await sleep(ANIM_SETTLE_DURATION);
    await sleep(ANIM_PAUSE_AFTER_SETTLE);
  }

  transformedState = cloneSlideState(slideState);

  // Apply placement
  let removedIndex = null;
  if (isVanishMode()) {
    const result = applySlideMoveByIndexVanish(slideState, placement, aiPlayer);
    if (!result) { isAnimating = false; return; }
    slideState = result.state;
    removedIndex = result.removed;
  } else {
    const newState = applySlideMoveByIndex(slideState, placement, aiPlayer);
    if (!newState) { isAnimating = false; return; }
    slideState = newState;
  }

  moveHistory.push({
    type: 'slide',
    rotation,
    shift: { ...shift },
    transformedState,
    index: placement,
    player: aiPlayer,
    prevState: prevState,
    removed: removedIndex
  });
  redoStack = [];

  checkEndConditions();

  isAnimating = false;
  slidePhase = 'shift';

  renderBoard();
  animatePieceDrop(placement);
  playPlace();
  if (removedIndex !== null) { animateGhostOut(removedIndex); playVanish(); }
  renderStatus();
  updateSlideUI();
  updateUndoRedoButtons();
}

// ── AI vs AI Loop ────────────────────────────────────
async function runAIvsAILoop() {
  while (!gameOver && aivaiRunning) {
    disableBoard();
    renderStatus();
    await sleep(600);            // brief pause to show "thinking"
    if (gameOver || !aivaiRunning) break;

    isAnimating = true;
    if (isSlide()) {
      await doSlideAIMove(currentPlayer);
    } else {
      await doClassicAIMove(currentPlayer);
    }

    if (!gameOver && aivaiRunning) {
      await sleep(1200);          // pause between moves so the user can follow
    }
  }
  aivaiRunning = false;
}

// ── End Conditions ─────────────────────────────────────────
function checkEndConditions() {
  const b = currentBoard();
  const result = isSlide() ? getSlideWinner(slideState) : getWinner(b);

  if (result) {
    gameOver = true;
    winningLine = result.line;
    score[result.winner]++;
    saveScore(score, settings.variant);
    renderScore();
    savedMoveHistory = moveHistory.map(m => ({ ...m }));
    // Game-over sound + confetti
    if (settings.mode === 'hvh' || settings.mode === 'aivai') {
      playWin();
      launchConfetti();
    } else {
      const humanIsX = settings.mode === 'hvai';
      const humanPlayer = humanIsX ? 'X' : 'O';
      if (result.winner === humanPlayer) { playWin(); launchConfetti(); } else playLose();
    }
    return;
  }

  // In vanish mode the board never fills, so use a turn limit to detect draws
  if (isVanishMode()) {
    vanishTurnCount++;
    if (vanishTurnCount >= MAX_VANISH_TURNS) {
      gameOver = true;
      score.draws++;
      saveScore(score, settings.variant);
      renderScore();
      savedMoveHistory = moveHistory.map(m => ({ ...m }));
      playDraw();
      return;
    }
  } else {
    const draw = isSlide() ? isSlideDraw(slideState) : isDraw(b);
    if (draw) {
      gameOver = true;
      score.draws++;
      saveScore(score, settings.variant);
      renderScore();
      savedMoveHistory = moveHistory.map(m => ({ ...m }));
      playDraw();
      return;
    }
  }

  currentPlayer = nextPlayer(currentPlayer);
}

// ── Undo / Redo ────────────────────────────────────────────
function undo() {
  if (moveHistory.length === 0 || isAnimating || isReplaying) return;

  // If undoing from game-over, reverse score
  if (gameOver) {
    if (winningLine) {
      const lastMove = moveHistory[moveHistory.length - 1];
      score[lastMove.player]--;
    } else {
      score.draws--;
    }
    saveScore(score, settings.variant);
    renderScore();
  }

  // In HvAI or AIvH mode, undo 2 moves if possible
  const undoCount = ((settings.mode === 'hvai' || settings.mode === 'aivh') && moveHistory.length >= 2) ? 2 : 1;

  for (let i = 0; i < undoCount; i++) {
    if (moveHistory.length === 0) break;
    const move = moveHistory.pop();
    redoStack.push(move);

    if (move.type === 'classic') {
      // Rebuild board (and moveOrder in vanish mode) from scratch
      board = createBoard();
      classicMoveOrder = [];
      for (const m of moveHistory) {
        if (m.type !== 'classic') continue;
        if (isVanishMode()) {
          const r = applyMoveVanish(board, m.index, m.player, classicMoveOrder);
          board = r.board;
          classicMoveOrder = r.moveOrder;
        } else {
          board = applyMove(board, m.index, m.player);
        }
      }
    } else {
      // Slide: restore prevState
      slideState = move.prevState ? cloneSlideState(move.prevState) : createSlideState(isVanishMode());
    }
  }

  // Recalculate current player
  currentPlayer = moveHistory.length > 0
    ? nextPlayer(moveHistory[moveHistory.length - 1].player)
    : settings.startingPlayer;

  gameOver = false;
  winningLine = null;
  slidePhase = 'shift';
  accumulatedShift = { dx: 0, dy: 0 };
  accumulatedRotation = 0;
  preShiftState = null;
  visualRotationDeg = 0;
  vanishTurnCount = moveHistory.length;

  boardWrapperEl.style.transition = '';
  boardWrapperEl.style.transform = '';

  renderBoard();
  renderStatus();
  updateSlideUI();
  updateUndoRedoButtons();
}

function redo() {
  if (redoStack.length === 0 || gameOver || isAnimating || isReplaying) return;

  const redoCount = ((settings.mode === 'hvai' || settings.mode === 'aivh') && redoStack.length >= 2) ? 2 : 1;

  for (let i = 0; i < redoCount; i++) {
    if (redoStack.length === 0) break;
    const move = redoStack.pop();
    moveHistory.push(move);

    if (move.type === 'classic') {
      if (isVanishMode()) {
        const r = applyMoveVanish(board, move.index, move.player, classicMoveOrder);
        board = r.board;
        classicMoveOrder = r.moveOrder;
      } else {
        board = applyMove(board, move.index, move.player);
      }
    } else {
      // Restore transformedState, apply placement
      slideState = cloneSlideState(move.transformedState);
      if (isVanishMode()) {
        const r = applySlideMoveByIndexVanish(slideState, move.index, move.player);
        if (r) slideState = r.state;
      } else {
        slideState = applySlideMoveByIndex(slideState, move.index, move.player);
      }
    }

    // Check win/draw after each move
    const b = currentBoard();
    const result = isSlide() ? getSlideWinner(slideState) : getWinner(b);
    if (result) {
      gameOver = true;
      winningLine = result.line;
      score[result.winner]++;
      saveScore(score, settings.variant);
      renderScore();
      break;
    }
    const draw = isSlide() ? isSlideDraw(slideState) : isDraw(b);
    if (draw) {
      gameOver = true;
      score.draws++;
      saveScore(score, settings.variant);
      renderScore();
      break;
    }

    currentPlayer = nextPlayer(move.player);
  }

  if (!gameOver) {
    currentPlayer = moveHistory.length > 0
      ? nextPlayer(moveHistory[moveHistory.length - 1].player)
      : settings.startingPlayer;
  }

  slidePhase = 'shift';
  accumulatedShift = { dx: 0, dy: 0 };
  accumulatedRotation = 0;
  preShiftState = null;

  renderBoard();
  renderStatus();
  updateSlideUI();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  updateHintButton();
  updateReplayButton();
}

function updateHintButton() {
  const humanTurn = !gameOver && !isAnimating && !isReplaying && !isAITurn();
  hintBtn.disabled = !humanTurn;
}

function updateReplayButton() {
  if (isReplaying) {
    replayBtn2.disabled = true;
  } else if (gameOver && savedMoveHistory.length > 0) {
    replayBtn2.disabled = false;
    replayBtn2.textContent = 'Replay Game';
  } else if (!gameOver && moveHistory.length > 0) {
    replayBtn2.disabled = false;
    replayBtn2.textContent = 'Replay Move';
  } else {
    replayBtn2.disabled = true;
    replayBtn2.textContent = 'Replay';
  }
}

// ── Keyboard Shortcuts ─────────────────────────────────────
function onKeyDown(e) {
  if (e.ctrlKey || e.metaKey) return;

  // Escape closes the how-to-play modal
  if (e.key === 'Escape') {
    if (!howToPlayOverlay.classList.contains('hidden')) {
      closeHowToPlay();
      return;
    }
  }

  if (e.key === 'R' || e.key === 'r') {
    handlePlayAgain();
  } else if (e.key === 'H' || e.key === 'h') {
    showHint();
  }
}

// ── Replay System ──────────────────────────────────────────
function handleReplayClick() {
  if (gameOver && savedMoveHistory.length > 0) {
    startReplay();
  } else if (!gameOver && moveHistory.length > 0) {
    replayLastMove();
  }
}

async function replayLastMove() {
  if (moveHistory.length === 0 || isAnimating || isReplaying) return;

  // Get the last move (or last 2 for AI games: human + AI response)
  const isAIGame = settings.mode === 'hvai' || settings.mode === 'aivh';
  const movesToReplay = [];

  if (isAIGame && moveHistory.length >= 2) {
    // Show both the human move and the AI response
    movesToReplay.push(moveHistory[moveHistory.length - 2]);
    movesToReplay.push(moveHistory[moveHistory.length - 1]);
  } else {
    movesToReplay.push(moveHistory[moveHistory.length - 1]);
  }

  // Save current state
  const savedBoard = board.slice();
  const savedSlide = isSlide() ? cloneSlideState(slideState) : null;
  const savedPlayer = currentPlayer;
  const savedPhase = slidePhase;
  const savedWinLine = winningLine;

  // Reconstruct board state BEFORE the moves we're replaying
  board = createBoard();
  slideState = createSlideState(isVanishMode());
  classicMoveOrder = [];
  const replayStartIdx = moveHistory.length - movesToReplay.length;
  for (let i = 0; i < replayStartIdx; i++) {
    const m = moveHistory[i];
    if (m.type === 'classic') {
      if (isVanishMode()) {
        const r = applyMoveVanish(board, m.index, m.player, classicMoveOrder);
        board = r.board;
        classicMoveOrder = r.moveOrder;
      } else {
        board = applyMove(board, m.index, m.player);
      }
    } else {
      if (m.transformedState) slideState = cloneSlideState(m.transformedState);
      if (isVanishMode()) {
        const r = applySlideMoveByIndexVanish(slideState, m.index, m.player);
        if (r) slideState = r.state;
      } else {
        slideState = applySlideMoveByIndex(slideState, m.index, m.player);
      }
    }
  }
  winningLine = null;
  renderBoard();

  isReplaying = true;
  replayBtn2.disabled = true;
  statusEl.textContent = 'Replaying move\u2026';
  statusEl.className = 'status';

  await sleep(400);
  if (!isReplaying) { restoreAfterReplay(); return; }

  // Replay each move with animation
  for (const move of movesToReplay) {
    if (!isReplaying) break;

    if (move.type === 'classic') {
      if (isVanishMode()) {
        const r = applyMoveVanish(board, move.index, move.player, classicMoveOrder);
        board = r.board;
        classicMoveOrder = r.moveOrder;
        if (r.removed !== null) {
          renderBoard();
          animateGhostOut(r.removed);
          await sleep(300);
          if (!isReplaying) break;
        }
      } else {
        board = applyMove(board, move.index, move.player);
      }
      renderBoard();
      animatePieceDrop(move.index);
      statusEl.textContent = `${move.player} places`;
      await sleep(REPLAY_STEP_DELAY);
    } else {
      const hasRotation = move.rotation !== 0;
      const hasShift = move.shift.dx !== 0 || move.shift.dy !== 0;

      if (hasRotation) {
        let steps, dir;
        if (move.rotation <= 4) { steps = move.rotation; dir = 'cw'; }
        else { steps = 8 - move.rotation; dir = 'ccw'; }
        for (let i = 0; i < steps; i++) slideState = applyRotation(slideState, dir);
        const degrees = dir === 'cw' ? steps * 45 : -steps * 45;
        boardWrapperEl.style.transition = `transform ${REPLAY_ANIM_ROTATE}ms ${ANIM_EASING_FAST}`;
        boardWrapperEl.style.transform = `rotate(${degrees}deg)`;
        await sleep(REPLAY_ANIM_ROTATE + 30);
        if (!isReplaying) break;
        boardWrapperEl.style.transition = 'none';
        boardWrapperEl.style.transform = '';
        renderBoard();
        statusEl.textContent = `${move.player} rotates`;
        await sleep(REPLAY_STEP_DELAY);
        if (!isReplaying) break;
      }

      if (hasShift) {
        slideState = applyShift(slideState, move.shift.dx, move.shift.dy);
        const visDx = -move.shift.dx, visDy = -move.shift.dy;
        const px = getCellPx();
        boardWrapperEl.style.transition = `transform ${REPLAY_ANIM_SHIFT}ms ${ANIM_EASING_FAST}`;
        boardWrapperEl.style.transform = `translate(${visDx * px}px, ${visDy * px}px)`;
        await sleep(REPLAY_ANIM_SHIFT + 30);
        if (!isReplaying) break;
        boardWrapperEl.style.transition = 'none';
        boardWrapperEl.style.transform = '';
        renderBoard();
        statusEl.textContent = `${move.player} shifts`;
        await sleep(REPLAY_STEP_DELAY);
        if (!isReplaying) break;
      }

      if (!hasRotation && !hasShift && move.transformedState) {
        slideState = cloneSlideState(move.transformedState);
      }

      if (isVanishMode()) {
        const r = applySlideMoveByIndexVanish(slideState, move.index, move.player);
        if (r) {
          slideState = r.state;
          if (r.removed !== null) {
            renderBoard();
            animateGhostOut(r.removed);
            await sleep(300);
            if (!isReplaying) break;
          }
        }
      } else {
        slideState = applySlideMoveByIndex(slideState, move.index, move.player);
      }
      renderBoard();
      animatePieceDrop(move.index);
      statusEl.textContent = `${move.player} places`;
      await sleep(REPLAY_STEP_DELAY);
    }
  }

  // Restore actual game state
  board = savedBoard;
  if (savedSlide) slideState = savedSlide;
  currentPlayer = savedPlayer;
  slidePhase = savedPhase;
  winningLine = savedWinLine;

  isReplaying = false;
  boardWrapperEl.style.transition = '';
  boardWrapperEl.style.transform = '';
  renderBoard();
  renderStatus();
  updateSlideUI();
  updateUndoRedoButtons();
}

function startReplay() {
  stopReplay();
  if (savedMoveHistory.length === 0) return;

  isReplaying = true;
  replayBtn.disabled = true;
  replayBtn2.disabled = true;

  // Reset to empty state
  board = createBoard();
  slideState = createSlideState(isVanishMode());
  classicMoveOrder = [];
  winningLine = null;
  visualRotationDeg = 0;

  boardWrapperEl.classList.remove('animating', 'human-move');
  boardWrapperEl.style.transition = '';
  boardWrapperEl.style.transform = '';

  renderBoard();
  statusEl.textContent = 'Replaying\u2026';
  statusEl.className = 'status';
  resultEl.classList.add('hidden');

  replayAsync();
}

async function replayAsync() {
  await sleep(500);
  if (!isReplaying) return;

  for (const move of savedMoveHistory) {
    if (!isReplaying) return;

    if (move.type === 'classic') {
      if (isVanishMode()) {
        const r = applyMoveVanish(board, move.index, move.player, classicMoveOrder);
        board = r.board;
        classicMoveOrder = r.moveOrder;
        if (r.removed !== null) {
          renderBoard();
          animateGhostOut(r.removed);
          await sleep(300);
          if (!isReplaying) return;
        }
      } else {
        board = applyMove(board, move.index, move.player);
      }

      const w = getWinner(board);
      if (w) winningLine = w.line;

      renderBoard();
      animatePieceDrop(move.index);
      statusEl.textContent = `${move.player} places`;

      await sleep(REPLAY_STEP_DELAY);
      if (!isReplaying) return;

    } else {
      // Slide move
      const hasRotation = move.rotation !== 0;
      const hasShift = move.shift.dx !== 0 || move.shift.dy !== 0;

      // 1. Rotation
      if (hasRotation) {
        let steps, dir;
        if (move.rotation <= 4) {
          steps = move.rotation;
          dir = 'cw';
        } else {
          steps = 8 - move.rotation;
          dir = 'ccw';
        }

        const oldPositions = snapshotPiecePositions();

        for (let i = 0; i < steps; i++) {
          slideState = applyRotation(slideState, dir);
        }

        const degrees = dir === 'cw' ? steps * 45 : -steps * 45;
        boardWrapperEl.style.transition = `transform ${REPLAY_ANIM_ROTATE}ms ${ANIM_EASING_FAST}`;
        boardWrapperEl.style.transform = `rotate(${degrees}deg)`;

        await sleep(REPLAY_ANIM_ROTATE + 30);
        if (!isReplaying) return;

        boardWrapperEl.style.transition = 'none';
        boardWrapperEl.style.transform = '';
        renderBoard();

        statusEl.textContent = `${move.player} rotates board`;

        await sleep(REPLAY_STEP_DELAY);
        if (!isReplaying) return;
      }

      // 2. Shift
      if (hasShift) {
        slideState = applyShift(slideState, move.shift.dx, move.shift.dy);

        const visDx = -move.shift.dx;
        const visDy = -move.shift.dy;
        const px = getCellPx();

        boardWrapperEl.style.transition = `transform ${REPLAY_ANIM_SHIFT}ms ${ANIM_EASING_FAST}`;
        boardWrapperEl.style.transform = `translate(${visDx * px}px, ${visDy * px}px)`;

        await sleep(REPLAY_ANIM_SHIFT + 30);
        if (!isReplaying) return;

        boardWrapperEl.style.transition = 'none';
        boardWrapperEl.style.transform = '';
        renderBoard();

        statusEl.textContent = `${move.player} shifts board`;

        await sleep(REPLAY_STEP_DELAY);
        if (!isReplaying) return;
      }

      // 3. If no transform but transformedState exists, sync
      if (!hasRotation && !hasShift && move.transformedState) {
        slideState = cloneSlideState(move.transformedState);
      }

      // 4. Placement
      if (isVanishMode()) {
        const r = applySlideMoveByIndexVanish(slideState, move.index, move.player);
        if (r) {
          slideState = r.state;
          if (r.removed !== null) {
            renderBoard();
            animateGhostOut(r.removed);
            await sleep(300);
            if (!isReplaying) return;
          }
        }
      } else {
        slideState = applySlideMoveByIndex(slideState, move.index, move.player);
      }

      const w = getSlideWinner(slideState);
      if (w) winningLine = w.line;

      renderBoard();
      animatePieceDrop(move.index);
      statusEl.textContent = `${move.player} places`;

      await sleep(REPLAY_STEP_DELAY);
      if (!isReplaying) return;
    }
  }

  finishReplay();
}

function finishReplay() {
  isReplaying = false;

  // Rebuild final state from savedMoveHistory
  board = createBoard();
  slideState = createSlideState(isVanishMode());
  classicMoveOrder = [];
  winningLine = null;

  for (const move of savedMoveHistory) {
    if (move.type === 'classic') {
      if (isVanishMode()) {
        const r = applyMoveVanish(board, move.index, move.player, classicMoveOrder);
        board = r.board;
        classicMoveOrder = r.moveOrder;
      } else {
        board = applyMove(board, move.index, move.player);
      }
    } else {
      if (move.transformedState) {
        slideState = cloneSlideState(move.transformedState);
      }
      if (isVanishMode()) {
        const r = applySlideMoveByIndexVanish(slideState, move.index, move.player);
        if (r) slideState = r.state;
      } else {
        slideState = applySlideMoveByIndex(slideState, move.index, move.player);
      }
    }
  }

  // Check final result
  const b = currentBoard();
  const result = isSlide() ? getSlideWinner(slideState) : getWinner(b);
  if (result) {
    winningLine = result.line;
    gameOver = true;
  } else {
    gameOver = true; // must have been a draw
  }

  replayBtn.disabled = false;
  renderBoard();
  renderStatus();
}

function stopReplay() {
  isReplaying = false;
  boardWrapperEl.style.transition = '';
  boardWrapperEl.style.transform = '';
}

function handlePlayAgain() {
  stopReplay();
  aivaiRunning = false;
  savedMoveHistory = [];
  newGame();
}

// ── Hint ───────────────────────────────────────────────────
async function showHint() {
  if (gameOver || isAnimating || isReplaying || isAITurn()) return;

  // Show thinking indicator immediately
  showHintThinking();

  // Yield to let the DOM update before heavy AI computation
  await sleep(50);

  const cellNames = [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ];

  const cellIcons = ['↖', '⬆', '↗', '⬅', '◎', '➡', '↙', '⬇', '↘'];

  // Build ordered steps
  const steps = [];

  if (isSlide()) {
    const result = getSlideAIMove(slideState, currentPlayer, 'hard');
    const hintIndex = result.placement;
    if (hintIndex === null || hintIndex === undefined) { clearHintPanel(); return; }

    const hasShift = result.shift && (result.shift.dx !== 0 || result.shift.dy !== 0);
    const hasRotation = result.rotation && result.rotation !== 0;

    // Break rotation into individual 45° steps
    if (hasRotation) {
      let steps_count, dir;
      if (result.rotation <= 4) {
        steps_count = result.rotation;
        dir = 'cw';
      } else {
        steps_count = 8 - result.rotation;
        dir = 'ccw';
      }
      for (let i = 0; i < steps_count; i++) {
        steps.push({
          icon: dir === 'cw' ? '↻' : '↺',
          text: `Rotate 45° ${dir === 'cw' ? 'right' : 'left'}`,
          type: 'rotate'
        });
      }
    }

    // Shift step
    if (hasShift) {
      const vx = -result.shift.dx, vy = -result.shift.dy;
      const dirNames = {
        '-1,-1': { arrow: '↖', name: 'up-left' },
        '0,-1':  { arrow: '↑', name: 'up' },
        '1,-1':  { arrow: '↗', name: 'up-right' },
        '-1,0':  { arrow: '←', name: 'left' },
        '1,0':   { arrow: '→', name: 'right' },
        '-1,1':  { arrow: '↙', name: 'down-left' },
        '0,1':   { arrow: '↓', name: 'down' },
        '1,1':   { arrow: '↘', name: 'down-right' }
      };
      const d = dirNames[`${vx},${vy}`] || { arrow: '?', name: 'unknown' };
      steps.push({
        icon: d.arrow,
        text: `Slide board ${d.name}`,
        type: 'shift'
      });
    }

    // Placement step
    steps.push({
      icon: currentPlayer === 'X' ? '✕' : '○',
      text: `Place on ${cellNames[hintIndex] || hintIndex}`,
      type: 'place'
    });

  } else {
    // Classic mode
    const vanish = isVanishMode();
    const hintIndex = getAIMove(board, currentPlayer, 'hard', vanish, classicMoveOrder);
    if (hintIndex === null || hintIndex === undefined) { clearHintPanel(); return; }

    steps.push({
      icon: currentPlayer === 'X' ? '✕' : '○',
      text: `Place on ${cellNames[hintIndex] || hintIndex}`,
      type: 'place'
    });
  }

  // Replace thinking panel with actual steps
  showHintPanel(steps);
}

function showHintThinking() {
  clearHintPanel();

  const panel = document.createElement('div');
  panel.id = 'hint-panel';
  panel.className = 'hint-panel';

  const header = document.createElement('div');
  header.className = 'hint-panel-header';
  header.innerHTML = '<span class="hint-panel-icon">💡</span> Best Move';
  panel.appendChild(header);

  const thinking = document.createElement('div');
  thinking.className = 'hint-thinking';
  thinking.innerHTML = '<span class="hint-thinking-icon">⏳</span><span class="hint-thinking-text">Thinking…</span>';
  panel.appendChild(thinking);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'hint-panel-close';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Dismiss';
  closeBtn.addEventListener('click', clearHintPanel);
  panel.appendChild(closeBtn);

  document.getElementById('hint-slot').appendChild(panel);
}

function showHintPanel(steps) {
  // Remove existing panel (thinking state)
  const existing = document.getElementById('hint-panel');
  if (existing) {
    if (existing._timeout) clearTimeout(existing._timeout);
    existing.remove();
  }

  const panel = document.createElement('div');
  panel.id = 'hint-panel';
  panel.className = 'hint-panel';

  const header = document.createElement('div');
  header.className = 'hint-panel-header';
  header.innerHTML = '<span class="hint-panel-icon">💡</span> Best Move';
  panel.appendChild(header);

  const list = document.createElement('ol');
  list.className = 'hint-panel-steps';

  for (const step of steps) {
    const li = document.createElement('li');
    li.className = `hint-step hint-step-${step.type}`;
    li.innerHTML = `<span class="hint-step-icon">${step.icon}</span><span class="hint-step-text">${step.text}</span>`;
    list.appendChild(li);
  }

  panel.appendChild(list);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'hint-panel-close';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Dismiss';
  closeBtn.addEventListener('click', clearHintPanel);
  panel.appendChild(closeBtn);

  document.getElementById('hint-slot').appendChild(panel);
}

function clearHintPanel() {
  const panel = document.getElementById('hint-panel');
  if (panel) {
    if (panel._timeout) clearTimeout(panel._timeout);
    panel.classList.add('hint-panel-exit');
    setTimeout(() => panel.remove(), 300);
  }
}

function clearHintHighlight() {
  boardEl.querySelectorAll('.cell-hint').forEach(cell => {
    cell.classList.remove('cell-hint');
  });
}

// ── Toast ──────────────────────────────────────────────────
function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Board Disable ──────────────────────────────────────────
function disableBoard() {
  boardEl.querySelectorAll('.cell').forEach(cell => cell.disabled = true);
  document.querySelectorAll('.shift-btn').forEach(btn => btn.disabled = true);
  if (shiftResetBtn) shiftResetBtn.disabled = true;
  if (rotateCWBtn) rotateCWBtn.disabled = true;
  if (rotateCCWBtn) rotateCCWBtn.disabled = true;
}

// ── Reset Score ────────────────────────────────────────────
function handleResetScore() {
  score = resetScore(settings.variant);
  renderScore();
}

// ── Render Status ──────────────────────────────────────────
function renderStatus() {
  if (gameOver) {
    if (winningLine) {
      const winner = currentBoard()[winningLine[0]];
      statusEl.textContent = `${winner} wins!`;
      statusEl.className = 'status status-win';
    } else {
      statusEl.textContent = 'Draw!';
      statusEl.className = 'status status-draw';
    }
    resultEl.classList.remove('hidden');

    // Hide slide UI when game over
    if (isSlide()) {
      phaseIndicatorEl.classList.add('hidden');
      shiftControlsEl.classList.add('hidden');
      shiftExtrasEl.classList.add('hidden');
    }
  } else {
    if (isAIvsAI()) {
      statusEl.innerHTML = `\u{1F441} AI vs AI &mdash; ${currentPlayer} <span class="thinking-dots">thinking</span>`;
      statusEl.className = 'status status-thinking';
    } else if (isAITurn()) {
      statusEl.innerHTML = `<span class="thinking-dots">\u{1F914} ${currentPlayer} is thinking</span>`;
      statusEl.className = 'status status-thinking';
    } else {
      statusEl.textContent = `${currentPlayer}'s turn`;
      statusEl.className = 'status';
    }
    resultEl.classList.add('hidden');
  }
}

// ── Render Score ───────────────────────────────────────────
function renderScore() {
  scoreXEl.textContent = score.X;
  scoreOEl.textContent = score.O;
  scoreDrawEl.textContent = score.draws;
}
