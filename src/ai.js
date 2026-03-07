// ============================================================
// ai.js — AI opponents for Tic-Tac-Toe (2D Phase 1)
// ============================================================

import { getWinner, isDraw, applyMove, applyMoveVanish, getValidMoves, nextPlayer, MAX_PIECES_PER_PLAYER } from './game.js?v=49sounds';

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
 * When vanish=true, uses applyMoveVanish to track piece removal.
 * @param {Array<string|null>} board
 * @param {string} aiPlayer - 'X' or 'O'
 * @param {boolean} vanish - whether vanishing-pieces rule is active
 * @param {Array} moveOrder - current move placement order (for vanishing)
 * @returns {number}
 */
export function aiHard(board, aiPlayer, vanish = false, moveOrder = []) {
  const opponent = nextPlayer(aiPlayer);

  // Positional preference for tie-breaking: center > corners > edges
  const POSITION_BONUS = [0.003, 0, 0.003, 0, 0.005, 0, 0.003, 0, 0.003];

  function minimax(board, order, isMaximizing, alpha, beta, depth) {
    const result = getWinner(board);
    if (result) {
      return result.winner === aiPlayer ? (10 - depth) : (depth - 10);
    }
    // In vanishing mode, draws by full board can't happen (pieces get removed).
    // But we still check to avoid infinite loops when vanish is off.
    if (!vanish && isDraw(board)) return 0;
    // Depth limit in vanishing mode to prevent infinite search
    if (vanish && depth >= 12) return 0;

    const moves = getValidMoves(board);

    if (isMaximizing) {
      let best = -Infinity;
      const player = aiPlayer;
      for (const move of moves) {
        let next, nextOrder;
        if (vanish) {
          const res = applyMoveVanish(board, move, player, order);
          if (!res) continue;
          next = res.board;
          nextOrder = res.moveOrder;
        } else {
          next = applyMove(board, move, player);
          nextOrder = order;
        }
        const score = minimax(next, nextOrder, false, alpha, beta, depth + 1);
        best = Math.max(best, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      const player = opponent;
      for (const move of moves) {
        let next, nextOrder;
        if (vanish) {
          const res = applyMoveVanish(board, move, player, order);
          if (!res) continue;
          next = res.board;
          nextOrder = res.moveOrder;
        } else {
          next = applyMove(board, move, player);
          nextOrder = order;
        }
        const score = minimax(next, nextOrder, true, alpha, beta, depth + 1);
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
    let next, nextOrder;
    if (vanish) {
      const res = applyMoveVanish(board, move, aiPlayer, moveOrder);
      if (!res) continue;
      next = res.board;
      nextOrder = res.moveOrder;
    } else {
      next = applyMove(board, move, aiPlayer);
      nextOrder = moveOrder;
    }
    const score = minimax(next, nextOrder, false, -Infinity, Infinity, 1) + POSITION_BONUS[move];
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
 * @param {boolean} vanish - whether vanishing-pieces rule is active
 * @param {Array} moveOrder - current move order (for vanishing mode)
 * @returns {number}
 */
export function getAIMove(board, aiPlayer, difficulty, vanish = false, moveOrder = []) {
  switch (difficulty) {
    case 'easy':   return aiEasy(board);
    case 'medium': return aiMedium(board, aiPlayer);
    case 'hard':   return aiHard(board, aiPlayer, vanish, moveOrder);
    default:       return aiEasy(board);
  }
}
