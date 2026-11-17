import { formatCurrency } from '@/utils/formatters';
import { formatAsOf, formatPeriod } from '@/lib/accounting/periods';
import type {
  BalanceSheet,
  CashFlowStatement,
  IncomeStatement,
  StatementLine,
  StatementSection,
  TrialBalance,
} from '@/lib/accounting/statements';
import styles from '../page.module.css';

export const ENTITY_NAME = 'PRISM Canteen Cooperative';

/** Accounting style: negatives in parentheses. */
export function Amount({ value }: { value: number }) {
  if (value < 0) return <span className={styles.negativeAmt}>({formatCurrency(-value)})</span>;
  return <>{formatCurrency(value)}</>;
}

function Head({ title, period }: { title: string; period: string }) {
  return (
    <div className={styles.statementHead}>
      <div className={styles.entityName}>{ENTITY_NAME}</div>
      <h2 className={styles.statementTitle}>{title}</h2>
      <div className={styles.statementPeriod}>{period}</div>
    </div>
  );
}

function Lines({ lines, empty = 'None' }: { lines: StatementLine[]; empty?: string }) {
  if (lines.length === 0) {
    return (
      <tr className={styles.stmtEmpty}>
        <td colSpan={2}>{empty}</td>
      </tr>
    );
  }
  return (
    <>
      {lines.map((l) => (
        <tr key={l.accountId ?? l.name} className={styles.stmtLine}>
          <td>
            {l.code && <span className={styles.stmtCode}>{l.code}</span>}
            {l.name}
          </td>
          <td className={styles.amt}>
            <Amount value={l.amount} />
          </td>
        </tr>
      ))}
    </>
  );
}

function Row({ label, value, kind }: { label: string; value: number; kind: 'subtotal' | 'total' | 'heading' | 'subheading' }) {
  const cls = {
    subtotal: styles.stmtSubtotal,
    total: styles.stmtTotal,
    heading: styles.stmtHeading,
    subheading: styles.stmtSubheading,
  }[kind];
  return (
    <tr className={cls}>
      <td>{label}</td>
      <td className={styles.amt}>
        <Amount value={value} />
      </td>
    </tr>
  );
}

function Heading({ label, sub = false }: { label: string; sub?: boolean }) {
  return (
    <tr className={sub ? styles.stmtSubheading : styles.stmtHeading}>
      <td colSpan={2}>{label}</td>
    </tr>
  );
}

function Section({ section, totalLabel, sub = true }: { section: StatementSection; totalLabel: string; sub?: boolean }) {
  return (
    <>
      <Heading label={section.label} sub={sub} />
      <Lines lines={section.lines} />
      <Row label={totalLabel} value={section.total} kind="subtotal" />
    </>
  );
}

function Check({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div className={`${styles.check} ${ok ? styles.checkOk : styles.checkBad}`}>
      <span aria-hidden>{ok ? '✓' : '⚠'}</span>
      <span>{ok ? okText : badText}</span>
    </div>
  );
}

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);

// ─── Income statement ────────────────────────────────────────────────────────

export function IncomeStatementView({ s }: { s: IncomeStatement }) {
  const hasOther = s.otherIncome.lines.length > 0 || s.otherExpenses.lines.length > 0;
  return (
    <div className={styles.statementLayout}>
      <div className={styles.statement}>
        <Head title="Income Statement" period={`For the period ${formatPeriod(s)}`} />
        <table className={styles.stmtTable}>
          <tbody>
            <Section section={s.revenue} totalLabel="Total Revenue" sub={false} />
            <Section section={s.costOfSales} totalLabel="Total Cost of Sales" sub={false} />
            <Row label="Gross Profit" value={s.grossProfit} kind="total" />
            <Section section={s.operatingExpenses} totalLabel="Total Operating Expenses" sub={false} />
            <Row label="Operating Income" value={s.operatingIncome} kind="total" />
            {hasOther && (
              <>
                <Section section={s.otherIncome} totalLabel="Total Other Income" sub={false} />
                <Section section={s.otherExpenses} totalLabel="Total Other Expenses" sub={false} />
              </>
            )}
            <Row label={s.netIncome >= 0 ? 'Net Surplus' : 'Net Loss'} value={s.netIncome} kind="total" />
          </tbody>
        </table>
      </div>
      <div className={styles.sideStats}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Revenue</span>
          <span className={styles.statValue}>{formatCurrency(s.revenue.total)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Gross margin</span>
          <span className={styles.statValue}>{pct(s.grossMarginPct)}</span>
          <span className={styles.statSubtext}>Gross profit ÷ revenue</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Net margin</span>
          <span className={styles.statValue}>{pct(s.netMarginPct)}</span>
          <span className={styles.statSubtext}>Net surplus ÷ revenue</span>
        </div>
      </div>
    </div>
  );
}

// ─── Balance sheet ───────────────────────────────────────────────────────────

export function BalanceSheetView({ s }: { s: BalanceSheet }) {
  return (
    <div className={styles.statementLayout}>
      <div className={styles.statement}>
        <Head title="Balance Sheet" period={`As of ${formatAsOf(s.asOf)}`} />
        <table className={styles.stmtTable}>
          <tbody>
            <Heading label="Assets" />
            {s.assets.map((sec) => (
              <Section key={sec.key} section={sec} totalLabel={`Total ${sec.label}`} />
            ))}
            <Row label="Total Assets" value={s.totalAssets} kind="total" />

            <Heading label="Liabilities and Members’ Equity" />
            {s.liabilities.map((sec) => (
              <Section key={sec.key} section={sec} totalLabel={`Total ${sec.label}`} />
            ))}
            <Row label="Total Liabilities" value={s.totalLiabilities} kind="subtotal" />
            <Section section={s.equity} totalLabel="Total Members’ Equity" />
            <Row label="Total Liabilities and Members’ Equity" value={s.totalLiabilitiesAndEquity} kind="total" />
          </tbody>
        </table>
        <Check
          ok={s.balanced}
          okText="Balanced: total assets equal total liabilities and equity."
          badText={`Out of balance by ${formatCurrency(Math.abs(s.difference))}. Check for an unbalanced journal entry.`}
        />
      </div>
      <div className={styles.sideStats}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Working capital</span>
          <span className={styles.statValue}>
            <Amount
              value={
                (s.assets.find((a) => a.key === 'CASH')?.total ?? 0) +
                (s.assets.find((a) => a.key === 'CURRENT_ASSET')?.total ?? 0) -
                (s.liabilities.find((l) => l.key === 'CURRENT_LIABILITY')?.total ?? 0)
              }
            />
          </span>
          <span className={styles.statSubtext}>Current assets − current liabilities</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Debt to equity</span>
          <span className={styles.statValue}>
            {s.totalEquity > 0 ? (s.totalLiabilities / s.totalEquity).toFixed(2) : '—'}
          </span>
          <span className={styles.statSubtext}>Total liabilities ÷ equity</span>
        </div>
      </div>
    </div>
  );
}

// ─── Cash flow statement ─────────────────────────────────────────────────────

export function CashFlowView({ s }: { s: CashFlowStatement }) {
  return (
    <div className={styles.statementLayout}>
      <div className={styles.statement}>
        <Head title="Statement of Cash Flows" period={`For the period ${formatPeriod(s)} · direct method`} />
        <table className={styles.stmtTable}>
          <tbody>
            {s.sections.map((sec) => (
              <Section
                key={sec.category}
                section={{ key: sec.category, label: sec.label, lines: sec.lines, total: sec.total }}
                totalLabel={`Net cash from ${sec.category.toLowerCase()} activities`}
                sub={false}
              />
            ))}
            <Row label="Net Increase (Decrease) in Cash" value={s.netChange} kind="subtotal" />
            <Row label="Cash at Beginning of Period" value={s.beginningCash} kind="subheading" />
            <Row label="Cash at End of Period" value={s.endingCash} kind="total" />
          </tbody>
        </table>
        <Check
          ok={s.reconciled}
          okText="Reconciled: ending cash agrees with cash on the balance sheet."
          badText={`Ending cash differs from the ledger’s ${formatCurrency(s.endingCashPerLedger)}.`}
        />
      </div>
      <div className={styles.sideStats}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Operating cash flow</span>
          <span className={styles.statValue}>
            <Amount value={s.sections[0].total} />
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Net change in cash</span>
          <span className={styles.statValue}>
            <Amount value={s.netChange} />
          </span>
          <span className={styles.statSubtext}>
            {formatCurrency(s.beginningCash)} → {formatCurrency(s.endingCash)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Trial balance ───────────────────────────────────────────────────────────

export function TrialBalanceView({ tb }: { tb: TrialBalance }) {
  return (
    <div className={styles.statement}>
      <Head title="Trial Balance" period={`As of ${formatAsOf(tb.asOf)}`} />
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th className={styles.num}>Debit</th>
              <th className={styles.num}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.emptyState}>
                  No postings yet.
                </td>
              </tr>
            )}
            {tb.rows.map((r) => (
              <tr key={r.accountId}>
                <td className={styles.muted}>{r.code}</td>
                <td>{r.name}</td>
                <td className={styles.num}>{r.debit ? formatCurrency(r.debit) : ''}</td>
                <td className={styles.num}>{r.credit ? formatCurrency(r.credit) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Totals</td>
              <td className={styles.num}>{formatCurrency(tb.totalDebit)}</td>
              <td className={styles.num}>{formatCurrency(tb.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Check
        ok={tb.balanced}
        okText="Total debits equal total credits."
        badText="Debits and credits do not agree. The ledger contains an unbalanced entry."
      />
    </div>
  );
}
