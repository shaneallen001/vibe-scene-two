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
- Updated the pipeline to convert abstract SVG maps into JPEG instances to guide final Imagen 4 image generation.
- Corrected the SVG generation prompt to only emit architectural layouts, preventing minor furniture objects from being physically walled by the builder.
- Fixed an issue where parsed walls and lights were drawn off-center relative to the final generated map due to Foundry's default scene padding logic (`scene.dimensions.sceneX/Y`).
- Addressed map scaling issues: the map bounds now automatically shrink or grow to dynamically match the intrinsic resolution of the Imagen 4 generated backdrop (such as 1024x1024), yielding realistic 5ft-to-100px square measurements.
- Overhauled the SVG cartography prompt to include `<line>` indicators for doors or connected openings between rooms, greatly increasing the mechanical usefulness of the map and ensuring that the final diffusion render respects traversable passageways!
- Scaled up the grid resolution by setting the generative engine's scale factor to 40 instead of 100 to make Foundry tokens visually correct relative to the newly added Imagen maps.
- Implemented a UI toggle switch letting users decide to either paint room names directly on the map or omit them and rely exclusively on automatically placed Journals.
- Updated `scene-builder.js` and `image-generator.js` to persist the intermediate `-layout.jpg` SVG bounds map alongside the final generated image for evaluating AI generation debugging.
- Conducted an experimental AI Vision wall tracing phase using `gemini-3-pro-image-preview`. Due to instability with complex multi-room intersections, the vision tracing code was entirely reverted in favor of retaining the math-based SVG-driven wall generation.
- Overhauled the SVG preview and final image review UI: removed process outline text, scaled images to `60vh` viewport units, moved descriptions below images, and hid previews during generation with `VibeToast` status notifications.
- Added an experimental `InpaintingPipeline` scaffold class for room-by-room mask-driven image generation, toggled via a checkbox on Step 2.
- Added a 🎲 random prompt generator button on Step 1 with four 40-item word tables (moods, locations, features, environments) for rapid testing.
