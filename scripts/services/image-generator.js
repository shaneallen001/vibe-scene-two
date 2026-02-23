import { callGemini } from "../../../vibe-common/scripts/services/gemini-service.js";

/**
 * Phase 3 Generator: Final Prompt Formatting and Image Generation
 */
export class SceneImageGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    getPromptFormatterSystem(options = {}) {
        const labelsRule = options.includeRoomLabels
            ? "Ensure you describe that the map has text labels painted on the ground displaying the room names clearly."
            : "IMPORTANT NO TEXT: Do not include any text labels, room names, or typography on the map.";

        return `You are an expert AI prompt engineer for a top-down virtual tabletop map generator (like DALL-E 3 or Imagen 4).
You have an outline of a scene/dungeon.
Your goal is to write a single, highly detailed, comma-separated paragraph prompt to generate a realistic, high-quality, high-resolution rendering of this map.
Do not describe UI elements, grids, or character tokens. Describe the textures, lighting, atmosphere, and layout.
${labelsRule}
Output ONLY the raw prompt string. No markdown formatting, no intro text.`;
    }

    async generateFinalPrompt(outline, options = {}) {
        console.log("SceneImageGenerator | Generating final prompt for Imagen");
        const outlineContext = JSON.stringify(outline, null, 2);
        const fullPrompt = `${this.getPromptFormatterSystem(options)}\n\nSCENE OUTLINE:\n${outlineContext}`;

        try {
            let finalPrompt = await callGemini({
                apiKey: this.apiKey,
                prompt: fullPrompt,
                responseSchema: null
            });

            finalPrompt = finalPrompt.trim();
            console.log("SceneImageGenerator | Generated Prompt:", finalPrompt);
            return finalPrompt;
        } catch (error) {
            console.error("SceneImageGenerator | Error formatting prompt:", error);
            throw error;
        }
    }

    async _svgToBase64Jpeg(svgString) {
        if (typeof document === "undefined") {
            console.warn("SceneImageGenerator | Node environment detected, skipping SVG to JPEG conversion.");
            return null;
        }
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = 1024;
                canvas.height = 1024;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#111111"; // Match prompt's dark background
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
                resolve(dataUrl.split(",")[1]);
            };
            img.onerror = (e) => {
                console.warn("SceneImageGenerator | Failed to convert SVG to image: ", e);
                resolve(null);
            };
            const encoded = btoa(unescape(encodeURIComponent(svgString)));
            img.src = "data:image/svg+xml;base64," + encoded;
        });
    }

    async generateImage(finalPrompt, svgData = null, abortSignal) {
        console.log("SceneImageGenerator | Requesting image generation");

        let base64Jpeg = null;
        if (svgData) {
            base64Jpeg = await this._svgToBase64Jpeg(svgData);
        }

        const promptText = finalPrompt + " Top-down TTRPG battlemap, extremely highly detailed, 4k.";

        let requestBody;
        let endpoint;

        // Fetch the user's preferred model from Foundry settings, defaulting to gemini-2.5-flash-image for guided generation.
        let guidedModel = "gemini-2.5-flash-image";
        if (typeof game !== "undefined") {
            try {
                const setting = game.settings.get("vibe-common", "imageGenerationModel");
                if (setting === "gemini-3-pro-image-preview") {
                    guidedModel = "gemini-3-pro-image-preview";
                }
            } catch (e) {
                console.warn("SceneImageGenerator | Could not fetch imageGenerationModel setting, defaulting.");
            }
        }

        if (base64Jpeg) {
            console.log(`SceneImageGenerator | Attaching converted SVG as reference image to ${guidedModel}.`);
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${guidedModel}:generateContent?key=${this.apiKey}`;
            requestBody = {
                contents: [{
                    parts: [
                        { text: promptText },
                        { inline_data: { mime_type: "image/jpeg", data: base64Jpeg } }
                    ]
                }]
            };
        } else {
            console.log("SceneImageGenerator | Requesting image from Imagen 4.0");
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${this.apiKey}`;
            requestBody = {
                instances: [{ prompt: promptText }],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: "1:1",
                    personGeneration: "ALLOW_ADULT"
                }
            };
        }

        const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: abortSignal
        });

        if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            throw new Error(`Gemini Image API error ${resp.status}: ${data?.error?.message || resp.statusText}`);
        }

        const data = await resp.json();

        // Handle both response formats
        let b64 = null;
        if (base64Jpeg) {
            // gemini-2.5-flash-image uses generateContent candidate response format
            b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data;
        } else {
            // imagen-4.0 uses predict instance response format
            b64 = data?.predictions?.[0]?.bytesBase64Encoded;
        }

        if (b64) {
            return b64;
        } else {
            console.error("SceneImageGenerator | Raw response:", data);
            throw new Error("No image data returned from image generation API.");
        }
    }
}
