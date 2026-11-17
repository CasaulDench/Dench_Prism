'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { createJournalEntryAction, reverseJournalEntryAction } from '@/actions/accountingActions';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from '@/lib/accounting/chartOfAccounts';
import { validateJournalLines, toCents } from '@/lib/accounting/ledger';
import { formatPeriod } from '@/lib/accounting/periods';
import { formatCurrency } from '@/utils/formatters';
import type { AccountView, JournalEntryView } from '@/services/accountingService';
import styles from '../page.module.css';

interface Props {
  entries: JournalEntryView[];
  accounts: AccountView[];
  from: string;
  to: string;
  today: string;
  limit: number;
}

const SOURCE_LABELS: Record<JournalEntryView['source'], string> = {
  OPENING: 'Opening',
  MANUAL: 'Manual',
  POS_SALE: 'POS sale',
  POS_VOID: 'POS void',
  CASH_COUNT: 'Cash count',
  REVERSAL: 'Reversal',
};

type Filter = 'ALL' | 'MANUAL_ONLY' | 'AUTO_ONLY';

const isManualLike = (s: JournalEntryView['source']) => s === 'MANUAL' || s === 'OPENING' || s === 'REVERSAL';

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${d}T00:00:00Z`)
  );

export default function JournalTab({ entries, accounts, from, to, today, limit }: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const shown = entries.filter((e) =>
    filter === 'ALL' ? true : filter === 'MANUAL_ONLY' ? isManualLike(e.source) : !isManualLike(e.source)
  );

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reverse = (e: JournalEntryView) => {
    if (!window.confirm(`Post a reversing entry for JE-${e.number} dated today? The original stays on record.`)) return;
    startTransition(async () => {
      const res = await reverseJournalEntryAction(e.id, today);
      if (res.success) {
        success(res.message ?? 'Reversed.');
        router.refresh();
      } else error(res.error ?? 'Could not reverse the entry.');
    });
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>General Journal</h2>
          <p className={styles.cardSubtitle}>
            {formatPeriod({ from, to })} · {entries.length} entries
            {entries.length >= limit && ` (showing the latest ${limit}; narrow the period to see more)`}
          </p>
        </div>
        <div className={`${styles.filterRow} ${styles.noPrint}`}>
          <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter entries">
            <option value="ALL">All entries</option>
            <option value="MANUAL_ONLY">Manual, opening & reversals</option>
            <option value="AUTO_ONLY">Automatic (POS & cash counts)</option>
          </select>
          <button className={styles.primaryBtn} onClick={() => setCreating(true)}>
            + New Journal Entry
          </button>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>No.</th>
              <th>Date</th>
              <th>Description</th>
              <th>Source</th>
              <th className={styles.num}>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.emptyState}>
                  No journal entries in this period.
                </td>
              </tr>
            )}
            {shown.map((e) => (
              <Fragment key={e.id}>
                <tr>
                  <td className={styles.strong}>JE-{e.number}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                  <td>
                    <div>{e.description}</div>
                    <div className={styles.muted}>
                      {[e.reference && `Ref ${e.reference}`, e.createdByName && `by ${e.createdByName}`].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeSource}`}>{SOURCE_LABELS[e.source]}</span>{' '}
                    {e.reversedByNumber && (
                      <span className={`${styles.badge} ${styles.badgeReversed}`}>Reversed by JE-{e.reversedByNumber}</span>
                    )}
                    {e.reversesNumber && <span className={styles.muted}> of JE-{e.reversesNumber}</span>}
                  </td>
                  <td className={styles.num}>{formatCurrency(e.total)}</td>
                  <td className={`${styles.num} ${styles.noPrint}`}>
                    <button className={styles.linkBtn} onClick={() => toggle(e.id)}>
                      {open.has(e.id) ? 'Hide' : 'Lines'}
                    </button>
                    {(e.source === 'MANUAL' || e.source === 'OPENING') && !e.reversedByNumber && (
                      <>
                        {' · '}
                        <button className={styles.linkBtn} onClick={() => reverse(e)} disabled={isPending}>
                          Reverse
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {open.has(e.id) &&
                  e.lines.map((l) => (
                    <tr key={l.id} className={styles.entryLines}>
                      <td />
                      <td colSpan={2} className={l.credit ? styles.indent : undefined}>
                        <span className={styles.stmtCode}>{l.accountCode}</span>
                        {l.accountName}
                        {l.memo && <span className={styles.muted}> — {l.memo}</span>}
                      </td>
                      <td className={styles.num}>{l.debit ? `Dr ${formatCurrency(l.debit)}` : ''}</td>
                      <td className={styles.num}>{l.credit ? `Cr ${formatCurrency(l.credit)}` : ''}</td>
                      <td />
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <NewEntryModal accounts={accounts} today={today} onClose={() => setCreating(false)} />}
    </div>
  );
}

// ─── New entry form ──────────────────────────────────────────────────────────

interface DraftLine {
  key: number;
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
}

let nextKey = 1;
const blankLine = (): DraftLine => ({ key: nextKey++, accountId: '', debit: '', credit: '', memo: '' });
const parseAmount = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(/,/g, '')));

function NewEntryModal({ accounts, today, onClose }: { accounts: AccountView[]; today: string; onClose: () => void }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [problem, setProblem] = useState<string | null>(null);

  const active = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const totals = lines.reduce(
    (acc, l) => ({
      dr: acc.dr + (Number.isFinite(parseAmount(l.debit)) ? toCents(parseAmount(l.debit)) : 0),
      cr: acc.cr + (Number.isFinite(parseAmount(l.credit)) ? toCents(parseAmount(l.credit)) : 0),
    }),
    { dr: 0, cr: 0 }
  );
  const diff = totals.dr - totals.cr;

  const update = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return setProblem('Describe what the entry is for.');
    if (date > today) return setProblem('Entries cannot be dated in the future.');

    const used = lines.filter((l) => l.accountId || l.debit || l.credit);
    const payload = used.map((l) => ({
      accountId: Number(l.accountId),
      debit: parseAmount(l.debit),
      credit: parseAmount(l.credit),
      memo: l.memo,
    }));
    const p = validateJournalLines(payload, accountMap);
    if (p) return setProblem(p);
    setProblem(null);

    startTransition(async () => {
      const res = await createJournalEntryAction({ date, description, reference, lines: payload });
      if (res.success) {
        success(res.message ?? 'Posted.');
        onClose();
        router.refresh();
      } else {
        setProblem(res.error ?? 'Could not post the entry.');
        error(res.error ?? 'Could not post the entry.');
      }
    });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <form
        className={`${styles.modalContent} ${styles.wideModal}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>New Journal Entry</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <label className={styles.formGroup}>
              <span className={styles.formLabel}>Date</span>
              <input type="date" className={styles.formInput} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.formLabel}>Reference (optional)</span>
              <input
                className={styles.formInput}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="OR / invoice / voucher no."
              />
            </label>
          </div>
          <label className={styles.formGroup}>
            <span className={styles.formLabel}>Description</span>
            <input
              className={styles.formInput}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Electricity bill for October"
              maxLength={200}
              autoFocus
            />
          </label>

          <div className={`${styles.lineGrid} ${styles.lineGridHead}`}>
            <span>Account</span>
            <span style={{ textAlign: 'right' }}>Debit</span>
            <span style={{ textAlign: 'right' }}>Credit</span>
            <span>Memo</span>
            <span />
          </div>
          {lines.map((l) => (
            <div key={l.key} className={styles.lineGrid}>
              <select
                className={styles.formInput}
                value={l.accountId}
                onChange={(e) => update(l.key, { accountId: e.target.value })}
                aria-label="Account"
              >
                <option value="">Choose account…</option>
                {ACCOUNT_TYPES.map((t) => (
                  <optgroup key={t} label={ACCOUNT_TYPE_LABELS[t]}>
                    {active
                      .filter((a) => a.type === t)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} {a.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <input
                className={`${styles.formInput} ${styles.amountInput}`}
                value={l.debit}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Debit"
                onChange={(e) => update(l.key, { debit: e.target.value, ...(e.target.value ? { credit: '' } : {}) })}
              />
              <input
                className={`${styles.formInput} ${styles.amountInput}`}
                value={l.credit}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Credit"
                onChange={(e) => update(l.key, { credit: e.target.value, ...(e.target.value ? { debit: '' } : {}) })}
              />
              <input
                className={styles.formInput}
                value={l.memo}
                aria-label="Memo"
                onChange={(e) => update(l.key, { memo: e.target.value })}
              />
              <button
                type="button"
                className={styles.removeBtn}
                aria-label="Remove line"
                disabled={lines.length <= 2}
                onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
              >
                ×
              </button>
            </div>
          ))}
          <div>
            <button type="button" className={`${styles.secondaryBtn} ${styles.smallBtn}`} onClick={() => setLines((p) => [...p, blankLine()])}>
              + Add line
            </button>
          </div>

          <div className={styles.preview}>
            <div className={styles.previewRow}>
              <span>Total debits</span>
              <span>{formatCurrency(totals.dr / 100)}</span>
            </div>
            <div className={styles.previewRow}>
              <span>Total credits</span>
              <span>{formatCurrency(totals.cr / 100)}</span>
            </div>
            <div className={`${styles.previewRow} ${styles.previewTotal}`}>
              <span>{diff === 0 ? 'Balanced' : 'Out of balance'}</span>
              <span className={diff === 0 ? styles.zero : styles.negative}>{formatCurrency(Math.abs(diff) / 100)}</span>
            </div>
          </div>
          <p className={styles.note}>
            Posted entries cannot be edited or deleted. To correct one, reverse it and post a new entry.
          </p>
          {problem && <p className={styles.errorText}>{problem}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={isPending || diff !== 0 || totals.dr === 0}>
            {isPending ? 'Posting…' : 'Post entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
