import { formatCurrency } from '@/utils/formatters';
import type { DailySalesSummary } from '@/lib/dailySales/calculations';
import styles from '../page.module.css';

function hourLabel(h: number) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

export default function SummaryTab({ summary }: { summary: DailySalesSummary }) {
  if (summary.transactionCount === 0 && summary.voidCount === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.emptyState}>No sales were recorded on this business date.</div>
      </div>
    );
  }

  const maxHour = Math.max(1, ...summary.hourly.map((h) => h.sales));
  const memberPct = summary.grossSales ? (summary.memberSales / summary.grossSales) * 100 : 0;

  return (
    <>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Gross Sales</span>
          <span className={styles.statValue}>{formatCurrency(summary.grossSales)}</span>
          <span className={styles.statSubtext}>Tax-inclusive, completed sales</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Net Sales</span>
          <span className={styles.statValue}>{formatCurrency(summary.netSales)}</span>
          <span className={styles.statSubtext}>Tax collected: {formatCurrency(summary.taxAmount)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Transactions</span>
          <span className={styles.statValue}>{summary.transactionCount}</span>
          <span className={styles.statSubtext}>
            {summary.itemsSold} items · avg {formatCurrency(summary.averageTicket)}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Voided</span>
          <span className={styles.statValue}>{summary.voidCount}</span>
          <span className={styles.statSubtext}>{formatCurrency(summary.voidAmount)} excluded from sales</span>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Sales by Hour</h2>
              <p className={styles.cardSubtitle}>Gross sales per hour, Manila time</p>
            </div>
          </div>
          <div className={styles.chart}>
            {summary.hourly.map((h) => (
              <div
                key={h.hour}
                className={styles.barCol}
                title={`${hourLabel(h.hour)}: ${formatCurrency(h.sales)} · ${h.transactions} txn`}
              >
                <div className={styles.bar} style={{ height: `${(h.sales / maxHour) * 100}%` }} />
                <span className={styles.barLabel}>{hourLabel(h.hour)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Sales by Category</h2>
              <p className={styles.cardSubtitle}>Net of tax</p>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className={styles.num}>Qty</th>
                  <th className={styles.num}>Sales</th>
                  <th className={styles.num}>Share</th>
                </tr>
              </thead>
              <tbody>
                {summary.categories.map((c) => (
                  <tr key={c.category}>
                    <td className={styles.strong}>{c.category}</td>
                    <td className={styles.num}>{c.quantity}</td>
                    <td className={styles.num}>{formatCurrency(c.sales)}</td>
                    <td className={styles.num}>
                      {summary.netSales ? ((c.sales / summary.netSales) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 20 }}>
            <div className={styles.figureLabel}>Member vs walk-in (gross)</div>
            <div className={styles.splitBar}>
              <div className={styles.splitMember} style={{ width: `${memberPct}%` }} />
              <div className={styles.splitWalkIn} style={{ width: `${100 - memberPct}%` }} />
            </div>
            <div className={styles.legend}>
              <span>
                <span className={styles.legendDot} style={{ background: 'var(--primary-blue)' }} />
                Coop members {formatCurrency(summary.memberSales)} ({summary.memberTransactions} txn)
              </span>
              <span>
                <span className={styles.legendDot} style={{ background: 'var(--gray-400)' }} />
                Walk-in {formatCurrency(summary.walkInSales)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Top Products</h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className={styles.num}>Qty</th>
                  <th className={styles.num}>Net Sales</th>
                </tr>
              </thead>
              <tbody>
                {summary.topProducts.map((p) => (
                  <tr key={p.productId}>
                    <td>
                      <div className={styles.strong}>{p.name}</div>
                      <div className={styles.muted}>{p.category}</div>
                    </td>
                    <td className={styles.num}>{p.quantity}</td>
                    <td className={styles.num}>{formatCurrency(p.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Sales by Cashier</h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cashier</th>
                  <th className={styles.num}>Transactions</th>
                  <th className={styles.num}>Gross Sales</th>
                </tr>
              </thead>
              <tbody>
                {summary.cashiers.map((c) => (
                  <tr key={c.cashierId}>
                    <td className={styles.strong}>{c.cashierName}</td>
                    <td className={styles.num}>{c.transactions}</td>
                    <td className={styles.num}>{formatCurrency(c.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note} style={{ marginTop: 12 }}>
            Transactions {summary.firstTransactionNo ?? '—'} to {summary.lastTransactionNo ?? '—'}
          </p>
        </div>
      </div>
    </>
  );
}
