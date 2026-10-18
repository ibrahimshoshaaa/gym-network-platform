# Approved decisions

## 2026-10-17 — D02 revised: trainee passwords, contact verification deferred

Approved by the project owner in the Work conversation:
“ممكن نخلي تسجيل دخول المتدرب ب رقم و ايميل و باسورد و التحقق نسيبه بعدين”.

- Trainee self-registration collects name, phone, email and password.
- The implemented login accepts either email or phone, plus password.
- Email OTP and/or phone OTP are postponed. No SMS, email provider, Firebase
  project, paid account or fixed test verification code is required now.
- Email/phone ownership stays unverified (`emailVerifiedAt` and
  `phoneVerifiedAt` remain null). A successful password login does not verify
  either contact. Future verification must use an actual proof of possession.
- Public signup always creates a TRAINEE and an empty points wallet. It cannot
  grant admin/staff roles, verify contact details or add points.
- This updates the earlier phone-OTP-first requirement D02. It does not change
  staff/admin onboarding, financial approvals, or the decision to keep real-money
  operation pending the remaining reviews. No other open decision is resolved.

Implementation details and test scope: [PASSWORD_AUTH.md](PASSWORD_AUTH.md).

## 2026-10-17 — Configurable pricing, gym redemption and manual channels

Project owner confirmed that the platform owner sets point price, gym stock
purchase discount and the ratio for gyms selling/redeeming points to the platform.
The redemption ratio is independent of the stock purchase discount. No commercial
values are approved as fixed defaults. Rates apply prospectively and operational
records retain the rate used at creation.

The platform owner controls InstaPay and wallet destination identifiers and
account names. Receipt images use the owner's Cloudinary account once server
credentials are configured. Transfers remain manually reviewed, with independent
confirmation of received funds before issuance. See [TOPUPS.md](TOPUPS.md).

## 2026-10-17 — O01 resolved: one financial wallet per gym

The owner selected “محفظة واحدة للجيم” with branch-level details, rather than a
separate monetary wallet per branch. Each visit stores its hosting branch;
receivables aggregate into the hosting gym's accounts. Branch point inventories
remain independent. Migration and operational details: [CASHIER_VISITS.md](CASHIER_VISITS.md).


## Phone-based direct point topups and gym wallet

The platform owner can credit a trainee or an accepted active gym owner by exact mobile number, with recipient name review and explicit confirmation of collected funds. Gym owner sends are sales at the current retail point price, with received-money confirmation (owner decision, 2026-10-18). Wallet PIN is deferred.

The gym wallet aggregates existing branch stocks; sending automatically consumes only active, price-approved branch inventories in the selected gym. Frozen branch points remain in the displayed total. Historical stock accounts and postings remain intact. A sale belongs to the gym rather than a fictitious single branch. Admin gym funding credits one eligible real branch internally. Every dispatch is immutable, idempotent and linked to its balanced ledger and policy snapshot. Admin dispatch collections join platform receipts; gym sales do not double count platform receipts. Transfer references are shared with existing reviewed topups to reject duplicate collection references.
