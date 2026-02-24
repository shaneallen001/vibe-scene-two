import { callGemini } from "../../../vibe-common/scripts/services/gemini-service.js";

/**
 * Phase 3 Generator: Final Prompt Formatting and Image Generation
 */
export class SceneImageGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    getPromptFormatterSystem(options = {}) {
        // removeRoomLabels defaults to true (labels NOT baked into final image)
        const removeLabels = options.removeRoomLabels !== false;
        const labelsRule = removeLabels
            ? "IMPORTANT NO TEXT: Do not include any text labels, room names, or typography on the map."
            : "Ensure you describe that the map has text labels painted on the ground displaying the room names clearly.";

        return `You are an expert AI prompt engineer for a top-down virtual tabletop map generator (like DALL-E 3 or Imagen 4).
You have an outline of a scene/dungeon.
Your goal is to write a single, highly detailed, comma-separated paragraph prompt to generate a realistic, high-quality, high-resolution rendering of this map.
Do not describe UI elements, grids, or character tokens. Describe the textures, lighting, atmosphere, and layout.
CRITICAL PERSPECTIVE RULE: You MUST enforce a STRICTLY flat, top-down orthographic perspective. Do NOT generate roofs. The viewer must be looking directly down into the interior of the rooms. Do not use 2.5D or isometric angles.
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

    async _svgToBase64Jpeg(svgString, options = {}) {
        if (typeof document === "undefined") {
            console.warn("SceneImageGenerator | Node environment detected, skipping SVG to JPEG conversion.");
            return null;
        }

        // Strip <text> elements from the SVG when labels should be removed from the image
        let processedSvg = svgString;
        if (options.removeRoomLabels !== false) {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(processedSvg, "image/svg+xml");
            const textElements = svgDoc.querySelectorAll("text");
            textElements.forEach(el => el.remove());
            processedSvg = new XMLSerializer().serializeToString(svgDoc.documentElement);
            console.log(`SceneImageGenerator | Stripped ${textElements.length} text labels from SVG for image generation.`);
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
            const encoded = btoa(unescape(encodeURIComponent(processedSvg)));
            img.src = "data:image/svg+xml;base64," + encoded;
        });
    }

    async generateImage(finalPrompt, svgData = null, abortSignal, options = {}) {
        console.log("SceneImageGenerator | Requesting image generation");

        let base64Jpeg = null;
        if (svgData) {
            base64Jpeg = await this._svgToBase64Jpeg(svgData, options);
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
            return {
                finalImage: b64,
                layoutImage: base64Jpeg
            };
        } else {
            console.error("SceneImageGenerator | Raw response:", data);
            throw new Error("No image data returned from image generation API.");
        }
    }

    /**
     * Generate a focused prompt for a single room (used by inpainting pipeline).
     */
    generateRoomPrompt(room, outlineTitle) {
        const sizeHint = room.approximateSize ? ` (${room.approximateSize} room)` : "";
        return `Interior top-down view of a ${room.purpose || room.name}${sizeHint} within "${outlineTitle}". ${room.name}. Richly detailed textures, atmospheric lighting. Top-down TTRPG battlemap perspective, highly detailed, 4k.`;
    }

    /**
     * Inpaint a specific region of an existing image using a mask.
     * Sends the base image + mask as two inline images with an editing prompt
     * to the Gemini multimodal image generation model.
     *
     * @param {string} baseImageB64 - Base64-encoded JPEG of the current composite canvas
     * @param {string} maskB64 - Base64-encoded JPEG mask (white = paint here, black = keep)
     * @param {string} roomPrompt - Description of what to paint in the masked region
     * @param {AbortSignal} [abortSignal] - Optional abort signal
     * @returns {string} Base64-encoded JPEG of the edited image
     */
    async inpaintRegion(baseImageB64, maskB64, roomPrompt, abortSignal) {
        console.log("SceneImageGenerator | Inpainting region with prompt:", roomPrompt.substring(0, 80) + "...");

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

        const editPrompt = `Edit this top-down dungeon battlemap image. The second image is a mask where WHITE regions indicate the area to paint. In that white-highlighted region, paint: ${roomPrompt}. CRITICAL: Keep all BLACK (non-masked) areas of the image COMPLETELY UNCHANGED. Only modify the white masked region. Maintain consistent art style, lighting, and perspective across the entire image.`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${guidedModel}:generateContent?key=${this.apiKey}`;
        const requestBody = {
            contents: [{
                parts: [
                    { text: editPrompt },
                    { inline_data: { mime_type: "image/jpeg", data: baseImageB64 } },
                    { inline_data: { mime_type: "image/jpeg", data: maskB64 } }
                ]
            }],
            generationConfig: {
                response_modalities: ["IMAGE", "TEXT"]
            }
        };

        const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: abortSignal
        });

        if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            throw new Error(`Gemini Inpaint API error ${resp.status}: ${data?.error?.message || resp.statusText}`);
        }

        const data = await resp.json();
        const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
            || data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data;

        if (!b64) {
            // Check if any part has image data (model may return text + image)
            for (const part of (data?.candidates?.[0]?.content?.parts || [])) {
                const imgData = part?.inlineData?.data || part?.inline_data?.data;
                if (imgData) return imgData;
            }
            console.error("SceneImageGenerator | Inpaint raw response:", data);
            throw new Error("No image data returned from inpainting API call.");
        }

        return b64;
    }

    /**
     * Validate that an inpainted image still looks like a proper top-down VTT battlemap.
     * Uses Gemini vision (text model) to analyze the image and return pass/fail.
     *
     * @param {string} imageB64 - Base64-encoded JPEG of the image to validate
     * @param {string} roomName - Name of the room that was just painted (for context)
     * @returns {Promise<{pass: boolean, reason: string}>}
     */
    async validateInpaintQuality(imageB64, roomName) {
        console.log(`SceneImageGenerator | Validating quality after painting "${roomName}"...`);

        const validationPrompt = `You are a quality assurance inspector for AI-generated TTRPG battlemaps.

Analyze this image and determine if it meets ALL of these criteria:
1. It is a TOP-DOWN / bird's-eye-view perspective (looking straight down, NOT isometric, NOT 3D, NOT angled)
2. It resembles a virtual tabletop (VTT) battlemap suitable for D&D or similar games
3. Room interiors are visible (no roofs covering them)
4. The image is not corrupted, glitched, or mostly blank
5. The art style is consistent (no jarring mismatched regions)

Respond with ONLY a JSON object in this exact format, no markdown:
{"pass": true, "reason": "Brief explanation"}
or
{"pass": false, "reason": "Brief explanation of what's wrong"}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${this.apiKey}`;
        const requestBody = {
            contents: [{
                parts: [
                    { text: validationPrompt },
                    { inline_data: { mime_type: "image/jpeg", data: imageB64 } }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                response_mime_type: "application/json"
            }
        };

        try {
            const resp = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            if (!resp.ok) {
                console.warn(`SceneImageGenerator | Quality validation API returned ${resp.status}, skipping check.`);
                return { pass: true, reason: "Validation API unavailable, assuming pass." };
            }

            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

            try {
                const result = JSON.parse(text.trim());
                console.log(`SceneImageGenerator | Quality check: ${result.pass ? "PASS ✓" : "FAIL ✗"} — ${result.reason}`);
                return { pass: !!result.pass, reason: result.reason || "No reason given." };
            } catch (parseErr) {
                console.warn("SceneImageGenerator | Could not parse quality validation response:", text);
                return { pass: true, reason: "Could not parse validation response, assuming pass." };
            }
        } catch (err) {
            console.warn("SceneImageGenerator | Quality validation error:", err.message);
            return { pass: true, reason: "Validation error, assuming pass." };
        }
    }
}
