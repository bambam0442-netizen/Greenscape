# GreenScape v0.3.9.1 — Hard Clean Mask

This patch hardens the v0.3.9 Selective Clean Slate workflow after field testing showed that the image model could alter unselected parts of the property photo.

Changes:
- The Clean tab still supports touch-friendly brush selection directly over the property photo.
- Paint Selection can mark one object, several separate objects, or every area the designer wants removed.
- Erase Selection, adjustable brush size, Undo Brush, and Clear Selection remain available before committing a cleanup.
- Before the cleanup request is sent, GreenScape converts the painted region into a binary edit mask so the image model receives an unambiguous selected area.
- After the AI cleanup returns, GreenScape composites the result back onto the untouched working frame and accepts AI pixels only inside the user's painted selection.
- Unselected windows, siding, porch details, lawn, hardscape, and other property content cannot be semantically replaced by the AI cleanup result.
- Successful cleanup remains the new working base image used by plant placement, Export Layout PNG, and final Render Design.
- Multiple cleanup passes remain supported; Undo Clean restores the previous cleaned base and Reset to Original restores the untouched uploaded photo.
- Existing plant overlays remain hidden while Clean Slate is active so the user can target the original landscaping clearly.
- The OpenAI browser key manager and v0.3.8 exact-canvas plant geometry/render locks remain intact.

Acceptance target: paint only one existing shrub and remove it without changing any unselected architectural or landscape content elsewhere in the frame. Repeat with several selected objects and with a second cleanup pass.

## Product direction

The long-term boundary between GreenScape and GreenRoute, including future irrigation and outdoor-lighting design responsibilities and the eventual design-to-operations handoff, is documented in [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md).
