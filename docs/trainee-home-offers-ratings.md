# Trainee home, local branch offers and visit ratings

The native trainee home follows this order: GymBank balance/header (top-up, QR, notifications and history), nearby branch cards, platform campaigns plus approved nearby branch offers, then recent visits. Workplace access remains available to trainees who also have staff assignments. Web changes are limited to platform administration and authenticated API proxies.

Location is requested through the existing device permission flow. Without permission the wallet and QR still work, and the home offers location retry and manual gym discovery; it does not label arbitrary branches as nearby. Nearby branch offers require coordinates and are restricted by the administrator's configured radius and publication window. Platform HOME campaigns remain visible independently of location.

## Branch advertisements

Owners and actively assigned branch managers may submit a branch advertisement with an optional uploaded poster. Cashiers cannot submit advertisements. The platform administrator reviews the request, rejects it or quotes its fee, publication dates and radius (1–100 km, default 20 km). Publication requires acceptance by the owner or a manager with full approval delegation. A new quote clears any prior acceptance. The accepted advertisement appears only during its scheduled window and only while its branch remains publicly eligible. Administrators can pause it; authorized requesters/owners can withdraw it.

The fee is a quoted administrative charge; this release does not debit points, create a payment or claim that an invoice was paid. Settlement of advertisement charges remains outside the application.

## Ratings

The trainee may submit or edit a 1–5 star rating only for their own actual, non-cancelled visit after its recorded expiry time. One rating is stored per visit, protected by an optimistic version and idempotent retries. An elapsed visit may be rated even if the session sweeper has not yet changed its stored ACTIVE status. Cancelled visits do not contribute to branch averages. Branch cards show real rating averages/counts; unrated branches have no invented score. Rating does not change financial records.

## Deployment

Apply the additive Prisma migration `202610210003_home_offers_ratings` before deploying this backend or building the updated app. It adds PromotionRequest, PromotionImage and VisitRating, their indexes, constraints and restricted-runtime grants. Run the usual Prisma migration deployment using the migration owner, then deploy the API/admin web and publish a new mobile build. No new service secrets are required; poster uploads reuse existing Cloudinary configuration.
