import { kindOf } from "../utils";

// The app keeps per-item state in parallel maps keyed by item id; the database
// keeps one row per item. These translate between the two.

export function groupToRow(group, position, openingBalance, lastReset) {
  return {
    id: group.id,
    title: group.title,
    date_mode: group.dateMode ?? "days",
    position,
    opening_balance: openingBalance ?? 0,
    last_reset: lastReset ?? null,
  };
}

export function itemToRow(item, groupId, position, state) {
  return {
    id: item.id,
    group_id: groupId,
    label: item.label,
    value: state.values?.[item.id] ?? 0,
    kind: kindOf(state.kinds, item.id),
    due_date: state.dates?.[item.id] ?? null,
    checked: !!state.checked?.[item.id],
    snoozed: !!state.snoozed?.[item.id],
    position,
  };
}

// Whole local state → rows, used when seeding an account or importing a device
export function stateToRows(state) {
  const groupRows = [];
  const itemRows = [];
  state.groups.forEach((group, gi) => {
    groupRows.push(groupToRow(group, gi, state.openingBalances?.[group.id], state.lastResets?.[group.id]));
    group.items.forEach((item, ii) => itemRows.push(itemToRow(item, group.id, ii, state)));
  });
  return { groupRows, itemRows };
}

// Rows → the shape the UI already knows how to render
export function rowsToState(groupRows, itemRows, prefsRow) {
  const byGroup = new Map(groupRows.map((g) => [g.id, []]));
  const checked = {}, snoozed = {}, values = {}, kinds = {}, dates = {};

  for (const row of itemRows) {
    if (!byGroup.has(row.group_id)) continue; // orphan guard
    byGroup.get(row.group_id).push(row);
    checked[row.id] = !!row.checked;
    snoozed[row.id] = !!row.snoozed;
    values[row.id]  = Number(row.value) || 0;
    kinds[row.id]   = row.kind === "revenue" ? "revenue" : "expense";
    dates[row.id]   = row.due_date ?? null;
  }

  const lastResets = {}, openingBalances = {};
  const groups = [...groupRows]
    .sort((a, b) => a.position - b.position)
    .map((g) => {
      if (g.last_reset) lastResets[g.id] = g.last_reset;
      openingBalances[g.id] = Number(g.opening_balance) || 0;
      return {
        id: g.id,
        title: g.title,
        dateMode: g.date_mode,
        items: (byGroup.get(g.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((i) => ({ id: i.id, label: i.label })),
      };
    });

  return {
    groups, checked, snoozed, values, kinds, dates, lastResets, openingBalances,
    sortMode: prefsRow?.sort_mode ?? "manual",
  };
}
