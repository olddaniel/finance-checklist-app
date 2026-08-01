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

export default function AuthScreen({ onExportLocal, hasLocalData }) {
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? "new-password" : "current-password"}
            // Only a signup constraint — on sign-in, let the server answer
            minLength={isSignup ? 6 : undefined}
            required
          />
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

        {hasLocalData && (
          <div className="auth-local">
            <p>Este dispositivo ainda tem dados salvos localmente.</p>
            <button type="button" className="auth-local-btn" onClick={onExportLocal}>
              Exportar backup local
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
