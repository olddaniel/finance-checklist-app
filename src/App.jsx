import { useState, useCallback, useMemo } from "react";
import AppShell from "./AppShell";
import AuthScreen from "./components/AuthScreen";
import { usePayments, normalizeBackup } from "./hooks/usePayments";
import { useCloudPayments } from "./hooks/useCloudPayments";
import { useAuth } from "./hooks/useAuth";
import { supabase } from "./lib/supabase";
import { cloudEnabled } from "./lib/cloud";
import "./App.css";

const LOCAL_KEY = "payment-tracker-state";

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

// ── Local-only app: unchanged behaviour, everything in localStorage ──
function LocalApp() {
  return <AppShell store={usePayments()} />;
}

// ── Cloud app: Supabase-backed, gated behind sign-in ──
function CloudApp() {
  const session = useAuth();
  const [error, setError] = useState(null);
  const onError = useCallback((message) => setError(message ?? "Falha ao salvar"), []);
  const cloud = useCloudPayments(session, onError);

  // Offered on first sign-in when the account is empty and this device is not
  const [dismissedImport, setDismissedImport] = useState(false);
  const localBackup = useMemo(() => readLocalBackup(), []);

  if (session === undefined) {
    return <div className="boot-screen"><span className="boot-icon">💳</span></div>;
  }

  if (session === null) {
    return (
      <AuthScreen
        hasLocalData={!!localBackup}
        onExportLocal={() => downloadJson(localBackup, `finance-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`)}
      />
    );
  }

  const accountEmpty = !cloud.loading && cloud.groups.length === 0;
  const offerImport  = accountEmpty && localBackup && !dismissedImport;

  if (cloud.loading) {
    return <div className="boot-screen"><span className="boot-icon">💳</span><p>Carregando…</p></div>;
  }

  if (offerImport) {
    const items = localBackup.groups.reduce((n, g) => n + (g.items?.length ?? 0), 0);
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
          <button
            className="auth-submit"
            onClick={() => cloud.replaceAll(normalizeBackup(localBackup)).then(() => setDismissedImport(true))}
          >
            Importar para minha conta
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
    onBankConnected: (item) => setError(`Banco conectado: ${item.connector?.name ?? item.id}`),
  };

  const store = {
    ...cloud,
    // The shell speaks importState; the cloud store replaces everything at once
    importState: (data) => cloud.replaceAll(normalizeBackup(data)),
  };

  return <AppShell store={store} account={account} />;
}

export default function App() {
  // Decided once per load — flipping modes is a reload, not a live toggle
  const [cloud] = useState(cloudEnabled);
  return cloud ? <CloudApp /> : <LocalApp />;
}
