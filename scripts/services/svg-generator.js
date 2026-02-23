import { callGemini } from "../../../vibe-common/scripts/services/gemini-service.js";

/**
 * Phase 2 Generator: Textual Outline -> SVG Layout
 */
export class SvgGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    get systemPrompt() {
        return `You are an expert cartographer building a top-down, 2D map layout in SVG format for a virtual tabletop.
You will be given a textual outline of the scene describing rooms and their purposes.
Your goal is to generate ONLY a valid, self-contained SVG string that visually represents this layout.

Rules for the SVG:
- Use a dark background color (e.g., #111111).
- Use distinct, easily identifiable solid colors for different rooms or areas (e.g., #445566, #554433), or thematic hex codes.
- ONLY draw the macro architectural layout of the rooms and walls. DO NOT draw small props or furniture (no beds, pillows, desks, tables, cauldrons, etc.) because these shapes will automatically be converted into physical walls by the game engine.
- Draw rectangles, polygons, or circles for rooms.
- IMPORTANT: For each room element (rect, polygon, circle), you MUST include a \`data-room-id\` attribute that EXACTLY matches the \`id\` field of the room from the SCENE OUTLINE JSON.
- Indicate doors, passages, or openings between connecting rooms. Draw these opening indicators using thick <line> elements (e.g., stroke="white" or stroke="brown" with stroke-width="8") that bridge the adjoining walls. This lets the image generation process know where it is open vs closed.
- Add simple text labels in the center of rooms to identify them. Text should be white or high contrast.
- Ensure the viewBox is appropriately sized (e.g., "0 0 1000 1000").
- No markdown formatting wrappers like \`\`\`svg or HTML wrappers. Just output the raw <svg>...</svg> element.`;
    }

    async generateSvg(outline) {
        console.log("SvgGenerator | Generating SVG layout for outline:", outline.title);

        // Convert outline JSON to a clean string format for the prompt
        const outlineContext = JSON.stringify(outline, null, 2);
        const fullPrompt = `${this.systemPrompt}\n\nSCENE OUTLINE:\n${outlineContext}`;

        try {
            let svg = await callGemini({
                apiKey: this.apiKey,
                prompt: fullPrompt,
                responseSchema: null
            });

            console.log("SvgGenerator | Raw SVG Response received.");

            // Clean up markdown wrappers if Gemini still includes them
            svg = svg.trim();
            const match = svg.match(/```(?:svg|xml)?\s*([\s\S]*?)\s*```/i);
            if (match && match[1]) {
                svg = match[1].trim();
            }

            if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) {
                console.warn("SvgGenerator | Did not receive a clean SVG string. Attempting fallback.");
                // Basic fallback extraction if possible
                const startIdx = svg.indexOf('<svg');
                const endIdx = svg.lastIndexOf('</svg>');
                if (startIdx !== -1 && endIdx !== -1) {
                    svg = svg.substring(startIdx, endIdx + 6);
                } else {
                    throw new Error("Failed to generate valid SVG format.");
                }
            }

            console.log("SvgGenerator | Extracted SVG string.");
            return svg;

        } catch (error) {
            console.error("SvgGenerator | Error during generation:", error);
            throw error;
        }
    }
}
