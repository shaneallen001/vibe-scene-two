# Vibe Scene Two

## Overview
**Vibe Scene Two** is a Foundry VTT module that generates playable battlemaps
through a multi-step AI pipeline. It is part of the Vibe Project ecosystem and
depends on **`vibe-common`** for AI integration and the shared UI framework.

Rather than a single one-shot render, it works in phases — first planning an
architectural layout, then rendering a map that respects that plan, then
deterministically building walls, doors, lights, and journals onto a real
Foundry Scene:

1. **Concept → Outline** — your prompt becomes a structured JSON outline of rooms.
2. **Outline → SVG Plan** — an architectural top-down SVG plan with rooms, doors, and labels.
3. **SVG → Map → Scene** — an SVG-guided image render, then a Scene built with walls, doors, lights, and journals.

## Features

- **Phased pipeline** with a clear 3-step wizard and a live progress dialog
  (scrolling logs + a room-by-room silhouette animation).
- **Architectural SVG planning** — rooms, doors as openings, and irregular shapes
  (`<circle>`, `<polygon>`, `<path>`, `<ellipse>`) drive both the render and the build.
- **Deterministic scene build** — door-aware wall splitting (doors are real,
  openable Foundry doors), ambient lights, and richly formatted journal entries
  (read-aloud text, atmosphere, features, hazards, interactables) placed per room.
- **Toggles** — Generate Walls, include the layout as a tile overlay, remove room
  names from the final image, and an experimental room-by-room inpainting pipeline.
- **Random prompt generator** — a 🎲 button with word tables for rapid testing.

## Installation
1. Ensure **`vibe-common`** is installed and enabled (it is a required dependency).
2. Install **`vibe-scene-two`** into your `Data/modules/` directory.
3. Enable the module in your Foundry VTT world.

## Configuration
- **API Key**: Configure your Gemini API key in the **Vibe Common** module settings.
- **Image model**: The image-generation model is selected in **Vibe Common** settings.

## Usage
1. Open the **Token** scene controls and click **"Vibe Scene Two (Experimental)"**.
2. **Step 1 — Concept**: enter a prompt (or hit 🎲 for a random one) and click **Generate Layout**.
3. **Step 2 — Plan**: review the SVG plan and room list, set the toggles (walls,
   tile overlay, room names, inpainting), then continue.
4. **Step 3 — Build**: the pipeline renders the map and builds the Scene. The new
   Scene is created under `worlds/<world>/ai-scenes/`.

## Developer Guide

### Public API
The wizard application is exposed on the module API:

```js
game.modules.get("vibe-scene-two").api.GeneratorApp
```

### Local Testing Loop
A standalone Node.js harness in [`dev/`](./dev/) exercises the pipeline
(outline → SVG → image) outside Foundry for rapid iteration:

1. Set your API key: `$env:GEMINI_API_KEY="your-api-key"`
2. Run `npm run test:pipeline` (optionally pass a prompt as an argument).
3. Output is saved under `dev/test-output/`.

For architecture, the phase breakdown, and the cross-module contract with
`vibe-common`, see [AGENTS.md](./AGENTS.md).
