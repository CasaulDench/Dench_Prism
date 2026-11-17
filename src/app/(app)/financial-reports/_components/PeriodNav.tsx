'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { isValidDateKey } from '@/lib/dailySales/businessDate';
import { PERIOD_PRESETS, PresetId, matchPreset, presetPeriod } from '@/lib/accounting/periods';
import styles from '../page.module.css';

interface Props {
  from: string;
  to: string;
  today: string;
  /** Balance sheet and trial balance only use the end date. */
  asOfOnly: boolean;
}

export default function PeriodNav({ from, to, today, asOfOnly }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const active = matchPreset({ from, to }, today);

  const go = (nextFrom: string, nextTo: string) => {
    if (!isValidDateKey(nextFrom) || !isValidDateKey(nextTo)) return;
    if (nextTo > today) nextTo = today;
    if (nextFrom > nextTo) nextFrom = nextTo;
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', nextFrom);
    params.set('to', nextTo);
    startTransition(() => router.push(`/financial-reports?${params.toString()}`));
  };

  const pick = (id: PresetId) => {
    const p = presetPeriod(id, today);
    go(p.from, p.to);
  };

  return (
    <div className={`${styles.periodBar} ${styles.noPrint}`} style={{ opacity: isPending ? 0.6 : 1 }}>
      {PERIOD_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`${styles.presetBtn} ${active === p.id ? styles.presetActive : ''}`}
          onClick={() => pick(p.id)}
        >
          {p.label}
        </button>
      ))}
      {!asOfOnly && (
        <>
          <input
            type="date"
            className={styles.dateInput}
            value={from}
            max={to}
            onChange={(e) => go(e.target.value, to)}
            aria-label="Period start"
          />
          <span className={styles.rangeSep}>to</span>
        </>
      )}
      {asOfOnly && <span className={styles.rangeSep}>As of</span>}
      <input
        type="date"
        className={styles.dateInput}
        value={to}
        max={today}
        onChange={(e) => go(from, e.target.value)}
        aria-label={asOfOnly ? 'As of date' : 'Period end'}
      />
      <button type="button" className={styles.secondaryBtn} onClick={() => window.print()}>
        Print
      </button>
    </div>
  );
}
