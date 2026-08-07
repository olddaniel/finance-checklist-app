// The theme is already on <html> by the time React boots — index.html applies it
// before first paint so the app never flashes the wrong one. This module is only
// the read/write side of that same attribute.
const KEY = "theme";

export function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // Keeps the browser/PWA chrome in step with the page
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#22232e" : "#ffffff";
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: the choice holds for this session only
  }
}
