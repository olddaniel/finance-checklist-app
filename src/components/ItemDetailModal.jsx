import { useState, useEffect } from "react";
import { MONTHS, EXPENSE, REVENUE, formatBRLAlways } from "../utils";

export default function ItemDetailModal({
  groupTitle,
  item,
  dateMode = "days",
  kind,
  checked,
  snoozed,
  value,
  dueDate,
  onClose,
  onToggleChecked,
  onToggleSnooze,
  onKindChange,
  onValueChange,
  onDateChange,
  onRename,
  onRemove,
}) {
  // Keyed on item.id by the parent, so a different row remounts with a fresh draft
  const [draft, setDraft] = useState(item.label);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Escape to close + lock background scroll while open
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const isRevenue = kind === REVENUE;

  function commitName() {
    const t = draft.trim();
    if (t && t !== item.label) onRename(t);
    else setDraft(item.label);
  }

  const status = checked  ? (isRevenue ? "Recebida" : "Paga")
               : snoozed  ? "Adiada"
                          : "Pendente";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-card${isRevenue ? " revenue" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${item.label}`}
      >
        <div className="modal-head">
          <span className="modal-group-title">{groupTitle}</span>
          <span className={`modal-status-tag${checked ? " done" : snoozed ? " snoozed" : ""}`}>
            {status}
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <input
          className="modal-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter")  { e.preventDefault(); commitName(); e.target.blur(); }
            if (e.key === "Escape") { e.preventDefault(); setDraft(item.label); }
          }}
          maxLength={60}
          aria-label="Nome"
        />

        <div className="modal-fields">
          {/* Revenue / expense */}
          <div className="modal-field">
            <span className="modal-field-label">Tipo</span>
            <div className="modal-toggle-group">
              <button
                className={`modal-toggle-btn expense${!isRevenue ? " active" : ""}`}
                onClick={() => onKindChange(EXPENSE)}
                type="button"
              >
                Despesa
              </button>
              <button
                className={`modal-toggle-btn revenue${isRevenue ? " active" : ""}`}
                onClick={() => onKindChange(REVENUE)}
                type="button"
              >
                Receita
              </button>
            </div>
          </div>

          {/* Value */}
          <div className="modal-field">
            <span className="modal-field-label">Valor</span>
            <span className="modal-value-wrapper">
              <span className="modal-value-prefix">R$</span>
              <input
                type="number"
                className="modal-value-input"
                min="0" step="0.01"
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                placeholder="0,00"
                aria-label="Valor"
              />
            </span>
          </div>

          {/* Due date */}
          {dateMode !== "none" && (
            <div className="modal-field">
              <span className="modal-field-label">
                {dateMode === "days" ? "Dia do vencimento" : "Mês do vencimento"}
              </span>
              <select
                className={`modal-date-select${dueDate ? " has-value" : ""}`}
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
            </div>
          )}

          {/* Status */}
          <div className="modal-field">
            <span className="modal-field-label">Situação</span>
            <div className="modal-toggle-group">
              <button
                className={`modal-toggle-btn done${checked ? " active" : ""}`}
                onClick={onToggleChecked}
                type="button"
              >
                {isRevenue ? "Recebida" : "Paga"}
              </button>
              <button
                className={`modal-toggle-btn snooze${snoozed ? " active" : ""}`}
                onClick={onToggleSnooze}
                type="button"
              >
                Adiada
              </button>
            </div>
          </div>
        </div>

        <p className="modal-note">
          {snoozed
            ? "Adiada — fora dos totais do grupo."
            : isRevenue
              ? `Entra como receita ${checked ? "executada" : "planejada"} de ${formatBRLAlways(value)}.`
              : `Entra como despesa ${checked ? "executada" : "planejada"} de ${formatBRLAlways(value)}.`}
        </p>

        <div className="modal-actions">
          <button
            className={`modal-action-btn delete${confirmDelete ? " confirm" : ""}`}
            onClick={() => { if (confirmDelete) onRemove(); else setConfirmDelete(true); }}
            onBlur={() => setConfirmDelete(false)}
            type="button"
          >
            {confirmDelete ? "Confirmar?" : "Excluir"}
          </button>
          <button className="modal-action-btn close" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
