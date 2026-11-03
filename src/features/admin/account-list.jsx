import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, UserBlock01Icon } from '@hugeicons/core-free-icons';
import { AccountActions } from '@/features/admin/account-actions';

const ROLE_WORDS = { PATIENT: 'Patient', ADMIN: 'Administrator' };

// Each status has a word and an icon, so it never shows by color alone
const STATUSES = {
  ACTIVE: { word: 'Active', icon: CheckmarkCircle02Icon },
  SUSPENDED: { word: 'Suspended', icon: UserBlock01Icon },
};

// The day the account was made, in the admin's own zone
function formatJoinDate(createdAt, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone }).format(
    new Date(createdAt),
  );
}

// FR14 Each account with its role, status and join date, and never any medical data
export function AccountList({ accounts, timeZone, onChanged, onRemoved }) {
  return (
    <ul className="flex flex-col gap-3">
      {accounts.map((account) => (
        <li key={account.id}>
          <div
            role="group"
            aria-labelledby={`account-${account.id}`}
            className="flex flex-col gap-4 rounded-xl border border-border p-4"
          >
            <div className="flex flex-col gap-1">
              <p id={`account-${account.id}`} className="text-xl font-bold wrap-break-word">
                {account.name}
              </p>
              <p className="wrap-break-word">{account.email}</p>
              <p>{ROLE_WORDS[account.role]}</p>
              <p className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={STATUSES[account.status].icon}
                  aria-hidden="true"
                  className="shrink-0"
                />
                {STATUSES[account.status].word}
              </p>
              <p>
                Joined{' '}
                <time dateTime={account.createdAt}>
                  {formatJoinDate(account.createdAt, timeZone)}
                </time>
              </p>
            </div>
            {/* Admin accounts cannot be changed here, so they get no buttons */}
            {account.role === 'PATIENT' && (
              <AccountActions account={account} onChanged={onChanged} onRemoved={onRemoved} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
