# GreenScape v0.3.8 — Exact Canvas Geometry

This build fixes the editor-to-render geometry mismatch exposed during v0.3.7 field testing.

Changes:
- The design canvas now uses an image-model-native 3:2 landscape frame on tablet/desktop and 2:3 portrait frame on narrow screens so the render service does not silently change aspect ratio after the layout is measured.
- GreenScape now crops the original jobsite photo to the exact `object-fit: cover` frame visible in the editor before building the AI render request.
- Each placed plant's actual on-screen image rectangle is measured directly from the editor DOM at render/export time.
- The measured center, width, height, and bounding box are the single source of truth for the reference composite, edit mask, placement manifest, and exported layout.
- Plant geometry no longer uses a separate `min(width,height)` sizing formula that could disagree with what the designer saw on screen.
- Export Layout PNG now uses the same crop and measured plant geometry as the render pipeline.
- The v0.3.7 instance locks remain in place: exact count/type, separated specimens, species/color/maturity preservation, and strict protected background pixels.
- The OpenAI browser key manager remains unchanged.

Acceptance target: the final photoreal result should keep the same visible property framing and closely match the size, spacing, and position of the plants actually shown in the GreenScape editor.

## Product direction

The long-term boundary between GreenScape and GreenRoute, including future irrigation and outdoor-lighting design responsibilities and the eventual design-to-operations handoff, is documented in [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md).
