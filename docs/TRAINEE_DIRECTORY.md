# Trainee branch directory

The signed-in trainee web workspace now provides a directory of participating branches, with current approved visit points/session duration, business address, opening hours, business contact phone and an optional external map link. This is discovery, not a booking or visit-confirmation endpoint. Flutter, gym photos, nearby-distance search and an embedded map remain future work.

## Eligibility and privacy

Both listing and detail use the same server-side conditions on every request:

- Active branch and gym; accepted, active owner.
- Positive approved branch pricing version, recorded approval time, positive visit points and session duration. Pending price proposals do not replace the current approved values.
- Nonempty trimmed address, governorate and city; non-null coordinates inside geographic bounds.

An unavailable/nonexistent branch returns the same `NOT_FOUND` detail result. Suspension, owner deactivation, missing location or withdrawn pricing approval removes it from discovery. The directory does not guarantee that a branch is physically open, a cashier is present, the trainee has enough valid points, or global commercial settings allow visit posting. The existing QR/cashier workflow rechecks operational eligibility, pricing and balance at entry.

Directory access requires an active authenticated TRAINEE account. Contact verification remains deferred as approved; the directory does not mark contacts as verified. No ownership/assignment is needed to discover branches across participating gyms. Other account roles and anonymous requests are denied.

The response projection includes only branch/gym business information. Business phone comes from the branch, falling back to the gym's configured business contact; it never comes from the owner's identity. Owner/staff IDs, personal phone/email, stock, receivables, ledger postings, receipt/payment details and credentials are not selected or returned.

## API and search

- GET `/directory/branches`: optional `q`, `governorate`, `city`, `limit`, `cursor`.
- GET `/directory/branches/:branchId`: fresh eligible branch details and snapshot time.

Search matches a literal case-insensitive substring of branch/gym name. Governorate/city match the full case-insensitive stored value. Text is trimmed and limited to 80 characters; control characters and unknown/private filters are rejected. Percent signs, underscores, backslashes and quotes are literal data, not SQL wildcard syntax. Arabic spelling/diacritic variants are not normalized automatically.

The list defaults to 12, supports up to 50 rows and uses ascending UUID keyset pagination. It is not ranked by distance or alphabet. Requests/pages are independent live snapshots: updates during browsing can change later pages. Each response is private/non-cacheable. Listing/detail share a 60-request/15-minute per-user limit. Read transactions use repeatable-read snapshots with a five-second statement timeout and ten-second transaction timeout. No schema migration, point issuance, money movement or visit is created.

The web gateway explicitly allows only these two GET routes. Its directory query bound is 2,048 URL characters so encoded Arabic filters fit; other route bounds remain unchanged.

## UI and external links

The Arabic directory provides name/location filters, applied-query labels, refresh, paginated branch cards and a detail dialog. Detail loading revalidates the selected branch; unavailable details hide the prior price/contact/map rather than reusing a stale card. Opening hours are free text provided by the gym, with an explicit fallback when absent.

The map button opens a fixed OpenStreetMap URL from validated branch coordinates, only after the trainee clicks. It uses a new tab with no opener/referrer. There is no map SDK, embedded third-party request or trainee location collection. Phone links are generated only for valid E.164 business numbers. Free text renders as text; it is not interpreted as HTML.

## Validation

Coverage checks search input/limits, signed-in role and inactive-account handling, business-only response fields, visibility conditions, literal special-character search, filters/keyset pages, live detail price/visibility refresh, map/phone URL validation, explicit gateway routes and the full authenticated HTTP discovery → detail → suspend/hide → reactivate flow against disposable PostgreSQL. API/web typechecks and production builds run in CI. No visual browser, real-world address accuracy or external map availability is claimed.
