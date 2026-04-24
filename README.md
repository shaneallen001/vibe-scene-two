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

## Image Generation Models
The Scene Image Generator relies on `vibe-common` for API keys and the global image generation model setting. Supported models include `gemini-2.5-flash-image` (default), `gemini-3-pro-image-preview`, and `gemini-3.1-flash-image-preview`, as well as `imagen-4.0` for different parts of the pipeline context.


