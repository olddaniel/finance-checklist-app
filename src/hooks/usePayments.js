import { useState, useEffect, useCallback } from "react";
import { DEFAULT_PAYMENTS } from "../data";
import { EXPENSE, REVENUE } from "../utils";

const STORAGE_KEY = "payment-tracker-state";

// Group view states, in cycling order — each tap of the progress badge moves one
// step down the list and wraps around.
const VIEW_STATES = ["closed", "semi", "open", "balance"];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded */ }
}

const SORT_MODES = ["manual", "value", "date"];

// Accepts the old boolean shape as well as the current string states
function normalizeCollapsed(saved) {
  return Object.fromEntries(
    Object.entries(saved ?? {}).map(([k, v]) =>
      [k, v === true ? "closed" : VIEW_STATES.includes(v) ? v : "open"]
    )
  );
}

function normalizeDateMode(g) {
  if (g.dateMode) return g.dateMode;        // already migrated
  if (g.noDates) return "none";
  if (g.cycle === "yearly") return "months";
  return "days";
}

function mergeGroups(saved, defaults) {
  if (!saved) return defaults.map((g) => ({ ...g, items: [...g.items] }));

  const defaultMap = Object.fromEntries(defaults.map((g) => [g.id, g]));
  const savedIds   = new Set(saved.map((g) => g.id));

  // Rebuild in saved order — this preserves any user drag-reordering.
  const result = saved.map((s) => {
    const d = defaultMap[s.id];
    if (d) {
      // Known default group: merge saved data on top so renames / dateMode changes survive,
      // while new fields added to defaults in the future still get picked up via ...d.
      return { ...d, ...s, dateMode: normalizeDateMode(s) };
    }
    // User-added group
    return { ...s, dateMode: normalizeDateMode(s) };
  });

  // Append any brand-new default groups not yet in saved state (e.g. future app updates).
  const newDefaults = defaults
    .filter((d) => !savedIds.has(d.id))
    .map((d) => ({ ...d, items: [...d.items] }));

  return [...result, ...newDefaults];
}

// Brings a backup — current or from an older version — up to the shape the app
// expects. Shared by the local and cloud stores so an import behaves the same
// either way.
export function normalizeBackup(data) {
  return {
    groups:          mergeGroups(data.groups, DEFAULT_PAYMENTS),
    checked:         data.checked ?? {},
    snoozed:         data.snoozed ?? {},
    values:          data.values ?? {},
    kinds:           data.kinds ?? {},
    dates:           data.dates ?? {},
    lastResets:      data.lastResets ?? {},
    openingBalances: data.openingBalances ?? {},
    sortMode:        SORT_MODES.includes(data.sortMode) ? data.sortMode : "manual",
    collapsedGroups: normalizeCollapsed(data.collapsedGroups),
  };
}

export function usePayments() {
  const [groups, setGroups] = useState(() => mergeGroups(loadState()?.groups, DEFAULT_PAYMENTS));
  const [checked,         setChecked]         = useState(() => loadState()?.checked         ?? {});
  const [snoozed,         setSnoozed]         = useState(() => loadState()?.snoozed         ?? {});
  const [values,          setValues]          = useState(() => loadState()?.values          ?? {});
  // Item kind: "expense" | "revenue". Absent = expense, so every value that was
  // already stored before this field existed keeps counting as an expense.
  const [kinds,           setKinds]           = useState(() => loadState()?.kinds           ?? {});
  const [lastResets,      setLastResets]      = useState(() => loadState()?.lastResets      ?? {});
  const [dates,           setDates]           = useState(() => loadState()?.dates           ?? {});
  const [sortMode,        setSortModeState]   = useState(() => loadState()?.sortMode        ?? "manual");
  // Per-group starting balance for the "balance" view — the money on hand at the
  // moment the group was last reset, which the day-by-day projection builds on.
  const [openingBalances, setOpeningBalances] = useState(() => loadState()?.openingBalances ?? {});
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => normalizeCollapsed(loadState()?.collapsedGroups)
  );

  useEffect(() => {
    saveState({ groups, checked, snoozed, values, kinds, lastResets, dates, sortMode, collapsedGroups, openingBalances });
  }, [groups, checked, snoozed, values, kinds, lastResets, dates, sortMode, collapsedGroups, openingBalances]);

  // ── Backup ──
  // exportState returns exactly what gets persisted, plus a little provenance.
  // importState is its inverse and runs the same normalisation as a cold load,
  // so importing a backup lands in the same place as restoring it to
  // localStorage and reloading — including backups from older app versions.
  const exportState = useCallback(() => ({
    __app: "finance-tracker",
    __version: 1,
    __exportedAt: new Date().toISOString(),
    groups, checked, snoozed, values, kinds, lastResets, dates,
    sortMode, collapsedGroups, openingBalances,
  }), [groups, checked, snoozed, values, kinds, lastResets, dates,
       sortMode, collapsedGroups, openingBalances]);

  const importState = useCallback((data) => {
    const next = normalizeBackup(data);
    setGroups(next.groups);
    setChecked(next.checked);
    setSnoozed(next.snoozed);
    setValues(next.values);
    setKinds(next.kinds);
    setDates(next.dates);
    setLastResets(next.lastResets);
    setOpeningBalances(next.openingBalances);
    setSortModeState(next.sortMode);
    setCollapsedGroups(next.collapsedGroups);
  }, []);

  // Checking an item clears any snooze on it
  const toggle = useCallback((id) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (next[id]) setSnoozed((s) => ({ ...s, [id]: false }));
      return next;
    });
  }, []);

  // Snoozing an item clears any check on it; toggling off snooze just removes it
  const toggleSnooze = useCallback((id) => {
    setSnoozed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (next[id]) setChecked((c) => ({ ...c, [id]: false }));
      return next;
    });
  }, []);

  const setItemValue = useCallback((id, rawValue) => {
    const num = parseFloat(rawValue);
    setValues((prev) => ({ ...prev, [id]: isNaN(num) ? 0 : num }));
  }, []);

  const setItemKind = useCallback((id, kind) => {
    setKinds((prev) => ({ ...prev, [id]: kind === REVENUE ? REVENUE : EXPENSE }));
  }, []);

  const setItemDate = useCallback((id, rawValue) => {
    const num = parseInt(rawValue, 10);
    setDates((prev) => ({ ...prev, [id]: isNaN(num) ? null : num }));
  }, []);

  // Starting balances may legitimately be negative, so no clamping here
  const setGroupOpeningBalance = useCallback((groupId, rawValue) => {
    const num = parseFloat(rawValue);
    setOpeningBalances((prev) => ({ ...prev, [groupId]: isNaN(num) ? 0 : num }));
  }, []);

  const resetGroup = useCallback((groupId) => {
    setGroups((prev) => {
      const group = prev.find((g) => g.id === groupId);
      if (!group) return prev;
      const ids = group.items.map((i) => i.id);
      setChecked((c) => {
        const next = { ...c };
        ids.forEach((id) => { next[id] = false; });
        return next;
      });
      setSnoozed((s) => {
        const next = { ...s };
        ids.forEach((id) => { next[id] = false; });
        return next;
      });
      return prev;
    });
    setLastResets((prev) => ({ ...prev, [groupId]: new Date().toISOString() }));
  }, []);

  const addItem = useCallback((groupId, label) => {
    const id = `${groupId}_${Date.now()}`;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, items: [...g.items, { id, label: label.trim() }] } : g
      )
    );
  }, []);

  const removeItem = useCallback((groupId, itemId) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, items: g.items.filter((i) => i.id !== itemId) } : g
      )
    );
    setChecked((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
    setSnoozed((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
    setValues((prev)  => { const n = { ...prev }; delete n[itemId]; return n; });
    setKinds((prev)   => { const n = { ...prev }; delete n[itemId]; return n; });
    setDates((prev)   => { const n = { ...prev }; delete n[itemId]; return n; });
  }, []);

  const restoreItem = useCallback((groupId, index, item, value, date, kind) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const items = [...g.items];
        items.splice(Math.min(index, items.length), 0, item);
        return { ...g, items };
      })
    );
    if (value !== undefined) setValues((prev) => ({ ...prev, [item.id]: value }));
    if (date  !== undefined) setDates ((prev) => ({ ...prev, [item.id]: date  }));
    if (kind  !== undefined) setKinds ((prev) => ({ ...prev, [item.id]: kind  }));
  }, []);

  const renameItem = useCallback((groupId, itemId, newLabel) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((i) => i.id === itemId ? { ...i, label: newLabel } : i) }
          : g
      )
    );
  }, []);

  const setSortMode = useCallback((mode) => setSortModeState(mode), []);

  // States that don't apply to a group are dropped from its cycle: "semi" for an
  // empty group, "balance" for a group without due dates.
  const toggleGroupCollapsed = useCallback((groupId, { skipSemi = false, skipBalance = false } = {}) => {
    setCollapsedGroups((prev) => {
      const cycle = VIEW_STATES.filter(
        (v) => !(v === "semi" && skipSemi) && !(v === "balance" && skipBalance)
      );
      const idx = cycle.indexOf(prev[groupId] ?? "open");
      return { ...prev, [groupId]: cycle[(idx + 1) % cycle.length] ?? "open" };
    });
  }, []);

  const addGroup = useCallback((title, dateMode) => {
    const id = `group_${Date.now()}`;
    setGroups((prev) => [...prev, { id, title: title.trim(), dateMode, items: [] }]);
  }, []);

  const removeGroup = useCallback((groupId) => {
    setGroups((prev) => {
      const group = prev.find((g) => g.id === groupId);
      if (group) {
        const ids = group.items.map((i) => i.id);
        setChecked((c) => { const n = { ...c }; ids.forEach((id) => delete n[id]); return n; });
        setSnoozed((s) => { const n = { ...s }; ids.forEach((id) => delete n[id]); return n; });
        setValues((v)  => { const n = { ...v }; ids.forEach((id) => delete n[id]); return n; });
        setKinds((k)   => { const n = { ...k }; ids.forEach((id) => delete n[id]); return n; });
        setDates((d)   => { const n = { ...d }; ids.forEach((id) => delete n[id]); return n; });
      }
      return prev.filter((g) => g.id !== groupId);
    });
    setCollapsedGroups((prev)  => { const n = { ...prev }; delete n[groupId]; return n; });
    setLastResets((prev)       => { const n = { ...prev }; delete n[groupId]; return n; });
    setOpeningBalances((prev)  => { const n = { ...prev }; delete n[groupId]; return n; });
  }, []);

  const renameGroup = useCallback((groupId, newTitle) => {
    setGroups((prev) =>
      prev.map((g) => g.id === groupId ? { ...g, title: newTitle.trim() } : g)
    );
  }, []);

  // Apply an explicit ordered list of group IDs (used by drag-to-reorder)
  const applyGroupOrder = useCallback((ids) => {
    setGroups((prev) => {
      const byId = Object.fromEntries(prev.map((g) => [g.id, g]));
      return ids.map((id) => byId[id]).filter(Boolean);
    });
  }, []);

  const collapseAllGroups = useCallback((ids) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = "closed"; });
      return next;
    });
  }, []);

  const changeGroupDateMode = useCallback((groupId, dateMode) => {
    setGroups((prev) =>
      prev.map((g) => g.id === groupId ? { ...g, dateMode } : g)
    );
  }, []);

  return {
    groups, checked, toggle,
    snoozed, toggleSnooze,
    values, setItemValue,
    kinds, setItemKind,
    dates, setItemDate,
    lastResets, resetGroup,
    openingBalances, setGroupOpeningBalance,
    addItem, removeItem, restoreItem, renameItem,
    sortMode, setSortMode,
    collapsedGroups, toggleGroupCollapsed, collapseAllGroups,
    addGroup, removeGroup, renameGroup, changeGroupDateMode, applyGroupOrder,
    exportState, importState,
  };
}
