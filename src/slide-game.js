// ============================================================
// slide-game.js — TicTacTwist game logic (shifts, rotations, isBoardFixed)
// ============================================================

import { getWinner, isDraw } from './game.js?v=36medfix';

// ── CW rotation map (relative coords: rx = col-1, ry = row-1) ──
// (-1,-1)→(-1,0)  (0,-1)→(-1,-1)  (1,-1)→(0,-1)
// (-1,0)→(-1,1)   (0,0)→(0,0)     (1,0)→(1,-1)
// (-1,1)→(0,1)    (0,1)→(1,1)     (1,1)→(1,0)
const CW_MAP = new Map([
  ['-1,-1', '-1,0'],  ['0,-1', '-1,-1'], ['1,-1', '0,-1'],
  ['-1,0',  '-1,1'],  ['0,0',  '0,0'],   ['1,0',  '1,-1'],
  ['-1,1',  '0,1'],   ['0,1',  '1,1'],   ['1,1',  '1,0'],
]);

// CCW is the inverse of CW
const CCW_MAP = new Map();
for (const [from, to] of CW_MAP) {
  CCW_MAP.set(to, from);
}

// ── State Operations ───────────────────────────────────────

export function createSlideState() {
  return { pieces: new Map() };
}

export function cloneSlideState(state) {
  return { pieces: new Map(state.pieces) };
}

/**
 * Project slide state onto a flat 9-element board array.
 * board[row * 3 + col] = player
 */
export function piecesToBoard(state) {
  const board = Array(9).fill(null);
  for (const [key, player] of state.pieces) {
    const [col, row] = key.split(',').map(Number);
    board[row * 3 + col] = player;
  }
  return board;
}

// ── Shift Operations ───────────────────────────────────────

export function isValidShift(state, dx, dy) {
  for (const key of state.pieces.keys()) {
    const [col, row] = key.split(',').map(Number);
    const nc = col + dx;
    const nr = row + dy;
    if (nc < 0 || nc > 2 || nr < 0 || nr > 2) return false;
  }
  return true;
}

export function getValidShifts(state) {
  const shifts = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (isValidShift(state, dx, dy)) {
        shifts.push({ dx, dy });
      }
    }
  }
  return shifts;
}

export function applyShift(state, dx, dy) {
  if (!isValidShift(state, dx, dy)) return null;
  const newPieces = new Map();
  for (const [key, player] of state.pieces) {
    const [col, row] = key.split(',').map(Number);
    newPieces.set(`${col + dx},${row + dy}`, player);
  }
  return { pieces: newPieces };
}

// ── Placement ──────────────────────────────────────────────

export function applySlideMove(state, col, row, player) {
  const key = `${col},${row}`;
  if (state.pieces.has(key)) return null;
  if (col < 0 || col > 2 || row < 0 || row > 2) return null;
  const newState = cloneSlideState(state);
  newState.pieces.set(key, player);
  return newState;
}

export function applySlideMoveByIndex(state, index, player) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return applySlideMove(state, col, row, player);
}

export function getValidPlacements(state) {
  const placements = [];
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    if (!state.pieces.has(`${col},${row}`)) {
      placements.push(i);
    }
  }
  return placements;
}

// ── Win / Draw ─────────────────────────────────────────────

export function getSlideWinner(state) {
  return getWinner(piecesToBoard(state));
}

export function isSlideDraw(state) {
  return isDraw(piecesToBoard(state));
}

// ── Board Fixed Rule ───────────────────────────────────────

/**
 * Returns true when pieces occupy ALL FOUR edges of the board.
 * Corner pieces count toward two edges.
 * When the board is fixed, rotation is disallowed.
 */
export function isBoardFixed(state) {
  const board = piecesToBoard(state);
  const hasTop    = board[0] || board[1] || board[2];
  const hasBottom = board[6] || board[7] || board[8];
  const hasLeft   = board[0] || board[3] || board[6];
  const hasRight  = board[2] || board[5] || board[8];
  return !!(hasTop && hasBottom && hasLeft && hasRight);
}

// ── Rotation (45° Snap-to-Grid) ────────────────────────────

/**
 * Apply one 45° rotation step.
 * @param {SlideState} state
 * @param {'cw'|'ccw'} direction
 * @returns {SlideState}
 */
export function applyRotation(state, direction) {
  const map = direction === 'cw' ? CW_MAP : CCW_MAP;
  const newPieces = new Map();
  for (const [key, player] of state.pieces) {
    const [col, row] = key.split(',').map(Number);
    // Convert to relative coords (center = 1,1)
    const rx = col - 1;
    const ry = row - 1;
    const relKey = `${rx},${ry}`;
    const mapped = map.get(relKey);
    if (mapped) {
      const [nrx, nry] = mapped.split(',').map(Number);
      newPieces.set(`${nrx + 1},${nry + 1}`, player);
    } else {
      // Shouldn't happen, but keep piece in place
      newPieces.set(key, player);
    }
  }
  return { pieces: newPieces };
}
