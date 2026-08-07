import { useState, useRef, useEffect, useMemo } from "react";
import CheckboxItem from "./CheckboxItem";
import GroupBalanceTimeline from "./GroupBalanceTimeline";
import { formatBRL, formatBRLAlways, formatBRLSigned, kindOf, REVENUE } from "../utils";

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}


// Chevron for the item views: open=down, semi=diagonal, closed=right.
// The balance view gets its own glyph instead — there is no fourth rotation.
function ViewStateIcon({ viewState }) {
  if (viewState === "balance") {
    return (
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
        aria-hidden="true" className="chevron chevron-balance">
        <path d="M1.5 8.5l3-3 2 2 4-4" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
      aria-hidden="true" className={`chevron chevron-${viewState}`}>
      <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="4" cy="3" r="1" fill="currentColor"/>
      <circle cx="8" cy="3" r="1" fill="currentColor"/>
      <circle cx="4" cy="6" r="1" fill="currentColor"/>
      <circle cx="8" cy="6" r="1" fill="currentColor"/>
      <circle cx="4" cy="9" r="1" fill="currentColor"/>
      <circle cx="8" cy="9" r="1" fill="currentColor"/>
    </svg>
  );
}

export default function PaymentGroup({
  group, checked, onToggle, onReset,
  snoozed, onToggleSnooze,
  values, onValueChange,
  actualValues = {},
  kinds, onOpenDetails,
  dates, onDateChange,
  lastReset,
  openingBalance = 0, onOpeningBalanceChange,
  onAddItem, onRemoveItem, onRenameItem,
  sortMode,
  viewState = "open",
  onToggleCollapsed,
  onRemoveGroup,
  onRenameGroup,
  onChangeDateMode,
  groupRef,
  onDragStart,
  isDragging,
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [adding, setAdding]             = useState(false);
  const [newLabel, setNewLabel]         = useState("");
  const inputRef = useRef(null);

  // ── Drag handle — immediate drag on pointerdown ──
  function handleDragHandlePointerDown(e) {
    e.preventDefault();   // prevent text selection / context menu
    e.stopPropagation();  // don't bubble to header (would toggle collapse)
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    onDragStart?.(y);
  }
  // Suppress Android long-press vibration/context-menu on the handle
  function handleDragHandleContextMenu(e) { e.preventDefault(); }

  // ── Metrics panel — opened by tapping the header ──
  // Visibility cycling (open → semi → closed) lives on the progress badge only.
  const [metricsOpen, setMetricsOpen] = useState(false);
  const metricsVisible = metricsOpen && !isDragging;

  function handleHeaderClick() {
    setMetricsOpen((v) => !v);
  }

  // ── Edit panel state ──
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName]   = useState(group.title);
  const [editMode, setEditMode]   = useState(group.dateMode);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setEditName(group.title);
      setEditMode(group.dateMode);
      setConfirmDelete(false);
    }
  }, [isEditing, group.title, group.dateMode]);

  const hasChanges = editName.trim() !== group.title || editMode !== group.dateMode;

  function saveGroupEdit() {
    if (editName.trim() && editName.trim() !== group.title) onRenameGroup(editName.trim());
    if (editMode !== group.dateMode) onChangeDateMode(editMode);
    setIsEditing(false);
  }

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const isClosed  = viewState === "closed";
  const isSemi    = viewState === "semi";
  const isOpen    = viewState === "open";
  const isBalance = viewState === "balance";

  // Sorted items
  const sortedItems = useMemo(() => {
    if (sortMode === "value") {
      return [...group.items].sort((a, b) => (values[b.id] || 0) - (values[a.id] || 0));
    }
    if (sortMode === "date") {
      return [...group.items].sort((a, b) => (dates[a.id] ?? 999) - (dates[b.id] ?? 999));
    }
    return group.items;
  }, [group.items, sortMode, values, dates]);

  // In semi mode only show unchecked + un-snoozed items
  const displayItems = isSemi
    ? sortedItems.filter((item) => !checked[item.id] && !snoozed[item.id])
    : sortedItems;

  const total   = group.items.length;
  // snoozed counts as "handled" for the progress badge
  const done    = group.items.filter((item) => checked[item.id] || snoozed[item.id]).length;
  const allDone = done === total && total > 0;
  const pct     = total === 0 ? 0 : (done / total) * 100;

  // snoozed items are excluded from the sums (they reduce the group total)
  const activeItems = group.items.filter((i) => !snoozed[i.id]);

  const sumBy = (isRevenue, onlyExecuted) =>
    activeItems.reduce((s, i) => {
      if ((kindOf(kinds, i.id) === REVENUE) !== isRevenue) return s;
      if (onlyExecuted && !checked[i.id]) return s;
      return s + (values[i.id] || 0);
    }, 0);

  const plannedExpense  = sumBy(false, false);
  const executedExpense = sumBy(false, true);
  const plannedRevenue  = sumBy(true,  false);
  const executedRevenue = sumBy(true,  true);

  const netPlanned  = plannedRevenue  - plannedExpense;
  const netExecuted = executedRevenue - executedExpense;

  const hasAmounts = plannedExpense > 0 || plannedRevenue > 0;

  // The balance view needs due dates to lay a timeline out, and at least one item
  const canShowBalance = group.dateMode !== "none" && total > 0;
  const viewCycleSkips = { skipSemi: total === 0, skipBalance: !canShowBalance };

  const resetDate = formatDate(lastReset);

  function handleAdd() {
    if (!newLabel.trim()) return;
    onAddItem(newLabel);
    setNewLabel("");
    setAdding(false);
  }

  function cancelAdd() {
    setNewLabel("");
    setAdding(false);
  }

  return (
    <section
      ref={groupRef}
      className={`payment-group${allDone ? " all-done" : ""}${isEditing ? " editing" : ""}${isDragging ? " dragging" : ""}`}
    >
      {/* Header */}
      <div
        className={`group-header${isClosed ? " group-header-collapsed" : ""}${metricsVisible ? " metrics-open" : ""}`}
        onClick={handleHeaderClick}
        role="button"
        aria-expanded={metricsVisible}
        aria-label={metricsVisible ? "Ocultar métricas do grupo" : "Mostrar métricas do grupo"}
      >
        <span
          className="group-drag-handle"
          onPointerDown={handleDragHandlePointerDown}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={handleDragHandleContextMenu}
          role="button"
          aria-label="Arrastar para reordenar"
        >
          <DragHandleIcon />
        </span>

        <div className="group-title-block">
          <div className="group-title-row">
            <h2 className="group-title">{group.title}</h2>
            {isOpen && (
              <button
                className={`group-edit-btn${isEditing ? " active" : ""}`}
                onClick={(e) => { e.stopPropagation(); setIsEditing((v) => !v); }}
                aria-label="Editar grupo"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
          {hasAmounts && (
            <div className="group-meta">
              {plannedExpense > 0 && (
                <span className="group-sum" title="Despesas executadas / planejadas">
                  <span className="sum-arrow expense" aria-hidden="true">↓</span>
                  {executedExpense > 0 && (
                    <><span className="sum-paid">{formatBRL(executedExpense)}</span><span className="sum-sep"> / </span></>
                  )}
                  <span>{formatBRL(plannedExpense)}</span>
                </span>
              )}
              {plannedRevenue > 0 && (
                <span className="group-sum" title="Receitas executadas / planejadas">
                  <span className="sum-arrow revenue" aria-hidden="true">↑</span>
                  {executedRevenue > 0 && (
                    <><span className="sum-received">{formatBRL(executedRevenue)}</span><span className="sum-sep"> / </span></>
                  )}
                  <span>{formatBRL(plannedRevenue)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="group-header-right">
          <button
            className={`progress-badge${isSemi ? " semi" : ""}${isBalance ? " balance" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleCollapsed(viewCycleSkips); }}
            aria-label={
              isClosed  ? "Mostrar pendentes" :
              isSemi    ? "Expandir tudo" :
              isBalance ? "Recolher grupo" :
              canShowBalance ? "Mostrar saldo por período" :
                        "Recolher grupo"
            }
          >
            <span className="progress-done">{done}</span>
            <span className="progress-sep">/</span>
            <span className="progress-total">{total}</span>
            <ViewStateIcon viewState={viewState} />
          </button>
        </div>
      </div>

      {/* Per-group progress bar */}
      <div className="group-progress-bar">
        <div className="group-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Metrics panel — slides open when the header is tapped */}
      <div className={`group-metrics-panel${metricsVisible ? " open" : ""}`}>
        <div className="group-metrics-inner">
          <div className="group-metrics-content">
            <div className="metric-row">
              <span className="metric-label">Executado</span>
              <span className="metric-pair">
                <span className="metric-revenue">{formatBRLAlways(executedRevenue)}</span>
                <span className="metric-vs">vs</span>
                <span className="metric-expense">{formatBRLAlways(executedExpense)}</span>
              </span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Planejado</span>
              <span className="metric-pair">
                <span className="metric-revenue">{formatBRLAlways(plannedRevenue)}</span>
                <span className="metric-vs">vs</span>
                <span className="metric-expense">{formatBRLAlways(plannedExpense)}</span>
              </span>
            </div>
            <div className="metric-row metric-net">
              <span className="metric-label">Saldo executado</span>
              <span className={`metric-net-value${netExecuted < 0 ? " negative" : netExecuted > 0 ? " positive" : ""}`}>
                {formatBRLSigned(netExecuted)}
              </span>
            </div>
            <div className="metric-row metric-net">
              <span className="metric-label">Saldo planejado</span>
              <span className={`metric-net-value${netPlanned < 0 ? " negative" : netPlanned > 0 ? " positive" : ""}`}>
                {formatBRLSigned(netPlanned)}
              </span>
            </div>
            <div className="metric-legend">
              <span><span className="sum-arrow revenue" aria-hidden="true">↑</span> receita</span>
              <span><span className="sum-arrow expense" aria-hidden="true">↓</span> despesa</span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit panel — slides open below header when isEditing */}
      <div className={`group-edit-panel${isEditing ? " open" : ""}`}>
        <div className="group-edit-inner">
        <div className="group-edit-inner-content">

          {/* Rename */}
          <input
            className="group-edit-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveGroupEdit(); if (e.key === "Escape") setIsEditing(false); }}
            placeholder="Nome do grupo"
            maxLength={40}
          />

          {/* Date mode */}
          <div className="group-edit-modes">
            {[
              { value: "none",   label: "Sem data" },
              { value: "days",   label: "Dias" },
              { value: "months", label: "Meses" },
            ].map(({ value, label }) => (
              <button
                key={value}
                className={`group-add-mode-btn${editMode === value ? " active" : ""}`}
                onClick={() => setEditMode(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Actions row */}
          <div className="group-edit-actions">
            {(done > 0 || resetDate) && (
              <button className="group-edit-action-btn reset" onClick={() => { onReset(); setIsEditing(false); }}>
                Resetar
              </button>
            )}
            <button
              className={`group-edit-action-btn delete${confirmDelete ? " confirm" : ""}`}
              onClick={() => { if (confirmDelete) onRemoveGroup(); else setConfirmDelete(true); }}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? "Confirmar?" : "Excluir grupo"}
            </button>
            <button
              className="group-edit-action-btn save"
              onClick={hasChanges ? saveGroupEdit : () => setIsEditing(false)}
            >
              {hasChanges ? "Salvar" : "Fechar"}
            </button>
          </div>

        </div>
        </div>
      </div>

      {/* Balance projection — replaces the item list in the "balance" view */}
      <div className={`balance-wrapper${isBalance ? "" : " collapsed"}`}>
        <div className="balance-inner">
          <GroupBalanceTimeline
            items={group.items}
            checked={checked}
            snoozed={snoozed}
            values={values}
            kinds={kinds}
            dates={dates}
            dateMode={group.dateMode}
            openingBalance={openingBalance}
            onOpeningBalanceChange={onOpeningBalanceChange}
            lastReset={lastReset}
          />
        </div>
      </div>

      {/* Collapsible items + add row */}
      <div className={`item-list-wrapper${isClosed || isBalance ? " collapsed" : ""}`}>
        <ul className="item-list">
          {displayItems.map((item) => (
            <CheckboxItem
              key={item.id}
              label={item.label}
              checked={!!checked[item.id]}
              onChange={() => onToggle(item.id)}
              snoozed={!!snoozed[item.id]}
              onToggleSnooze={() => onToggleSnooze(item.id)}
              value={values[item.id] || ""}
              onValueChange={(val) => onValueChange(item.id, val)}
              actualValue={actualValues[item.id]}
              dueDate={dates[item.id] ?? null}
              onDateChange={(val) => onDateChange(item.id, val)}
              dateMode={group.dateMode}
              kind={kindOf(kinds, item.id)}
              onOpenDetails={() => onOpenDetails(item.id)}
              onRemove={() => onRemoveItem(item.id)}
              onRename={(newLabel) => onRenameItem(item.id, newLabel)}
            />
          ))}

          {!isSemi && !isBalance && (adding ? (
            <li className="item-add-form">
              <input
                ref={inputRef}
                className="item-add-input"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") cancelAdd();
                }}
                placeholder="Nome da conta..."
                maxLength={60}
              />
              <button className="item-add-confirm" onClick={handleAdd} disabled={!newLabel.trim()} aria-label="Confirmar">✓</button>
              <button className="item-add-cancel" onClick={cancelAdd} aria-label="Cancelar">✕</button>
            </li>
          ) : (
            <li className="item-add-btn-row">
              <button className="item-add-btn" onClick={() => setAdding(true)}>+ Adicionar conta</button>
              {(done > 0 || resetDate) && (
                <button
                  className={`reset-btn${confirmReset ? " confirm" : ""}`}
                  onClick={() => { if (confirmReset) { onReset(); setConfirmReset(false); } else setConfirmReset(true); }}
                  onBlur={() => setConfirmReset(false)}
                  title={confirmReset ? "Clique novamente para confirmar" : "Resetar ciclo"}
                >
                  {confirmReset ? "Confirmar?" : resetDate ?? "Resetar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
