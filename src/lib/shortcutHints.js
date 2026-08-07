// The confirmation toast is the only moment the app has the user's attention
// right after an action, so it is where the shortcut for that same action is
// worth showing. Two things keep this teaching instead of nagging: it never
// repeats the key the user just pressed, and it retires once learned.
const KEY = "finance-tracker-shortcut-hints";

// Only actions the app actually binds, worded exactly as the shortcut sheet
// words them. An action missing here simply gets no hint.
const HINTS = {
  toggle: ["Espaço"],
};

// A hint that has been ignored three times is not teaching any more.
const MAX_SHOWINGS = 3;

// What the browser last saw — "mouse", "touch" or "keyboard". Asking the
// browser is the honest version: guessing from which handler ran would call a
// Space press on a focused checkbox a mouse click, and hint the key in use.
let lastInput = null;

if (typeof window !== "undefined") {
  // Capture phase, so a handler that stops propagation cannot hide the input
  window.addEventListener("pointerdown", (e) => {
    lastInput = e.pointerType === "mouse" ? "mouse" : "touch";
  }, true);
  window.addEventListener("keydown", () => { lastInput = "keyboard"; }, true);
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}

function write(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
}

// The same test the top bar uses to decide whether to offer the "?" button:
// there has to be a keyboard to graduate to.
function hasKeyboard() {
  return window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;
}

/**
 * The keys to show on the toast for `action`, or null. Called once per toast,
 * and it is also where the bookkeeping happens: an action taken from the
 * keyboard retires its hint for good, a shown hint counts against the cap.
 */
export function hintFor(action) {
  if (!HINTS[action]) return null;

  const state = read();
  const entry = state[action] ?? { shown: 0, used: false };

  if (lastInput === "keyboard") {
    if (!entry.used) write({ ...state, [action]: { ...entry, used: true } });
    return null;
  }

  if (lastInput !== "mouse" || !hasKeyboard()) return null;
  if (entry.used || entry.shown >= MAX_SHOWINGS) return null;

  write({ ...state, [action]: { ...entry, shown: entry.shown + 1 } });
  return HINTS[action];
}
