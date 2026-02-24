# Vibe Scene Two

Experimental multi-step AI pipeline for procedural Scene generation in Foundry VTT.
Depends on `vibe-common` for AI integration and UI framework.

## Overview
Unlike the immediate one-shot generation of Vibe Scenes, this module implements a phased workflow:
1. Concept -> SVG Outline Generation
2. SVG -> Rendered PNG Map Generation 
3. Post-Processing -> Scene Creation with Walls/Lights

## Development
This module is currently in development.

## Recent Changes
- **UI Overhaul — Prompt-First Step 1**: Redesigned the concept entry screen to make the textarea the most prominent element, removing verbose instructions in favor of a placeholder hint. The Generate Layout button is now inline below the prompt.
- **UI Overhaul — Horizontal Step 2**: Redesigned the SVG preview as a horizontal split layout: SVG on the left (~65%), controls/buttons/description on the right (~35%). Buttons are always visible without scrolling.
- **UI Overhaul — Progress Dialog**: Replaced in-window loading states with a dedicated `ProgressDialog`. During Phase 1 (outline + SVG), it shows a scrolling text log with real-time status including generated room names and descriptions. During Phase 2 (image rendering), it displays the SVG as a dark silhouette with rooms blinking in random order (gold-highlighted) until generation completes. Previous step windows close during generation to avoid confusion.
- **CSS Module**: Created `styles/vibe-scene-two.css` with dedicated styles for all UI components, registered in `module.json`.
- Updated the pipeline to convert abstract SVG maps into JPEG instances to guide final Imagen 4 image generation.
- Corrected the SVG generation prompt to only emit architectural layouts, preventing minor furniture objects from being physically walled by the builder.
- Fixed an issue where parsed walls and lights were drawn off-center relative to the final generated map due to Foundry's default scene padding logic (`scene.dimensions.sceneX/Y`).
- Addressed map scaling issues: the map bounds now automatically shrink or grow to dynamically match the intrinsic resolution of the Imagen 4 generated backdrop (such as 1024x1024), yielding realistic 5ft-to-100px square measurements.
- Overhauled the SVG cartography prompt to include `<line>` indicators for doors or connected openings between rooms, greatly increasing the mechanical usefulness of the map and ensuring that the final diffusion render respects traversable passageways!
- Scaled up the grid resolution by setting the generative engine's scale factor to 40 instead of 100 to make Foundry tokens visually correct relative to the newly added Imagen maps.
- Implemented a UI toggle switch letting users decide to either paint room names directly on the map or omit them and rely exclusively on automatically placed Journals.
- Updated `scene-builder.js` and `image-generator.js` to persist the intermediate `-layout.jpg` SVG bounds map alongside the final generated image for evaluating AI generation debugging.
- Conducted an experimental AI Vision wall tracing phase using `gemini-3-pro-image-preview`. Due to instability with complex multi-room intersections, the vision tracing code was entirely reverted in favor of retaining the math-based SVG-driven wall generation.
- Added an experimental `InpaintingPipeline` scaffold class for room-by-room mask-driven image generation, toggled via a checkbox on Step 2.
- Added a 🎲 random prompt generator button on Step 1 with four 40-item word tables (moods, locations, features, environments) for rapid testing.
