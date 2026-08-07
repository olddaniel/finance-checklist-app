import { useState } from "react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/authErrors";

// Where the recovery e-mail sends the person back to. Supabase appends its own
// #access_token=…&type=recovery, and the app has to reopen in cloud mode or the
// screen that reads that link does not exist.
function recoveryRedirect() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "?cloud=1";
  return url.toString();
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
  const [mode, setMode]         = useState("signin"); // signin | signup | recover
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [notice, setNotice]     = useState(null);
  // The local-only button used to switch modes on the first click, which made it
  // a one-way door pressed by mistake after a failed sign-in. It now explains
  // itself first.
  const [confirmLocal, setConfirmLocal] = useState(false);

  const isSignup  = mode === "signup";
  const isRecover = mode === "recover";

  function switchMode(next) {
    setMode(next); setError(null); setNotice(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    if (!isRecover && !password) return;
    setBusy(true); setError(null); setNotice(null);

    if (isRecover) {
      const { error: err } = await supabase.auth.resetPasswordForEmail(
        email.trim(), { redirectTo: recoveryRedirect() }
      );
      // Only claim an e-mail is on its way when the call actually succeeded
      if (err) setError(friendlyError(err.message));
      else setNotice("Se existe uma conta com esse e-mail, o link de recuperação foi enviado. Pode levar alguns minutos — confira o spam.");
      setBusy(false);
      return;
    }

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
          {isRecover ? "Informe seu e-mail para receber um link e criar uma nova senha."
            : isSignup ? "Crie uma conta para sincronizar entre dispositivos."
            : "Entre para acessar seus dados."}
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

        {!isRecover && (
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
        )}

        {isRecover && (
          // No SMTP server is configured, so the built-in sender is both slow and
          // tightly rate-limited. Better to say so than to look broken.
          <p className="auth-note">
            O e-mail é enviado pelo servidor do Supabase, que é limitado: pode demorar
            alguns minutos, cair no spam ou não chegar. Se não chegar, tente de novo
            mais tarde.
          </p>
        )}

        {error  && <p className="auth-error">{error}</p>}
        {notice && <p className="auth-notice">{notice}</p>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "..." : isRecover ? "Enviar link de recuperação" : isSignup ? "Criar conta" : "Entrar"}
        </button>

        {!isRecover && !isSignup && (
          <button className="auth-link" type="button" onClick={() => switchMode("recover")}>
            Esqueci minha senha
          </button>
        )}

        <button
          className="auth-switch"
          type="button"
          onClick={() => switchMode(isRecover ? "signin" : isSignup ? "signin" : "signup")}
        >
          {isRecover ? "Voltar para entrar" : isSignup ? "Já tenho conta" : "Criar uma conta"}
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
          {/* Escape hatch: the purely local app, always reachable without a login.
              It changes how the app opens from now on, so it asks first. */}
          {!confirmLocal && (
            <button type="button" className="auth-local-btn" onClick={() => setConfirmLocal(true)}>
              Usar somente neste dispositivo
            </button>
          )}
          {confirmLocal && (
            <>
              <p>
                No modo <strong>somente neste dispositivo</strong> os dados ficam apenas
                neste navegador: sem conta, sem sincronizar com o celular e sem backup
                automático. O app passa a abrir sempre assim — dá para voltar quando
                quiser pelo botão 💳 (Dados), sem perder nada.
              </p>
              <button
                type="button"
                className="auth-local-btn"
                onClick={() => { window.location.search = "?cloud=0"; }}
              >
                Continuar sem conta
              </button>
              <button type="button" className="auth-switch" onClick={() => setConfirmLocal(false)}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
