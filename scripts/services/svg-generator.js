import { callGemini } from "../../../vibe-common/scripts/services/gemini-service.js";

/**
 * Phase 2 Generator: Textual Outline -> SVG Layout
 */
export class SvgGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    getSystemPrompt() {
        return `You are an expert cartographer building a top-down, 2D map layout in SVG format for a virtual tabletop.
You will be given a textual outline of the scene describing rooms and their purposes.
Your goal is to generate ONLY a valid, self-contained SVG string that visually represents this layout.

Rules for the SVG:
- Use a dark background color (e.g., #111111).
- Use distinct, easily identifiable solid colors for different rooms or areas (e.g., #445566, #554433), or thematic hex codes.
- ONLY draw the macro architectural layout of the rooms and walls. DO NOT draw small props or furniture (no beds, pillows, desks, tables, cauldrons, etc.) because these shapes will automatically be converted into physical walls by the game engine.

SHAPE VARIETY — pick the best shape for each room:
- <rect> for standard rectangular rooms, hallways, closets.
- <circle> or <ellipse> for round chambers, towers, arenas, wells, circular pits.
- <polygon> for irregular rooms: L-shaped rooms, natural caves, triangular alcoves, trapezoid rooms, or any room that is NOT a simple rectangle.
- <path> with simple arc (A) commands for rooms with curved walls, partial circles, apse-shaped areas, or winding corridors.
- Choose the shape that BEST represents the room's description. NOT everything should be a rectangle. Caves should be irregular polygons. Towers should be circles. Be creative and architectural.

ROOM ATTRIBUTES — REQUIRED:
- IMPORTANT: For every room shape element (rect, circle, ellipse, polygon, path), you MUST include a \`data-room-id\` attribute that EXACTLY matches the \`id\` field of the room from the SCENE OUTLINE JSON.
- For OUTDOOR areas (courtyards, open sky, gardens, forest clearings), add \`data-outdoor="true"\` to the element. Outdoor rooms use a dashed stroke (stroke-dasharray="10,5") and semi-transparent fill. The game engine will NOT build walls for outdoor rooms.

LAYOUT RULES:
- Adjacent rooms MUST share a wall — their edges should touch exactly (e.g., room A's right edge aligns with room B's left edge at the same x coordinate). This is how real dungeon floorplans work.
- Rooms MUST NOT overlap — meaning one room's area must never extend INTO another room's interior area. Edges touching is correct; areas overlapping is not.
- Pack rooms tightly by sharing edges. Think of it like puzzle pieces fitting together, NOT boxes with gaps between them.

DOOR RULES — CORRECT ORIENTATION:
- Doors are drawn as thick <line> elements (stroke="white" or stroke="#8B4513", stroke-width="8") placed along the shared edge between two touching rooms.
- A door <line> MUST be PARALLEL to the wall it sits on:
  • If two rooms share a VERTICAL edge (rooms side by side left-right), the door line must be VERTICAL: x1 = x2, y1 ≠ y2.
  • If two rooms share a HORIZONTAL edge (rooms stacked top-bottom), the door line must be HORIZONTAL: y1 = y2, x1 ≠ x2.
- The door line should be centered on the shared edge and be shorter than the wall (about 40-80 units long).
- NEVER draw a door perpendicular to the wall. A door on a vertical shared edge = vertical line. A door on a horizontal shared edge = horizontal line.

- Add simple text labels in the center of rooms to identify them. Text should be white or high contrast.
- Ensure the viewBox is appropriately sized (e.g., "0 0 1000 1000").
- No markdown formatting wrappers like \`\`\`svg or HTML wrappers. Just output the raw <svg>...</svg> element.`;
    }

    async generateSvg(outline, options = {}) {
        console.log("SvgGenerator | Generating SVG layout for outline:", outline.title);

        // Convert outline JSON to a clean string format for the prompt
        const outlineContext = JSON.stringify(outline, null, 2);
        const fullPrompt = `${this.getSystemPrompt()}\n\nSCENE OUTLINE:\n${outlineContext}`;

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
