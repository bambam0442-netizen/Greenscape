# GreenScape v0.3.6 — Strict Layout Fidelity

This build keeps the v0.3.5 protected-photo workflow and tightens plant placement fidelity.

Changes:
- Plant edit masks now follow each plant cutout silhouette instead of broad rectangular zones.
- Only a small grounding zone is editable below each plant.
- Render prompt includes an explicit per-plant placement manifest with name, center coordinates, and scale.
- Renderer is instructed to keep one-to-one species mapping, order, size, and placement.
- House/property outside the plant masks remains protected.

Deploy to Vercel the same way as v0.3.5. Keep your existing OPENAI_API_KEY setup.
