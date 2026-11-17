'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatManilaTime } from '@/utils/formatters';
import { useToast } from '@/context/ToastContext';
import { generateReadingAction } from '@/actions/dailySalesActions';
import type { ReadingFigures } from '@/lib/dailySales/calculations';
import type { SalesReadingView } from '@/services/dailySalesService';
import styles from '../page.module.css';

interface Props {
  date: string;
  live: boolean;
  current: ReadingFigures;
  readings: SalesReadingView[];
}

function Figures({ f }: { f: ReadingFigures }) {
  return (
    <div className={styles.figureList}>
      <div className={styles.figure}>
        <span className={styles.figureLabel}>Transactions</span>
        <span className={styles.figureValue}>{f.transactionCount}</span>
      </div>
      <div className={styles.figure}>
        <span className={styles.figureLabel}>Transaction range</span>
        <span className={styles.figureValue}>
          {f.firstTransactionNo ?? '—'} – {f.lastTransactionNo ?? '—'}
        </span>
      </div>
      <div className={styles.figure}>
        <span className={styles.figureLabel}>Gross sales</span>
        <span className={styles.figureValue}>{formatCurrency(f.grossSales)}</span>
      </div>
      <div className={styles.figure}>
        <span className={styles.figureLabel}>Net sales</span>
        <span className={styles.figureValue}>{formatCurrency(f.netSales)}</span>
      </div>
      <div className={styles.figure}>
        <span className={styles.figureLabel}>Tax (5%)</span>
        <span className={styles.figureValue}>{formatCurrency(f.taxAmount)}</span>
      </div>
      <div className={styles.figure}>
        <span className={styles.figureLabel}>Voids</span>
        <span className={styles.figureValue}>
          {f.voidCount} · {formatCurrency(f.voidAmount)}
        </span>
      </div>
    </div>
  );
}

export default function ReadingsTab({ date, live, current, readings }: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();

  const zReading = readings.find((r) => r.type === 'Z');

  const generate = (type: 'X' | 'Z') => {
    if (
      type === 'Z' &&
      !window.confirm(
        `Generate the Z-reading for ${date}?\n\nThis closes the business day. Only one Z-reading can exist per date and it cannot be undone.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await generateReadingAction(type, date);
      if (res.success) {
        success(res.message ?? `${type}-reading generated.`);
        router.refresh();
      } else {
        error(res.error ?? `Failed to generate ${type}-reading.`);
      }
    });
  };

  return (
    <>
      {zReading && (
        <div className={`${styles.banner} ${styles.bannerSuccess}`}>
          <span>✔</span>
          <div>
            <strong>Day closed.</strong>{' '}Z-reading #{zReading.readingNumber} was generated at{' '}
            {formatManilaTime(zReading.createdAt)} by {zReading.generatedByName}. Grand total is now{' '}
            {formatCurrency(zReading.endingGrandTotal)}.
          </div>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Current Figures</h2>
            <p className={styles.cardSubtitle}>
              What a reading would record right now. Not saved until you generate one.
            </p>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondaryBtn} onClick={() => generate('X')} disabled={!live || isPending}>
              Generate X-Reading
            </button>
            <button className={styles.zBtn} onClick={() => generate('Z')} disabled={!live || isPending || !!zReading}>
              {zReading ? 'Z-Reading Done' : 'Generate Z-Reading (Close Day)'}
            </button>
          </div>
        </div>
        <Figures f={current} />
        <p className={styles.note} style={{ marginTop: 16 }}>
          <strong>X-reading:</strong>{' '}mid-day snapshot. Take as many as you need; it does not close the day.{' '}
          <strong>Z-reading:</strong>{' '}end-of-day reading. One per date, taken in date order. It carries the
          accumulated grand total forward.
        </p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Readings for this Date</h2>
            <p className={styles.cardSubtitle}>Stored readings are immutable snapshots.</p>
          </div>
        </div>
        {readings.length === 0 ? (
          <div className={styles.emptyState}>No readings have been generated for this date.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Reading</th>
                  <th>Time</th>
                  <th>Generated By</th>
                  <th className={styles.num}>Txns</th>
                  <th>Range</th>
                  <th className={styles.num}>Gross</th>
                  <th className={styles.num}>Net</th>
                  <th className={styles.num}>Tax</th>
                  <th className={styles.num}>Voids</th>
                  <th className={styles.num}>Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={`${styles.badge} ${r.type === 'Z' ? styles.badgeZ : styles.badgeX}`}>
                        {r.type}-{String(r.readingNumber).padStart(4, '0')}
                      </span>
                    </td>
                    <td>{formatManilaTime(r.createdAt)}</td>
                    <td>{r.generatedByName}</td>
                    <td className={styles.num}>{r.transactionCount}</td>
                    <td className={styles.muted}>
                      {r.firstTransactionNo ?? '—'} – {r.lastTransactionNo ?? '—'}
                    </td>
                    <td className={styles.num}>{formatCurrency(r.grossSales)}</td>
                    <td className={styles.num}>{formatCurrency(r.netSales)}</td>
                    <td className={styles.num}>{formatCurrency(r.taxAmount)}</td>
                    <td className={styles.num}>
                      {r.voidCount} · {formatCurrency(r.voidAmount)}
                    </td>
                    <td className={styles.num}>
                      <div className={styles.strong}>{formatCurrency(r.endingGrandTotal)}</div>
                      <div className={styles.muted}>from {formatCurrency(r.beginningGrandTotal)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
