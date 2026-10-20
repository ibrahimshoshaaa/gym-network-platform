# GYMBANK client demonstration

Interactive offline demonstration reusing the actual React Dashboard, trainee, gym owner, cashier, branch manager and admin portals from `apps/web/components`. Production files and backend are unchanged. A demo role launcher and separate proposed-feature screen wrap the existing UI.

## Build

With repository dependencies installed, run `node tools/client-demo/build.mjs` from the repository root. This uses esbuild supplied through the existing tsx development dependency. Set `DEMO_OUTPUT` to choose an output directory (default `/tmp/gymbank-client-demo`). Open generated `index.html` or serve that directory. The generated HTML, JS, CSS, fonts and approved brand assets form a dependency-free static Figma Make import. No environment files, credentials or backend code are included.

## Supported demonstration

- Switch between five roles; explore existing portal navigation.
- Browse/search branches and open branch details.
- Show a synthetic, non-production entry QR.
- Trainee topup quote → local receipt → review → submission. Switch to admin and approve the submitted topup, then return to trainee to see the updated points. All data is local memory; refreshing resets it.
- Cashier sale quote → confirmation updates the trainee balance and branch stock.
- Gym inventory transfer and withdrawal request forms use demo responses.
- Admin overview and finance display illustrative data. Totals are sample snapshots, not accounting reconciliation.
- Proposed favorites, visit rating and weekly goal controls are a separate exploratory screen. They are not production features.

The simulator is intentionally limited. Unsupported writes return an error; camera attendance, real payment, external messaging and comprehensive admin editing are not implemented. Generic list endpoints may show empty states. Uploaded receipts are local blob URLs and never leave the browser. No real login is required.

Validation: `node --import ./apps/web/node_modules/tsx/dist/loader.mjs tools/client-demo/check.mts` checks delayed topup credit, approval once, role sharing, cashier credit and external-fetch isolation. The bundle build also checks imported source resolution. Browser visual verification has not completed.

Figma file created: https://www.figma.com/make/D2azvUKDxW3Tor9mvbAGDH . Import blocked by HTTP 405 from the Figma-provided archive upload endpoint. No imported preview or published site is claimed.
