const KEY = "finance-tracker-cloud";

// Cloud mode is opt-in per device until it has been proven against the real
// project: visit ?cloud=1 to turn it on, ?cloud=0 to fall back to the purely
// local app. The choice sticks, so the PWA keeps whichever mode was chosen.
export function cloudEnabled() {
  try {
    const param = new URLSearchParams(window.location.search).get("cloud");
    if (param !== null) {
      const on = param !== "0" && param !== "false";
      localStorage.setItem(KEY, on ? "1" : "0");
      return on;
    }
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
