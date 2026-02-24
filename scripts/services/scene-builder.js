/**
 * Scene Builder
 * Interprets the generated state (SVG, outline, image) and constructs a playable Foundry Scene.
 */
export class SceneBuilder {
    /**
     * Create a Foundry Scene from the pipeline state
     * @param {Object} state - The pipeline state object
     */
    async createSceneFromState(state) {
        if (!state.imageBuffer || !state.outline || !state.svg) {
            throw new Error("Pipeline state is incomplete. Cannot build scene.");
        }

        console.log("SceneBuilder | Starting Scene construction...");

        // 1. Save Image to server
        const imagePath = await this._saveImageBuffer(state.imageBuffer, state.outline.title);

        if (state.layoutImageBuffer) {
            await this._saveImageBuffer(state.layoutImageBuffer, state.outline.title + "-layout");
            console.log("SceneBuilder | Saved companion layout image.");
        }

        // 2. Determine Map dimensions (Load the image to get native resolution)
        const dimensions = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => {
                console.warn("SceneBuilder | Could not load image to determine dimensions. Falling back to 1024x1024.");
                resolve({ width: 1024, height: 1024 });
            };
            img.src = imagePath;
        });

        const gridSize = 40; // standard 40px scale as requested

        // 3. Create the base Scene document
        const sceneData = {
            name: state.outline.title || "AI Generated Scene",
            navigation: true,
            background: {
                src: imagePath
            },
            width: dimensions.width,
            height: dimensions.height, // Use exact height from image
            grid: {
                size: gridSize,
                type: 1 // Square
            },
            tokenVision: true,
            fogExploration: true,
            description: state.outline.description
        };

        const scene = await Scene.create(sceneData);
        if (!scene) throw new Error("Failed to create Scene document in Foundry.");

        console.log(`SceneBuilder | Base scene created: ${scene.id}`);

        // 4. Parse SVG and potentially AI Vision data to extract logical walls, lights, and notes
        await this._addElementsFromSvgAndState(scene, state, dimensions.width, dimensions.height);

        return scene;
    }

    /**
     * Save the base64 image into the Foundry server
     */
    async _saveImageBuffer(b64, namePrefix) {
        const FilePickerClass = foundry.applications?.apps?.FilePicker?.implementation || FilePicker;

        // b64 to Blob
        const byteChars = atob(b64);
        const byteArrays = [];
        for (let offset = 0; offset < byteChars.length; offset += 1024) {
            const slice = byteChars.slice(offset, offset + 1024);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        const blob = new Blob(byteArrays, { type: "image/jpeg" });

        // Clean filename
        const cleanName = (namePrefix || "scene").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const filename = `vibe-scene-${cleanName}-${Date.now()}.jpg`;

        // Directory
        const dir = `worlds/${game.world.id}/ai-scenes`;

        // Ensure dir exists
        try {
            await FilePickerClass.browse("data", dir);
        } catch (e) {
            await FilePickerClass.createDirectory("data", dir);
        }

        const file = new File([blob], filename, { type: "image/jpeg" });
        const result = await FilePickerClass.upload("data", dir, file, { notify: false });

        return result.path;
    }

    /**
     * Parse the abstract SVG (and AI vision data if present) to extract locations for walls, journals, and lights.
     */
    async _addElementsFromSvgAndState(scene, state, targetW, targetH) {
        const svgString = state.svg;
        const outline = state.outline;

        // We create a temporary hidden DOM element to leverage browser SVG parsing
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, "image/svg+xml");
        const svgElement = doc.documentElement;

        if (svgElement.tagName.toLowerCase() !== "svg") {
            console.warn("SceneBuilder | Invalid SVG string; skipping wall/light placement.");
            return;
        }

        // Determine coordinate scale. Often viewBox="0 0 1000 1000"
        let viewBox = svgElement.getAttribute("viewBox");
        let scaleX = 1, scaleY = 1;

        if (viewBox) {
            const parts = viewBox.split(/[ ,]+/).map(Number);
            if (parts.length === 4) {
                const vw = parts[2] - parts[0];
                const vh = parts[3] - parts[1];
                scaleX = targetW / vw;
                scaleY = targetH / vh;
            }
        } else {
            // Guess
            scaleX = targetW / 1000;
            scaleY = targetH / 1000;
        }

        // Apply scene offset in case padding is enabled
        const offsetX = scene.dimensions?.sceneX || 0;
        const offsetY = scene.dimensions?.sceneY || 0;

        const wallsData = [];
        const lightsData = [];
        const notesData = [];
        const journalEntries = [];
        let doorsCount = 0;



        // Parse Rectangles (Assuming rooms are mostly rects)
        const rects = svgElement.querySelectorAll("rect");
        let roomIndex = 0;

        rects.forEach(rect => {
            const x = (Number(rect.getAttribute("x")) || 0) * scaleX + offsetX;
            const y = (Number(rect.getAttribute("y")) || 0) * scaleY + offsetY;
            const w = (Number(rect.getAttribute("width")) || 0) * scaleX;
            const h = (Number(rect.getAttribute("height")) || 0) * scaleY;

            if (w === 0 || h === 0) return;

            // 1. Create abstract walls from SVG rects format: c: [x1, y1, x2, y2]
            wallsData.push({ c: [x, y, x + w, y] });
            wallsData.push({ c: [x + w, y, x + w, y + h] });
            wallsData.push({ c: [x + w, y + h, x, y + h] });
            wallsData.push({ c: [x, y + h, x, y] });

            // Create central point
            const cx = x + (w / 2);
            const cy = y + (h / 2);

            // 2. Add an ambient light in the middle
            lightsData.push({
                x: cx,
                y: cy,
                rotation: 0,
                config: {
                    dim: Math.max(w, h),
                    bright: Math.max(w, h) / 2,
                    color: "#ffc880", // Warm torchlight
                    alpha: 0.2
                }
            });

            // 3. Match with Outline Room for Journal Note
            const roomId = rect.getAttribute("data-room-id");
            let roomDef;
            if (roomId && outline.rooms) {
                roomDef = outline.rooms.find(r => String(r.id) === String(roomId));
            }

            // Fallback for missing ID, or old generations: try index guessing
            if (!roomDef && outline.rooms && outline.rooms[roomIndex]) {
                roomDef = outline.rooms[roomIndex];
                roomIndex++;
            }

            if (roomDef) {
                journalEntries.push({
                    name: roomDef.name || "Unknown Room",
                    pages: [{
                        name: roomDef.name || "Unknown Room",
                        type: "text",
                        text: {
                            content: `<h2>${roomDef.name}</h2><p><strong>Size:</strong> ${roomDef.approximateSize || "standard"}</p><p><strong>Purpose:</strong> ${roomDef.purpose}</p>`
                        }
                    }],
                    _c: { cx, cy } // Temporary hold for note coordinates
                });
            }
        });

        // Parse Lines as Doors
        const lines = svgElement.querySelectorAll("line");
        lines.forEach(line => {
            const x1 = (Number(line.getAttribute("x1")) || 0) * scaleX + offsetX;
            const y1 = (Number(line.getAttribute("y1")) || 0) * scaleY + offsetY;
            const x2 = (Number(line.getAttribute("x2")) || 0) * scaleX + offsetX;
            const y2 = (Number(line.getAttribute("y2")) || 0) * scaleY + offsetY;

            if (x1 === x2 && y1 === y2) return;

            // Add as a door wall segment
            wallsData.push({
                c: [x1, y1, x2, y2],
                door: 1, // Door
                ds: 0    // Closed
            });
            doorsCount++;
        });

        // Write Journal Entries and Notes
        if (journalEntries.length > 0) {
            // Create a Folder for the Scene
            let folder = await Folder.create({ name: scene.name, type: "JournalEntry" });

            for (const jeData of journalEntries) {
                jeData.folder = folder.id;
                const coords = jeData._c;
                delete jeData._c;

                const journal = await JournalEntry.create(jeData);
                if (journal) {
                    notesData.push({
                        x: coords.cx,
                        y: coords.cy,
                        entryId: journal.id,
                        icon: "icons/svg/book.svg",
                        iconSize: 40,
                        text: journal.name,
                        fontFamily: "Signika",
                        fontSize: 32,
                        textAnchor: 1 // CENTER
                    });
                }
            }
        }

        // Embed documents into scene
        if (wallsData.length > 0 && state.options?.generateWalls !== false) {
            await scene.createEmbeddedDocuments("Wall", wallsData);
        } else if (state.options?.generateWalls === false) {
            console.log("SceneBuilder | Wall generation disabled by user, skipping.");
        }
        if (lightsData.length > 0) await scene.createEmbeddedDocuments("AmbientLight", lightsData);
        if (notesData.length > 0) await scene.createEmbeddedDocuments("Note", notesData);

        console.log(`SceneBuilder | Placed ${state.options?.generateWalls !== false ? wallsData.length : 0} wall segments (${doorsCount || 0} doors), ${lightsData.length} lights, and ${notesData.length} journals.`);

        // If tile overlay is enabled, add the layout image as a Tile
        if (state.options?.includeTileOverlay && state.layoutImageBuffer) {
            try {
                const tilePath = await this._saveImageBuffer(state.layoutImageBuffer, state.outline.title + "-tile-overlay");
                await scene.createEmbeddedDocuments("Tile", [{
                    texture: { src: tilePath },
                    x: offsetX,
                    y: offsetY,
                    width: targetW,
                    height: targetH,
                    overhead: false,
                    alpha: 0.5,
                    z: 100
                }]);
                console.log("SceneBuilder | Added layout image as tile overlay.");
            } catch (e) {
                console.warn("SceneBuilder | Failed to add tile overlay:", e.message);
            }
        }
    }
}
