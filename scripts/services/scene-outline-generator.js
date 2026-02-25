import { callGemini, extractJson } from "../../../vibe-common/scripts/services/gemini-service.js";

/**
 * Phase 1 Generator: User Concept -> Textual Outline
 */
export class SceneOutlineGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    get systemPrompt() {
        return `You are an expert Foundry VTT cartographer, dungeon designer, and D&D Dungeon Master.
Your goal is to take a short user idea for a scene/map, and generate a detailed conceptual outline of the rooms and features. This outline drives both the SVG map layout AND the in-game journal entries, so be vivid and useful to a DM running a session.

Output JSON only, in the following format:
{
  "title": "A short descriptive name for this scene",
  "description": "A 1-2 sentence description of the overall vibe and atmosphere",
  "rooms": [
    {
      "id": "A unique lowercase identifier (e.g., 'foyer', 'cell-1')",
      "name": "Room name",
      "purpose": "What this room is used for",
      "approximateSize": "small, medium, or large",
      "shapeHint": "rect | circle | polygon | path — suggest the best SVG shape for this room (circle for towers/arenas, polygon for caves/L-shapes, path for curved walls, rect for standard rooms)",
      "readAloud": "A 2-3 sentence evocative description the DM can read aloud to players when they enter this room. Use second person ('You see...'). Be atmospheric and vivid.",
      "atmosphere": "A short phrase describing the lighting and mood (e.g., 'Dim flickering torchlight, heavy silence', 'Bright sunlight streams through broken windows')",
      "features": ["Notable feature 1", "Notable feature 2"],
      "hazards": ["Optional: any trap, environmental hazard, or danger in this room"],
      "interactables": ["Optional: things players can investigate, manipulate, or interact with (e.g., 'A locked iron chest beneath the altar', 'A suspicious lever on the wall')"]
    }
  ]
}

GUIDELINES:
- Every room MUST have readAloud, atmosphere, and at least 1-2 features.
- hazards and interactables are optional but encouraged — at least 30-50% of rooms should have one or both.
- For outdoor areas (courtyards, gardens, clearings), set shapeHint to "polygon" or "circle" as appropriate.
- Be creative with the descriptions — these will become the DM's reference during gameplay.`;
    }

    async generateOutline(userPrompt) {
        console.log("SceneOutlineGenerator | Generating outline for prompt:", userPrompt);
        const fullPrompt = `${this.systemPrompt}\n\nUSER PROMPT: ${userPrompt}`;

        try {
            const responseText = await callGemini({
                apiKey: this.apiKey,
                prompt: fullPrompt,
                responseSchema: null // Using null schema format to let extractJson handle it based on old pattern
            });

            console.log("SceneOutlineGenerator | Raw Response received.");
            const outline = extractJson(responseText);
            console.log("SceneOutlineGenerator | Parsed Outline:", outline);

            return outline;

        } catch (error) {
            console.error("SceneOutlineGenerator | Error during generation:", error);
            throw error;
        }
    }
}
