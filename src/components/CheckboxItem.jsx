import { useState, useEffect, useRef } from "react";
import { MONTHS, REVENUE, formatBRLAlways } from "../utils";

// Distance (px) at which the action commits on release
const THRESHOLD = 80;
// Rubber-band resistance past the threshold (fraction of extra movement applied)
const BAND = 0.25;

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SnoozeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CheckboxItem({
  label, checked, onChange,
  snoozed, onToggleSnooze,
  value, onValueChange,
  actualValue,
  dueDate, onDateChange,
  dateMode = "days",
  kind, onOpenDetails,
  onRemove, onRename,
}) {
  const isRevenue = kind === REVENUE;
  // Only worth two numbers when they disagree; a realised value equal to the
  // plan is already on screen, and a row with none stays as it was.
  const showActual = actualValue != null && Number(actualValue) !== (Number(value) || 0);
  // ── Swipe ──
  const [offset,  setOffset]  = useState(0);
  const [animate, setAnimate] = useState(false);
  const touch = useRef({ x: 0, y: 0, dir: null });

  const overThreshold = Math.abs(offset) >= THRESHOLD;
  const swipingLeft   = offset < -2;
  const swipingRight  = offset >  2;

  function snap(x) { setAnimate(true); setOffset(x); }

  function handleTouchStart(e) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: null };
    setAnimate(false);
  }
  function handleTouchMove(e) {
    const dx = e.touches[0].clientX - touch.current.x;
    const dy = e.touches[0].clientY - touch.current.y;
    if (touch.current.dir === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      touch.current.dir = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
    }
    if (touch.current.dir !== "h") return;
    // Free movement up to THRESHOLD, then rubber-band resistance
    let next;
    if      (dx < -THRESHOLD) next = -THRESHOLD + (dx + THRESHOLD) * BAND;
    else if (dx >  THRESHOLD) next =  THRESHOLD + (dx - THRESHOLD) * BAND;
    else                      next = dx;
    setOffset(next);
  }
  function handleTouchEnd() {
    if (touch.current.dir !== "h") return;
    if      (offset <= -THRESHOLD) { snap(0); onRemove(); }
    else if (offset >=  THRESHOLD) { snap(0); onToggleSnooze(); }
    else                           { snap(0); }
  }

  // Tapping the row anywhere other than the checkbox, the label, the value or
  // the day opens the detail modal. Swipes must not count as taps.
  function handleRowClick() {
    if (touch.current.dir === "h" || offset !== 0) return;
    onOpenDetails?.();
  }

  // ── Edit ──
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(label);
  const labelInputRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(label); }, [label, editing]);
  useEffect(() => { if (editing) labelInputRef.current?.focus(); }, [editing]);

  function save() {
    const t = draft.trim();
    if (t && t !== label) onRename(t);
    setEditing(false);
  }
  function cancel() { setDraft(label); setEditing(false); }

  const dirClass = swipingRight ? " swiping-right" : swipingLeft ? " swiping-left" : "";

  return (
    <li className={`item-outer${checked ? " item-checked" : ""}${snoozed ? " item-snoozed" : ""}${isRevenue ? " item-revenue" : ""}${showActual ? " item-has-actual" : ""}${dirClass}`}>
      {/* Snooze zone — fills container, revealed when row slides right */}
      <button
        className={`item-snooze-zone${snoozed ? " active" : ""}${overThreshold && swipingRight ? " over-threshold" : ""}`}
        onClick={() => { onToggleSnooze(); snap(0); }}
        aria-label={snoozed ? `Desadiar ${label}` : `Adiar ${label}`}
      >
        <SnoozeIcon />
        <span>{snoozed ? "Desadiar" : "Adiar"}</span>
      </button>

      {/* Delete zone — fills container, revealed when row slides left */}
      <button
        className={`item-delete-zone${overThreshold && swipingLeft ? " over-threshold" : ""}`}
        onClick={() => { onRemove(); snap(0); }}
        aria-label={`Remover ${label}`}
      >
        <TrashIcon />
        <span>Remover</span>
      </button>

      <div
        className="item"
        style={{ transform: `translateX(${offset}px)`, transition: animate ? "transform 0.22s ease" : "none" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleRowClick}
      >
        <button
          className={`item-checkbox${checked ? " checked" : ""}${snoozed ? " snoozed" : ""}`}
          onClick={(e) => { e.stopPropagation(); onChange(); }}
          role="checkbox" aria-checked={checked} aria-label={label}
        >
          {checked && (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 5.5l3 3 5-5" stroke="#fff" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {snoozed && !checked && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {editing ? (
          <input
            ref={labelInputRef}
            className="item-label-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
            onBlur={save}
            onClick={(e) => e.stopPropagation()}
            maxLength={60}
            aria-label="Editar nome da conta"
          />
        ) : (
          <>
            <span className="item-label" onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(label); }}>
              {label}
            </span>
            <span className="item-label-spacer" aria-hidden="true" />
          </>
        )}

        <span className="item-right" onClick={(e) => e.stopPropagation()}>
          <span className="item-value-wrapper">
            <span className="item-value-prefix">{isRevenue ? "+R$" : "R$"}</span>
            <input
              type="number"
              className="item-value-input"
              min="0" step="0.01"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
              placeholder="—"
              aria-label={`Valor estimado: ${label}`}
            />
          </span>

          {showActual && (
            <span className="item-actual" title="Valor realizado">
              {formatBRLAlways(actualValue)}
            </span>
          )}

          {dateMode !== "none" && (
            <select
              className={`item-date-select${dueDate ? " has-value" : ""}`}
              value={dueDate ?? ""}
              onChange={(e) => onDateChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
              aria-label={dateMode === "days" ? "Dia do vencimento" : "Mês do vencimento"}
            >
              <option value="">—</option>
              {dateMode === "days"
                ? Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))
                : MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))
              }
            </select>
          )}
        </span>
      </div>
    </li>
  );
}
