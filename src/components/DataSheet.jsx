import { useState, useRef, useEffect } from "react";
import PluggyConnections from "./PluggyConnections";
import { getTheme, setTheme } from "../lib/theme";

// A backup is anything that parses as JSON and carries a groups array — that
// covers files this app exported and raw localStorage blobs copied by hand.
function readBackup(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || !Array.isArray(data.groups)) {
    throw new Error("unrecognised shape");
  }
  return {
    data,
    groups: data.groups.length,
    items: data.groups.reduce((n, g) => n + (Array.isArray(g.items) ? g.items.length : 0), 0),
    exportedAt: typeof data.__exportedAt === "string" ? data.__exportedAt : null,
  };
}

function formatStamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DataSheet({ groupCount, itemCount, onClose, onExport, onImport, account }) {
  const [pending, setPending] = useState(null);
  const [error,   setError]   = useState(null);
  const [importing, setImporting] = useState(false);
  const [theme,   setThemeState] = useState(getTheme);
  const fileRef = useRef(null);

  function pickTheme(next) {
    setTheme(next);
    setThemeState(next);
  }

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

  function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again after a cancel
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPending({ ...readBackup(String(reader.result)), name: file.name });
        setError(null);
      } catch {
        setPending(null);
        setError("Arquivo inválido — escolha um backup exportado por este app.");
      }
    };
    reader.onerror = () => {
      setPending(null);
      setError("Não foi possível ler o arquivo.");
    };
    reader.readAsText(file);
  }

  // onImport resolves false when the write failed. Saying "importado" then would
  // be a lie, and in cloud mode a costly one — so the confirmation stays open
  // with the export button next to it.
  async function confirmImport() {
    setImporting(true);
    setError(null);
    const ok = await onImport(pending.data);
    setImporting(false);
    if (!ok) {
      setError("Não foi possível importar. Nada mudou aqui — exporte um backup antes de tentar de novo.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Dados e backup"
      >
        <div className="modal-head">
          <span className="modal-group-title">Dados</span>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <p className="sheet-summary">
          <strong>{groupCount}</strong> {groupCount === 1 ? "grupo" : "grupos"}
          {" · "}
          <strong>{itemCount}</strong> {itemCount === 1 ? "conta" : "contas"}
          {account?.email ? " na sua conta" : " neste dispositivo"}
        </p>

        {account?.email && (
          <div className="sheet-account">
            <div className="sheet-account-row">
              <span className="sheet-account-email">{account.email}</span>
              <span className={`sheet-account-status ${account.status}`}>
                {account.status === "saving" ? "salvando..." :
                 account.status === "error"  ? "erro ao salvar" : "sincronizado"}
              </span>
            </div>
            <PluggyConnections />
            <button className="sheet-btn" onClick={account.onSignOut} type="button">
              Sair
            </button>
          </div>
        )}

        {account?.localOnly && (
          <div className="sheet-account">
            <p className="modal-note">
              Este dispositivo está no modo <strong>somente neste dispositivo</strong>: nada
              é enviado para uma conta e limpar os dados do navegador apaga tudo. Entrar com
              uma conta não apaga o que está aqui — o app oferece importar estes dados.
            </p>
            <button className="sheet-btn" onClick={account.onUseCloud} type="button">
              Entrar com uma conta
            </button>
          </div>
        )}

        <div className="modal-field">
          <span className="modal-field-label">Tema</span>
          <div className="modal-toggle-group">
            <button
              className={`modal-toggle-btn theme${theme === "light" ? " active" : ""}`}
              onClick={() => pickTheme("light")}
              type="button"
              aria-pressed={theme === "light"}
            >
              Claro
            </button>
            <button
              className={`modal-toggle-btn theme${theme === "dark" ? " active" : ""}`}
              onClick={() => pickTheme("dark")}
              type="button"
              aria-pressed={theme === "dark"}
            >
              Escuro
            </button>
          </div>
        </div>

        {!pending && (
          <>
            <div className="sheet-actions">
              <button className="sheet-btn primary" onClick={onExport} type="button">
                Exportar backup (JSON)
              </button>
              <button className="sheet-btn" onClick={() => fileRef.current?.click()} type="button">
                Importar backup
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFile}
              hidden
            />
            {error && <p className="sheet-error">{error}</p>}
            <p className="modal-note">
              O backup guarda grupos, contas, valores, datas e saldos. Guarde o arquivo
              fora do navegador — limpar os dados do site apaga tudo que está aqui.
            </p>
          </>
        )}

        {pending && (
          <div className="sheet-confirm">
            <p className="sheet-confirm-title">Importar “{pending.name}”?</p>
            <p className="sheet-summary">
              <strong>{pending.groups}</strong> {pending.groups === 1 ? "grupo" : "grupos"}
              {" · "}
              <strong>{pending.items}</strong> {pending.items === 1 ? "conta" : "contas"}
              {formatStamp(pending.exportedAt) && <> · exportado em {formatStamp(pending.exportedAt)}</>}
            </p>
            <p className="sheet-warning">
              {account?.email
                ? "Isto substitui todos os dados da sua conta, em todos os dispositivos. Dá para desfazer logo depois."
                : "Isto substitui todos os dados deste dispositivo. Dá para desfazer logo depois."}
            </p>
            {error && <p className="sheet-error">{error}</p>}
            <div className="modal-actions">
              <button className="modal-action-btn" onClick={() => setPending(null)} type="button" disabled={importing}>
                Cancelar
              </button>
              <button
                className="modal-action-btn danger"
                onClick={confirmImport}
                type="button"
                disabled={importing}
              >
                {importing ? "Importando..." : "Substituir dados"}
              </button>
            </div>
            {error && (
              <button className="sheet-btn" onClick={onExport} type="button">
                Exportar backup (JSON)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
