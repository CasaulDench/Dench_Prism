'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { createAccountAction, updateAccountAction } from '@/actions/accountingActions';
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  AccountSubtype,
  CODE_RANGES_HELP,
  SUBTYPES_BY_TYPE,
  SUBTYPE_LABELS,
  validateAccountInput,
} from '@/lib/accounting/chartOfAccounts';
import { formatAsOf } from '@/lib/accounting/periods';
import type { AccountView } from '@/services/accountingService';
import { Amount } from './Statements';
import styles from '../page.module.css';

interface Props {
  accounts: AccountView[];
  /** Balance per account id, in its normal direction, as of `asOf`. */
  balances: Record<number, number>;
  asOf: string;
}

type Editing = { mode: 'create' } | { mode: 'edit'; account: AccountView } | null;

export default function AccountsTab({ accounts, balances, asOf }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [showInactive, setShowInactive] = useState(false);

  const visible = accounts.filter((a) => showInactive || a.isActive);
  const inactiveCount = accounts.length - accounts.filter((a) => a.isActive).length;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Chart of Accounts</h2>
          <p className={styles.cardSubtitle}>
            {accounts.length} accounts · balances as of {formatAsOf(asOf)} · {CODE_RANGES_HELP}
          </p>
        </div>
        <div className={`${styles.actions} ${styles.noPrint}`}>
          {inactiveCount > 0 && (
            <button className={styles.secondaryBtn} onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? 'Hide' : 'Show'} inactive ({inactiveCount})
            </button>
          )}
          <button className={styles.primaryBtn} onClick={() => setEditing({ mode: 'create' })}>
            + New Account
          </button>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th>Group</th>
              <th className={styles.num}>Balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ACCOUNT_TYPES.map((type) => {
              const rows = visible.filter((a) => a.type === type);
              if (rows.length === 0) return null;
              return [
                <tr key={type} className={styles.groupRow}>
                  <td colSpan={5}>
                    {ACCOUNT_TYPE_LABELS[type]}{' '}
                    <span className={styles.muted}>· normal balance {type === 'ASSET' || type === 'EXPENSE' ? 'debit' : 'credit'}</span>
                  </td>
                </tr>,
                ...rows.map((a) => (
                  <tr key={a.id} className={a.isActive ? undefined : styles.inactiveRow}>
                    <td className={styles.strong}>{a.code}</td>
                    <td>
                      <div className={styles.strong}>
                        {a.name}{' '}
                        {a.systemKey && (
                          <span className={`${styles.badge} ${styles.badgeSystem}`} title="Posted to automatically by the POS / cash counts">
                            Auto
                          </span>
                        )}{' '}
                        {!a.isActive && <span className={`${styles.badge} ${styles.badgeInactive}`}>Inactive</span>}
                      </div>
                      {a.description && <div className={styles.muted}>{a.description}</div>}
                    </td>
                    <td className={styles.muted}>{SUBTYPE_LABELS[a.subtype]}</td>
                    <td className={styles.num}>
                      <Amount value={balances[a.id] ?? 0} />
                    </td>
                    <td className={`${styles.num} ${styles.noPrint}`}>
                      <button className={styles.linkBtn} onClick={() => setEditing({ mode: 'edit', account: a })}>
                        Edit
                      </button>
                    </td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <AccountModal
          key={editing.mode === 'edit' ? editing.account.id : 'new'}
          editing={editing}
          existingCodes={accounts.map((a) => a.code)}
          balance={editing.mode === 'edit' ? balances[editing.account.id] ?? 0 : 0}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AccountModal({
  editing,
  existingCodes,
  balance,
  onClose,
}: {
  editing: NonNullable<Editing>;
  existingCodes: string[];
  balance: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const account = editing.mode === 'edit' ? editing.account : null;

  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [subtype, setSubtype] = useState<AccountSubtype>(account?.subtype ?? 'OPERATING_EXPENSE');
  const [description, setDescription] = useState(account?.description ?? '');
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      const p = validateAccountInput({ code, name, subtype, description }, existingCodes);
      if (p) return setProblem(p);
    } else if (!name.trim()) {
      return setProblem('Account name is required.');
    }
    setProblem(null);

    startTransition(async () => {
      const res = account
        ? await updateAccountAction(account.id, { name, description, isActive })
        : await createAccountAction({ code, name, subtype, description });
      if (res.success) {
        success(res.message ?? 'Saved.');
        onClose();
        router.refresh();
      } else {
        setProblem(res.error ?? 'Something went wrong.');
        error(res.error ?? 'Something went wrong.');
      }
    });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <form className={styles.modalContent} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{account ? `Edit ${account.code} ${account.name}` : 'New Account'}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <label className={styles.formGroup}>
              <span className={styles.formLabel}>Code</span>
              <input
                className={styles.formInput}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="e.g. 6070"
                inputMode="numeric"
                disabled={!!account}
                autoFocus={!account}
              />
            </label>
            <label className={styles.formGroup}>
              <span className={styles.formLabel}>Group</span>
              <select
                className={styles.formInput}
                value={subtype}
                onChange={(e) => setSubtype(e.target.value as AccountSubtype)}
                disabled={!!account}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <optgroup key={t} label={ACCOUNT_TYPE_LABELS[t]}>
                    {SUBTYPES_BY_TYPE[t].map((s) => (
                      <option key={s} value={s}>
                        {SUBTYPE_LABELS[s]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.formGroup}>
            <span className={styles.formLabel}>Name</span>
            <input
              className={styles.formInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus={!!account}
            />
          </label>
          <label className={styles.formGroup}>
            <span className={styles.formLabel}>Description (optional)</span>
            <input className={styles.formInput} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {account && (
            <label className={styles.formGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={!!account.systemKey}
              />
              <span className={styles.formLabel}>Active</span>
              <span className={styles.note}>
                {account.systemKey
                  ? 'Used by automatic postings; always active.'
                  : balance !== 0
                    ? 'Has a balance; bring it to zero before deactivating.'
                    : 'Inactive accounts cannot receive new entries.'}
              </span>
            </label>
          )}
          {account && <p className={styles.note}>Code and group are fixed once an account exists, so past statements stay consistent.</p>}
          {problem && <p className={styles.errorText}>{problem}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={isPending}>
            {isPending ? 'Saving…' : account ? 'Save changes' : 'Create account'}
          </button>
        </div>
      </form>
    </div>
  );
}
