const KEY = "finance-tracker-cloud";

/**
 * Cloud mode is the default: the bare URL behaves as ?cloud=1, and the address
 * bar is normalised to say so. ?cloud=0 remains available for anyone who types
 * it, and sticks on that device, so the purely local app is always reachable.
 */
export function cloudEnabled() {
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("cloud");

    if (param !== null) {
      const on = param !== "0" && param !== "false";
      localStorage.setItem(KEY, on ? "1" : "0");
      return on;
    }

    // A device that opted out stays opted out without needing the parameter
    if (localStorage.getItem(KEY) === "0") return false;

    // Default: make the mode explicit in the URL without adding a history entry
    url.searchParams.set("cloud", "1");
    window.history.replaceState(null, "", url);
    return true;
  } catch {
    return true;
  }
}
