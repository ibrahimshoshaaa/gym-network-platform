# Service presets and included facilities

Platform admin → Services and marketplace → Service presets and facilities manages stable IDs, Arabic/English labels, categories and availability. IDs and kinds cannot change. Disable rather than delete; existing branch selections and approved services remain valid.

Gym owner → branch → Services: choose a preset, then submit its points, duration and optional daily hours (Africa/Cairo) for existing admin price review. Null service hours use the branch booking hours. For multiple selected services, the complete visit must fit all selected service windows and the branch window. Existing free-text services remain editable with their original name. New mobile service forms require a preset.

Included facilities use multi-select chips on the same branch services screen, with a separate Save facilities action. They describe what is included with the visit and do not have a separate price or booking. The learner sees them separately in branch details. A sauna can therefore be an included facility or a separately bookable service, depending on the branch offering.

Apply the additive Prisma migrations before deploying the new API. They seed 23 bookable service presets and 33 included facility choices, preserve existing rows, and grant the existing restricted runtime role access to the new catalog. No prices, balances or financial postings are created by the catalog.
