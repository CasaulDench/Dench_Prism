import { formatCurrency } from '@/utils/formatters';
import type { VendorSplitResult } from '@/lib/dailySales/calculations';
import styles from '../page.module.css';

export default function VendorSplitTab({ split }: { split: VendorSplitResult }) {
  const vendorLines = split.lines.filter((l) => l.vendorId !== null);
  const coopLines = split.lines.filter((l) => l.vendorId === null);
  const vendorNet = vendorLines.reduce((a, l) => a + l.netSales, 0);
  const commission = vendorLines.reduce((a, l) => a + l.coopShare, 0);
  const coopOwned = coopLines.reduce((a, l) => a + l.netSales, 0);

  return (
    <>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Vendor Goods Sold</span>
          <span className={styles.statValue}>{formatCurrency(vendorNet)}</span>
          <span className={styles.statSubtext}>{vendorLines.length} vendor line(s), net of tax</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Payable to Vendors</span>
          <span className={styles.statValue}>{formatCurrency(split.totals.vendorPayable)}</span>
          <span className={styles.statSubtext}>To be remitted for this date</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Coop Commission</span>
          <span className={styles.statValue}>{formatCurrency(commission)}</span>
          <span className={styles.statSubtext}>Coop share of vendor goods</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Coop Revenue</span>
          <span className={styles.statValue}>{formatCurrency(split.totals.coopShare)}</span>
          <span className={styles.statSubtext}>Commission + {formatCurrency(coopOwned)} coop-owned</span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Vendor Split Settlement</h2>
            <p className={styles.cardSubtitle}>
              Split on net sales (excluding 5% tax), at the share rate in force when each item was sold.
            </p>
          </div>
        </div>
        {split.lines.length === 0 ? (
          <div className={styles.emptyState}>No completed sales on this business date.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className={styles.num}>Coop Share</th>
                  <th className={styles.num}>Items Sold</th>
                  <th className={styles.num}>Net Sales</th>
                  <th className={styles.num}>Coop Amount</th>
                  <th className={styles.num}>Vendor Payable</th>
                </tr>
              </thead>
              <tbody>
                {split.lines.map((l) => (
                  <tr key={`${l.vendorId ?? 'coop'}@${l.coopSharePercent}`}>
                    <td className={styles.strong}>{l.vendorName}</td>
                    <td className={styles.num}>{l.coopSharePercent}%</td>
                    <td className={styles.num}>{l.itemsSold}</td>
                    <td className={styles.num}>{formatCurrency(l.netSales)}</td>
                    <td className={styles.num}>{formatCurrency(l.coopShare)}</td>
                    <td className={styles.num}>{l.vendorId === null ? '—' : formatCurrency(l.vendorPayable)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className={styles.num}>{split.totals.itemsSold}</td>
                  <td className={styles.num}>{formatCurrency(split.totals.netSales)}</td>
                  <td className={styles.num}>{formatCurrency(split.totals.coopShare)}</td>
                  <td className={styles.num}>{formatCurrency(split.totals.vendorPayable)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
