// src/services/dailySalesService.ts
import prisma from '@/lib/prisma';
import { Prisma, ReadingType } from '@prisma/client';
import { AuditService } from './auditService';
import {
  dayRange,
  dateKeyToDbDate,
  dbDateToDateKey,
  isValidDateKey,
  todayDateKey,
} from '@/lib/dailySales/businessDate';
import {
  SaleTransactionRow,
  DenominationCounts,
  cashSalesForCashier,
  computeReadingFigures,
  countDenominations,
  reconcileCash,
  toCents,
  validateDenominationCounts,
} from '@/lib/dailySales/calculations';

/** Money as stored: Decimal from cents, always 2dp. */
const dec = (pesos: number) => new Prisma.Decimal(toCents(pesos)).div(100);
const num = (d: Prisma.Decimal | null | undefined) => (d ? Number(d.toString()) : 0);

// ─── Serializable view models (safe to pass to client components) ────────────

export interface SalesReadingView {
  id: string;
  type: 'X' | 'Z';
  readingNumber: number;
  businessDate: string;
  generatedByName: string;
  createdAt: string;
  transactionCount: number;
  firstTransactionNo: string | null;
  lastTransactionNo: string | null;
  grossSales: number;
  netSales: number;
  taxAmount: number;
  voidCount: number;
  voidAmount: number;
  beginningGrandTotal: number;
  endingGrandTotal: number;
}

export interface CashReconciliationView {
  id: string;
  businessDate: string;
  cashierId: string;
  cashierName: string;
  recordedByName: string;
  openingFund: number;
  cashSales: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  status: 'OVER' | 'SHORT' | 'BALANCED';
  denominations: DenominationCounts;
  remarks: string | null;
  createdAt: string;
}

export interface CashierOption {
  id: string;
  name: string;
}

export interface SubmitCashCountInput {
  businessDate: string;
  cashierId: string;
  openingFund: number;
  denominations: DenominationCounts;
  remarks?: string;
}

/** Thrown for problems the user can fix; the message is safe to show. */
export class DailySalesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DailySalesError';
  }
}

function assertDateKey(key: string) {
  if (!isValidDateKey(key)) throw new DailySalesError(`Invalid business date '${key}'.`);
  if (key > todayDateKey()) throw new DailySalesError('Business date cannot be in the future.');
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

type Client = Prisma.TransactionClient | typeof prisma;

export class DailySalesService {
  /** Every transaction (completed and voided) rung up on a Manila business date. */
  static async getDayTransactions(dateKey: string, client: Client = prisma): Promise<SaleTransactionRow[]> {
    const { start, end } = dayRange(dateKey);
    const txs = await client.transaction.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'asc' },
      include: {
        cashier: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true, category: true } },
            vendor: { select: { name: true } },
          },
        },
      },
    });

    return txs.map((t) => ({
      transactionNumber: t.transactionNumber,
      createdAt: t.createdAt,
      cashierId: t.cashierId,
      cashierName: t.cashier.name,
      memberId: t.memberId,
      paymentMethod: t.paymentMethod,
      status: t.status,
      subtotal: num(t.subtotal),
      taxAmount: num(t.taxAmount),
      totalAmount: num(t.totalAmount),
      items: t.items.map((i) => ({
        productId: i.productId,
        productName: i.product.name,
        category: i.product.category,
        quantity: i.quantity,
        subtotal: num(i.subtotal),
        vendorId: i.vendorId,
        vendorName: i.vendor?.name ?? null,
        coopSharePercent: i.coopSharePercent === null ? null : num(i.coopSharePercent),
      })),
    }));
  }

  // ─── Sales readings ────────────────────────────────────────────────────────

  static async getReadings(dateKey: string): Promise<SalesReadingView[]> {
    const rows = await prisma.salesReading.findMany({
      where: { businessDate: dateKeyToDbDate(dateKey) },
      orderBy: { createdAt: 'desc' },
      include: { generatedBy: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      readingNumber: r.readingNumber,
      businessDate: dbDateToDateKey(r.businessDate),
      generatedByName: r.generatedBy.name,
      createdAt: r.createdAt.toISOString(),
      transactionCount: r.transactionCount,
      firstTransactionNo: r.firstTransactionNo,
      lastTransactionNo: r.lastTransactionNo,
      grossSales: num(r.grossSales),
      netSales: num(r.netSales),
      taxAmount: num(r.taxAmount),
      voidCount: r.voidCount,
      voidAmount: num(r.voidAmount),
      beginningGrandTotal: num(r.beginningGrandTotal),
      endingGrandTotal: num(r.endingGrandTotal),
    }));
  }

  /**
   * Generates and stores an X or Z reading for a business date.
   *
   * - X: snapshot of the day so far. Unlimited, never closes the day.
   * - Z: end-of-day reading. One per date (enforced by a unique column), and Z
   *   readings must be taken in date order, because each one carries the
   *   accumulated grand total forward from the previous Z.
   */
  static async generateReading(type: ReadingType, dateKey: string, userId: string) {
    assertDateKey(dateKey);
    const businessDate = dateKeyToDbDate(dateKey);

    try {
      return await prisma.$transaction(
        async (tx) => {
          const latestZ = await tx.salesReading.findFirst({
            where: { type: 'Z' },
            orderBy: { zDate: 'desc' },
          });

          if (type === 'Z' && latestZ?.zDate) {
            const latestKey = dbDateToDateKey(latestZ.zDate);
            if (latestKey === dateKey) {
              throw new DailySalesError(`Z-reading for ${dateKey} was already generated (Z #${latestZ.readingNumber}).`);
            }
            if (latestKey > dateKey) {
              throw new DailySalesError(
                `Cannot generate a Z-reading for ${dateKey}: a later Z-reading (${latestKey}) already exists.`
              );
            }
          }

          // Grand total carried in from the last Z *before* this date.
          const priorZ =
            latestZ?.zDate && dbDateToDateKey(latestZ.zDate) < dateKey
              ? latestZ
              : await tx.salesReading.findFirst({
                  where: { type: 'Z', zDate: { lt: businessDate } },
                  orderBy: { zDate: 'desc' },
                });
          const beginning = num(priorZ?.endingGrandTotal);

          const figures = computeReadingFigures(await this.getDayTransactions(dateKey, tx));
          const last = await tx.salesReading.findFirst({
            where: { type },
            orderBy: { readingNumber: 'desc' },
            select: { readingNumber: true },
          });

          const reading = await tx.salesReading.create({
            data: {
              type,
              readingNumber: (last?.readingNumber ?? 0) + 1,
              businessDate,
              zDate: type === 'Z' ? businessDate : null,
              generatedById: userId,
              transactionCount: figures.transactionCount,
              firstTransactionNo: figures.firstTransactionNo,
              lastTransactionNo: figures.lastTransactionNo,
              grossSales: dec(figures.grossSales),
              netSales: dec(figures.netSales),
              taxAmount: dec(figures.taxAmount),
              voidCount: figures.voidCount,
              voidAmount: dec(figures.voidAmount),
              beginningGrandTotal: dec(beginning),
              endingGrandTotal: dec(beginning + figures.grossSales),
            },
          });

          await AuditService.log(
            {
              userId,
              action: type === 'Z' ? 'SALES_Z_READING' : 'SALES_X_READING',
              entityType: 'SalesReading',
              entityId: reading.id,
              details: { businessDate: dateKey, readingNumber: reading.readingNumber, grossSales: figures.grossSales },
            },
            tx
          );

          return reading;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DailySalesError('Another reading was generated at the same moment. Refresh and try again.');
      }
      throw e;
    }
  }

  // ─── Cash count / over-short ───────────────────────────────────────────────

  static async getReconciliations(dateKey: string): Promise<CashReconciliationView[]> {
    const rows = await prisma.cashReconciliation.findMany({
      where: { businessDate: dateKeyToDbDate(dateKey) },
      orderBy: { createdAt: 'asc' },
      include: { cashier: { select: { name: true } }, recordedBy: { select: { name: true } } },
    });
    return rows.map(toReconView);
  }

  /** Most recent reconciliations across all dates — the over/short ledger. */
  static async getRecentReconciliations(limit = 30): Promise<CashReconciliationView[]> {
    const rows = await prisma.cashReconciliation.findMany({
      take: limit,
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
      include: { cashier: { select: { name: true } }, recordedBy: { select: { name: true } } },
    });
    return rows.map(toReconView);
  }

  /** Users who can be selected as the cashier on a cash count. */
  static async getCashiers(): Promise<CashierOption[]> {
    return prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  /**
   * Records a cashier's end-of-shift cash count. Expected cash is always
   * recomputed here from the database, never taken from the client.
   */
  static async submitCashCount(input: SubmitCashCountInput, recordedById: string) {
    assertDateKey(input.businessDate);

    if (!Number.isFinite(input.openingFund) || input.openingFund < 0) {
      throw new DailySalesError('Opening fund must be a number ≥ 0.');
    }
    const denomError = validateDenominationCounts(input.denominations);
    if (denomError) throw new DailySalesError(denomError);

    const remarks = input.remarks?.trim() || null;

    try {
      return await prisma.$transaction(async (tx) => {
        const cashier = await tx.user.findUnique({ where: { id: input.cashierId } });
        if (!cashier) throw new DailySalesError(`Cashier '${input.cashierId}' was not found.`);

        const rows = await this.getDayTransactions(input.businessDate, tx);
        const figures = reconcileCash({
          openingFund: input.openingFund,
          cashSales: cashSalesForCashier(rows, input.cashierId),
          countedCash: countDenominations(input.denominations),
        });

        if (figures.status !== 'BALANCED' && !remarks) {
          throw new DailySalesError(
            `Cash is ${figures.status.toLowerCase()} by ₱${Math.abs(figures.variance).toFixed(2)}. Remarks are required to explain the variance.`
          );
        }

        const record = await tx.cashReconciliation.create({
          data: {
            businessDate: dateKeyToDbDate(input.businessDate),
            cashierId: input.cashierId,
            recordedById,
            openingFund: dec(figures.openingFund),
            cashSales: dec(figures.cashSales),
            expectedCash: dec(figures.expectedCash),
            countedCash: dec(figures.countedCash),
            variance: dec(figures.variance),
            status: figures.status,
            denominations: input.denominations,
            remarks,
          },
        });

        await AuditService.log(
          {
            userId: recordedById,
            action: 'CASH_RECONCILIATION',
            entityType: 'CashReconciliation',
            entityId: record.id,
            details: { businessDate: input.businessDate, cashierId: input.cashierId, ...figures },
          },
          tx
        );

        return { record, figures, cashierName: cashier.name };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DailySalesError('This cashier has already been reconciled for that business date.');
      }
      throw e;
    }
  }
}

function toReconView(r: Prisma.CashReconciliationGetPayload<{
  include: { cashier: { select: { name: true } }; recordedBy: { select: { name: true } } };
}>): CashReconciliationView {
  return {
    id: r.id,
    businessDate: dbDateToDateKey(r.businessDate),
    cashierId: r.cashierId,
    cashierName: r.cashier.name,
    recordedByName: r.recordedBy.name,
    openingFund: num(r.openingFund),
    cashSales: num(r.cashSales),
    expectedCash: num(r.expectedCash),
    countedCash: num(r.countedCash),
    variance: num(r.variance),
    status: r.status as CashReconciliationView['status'],
    denominations: (r.denominations ?? {}) as DenominationCounts,
    remarks: r.remarks,
    createdAt: r.createdAt.toISOString(),
  };
}
