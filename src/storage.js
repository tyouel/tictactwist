// ============================================================
// storage.js — localStorage persistence
// ============================================================

const SETTINGS_KEY = 'tictactwist_settings';
const SCORE_KEY_PREFIX = 'tictactwist_score_';
const SETTINGS_VERSION = 5; // bump to reset saved settings to new defaults

const DEFAULT_SETTINGS = {
  _version: SETTINGS_VERSION,
  variant: 'slide',      // 'classic' | 'slide'
  mode: 'hvai',          // 'hvh' | 'hvai' | 'aivh' | 'aivai'
  difficulty: 'easy',    // 'easy' | 'medium' | 'hard'
  difficulty2: 'easy',   // AI (O) difficulty for aivai mode
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
    if (raw) {
      const saved = JSON.parse(raw);
      // If saved settings are from an older version, discard them
      if (saved._version !== SETTINGS_VERSION) {
        localStorage.removeItem(SETTINGS_KEY);
        return { ...DEFAULT_SETTINGS };
      }
      return { ...DEFAULT_SETTINGS, ...saved };
    }
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
