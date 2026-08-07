import { useState, useCallback, useMemo, useEffect } from "react";
import AppShell from "./AppShell";
import AuthScreen from "./components/AuthScreen";
import NewPasswordScreen from "./components/NewPasswordScreen";
import { usePayments, normalizeBackup } from "./hooks/usePayments";
import { useCloudPayments } from "./hooks/useCloudPayments";
import { useAuth } from "./hooks/useAuth";
import { supabase } from "./lib/supabase";
import { cloudEnabled } from "./lib/cloud";
import { friendlyError } from "./lib/authErrors";
import "./App.css";

const LOCAL_KEY = "payment-tracker-state";

// How long getSession() may take before the boot screen admits it is stuck
const BOOT_STALL_MS = 6000;

function readLocalBackup() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data?.groups) && data.groups.some((g) => g.items?.length) ? data : null;
  } catch {
    return null;
  }
}

function downloadJson(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function backupName() {
  return `finance-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

function goToMode(cloud) {
  window.location.search = cloud ? "?cloud=1" : "?cloud=0";
}

function BootScreen({ label, children }) {
  return (
    <div className="boot-screen">
      <span className="boot-icon">💳</span>
      <p>{label}</p>
      {children}
    </div>
  );
}

// ── Local-only app: everything in localStorage, and a standing way back ──
function LocalApp() {
  // The shell only needs to know this device opted out of the cloud, so it can
  // keep offering the account the person came here without.
  const account = { localOnly: true, onUseCloud: () => goToMode(true) };
  return <AppShell store={usePayments()} account={account} />;
}

// ── Cloud app: Supabase-backed, gated behind sign-in ──
function CloudApp() {
  const { session, recovering, endRecovery } = useAuth();
  const [error, setError] = useState(null);
  const onError = useCallback((message) => setError(message ?? "Falha ao salvar"), []);
  const cloud = useCloudPayments(session, onError);

  // Offered on first sign-in when the account is empty and this device is not
  const [dismissedImport, setDismissedImport] = useState(false);
  const [importBusy, setImportBusy]   = useState(false);
  const [importError, setImportError] = useState(null);
  const [retryBusy, setRetryBusy]     = useState(false);
  const localBackup = useMemo(() => readLocalBackup(), []);

  // Offline at open, getSession() never settles and the icon pulses forever
  const [bootStalled, setBootStalled] = useState(false);
  useEffect(() => {
    if (session !== undefined) return;
    const timer = setTimeout(() => setBootStalled(true), BOOT_STALL_MS);
    return () => clearTimeout(timer);
  }, [session]);

  if (session === undefined) {
    return (
      <BootScreen label={bootStalled ? "Sem resposta do servidor." : "Carregando…"}>
        {bootStalled && (
          <div className="boot-actions">
            <button className="auth-local-btn" onClick={() => window.location.reload()}>
              Tentar de novo
            </button>
            <button className="auth-local-btn" onClick={() => goToMode(false)}>
              Usar somente neste dispositivo
            </button>
          </div>
        )}
      </BootScreen>
    );
  }

  if (session === null) {
    return (
      <AuthScreen
        hasLocalData={!!localBackup}
        onExportLocal={() => downloadJson(localBackup, backupName())}
      />
    );
  }

  // A recovery link signs the person in, so this has to come before the data
  if (recovering) {
    return <NewPasswordScreen email={session.user?.email} onDone={endRecovery} />;
  }

  if (cloud.loading) {
    return <BootScreen label="Carregando…" />;
  }

  // A failed read is not an empty account: the only thing offered here is
  // another attempt, never anything that writes.
  if (cloud.loadError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-icon">💳</span>
            <h1 className="auth-title">Não foi possível carregar</h1>
          </div>
          <p className="auth-lead">
            Seus dados continuam na sua conta — só não conseguimos ler agora.
          </p>
          <p className="auth-error">{friendlyError(cloud.loadError)}</p>
          <button
            className="auth-submit"
            disabled={retryBusy}
            onClick={async () => { setRetryBusy(true); await cloud.reload(); setRetryBusy(false); }}
          >
            {retryBusy ? "..." : "Tentar de novo"}
          </button>
          <div className="auth-local">
            {localBackup && (
              <button className="auth-local-btn" onClick={() => downloadJson(localBackup, backupName())}>
                Exportar backup local
              </button>
            )}
            <button className="auth-switch" onClick={() => supabase.auth.signOut()}>
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  const accountEmpty = cloud.groups.length === 0;
  const offerImport  = accountEmpty && localBackup && !dismissedImport;

  if (offerImport) {
    const items = localBackup.groups.reduce((n, g) => n + (g.items?.length ?? 0), 0);
    async function handleImport() {
      setImportBusy(true); setImportError(null);
      const ok = await cloud.replaceAll(normalizeBackup(localBackup));
      setImportBusy(false);
      // The offer stays on screen when the write failed — dismissing it would
      // hide the only copy of this data behind a cleared browser.
      if (ok) setDismissedImport(true);
      else setImportError("Não foi possível importar. Seus dados continuam salvos neste navegador — tente de novo.");
    }
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-icon">💳</span>
            <h1 className="auth-title">Dados neste dispositivo</h1>
          </div>
          <p className="auth-lead">
            Encontramos <strong>{localBackup.groups.length}</strong> grupos e <strong>{items}</strong> contas
            salvos neste navegador. Sua conta está vazia.
          </p>
          {importError && <p className="auth-error">{importError}</p>}
          <button className="auth-submit" onClick={handleImport} disabled={importBusy}>
            {importBusy ? "..." : "Importar para minha conta"}
          </button>
          <button className="auth-switch" onClick={() => setDismissedImport(true)}>
            Começar do zero
          </button>
        </div>
      </div>
    );
  }

  const account = {
    email: session.user?.email,
    status: error ? "error" : cloud.status,
    onSignOut: () => supabase.auth.signOut(),
    onRetry: () => { setError(null); cloud.reload(); },
  };

  const store = {
    ...cloud,
    // The shell speaks importState; the cloud store replaces everything at once,
    // and reports back whether it landed
    importState: (data) => cloud.replaceAll(normalizeBackup(data)),
  };

  return <AppShell store={store} account={account} />;
}

export default function App() {
  // Decided once per load — flipping modes is a reload, not a live toggle
  const [cloud] = useState(cloudEnabled);
  return cloud ? <CloudApp /> : <LocalApp />;
}
