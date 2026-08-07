# Roadmap

What this app is for, why it can be better than what it replaces, and in what order
it gets built. Written before any of the ledger work exists, so it can be argued with
rather than reverse-engineered later.

## The premise

Daniel pays Portfel for financial advice; Dashplan comes with the fee. Dropping both
is viable only if this app delivers three things Dashplan delivers — auto-sync of
statements and cards, categorisation, and Patrimônio — while fixing the one that
never converges: recategorisation.

Measured on twelve months of real data (2,041 transactions, 8 accounts):

- 97% arrive already categorised by Pluggy.
- 478 carry a CNPJ — a government-registered canonical merchant key, free.
- The 141 Mercado Livre transactions that need eight separate rules in Dashplan
  resolve to **one** name here, before any rule of ours runs.
- 25 rules cover 50% of rows; 100 cover 73%. And ~700 of the 2,041 rows aren't
  spending at all (investments, transfers), so the real surface is smaller still.

The premise holds.

## The three engines

The consumer market has bifurcated. This app sits in a third place neither half
occupies.

| | What it does | Who does it |
|---|---|---|
| **Transaction engine** | Backward. Ingest, categorise, report where money went. | Copilot, Lunch Money, Monarch, Actual |
| **Balance-sheet engine** | Stock, not flow. Net worth, allocation, long horizons. | Kubera, ProjectionLab |
| **Forward cash-flow engine** | "You go negative on the 23rd." Changes a decision not yet made. | Almost nobody |

Dashplan is the first two — a rear-view mirror bolted to a balance sheet, which is
what an advisor's tool should be. It has no opinion about your Tuesday.

v1 of this app is the third, and only the third. Hand-fed, but nobody sells it.

**The three feed each other, and that is the part a competitor cannot add as a
feature:**

- The ledger feeds the plan — twelve months of history is exactly the input that
  detects recurring fixed expenses, so the plan is proposed rather than typed.
- The plan gets a real opening balance instead of a typed one, so the forward
  projection stops drifting from reality between resets.
- The planned bill and the transaction that pays it are one event recorded twice.
  Matching them is the same machinery as transfer detection — one matcher, two jobs.
- Patrimônio is simply the stock the flow accumulates into. Same accounts, same
  merchant table.

**The shape, in one line: ledger backward, plan forward, patrimônio as the stock —
sharing one matcher and one merchant table.**

Dashplan has eight tabs because nothing in it composes.

## The three pains this exists to solve

Daniel's own words, and what each actually needs:

1. **"What do I pay today, so nothing slips."** Pure planning. Needs no bank
   connection at all — v1 already solves it. Sync only removes typing.
2. **"What have I paid, so I can rest."** The one sync transforms. Today the answer
   is only as true as the discipline of ticking boxes; auto-matching makes it
   trustworthy instead of maintained.
3. **"Day-to-day cash flow — when to pull from investments, how much I can invest at
   month end."** Needs both the plan and the real balance. Neither alone gives it.

## Principles

Agreed, and binding on everything below.

1. **The confirmation loop.** Planned rows tick themselves when a matching
   transaction arrives, showing the real amount against the predicted one. The app
   reconciles; it asks only when genuinely unsure.
2. **Recurring detection.** The app proposes fixed expenses from history — *"Parece
   uma conta fixa: COMGÁS, ~R$180, por volta do dia 12. Adicionar?"* — instead of
   asking for them.
3. **Forward balance is the product.** Not a chart: a sentence. *"Você fica negativo
   no dia 23."* / *"Sobra R$2.400 no dia 30."*
4. **Categorisation converges.** A stack of one-decision cards ordered by impact,
   never a grid. Every correction writes a visible, editable rule, and the rule
   states its blast radius — *"isto também corrige 37 lançamentos anteriores"* —
   before it applies. A user-set category is never overwritten by later automation
   (`category_source` precedence: user > rule > enrichment > model).
5. **Merchant identity is its own stage.** descriptor → merchant → category. Raw
   descriptors are debug information, one tap away. This is the structural fix
   Dashplan never made.
6. **Money that isn't spending is invisible by default.** Two-sided transfer
   detection; investments route to Patrimônio. Never announce that someone spent
   R$40 mil because they moved money between their own accounts.
7. **Purchase date and invoice date are both kept.** A card purchase on 28 August is
   paid on 10 September. Cash flow cares about the 10th; spending analysis cares
   about the 28th. The fatura is one planned row on the daily screen; its purchases
   live at their own dates. Most Brazilian apps pick one and confuse the user
   permanently. This is the biggest structural decision in the app.
8. **Patrimônio runs on a different clock.** A monthly screen: one number
   (ativos − passivos), one trend, and the split that matters — gerador de renda vs
   uso pessoal. Kept out of the daily view.
9. **Every number is traceable in one tap.** Trust is what lets someone stop
   cross-checking against the bank app, and it dies the first time a number is wrong
   and unexplainable.
10. **Speed.** Opens with data on screen and syncs behind. Never a spinner over a
    number already known.

Two more, carried from the research:

11. **Connection state is an enum, never a date.** "Atualização: 02/12/25" collapses
    at least four distinct states — synced with no activity, balance fresh but
    transactions stale, credentials dead, bank down — and only one needs action. The
    badge derives from the enum. The caveat lives next to the number it undermines.
12. **Never derive a balance by summing transactions.** Show the provider's balance
    with its own timestamp; if the sum disagrees, surface the delta.

## Not building

Charts as decoration, calendars, receipt capture, push reminders, goals and
gamification, envelope budgeting. Each costs a screen and none was ever wanted.

## Sequence

Ordered so that each phase is useful on its own, and nothing blocks on a bank.

**Phase 0 — done.** Cloud persistence, auth, Pluggy connected via Meu Pluggy,
twelve months of history pulled and stored raw in `pluggy_raw`.

**Phase 1 — the ledger.** Parse `pluggy_raw` into `bank_accounts`, `transactions`
and `merchants`. Descriptor normalisation as its own stage. Persist everything on
first sight: the 12-month API ceiling is not backfillable and that decision is
irreversible.

**Phase 2 — categorisation that converges.** `rules` with `contains`/prefix
matching, CNPJ resolution, the correction-becomes-a-rule flow with counted backfill
preview, and `category_source` precedence. Editable, user-creatable categories —
the thing Dashplan cannot do at all.

**Phase 3 — the matcher.** Two-sided transfer detection (equal amount, opposite
signs, different accounts, inflow date ≥ outflow date within ~4 days, modelled as a
record referencing both legs, never a boolean). Then the same machinery auto-ticks
planned bills against real transactions.

**Phase 4 — the plan, fed by the ledger.** Recurring detection proposes fixed
expenses; the forward balance takes its opening figure from the live account balance.

**Phase 5 — Patrimônio.** `assets` (with `income_generating`) and `liabilities`
(with `kind`: empréstimo vs financiamento). Net worth, and nível de endividamento as
passivos/ativos.

**Phase 6 — LLM as plan C.** Only for what rules and CNPJ leave unresolved, feeding
a *"categorizado automaticamente · pendente de revisão"* queue. Never silent.

## Before cancelling anything

Export whatever history Dashplan holds beyond twelve months. Open Finance serves
~12 months, is not backfillable, and caps historical calls at 4 per month per
institution. Losing that export is irreversible.

## Settled, not to be re-litigated

- The stale Inter account is deliberate — Inter adds a QR-code authorisation on top
  of Open Finance and renewing it is a choice, not a defect.
- The Ourocard returning zero transactions is correct; the card is unused.
- Whether to keep paying for advice is Daniel's call alone.
