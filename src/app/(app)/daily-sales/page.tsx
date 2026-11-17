import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { isValidDateKey, todayDateKey } from '@/lib/dailySales/businessDate';
import {
  SaleTransactionRow,
  cashSalesForCashier,
  computeDailySummary,
  computeReadingFigures,
  computeVendorSplit,
} from '@/lib/dailySales/calculations';
import {
  DailySalesService,
  CashierOption,
  CashReconciliationView,
  SalesReadingView,
} from '@/services/dailySalesService';
import { DEMO_CASHIERS, getDemoDayTransactions } from '@/data/dailySalesMockData';
import DateNav from './_components/DateNav';
import SummaryTab from './_components/SummaryTab';
import ReadingsTab from './_components/ReadingsTab';
import CashCountTab from './_components/CashCountTab';
import VendorSplitTab from './_components/VendorSplitTab';
import styles from './page.module.css';

const TABS = [
  { id: 'summary', label: 'Daily Sales' },
  { id: 'readings', label: 'Sales Readings' },
  { id: 'cash', label: 'Cash Count & Overs' },
  { id: 'vendors', label: 'Vendor Split' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface LoadedData {
  live: boolean;
  rows: SaleTransactionRow[];
  readings: SalesReadingView[];
  reconciliations: CashReconciliationView[];
  history: CashReconciliationView[];
  cashiers: CashierOption[];
}

async function loadData(date: string): Promise<LoadedData> {
  try {
    const [rows, readings, reconciliations, history, cashiers] = await Promise.all([
      DailySalesService.getDayTransactions(date),
      DailySalesService.getReadings(date),
      DailySalesService.getReconciliations(date),
      DailySalesService.getRecentReconciliations(30),
      DailySalesService.getCashiers(),
    ]);
    return { live: true, rows, readings, reconciliations, history, cashiers };
  } catch (e) {
    // No database yet (see SETUP.md): show deterministic demo data instead of a crash.
    console.warn(`[daily-sales] Database unavailable (${e instanceof Error ? e.name : 'unknown error'}); using demo data.`);
    return {
      live: false,
      rows: getDemoDayTransactions(date),
      readings: [],
      reconciliations: [],
      history: [],
      cashiers: DEMO_CASHIERS,
    };
  }
}

export default async function DailySalesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');
  // Supervisory module: cashiers stay on the POS.
  if (user.role === 'CASHIER' || user.role === 'USER') redirect('/pos');

  const sp = await searchParams;
  const today = todayDateKey();
  const date = typeof sp.date === 'string' && isValidDateKey(sp.date) && sp.date <= today ? sp.date : today;
  const tab: TabId = TABS.some((t) => t.id === sp.tab) ? (sp.tab as TabId) : 'summary';

  const data = await loadData(date);

  const tabHref = (id: TabId) => {
    const params = new URLSearchParams();
    if (date !== today) params.set('date', date);
    if (id !== 'summary') params.set('tab', id);
    const qs = params.toString();
    return qs ? `/daily-sales?${qs}` : '/daily-sales';
  };

  const cashSalesByCashier: Record<string, number> = {};
  for (const id of new Set(data.rows.map((r) => r.cashierId))) {
    const v = cashSalesForCashier(data.rows, id);
    if (v > 0) cashSalesByCashier[id] = v;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Daily Sales &amp; Reconciliation</h1>
          <p className={styles.pageSubtitle}>
            Daily sales, X/Z readings, drawer cash counts, and vendor settlements by business date.
          </p>
        </div>
        <DateNav date={date} today={today} />
      </div>

      {!data.live && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <span>⚠</span>
          <div>
            <strong>Demo data.</strong>{' '}The database is not connected, so this page shows generated sample
            sales. Readings and cash counts can&apos;t be saved until <code>DATABASE_URL</code> is set up (see
            SETUP.md).
          </div>
        </div>
      )}

      <nav className={styles.tabs} aria-label="Daily sales sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            scroll={false}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'summary' && <SummaryTab summary={computeDailySummary(data.rows)} />}
      {tab === 'readings' && (
        <ReadingsTab
          date={date}
          live={data.live}
          current={computeReadingFigures(data.rows)}
          readings={data.readings}
        />
      )}
      {tab === 'cash' && (
        <CashCountTab
          date={date}
          live={data.live}
          cashiers={data.cashiers}
          cashSalesByCashier={cashSalesByCashier}
          reconciliations={data.reconciliations}
          history={data.history}
        />
      )}
      {tab === 'vendors' && <VendorSplitTab split={computeVendorSplit(data.rows)} />}
    </div>
  );
}
