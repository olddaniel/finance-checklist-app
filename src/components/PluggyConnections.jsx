import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// Registers the Meu Pluggy connection ids this app should read.
//
// Meu Pluggy already holds the connections and already has item ids — they are
// listed on its "Acesse seus dados via API" page. Nothing needs to be connected
// again here; Pluggy simply has no endpoint that lists your items, so the ids
// have to be recorded somewhere. This is that somewhere.

function describe(e) {
  if (typeof e === "string") return e;
  if (typeof e?.message === "string") return e.message;
  try { return JSON.stringify(e).slice(0, 200); } catch { return String(e); }
}

export default function PluggyConnections() {
  const [items, setItems]   = useState([]);
  const [draft, setDraft]   = useState("");
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("pluggy_items")
      .select("item_id, connector_name, created_at")
      .order("created_at");
    if (e) setError(describe(e));
    else setItems(data ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    // Detached so the state updates land in a promise callback, not the effect body
    Promise.resolve().then(() => { if (alive) load(); });
    return () => { alive = false; };
  }, [load]);

  async function add() {
    const id = draft.trim();
    if (!id) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.from("pluggy_items").upsert({ item_id: id });
    if (e) setError(describe(e));
    else { setDraft(""); await load(); }
    setBusy(false);
  }

  async function remove(id) {
    const { error: e } = await supabase.from("pluggy_items").delete().eq("item_id", id);
    if (e) setError(describe(e));
    else await load();
  }

  return (
    <div className="pluggy-connections">
      <span className="modal-field-label">Conexões Meu Pluggy</span>

      {items.length > 0 && (
        <ul className="pluggy-item-list">
          {items.map((it) => (
            <li key={it.item_id}>
              <code>{it.item_id}</code>
              {it.connector_name && <span className="pluggy-item-connector">{it.connector_name}</span>}
              <button onClick={() => remove(it.item_id)} aria-label={`Remover ${it.item_id}`}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="pluggy-add-row">
        <input
          className="pluggy-item-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="ID da conexão (itemId)"
          spellCheck={false}
          autoCapitalize="none"
        />
        <button className="sheet-btn" onClick={add} disabled={busy || !draft.trim()} type="button">
          {busy ? "..." : "Adicionar"}
        </button>
      </div>

      {error && <p className="sheet-error">{error}</p>}
      <p className="modal-note">
        Copie os IDs em meu.pluggy.ai → “Acesse seus dados via API”.
      </p>
    </div>
  );
}
