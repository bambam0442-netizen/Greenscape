# GreenScape v0.3.7 — Instance-Locked Placement Fidelity

This build keeps the proven v0.3.6 strict-mask workflow and tightens the final render around each individual placed specimen.

Changes:
- Render geometry now records an exact per-instance bounding box from the same cutout dimensions used in the reference layout.
- The placement manifest includes unique plant IDs, exact center coordinates, width/height, bounding box, editor scale, orientation, and left-to-right rank.
- The render prompt now locks exact plant count and count-by-type, not just species names.
- Adjacent plants are explicitly treated as separate instances; protected gaps between masks are hard separators and may not be bridged with foliage or shadows.
- Species/cultivar cues, flower/foliage color, maturity, and growth habit are explicitly preserved from the supplied cutout.
- Geometry fidelity is prioritized over artistic reinterpretation, with a tighter target footprint tolerance.
- House/property preservation, strict silhouette masks, the existing high-fidelity image edit settings, export flow, and UI remain unchanged.

The goal is simple: the photoreal render should look like the exact GreenScape layout made real, not a redesigned interpretation of it.

## Product direction

The long-term boundary between GreenScape and GreenRoute, including future irrigation and outdoor-lighting design responsibilities and the eventual design-to-operations handoff, is documented in [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md).
