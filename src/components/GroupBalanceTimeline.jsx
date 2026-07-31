import { useMemo } from "react";
import { MONTHS, formatBRL, formatBRLAlways, kindOf, REVENUE } from "../utils";

const NO_DATE = -1;

function bucketLabel(key, dateMode) {
  if (key === NO_DATE) return "Sem data";
  return dateMode === "months" ? MONTHS[key - 1] : `Dia ${key}`;
}

function formatResetDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Day-by-day (or month-by-month) projection of the group's balance, starting from
 * the balance on hand at the last reset. Snoozed items are left out, matching the
 * group totals; values still count while unchecked, since this is a forecast.
 */
export default function GroupBalanceTimeline({
  items, checked, snoozed, values, kinds, dates, dateMode,
  openingBalance, onOpeningBalanceChange,
  lastReset,
}) {
  const { rows, finalBalance } = useMemo(() => {
    const buckets = new Map();

    for (const item of items) {
      if (snoozed[item.id]) continue;
      const value = values[item.id] || 0;
      if (!value) continue;

      const key = dates[item.id] ?? NO_DATE;
      if (!buckets.has(key)) buckets.set(key, { key, revenue: 0, expense: 0, count: 0, done: 0 });
      const bucket = buckets.get(key);
      if (kindOf(kinds, item.id) === REVENUE) bucket.revenue += value;
      else                                    bucket.expense += value;
      bucket.count += 1;
      if (checked[item.id]) bucket.done += 1;
    }

    // Running balance: each period starts from the previous period's closing value
    const rows = [...buckets.values()]
      .sort((a, b) => a.key - b.key)
      .reduce((acc, bucket) => {
        const previous = acc.length ? acc[acc.length - 1].balance : openingBalance;
        acc.push({ ...bucket, balance: previous + bucket.revenue - bucket.expense });
        return acc;
      }, []);

    return {
      rows,
      finalBalance: rows.length ? rows[rows.length - 1].balance : openingBalance,
    };
  }, [items, checked, snoozed, values, kinds, dates, openingBalance]);

  const resetDate = formatResetDate(lastReset);

  return (
    <div className="balance-view">
      <div className="balance-opening">
        <span className="balance-opening-label">
          Saldo inicial
          {resetDate && <span className="balance-opening-date"> · reset {resetDate}</span>}
        </span>
        <span className="balance-opening-field">
          <span className="balance-opening-prefix">R$</span>
          <input
            type="number"
            className="balance-opening-input"
            step="0.01"
            value={openingBalance || ""}
            onChange={(e) => onOpeningBalanceChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
            placeholder="0,00"
            aria-label="Saldo inicial do grupo"
          />
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="balance-empty">
          Defina valores e {dateMode === "months" ? "meses" : "dias"} nas contas para ver a projeção.
        </p>
      ) : (
        <>
          <ul className="balance-list">
            {rows.map((row) => (
              <li
                key={row.key}
                className={`balance-row${row.done === row.count ? " executed" : ""}`}
              >
                <span className="balance-date">{bucketLabel(row.key, dateMode)}</span>
                <span className="balance-moves">
                  {row.revenue > 0 && <span className="balance-rev">+{formatBRL(row.revenue)}</span>}
                  {row.expense > 0 && <span className="balance-exp">−{formatBRL(row.expense)}</span>}
                </span>
                <span className={`balance-running${row.balance < 0 ? " negative" : ""}`}>
                  {formatBRLAlways(row.balance)}
                </span>
              </li>
            ))}
          </ul>

          <div className="balance-final">
            <span className="balance-date">Saldo final</span>
            <span className={`balance-running${finalBalance < 0 ? " negative" : ""}`}>
              {formatBRLAlways(finalBalance)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
