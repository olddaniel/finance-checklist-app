const DURATION_MS = 3500;

export default function Toast({ message, onUndo, canUndo = true, hint, visible, toastKey }) {
  return (
    <div className={`toast${visible ? " visible" : ""}`} role="status" aria-live="polite">
      <span className="toast-message">{message}</span>
      {canUndo && <button className="toast-undo-btn" onClick={onUndo}>Desfazer</button>}
      {/* After the undo button, and hidden from screen readers: undo is what the
          toast is for, and anyone listening to it is already on the keyboard. */}
      {hint && (
        <span className="toast-hint" aria-hidden="true">
          da próxima vez
          {hint.map((k) => <kbd key={k}>{k}</kbd>)}
        </span>
      )}
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
