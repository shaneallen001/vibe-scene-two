# vibe-scene-two — AI Scene Pipeline

## Project Overview

The phased AI scene generator for the vibe-* Foundry VTT suite. Unlike a
one-shot generator, it runs a multi-step pipeline: **concept → JSON outline →
architectural SVG plan → SVG-guided image render → deterministic build** of
walls, doors, lights, and journals onto a real Foundry Scene. Depends on
`vibe-common` for the Gemini client, UI base classes, settings, and CSS tokens.

Source repo: `shaneallen001/vibe-scene-two` (branch `main`).

## Tech Stack

- **Runtime**: Foundry VTT v14 (build 360+), browser-based, no Node.js in production
- **Language**: JavaScript ES modules — no CommonJS, no bundlers
- **AI Services**: Google Gemini (text/JSON outline + image generation) via `vibe-common`
- **Config**: API keys/model from `vibe-common` settings (`geminiApiKey`, `imageGenerationModel`)

## Commands

No build step. Local pipeline smoke test (Node, needs `GEMINI_API_KEY`):

```bash
npm run test:pipeline   # runs dev/testing-loop.js: outline → SVG → image
```

This is a dev harness only — it is gitignored output and not part of the
shipped module.

## Architecture

- `scripts/module.js` — init hook, exposes API, injects the scene-control button
- `scripts/services/pipeline.js` — `ScenePipeline` orchestrator (Phase 1/2/3 state machine)
- `scripts/services/scene-outline-generator.js` — Phase 1: concept → JSON outline
- `scripts/services/svg-generator.js` — Phase 2: outline → architectural SVG plan
- `scripts/services/image-generator.js` — Phase 3: SVG-guided map render
- `scripts/services/inpainting-pipeline.js` — optional room-by-room paint + QA (experimental)
- `scripts/services/scene-builder.js` — deterministic SVG → walls/doors/lights/journals
- `scripts/ui/generator-app.js` — the 3-step `VibeApplicationV2` wizard
- `scripts/ui/progress-dialog.js` — generation progress UI (logs + silhouette animation)

## Public API

Exposed at `game.modules.get("vibe-scene-two")?.api`:
- `GeneratorApp` — the wizard application (the scene-control button renders this)

Generated scenes are written to `worlds/<world>/ai-scenes/`.

## Key Patterns

- Three sequential phases on `ScenePipeline.state`; the UI calls
  `generateOutline()` → `generateSvg()` → `generateImage()` individually, then
  `SceneBuilder.createSceneFromState(pipeline.state)`.
- The SVG plan is the source of truth for both the image render (guidance JPEG)
  and the deterministic wall/door/light/journal build.
- Rooms carry stable `data-room-id` attributes used for journal placement and
  inpainting masks.

## Boundaries

- All AI calls go through `vibe-common`'s `callGemini` — no module-local Gemini client.
- Light radii in Foundry are **distance units (grid feet), not pixels** — convert
  before writing `light.dim`/`light.bright`.
- The scene-control button keeps the `vibe-scene-two` id/title — do not rename
  (avoids template-path / scene-control churn).

## Memory Bank

This module shares the suite Memory Bank centralized in `vibe-common`. Boot and
close sessions per the `memory-bank-protocol` skill. See the thin pointer at
`.agents/skills/memory-bank-protocol/SKILL.md`; the authoritative protocol and
bank live at `../vibe-common/memory-bank/` (start at its `AGENTS.md`). Filter
`knowledge/` by `module: vibe-scene-two` for this module's notes.
