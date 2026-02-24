# Changelog

## [1.1.0] - Pipeline Polish & Imagen 4 UI
- Implemented multi-step AI pipeline with SVG-to-JPEG conversion for Imagen 4 guidance.
- Added room name UI toggle and deterministic journal placement via `data-room-id`.
- Scaled grid resolution to 40px for better token alignment.
- Added random scene prompt generator with 40-item tables.
- Overhauled SVG and Image preview UI with `VibeToast` notifications.
- Added experimental `InpaintingPipeline` for room-by-room generation.

## [1.0.0] - Initial Development
- Initial multi-step pipeline implementation (Concept -> SVG -> Scene).
- Basic wall and light extraction from AI-generated SVG layouts.
