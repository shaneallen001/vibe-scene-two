# vibe-scene-two — AI Scene Pipeline

## Commands

```bash
npm run test:pipeline   # Test full generation pipeline (requires GEMINI_API_KEY env var)
```

## Key Patterns

- Three-phase pipeline: Outline → SVG → Image (state machine accumulates data across phases)
- SVG always includes room labels; label removal controlled at image generation step via `removeRoomLabels` option
- Scene builder: door-aware wall splitting, supports irregular SVG shapes (`circle`, `polygon`, `path`, `ellipse`)
- Journal entries: rich HTML with readAloud, atmosphere, features, hazards, interactables per room
- SVG uses `data-room-id` attributes to track room identity through generation and scene building
- Outdoor rooms (`data-outdoor="true"`) skip wall generation, only create journals/lights
- Optional dependency on `vibe-actor` API for hazard monster generation from journal entries

## Boundaries

- Labels in SVG are intentional — do not strip them during SVG generation phase
- Inpainting pipeline is experimental — changes may break; test thoroughly
- Canvas size fixed at 1024×1024 JPEG (0.9 quality) for inpainting and SVG rendering
- No dedicated settings.js — all API keys come from vibe-common

## Gotchas

- **Door-aware walls**: Walls split at door positions so doors aren't blocked by solid walls.
- **Room-by-room inpainting retry**: Up to 3 attempts per room; if all fail, accepts last result to avoid blocking pipeline.
- **SVG validation**: Generator strips markdown wrappers (` ```svg `), has fallback extraction logic.
- **No overlapping rooms**: SVG rules enforce rooms share edges (puzzle-piece layout), never overlap interiors.
- **Door orientation**: Doors must align perpendicular to shared wall edges.
- **Hazard monster generation**: Requires vibe-actor module to be active — fails gracefully if unavailable.
