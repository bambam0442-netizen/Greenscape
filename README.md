# GreenScape v0.3.9.2 — Clean Slate Reconstruction

This patch advances the v0.3.9 Selective Clean Slate workflow after field testing proved the hard mask contained edits correctly but the reconstructed background could still collapse into dark shrub-shaped blobs.

Changes:
- The Clean tab still supports touch-friendly brush selection directly over the property photo.
- Paint Selection can mark one object, several separate objects, or every area the designer wants removed.
- Erase Selection, adjustable brush size, Undo Brush, and Clear Selection remain available before committing a cleanup.
- GreenScape converts the painted region into a binary final-composite mask so AI pixels are accepted only inside the user's exact painted selection.
- The image model now receives a small generation-only halo around the selection. This gives it nearby stone courses, bed lines, lawn edges, and other context to reconstruct surfaces cleanly without allowing the final result to leak outside the user's brush.
- The selected object's source pixels are removed from the image sent to the model, leaving a true transparent inpainting hole. This prevents the model from seeing and reproducing the original shrub/object as a dark silhouette.
- Clean Slate requests use GPT Image 2, while the already-proven v0.3.8 plant render path remains on its existing model.
- The cleanup prompt now explicitly requires complete surface continuation and rejects dark silhouettes, muddy blobs, ghost objects, blur patches, and empty placeholders.
- After the AI cleanup returns, GreenScape composites the result back onto the untouched working frame and accepts AI pixels only inside the user's painted selection.
- Successful cleanup remains the new working base image used by plant placement, Export Layout PNG, and final Render Design.
- Multiple cleanup passes remain supported; Undo Clean restores the previous cleaned base and Reset to Original restores the untouched uploaded photo.
- Existing plant overlays remain hidden while Clean Slate is active so the user can target the original landscaping clearly.
- The OpenAI browser key manager and v0.3.8 exact-canvas plant geometry/render locks remain intact.

Field-test candidate: paint one existing shrub and remove it. The object should disappear into a believable continuation of the surfaces behind it, with no dark silhouette or blob, while every unselected architectural and landscape pixel remains protected. Repeat with several selected objects and with a second cleanup pass before merge.

## Product direction

The long-term boundary between GreenScape and GreenRoute, including future irrigation and outdoor-lighting design responsibilities and the eventual design-to-operations handoff, is documented in [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md).
