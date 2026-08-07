import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { groupToRow, itemToRow, rowsToState, stateToRows } from "../lib/mappers";
import { EXPENSE, REVENUE, todayISO } from "../utils";

const VIEW_STATES = ["closed", "semi", "open", "balance"];
const UI_KEY = "finance-tracker-ui";

const EMPTY = {
  groups: [], checked: {}, snoozed: {}, values: {}, kinds: {},
  dates: {}, actualValues: {}, actualDates: {},
  lastResets: {}, openingBalances: {}, sortMode: "manual",
};

// Per-device UI state stays local — it is not worth a round trip and it should
// not follow you between devices.
function loadUi() {
  try { return JSON.parse(localStorage.getItem(UI_KEY)) ?? {}; } catch { return {}; }
}
function saveUi(collapsedGroups) {
  try { localStorage.setItem(UI_KEY, JSON.stringify(collapsedGroups)); } catch { /* quota */ }
}

function newId(prefix) {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.round(performance.now())}`;
  return `${prefix}${rand}`;
}

/**
 * Cloud-backed store exposing the same surface as usePayments.
 *
 * Every mutation applies to local state first so the UI stays instant, then
 * writes the affected row. A failed write restores the snapshot taken before
 * the change and reports it, so the screen never claims something was saved
 * when it was not.
 */
export function useCloudPayments(session, onError) {
  const [state, setState] = useState(EMPTY);
  const [collapsedGroups, setCollapsedGroups] = useState(loadUi);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("idle"); // idle | saving | error

  // Mirrors `state` for the async write path, which needs the value at call
  // time rather than at render time. Only ever written outside render, via
  // applyState — never during render.
  const stateRef = useRef(state);
  const applyState = useCallback((next) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Rows we have written but not yet seen echoed back, so realtime does not
  // clobber a newer local value with the echo of an older one.
  const inFlight = useRef(new Set());
  const pending = useRef(0);

  useEffect(() => { saveUi(collapsedGroups); }, [collapsedGroups]);

  // ── Load ──
  const load = useCallback(async () => {
    const [groupsRes, itemsRes, prefsRes] = await Promise.all([
      supabase.from("groups").select("*"),
      supabase.from("items").select("*"),
      supabase.from("prefs").select("*").maybeSingle(),
    ]);
    const err = groupsRes.error || itemsRes.error;
    if (err) throw err;
    return rowsToState(groupsRes.data ?? [], itemsRes.data ?? [], prefsRes.data);
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    load()
      .then((next) => { if (alive) { applyState(next); setLoading(false); } })
      .catch((e) => { if (alive) { setLoading(false); setStatus("error"); onError?.(e.message); } });
    return () => { alive = false; };
  }, [session, load, onError, applyState]);

  // Refetch when the tab regains focus — cheap safety net under realtime
  useEffect(() => {
    if (!session) return;
    function onFocus() {
      if (pending.current > 0) return;
      load().then(applyState).catch(() => {});
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [session, load, applyState]);

  // ── Realtime ──
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("finance-tracker")
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, onRemoteChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onRemoteChange)
      .subscribe();

    function onRemoteChange(payload) {
      const id = payload.new?.id ?? payload.old?.id;
      // Skip echoes of our own in-flight writes; a refetch settles it anyway.
      if (id && inFlight.current.has(id)) return;
      if (pending.current > 0) return;
      load().then(applyState).catch(() => {});
    }

    return () => { supabase.removeChannel(channel); };
  }, [session, load, applyState]);

  // ── Write helper ──
  // Applies `mutate` to local state, then runs `write`. On failure the previous
  // state is restored and the error surfaced.
  const commit = useCallback(async (mutate, write, touchedIds = []) => {
    const before = stateRef.current;
    const next = mutate(before);
    applyState(next);

    pending.current += 1;
    setStatus("saving");
    touchedIds.forEach((id) => inFlight.current.add(id));

    try {
      const { error } = await write(next);
      if (error) throw error;
      setStatus("idle");
    } catch (e) {
      applyState(before);
      setStatus("error");
      onError?.(e.message ?? "Falha ao salvar");
    } finally {
      pending.current -= 1;
      touchedIds.forEach((id) => inFlight.current.delete(id));
    }
  }, [onError, applyState]);

  // Upsert the row for one item, derived from the post-mutation state
  const writeItem = (itemId) => (next) => {
    for (const [gi, group] of next.groups.entries()) {
      void gi;
      const index = group.items.findIndex((i) => i.id === itemId);
      if (index !== -1) {
        return supabase.from("items").upsert(itemToRow(group.items[index], group.id, index, next));
      }
    }
    return Promise.resolve({ error: null });
  };

  const writeGroup = (groupId) => (next) => {
    const index = next.groups.findIndex((g) => g.id === groupId);
    if (index === -1) return Promise.resolve({ error: null });
    return supabase.from("groups").upsert(
      groupToRow(next.groups[index], index, next.openingBalances[groupId], next.lastResets[groupId])
    );
  };

  // ── Item mutations ──
  // Same propose-don't-assert rule as the local store: ticking fills the realised
  // pair with the planned amount on today's date if it is still empty, and
  // un-ticking drops it again.
  const toggle = useCallback((id) => commit(
    (s) => {
      const nowChecked = !s.checked[id];
      const drop = (m) => { const n = { ...m }; delete n[id]; return n; };
      return { ...s,
        checked: { ...s.checked, [id]: nowChecked },
        snoozed: nowChecked ? { ...s.snoozed, [id]: false } : s.snoozed,
        actualValues: !nowChecked ? drop(s.actualValues)
          : s.actualValues[id] === undefined ? { ...s.actualValues, [id]: s.values[id] ?? 0 } : s.actualValues,
        actualDates: !nowChecked ? drop(s.actualDates)
          : s.actualDates[id] === undefined ? { ...s.actualDates, [id]: todayISO() } : s.actualDates };
    },
    writeItem(id), [id]
  ), [commit]);

  const toggleSnooze = useCallback((id) => commit(
    (s) => ({ ...s, snoozed: { ...s.snoozed, [id]: !s.snoozed[id] },
              checked: !s.snoozed[id] ? { ...s.checked, [id]: false } : s.checked }),
    writeItem(id), [id]
  ), [commit]);

  const setItemValue = useCallback((id, raw) => {
    const num = parseFloat(raw);
    return commit((s) => ({ ...s, values: { ...s.values, [id]: isNaN(num) ? 0 : num } }), writeItem(id), [id]);
  }, [commit]);

  const setItemKind = useCallback((id, kind) => commit(
    (s) => ({ ...s, kinds: { ...s.kinds, [id]: kind === REVENUE ? REVENUE : EXPENSE } }),
    writeItem(id), [id]
  ), [commit]);

  const setItemDate = useCallback((id, raw) => {
    const num = parseInt(raw, 10);
    return commit((s) => ({ ...s, dates: { ...s.dates, [id]: isNaN(num) ? null : num } }), writeItem(id), [id]);
  }, [commit]);

  // Clearing drops the key: "not realised" is not the same fact as "realised as 0"
  const setItemActualValue = useCallback((id, raw) => {
    const num = parseFloat(raw);
    return commit((s) => {
      const next = { ...s.actualValues };
      if (isNaN(num)) delete next[id]; else next[id] = num;
      return { ...s, actualValues: next };
    }, writeItem(id), [id]);
  }, [commit]);

  const setItemActualDate = useCallback((id, raw) => commit(
    (s) => {
      const next = { ...s.actualDates };
      if (!raw) delete next[id]; else next[id] = raw;
      return { ...s, actualDates: next };
    },
    writeItem(id), [id]
  ), [commit]);

  const renameItem = useCallback((groupId, itemId, label) => commit(
    (s) => ({ ...s, groups: s.groups.map((g) => g.id !== groupId ? g
      : { ...g, items: g.items.map((i) => i.id === itemId ? { ...i, label } : i) }) }),
    writeItem(itemId), [itemId]
  ), [commit]);

  const addItem = useCallback((groupId, label) => {
    const id = newId(`${groupId}_`);
    return commit(
      (s) => ({ ...s, groups: s.groups.map((g) => g.id !== groupId ? g
        : { ...g, items: [...g.items, { id, label: label.trim() }] }) }),
      writeItem(id), [id]
    );
  }, [commit]);

  const removeItem = useCallback((groupId, itemId) => commit(
    (s) => {
      const strip = (m) => { const n = { ...m }; delete n[itemId]; return n; };
      return { ...s,
        groups: s.groups.map((g) => g.id !== groupId ? g : { ...g, items: g.items.filter((i) => i.id !== itemId) }),
        checked: strip(s.checked), snoozed: strip(s.snoozed),
        values: strip(s.values), kinds: strip(s.kinds), dates: strip(s.dates),
        actualValues: strip(s.actualValues), actualDates: strip(s.actualDates) };
    },
    () => supabase.from("items").delete().eq("id", itemId), [itemId]
  ), [commit]);

  const restoreItem = useCallback((groupId, index, item, value, date, kind) => commit(
    (s) => {
      const groups = s.groups.map((g) => {
        if (g.id !== groupId) return g;
        const items = [...g.items];
        items.splice(Math.min(index, items.length), 0, item);
        return { ...g, items };
      });
      return { ...s, groups,
        values: value !== undefined ? { ...s.values, [item.id]: value } : s.values,
        dates:  date  !== undefined ? { ...s.dates,  [item.id]: date  } : s.dates,
        kinds:  kind  !== undefined ? { ...s.kinds,  [item.id]: kind  } : s.kinds };
    },
    writeItem(item.id), [item.id]
  ), [commit]);

  // ── Group mutations ──
  const addGroup = useCallback((title, dateMode) => {
    const id = newId("group_");
    return commit(
      (s) => ({ ...s, groups: [...s.groups, { id, title: title.trim(), dateMode, items: [] }] }),
      writeGroup(id), [id]
    );
  }, [commit]);

  const removeGroup = useCallback((groupId) => commit(
    (s) => {
      const ids = s.groups.find((g) => g.id === groupId)?.items.map((i) => i.id) ?? [];
      const strip = (m) => { const n = { ...m }; ids.forEach((i) => delete n[i]); return n; };
      const dropGroup = (m) => { const n = { ...m }; delete n[groupId]; return n; };
      return { ...s,
        groups: s.groups.filter((g) => g.id !== groupId),
        checked: strip(s.checked), snoozed: strip(s.snoozed), values: strip(s.values),
        kinds: strip(s.kinds), dates: strip(s.dates),
        actualValues: strip(s.actualValues), actualDates: strip(s.actualDates),
        lastResets: dropGroup(s.lastResets), openingBalances: dropGroup(s.openingBalances) };
    },
    () => supabase.from("groups").delete().eq("id", groupId), [groupId]
  ), [commit]);

  const renameGroup = useCallback((groupId, title) => commit(
    (s) => ({ ...s, groups: s.groups.map((g) => g.id === groupId ? { ...g, title: title.trim() } : g) }),
    writeGroup(groupId), [groupId]
  ), [commit]);

  const changeGroupDateMode = useCallback((groupId, dateMode) => commit(
    (s) => ({ ...s, groups: s.groups.map((g) => g.id === groupId ? { ...g, dateMode } : g) }),
    writeGroup(groupId), [groupId]
  ), [commit]);

  const setGroupOpeningBalance = useCallback((groupId, raw) => {
    const num = parseFloat(raw);
    return commit(
      (s) => ({ ...s, openingBalances: { ...s.openingBalances, [groupId]: isNaN(num) ? 0 : num } }),
      writeGroup(groupId), [groupId]
    );
  }, [commit]);

  const resetGroup = useCallback((groupId) => commit(
    (s) => {
      const ids = s.groups.find((g) => g.id === groupId)?.items.map((i) => i.id) ?? [];
      const clear = (m) => { const n = { ...m }; ids.forEach((i) => { n[i] = false; }); return n; };
      // Realised values belong to the cycle: keeping them would bleed last
      // month's actuals into this one.
      const strip = (m) => { const n = { ...m }; ids.forEach((i) => delete n[i]); return n; };
      return { ...s, checked: clear(s.checked), snoozed: clear(s.snoozed),
               actualValues: strip(s.actualValues), actualDates: strip(s.actualDates),
               lastResets: { ...s.lastResets, [groupId]: new Date().toISOString() } };
    },
    async (next) => {
      const ids = next.groups.find((g) => g.id === groupId)?.items.map((i) => i.id) ?? [];
      if (ids.length) {
        const { error } = await supabase.from("items")
          .update({ checked: false, snoozed: false, actual_value: null, actual_date: null }).in("id", ids);
        if (error) return { error };
      }
      return writeGroup(groupId)(next);
    },
    [groupId]
  ), [commit]);

  const applyGroupOrder = useCallback((ids) => commit(
    (s) => {
      const byId = Object.fromEntries(s.groups.map((g) => [g.id, g]));
      return { ...s, groups: ids.map((id) => byId[id]).filter(Boolean) };
    },
    (next) => supabase.from("groups").upsert(
      next.groups.map((g, i) => groupToRow(g, i, next.openingBalances[g.id], next.lastResets[g.id]))
    ),
    ids
  ), [commit]);

  const setSortMode = useCallback((mode) => commit(
    (s) => ({ ...s, sortMode: mode }),
    () => supabase.from("prefs").upsert({ user_id: session?.user?.id, sort_mode: mode })
  ), [commit, session]);

  // ── Bulk seed / import ──
  const replaceAll = useCallback(async (local) => {
    setStatus("saving");
    pending.current += 1;
    try {
      const { groupRows, itemRows } = stateToRows(local);
      // Clearing groups cascades to items
      const del = await supabase.from("groups").delete().neq("id", "");
      if (del.error) throw del.error;
      if (groupRows.length) {
        const g = await supabase.from("groups").insert(groupRows);
        if (g.error) throw g.error;
      }
      if (itemRows.length) {
        const i = await supabase.from("items").insert(itemRows);
        if (i.error) throw i.error;
      }
      const fresh = await load();
      applyState(fresh);
      setStatus("idle");
      return true;
    } catch (e) {
      setStatus("error");
      onError?.(e.message ?? "Falha ao importar");
      return false;
    } finally {
      pending.current -= 1;
    }
  }, [load, onError, applyState]);

  // ── UI-only state ──
  const toggleGroupCollapsed = useCallback((groupId, { skipSemi = false, skipBalance = false } = {}) => {
    setCollapsedGroups((prev) => {
      const cycle = VIEW_STATES.filter(
        (v) => !(v === "semi" && skipSemi) && !(v === "balance" && skipBalance)
      );
      const idx = cycle.indexOf(prev[groupId] ?? "open");
      return { ...prev, [groupId]: cycle[(idx + 1) % cycle.length] ?? "open" };
    });
  }, []);

  const collapseAllGroups = useCallback((ids) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = "closed"; });
      return next;
    });
  }, []);

  const exportState = useCallback(() => ({
    __app: "finance-tracker", __version: 1, __exportedAt: new Date().toISOString(),
    ...stateRef.current, collapsedGroups,
  }), [collapsedGroups]);

  return {
    ...state,
    collapsedGroups, toggleGroupCollapsed, collapseAllGroups,
    toggle, toggleSnooze, setItemValue, setItemKind, setItemDate,
    setItemActualValue, setItemActualDate,
    addItem, removeItem, restoreItem, renameItem,
    addGroup, removeGroup, renameGroup, changeGroupDateMode, applyGroupOrder,
    setGroupOpeningBalance, resetGroup, setSortMode,
    exportState, replaceAll,
    loading, status, reload: () => load().then(setState).catch(() => {}),
  };
}
