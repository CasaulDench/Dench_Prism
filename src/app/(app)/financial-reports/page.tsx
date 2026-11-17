import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { isValidDateKey, todayDateKey } from '@/lib/dailySales/businessDate';
import { presetPeriod } from '@/lib/accounting/periods';
import {
  accountBalances,
  computeBalanceSheet,
  computeCashFlow,
  computeIncomeStatement,
  computeTrialBalance,
} from '@/lib/accounting/statements';
import { AccountingService, AccountView, JournalEntryView } from '@/services/accountingService';
import PeriodNav from './_components/PeriodNav';
import { BalanceSheetView, CashFlowView, IncomeStatementView, TrialBalanceView } from './_components/Statements';
import AccountsTab from './_components/AccountsTab';
import JournalTab from './_components/JournalTab';
import styles from './page.module.css';

const TABS = [
  { id: 'income', label: 'Income Statement' },
  { id: 'balance', label: 'Balance Sheet' },
  { id: 'cashflow', label: 'Cash Flow' },
  { id: 'trial', label: 'Trial Balance' },
  { id: 'accounts', label: 'Chart of Accounts' },
  { id: 'journal', label: 'Journal' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const JOURNAL_LIMIT = 500;

export default async function FinancialReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');
  // Supervisory module, like Daily Sales: cashiers stay on the POS.
  if (user.role === 'CASHIER' || user.role === 'USER') redirect('/pos');

  const sp = await searchParams;
  const today = todayDateKey();
  const tab: TabId = TABS.some((t) => t.id === sp.tab) ? (sp.tab as TabId) : 'income';

  const fallback = presetPeriod('this-month', today);
  let to = typeof sp.to === 'string' && isValidDateKey(sp.to) ? sp.to : fallback.to;
  if (to > today) to = today;
  let from = typeof sp.from === 'string' && isValidDateKey(sp.from) ? sp.from : fallback.from;
  if (from > to) from = to;

  const asOfOnly = tab === 'balance' || tab === 'trial' || tab === 'accounts';

  let accounts: AccountView[] = [];
  let postings: Awaited<ReturnType<typeof AccountingService.getPostings>> = [];
  let journal: JournalEntryView[] = [];
  let dbError = false;
  try {
    // Post any sales / cash counts the ledger has not seen yet (idempotent).
    await AccountingService.syncPendingPostings();
    [accounts, postings, journal] = await Promise.all([
      AccountingService.getAccounts(),
      AccountingService.getPostings(to),
      tab === 'journal' ? AccountingService.getJournal(from, to, JOURNAL_LIMIT) : Promise.resolve([]),
    ]);
  } catch (e) {
    console.warn(`[financial-reports] Ledger unavailable (${e instanceof Error ? e.name : 'unknown error'}).`, e);
    dbError = true;
  }

  const tabHref = (id: TabId) => {
    const params = new URLSearchParams({ from, to });
    if (id !== 'income') params.set('tab', id);
    return `/financial-reports?${params.toString()}`;
  };

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.headerRow} ${styles.noPrint}`}>
        <div>
          <h1 className={styles.pageTitle}>Financial Reports</h1>
          <p className={styles.pageSubtitle}>
            Statements generated from the general ledger. POS sales and cash over/shorts post automatically;
            other activity is recorded as journal entries.
          </p>
        </div>
        <PeriodNav from={from} to={to} today={today} asOfOnly={asOfOnly} />
      </div>

      <nav className={`${styles.tabs} ${styles.noPrint}`} aria-label="Financial report sections">
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

      {dbError ? (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <span>⚠</span>
          <div>
            <strong>The general ledger is unavailable.</strong> Financial reports are computed from the database,
            so there is nothing to show until it is reachable. Check that Docker is running and{' '}
            <code>DATABASE_URL</code> is set (see SETUP.md).
          </div>
        </div>
      ) : (
        <>
          {tab === 'income' && <IncomeStatementView s={computeIncomeStatement(accounts, postings, from, to)} />}
          {tab === 'balance' && <BalanceSheetView s={computeBalanceSheet(accounts, postings, to)} />}
          {tab === 'cashflow' && <CashFlowView s={computeCashFlow(accounts, postings, from, to)} />}
          {tab === 'trial' && <TrialBalanceView tb={computeTrialBalance(accounts, postings, to)} />}
          {tab === 'accounts' && (
            <AccountsTab
              accounts={accounts}
              balances={Object.fromEntries(accountBalances(accounts, postings, { to }))}
              asOf={to}
            />
          )}
          {tab === 'journal' && (
            <JournalTab entries={journal} accounts={accounts} from={from} to={to} today={today} limit={JOURNAL_LIMIT} />
          )}
        </>
      )}
    </div>
  );
}
