import { callGemini, extractJson } from "../../../vibe-common/scripts/services/gemini-service.js";

/**
 * Phase 1 Generator: User Concept -> Textual Outline
 */
export class SceneOutlineGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    get systemPrompt() {
        return `You are an expert Foundry VTT cartographer and dungeon designer.
Your goal is to take a short user idea for a scene/map, and generate a detailed conceptual outline of the rooms and features that need to be generated for an SVG map.

Output JSON only, in the following format:
{
  "title": "A short descriptive name for this scene",
  "description": "A 1-2 sentence description of the overall vibe and atmosphere",
  "rooms": [
    {
      "id": "A unique lowercase identifier (e.g., 'foyer', 'cell-1')",
      "name": "Room name",
      "purpose": "What this room is used for",
      "approximateSize": "small, medium, or large"
    }
  ]
}`;
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
