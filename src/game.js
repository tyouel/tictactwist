// ============================================================
// game.js — Core 3×3 logic (board, winner, draw, moves)
// ============================================================

export const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],  // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],  // columns
  [0, 4, 8], [2, 4, 6],              // diagonals
];

/**
 * Create an empty 3×3 board.
 */
export function createBoard() {
  return Array(9).fill(null);
}

/**
 * Check for a winner.
 * @returns {{ winner: string, line: number[] }} or null
 */
export function getWinner(board) {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

/**
 * Check for a draw (board full, no winner).
 * In vanishing mode, the board never fills — draws only via repetition (handled in UI).
 */
export function isDraw(board) {
  return !getWinner(board) && board.every(cell => cell !== null);
}

/**
 * Apply a move to the board (immutable).
 * @returns {Array|null} New board or null if invalid.
 */
export function applyMove(board, index, player) {
  if (index < 0 || index > 8 || board[index] !== null) return null;
  const newBoard = [...board];
  newBoard[index] = player;
  return newBoard;
}

/**
 * Maximum pieces per player in vanishing-pieces mode (Expert).
 */
export const MAX_PIECES_PER_PLAYER = 3;

/**
 * Apply a move with the vanishing-pieces rule.
 * moveOrder is an array of { index, player } in placement order.
 * If the player already has MAX_PIECES_PER_PLAYER pieces on the board,
 * the oldest piece is removed before (logically after) placement.
 * @returns {{ board, moveOrder, removed: number|null }} or null if invalid.
 */
export function applyMoveVanish(board, index, player, moveOrder) {
  if (index < 0 || index > 8 || board[index] !== null) return null;
  const newBoard = [...board];
  newBoard[index] = player;
  const newOrder = [...moveOrder, { index, player }];

  // Count this player's pieces (including the one just placed)
  const playerMoves = newOrder.filter(m => m.player === player);
  let removed = null;

  if (playerMoves.length > MAX_PIECES_PER_PLAYER) {
    // Remove the oldest piece of this player
    const oldest = playerMoves[0];
    newBoard[oldest.index] = null;
    removed = oldest.index;
    // Remove from order tracking
    const oldestGlobalIdx = newOrder.findIndex(
      m => m.index === oldest.index && m.player === oldest.player
    );
    newOrder.splice(oldestGlobalIdx, 1);
  }

  return { board: newBoard, moveOrder: newOrder, removed };
}

/**
 * Get all valid (empty) cell indices.
 */
export function getValidMoves(board) {
  return board.reduce((moves, cell, i) => {
    if (cell === null) moves.push(i);
    return moves;
  }, []);
}

/**
 * Toggle player: 'X' ↔ 'O'.
 */
export function nextPlayer(player) {
  return player === 'X' ? 'O' : 'X';
}
