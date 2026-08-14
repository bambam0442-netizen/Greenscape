# GreenScape v0.3.9 — Selective Clean Slate

This build adds the first practical cleanup pass before landscape design while preserving the v0.3.8 exact-canvas geometry workflow.

Changes:
- The Clean tab now supports touch-friendly brush selection directly over the property photo.
- Paint Selection can mark one object, several separate objects, or every area the designer wants removed.
- Erase Selection, adjustable brush size, Undo Brush, and Clear Selection make the mask editable before committing a cleanup.
- Remove Selected sends only the painted mask to the existing high-fidelity image edit pipeline with conservative cleanup instructions.
- Successful cleanup becomes the new working base image used by plant placement, Export Layout PNG, and final Render Design.
- Multiple cleanup passes are supported; Undo Clean restores the previous cleaned base and Reset to Original restores the untouched uploaded photo.
- Existing plant overlays are hidden while Clean Slate is active so the user can target the original landscaping clearly.
- The OpenAI browser key manager and v0.3.8 plant geometry/render locks remain intact.

Acceptance target: the user can selectively remove one shrub, multiple shrubs, or other marked landscape clutter without asking GreenScape to redesign the surrounding house or hardscape, then continue designing on the cleaned base image.

## Product direction

The long-term boundary between GreenScape and GreenRoute, including future irrigation and outdoor-lighting design responsibilities and the eventual design-to-operations handoff, is documented in [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md).
