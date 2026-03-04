// ============================================================
// ai.js — AI opponents for Tic-Tac-Toe (2D Phase 1)
// ============================================================

import { getWinner, isDraw, applyMove, getValidMoves, nextPlayer } from './game.js?v=23replay';

/**
 * Easy AI: picks a random valid move.
 * @param {Array<string|null>} board
 * @returns {number}
 */
export function aiEasy(board) {
  const moves = getValidMoves(board);
  return moves[Math.floor(Math.random() * moves.length)];
}

/**
 * Medium AI: blocks immediate wins/losses, otherwise picks randomly.
 * @param {Array<string|null>} board
 * @param {string} aiPlayer - 'X' or 'O'
 * @returns {number}
 */
export function aiMedium(board, aiPlayer) {
  const opponent = nextPlayer(aiPlayer);
  const moves = getValidMoves(board);

  // 1. Win if possible
  for (const move of moves) {
    const next = applyMove(board, move, aiPlayer);
    if (next && getWinner(next)) return move;
  }

  // 2. Block opponent win
  for (const move of moves) {
    const next = applyMove(board, move, opponent);
    if (next && getWinner(next)) return move;
  }

  // 3. Take center if available
  if (board[4] === null) return 4;

  // 4. Take a corner
  const corners = [0, 2, 6, 8].filter(i => board[i] === null);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // 5. Random
  return moves[Math.floor(Math.random() * moves.length)];
}

/**
 * Hard AI: minimax with alpha-beta pruning — plays optimally.
 * Randomized tie-breaking: collects all moves sharing the best score
 * into a bestMoves array, then picks one at random.
 * @param {Array<string|null>} board
 * @param {string} aiPlayer - 'X' or 'O'
 * @returns {number}
 */
export function aiHard(board, aiPlayer) {
  const opponent = nextPlayer(aiPlayer);

  function minimax(board, isMaximizing, alpha, beta, depth) {
    const result = getWinner(board);
    if (result) {
      // Prefer faster wins (+) and slower losses (-) via depth penalty
      return result.winner === aiPlayer ? (10 - depth) : (depth - 10);
    }
    if (isDraw(board)) return 0;

    const moves = getValidMoves(board);

    if (isMaximizing) {
      let best = -Infinity;
      for (const move of moves) {
        const next = applyMove(board, move, aiPlayer);
        const score = minimax(next, false, alpha, beta, depth + 1);
        best = Math.max(best, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const move of moves) {
        const next = applyMove(board, move, opponent);
        const score = minimax(next, true, alpha, beta, depth + 1);
        best = Math.min(best, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  const moves = getValidMoves(board);
  let bestScore = -Infinity;
  let bestMoves = [];

  for (const move of moves) {
    const next = applyMove(board, move, aiPlayer);
    const score = minimax(next, false, -Infinity, Infinity, 1);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

/**
 * Dispatch AI move based on difficulty.
 * @param {Array<string|null>} board
 * @param {string} aiPlayer
 * @param {'easy'|'medium'|'hard'} difficulty
 * @returns {number}
 */
export function getAIMove(board, aiPlayer, difficulty) {
  switch (difficulty) {
    case 'easy':   return aiEasy(board);
    case 'medium': return aiMedium(board, aiPlayer);
    case 'hard':   return aiHard(board, aiPlayer);
    default:       return aiEasy(board);
  }
}
