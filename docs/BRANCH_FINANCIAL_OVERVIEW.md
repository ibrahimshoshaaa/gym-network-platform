# Branch financial overview

Owners can open an active branch using its name or “تشغيل الفرع”. The web and Flutter branch workspace displays:

- Current branch-attributed available entitlement, confirmed visit earnings, withdrawals already paid or committed, and disputed visit funds.
- Today / last 30 calendar days visit summary, including cancellations, net visit points and net visit receivables.
- Address, city/governorate, contact phone and opening hours.
- Existing branch point stock, visit price/session length, attendance, point sales and record navigation.

The current monetary entitlement remains all-time when the visit-period filter changes. “Committed” includes paid withdrawals as well as requests that consume entitlement; it must not be presented as pending withdrawals only. Available entitlement is capped by the gym's cash balance. Legacy unattributed withdrawals retain the existing conservative warning. Period net amounts use the existing report's event-date convention: visits during the period minus cancellations executed during the period.

This change reads existing authorized endpoints; it adds no ledger writes, migrations, new financial calculations or permissions. Ordinary cashiers do not request the new financial section. Owners and staff with full access or REQUEST_WITHDRAWAL use the existing branch entitlement authorization. Errors render independently, with retry, without presenting a failed amount as zero.

Validation: web TypeScript and unit tests; browser test exercises distinct balances for two branches and no horizontal overflow; Flutter widget tests exercise financial scope and ordinary-cashier exclusion. CI runs full web/browser and native analysis/tests before merge.
