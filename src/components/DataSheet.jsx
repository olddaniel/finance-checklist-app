import { useState, useRef, useEffect } from "react";

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

export default function DataSheet({ groupCount, itemCount, onClose, onExport, onImport }) {
  const [pending, setPending] = useState(null);
  const [error,   setError]   = useState(null);
  const fileRef = useRef(null);

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
          <strong>{itemCount}</strong> {itemCount === 1 ? "conta" : "contas"} neste dispositivo
        </p>

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
              Isto substitui todos os dados deste dispositivo. Dá para desfazer logo depois.
            </p>
            <div className="modal-actions">
              <button className="modal-action-btn" onClick={() => setPending(null)} type="button">
                Cancelar
              </button>
              <button
                className="modal-action-btn danger"
                onClick={() => onImport(pending.data)}
                type="button"
              >
                Substituir dados
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
