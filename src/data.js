// Starter content for a brand-new store — examples to be renamed, not anyone's
// real bills. The three groups mirror the recurrence model: mensal, anual,
// avulso.
//
// `day` is the day of the month, or the month itself in a "months" group, and
// seeds the `dates` map. Values are deliberately absent: a fresh install
// showing "Aluguel — R$ 3.200" reads as someone else's data, while an empty
// amount reads as a field to fill in.
export const DEFAULT_PAYMENTS = [
  {
    id: "fixo_mensal",
    title: "Fixo mensal",
    dateMode: "days",
    items: [
      { id: "fixo_mensal_aluguel",  label: "Aluguel",           day: 5  },
      { id: "fixo_mensal_energia",  label: "Energia",           day: 10 },
      { id: "fixo_mensal_internet", label: "Internet",          day: 15 },
      { id: "fixo_mensal_cartao",   label: "Fatura do cartão",  day: 20 },
    ],
  },
  {
    id: "fixo_anual",
    title: "Fixo anual",
    dateMode: "months",
    items: [
      { id: "fixo_anual_ipva",   label: "IPVA",            day: 1 },
      { id: "fixo_anual_iptu",   label: "IPTU",            day: 2 },
      { id: "fixo_anual_seguro", label: "Seguro do carro", day: 8 },
    ],
  },
  {
    // One-offs still belong to a day: an outflow with no date is a hole in the
    // projected balance, so this is a "days" group like any other.
    id: "pontual",
    title: "Pontual",
    dateMode: "days",
    items: [
      { id: "pontual_manutencao", label: "Manutenção do carro", day: 12 },
      { id: "pontual_presente",   label: "Presente",            day: 20 },
    ],
  },
];

// The defaults as state, for a first run only. Never merged into saved state:
// appending a missing default group to data that already exists resurrects
// whatever the user deleted, on every load, with no way to tell it apart from
// a group they created.
export function seedState() {
  const dates = {};
  const groups = DEFAULT_PAYMENTS.map((g) => ({
    id: g.id,
    title: g.title,
    dateMode: g.dateMode,
    items: g.items.map(({ id, label, day }) => {
      if (day != null) dates[id] = day;
      return { id, label };
    }),
  }));
  return { groups, dates };
}
