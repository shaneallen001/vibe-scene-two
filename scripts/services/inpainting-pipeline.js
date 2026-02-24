import { ScenePipeline } from "./pipeline.js";

/**
 * InpaintingPipeline
 * Generates the map image room-by-room using SVG masks and iterative inpainting.
 * Extends the base ScenePipeline but takes over Phase 3 (image generation).
 *
 * Flow:
 *   1. Render the SVG silhouette to a dark base canvas (1024×1024)
 *   2. For each room: extract a white-on-black mask → call inpaintRegion → update canvas
 *   3. Store the final composite as state.imageBuffer
 */
export class InpaintingPipeline extends ScenePipeline {
    constructor(apiKey) {
        super(apiKey);
        /** @type {function(string, number, number)|null} Progress callback (roomId, index, total) */
        this.onRoomProgress = null;
    }

    // ── Mask and Canvas utilities (browser only) ────────────

    /**
     * Render the full SVG to a 1024×1024 JPEG as the starting base canvas.
     * All rooms appear as their original dark fills, giving the model spatial context.
     */
    async _generateBaseCanvas(svgString) {
        if (typeof document === "undefined") {
            throw new Error("InpaintingPipeline requires a browser environment for canvas operations.");
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = 1024;
                canvas.height = 1024;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#111111";
                ctx.fillRect(0, 0, 1024, 1024);
                ctx.drawImage(img, 0, 0, 1024, 1024);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
                resolve(dataUrl.split(",")[1]);
            };
            img.onerror = (e) => {
                console.error("InpaintingPipeline | Failed to render base canvas:", e);
                reject(new Error("Failed to render SVG to base canvas."));
            };
            const encoded = btoa(unescape(encodeURIComponent(svgString)));
            img.src = "data:image/svg+xml;base64," + encoded;
        });
    }

    /**
     * Extract a mask for a specific room from the SVG.
     * Produces a 1024×1024 JPEG where the target room is WHITE and everything else is BLACK.
     *
     * @param {string} svgString - The full SVG layout string
     * @param {string} roomId   - The data-room-id value to isolate
     * @returns {Promise<string>} Base64-encoded JPEG mask
     */
    async _extractRoomMask(svgString, roomId) {
        if (typeof document === "undefined") {
            throw new Error("InpaintingPipeline requires a browser environment for canvas operations.");
        }

        // Parse the SVG and manipulate it to create a mask
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, "image/svg+xml");
        const svgEl = doc.documentElement;

        // Set a uniform black background on the SVG itself
        svgEl.setAttribute("style", "background: #000000;");

        // Remove any background rects (those without data-room-id)
        const allRects = svgEl.querySelectorAll("rect:not([data-room-id])");
        allRects.forEach(r => {
            r.setAttribute("fill", "#000000");
            r.setAttribute("stroke", "none");
        });

        // Hide all text and line elements
        svgEl.querySelectorAll("text, line").forEach(el => {
            el.setAttribute("visibility", "hidden");
        });

        // Set all room elements to black, except the target room which becomes white
        const allRoomEls = svgEl.querySelectorAll("[data-room-id]");
        allRoomEls.forEach(el => {
            if (el.getAttribute("data-room-id") === String(roomId)) {
                el.setAttribute("fill", "#FFFFFF");
                el.setAttribute("stroke", "#FFFFFF");
                el.setAttribute("stroke-width", "2");
            } else {
                el.setAttribute("fill", "#000000");
                el.setAttribute("stroke", "#000000");
            }
        });

        // Serialize back to string
        const serializer = new XMLSerializer();
        const maskSvg = serializer.serializeToString(svgEl);

        // Render to canvas
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = 1024;
                canvas.height = 1024;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, 1024, 1024);
                ctx.drawImage(img, 0, 0, 1024, 1024);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
                resolve(dataUrl.split(",")[1]);
            };
            img.onerror = (e) => {
                console.error(`InpaintingPipeline | Failed to render mask for room '${roomId}':`, e);
                reject(new Error(`Failed to render mask for room '${roomId}'.`));
            };
            const encoded = btoa(unescape(encodeURIComponent(maskSvg)));
            img.src = "data:image/svg+xml;base64," + encoded;
        });
    }

    // ── Phase 3 Override ────────────────────────────────────

    /**
     * Override Phase 3: Generate Image Map (Inpainting)
     * Iterates over every room in the outline, building the map progressively.
     */
    async generateImage() {
        console.log(`InpaintingPipeline | --- PHASE 3: Room-by-Room Inpainting ---`);
        if (!this.state.outline) throw new Error("Missing outline for Phase 3");
        if (!this.state.svg) throw new Error("Missing SVG for Phase 3");

        const rooms = this.state.outline.rooms || [];
        if (rooms.length === 0) throw new Error("Outline has no rooms to inpaint.");

        const title = this.state.outline.title || "Dungeon";

        try {
            // Step 1: Generate the base canvas from the SVG silhouette
            console.log("InpaintingPipeline | Rendering base canvas from SVG...");
            let currentImage = await this._generateBaseCanvas(this.state.svg);

            // Also save the layout image for debugging (same as standard pipeline)
            this.state.layoutImageBuffer = currentImage;

            // Step 2: Iterate over each room
            for (let i = 0; i < rooms.length; i++) {
                const room = rooms[i];
                const roomId = room.id;
                const roomLabel = room.name || roomId;
                const maxRetries = 3;
                let attempt = 0;
                let roomSuccess = false;

                while (attempt < maxRetries && !roomSuccess) {
                    attempt++;
                    const isRetry = attempt > 1;

                    if (isRetry) {
                        console.log(`InpaintingPipeline | Retrying room "${roomLabel}" (attempt ${attempt}/${maxRetries})`);
                        if (this.onRoomProgress) {
                            this.onRoomProgress("__retry__", i, rooms.length, roomLabel, attempt);
                        }
                    } else {
                        console.log(`InpaintingPipeline | Painting room ${i + 1}/${rooms.length}: "${roomLabel}" (id: ${roomId})`);
                        if (this.onRoomProgress) {
                            this.onRoomProgress(roomId, i, rooms.length);
                        }
                    }

                    // Extract the mask for this room
                    const mask = await this._extractRoomMask(this.state.svg, roomId);

                    // Build the room-specific prompt
                    const roomPrompt = this.imageGenerator.generateRoomPrompt(room, title);

                    // Inpaint this room onto the current canvas
                    const candidateImage = await this.imageGenerator.inpaintRegion(currentImage, mask, roomPrompt);

                    // Quality validation
                    const validation = await this.imageGenerator.validateInpaintQuality(candidateImage, roomLabel);

                    if (validation.pass) {
                        currentImage = candidateImage;
                        roomSuccess = true;
                        console.log(`InpaintingPipeline | ✓ Room "${roomLabel}" passed quality check: ${validation.reason}`);

                        if (this.onRoomProgress) {
                            this.onRoomProgress("__validated__", i, rooms.length, roomLabel, validation.reason);
                        }
                    } else {
                        console.warn(`InpaintingPipeline | ✗ Room "${roomLabel}" failed quality check (attempt ${attempt}): ${validation.reason}`);

                        if (this.onRoomProgress) {
                            this.onRoomProgress("__failed__", i, rooms.length, roomLabel, validation.reason);
                        }

                        // On final failed attempt, accept it anyway to avoid blocking the entire pipeline
                        if (attempt >= maxRetries) {
                            console.warn(`InpaintingPipeline | Max retries reached for "${roomLabel}". Accepting last result.`);
                            currentImage = candidateImage;
                            roomSuccess = true;

                            if (this.onRoomProgress) {
                                this.onRoomProgress("__accepted__", i, rooms.length, roomLabel);
                            }
                        }
                    }
                }
            }

            // Step 3: Store final composite
            this.state.imageBuffer = currentImage;

            // Fire final progress
            if (this.onRoomProgress) {
                this.onRoomProgress("__done__", rooms.length, rooms.length);
            }

            console.log("InpaintingPipeline | All rooms painted successfully.");
            return this.state.imageBuffer;

        } catch (error) {
            console.error("InpaintingPipeline | Phase 3 Failed:", error);
            throw error;
        }
    }
}
