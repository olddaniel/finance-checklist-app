import { useState, useRef, useMemo, useEffect } from "react";
import PaymentGroup from "./components/PaymentGroup";
import ItemDetailModal from "./components/ItemDetailModal";
import DataSheet from "./components/DataSheet";
import ShortcutSheet from "./components/ShortcutSheet";
import Toast from "./components/Toast";
import { kindOf, displayItemsOf, REVENUE } from "./utils";
import "./App.css";

const SORT_CYCLE     = ["manual", "value", "date"];
const TOAST_DURATION = 3500;
const NOOP = () => {};

function SortIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1 3h10M1 6h6.5M1 9h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Receives a store with the shape usePayments returns — the local one, or the
// cloud-backed one. `account` is absent in local mode.
function AppShell({ store, account }) {
  const {
    groups, checked, toggle,
    snoozed, toggleSnooze,
    values, setItemValue,
    kinds, setItemKind,
    dates, setItemDate,
    lastResets, resetGroup,
    openingBalances, setGroupOpeningBalance,
    addItem, removeItem, restoreItem, renameItem, moveItem,
    sortMode, setSortMode,
    collapsedGroups, toggleGroupCollapsed, collapseAllGroups,
    addGroup, removeGroup, renameGroup, changeGroupDateMode, applyGroupOrder,
    exportState, importState,
  } = store;

  const [dataSheetOpen, setDataSheetOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Row detail modal — holds the id so the modal follows live state updates
  const [detailItemId, setDetailItemId] = useState(null);

  // Keyboard cursor: the row the arrow keys act on. Null until a key is pressed,
  // so a phone never grows a focus ring it has no way to move.
  const [focusItemId, setFocusItemId] = useState(null);

  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [newGroupDateMode, setNewGroupDateMode] = useState("none");

  // ── Toast ──
  const [toast, setToast]      = useState({ visible: false, message: "", undoFn: null });
  const [toastKey, setToastKey] = useState(0);
  const toastTimeout = useRef(null);

  function showToast(message, undoFn) {
    clearTimeout(toastTimeout.current);
    setToastKey((k) => k + 1);
    setToast({ visible: true, message, undoFn });
    toastTimeout.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, TOAST_DURATION);
  }

  function handleUndoToast() {
    clearTimeout(toastTimeout.current);
    toast.undoFn?.();
    setToast((t) => ({ ...t, visible: false }));
  }

  // ── Drag-to-reorder ──
  // drag = { groupId, pointerY, offsetY, floatLeft, floatWidth, floatHeight, insertAt }
  const [drag, setDrag] = useState(null);
  const dragRef  = useRef(null); // live mirror — avoids stale closures in event handlers
  const groupEls = useRef({});

  // orderedGroups: for the main list. During drag the moving card is replaced
  // by a placeholder at the current insertAt position.
  const { orderedGroups, draggedGroup } = useMemo(() => {
    if (!drag) return { orderedGroups: groups, draggedGroup: null };
    const dragged  = groups.find((g) => g.id === drag.groupId) ?? null;
    const without  = groups.filter((g) => g.id !== drag.groupId);
    const at       = Math.min(drag.insertAt, without.length);
    without.splice(at, 0, { __placeholder: true, height: drag.floatHeight });
    return { orderedGroups: without, draggedGroup: dragged };
  }, [groups, drag]);

  // Keep dragRef.groups in sync so stale-closure handlers see current group list
  useEffect(() => { if (dragRef.current) dragRef.current.groups = groups; }, [groups]);

  function handleGroupDragStart(groupId, pointerY) {
    const el = groupEls.current[groupId];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const idx  = groups.findIndex((g) => g.id === groupId);
    const state = {
      groupId,
      pointerY,
      offsetY:     pointerY - rect.top,
      floatLeft:   rect.left,
      floatWidth:  rect.width,
      floatHeight: rect.height,
      insertAt:    idx,
    };
    dragRef.current = { ...state, groups };

    // ── Attach listeners SYNCHRONOUSLY (same event-handler tick as pointerdown) ──
    // This prevents the browser from committing to scroll/context-menu before
    // our handlers exist. A useEffect fires after re-render — too late on mobile.
    function onMove(e) {
      if (e.cancelable) e.preventDefault();
      const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      if (!dragRef.current) return;
      const { groupId: gid, groups: snap } = dragRef.current;
      const without = snap.filter((g) => g.id !== gid);
      let insertAt = 0;
      for (let i = 0; i < without.length; i++) {
        const node = groupEls.current[without[i].id];
        if (!node) continue;
        const r = node.getBoundingClientRect();
        if (y > r.top + r.height / 2) insertAt = i + 1;
      }
      insertAt = Math.max(0, Math.min(insertAt, without.length));
      dragRef.current.pointerY = y;
      dragRef.current.insertAt = insertAt;
      setDrag((prev) => prev ? { ...prev, pointerY: y, insertAt } : null);
    }

    function onEnd() {
      if (!dragRef.current) return;
      const { groupId: gid, insertAt, groups: snap } = dragRef.current;
      const without = snap.filter((g) => g.id !== gid);
      const dragged = snap.find((g) => g.id === gid);
      if (dragged) {
        without.splice(Math.min(insertAt, without.length), 0, dragged);
        applyGroupOrder(without.map((g) => g.id));
      }
      window.removeEventListener("pointermove",  onMove);
      window.removeEventListener("pointerup",    onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.removeEventListener("touchmove",  preventScroll);
      dragRef.current = null;
      setDrag(null);
    }

    function preventScroll(e) { if (e.cancelable) e.preventDefault(); }

    window.addEventListener("pointermove",   onMove,        { passive: false });
    window.addEventListener("pointerup",     onEnd);
    window.addEventListener("pointercancel", onEnd);
    document.addEventListener("touchmove",   preventScroll, { passive: false });

    setDrag(state);
    collapseAllGroups(groups.map((g) => g.id));
  }

  // ── Helpers ──
  function findItem(itemId) {
    for (const group of groups) {
      const item = group.items.find((i) => i.id === itemId);
      if (item) return { group, item, index: group.items.indexOf(item) };
    }
    return null;
  }

  function handleRemoveItem(groupId, itemId) {
    const group = groups.find((g) => g.id === groupId);
    const index = group?.items.findIndex((i) => i.id === itemId) ?? -1;
    const item  = group?.items[index];
    const value = values[itemId];
    const date  = dates[itemId];
    const kind  = kinds[itemId];
    removeItem(groupId, itemId);
    if (item) showToast(`"${item.label}" removida`, () => restoreItem(groupId, index, item, value, date, kind));
  }

  function handleToggle(itemId) {
    const wasChecked = !!checked[itemId];
    toggle(itemId);
    if (!wasChecked) {
      const found = findItem(itemId);
      const done  = kindOf(kinds, itemId) === REVENUE ? "recebida" : "paga";
      showToast(`"${found?.item.label ?? "Conta"}" ${done}`, () => toggle(itemId));
    }
  }

  function handleToggleSnooze(itemId) {
    const wasSnoozed = !!snoozed[itemId];
    toggleSnooze(itemId);
    if (!wasSnoozed) {
      const found = findItem(itemId);
      showToast(`"${found?.item.label ?? "Conta"}" adiada`, () => toggleSnooze(itemId));
    }
  }

  // ── Keyboard: the review cursor ──
  // Every row currently on screen, in the order it appears. A closed group and
  // the balance view contribute nothing, which is what makes ↓ skip them.
  const navItems = useMemo(() => {
    const rows = [];
    for (const group of groups) {
      const viewState = collapsedGroups[group.id] ?? "open";
      if (viewState === "closed" || viewState === "balance") continue;
      for (const item of displayItemsOf(group, { viewState, sortMode, values, dates, checked, snoozed })) {
        rows.push({ groupId: group.id, itemId: item.id });
      }
    }
    return rows;
  }, [groups, collapsedGroups, sortMode, values, dates, checked, snoozed]);

  // Collapsing a group — or ticking a row in semi mode — takes the cursor's row
  // off the screen, so the cursor is resolved against the visible list on every
  // render instead of being stored. It can never point at something invisible,
  // and re-opening the group hands it back.
  const focusIndex   = navItems.findIndex((n) => n.itemId === focusItemId);
  const focusedRow   = focusIndex === -1 ? null : navItems[focusIndex];

  function handleShortcut(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const el = e.target;
    const typing = el instanceof HTMLElement &&
      (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

    // Esc is the only key with a meaning while something is open, and even then
    // it belongs to the field being typed into before it belongs to us.
    if (e.key === "Escape") {
      if (typing) return;
      if (shortcutsOpen) { setShortcutsOpen(false); return; }
      if (detailItemId || dataSheetOpen) return;  // each sheet closes itself
      setFocusItemId(null);
      return;
    }

    // Never take a keystroke away from a field or from an open sheet
    if (typing || detailItemId || dataSheetOpen || shortcutsOpen) return;

    const current = focusedRow;
    const down    = e.key === "ArrowDown" || e.key === "j";
    const up      = e.key === "ArrowUp"   || e.key === "k";

    if ((down || up) && e.shiftKey) {
      if (!current) return;
      e.preventDefault();
      // Sorting by value or date overrides the stored order, so a move there
      // would look like nothing happened.
      if (sortMode !== "manual") {
        showToast("Para reordenar, volte à ordenação manual", null);
        return;
      }
      moveItem(current.groupId, current.itemId, down ? 1 : -1);
      return;
    }

    if (down || up) {
      if (navItems.length === 0) return;
      e.preventDefault();
      const next = focusIndex === -1
        ? (down ? 0 : navItems.length - 1)
        : Math.min(navItems.length - 1, Math.max(0, focusIndex + (down ? 1 : -1)));
      setFocusItemId(navItems[next].itemId);
      return;
    }

    if (e.key === " ")     { if (current) { e.preventDefault(); handleToggle(current.itemId); } return; }
    if (e.key === "Enter") { if (current) { e.preventDefault(); setDetailItemId(current.itemId); } return; }
    if (e.key === "?")     { e.preventDefault(); setShortcutsOpen(true); }
  }

  // The handler closes over state that changes on nearly every keystroke, so it
  // is kept in a ref and the listener is attached once.
  const shortcutRef = useRef(null);
  useEffect(() => { shortcutRef.current = handleShortcut; });
  useEffect(() => {
    function onKeyDown(e) { shortcutRef.current?.(e); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Backup ──
  function handleExport() {
    const json = JSON.stringify(exportState(), null, 2);
    const url  = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `finance-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup exportado", null);
  }

  // Snapshot first so the toast can put everything back if the file was wrong
  function handleImport(data) {
    const before = exportState();
    importState(data);
    setDataSheetOpen(false);
    showToast("Backup importado", () => importState(before));
  }

  function cycleSortMode() {
    const next = SORT_CYCLE[(SORT_CYCLE.indexOf(sortMode) + 1) % SORT_CYCLE.length];
    setSortMode(next);
  }

  const sortLabel = sortMode === "value" ? "R$↓" : sortMode === "date" ? "data↑" : null;

  function handleAddGroup() {
    if (!newGroupLabel.trim()) return;
    addGroup(newGroupLabel, newGroupDateMode);
    setNewGroupLabel(""); setNewGroupDateMode("none"); setAddingGroup(false);
  }
  function cancelAddGroup() {
    setNewGroupLabel(""); setNewGroupDateMode("none"); setAddingGroup(false);
  }

  // Shared props builder to avoid duplication between list and float renders
  function groupProps(group) {
    return {
      group,
      checked, onToggle: (id) => handleToggle(id),
      snoozed, onToggleSnooze: (id) => handleToggleSnooze(id),
      onReset: () => resetGroup(group.id),
      values, onValueChange: setItemValue,
      kinds,  onOpenDetails: (itemId) => setDetailItemId(itemId),
      dates,  onDateChange:  setItemDate,
      lastReset: lastResets[group.id] ?? null,
      openingBalance: openingBalances[group.id] ?? 0,
      onOpeningBalanceChange: (val) => setGroupOpeningBalance(group.id, val),
      onAddItem:    (label) => addItem(group.id, label),
      onRemoveItem: (itemId) => handleRemoveItem(group.id, itemId),
      onRenameItem: (itemId, label) => renameItem(group.id, itemId, label),
      sortMode,
      viewState:          collapsedGroups[group.id] ?? "open",
      onToggleCollapsed:  (skips) => toggleGroupCollapsed(group.id, skips),
      focusItemId:        focusedRow?.itemId ?? null,
      onRemoveGroup:      () => removeGroup(group.id),
      onRenameGroup:      (t) => renameGroup(group.id, t),
      onChangeDateMode:   (m) => changeGroupDateMode(group.id, m),
    };
  }

  // Reads live state each render, and resolves to null if the row disappears
  const detail = detailItemId ? findItem(detailItemId) : null;

  return (
    <div className={`app${drag ? " is-dragging" : ""}`}>
      <header className="top-bar">
        <div className="top-bar-inner">
          <button
            className="app-icon"
            onClick={() => setDataSheetOpen(true)}
            aria-label="Dados e backup"
            title="Dados e backup"
          >💳</button>
          <h1 className="app-title">Finance Tracker</h1>
          {account?.status && account.status !== "idle" && (
            <button
              className={`sync-dot ${account.status}`}
              onClick={() => account.onRetry?.()}
              aria-label={account.status === "saving" ? "Salvando" : "Erro ao salvar — tentar novamente"}
              title={account.status === "saving" ? "Salvando..." : "Erro ao salvar — tocar para recarregar"}
            />
          )}
          {/* The sheet has to be reachable without knowing the key that opens it */}
          <button
            className="sort-btn shortcuts-btn"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Atalhos do teclado"
            title="Atalhos do teclado"
          >?</button>
          <button
            className={`sort-btn${sortMode !== "manual" ? " active" : ""}`}
            onClick={cycleSortMode}
            title={
              sortMode === "manual" ? "Ordenar por valor ou data" :
              sortMode === "value"  ? "Ordenando por valor" : "Ordenando por data"
            }
          >
            {sortLabel ?? <SortIcon />}
          </button>
        </div>
      </header>

      <main className="main">
        {orderedGroups.map((group) =>
          group.__placeholder ? (
            <div
              key="__placeholder"
              className="group-drag-placeholder"
              style={{ height: group.height }}
            />
          ) : (
            <PaymentGroup
              key={group.id}
              {...groupProps(group)}
              groupRef={(el) => { groupEls.current[group.id] = el; }}
              onDragStart={(py) => handleGroupDragStart(group.id, py)}
              isDragging={false}
            />
          )
        )}

        {!addingGroup && (
          <button className="group-add-btn" onClick={() => setAddingGroup(true)}>
            + Adicionar grupo
          </button>
        )}
        {addingGroup && (
          <div className="group-add-form">
            <input
              className="group-add-input"
              placeholder="Nome do grupo..."
              value={newGroupLabel}
              onChange={(e) => setNewGroupLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddGroup(); if (e.key === "Escape") cancelAddGroup(); }}
              maxLength={40}
              autoFocus
            />
            <div className="group-add-modes">
              {[
                { value: "none",   label: "Sem data" },
                { value: "days",   label: "Dias" },
                { value: "months", label: "Meses" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  className={`group-add-mode-btn${newGroupDateMode === value ? " active" : ""}`}
                  onClick={() => setNewGroupDateMode(value)}
                  type="button"
                >{label}</button>
              ))}
            </div>
            <div className="group-add-actions">
              <button className="item-add-confirm" onClick={handleAddGroup} disabled={!newGroupLabel.trim()} aria-label="Confirmar">✓</button>
              <button className="item-add-cancel" onClick={cancelAddGroup} aria-label="Cancelar">✕</button>
            </div>
          </div>
        )}
      </main>

      {/* Floating card — fixed under the finger during drag */}
      {drag && draggedGroup && (
        <div
          className="group-drag-float"
          style={{
            top:   drag.pointerY - drag.offsetY,
            left:  drag.floatLeft,
            width: drag.floatWidth,
          }}
        >
          <PaymentGroup
            {...groupProps(draggedGroup)}
            groupRef={null}
            onDragStart={NOOP}
            isDragging={true}
            focusItemId={null}
            viewState="closed"
            onToggle={NOOP} onToggleSnooze={NOOP}
            onReset={NOOP}  onValueChange={NOOP} onDateChange={NOOP}
            onAddItem={NOOP} onRemoveItem={NOOP} onRenameItem={NOOP}
            onToggleCollapsed={NOOP} onRemoveGroup={NOOP}
            onRenameGroup={NOOP}    onChangeDateMode={NOOP}
            onOpenDetails={NOOP}    onOpeningBalanceChange={NOOP}
          />
        </div>
      )}

      {dataSheetOpen && (
        <DataSheet
          groupCount={groups.length}
          itemCount={groups.reduce((n, g) => n + g.items.length, 0)}
          onClose={() => setDataSheetOpen(false)}
          onExport={handleExport}
          onImport={handleImport}
          account={account}
        />
      )}

      {shortcutsOpen && <ShortcutSheet onClose={() => setShortcutsOpen(false)} />}

      {/* Row detail modal */}
      {detail && (
        <ItemDetailModal
          key={detail.item.id}
          groupTitle={detail.group.title}
          item={detail.item}
          dateMode={detail.group.dateMode}
          kind={kindOf(kinds, detail.item.id)}
          checked={!!checked[detail.item.id]}
          snoozed={!!snoozed[detail.item.id]}
          value={values[detail.item.id] || ""}
          dueDate={dates[detail.item.id] ?? null}
          onClose={() => setDetailItemId(null)}
          onToggleChecked={() => handleToggle(detail.item.id)}
          onToggleSnooze={() => handleToggleSnooze(detail.item.id)}
          onKindChange={(kind) => setItemKind(detail.item.id, kind)}
          onValueChange={(val) => setItemValue(detail.item.id, val)}
          onDateChange={(val) => setItemDate(detail.item.id, val)}
          onRename={(label) => renameItem(detail.group.id, detail.item.id, label)}
          onRemove={() => {
            handleRemoveItem(detail.group.id, detail.item.id);
            setDetailItemId(null);
          }}
        />
      )}

      <Toast
        message={toast.message}
        onUndo={handleUndoToast}
        canUndo={!!toast.undoFn}
        visible={toast.visible}
        toastKey={toastKey}
      />
    </div>
  );
}

export default AppShell;
