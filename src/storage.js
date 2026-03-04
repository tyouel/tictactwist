// ============================================================
// storage.js — localStorage persistence
// ============================================================

const SETTINGS_KEY = 'tictacted_settings';
const SCORE_KEY_PREFIX = 'tictacted_score_';

const DEFAULT_SETTINGS = {
  variant: 'classic',    // 'classic' | 'slide'
  mode: 'hvh',           // 'hvh' | 'hvai' | 'aivh' | 'aivai'
  difficulty: 'hard',    // 'easy' | 'medium' | 'hard'
  startingPlayer: 'X',   // 'X' | 'O'
  soundEnabled: true,
};

const DEFAULT_SCORE = { X: 0, O: 0, draws: 0 };

/**
 * Load settings from localStorage (with defaults).
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to localStorage.
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

/**
 * Load scoreboard from localStorage for a given variant.
 */
export function loadScore(variant = 'classic') {
  try {
    const raw = localStorage.getItem(SCORE_KEY_PREFIX + variant);
    if (raw) return { ...DEFAULT_SCORE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SCORE };
}

/**
 * Save scoreboard to localStorage for a given variant.
 */
export function saveScore(score, variant = 'classic') {
  try {
    localStorage.setItem(SCORE_KEY_PREFIX + variant, JSON.stringify(score));
  } catch { /* ignore */ }
}

/**
 * Reset scoreboard for a given variant.
 */
export function resetScore(variant = 'classic') {
  const fresh = { ...DEFAULT_SCORE };
  saveScore(fresh, variant);
  return fresh;
}
