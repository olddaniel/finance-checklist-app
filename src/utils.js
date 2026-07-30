const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBRL(value) {
  if (!value || value === 0) return null;
  return BRL.format(value);
}

// Same formatting, but 0 renders as "R$ 0,00" instead of null
export function formatBRLAlways(value) {
  return BRL.format(value || 0);
}

// Signed variant for balances: +R$ 10,00 / −R$ 10,00 / R$ 0,00
export function formatBRLSigned(value) {
  const v = value || 0;
  const abs = BRL.format(Math.abs(v));
  if (v > 0) return `+${abs}`;
  if (v < 0) return `−${abs}`;
  return abs;
}

export const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── Item kind (expense | revenue) ──
export const EXPENSE = "expense";
export const REVENUE = "revenue";

// Anything not explicitly marked as revenue is an expense — this also covers
// items saved before the kind field existed.
export function kindOf(kinds, itemId) {
  return kinds?.[itemId] === REVENUE ? REVENUE : EXPENSE;
}
