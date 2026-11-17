'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/authGuard';
import { DailySalesService, DailySalesError, SubmitCashCountInput } from '@/services/dailySalesService';
import type { CashReconciliationFigures } from '@/lib/dailySales/calculations';
import { ActionResponse, actionSuccess, actionError } from '@/utils/response';

/** Readings and cash counts are supervisory tasks: managers and admins only. */
const SUPERVISOR_ROLES = ['ADMIN', 'MANAGER'] as const;

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof DailySalesError) return error.message;
  if (error instanceof Error && (error.name === 'ForbiddenError' || error.name === 'UnauthorizedError')) {
    return error.message;
  }
  // Prisma / connection errors: keep internals out of the UI, keep them in the log.
  console.error('[dailySalesActions]', error);
  if (error instanceof Error && error.name === 'PrismaClientInitializationError') {
    return 'Database is not connected. Readings and cash counts cannot be saved.';
  }
  return fallback;
}

export async function generateReadingAction(
  type: 'X' | 'Z',
  businessDate: string
): Promise<ActionResponse<{ readingNumber: number }>> {
  try {
    if (type !== 'X' && type !== 'Z') return actionError('Invalid reading type.');
    const user = await requireRole([...SUPERVISOR_ROLES]);
    const reading = await DailySalesService.generateReading(type, businessDate, user.id);
    revalidatePath('/daily-sales');
    return actionSuccess(
      { readingNumber: reading.readingNumber },
      `${type}-reading #${reading.readingNumber} generated for ${businessDate}.`
    );
  } catch (error: unknown) {
    return actionError(toMessage(error, `Failed to generate ${type}-reading.`));
  }
}

export async function submitCashCountAction(
  input: SubmitCashCountInput
): Promise<ActionResponse<CashReconciliationFigures>> {
  try {
    const user = await requireRole([...SUPERVISOR_ROLES]);
    const { figures, cashierName } = await DailySalesService.submitCashCount(input, user.id);
    revalidatePath('/daily-sales');
    const verdict =
      figures.status === 'BALANCED'
        ? 'balanced'
        : `${figures.status.toLowerCase()} by ₱${Math.abs(figures.variance).toFixed(2)}`;
    return actionSuccess(figures, `Cash count for ${cashierName} recorded: ${verdict}.`);
  } catch (error: unknown) {
    return actionError(toMessage(error, 'Failed to record cash count.'));
  }
}
