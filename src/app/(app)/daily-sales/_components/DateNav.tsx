'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { formatDateKeyLong, shiftDateKey, isValidDateKey } from '@/lib/dailySales/businessDate';
import styles from '../page.module.css';

export default function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const go = (next: string) => {
    if (!isValidDateKey(next) || next > today) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === today) params.delete('date');
    else params.set('date', next);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/daily-sales?${qs}` : '/daily-sales'));
  };

  return (
    <div className={styles.dateNav} style={{ opacity: isPending ? 0.6 : 1 }}>
      <button className={styles.iconBtn} onClick={() => go(shiftDateKey(date, -1))} aria-label="Previous day">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <input
        type="date"
        className={styles.dateInput}
        value={date}
        max={today}
        onChange={(e) => go(e.target.value)}
        aria-label="Business date"
      />
      <button
        className={styles.iconBtn}
        onClick={() => go(shiftDateKey(date, 1))}
        disabled={date >= today}
        aria-label="Next day"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
      {date !== today && (
        <button className={styles.secondaryBtn} onClick={() => go(today)}>
          Today
        </button>
      )}
      <span className={styles.dateLong}>{formatDateKeyLong(date)}</span>
    </div>
  );
}
