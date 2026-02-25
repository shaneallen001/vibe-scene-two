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
- **Fully implemented the Inpainting Pipeline**: The optional room-by-room workflow extracts per-room masks from SVG `data-room-id` attributes, generates a dark base canvas from the SVG silhouette, then iteratively calls the Gemini `generateContent` image editing API to paint each room individually. After each room is painted, a quality validation step uses Gemini vision to verify the result looks like a proper top-down VTT battlemap — failing rooms are automatically retried up to 3 times. Progress is shown with gold highlights for the active room, green for completed rooms, plus per-room toast notifications and log entries showing QA pass/fail status.
- Added a 🎲 random prompt generator button on Step 1 with four 40-item word tables (moods, locations, features, environments) for rapid testing.
- **SVG Labels Always Generated**: The SVG generator now always includes room name text labels. Labels are stripped from the layout JPEG during image generation when the "Remove room names from final image" toggle is enabled (default ON), keeping the SVG for preview while the final rendered image stays clean.
- **Step 2 Toggleable Options**: Replaced the single Step 1 label checkbox with four Step 2 controls: **Generate Walls** (default ON), **Include layout as tile overlay** (default OFF), **Remove room names from final image** (default ON), and **Experimental: Inpainting Pipeline** (existing).
- **Room List Panel**: Step 2 now displays a styled scrollable room list showing each room's name and purpose from the generated outline.
- **Progress Dialog Redesign**: Modernized the generating window with an animated gradient progress bar, phase badge (Designing/Rendering), glassmorphism log area, refined silhouette container, and a modern ring spinner.
- **Scene Builder Tile Overlay**: When "Include layout as tile overlay" is enabled, `scene-builder.js` saves the layout JPEG as a semi-transparent Tile overlaid on the scene.
- **SVG Door Orientation Fix**: Added explicit door orientation rules to the SVG prompt — doors must be parallel to the shared wall they sit on (vertical wall = vertical line, horizontal wall = horizontal line). Doors are now centered on wall edges with a fixed 40–80 unit length.
- **SVG No-Overlap Rule**: Added strict no-overlapping constraint to the SVG prompt requiring 10–20 unit gaps between rooms, arranged in a tiled/grid layout. This prevents broken/intersecting walls in the scene builder.
- **Progress Dialog — Light-Trace Animation**: Replaced the old blocky blink animation with a "construction beam" effect. Each room outline gets a glowing SVG trace path that zips around its perimeter with staggered timing and per-room hue shifting. Dark ambient background replaces the old brown monotone. Active rooms glow warm gold with drop-shadow; completed rooms transition to cool teal.
- **Door-Aware Wall Splitting**: Walls no longer run over door segments. The scene builder now parses doors first, then splits each wall segment into sub-segments that leave gaps at door positions. Doors are now fully functional (openable/closable) in Foundry VTT.
- **Irregular Room Shapes**: The SVG generator now encourages diverse shapes: `<circle>` for towers/arenas, `<polygon>` for caves/L-shapes, `<path>` for curved walls, and `<ellipse>` for oval rooms. The scene builder has full parsers for all these shapes, approximating curves into wall segments. Outdoor spaces (`data-outdoor="true"`) get journals/lights but no walls.
- **Rich Journal Content**: The scene outline generator now produces per-room read-aloud descriptions, atmosphere notes, notable features, hazards, and interactables. Journal entries display with styled HTML: blockquote read-aloud boxes, bulleted features, hazard warnings, and investigation hooks.
- **Hazard Monster Generation**: Journal entries with Hazards sections now include a "🐉 Generate Hazard Monsters" button. Clicking it uses Gemini AI to analyze the room's context and hazards, then calls the Vibe Actor `GeminiPipeline` to create fully-fleshed D&D 5e actors. Created actors are automatically linked back into the journal via `@UUID` references under a "Linked Monsters" section.
