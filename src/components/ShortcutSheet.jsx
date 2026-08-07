import { useEffect } from "react";

// Exactly the keys the app binds — nothing aspirational. Every line here also
// has a mouse or touch path, so this teaches a faster route rather than the
// only one.
const SHORTCUTS = [
  { keys: ["↑ ↓"], alt: ["J", "K"], label: "Mover o cursor entre as contas" },
  { keys: ["Espaço"],               label: "Marcar como paga / recebida" },
  { keys: ["Enter"],                label: "Abrir os detalhes da conta" },
  { keys: ["Shift", "↑ ↓"],         label: "Mover a conta dentro do grupo" },
  { keys: ["Esc"],                  label: "Fechar a janela, ou soltar o cursor" },
  { keys: ["?"],                    label: "Mostrar esta lista" },
];

export default function ShortcutSheet({ onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card shortcuts-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Atalhos do teclado"
      >
        <div className="modal-head">
          <span className="modal-group-title">Atalhos do teclado</span>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <ul className="shortcuts-list">
          {SHORTCUTS.map(({ keys, alt, label }) => (
            <li className="shortcut-row" key={label}>
              <span className="shortcut-keys">
                {keys.map((k) => <kbd key={k}>{k}</kbd>)}
                {alt && <><span className="shortcut-or">ou</span>{alt.map((k) => <kbd key={k}>{k}</kbd>)}</>}
              </span>
              <span className="shortcut-label">{label}</span>
            </li>
          ))}
        </ul>

        <p className="modal-note">
          Tudo isso continua funcionando com o mouse e no celular — os atalhos
          só encurtam o caminho.
        </p>
      </div>
    </div>
  );
}
