// ============================================================
// slide-ai.js — AI for TicTacSlide variant
// ============================================================

import { nextPlayer } from './game.js?v=22replay';
import {
  cloneSlideState, piecesToBoard, getValidShifts, applyShift,
  applySlideMoveByIndex, getValidPlacements, getSlideWinner, isSlideDraw,
  applyRotation
} from './slide-game.js?v=22replay';
import { WINNING_LINES } from './game.js?v=22replay';

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

  // Blend: 75% current position, 25% rotation vulnerability
  return baseScore * 0.75 + worstAfterRotation * 0.25;
}

/**
 * Build the list of pre-placement transformations for a given state.
 * Full version: identity, shifts, multi-step rotations.
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

  // Shifts
  const shifts = getValidShifts(state);
  for (const shift of shifts) {
    const shifted = applyShift(state, shift.dx, shift.dy);
    if (shifted) {
      transforms.push({ state: shifted, rotation: 0, shift });
    }
  }

  // Multi-step rotations (mutually exclusive with shift)
  if (includeRotations) {
    // CW: 1-4 steps
    let rState = state;
    for (let steps = 1; steps <= 4; steps++) {
      rState = applyRotation(rState, 'cw');
      transforms.push({
        state: cloneSlideState(rState),
        rotation: steps,
        shift: { dx: 0, dy: 0 },
      });
    }
    // CCW: 1-3 steps (4 CCW = 4 CW = 180°, already included)
    rState = state;
    for (let steps = 1; steps <= 3; steps++) {
      rState = applyRotation(rState, 'ccw');
      transforms.push({
        state: cloneSlideState(rState),
        rotation: (8 - steps) % 8 || 8,  // 7 = 1 CCW, 6 = 2 CCW, 5 = 3 CCW
        shift: { dx: 0, dy: 0 },
      });
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

  // ── Opening book ─────────────────────────────────────────
  if (pieceCount === 0 && difficulty !== 'easy') {
    // Very first move (no transforms available): randomly pick center or a corner
    const options = [4, 0, 2, 6, 8];
    return { rotation: 0, shift: { dx: 0, dy: 0 }, placement: options[Math.floor(Math.random() * options.length)] };
  }
  // pieceCount === 1: 2nd player now has transforms, fall through to full search

  let maxDepth;
  switch (difficulty) {
    case 'easy':
      maxDepth = 0;
      break;
    case 'medium':
      maxDepth = 2;
      break;
    case 'hard':
    default:
      // Exact game-tree search: 9 - pieceCount
      maxDepth = 9 - pieceCount;
      break;
  }

  const includeRotations = difficulty !== 'easy';
  const transforms = getTransformations(state, includeRotations);

  // ── Fast-path: immediate win ──
  for (const t of transforms) {
    const { canWin } = findForcedMovesForState(t.state, aiPlayer);
    if (canWin !== null) {
      return { rotation: t.rotation, shift: t.shift, placement: canWin };
    }
  }

  // Pre-transform heuristic baseline (for displacement tiebreaker)
  const preTransformEval = evaluateBoard(piecesToBoard(state), aiPlayer);

  let bestScore = -Infinity;
  let allCandidates = [];

  for (const t of transforms) {
    const placements = getValidPlacements(t.state);

    // Displacement tiebreaker
    const postTransformEval = evaluateBoard(piecesToBoard(t.state), aiPlayer);
    const displacement = (postTransformEval - preTransformEval) * 0.1;

    for (const idx of placements) {
      const next = applySlideMoveByIndex(t.state, idx, aiPlayer);
      if (!next) continue;

      // Check immediate win (short-circuit minimax)
      const win = getSlideWinner(next);
      if (win && win.winner === aiPlayer) {
        return { rotation: t.rotation, shift: t.shift, placement: idx };
      }

      const mmScore = minimax(
        next, aiPlayer, nextPlayer(aiPlayer),
        1, maxDepth, -Infinity, Infinity, false
      );

      // Position-quality tiebreaker
      const posQuality = evaluateBoard(piecesToBoard(next), aiPlayer) * 0.001;
      const score = mmScore + displacement + posQuality;

      allCandidates.push({ score, rotation: t.rotation, shift: t.shift, placement: idx });
      if (score > bestScore) bestScore = score;
    }
  }

  // Epsilon grouping + random selection
  const EPSILON = pieceCount >= 4 ? 0 : 0.5;
  const topCandidates = allCandidates.filter(c => c.score >= bestScore - EPSILON);

  const pick = topCandidates[Math.floor(Math.random() * topCandidates.length)];
  return pick
    ? { rotation: pick.rotation, shift: pick.shift, placement: pick.placement }
    : { rotation: 0, shift: { dx: 0, dy: 0 }, placement: 0 };
}
