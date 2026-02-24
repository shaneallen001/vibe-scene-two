# Changelog

## [1.3.0] - Major UI Overhaul & Progress Experience
- Redesigned Step 1 as prompt-first (full-width textarea, dice + Generate buttons).
- Redesigned Step 2 as horizontal split (SVG left, controls/buttons right).
- Replaced in-window loading with a dedicated `ProgressDialog` featuring scrolling text logs and room-blink silhouette animation.
- Fixed SVG-to-JPEG guidance pipeline and wall alignment discrepancies.
- Synchronized version with the Vibe module suite release.

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
