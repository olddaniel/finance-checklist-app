# Working agreements

## Communication

- **Technical walkthroughs**: open with a very short summary of everything that will be
  needed from Daniel, then describe **only the first step**. Wait until it is done
  before describing the next one.
- **Say things once.** Do not re-explain what is already established. If a turn is
  interrupted, resume it — never restart the answer from scratch.
- No step-by-step progress reports on long-running work. Validate genuine ambiguities
  as they appear, then deliver one consolidated result.
- Copy in the app is **pt-BR**.

## Git

- Merging to `main` is pre-authorised; `main` deploys to GitHub Pages automatically.
- `v1-checklist-backup` is pinned at `0d974fe` as a known-good fallback of the
  bill-checklist app. Do not move it.
- Tag pushes fail against this environment's git proxy — use a branch marker instead.

## Product context

Daniel pays Portfel (a consultoria financeira) for advice; their tool is Dashplan, a
white-label advisor platform, included with the fee. Of its eight tabs he only cares
about **unified auto-sync of statements and cards** and **Patrimônio**. The rest is
nice-to-have.

What Dashplan does badly, and what a replacement must beat:

- Re-categorisation rules match the **whole description only**, so `MERCADOLIVRE*FAVITA`
  and `MERCADOLIVRE*ABC` need separate rules. Fix: `contains`/prefix matching, and
  normalise descriptor → merchant as a separate stage before categorising.
- Categories **cannot be created or edited**.
- It is slow.
- Auto-categorisation misses "a lot, not the majority".

What Dashplan does **not** do, and this app already does: planning the month ahead —
predicted fixed expenses, daily balances, cash flow.

Known and settled, do not re-raise:

- The stale Inter account is deliberate. Banco Inter adds a QR-code authorisation on
  top of Open Finance and Daniel chose not to renew it. Not a bug.
- Whether to keep paying for advice is Daniel's call alone.
- Open Finance Brasil serves ~12 months of transaction history, is not backfillable,
  and is limited to 4 historical calls per month. Persist everything on first sight.
- Pluggy's free personal path is Meu Pluggy + Connector 200; paid tiers start around
  R$2,500/month and only matter if this ever becomes a product.
