// src/services/accountingService.ts
//
// General ledger persistence: the Chart of Accounts, journal entries, and the
// automatic postings that keep the ledger in step with the POS and cash counts.
// Statement maths lives in src/lib/accounting (pure, tested); this file only
// moves data in and out of the database.

import prisma from '@/lib/prisma';
import { Prisma, JournalSource } from '@prisma/client';
import { AuditService } from './auditService';
import { isValidDateKey, todayDateKey, toDateKey, dateKeyToDbDate, dbDateToDateKey } from '@/lib/dailySales/businessDate';
import {
  AccountInput,
  DEFAULT_CHART_OF_ACCOUNTS,
  SystemAccountKey,
  typeOfSubtype,
  validateAccountInput,
} from '@/lib/accounting/chartOfAccounts';
import {
  AccountRef,
  JournalLineInput,
  SystemLine,
  buildCashCountEntryLines,
  buildSaleEntryLines,
  costOfGoodsSold,
  reverseLines,
  toCents,
  validateJournalLines,
} from '@/lib/accounting/ledger';
import type { LedgerAccount, Posting } from '@/lib/accounting/statements';

type Client = Prisma.TransactionClient | typeof prisma;

const dec = (pesos: number) => new Prisma.Decimal(toCents(pesos)).div(100);
const num = (d: Prisma.Decimal | null | undefined) => (d ? Number(d.toString()) : 0);

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Thrown for problems the user can fix; the message is safe to show. */
export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingError';
  }
}

// ─── Serializable view models ────────────────────────────────────────────────

export interface AccountView extends LedgerAccount {
  description: string | null;
}

export interface JournalLineView {
  id: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface JournalEntryView {
  id: string;
  number: number;
  date: string;
  description: string;
  source: JournalSource;
  reference: string | null;
  createdByName: string | null;
  createdAt: string;
  reversesNumber: number | null;
  reversedByNumber: number | null;
  lines: JournalLineView[];
  total: number;
}

export interface ManualEntryInput {
  date: string;
  description: string;
  reference?: string | null;
  lines: JournalLineInput[];
}

export interface SyncResult {
  salesPosted: number;
  voidsReversed: number;
  cashCountsPosted: number;
}

function assertDateKey(key: string) {
  if (!isValidDateKey(key)) throw new AccountingError(`Invalid date '${key}'.`);
  if (key > todayDateKey()) throw new AccountingError('Entries cannot be dated in the future.');
}

interface NewEntry {
  date: string;
  description: string;
  source: JournalSource;
  reference?: string | null;
  transactionId?: string;
  cashReconciliationId?: string;
  reversesId?: string;
  createdById?: string | null;
  lines: { accountId: number; debit: number; credit: number; memo?: string | null }[];
}

async function createEntry(client: Client, e: NewEntry) {
  return client.journalEntry.create({
    data: {
      date: dateKeyToDbDate(e.date),
      description: e.description,
      source: e.source,
      reference: e.reference ?? null,
      transactionId: e.transactionId,
      cashReconciliationId: e.cashReconciliationId,
      reversesId: e.reversesId,
      createdById: e.createdById ?? null,
      lines: {
        create: e.lines.map((l) => ({
          accountId: l.accountId,
          debit: dec(l.debit),
          credit: dec(l.credit),
          memo: l.memo ?? null,
        })),
      },
    },
  });
}

export class AccountingService {
  // ─── Chart of accounts ─────────────────────────────────────────────────────

  /**
   * Installs the default chart on an empty ledger, and re-creates any system
   * account that is missing. Safe to call repeatedly.
   */
  static async ensureChartOfAccounts(client: Client = prisma): Promise<void> {
    const existing = await client.account.findMany({ select: { code: true, systemKey: true } });
    const codes = new Set(existing.map((a) => a.code));
    const keys = new Set(existing.map((a) => a.systemKey).filter(Boolean));
    const missing = DEFAULT_CHART_OF_ACCOUNTS.filter((d) =>
      existing.length === 0 ? true : d.systemKey !== undefined && !keys.has(d.systemKey)
    );
    for (const d of missing) {
      if (codes.has(d.code)) {
        throw new AccountingError(
          `System account '${d.name}' is missing and its code ${d.code} is used by another account.`
        );
      }
      try {
        await client.account.create({
          data: {
            code: d.code,
            name: d.name,
            type: d.type,
            subtype: d.subtype,
            description: d.description ?? null,
            systemKey: d.systemKey ?? null,
          },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e; // created concurrently: fine
      }
    }
  }

  static async getAccounts(client: Client = prisma): Promise<AccountView[]> {
    const rows = await client.account.findMany({ orderBy: { code: 'asc' } });
    return rows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      isActive: a.isActive,
      systemKey: a.systemKey,
      description: a.description,
    }));
  }

  private static async systemAccountIds(client: Client): Promise<Map<SystemAccountKey, number>> {
    const rows = await client.account.findMany({
      where: { systemKey: { not: null } },
      select: { id: true, systemKey: true },
    });
    return new Map(rows.map((r) => [r.systemKey as SystemAccountKey, r.id]));
  }

  private static async resolveSystemLines(client: Client, lines: SystemLine[]) {
    let ids = await this.systemAccountIds(client);
    if (lines.some((l) => !ids.has(l.key))) {
      await this.ensureChartOfAccounts(client);
      ids = await this.systemAccountIds(client);
    }
    return lines.map((l) => ({ accountId: ids.get(l.key)!, debit: l.debit, credit: l.credit, memo: l.memo }));
  }

  static async createAccount(input: AccountInput, userId: string): Promise<AccountView> {
    const codes = (await prisma.account.findMany({ select: { code: true } })).map((a) => a.code);
    const problem = validateAccountInput(input, codes);
    if (problem) throw new AccountingError(problem);

    try {
      const a = await prisma.account.create({
        data: {
          code: input.code.trim(),
          name: input.name.trim(),
          type: typeOfSubtype(input.subtype),
          subtype: input.subtype,
          description: input.description?.trim() || null,
        },
      });
      await AuditService.log({
        userId,
        action: 'ACCOUNT_CREATED',
        entityType: 'Account',
        entityId: a.id,
        details: { code: a.code, name: a.name, subtype: a.subtype },
      });
      return { ...a, description: a.description };
    } catch (e) {
      if (isUniqueViolation(e)) throw new AccountingError(`Account code ${input.code} is already in use.`);
      throw e;
    }
  }

  /** Rename, re-describe or (de)activate. Codes and types are fixed once created. */
  static async updateAccount(
    id: number,
    patch: { name?: string; description?: string | null; isActive?: boolean },
    userId: string
  ): Promise<void> {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new AccountingError('Account not found.');

    const data: Prisma.AccountUpdateInput = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new AccountingError('Account name is required.');
      if (name.length > 80) throw new AccountingError('Account name must be 80 characters or fewer.');
      data.name = name;
    }
    if (patch.description !== undefined) data.description = patch.description?.trim() || null;
    if (patch.isActive !== undefined && patch.isActive !== account.isActive) {
      if (!patch.isActive) {
        if (account.systemKey) {
          throw new AccountingError(`${account.name} is used by automatic postings and cannot be deactivated.`);
        }
        const totals = await prisma.journalLine.aggregate({
          where: { accountId: id },
          _sum: { debit: true, credit: true },
        });
        if (toCents(num(totals._sum.debit)) !== toCents(num(totals._sum.credit))) {
          throw new AccountingError(`${account.name} still has a balance. Bring it to zero before deactivating.`);
        }
      }
      data.isActive = patch.isActive;
    }

    await prisma.account.update({ where: { id }, data });
    await AuditService.log({
      userId,
      action: 'ACCOUNT_UPDATED',
      entityType: 'Account',
      entityId: id,
      details: { code: account.code, ...patch },
    });
  }

  // ─── Reading the ledger ────────────────────────────────────────────────────

  /** Every journal line dated on or before `to`, flattened for the statement maths. */
  static async getPostings(to: string): Promise<Posting[]> {
    const lines = await prisma.journalLine.findMany({
      where: { entry: { date: { lte: dateKeyToDbDate(to) } } },
      select: { entryId: true, accountId: true, debit: true, credit: true, entry: { select: { date: true } } },
    });
    return lines.map((l) => ({
      entryId: l.entryId,
      date: dbDateToDateKey(l.entry.date),
      accountId: l.accountId,
      debit: num(l.debit),
      credit: num(l.credit),
    }));
  }

  static async getJournal(from: string, to: string, limit = 500): Promise<JournalEntryView[]> {
    const rows = await prisma.journalEntry.findMany({
      where: { date: { gte: dateKeyToDbDate(from), lte: dateKeyToDbDate(to) } },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      take: limit,
      include: {
        createdBy: { select: { name: true } },
        reverses: { select: { number: true } },
        reversedBy: { select: { number: true } },
        lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { id: 'asc' } },
      },
    });
    return rows.map((e) => {
      const lines = e.lines.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        accountCode: l.account.code,
        accountName: l.account.name,
        debit: num(l.debit),
        credit: num(l.credit),
        memo: l.memo,
      }));
      return {
        id: e.id,
        number: e.number,
        date: dbDateToDateKey(e.date),
        description: e.description,
        source: e.source,
        reference: e.reference,
        createdByName: e.createdBy?.name ?? null,
        createdAt: e.createdAt.toISOString(),
        reversesNumber: e.reverses?.number ?? null,
        reversedByNumber: e.reversedBy?.number ?? null,
        lines,
        total: lines.reduce((acc, l) => acc + toCents(l.debit), 0) / 100,
      };
    });
  }

  // ─── Manual entries ────────────────────────────────────────────────────────

  static async createManualEntry(input: ManualEntryInput, userId: string): Promise<{ number: number }> {
    assertDateKey(input.date);
    const description = (input.description ?? '').trim();
    if (!description) throw new AccountingError('Describe what the entry is for.');
    if (description.length > 200) throw new AccountingError('Description must be 200 characters or fewer.');

    const lines = (input.lines ?? []).filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
    const accounts = await prisma.account.findMany({
      where: { id: { in: lines.map((l) => l.accountId) } },
      select: { id: true, code: true, name: true, type: true, isActive: true },
    });
    const problem = validateJournalLines(lines, new Map<number, AccountRef>(accounts.map((a) => [a.id, a])));
    if (problem) throw new AccountingError(problem);

    return prisma.$transaction(async (tx) => {
      const entry = await createEntry(tx, {
        date: input.date,
        description,
        source: 'MANUAL',
        reference: input.reference?.trim() || null,
        createdById: userId,
        lines: lines.map((l) => ({ ...l, memo: l.memo?.trim() || null })),
      });
      await AuditService.log(
        {
          userId,
          action: 'JOURNAL_ENTRY_POSTED',
          entityType: 'JournalEntry',
          entityId: entry.id,
          details: { number: entry.number, date: input.date, description },
        },
        tx
      );
      return { number: entry.number };
    });
  }

  /** Posts the mirror image of a manual or opening entry, dated `date`. */
  static async reverseEntry(entryId: string, date: string, userId: string): Promise<{ number: number }> {
    assertDateKey(date);
    const original = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true, reversedBy: { select: { number: true } } },
    });
    if (!original) throw new AccountingError('Journal entry not found.');
    if (original.source !== 'MANUAL' && original.source !== 'OPENING') {
      throw new AccountingError('Automatic postings follow their source document and cannot be reversed by hand.');
    }
    if (original.reversedBy) {
      throw new AccountingError(`Entry JE-${original.number} was already reversed by JE-${original.reversedBy.number}.`);
    }
    if (date < dbDateToDateKey(original.date)) {
      throw new AccountingError('A reversal cannot be dated before the entry it reverses.');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const entry = await createEntry(tx, {
          date,
          description: `Reversal of JE-${original.number}: ${original.description}`,
          source: 'REVERSAL',
          reference: original.reference,
          reversesId: original.id,
          createdById: userId,
          lines: reverseLines(
            original.lines.map((l) => ({ accountId: l.accountId, debit: num(l.debit), credit: num(l.credit), memo: l.memo }))
          ),
        });
        await AuditService.log(
          {
            userId,
            action: 'JOURNAL_ENTRY_REVERSED',
            entityType: 'JournalEntry',
            entityId: original.id,
            details: { reversed: original.number, reversal: entry.number },
          },
          tx
        );
        return { number: entry.number };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AccountingError(`Entry JE-${original.number} was already reversed.`);
      throw e;
    }
  }

  // ─── Automatic postings ────────────────────────────────────────────────────

  /**
   * Posts a completed POS transaction. Called inside the checkout transaction,
   * and by syncPendingPostings for sales recorded before the ledger existed.
   * Cost of goods sold uses current recipes and inventory prices.
   */
  static async postSaleTransaction(client: Client, transactionId: string): Promise<void> {
    const t = await client.transaction.findUnique({
      where: { id: transactionId },
      include: {
        items: {
          include: {
            product: { include: { ingredients: { include: { inventoryItem: { select: { price: true, packaging: true } } } } } },
          },
        },
      },
    });
    if (!t || t.status !== 'COMPLETED') return;

    const cogs = costOfGoodsSold(
      t.items.map((i) => ({
        quantity: i.quantity,
        recipe: i.product.ingredients.map((r) => ({
          quantityRequired: num(r.quantityRequired),
          price: num(r.inventoryItem.price),
          packaging: r.inventoryItem.packaging,
        })),
      }))
    );

    const lines = buildSaleEntryLines({
      totalAmount: num(t.totalAmount),
      taxAmount: num(t.taxAmount),
      costOfGoodsSold: cogs,
      items: t.items.map((i) => ({
        subtotal: num(i.subtotal),
        vendorId: i.vendorId,
        coopSharePercent: i.coopSharePercent === null ? null : num(i.coopSharePercent),
      })),
    });

    await createEntry(client, {
      date: toDateKey(t.createdAt),
      description: `POS sale ${t.transactionNumber}`,
      source: 'POS_SALE',
      reference: t.transactionNumber,
      transactionId: t.id,
      createdById: t.cashierId,
      lines: await this.resolveSystemLines(client, lines),
    });
  }

  /** Reverses the sale entry of a transaction that was voided after posting. */
  private static async postVoid(client: Client, saleEntryId: string): Promise<void> {
    const sale = await client.journalEntry.findUnique({
      where: { id: saleEntryId },
      include: { lines: true, transaction: { select: { transactionNumber: true } } },
    });
    if (!sale) return;
    await createEntry(client, {
      date: todayDateKey(),
      description: `Void of POS sale ${sale.transaction?.transactionNumber ?? sale.reference ?? ''}`.trim(),
      source: 'POS_VOID',
      reference: sale.reference,
      reversesId: sale.id,
      lines: reverseLines(
        sale.lines.map((l) => ({ accountId: l.accountId, debit: num(l.debit), credit: num(l.credit), memo: l.memo }))
      ),
    });
  }

  /** Posts the over/short of a cash count. Balanced counts need no entry. */
  static async postCashCount(client: Client, reconciliationId: string): Promise<void> {
    const r = await client.cashReconciliation.findUnique({
      where: { id: reconciliationId },
      include: { cashier: { select: { name: true } } },
    });
    if (!r) return;
    const lines = buildCashCountEntryLines(num(r.variance));
    if (lines.length === 0) return;
    await createEntry(client, {
      date: dbDateToDateKey(r.businessDate),
      description: `Cash ${r.status === 'OVER' ? 'overage' : 'shortage'} – ${r.cashier.name}`,
      source: 'CASH_COUNT',
      cashReconciliationId: r.id,
      createdById: r.recordedById,
      lines: await this.resolveSystemLines(client, lines),
    });
  }

  /**
   * Brings the ledger up to date with its source documents: posts completed
   * sales and cash over/shorts that have no entry yet, and reverses sales that
   * were voided after posting. Idempotent; unique constraints make concurrent
   * runs safe.
   */
  static async syncPendingPostings(): Promise<SyncResult> {
    await this.ensureChartOfAccounts();
    const result: SyncResult = { salesPosted: 0, voidsReversed: 0, cashCountsPosted: 0 };

    const run = async (fn: (tx: Prisma.TransactionClient) => Promise<void>) => {
      try {
        await prisma.$transaction(fn);
        return true;
      } catch (e) {
        if (isUniqueViolation(e)) return false; // posted by someone else meanwhile
        throw e;
      }
    };

    const unpostedSales = await prisma.transaction.findMany({
      where: { status: 'COMPLETED', journalEntry: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const t of unpostedSales) {
      if (await run((tx) => this.postSaleTransaction(tx, t.id))) result.salesPosted++;
    }

    const voidedPosted = await prisma.journalEntry.findMany({
      where: { source: 'POS_SALE', reversedBy: null, transaction: { status: 'VOIDED' } },
      select: { id: true },
    });
    for (const e of voidedPosted) {
      if (await run((tx) => this.postVoid(tx, e.id))) result.voidsReversed++;
    }

    const unpostedCounts = await prisma.cashReconciliation.findMany({
      where: { journalEntry: null, NOT: { variance: 0 } },
      select: { id: true },
    });
    for (const r of unpostedCounts) {
      if (await run((tx) => this.postCashCount(tx, r.id))) result.cashCountsPosted++;
    }

    return result;
  }
}
