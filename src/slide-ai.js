// ============================================================
// slide-ai.js — AI for TicTacSlide variant
// ============================================================

import { nextPlayer } from './game.js?v=49sounds';
import {
  cloneSlideState, piecesToBoard, getValidShifts, applyShift,
  applySlideMoveByIndex, getValidPlacements, getSlideWinner, isSlideDraw,
  applyRotation
} from './slide-game.js?v=49sounds';
import { WINNING_LINES } from './game.js?v=49sounds';

/**
 * Evaluate a board position for the AI player.
 * Positive = good for AI, negative = good for opponent.
 */
function evaluateBoard(board, aiPlayer) {
  const opponent = nextPlayer(aiPlayer);
  let score = 0;

  for (const line of WINNING_LINES) {
    const cells = line.map(i => board[i]);
    const aiCount = cells.filter(c => c === aiPlayer).length;
    const oppCount = cells.filter(c => c === opponent).length;

    if (aiCount > 0 && oppCount === 0) {
      if (aiCount === 3) return 1000;
      if (aiCount === 2) score += 10;
      if (aiCount === 1) score += 1;
    } else if (oppCount > 0 && aiCount === 0) {
      if (oppCount === 3) return -1000;
      if (oppCount === 2) score -= 10;
      if (oppCount === 1) score -= 1;
    }
  }

  // Center (rotation-proof, index 4): +/-8
  if (board[4] === aiPlayer) score += 8;
  else if (board[4] === opponent) score -= 8;

  // Corners: +/-3
  const corners = [0, 2, 6, 8];
  const edges = [1, 3, 5, 7];
  for (const i of corners) {
    if (board[i] === aiPlayer) score += 3;
    else if (board[i] === opponent) score -= 3;
  }
  // Edges: +/-1
  for (const i of edges) {
    if (board[i] === aiPlayer) score += 1;
    else if (board[i] === opponent) score -= 1;
  }

  return score;
}

/**
 * Evaluate a position accounting for transform vulnerability.
 * Blends the raw position score with the worst-case score the opponent
 * could achieve via a single rotation.
 */
function evaluateWithVulnerability(state, aiPlayer) {
  const baseScore = evaluateBoard(piecesToBoard(state), aiPlayer);

  // Vulnerability only matters during the transform window (pieces 1-4)
  if (state.pieces.size < 1 || state.pieces.size >= 4) return baseScore;

  // Check worst case after opponent's best single rotation
  let worstAfterRotation = baseScore;
  for (const dir of ['cw', 'ccw']) {
    const rotated = applyRotation(state, dir);
    const rotScore = evaluateBoard(piecesToBoard(rotated), aiPlayer);
    if (rotScore < worstAfterRotation) worstAfterRotation = rotScore;
  }

  // Blend: 85% current position, 15% rotation vulnerability
  return baseScore * 0.85 + worstAfterRotation * 0.15;
}

/**
 * Build the list of pre-placement transformations for a given state.
 * Full version: identity, shifts, rotations, and rotation+shift combos.
 */
function getTransformations(state, includeRotations) {
  const transforms = [];

  // Transforms allowed on moves 2-4 (pieces.size 1-3)
  const canTransform = state.pieces.size >= 1 && state.pieces.size <= 3;
  if (!canTransform) {
    transforms.push({ state, rotation: 0, shift: { dx: 0, dy: 0 } });
    return transforms;
  }

  // Identity
  transforms.push({ state, rotation: 0, shift: { dx: 0, dy: 0 } });

  // Shifts only
  const shifts = getValidShifts(state);
  for (const shift of shifts) {
    const shifted = applyShift(state, shift.dx, shift.dy);
    if (shifted) {
      transforms.push({ state: shifted, rotation: 0, shift });
    }
  }

  // Rotations (and rotation+shift combos)
  if (includeRotations) {
    const rotations = [];

    // CW: 1-4 steps
    let rState = state;
    for (let steps = 1; steps <= 4; steps++) {
      rState = applyRotation(rState, 'cw');
      rotations.push({ state: cloneSlideState(rState), rotation: steps });
    }
    // CCW: 1-3 steps
    rState = state;
    for (let steps = 1; steps <= 3; steps++) {
      rState = applyRotation(rState, 'ccw');
      rotations.push({ state: cloneSlideState(rState), rotation: (8 - steps) % 8 || 8 });
    }

    for (const rot of rotations) {
      // Rotation only
      transforms.push({
        state: rot.state,
        rotation: rot.rotation,
        shift: { dx: 0, dy: 0 },
      });

      // Rotation + shift combos
      const rotShifts = getValidShifts(rot.state);
      for (const shift of rotShifts) {
        const shifted = applyShift(rot.state, shift.dx, shift.dy);
        if (shifted) {
          transforms.push({
            state: shifted,
            rotation: rot.rotation,
            shift,
          });
        }
      }
    }
  }

  return transforms;
}

/**
 * Lighter transformation set for minimax depths >= 1.
 * Identity + shifts + single/double CW + single/double CCW.
 */
function getTransformationsLimited(state, includeRotations) {
  const transforms = [];

  // Transforms on moves 2-4 (pieces.size 1-3)
  const canTransform = state.pieces.size >= 1 && state.pieces.size <= 3;
  if (!canTransform) {
    transforms.push({ state, rotation: 0, shift: { dx: 0, dy: 0 } });
    return transforms;
  }

  transforms.push({ state, rotation: 0, shift: { dx: 0, dy: 0 } });

  const shifts = getValidShifts(state);
  for (const shift of shifts) {
    const shifted = applyShift(state, shift.dx, shift.dy);
    if (shifted) {
      transforms.push({ state: shifted, rotation: 0, shift });
    }
  }

  if (includeRotations) {
    // Single CW (45°)
    const cw1 = applyRotation(state, 'cw');
    transforms.push({ state: cw1, rotation: 1, shift: { dx: 0, dy: 0 } });
    // Double CW (90°)
    const cw2 = applyRotation(cw1, 'cw');
    transforms.push({ state: cloneSlideState(cw2), rotation: 2, shift: { dx: 0, dy: 0 } });
    // Single CCW (45°)
    const ccw1 = applyRotation(state, 'ccw');
    transforms.push({ state: ccw1, rotation: 7, shift: { dx: 0, dy: 0 } });
    // Double CCW (90°)
    const ccw2 = applyRotation(ccw1, 'ccw');
    transforms.push({ state: cloneSlideState(ccw2), rotation: 6, shift: { dx: 0, dy: 0 } });
  }

  return transforms;
}

/**
 * Minimax with alpha-beta for slide mode.
 * Each "move" is a (rotation, shift, placement) triple.
 */
function minimax(state, aiPlayer, currentTurnPlayer, depth, maxDepth, alpha, beta, isMaximizing) {
  // Terminal checks
  const winner = getSlideWinner(state);
  if (winner) {
    return winner.winner === aiPlayer ? (100 - depth) : (depth - 100);
  }
  if (isSlideDraw(state)) return 0;
  if (depth >= maxDepth) {
    return evaluateWithVulnerability(state, aiPlayer);
  }

  // All depths >= 1 use limited transforms
  const transforms = getTransformationsLimited(state, true);
  const opponent = nextPlayer(currentTurnPlayer);

  if (isMaximizing) {
    let best = -Infinity;
    for (const t of transforms) {
      const placements = getValidPlacements(t.state);
      for (const idx of placements) {
        const next = applySlideMoveByIndex(t.state, idx, currentTurnPlayer);
        if (!next) continue;
        const score = minimax(next, aiPlayer, opponent, depth + 1, maxDepth, alpha, beta, false);
        best = Math.max(best, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const t of transforms) {
      const placements = getValidPlacements(t.state);
      for (const idx of placements) {
        const next = applySlideMoveByIndex(t.state, idx, currentTurnPlayer);
        if (!next) continue;
        const score = minimax(next, aiPlayer, opponent, depth + 1, maxDepth, alpha, beta, true);
        best = Math.min(best, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      if (beta <= alpha) break;
    }
    return best;
  }
}

/**
 * Check if placing at a given index would let a player win.
 */
function wouldWin(state, idx, player) {
  const next = applySlideMoveByIndex(state, idx, player);
  if (!next) return false;
  const w = getSlideWinner(next);
  return w && w.winner === player;
}

/**
 * Find forced winning moves for a given transformed state.
 */
function findForcedMovesForState(tState, aiPlayer) {
  const placements = getValidPlacements(tState);
  let canWin = null;

  for (const idx of placements) {
    if (canWin === null && wouldWin(tState, idx, aiPlayer)) canWin = idx;
  }

  return { canWin };
}

/**
 * Get the best (rotation, shift, placement) triple for the AI.
 * @param {SlideState} state
 * @param {string} aiPlayer
 * @param {'hard'|'medium'|'easy'} [difficulty='hard']
 */
export function getSlideAIMove(state, aiPlayer, difficulty = 'hard') {
  const pieceCount = state.pieces.size;

  // ── EASY: plays smart but no transforms ──────────────────
  if (difficulty === 'easy') {
    return getSlideAIMoveEasy(state, aiPlayer);
  }

  // ── MEDIUM: plays smart with one transform (single rotation OR single shift) ──
  if (difficulty === 'medium') {
    return getSlideAIMoveMedium(state, aiPlayer);
  }

  // ── HARD: full-strength with transforms ───────────────────

  // Opening book (first move only — no pieces to transform)
  if (pieceCount === 0) {
    const options = [4, 0, 2, 6, 8];
    return { rotation: 0, shift: { dx: 0, dy: 0 }, placement: options[Math.floor(Math.random() * options.length)] };
  }

  // No opening book for pieceCount === 1 — let transforms be considered

  // During vanishing phase (6 pieces, BF=3, no transforms) we can search deeply;
  // pre-vanish uses the standard formula.
  const maxDepth = (state.vanish && pieceCount >= 6) ? 4 : (9 - pieceCount);

  const transforms = getTransformations(state, true);

  // Fast-path: immediate win
  for (const t of transforms) {
    const { canWin } = findForcedMovesForState(t.state, aiPlayer);
    if (canWin !== null) {
      return { rotation: t.rotation, shift: t.shift, placement: canWin };
    }
  }

  const preTransformEval = evaluateBoard(piecesToBoard(state), aiPlayer);

  let bestScore = -Infinity;
  let allCandidates = [];

  for (const t of transforms) {
    const placements = getValidPlacements(t.state);
    const postTransformEval = evaluateBoard(piecesToBoard(t.state), aiPlayer);
    const displacement = (postTransformEval - preTransformEval) * 0.1;

    for (const idx of placements) {
      const next = applySlideMoveByIndex(t.state, idx, aiPlayer);
      if (!next) continue;

      const win = getSlideWinner(next);
      if (win && win.winner === aiPlayer) {
        return { rotation: t.rotation, shift: t.shift, placement: idx };
      }

      const mmScore = minimax(
        next, aiPlayer, nextPlayer(aiPlayer),
        1, maxDepth, -Infinity, Infinity, false
      );

      const posQuality = evaluateBoard(piecesToBoard(next), aiPlayer) * 0.001;
      const score = mmScore + displacement + posQuality;

      allCandidates.push({ score, rotation: t.rotation, shift: t.shift, placement: idx });
      if (score > bestScore) bestScore = score;
    }
  }

  const EPSILON = pieceCount >= 4 ? 0 : 0.5;
  const topCandidates = allCandidates.filter(c => c.score >= bestScore - EPSILON);

  const pick = topCandidates[Math.floor(Math.random() * topCandidates.length)];
  return pick
    ? { rotation: pick.rotation, shift: pick.shift, placement: pick.placement }
    : { rotation: 0, shift: { dx: 0, dy: 0 }, placement: 0 };
}

// ── Easy AI ────────────────────────────────────────────────
// Plays just as smart as Hard but NEVER rotates or shifts the board.
// Full minimax search, just limited to identity transform only.
function getSlideAIMoveEasy(state, aiPlayer) {
  const pieceCount = state.pieces.size;

  // Opening: center or corner
  if (pieceCount === 0) {
    const options = [4, 0, 2, 6, 8];
    return { rotation: 0, shift: { dx: 0, dy: 0 }, placement: options[Math.floor(Math.random() * options.length)] };
  }

  // Response to first move: take center if open, else a corner
  if (pieceCount === 1) {
    const board = piecesToBoard(state);
    if (board[4] === null) {
      return { rotation: 0, shift: { dx: 0, dy: 0 }, placement: 4 };
    }
    const corners = [0, 2, 6, 8].filter(i => board[i] === null);
    if (corners.length > 0) {
      return { rotation: 0, shift: { dx: 0, dy: 0 }, placement: corners[Math.floor(Math.random() * corners.length)] };
    }
  }

  const maxDepth = 9 - pieceCount;

  // Identity only — no rotations, no shifts
  const transforms = [{ state, rotation: 0, shift: { dx: 0, dy: 0 } }];

  // Fast-path: immediate win
  for (const t of transforms) {
    const { canWin } = findForcedMovesForState(t.state, aiPlayer);
    if (canWin !== null) {
      return { rotation: 0, shift: { dx: 0, dy: 0 }, placement: canWin };
    }
  }

  let bestScore = -Infinity;
  let allCandidates = [];

  const placements = getValidPlacements(state);
  for (const idx of placements) {
    const next = applySlideMoveByIndex(state, idx, aiPlayer);
    if (!next) continue;

    const win = getSlideWinner(next);
    if (win && win.winner === aiPlayer) {
      return { rotation: 0, shift: { dx: 0, dy: 0 }, placement: idx };
    }

    const mmScore = minimax(
      next, aiPlayer, nextPlayer(aiPlayer),
      1, maxDepth, -Infinity, Infinity, false
    );

    const posQuality = evaluateBoard(piecesToBoard(next), aiPlayer) * 0.001;
    const score = mmScore + posQuality;

    allCandidates.push({ score, placement: idx });
    if (score > bestScore) bestScore = score;
  }

  const EPSILON = pieceCount >= 4 ? 0 : 0.5;
  const topCandidates = allCandidates.filter(c => c.score >= bestScore - EPSILON);

  const pick = topCandidates[Math.floor(Math.random() * topCandidates.length)];
  return pick
    ? { rotation: 0, shift: { dx: 0, dy: 0 }, placement: pick.placement }
    : { rotation: 0, shift: { dx: 0, dy: 0 }, placement: 0 };
}
// ── Medium AI ──────────────────────────────────────────────
// Plays smart (full minimax) but limited to ONE transform per turn:
// either a single 45° rotation OR a single 1-cell shift. No combos.
function getSlideAIMoveMedium(state, aiPlayer) {
  const pieceCount = state.pieces.size;

  // Opening: center or corner (no pieces to transform yet)
  if (pieceCount === 0) {
    const options = [4, 0, 2, 6, 8];
    return { rotation: 0, shift: { dx: 0, dy: 0 }, placement: options[Math.floor(Math.random() * options.length)] };
  }

  // No opening book for pieceCount === 1 — let transforms be considered

  const maxDepth = 9 - pieceCount;

  // Medium transforms: identity + single shifts + single rotation CW/CCW
  const transforms = getMediumTransformations(state);

  // Fast-path: immediate win
  for (const t of transforms) {
    const { canWin } = findForcedMovesForState(t.state, aiPlayer);
    if (canWin !== null) {
      return { rotation: t.rotation, shift: t.shift, placement: canWin };
    }
  }

  const preTransformEval = evaluateBoard(piecesToBoard(state), aiPlayer);

  let bestScore = -Infinity;
  let allCandidates = [];

  for (const t of transforms) {
    const placements = getValidPlacements(t.state);
    const postTransformEval = evaluateBoard(piecesToBoard(t.state), aiPlayer);
    const displacement = (postTransformEval - preTransformEval) * 0.1;

    for (const idx of placements) {
      const next = applySlideMoveByIndex(t.state, idx, aiPlayer);
      if (!next) continue;

      const win = getSlideWinner(next);
      if (win && win.winner === aiPlayer) {
        return { rotation: t.rotation, shift: t.shift, placement: idx };
      }

      const mmScore = minimax(
        next, aiPlayer, nextPlayer(aiPlayer),
        1, maxDepth, -Infinity, Infinity, false
      );

      const posQuality = evaluateBoard(piecesToBoard(next), aiPlayer) * 0.001;
      const score = mmScore + displacement + posQuality;

      allCandidates.push({ score, rotation: t.rotation, shift: t.shift, placement: idx });
      if (score > bestScore) bestScore = score;
    }
  }

  const EPSILON = pieceCount >= 4 ? 0 : 0.5;
  const topCandidates = allCandidates.filter(c => c.score >= bestScore - EPSILON);

  const pick = topCandidates[Math.floor(Math.random() * topCandidates.length)];
  return pick
    ? { rotation: pick.rotation, shift: pick.shift, placement: pick.placement }
    : { rotation: 0, shift: { dx: 0, dy: 0 }, placement: 0 };
}

/**
 * Medium-level transformations: identity + single shifts + single 45° CW/CCW.
 * No multi-step rotations, no rotation+shift combos.
 */
function getMediumTransformations(state) {
  const transforms = [];

  // Transforms allowed on moves 2-4 (pieces.size 1-3)
  const canTransform = state.pieces.size >= 1 && state.pieces.size <= 3;
  if (!canTransform) {
    transforms.push({ state, rotation: 0, shift: { dx: 0, dy: 0 } });
    return transforms;
  }

  // Identity
  transforms.push({ state, rotation: 0, shift: { dx: 0, dy: 0 } });

  // Single shifts (8 directions)
  const shifts = getValidShifts(state);
  for (const shift of shifts) {
    const shifted = applyShift(state, shift.dx, shift.dy);
    if (shifted) {
      transforms.push({ state: shifted, rotation: 0, shift });
    }
  }

  // Single 45° CW rotation
  const cw1 = applyRotation(state, 'cw');
  transforms.push({ state: cw1, rotation: 1, shift: { dx: 0, dy: 0 } });

  // Single 45° CCW rotation
  const ccw1 = applyRotation(state, 'ccw');
  transforms.push({ state: ccw1, rotation: 7, shift: { dx: 0, dy: 0 } });

  return transforms;
}