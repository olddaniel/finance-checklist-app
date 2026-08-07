-- What actually happened, beside what was planned.
--
-- `value` and `due_date` keep meaning "planned" and are never overwritten;
-- these two carry the realised pair. Nullable and with no default, because null
-- is the real answer for every row that exists today — nothing has been
-- realised yet — and because "not realised" and "realised as R$ 0,00" are
-- different facts.
--
-- `actual_date` is a real date rather than a day number: the plan is moving to
-- real months, and the bank transaction that will eventually fill this in
-- automatically carries a full date.

alter table public.items
  add column actual_value numeric(12, 2),
  add column actual_date  date;
