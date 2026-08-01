const DURATION_MS = 3500;

export default function Toast({ message, onUndo, canUndo = true, visible, toastKey }) {
  return (
    <div className={`toast${visible ? " visible" : ""}`} role="status" aria-live="polite">
      <span className="toast-message">{message}</span>
      {canUndo && <button className="toast-undo-btn" onClick={onUndo}>Desfazer</button>}
      {visible && (
        <div
          key={toastKey}
          className="toast-progress"
          style={{ animationDuration: `${DURATION_MS}ms` }}
        />
      )}
    </div>
  );
}
