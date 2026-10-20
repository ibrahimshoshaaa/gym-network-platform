# Campaign carousel and optional copy

Web and native campaign placements show one slide with swipe/dot navigation and four-second automatic rotation. Rotation pauses while interacting; users can pause it explicitly. Poster artwork uses contain sizing. Empty title/body fields do not leave text or branding placeholders beneath the poster. Ads without an image can still use a title or description.

Migration `202610200007_campaign_optional_copy` must be applied before deploying the API change. It permits empty title/body strings while preserving maximum lengths and requiring at least a poster or nonblank copy. Existing rows and campaigns are unchanged. Take a restore branch of the verified live Neon database and rehearse/apply the exact SQL with its Prisma checksum before merge. No financial tables are touched.

In-account notification titles fall back to a generic announcement label when the title is omitted. Delivery remains audience/schedule/status restricted. Up to 25 matched ads can rotate in a slot rather than only three. No real campaign is created or modified during verification.

Validation includes API schema tests, full PostgreSQL migrations and browser poster-only publication/rotation/manual navigation, plus Flutter four-second rotation/swipe/pause/disposal tests.
