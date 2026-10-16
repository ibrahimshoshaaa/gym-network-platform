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
