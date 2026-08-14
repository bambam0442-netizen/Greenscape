# GreenScape / GreenRoute Product Direction

## Core product boundary

GreenScape and GreenRoute are intentionally separate products with different jobs.

### GreenScape = creative and design system
GreenScape owns the visual, design, planning, and customer-facing side of landscape work.

Current and future GreenScape responsibilities may include:
- Landscape concept design and photorealistic renderings.
- Plant selection, placement, revisions, and approved design records.
- Measured plans, material quantities, and customer-ready design packages.
- Irrigation design from aerial/satellite imagery, including approximate coverage plans, zones, valve/head layout, pipe routing, flow/pressure-aware recommendations, and estimated parts lists.
- Outdoor/landscape lighting design, including fixture placement, transformer/load planning, wire routing, approximate parts lists, and customer-facing lighting plans.
- Install notes and design instructions tied to the approved plan.

GreenScape should be able to prove what was designed, revised, and approved.

### GreenRoute = business and operations system
GreenRoute owns the structured execution and organization side of the business.

GreenRoute responsibilities may include:
- Customers and job records.
- Estimates/work orders and job status.
- Scheduling, mowing routes, crews, and daily workflow.
- Field notes, completion tracking, and operational history.
- Billing/invoicing-related workflow where appropriate.
- Receiving approved GreenScape plans as job documents/instructions.

GreenRoute should not become a creative or design application.

## Future handoff between the apps

Do not merge the apps or duplicate their responsibilities.

When integration is intentionally added later, it should primarily be a one-way design-to-operations handoff such as **Send to GreenRoute**. An approved GreenScape package could attach to the matching GreenRoute customer/job and include items such as:
- final landscape render or plan,
- irrigation plan and parts list,
- lighting plan and parts list,
- material quantities,
- install notes/instructions,
- revision/approval information.

GreenRoute should treat those items as controlled job documents and instructions, not as editable creative designs.

## Current rule

Until integration is explicitly approved, GreenScape and GreenRoute remain separate. Do not add routing, scheduling, customer syncing, calendars, or other GreenRoute operations features to GreenScape merely because they may eventually exchange job packages.
