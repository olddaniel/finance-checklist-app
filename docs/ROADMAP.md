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

The premise holds — with one honesty note: Dashplan reads the **same Pluggy feed**,
so the 97% is table stakes, not an advantage. The premise rests on what happens to
the rest — merchant identity as a stage, rules that generalise, categories that can
be edited — because that is where corrections either converge or run forever.

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
   R$40 mil because they moved money between their own accounts. Dashplan's name for
   this is *classificação neutra* — good pt-BR, already familiar, adopted as-is.
7. **Purchase date and invoice date are both kept.** A card purchase on 28 August is
   paid on 10 September. Cash flow cares about the 10th; spending analysis cares
   about the 28th. The fatura is one planned row on the daily screen; its purchases
   live at their own dates. Most Brazilian apps pick one and confuse the user
   permanently. This is the biggest structural decision in the app.

   Dashplan picks purchase date and neutralises the fatura payment, which is correct
   for analysis — and is precisely why it cannot do forward cash flow at all: under
   that model the money never leaves the account on any day. Keeping both timelines
   is what lets one app do both jobs.
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

## The plan model: kill the reset, keep the folders

v1 stores a *stateless recurring checklist*. A group does four jobs at once — a
recurrence rule (Mensais = day of month, Anuais = month of year), a folder, the reset
unit, and a projection scope with its own hand-typed `openingBalance`. Three of the
four break in the new picture.

**The projection scope breaks hardest.** Four opening balances, one per group, each
typed by hand — against one real bank balance. Once balances arrive from Pluggy there
is exactly one cash position, and four parallel projections of the same money either
sum to four times it or disagree with each other. The daily balance view moves up to
the month, where it is both simpler and correct.

**Recurrence is a property of the item, not the container.** Expressing "monthly"
by folder membership means a monthly bill can never live in the Cartão folder. It
becomes a field: `mensal` / `anual` / `avulso`.

**And `resetGroup()` has to go.** Dates are the symptom; the reset is the disease. It
overwrites the cycle, so there is no July. Six things depend on there being one:

- Auto-ticking needs a dated instance. A transaction dated 2026-08-12 against a row
  that says "day 12" — which August? A month that is overwritten rather than closed
  offers nothing unambiguous to match.
- "What have I paid" (pain #2) answers only for the current cycle; ask about July and
  the data is gone.
- Cash flow crosses month boundaries. "When do I withdraw to cover this" usually
  points at a fatura or an IPVA *next* month — past the edge of a cycle-relative model.
- Anuais is already broken: the model stores a month number and resets yearly, so it
  knows which month but never which year, and cannot show January's IPVA from August.
- Recurring detection produces *dated* proposals from twelve dated observations.
  A date-agnostic target throws away the evidence.
- A net-worth trend needs monthly snapshots.

**Two levels replace one.**

*The recurring definition* — label, kind, estimated amount, recurrence, due day or
month, folder, active. Essentially today's state minus the ticks.

*The monthly instance* — one row per definition per month: competência `2026-08`, a
real `due_date`, expected amount, status (`previsto` / `pago` / `ignorado`), and the
transaction that paid it with what it actually cost.

Months are **generated and then closed**, never reset. Navigating to Setembro creates
its instances; Agosto stays as it was, permanently.

**"Closed" needs a precise meaning, because transactions arrive late.** Closed
freezes the *plan*: instances stop changing and the month stops asking for review.
The *ledger* keeps accepting — a card purchase syncing on 3 September that belongs
to August lands in August, and a closed month's totals may still move. They move
visibly — *"agosto mudou depois de fechado: +R$45,20"* — never silently. Permanence
means no longer being overwritten, not being deaf.

This also makes the fatura row stop being a typed number: its amount is computed from
the card transactions inside the closed invoice period. That is principle 7 doing
real work, and the join between the ledger and the plan.

**Groups survive as folders** — drag-ordered, organising the screen. They lose the
reset button, the recurrence meaning and the per-group opening balance.

**Nothing is lost in the migration.** Today's state is entirely a plan — labels,
values, days, kinds — which becomes the recurring definitions unchanged, with Agosto
2026 as the first generated month. There is no history to migrate because v1 never
kept any.

### Two flags, not one

Cash movement and consumption are different questions, and collapsing them into a
single flag forces a choice between an honest projection and honest spending totals.

- `afeta_caixa` — does money leave the account?
- `é despesa` — is this consumption?

A transfer to Reservas is *yes / no*: R$3.000 genuinely leaves checking on the 5th,
so the daily projection must count it or it reports money that is not there — but the
month did not spend R$3.000, and counting it distorts the obrigatória split and
double-counts against Patrimônio, which is also recording the money arriving.

The same shape covers a fatura payment (money leaves; the purchases were already
counted at purchase date) and the CDB porquinho's 377 rows of automatic
aplicação/resgate (money moves, nothing is spent).

Dashplan's *classificação neutra* is this idea with the two flags collapsed into one,
which is exactly why it cannot project forward: neutralising the fatura payment for
analysis also erases the day the money actually left.

With both flags, whether Reservas is conceptually a separate pot stops affecting
correctness — it only decides whether the reserve appears as its own balance on the
daily screen or only inside Patrimônio, which is a display choice.

### Three tracks, not one running total

The two flags make the month decomposable, but not into a single enriched line.
Spending and cash are different axes, because a card purchase is consumption that has
happened with no money yet leaving the account. Subtracting spending from a checking
balance is wrong by the whole open fatura.

| Track | Composition |
|---|---|
| **Caixa** | opening + received − paid out − net invested → projected close |
| **Gastos** | already spent + still expected, regardless of when the cash moves |
| **Investido** | reported balance, with contributions / withdrawals / rendimento explaining the change |

Two details that are easy to get wrong:

- **Investments grow without a cash event.** `Y_end ≠ Y_start + aplicações −
  resgates`; rendimento never appears as a transaction. The invested figure comes
  from the reported balance, and flows only *explain* the change — *"subiu R$2.780:
  aplicou R$1.800 e rendeu R$980."*
- **Contributions and withdrawals both happen every month.** The porquinho alone ran
  108 aplicações and 115 resgates in twelve months. Show the net; keep gross one tap
  away, or an automatic sweep reads as tens of thousands of activity.

What the three tracks exist to produce is two sentences:

> *Dá pra investir R$4.400 no dia 30.*
>
> *No dia 23 você fica em R$-410 — resgate R$1.000 até o dia 21.*

### Two dates, never an edited one

Dashplan lets you edit a transaction's date, which breaks reconciliation but solves a
real problem: a salary that lands on the 1st when it belonged to the month before.
The field is being asked to mean two things. Split it instead:

- `data` — when the money moved. From the bank, **never editable**.
- `competência` — which month the event belongs to. Editable, defaults to `data`.

Caixa reads `data`, so the projection stays true to the bank. Gastos e renda read
`competência`, so August's pay counts in August. Nothing is falsified; both facts
survive.

Guards: shift only to an adjacent month, and if the target month is closed, say so
before restating it. And it is proposed rather than typed — recurring detection
already knows the salary lands around the 30th, so a payment on the 1st asks
*"Salário caiu dia 01/09. Contar em agosto?"*

Related to the card's purchase-vs-fatura split but not the same mechanism: the card
is two linked rows resolved by the two flags, this is two dates on one row. The
shared idea is that **when money moves and which period it belongs to are separate
facts.**

### Parcelamentos

The hardest case of principle 7, and in Brazil it is endemic rather than an edge: a
compra in 10× is one decision, ten cash events, and two defensible answers to "when
was it spent".

**The model: one purchase event, N parcela rows.** The parcela is what the bank
actually delivers — one transaction per fatura, carrying `creditCardMetadata`
(installment number, total, purchase date) when the bank provides it, a `03/10`
descriptor pattern when it does not, and same-merchant-same-amount monthly sequences
as plan C. Detection links them under a purchase event: merchant, total, purchase
date, paid so far, still to come.

- **Caixa** — each parcela hits the fatura it belongs to. That is just principle 7.
- **Gastos** — default competência is each parcela's own month, matching how faturas
  read and how the month is lived (*"minha fatura tem R$300 da TV"*). The purchase
  event stays one tap away: *"TV Samsung — 3 de 10 pagas, faltam R$2.100."* A
  whole-purchase lens can exist later; it is a view, not a schema change.
- **The projection gains the most.** Future parcelas of an existing compra are not
  estimates — they are **contracted outflows, known to the centavo, months ahead**.
  *"Sua fatura de outubro já nasce com R$1.240 de parcelas."* No number in the whole
  system is more certain, and most apps throw it away.
- And *"posso comprar em 10×?"* becomes answerable honestly: ten planned rows across
  ten months read against the projection, instead of one number against one month.

**Measured before the schema froze** (query over `pluggy_raw`, duplicates included):
4,543 rows, 2,316 with a `creditCardMetadata` object, **9 with totalInstallments >
1**, 14 matching the descriptor pattern. Two conclusions:

- **This household barely uses parcelamento** — roughly four or five real compras in
  twelve months. The section above was designed for Brazil-in-general; the data says
  design for this house.
- **When it happens, the bank says so.** Metadata is delivered on half of all rows,
  so linking is metadata-driven only. The descriptor-pattern parser and the
  same-amount-sequence detector are *not built* until real data demands them.

The purchase-event linkage still enters the schema at Phase 1 — two nullable columns
now versus a migration later — but the machinery around it is deliberately minimal.

### Undated expenses split in two

v1 allows planned items with no date, which was harmless when there was no
projection. In the new model an outflow with no day is a hole, and the running
balance overstates cash by exactly that amount — the same failure as omitting a
transfer to Reservas.

The fix is not to demand a date. It is that one mechanism has been carrying two
different things.

**One event, unknown day** — the diarista, a fatura whose due date drifts, an annual
charge landing sometime this month. These get an **estimated** day rather than none:
derived from the median day that merchant or category actually hits across twelve
months, rendered as *"~dia 12"*, and shown as a band rather than a hard step. An
estimate three days off costs almost nothing; an omission costs the whole amount.

**Continuous spend** — mercado, combustível, restaurantes. This cannot be a planned
row, and the reason is that **nothing ticks it**: with 293 grocery transactions,
no matching rule can decide which one marks *"Mercado R$1.500"* as paid. It is a
different object — a **category expectation** for the month, consumed by real
transactions as they arrive:

> **Mercado** — R$980 de ~R$1.500 previstos · faltam 12 dias

The projection spreads the remainder across the remaining days, which is more
accurate than a single step would be, because that is how the money actually leaves.
Guiabolso's explicit **"livre" bucket** is the same object with no category attached.

Dashplan's Plano tab turns out to be this same object under another name, which
settles what to take from it:

- **Two numbers per category, kept apart.** Dashplan separates *valor médio* (what
  you spend) from *meta* (what you wish you spent), and that distinction is
  load-bearing. The médio is a **prediction** and is what the cash-flow projection
  uses — always. The meta is an **aspiration** and drives only a progress display,
  only where one was set. A projection built on the meta reports money that will not
  exist; a plan that flatters lies about the 23rd. So: `meta` becomes one optional
  field on the category expectation, and the projection never reads it.
- **The average-as-proposal flow** ("quanto você costuma gastar?", pre-filled,
  editable) is propose-don't-ask done right. Ours proposes the median over twelve
  months rather than the mean over three — one atypical month poisons a short mean.
- **The reserva de emergência one-liner** — one honest number, N months of despesas
  obrigatórias, no chart. Belongs on Patrimônio, and it is only computable because
  the obrigatória flag is editable here.
- **Dropped:** the static "saldo do plano" (*"potencial de investir R$15.965,70
  todos os meses"* is the flagship sentence with the date and the reality removed —
  renda média minus gastos médios cannot see the fatura on the 10th); the "lição de
  casa" banner (gamification, already rejected); the income-vs-spend stacked bar
  (restates the header numbers as decoration); and progress bars on fixed bills —
  a bill is binary and already has a checkbox, so bars are only drawn for
  continuous-spend categories.

So `dateMode: "none"` is retired. Reservas and Cartão stop being "the groups without
dates" and become ordinary folders: the reserve transfer takes a conservatively early
estimated day, the fatura takes its real due date.

Deliberately excluded: *"trocar os pneus em algum momento este ano"* — no month, no
defensible amount. That is a wish, not a plan, and it would corrupt the projection.
If tracked at all, it belongs in a list that never touches a number.

### One-off planned events

A planned instance does not have to come from a recurring definition. An `avulso`
belongs to a single month — due date, expected amount, both flags, a status — and
appears in that month's projection and nowhere else.

This fixes a v1 flaw rather than inheriting it: today `addItem` puts a row in a group
permanently, so a one-off dentist visit reappears every month until it is deleted.

It also gains three things. It can be placed in a *future* month, so January's IPVA
is visible from August — unrepresentable in v1, which has no month identity. It
auto-ticks like any other planned row. And if it recurs, the app offers to promote
it: *"virou conta fixa? repetir todo mês?"* rather than requiring foresight.

Note that inserting a provisional one-off is the same mechanism as *"posso comprar?"*
— asking whether something is affordable is adding a planned expense and reading the
projection. One code path, two doors: one keeps the row, one discards it after
showing the answer.

## Propose, don't ask

Three unrelated products converge on one idea, and it is the difference between this
app and Dashplan.

- **Pierre's** real pt-BR tagline is *"sem categorias **para preencher**"* — no
  categories **to fill in**. It categorises heavily; it never asks. (Its store copy
  sells category tracking, budgets and comparison charts, so "no charts, no
  categories" is positioning, not architecture.)
- **Olivia** never showed a blank chat box. Three tappable prompts — análise mensal,
  *posso comprar*, quiz — composed the message for the user. A blank input makes
  someone guess the app's vocabulary.
- **Superhuman** precomputes three send-ready replies before the message is opened.
  The expensive part of triage is the decision, not the keystroke; a proposal turns
  *"what category is this?"* into *"is Alimentação right? y/n"*.

Dashplan hands over a grid and asks for it to be filled in. That is the gap.

## "Posso comprar?"

Olivia's signature interaction, and the flagship feature here. Every other app
answers *"what did I spend?"* — retrospective and useless at the moment of decision.
This one answers *"should I?"*, and answering it requires exactly what this app has
and Dashplan does not: predicted fixed expenses, daily projected balances,
month-ahead cash flow.

The answer is a sentence and a number, never a chart:

> *Cabe. Depois disso sobram R$1.240 até dia 30, e a fatura do Inter (R$2.100) já
> está contada.*

It degrades gracefully: with twelve months of history, annual charges (IPVA, seguro,
IPTU) are thinly detected, so the verdict says what it does not know.

Corroboration that this is unoccupied ground: the top complaint in Pierre's own App
Store reviews is that it cannot register expected income and expenses or show a
predicted monthly balance. Its second is sync lagging by up to a week.

## The review loop

No personal finance product has assembled this pattern. Actual Budget comes closest
(single-key verbs on a focused row, rules inferred from behaviour); Copilot has
reviewed-state and arrow-key navigation; Monarch separates merchant-rename rules from
category rules. None has the palette, the shortcut-teaching mechanism, the latency
budget or the ceremony.

Build order matters — the palette is the long-tail layer, not the foundation.

1. **Split the queue by kind, not by date.** Exhaustion comes from switching decision
   criteria row to row; sixty identical decisions are cheaper than twenty varied
   ones. Splits: *Não categorizadas · Categoria incerta · Possíveis transferências ·
   Contas previstas a confirmar · Novo estabelecimento*, each with its own count.
   Within a split, every row asks the same question.
2. **Precompute at sync time** — proposed category, normalised merchant, transfer
   pair. A spinner on the interactive path destroys the whole benefit.
3. **Six single-letter verbs, no modifier:** `C` categorizar · `T` transferência ·
   `P` pago · `I` ocultar · `R` criar regra · `Z` desfazer. Not a hundred.
4. **The palette teaches its own shortcuts** — each row shows its single-letter key
   on the right, so the slow path advertises the fast one at the moment of intent.
   No tour, no cheat sheet; users graduate themselves.
5. **Undo, never confirm.** A dialog in the triage loop does not cost a keystroke, it
   breaks the rhythm, and the rhythm is the product. Bulk actions and rule
   application included: *"Regra aplicada a 23 transações — desfazer."*
6. **Frecency on the category picker** — rank by frequency × recency per query
   string, so `m` comes to mean *Mercado* for this user. ~30 lines, and it is what
   makes a picker feel like it knows you.
7. **Normalise accents before fuzzy-matching**, or `alimentacao` will not match
   `Alimentação`. Superhuman's matching algorithm is open-source and is the default
   in the standard React command-bar library; no reason to write our own.
8. **Endowed progress.** Never an undifferentiated 180. *"118 de 180 resolvidas
   automaticamente — faltam 62."* Then *"Mês revisado"* as a real closing screen —
   the boundary marker that makes a chore repeatable.

Mobile keeps the queue and loses the palette: swipe right accepts the suggestion,
swipe left opens the category sheet, long-press enters batch mode. Same splits, same
counts, same verbs, different input layer. Do not build a phone command bar.

## From Guiabolso

- **One chronological Extrato** — every movement of the month in a single list,
  all accounts and cards together, manual entries in the same stream. The mental
  model is "my money this month", not "my Itaú".
- **Correction as low ceremony**, with the whole verb set: recategorise, *create a
  new category*, ignore, tag, describe, mark duplicates, multi-select. Most rebuilds
  ship only the first. Creating a category from the row existed in 2015; Dashplan
  removed a feature eleven years old.
- **Totals recompute as you correct.** Keep the month in memory, recompute locally,
  never round-trip. Watching the numbers move is what pays for the labour.
- **An explicit "livre" bucket** in the plan — money allocated to be spent on
  nothing in particular. A plan with no slack is violated on day four and then
  abandoned.

## Rejected, with reasons

- **Chat as the primary interface.** Pierre's own product hedges: it ships a full GUI
  while advertising that it hasn't. Chat cannot answer "what do I pay today" faster
  than a list, and it makes non-question actions harder — likely why Pierre appears
  to have no category-correction affordance at all.
- **The "agent" abstraction as a user-facing concept.** Cron jobs named after dead
  scientists, metered 1/2/10 by price tier. Daniel should never learn the word.
- **Peer comparison and financial-health scores.** Guiabolso ranked users against
  each other. There is no cohort here, and inventing a benchmark is a lie.
  Self-comparison against a trailing six-month median is honest and more useful.
- **Daily proactive messages.** Olivia messaged every day with GIFs and jokes; that
  is the pattern that gets muted, and a muted app is dead. Frequency follows event
  significance, not the clock — and consent expiry is itself an event.
- **Gamification.** A streak on *mês fechado* is a boundary marker. Points for
  categorising transactions would reward volume over correctness.

**Evidence note.** This research ran under a network policy that blocked page
fetching for every host, so the underlying reports rest on search summaries. Four
load-bearing claims were re-verified independently: Pierre's planning complaint,
Olivia's three tappable prompts, Guiabolso's create-category-from-the-row, and
Superhuman's shortcut-teaching palette. The rest — particularly Pierre's *absence* of
a correction flow — is inference from silence.

## The category model

Dashplan's best idea and its worst execution live in the same place, so this deserves
spelling out.

**The good idea: a classification layer above categories.** It produces the single
most useful number in the tool — *29,2% obrigatórias, 70,8% não obrigatórias*. That
is not "how much on groceries", it is **how much of my spending could I stop
tomorrow**, which is pain #3 asked from the other side.

**The execution fails in two ways.**

*It cannot be edited.* In August, `Presentes e doações` is R$2.558,43 — 63% of
everything Dashplan calls non-obligatory — against a ledger showing Igreja Batista
Fonte, Young Life and Missão Joy every month. Whether giving is discretionary is not
the tool's call, and it cannot be changed. One locked decision makes the best number
on the screen wrong.

*The picker makes you choose a classification tab before you can search.* But the
nine tabs mix four unrelated axes — direction (renda vs despesa), discretion
(obrigatória vs não), nature (neutra, investimento, financiamento) and context
(empresa vs pessoal). Finding a category means first guessing which question it was
filed under. That is a taxonomy problem wearing a search box.

**Our model.** One flat list, search-first, no tabs. Classification is a *property*
of the category, set at creation, never a navigation layer. A category carries:

- `kind` — `renda` | `despesa` | `neutra` | `patrimonial`
- `essencial` — the obrigatória flag, on despesas, Daniel's to set
- `scope` — `pessoal` | `empresa`, because business-vs-personal is a partition, not a
  category group
- name, icon

Creatable, editable and deletable — with *"mover 37 lançamentos para…"* on delete.
When a search matches nothing, the last row is **"Criar categoria «…»"**, which is
the thing Dashplan cannot do at all.

Vocabulary is taken from Dashplan where it is already good: *classificação neutra*,
*despesas obrigatórias / não obrigatórias*, *transferência mesma titularidade*.

One stage the screenshots never show: Pluggy's enrichment arrives in **its own
English taxonomy** ("Proceeds interests and dividends", ~130 entries). A visible
mapping table translates it into ours once, feeding `category_source: enrichment`.
An unmapped Pluggy category is never guessed at — it falls to the review queue. And
editing our categories edits the mapping through the same screen, never silently.

## The ledger screen

**Filters are the drill-down, not a feature.** Every number in the app taps through
into a filtered list; the filter state is simply what that list is showing. Built
once, "filter" and "show me why this total is what it is" become the same mechanism.

- One input searching merchant, description, category and amount — never a modal of
  dropdowns.
- Chips for período, conta/cartão, categoria, classificação, tag, and a status axis
  nobody offers: `a revisar` · `sem categoria` · `oculto` · `duplicado suspeito`.
  That status filter *is* the review queue.
- **A filtered list always shows the sum of what it contains.** Without it, filtering
  is scrolling rather than answering.
- Saved views fall out of this almost free, since the state is a chip row.

**Row actions, decided:**

- *Criar* — yes. Cash exists, and so will unsyncable accounts. Manual rows are
  flagged as manual so sync never overwrites them.
- *Excluir* — only for manually created rows. Deleting a synced transaction is a
  lie: the money moved. It either returns on the next sync, to be deleted monthly
  forever, or it does not and the balance quietly stops reconciling with the bank.
- *Ignorar* — yes, but it is not a second mechanism. Ignoring is *classificação
  neutra*: the row stays, still counts toward the balance, drops out of spending
  totals, and the list shows `12 ocultos` as a tappable chip. Reversible and visible;
  nothing vanishes.

## Projetos — deliberately out of scope

Dashplan's *Projetos* (viagens, família, veículo, casa, educação, saúde…) are sinking
funds wired to its long-term planning tabs. Left out for two reasons: it duplicates
the taxonomy — `Viagens` already exists as a category, and a trip is a container
spanning categories and months rather than a kind of expense — and Daniel does not
use it.

Tags are built now regardless — deliberately the **only** user-created free
dimension. Everything else in the structure is rigid on purpose, and one escape
valve is what keeps the rigidity liveable; with more than one, the escape valve
becomes the structure. If projects are ever wanted they are a tag with a target,
which is a small feature rather than a schema migration.

## Evidence: the Estabelecimento column

In Dashplan the `Estabelecimento` column is empty on nearly every row —
`MERCADOLIVRE*FAVITACO` shows `–`. The same transaction in our own `pluggy_raw`
resolves to `MERCADOLIVRE.COM ATIVIDADES DE INTERNET LTDA`.

The data is delivered. Dashplan reads one field where the fallback chain is
`merchant.name` → `merchant.businessName` → `paymentData.receiver.name` → normalised
`descriptionRaw`. The recategorisation treadmill is a bug in a reader, not a limit of
Open Finance — which is the whole reason this project is worth building.

## The last tabs: Futuro, Investimentos, Proteção, Contas

Reviewing these closed the map — there is no fourth engine.

**Futuro is the forward engine on a different clock.** *"No dia 23 você fica
negativo"* and *"aos 60 você chega com R$5,6 mi"* are the same calculation —
opening position plus flows, compounded forward — at horizons of a month and of
decades. Dashplan's version rests on one dishonesty: *investimento mensal* is a
slider the user guesses at, and the whole retirement curve hangs on it, while the
screen next door reports the real month at R$29,99 against the R$12.000 meta. Here
the aporte is **derived** from the three-track month, and the headline becomes the
comparison Dashplan cannot make: *"precisa de R$8.051/mês; seu ritmo real foi
R$X."* The essencial / desejo / sonho priority vocabulary is good pt-BR and kept.
Phase 7.

**The allocation layer is the genuine find.** Dashplan's Investimentos tab maps
real synced positions to named purposes — reserva de emergência, projetos,
aposentadoria — and the research confirmed no consumer app does this. The framing
that makes it composable here: **categories partition the flow; allocations
partition the stock.** A virtual label over real positions, no money moved, and a
project in Futuro is simply a dated accumulation target that allocations fund. It
carries one honesty check worth having on day one of its phase: a reserva showing
only 42% in liquidez diária is partly fiction, and that is one warning line.
Phase 7, with Futuro — they are one feature.

**Contas is already subsumed** — principle 11 plus the account list. One scrap
kept: Pluggy delivers card limits, so the fatura row can read *"R$1.351 de
R$22.998"* for free.

## Not building

Charts as decoration, calendars, receipt capture, push reminders, goals and
gamification, envelope budgeting. Each costs a screen and none was ever wanted.

Specifically dropped after reviewing Dashplan: the permanent "Atualizar token"
banner (principle 11 replaces it), the investment goal bar that reads
*"0,6% — falta investir R$4.970"* on the 7th of the month (nagging, not
information), and the whole **Proteção** tab — hand-entered insurance policies,
explicitly declined.

## Freshness

Every value proposition here dies with stale data. "What have I paid, so I can rest"
on three-day-old data means the screen says *não pago* for bills already paid, the
user cross-checks against the bank app, and the trust the product exists to create is
dead in a week — Pierre's second-loudest review complaint is exactly this. So
freshness is specified, not hoped for:

- **Webhook first.** Pluggy pushes item and transaction events; the endpoint exists
  and activates the moment its shared secret is set. Push is the primary path.
- **A scheduled sweep** — pg_cron inside the database invoking the sync function with
  the service role — reconciles daily whatever push missed. Incremental pulls use
  regular calls with the stored per-account cursor, never the capped historical
  search.
- **The UI never hides age.** The connection enum (principle 11) drives a quiet
  *"dados de ontem à noite"* caveat next to the numbers it undermines. Staleness is
  an event, not a banner.
- Target: same-day for Open Finance connectors. Older than 48h is a state, and it
  shows as one.

Since the Pluggy functions now require a signed-in caller, scheduled invocations
authenticate with the service role — and hand-run curl probing is over; a data
question is SQL in the dashboard or a screen in the app.

## Sequence

Ordered so that each phase is useful on its own, and nothing blocks on a bank.

**Phase 0 — done.** Cloud persistence, auth, Pluggy connected via Meu Pluggy,
twelve months of history pulled and stored raw in `pluggy_raw`.

**Phase 1 — the ledger, and its oxygen.** Parse `pluggy_raw` into `bank_accounts`,
`transactions` and `merchants`, with descriptor normalisation as its own stage — and
build the ingestion that keeps it alive: webhook activated, scheduled incremental
sync, cursor per account, freshness surfaced per principle 11. Parcelamento
detection lands here too; it is a property of ingestion, not of review. Persist
everything on first sight: the 12-month API ceiling is not backfillable and that
decision is irreversible.

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

**Phase 7 — the horizon.** Futuro and the allocation layer, together — they are one
feature. Long-horizon projection driven by the *measured* monthly aporte rather than
a typed slider; dated accumulation targets (essencial / desejo / sonho); allocations
mapping real positions to reserva, projetos and aposentadoria, with the liquidity
honesty check on the reserva. Lives inside Patrimônio; the tab count stays four.

## The cancellation test

"Replace Dashplan" needs a bar, or the decision stays vibes. Cancel when all four
hold, and not before:

1. **Three consecutive months closed in under 15 minutes each** — the review loop
   converged in practice, not in theory.
2. **The projection held twice running** — projected end-of-month caixa within
   ~R$300 of actual, two months in a row. (Threshold adjustable; pick it before
   measuring, not after.)
3. **Patrimônio agrees with Dashplan's** net worth within rounding, over one full
   month.
4. **The Dashplan export is taken and archived.** Open Finance serves ~12 months,
   is not backfillable, and caps historical calls at 4 per month per institution —
   whatever Dashplan holds beyond that is unrecoverable once the account closes.

Until all four are true, run both. After, paying for a second rear-view mirror is
sentiment.

## Settled, not to be re-litigated

- The stale Inter account is deliberate — Inter adds a QR-code authorisation on top
  of Open Finance and renewing it is a choice, not a defect.
- The Ourocard returning zero transactions is correct; the card is unused.
- Whether to keep paying for advice is Daniel's call alone.
- The household is **one shared login** for now. Per-account isolation exists for
  safety, not to split the couple across two ledgers; separate logins over a shared
  view is future work, only if ever wanted.
