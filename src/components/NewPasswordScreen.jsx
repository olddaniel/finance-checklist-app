import { useState } from "react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/authErrors";

const MIN_LENGTH = 6;

/**
 * Shown when the app is opened through a recovery link. Supabase has already
 * signed the person in at this point, so the only thing standing between them
 * and their data is setting the new password — but until it is set, that
 * session is the recovery link's, not a remembered one, and dropping straight
 * into the app would leave the old password in place without saying so.
 */
export default function NewPasswordScreen({ email, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_LENGTH) { setError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`); return; }
    if (password !== confirm)         { setError("As duas senhas não são iguais."); return; }

    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(friendlyError(err.message)); return; }
    onDone();
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <span className="auth-icon">💳</span>
          <h1 className="auth-title">Nova senha</h1>
        </div>

        <p className="auth-lead">
          {email ? <>Criando uma nova senha para <strong>{email}</strong>.</> : "Crie uma nova senha para sua conta."}
        </p>

        <label className="auth-field">
          <span>Nova senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            // Length and equality are both checked below, so both failures come
            // back in the same voice instead of one native bubble and one line
            required
            autoFocus
          />
        </label>

        <label className="auth-field">
          <span>Repita a nova senha</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "..." : "Salvar nova senha"}
        </button>

        <button
          className="auth-switch"
          type="button"
          onClick={() => supabase.auth.signOut()}
        >
          Cancelar e voltar
        </button>
      </form>
    </div>
  );
}
