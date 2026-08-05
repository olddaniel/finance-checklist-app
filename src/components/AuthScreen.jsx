import { useState } from "react";
import { supabase } from "../lib/supabase";

// Supabase's own messages are English and fairly technical; map the ones a
// person actually hits.
function friendlyError(message = "") {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("user already registered")) return "Já existe uma conta com esse e-mail. Tente entrar.";
  if (m.includes("password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("email address") && m.includes("invalid")) return "E-mail inválido.";
  if (m.includes("confirm")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sem conexão com o servidor.";
  return message || "Não foi possível continuar.";
}

// `off` shows the struck-through eye, i.e. the password is currently visible
function EyeIcon({ off }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {off && <path d="M3 21L21 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

export default function AuthScreen({ onExportLocal, hasLocalData }) {
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode]         = useState("signin"); // signin | signup
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [notice, setNotice]     = useState(null);

  const isSignup = mode === "signup";

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true); setError(null); setNotice(null);

    const credentials = { email: email.trim(), password };
    const { data, error: err } = isSignup
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);

    if (err) {
      setError(friendlyError(err.message));
    } else if (isSignup && !data.session) {
      // Only happens if e-mail confirmation is still switched on in Supabase
      setNotice("Conta criada. Confirme o e-mail enviado para entrar.");
    }
    setBusy(false);
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <span className="auth-icon">💳</span>
          <h1 className="auth-title">Finance Tracker</h1>
        </div>

        <p className="auth-lead">
          {isSignup ? "Crie uma conta para sincronizar entre dispositivos." : "Entre para acessar seus dados."}
        </p>

        <label className="auth-field">
          <span>E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            required
          />
        </label>

        <label className="auth-field">
          <span>Senha</span>
          <span className="auth-input-wrap">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              // Only a signup constraint — on sign-in, let the server answer
              minLength={isSignup ? 6 : undefined}
              required
            />
            <button
              type="button"
              className="auth-reveal"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              // Keeps the toggle out of the tab order between the field and submit
              tabIndex={-1}
            >
              <EyeIcon off={showPassword} />
            </button>
          </span>
        </label>

        {error  && <p className="auth-error">{error}</p>}
        {notice && <p className="auth-notice">{notice}</p>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "..." : isSignup ? "Criar conta" : "Entrar"}
        </button>

        <button
          className="auth-switch"
          type="button"
          onClick={() => { setMode(isSignup ? "signin" : "signup"); setError(null); setNotice(null); }}
        >
          {isSignup ? "Já tenho conta" : "Criar uma conta"}
        </button>

        <div className="auth-local">
          {hasLocalData && (
            <>
              <p>Este dispositivo ainda tem dados salvos localmente.</p>
              <button type="button" className="auth-local-btn" onClick={onExportLocal}>
                Exportar backup local
              </button>
            </>
          )}
          {/* Escape hatch: the purely local app, always reachable without a login */}
          <button
            type="button"
            className="auth-local-btn"
            onClick={() => { window.location.search = "?cloud=0"; }}
          >
            Usar somente neste dispositivo
          </button>
        </div>
      </form>
    </div>
  );
}
