// ============================================================
// slide-game.js — TicTacTwist game logic (shifts, rotations, isBoardFixed)
// ============================================================

import { getWinner, isDraw, MAX_PIECES_PER_PLAYER } from './game.js?v=49sounds';

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

export function createSlideState(vanish = false) {
  return { pieces: new Map(), moveOrder: [], vanish };
}

export function cloneSlideState(state) {
  return {
    pieces: new Map(state.pieces),
    moveOrder: state.moveOrder ? [...state.moveOrder] : [],
    vanish: !!state.vanish
  };
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
  const keyMap = new Map(); // oldKey -> newKey
  for (const [key, player] of state.pieces) {
    const [col, row] = key.split(',').map(Number);
    const newKey = `${col + dx},${row + dy}`;
    newPieces.set(newKey, player);
    keyMap.set(key, newKey);
  }
  // Update moveOrder keys
  const newOrder = (state.moveOrder || []).map(m => ({
    key: keyMap.get(m.key) || m.key,
    player: m.player
  }));
  return { pieces: newPieces, moveOrder: newOrder };
}

// ── Placement ──────────────────────────────────────────────

export function applySlideMove(state, col, row, player) {
  const key = `${col},${row}`;
  if (state.pieces.has(key)) return null;
  if (col < 0 || col > 2 || row < 0 || row > 2) return null;
  const newState = cloneSlideState(state);
  newState.pieces.set(key, player);
  newState.moveOrder.push({ key, player });

  // Auto-vanish if flag is set
  if (newState.vanish) {
    const playerMoves = newState.moveOrder.filter(m => m.player === player);
    if (playerMoves.length > MAX_PIECES_PER_PLAYER) {
      const oldest = playerMoves[0];
      newState.pieces.delete(oldest.key);
      const oldestIdx = newState.moveOrder.findIndex(
        m => m.key === oldest.key && m.player === oldest.player
      );
      newState.moveOrder.splice(oldestIdx, 1);
    }
  }

  return newState;
}

/**
 * Apply a slide placement with vanishing-pieces rule.
 * Returns the removed cell index (for UI animation) in addition to the new state.
 * @returns {{ state, removed: string|null }} or null if invalid.
 */
export function applySlideMoveVanish(state, col, row, player) {
  const key = `${col},${row}`;
  if (state.pieces.has(key)) return null;
  if (col < 0 || col > 2 || row < 0 || row > 2) return null;
  const newState = cloneSlideState(state);
  newState.pieces.set(key, player);
  newState.moveOrder.push({ key, player });

  const playerMoves = newState.moveOrder.filter(m => m.player === player);
  let removed = null;

  if (playerMoves.length > MAX_PIECES_PER_PLAYER) {
    const oldest = playerMoves[0];
    newState.pieces.delete(oldest.key);
    removed = oldest.key;
    const oldestIdx = newState.moveOrder.findIndex(
      m => m.key === oldest.key && m.player === oldest.player
    );
    newState.moveOrder.splice(oldestIdx, 1);
  }

  return { state: newState, removed };
}

export function applySlideMoveByIndex(state, index, player) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return applySlideMove(state, col, row, player);
}

/**
 * Apply slide placement by index with vanishing-pieces rule.
 * @returns {{ state, removed: number|null }} or null if invalid.
 */
export function applySlideMoveByIndexVanish(state, index, player) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const result = applySlideMoveVanish(state, col, row, player);
  if (!result) return null;
  let removedIndex = null;
  if (result.removed) {
    const [rc, rr] = result.removed.split(',').map(Number);
    removedIndex = rr * 3 + rc;
  }
  return { state: result.state, removed: removedIndex };
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
  const keyMap = new Map(); // oldKey -> newKey
  for (const [key, player] of state.pieces) {
    const [col, row] = key.split(',').map(Number);
    // Convert to relative coords (center = 1,1)
    const rx = col - 1;
    const ry = row - 1;
    const relKey = `${rx},${ry}`;
    const mapped = map.get(relKey);
    if (mapped) {
      const [nrx, nry] = mapped.split(',').map(Number);
      const newKey = `${nrx + 1},${nry + 1}`;
      newPieces.set(newKey, player);
      keyMap.set(key, newKey);
    } else {
      // Shouldn't happen, but keep piece in place
      newPieces.set(key, player);
      keyMap.set(key, key);
    }
  }
  // Update moveOrder keys
  const newOrder = (state.moveOrder || []).map(m => ({
    key: keyMap.get(m.key) || m.key,
    player: m.player
  }));
  return { pieces: newPieces, moveOrder: newOrder };
}
