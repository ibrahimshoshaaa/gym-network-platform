# Booking user interfaces
The web and Flutter apps now expose scheduled reservation, explicit policy acceptance, booking history/cancellation, short-lived booking QR display and gym scan/paste confirmation. Bookings retain their stored policy. The existing walk-in workflow remains available separately.

Trainees enter through gym details -> reserve -> choose date/time (device timezone) -> accept displayed grace deadline and no-show policy -> confirm -> My bookings. The My bookings destination replaces the personal QR destination in the five-tab trainee navigation; historical attended visits remain separate.
The QR contains a gymbooking: prefix so it cannot be mistaken for the legacy walk-in token. QR display only opens during the arrival window, hides after expiry, and refreshes explicitly. Native QR clears when backgrounded. Both scan interfaces provide a paste fallback and show settlement success only after the server responds.

Platform administrators can open Bookings and attendance policy from the web Requests section, or sign in to the native booking administration screen. The native bridge allows only the exact booking admin operations; authorization is still checked by the backend. Broader platform tools remain on the web.
Manual decisions require a reason and distribution. Automatic policy supports full refunds, full gym allocation, trainee/gym splits and gym/platform splits.

Creation uses existing financial-command retry handling: the web form locks while a result is uncertain, and native requests persist the same idempotency envelope. Booked points are already excluded from available wallet balance. Booking cards display saved deadlines and terminal allocations.
The backend list enriches names with batched branch/user lookups rather than per-card requests.

Validation: web unit/SSR tests cover strict token separation, deadline boundaries, gateway methods and scan affordances. Flutter widget tests cover cancellation and scan paste submission, plus administrator policy publication. GitHub CI performs typecheck/build and database/browser tests, and Flutter analysis/tests.
No deployment or merge is performed by this change. A scheduled no-show worker is still pending; currently due processing happens on booking reads or explicit administrator processing. Physical camera permission behavior and visual appearance on actual devices require manual review; CI does not substitute for that.
