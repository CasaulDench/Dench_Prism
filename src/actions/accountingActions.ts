'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/authGuard';
import { AccountingService, AccountingError, ManualEntryInput } from '@/services/accountingService';
import type { AccountInput } from '@/lib/accounting/chartOfAccounts';
import { ActionResponse, actionSuccess, actionError } from '@/utils/response';

/** Bookkeeping is a supervisory task: managers and admins only. */
const ACCOUNTING_ROLES = ['ADMIN', 'MANAGER'] as const;

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof AccountingError) return error.message;
  if (error instanceof Error && (error.name === 'ForbiddenError' || error.name === 'UnauthorizedError')) {
    return error.message;
  }
  console.error('[accountingActions]', error);
  if (error instanceof Error && error.name === 'PrismaClientInitializationError') {
    return 'Database is not connected. Changes cannot be saved.';
  }
  return fallback;
}

const done = () => revalidatePath('/financial-reports');

export async function createAccountAction(input: AccountInput): Promise<ActionResponse<{ id: number }>> {
  try {
    const user = await requireRole([...ACCOUNTING_ROLES]);
    const account = await AccountingService.createAccount(input, user.id);
    done();
    return actionSuccess({ id: account.id }, `Account ${account.code} ${account.name} created.`);
  } catch (error) {
    return actionError(toMessage(error, 'Failed to create account.'));
  }
}

export async function updateAccountAction(
  id: number,
  patch: { name?: string; description?: string | null; isActive?: boolean }
): Promise<ActionResponse<null>> {
  try {
    const user = await requireRole([...ACCOUNTING_ROLES]);
    await AccountingService.updateAccount(id, patch, user.id);
    done();
    return actionSuccess(null, 'Account updated.');
  } catch (error) {
    return actionError(toMessage(error, 'Failed to update account.'));
  }
}

export async function createJournalEntryAction(input: ManualEntryInput): Promise<ActionResponse<{ number: number }>> {
  try {
    const user = await requireRole([...ACCOUNTING_ROLES]);
    const result = await AccountingService.createManualEntry(input, user.id);
    done();
    return actionSuccess(result, `Journal entry JE-${result.number} posted.`);
  } catch (error) {
    return actionError(toMessage(error, 'Failed to post journal entry.'));
  }
}

export async function reverseJournalEntryAction(
  entryId: string,
  date: string
): Promise<ActionResponse<{ number: number }>> {
  try {
    const user = await requireRole([...ACCOUNTING_ROLES]);
    const result = await AccountingService.reverseEntry(entryId, date, user.id);
    done();
    return actionSuccess(result, `Reversing entry JE-${result.number} posted.`);
  } catch (error) {
    return actionError(toMessage(error, 'Failed to reverse journal entry.'));
  }
}
