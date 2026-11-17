'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatManilaDate } from '@/utils/formatters';
import { dateKeyToDbDate } from '@/lib/dailySales/businessDate';
import { useToast } from '@/context/ToastContext';
import { submitCashCountAction } from '@/actions/dailySalesActions';
import {
  DENOMINATIONS,
  DenominationCounts,
  CashStatus,
  countDenominations,
  denominationLabel,
  reconcileCash,
} from '@/lib/dailySales/calculations';
import type { CashierOption, CashReconciliationView } from '@/services/dailySalesService';
import styles from '../page.module.css';

interface Props {
  date: string;
  live: boolean;
  cashiers: CashierOption[];
  /** Cash sales (tax-inclusive) per cashier id for this date. */
  cashSalesByCashier: Record<string, number>;
  reconciliations: CashReconciliationView[];
  history: CashReconciliationView[];
}

const DEFAULT_OPENING_FUND = '1000';

function StatusBadge({ status }: { status: CashStatus | 'PENDING' }) {
  const cls =
    status === 'BALANCED'
      ? styles.badgeBalanced
      : status === 'OVER'
        ? styles.badgeOver
        : status === 'SHORT'
          ? styles.badgeShort
          : styles.badgePending;
  return <span className={`${styles.badge} ${cls}`}>{status === 'PENDING' ? 'Not counted' : status}</span>;
}

function Variance({ value }: { value: number }) {
  const cls = value > 0 ? styles.positive : value < 0 ? styles.negative : styles.zero;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return <span className={cls}>{sign}{formatCurrency(Math.abs(value))}</span>;
}

export default function CashCountTab({ date, live, cashiers, cashSalesByCashier, reconciliations, history }: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();

  const reconByCashier = useMemo(
    () => new Map(reconciliations.map((r) => [r.cashierId, r])),
    [reconciliations]
  );
  const nameById = useMemo(() => new Map(cashiers.map((c) => [c.id, c.name])), [cashiers]);

  // Rows: anyone who sold today or was already counted.
  const rowIds = useMemo(() => {
    const ids = new Set<string>([...Object.keys(cashSalesByCashier), ...reconByCashier.keys()]);
    return [...ids].sort((a, b) => (cashSalesByCashier[b] ?? 0) - (cashSalesByCashier[a] ?? 0));
  }, [cashSalesByCashier, reconByCashier]);

  const pendingCashiers = cashiers.filter((c) => !reconByCashier.has(c.id));

  // Day totals
  const totals = reconciliations.reduce(
    (acc, r) => ({
      expected: acc.expected + r.expectedCash,
      counted: acc.counted + r.countedCash,
      variance: acc.variance + r.variance,
    }),
    { expected: 0, counted: 0, variance: 0 }
  );
  const totalCashSales = Object.values(cashSalesByCashier).reduce((a, v) => a + v, 0);
  const pendingCount = rowIds.filter((id) => !reconByCashier.has(id)).length;

  const historyOvers = history.filter((h) => h.variance > 0).reduce((a, h) => a + h.variance, 0);
  const historyShorts = history.filter((h) => h.variance < 0).reduce((a, h) => a + h.variance, 0);

  // ─── Modal state ───────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [cashierId, setCashierId] = useState('');
  const [openingFund, setOpeningFund] = useState(DEFAULT_OPENING_FUND);
  const [pieces, setPieces] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');

  const counts: DenominationCounts = useMemo(() => {
    const out: DenominationCounts = {};
    for (const d of DENOMINATIONS) {
      const n = parseInt(pieces[String(d)] ?? '', 10);
      if (Number.isInteger(n) && n > 0) out[String(d)] = n;
    }
    return out;
  }, [pieces]);

  const openingFundNum = parseFloat(openingFund);
  const preview = reconcileCash({
    openingFund: Number.isFinite(openingFundNum) ? openingFundNum : 0,
    cashSales: cashSalesByCashier[cashierId] ?? 0,
    countedCash: countDenominations(counts),
  });

  const openModal = (forCashier?: string) => {
    setCashierId(forCashier ?? pendingCashiers[0]?.id ?? '');
    setOpeningFund(DEFAULT_OPENING_FUND);
    setPieces({});
    setRemarks('');
    setModalOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashierId) return error('Select a cashier.');
    if (!Number.isFinite(openingFundNum) || openingFundNum < 0) return error('Opening fund must be ₱0 or more.');
    if (preview.status !== 'BALANCED' && !remarks.trim()) {
      return error('Cash is not balanced. Add remarks explaining the variance.');
    }
    startTransition(async () => {
      const res = await submitCashCountAction({
        businessDate: date,
        cashierId,
        openingFund: openingFundNum,
        denominations: counts,
        remarks: remarks.trim() || undefined,
      });
      if (res.success) {
        success(res.message ?? 'Cash count recorded.');
        setModalOpen(false);
        router.refresh();
      } else {
        error(res.error ?? 'Failed to record cash count.');
      }
    });
  };

  return (
    <>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Cash Sales</span>
          <span className={styles.statValue}>{formatCurrency(totalCashSales)}</span>
          <span className={styles.statSubtext}>All cashiers, tax-inclusive</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Expected (Counted Drawers)</span>
          <span className={styles.statValue}>{formatCurrency(totals.expected)}</span>
          <span className={styles.statSubtext}>Opening fund + cash sales</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Actual Counted</span>
          <span className={styles.statValue}>{formatCurrency(totals.counted)}</span>
          <span className={styles.statSubtext}>
            {pendingCount > 0 ? `${pendingCount} drawer(s) not yet counted` : 'All drawers counted'}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Net Over / (Short)</span>
          <span className={styles.statValue}>
            {reconciliations.length > 0 ? <Variance value={totals.variance} /> : '—'}
          </span>
          <span className={styles.statSubtext}>
            {reconciliations.length > 0 ? 'For this business date' : 'No drawers counted yet'}
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Drawer Reconciliation</h2>
            <p className={styles.cardSubtitle}>
              Count each cashier&apos;s drawer at end of shift. Expected cash = opening fund + cash sales.
            </p>
          </div>
          <button className={styles.primaryBtn} onClick={() => openModal()} disabled={pendingCashiers.length === 0}>
            + Record Cash Count
          </button>
        </div>
        {rowIds.length === 0 ? (
          <div className={styles.emptyState}>No cashier activity on this business date.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cashier</th>
                  <th className={styles.num}>Cash Sales</th>
                  <th className={styles.num}>Opening Fund</th>
                  <th className={styles.num}>Expected</th>
                  <th className={styles.num}>Counted</th>
                  <th className={styles.num}>Over / (Short)</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rowIds.map((id) => {
                  const r = reconByCashier.get(id);
                  return (
                    <tr key={id}>
                      <td>
                        <div className={styles.strong}>{r?.cashierName ?? nameById.get(id) ?? id}</div>
                        {r?.remarks && <div className={styles.muted}>“{r.remarks}”</div>}
                      </td>
                      <td className={styles.num}>{formatCurrency(r?.cashSales ?? cashSalesByCashier[id] ?? 0)}</td>
                      <td className={styles.num}>{r ? formatCurrency(r.openingFund) : '—'}</td>
                      <td className={styles.num}>{r ? formatCurrency(r.expectedCash) : '—'}</td>
                      <td className={styles.num}>{r ? formatCurrency(r.countedCash) : '—'}</td>
                      <td className={styles.num}>{r ? <Variance value={r.variance} /> : '—'}</td>
                      <td>
                        <StatusBadge status={r?.status ?? 'PENDING'} />
                      </td>
                      <td className={styles.num}>
                        {!r && (
                          <button className={`${styles.secondaryBtn} ${styles.smallBtn}`} onClick={() => openModal(id)}>
                            Count cash
                          </button>
                        )}
                        {r && <span className={styles.muted}>by {r.recordedByName}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Cash Over / Short Ledger</h2>
            <p className={styles.cardSubtitle}>Most recent 30 drawer counts, all dates</p>
          </div>
          <div className={styles.legend} style={{ marginTop: 0 }}>
            <span>
              Overs: <Variance value={historyOvers} />
            </span>
            <span>
              Shorts: <Variance value={historyShorts} />
            </span>
          </div>
        </div>
        {history.length === 0 ? (
          <div className={styles.emptyState}>No cash counts recorded yet.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cashier</th>
                  <th className={styles.num}>Expected</th>
                  <th className={styles.num}>Counted</th>
                  <th className={styles.num}>Over / (Short)</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatManilaDate(dateKeyToDbDate(h.businessDate))}</td>
                    <td className={styles.strong}>{h.cashierName}</td>
                    <td className={styles.num}>{formatCurrency(h.expectedCash)}</td>
                    <td className={styles.num}>{formatCurrency(h.countedCash)}</td>
                    <td className={styles.num}>
                      <Variance value={h.variance} />
                    </td>
                    <td>
                      <StatusBadge status={h.status} />
                    </td>
                    <td className={styles.muted}>{h.remarks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isPending && setModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Cash Count · {date}</h2>
              <button className={styles.closeBtn} onClick={() => setModalOpen(false)} aria-label="Close">
                &times;
              </button>
            </div>
            <form onSubmit={submit} style={{ display: 'contents' }}>
              <div className={styles.modalBody}>
                {!live && (
                  <div className={`${styles.banner} ${styles.bannerWarning}`}>
                    Demo mode: you can try the calculator, but the count can&apos;t be saved without a database.
                  </div>
                )}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="cc-cashier">Cashier *</label>
                    <select
                      id="cc-cashier"
                      className={styles.formInput}
                      value={cashierId}
                      onChange={(e) => setCashierId(e.target.value)}
                      required
                    >
                      {pendingCashiers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="cc-fund">Opening Fund (₱) *</label>
                    <input
                      id="cc-fund"
                      type="number"
                      min="0"
                      step="0.01"
                      className={styles.formInput}
                      value={openingFund}
                      onChange={(e) => setOpeningFund(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <span className={styles.formLabel}>Denomination Count (pieces)</span>
                  <div className={styles.denomGrid}>
                    {DENOMINATIONS.map((d) => {
                      const key = String(d);
                      const n = counts[key] ?? 0;
                      return (
                        <label key={key} className={styles.denomRow}>
                          <span className={styles.denomLabel}>{denominationLabel(d)}</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            className={styles.denomInput}
                            value={pieces[key] ?? ''}
                            placeholder="0"
                            onChange={(e) => setPieces((p) => ({ ...p, [key]: e.target.value }))}
                          />
                          <span className={styles.denomTotal}>{formatCurrency(d * n)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.preview}>
                  <div className={styles.previewRow}>
                    <span>Opening fund</span>
                    <span>{formatCurrency(preview.openingFund)}</span>
                  </div>
                  <div className={styles.previewRow}>
                    <span>+ Cash sales</span>
                    <span>{formatCurrency(preview.cashSales)}</span>
                  </div>
                  <div className={styles.previewRow}>
                    <span className={styles.strong}>Expected cash</span>
                    <span className={styles.strong}>{formatCurrency(preview.expectedCash)}</span>
                  </div>
                  <div className={styles.previewRow}>
                    <span>Counted cash</span>
                    <span>{formatCurrency(preview.countedCash)}</span>
                  </div>
                  <div className={`${styles.previewRow} ${styles.previewTotal}`}>
                    <span>
                      Over / (Short) <StatusBadge status={preview.status} />
                    </span>
                    <Variance value={preview.variance} />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="cc-remarks">
                    Remarks {preview.status !== 'BALANCED' && '*'}
                  </label>
                  <textarea
                    id="cc-remarks"
                    className={styles.formInput}
                    rows={2}
                    placeholder={preview.status === 'BALANCED' ? 'Optional' : 'Required: explain the variance'}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    maxLength={500}
                  />
                </div>
                <p className={styles.note}>
                  Expected cash is recalculated on the server when you save, so any sale rung up after this page
                  loaded is still included. A drawer can only be counted once per date.
                </p>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={!live || isPending || !cashierId}>
                  {isPending ? 'Saving…' : 'Save Cash Count'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
