# GreenScape v0.3.9.3 — Clean Slate + Hard Instance Render

This branch now contains two field-driven fidelity protections layered on top of the proven v0.3.8 exact-canvas geometry baseline.

## Clean Slate

- Touch-friendly Paint Selection and Erase Selection directly over the property photo.
- Adjustable brush size, Undo Brush, Clear Selection, Undo Clean, and Reset to Original.
- The selected cleanup region is converted into a hard binary edit mask.
- GreenScape removes the selected object pixels before the image-edit request and gives the model a small generation-only context halo so it can reconstruct hidden wall, bed, gravel, lawn, siding, and hardscape surfaces.
- The returned cleanup is composited back onto the untouched working image and AI pixels are accepted only inside the exact user-painted region.
- Multiple cleanup passes remain supported and the cleaned result becomes the working base for plant placement, export, and final rendering.

## v0.3.9.3 hard plant-instance render

Tablet field testing showed that one multi-plant image-edit request could still reinterpret an alternating layout, merge neighboring specimens, or swap identities even when the placement manifest was explicit.

v0.3.9.3 changes the render path so each measured P-number is rendered as its own isolated edit:

- The existing placement manifest is parsed server-side into individual plant instances.
- The exact plant edit mask is partitioned among those measured instances.
- Each P-number gets its own image-edit request with a single-instance identity, center, size, order, orientation, and footprint lock.
- Only that instance's exact mask pixels are accepted from its result.
- All completed instance patches are hard-composited back onto the exact editor frame.
- Neighboring specimens therefore cannot merge into one generated plant, cross into another plant's footprint, or create extra designed plants outside their own masks.
- The v0.3.8 camera/framing geometry remains unchanged.
- Clean Slate remains on its separate cleanup path.

Because the strict render performs one image edit per proposed plant, it is intentionally slower and uses more image-generation calls than the earlier single-pass renderer. Exact instance fidelity is the priority for this test branch.

## OpenAI key handling

- The browser-local key remains hidden and is never written into the repository.
- Protected previews have a local/session fallback for key storage.
- The key entered on the tablet takes priority over any stale deployment environment key.
- The floating key indicator now stays synchronized when the app saves or clears the key, including when the render flow prompts for it directly.

## Current merge gate

Before merging PR #6:

1. Remove one shrub with Clean Slate and verify believable reconstruction with no dark blob or ghost.
2. Remove several separate objects and perform a second cleanup pass.
3. Place an alternating multi-plant layout and render it.
4. Confirm every proposed instance remains the correct species/cultivar cue, left-to-right order, center, approximate size, and separate footprint.
5. Confirm no extra designed plants appear and neighboring plants do not merge.
6. Confirm the key button shows **OpenAI Key ✓** after a key has been saved or used.

Production remains unchanged until these field checks pass.

## Product direction

The long-term boundary between GreenScape and GreenRoute, including future irrigation and outdoor-lighting design responsibilities and the eventual design-to-operations handoff, is documented in [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md).
