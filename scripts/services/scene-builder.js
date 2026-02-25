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

    // ─── Geometry Helpers ───────────────────────────────────────────────

    /**
     * Check if a point lies on a line segment within a tolerance.
     */
    _pointOnSegment(px, py, ax, ay, bx, by, tol = 4) {
        const lenAB = Math.hypot(bx - ax, by - ay);
        if (lenAB < 0.1) return false;
        const cross = Math.abs((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / lenAB;
        if (cross > tol) return false;
        const dot = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (lenAB * lenAB);
        return dot >= -0.01 && dot <= 1.01;
    }

    /**
     * Project a point onto a line segment, returning the 0-1 parameter.
     */
    _projectParam(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 < 0.01) return 0;
        return ((px - ax) * dx + (py - ay) * dy) / len2;
    }

    /**
     * Split a wall segment into sub-segments that leave gaps where doors are.
     * @param {number[]} wall - [x1,y1,x2,y2] of the wall
     * @param {Array} doors - Array of {c:[x1,y1,x2,y2]} door objects
     * @param {number} tol - Tolerance in pixels for matching doors to walls
     * @returns {Array} Array of {c:[x1,y1,x2,y2]} wall sub-segments
     */
    _splitWallForDoors(wall, doors, tol = 6) {
        const [ax, ay, bx, by] = wall;

        // Find all doors that lie on this wall
        const overlaps = [];
        for (const door of doors) {
            const [dx1, dy1, dx2, dy2] = door.c;
            const onSeg1 = this._pointOnSegment(dx1, dy1, ax, ay, bx, by, tol);
            const onSeg2 = this._pointOnSegment(dx2, dy2, ax, ay, bx, by, tol);
            if (onSeg1 && onSeg2) {
                let t1 = this._projectParam(dx1, dy1, ax, ay, bx, by);
                let t2 = this._projectParam(dx2, dy2, ax, ay, bx, by);
                if (t1 > t2) [t1, t2] = [t2, t1];
                overlaps.push({ t1: Math.max(0, t1), t2: Math.min(1, t2) });
            }
        }

        if (overlaps.length === 0) return [{ c: wall }];

        // Sort and merge overlapping door ranges
        overlaps.sort((a, b) => a.t1 - b.t1);
        const merged = [overlaps[0]];
        for (let i = 1; i < overlaps.length; i++) {
            const last = merged[merged.length - 1];
            if (overlaps[i].t1 <= last.t2 + 0.001) {
                last.t2 = Math.max(last.t2, overlaps[i].t2);
            } else {
                merged.push(overlaps[i]);
            }
        }

        // Build sub-segments around the gaps
        const dx = bx - ax, dy = by - ay;
        const lerp = (t) => [ax + dx * t, ay + dy * t];
        const result = [];
        let cursor = 0;

        for (const gap of merged) {
            if (gap.t1 > cursor + 0.001) {
                const [sx, sy] = lerp(cursor);
                const [ex, ey] = lerp(gap.t1);
                result.push({ c: [sx, sy, ex, ey] });
            }
            cursor = gap.t2;
        }
        if (cursor < 1 - 0.001) {
            const [sx, sy] = lerp(cursor);
            result.push({ c: [sx, sy, bx, by] });
        }

        return result;
    }

    /**
     * Approximate a circle/ellipse into N-gon edges.
     * @returns {Array} Array of [x1,y1,x2,y2] edge segments
     */
    _circleToEdges(cx, cy, rx, ry, segments = 24) {
        const edges = [];
        for (let i = 0; i < segments; i++) {
            const a1 = (2 * Math.PI * i) / segments;
            const a2 = (2 * Math.PI * (i + 1)) / segments;
            edges.push([
                cx + rx * Math.cos(a1), cy + ry * Math.sin(a1),
                cx + rx * Math.cos(a2), cy + ry * Math.sin(a2)
            ]);
        }
        return edges;
    }

    /**
     * Parse SVG <polygon> points attribute into edges.
     * @returns {Array} Array of [x1,y1,x2,y2] edge segments
     */
    _polygonToEdges(pointsAttr) {
        const nums = pointsAttr.trim().split(/[\s,]+/).map(Number);
        const pts = [];
        for (let i = 0; i < nums.length - 1; i += 2) {
            pts.push([nums[i], nums[i + 1]]);
        }
        if (pts.length < 3) return [];
        const edges = [];
        for (let i = 0; i < pts.length; i++) {
            const next = (i + 1) % pts.length;
            edges.push([pts[i][0], pts[i][1], pts[next][0], pts[next][1]]);
        }
        return edges;
    }

    /**
     * Parse a simple SVG <path> (M, L, A, Z commands) into edges.
     * Arcs are approximated as line sub-segments.
     * @returns {Array} Array of [x1,y1,x2,y2] edge segments
     */
    _pathToEdges(d) {
        const edges = [];
        // Tokenize: split into commands and their numeric args
        const tokens = d.match(/[MLAZHVCSQmlahvcsqz]|[-+]?[0-9]*\.?[0-9]+/g);
        if (!tokens) return edges;

        let cx = 0, cy = 0, startX = 0, startY = 0;
        let i = 0;
        const num = () => parseFloat(tokens[i++]);

        while (i < tokens.length) {
            const cmd = tokens[i++];
            switch (cmd) {
                case 'M':
                    cx = num(); cy = num();
                    startX = cx; startY = cy;
                    break;
                case 'm':
                    cx += num(); cy += num();
                    startX = cx; startY = cy;
                    break;
                case 'L': {
                    const nx = num(), ny = num();
                    edges.push([cx, cy, nx, ny]);
                    cx = nx; cy = ny;
                    break;
                }
                case 'l': {
                    const dx = num(), dy = num();
                    const nx = cx + dx, ny = cy + dy;
                    edges.push([cx, cy, nx, ny]);
                    cx = nx; cy = ny;
                    break;
                }
                case 'H': {
                    const nx = num();
                    edges.push([cx, cy, nx, cy]);
                    cx = nx;
                    break;
                }
                case 'h': {
                    const dx = num();
                    edges.push([cx, cy, cx + dx, cy]);
                    cx += dx;
                    break;
                }
                case 'V': {
                    const ny = num();
                    edges.push([cx, cy, cx, ny]);
                    cy = ny;
                    break;
                }
                case 'v': {
                    const dy = num();
                    edges.push([cx, cy, cx, cy + dy]);
                    cy += dy;
                    break;
                }
                case 'A': {
                    // rx ry x-axis-rotation large-arc-flag sweep-flag x y
                    const rx = num(), ry = num();
                    num(); num(); num(); // rotation, large-arc, sweep (ignored for approx)
                    const ex = num(), ey = num();
                    // Approximate arc as 8 sub-segments
                    const steps = 8;
                    for (let s = 0; s < steps; s++) {
                        const t1 = s / steps, t2 = (s + 1) / steps;
                        const x1 = cx + (ex - cx) * t1, y1 = cy + (ey - cy) * t1;
                        const x2 = cx + (ex - cx) * t2, y2 = cy + (ey - cy) * t2;
                        edges.push([x1, y1, x2, y2]);
                    }
                    cx = ex; cy = ey;
                    break;
                }
                case 'a': {
                    const rx = num(), ry = num();
                    num(); num(); num();
                    const dx = num(), dy = num();
                    const ex = cx + dx, ey = cy + dy;
                    const steps = 8;
                    for (let s = 0; s < steps; s++) {
                        const t1 = s / steps, t2 = (s + 1) / steps;
                        const x1 = cx + (ex - cx) * t1, y1 = cy + (ey - cy) * t1;
                        const x2 = cx + (ex - cx) * t2, y2 = cy + (ey - cy) * t2;
                        edges.push([x1, y1, x2, y2]);
                    }
                    cx = ex; cy = ey;
                    break;
                }
                case 'Z':
                case 'z':
                    if (Math.hypot(cx - startX, cy - startY) > 0.5) {
                        edges.push([cx, cy, startX, startY]);
                    }
                    cx = startX; cy = startY;
                    break;
                default:
                    // Skip unknown commands / extra numbers
                    break;
            }
        }
        return edges;
    }

    /**
     * Build rich HTML content for a journal page from room data.
     */
    _buildJournalHtml(roomDef) {
        const parts = [];

        parts.push(`<h2>${roomDef.name}</h2>`);
        parts.push(`<p><em>${roomDef.approximateSize || "standard"} room — ${roomDef.purpose}</em></p>`);

        // Read-aloud box
        if (roomDef.readAloud) {
            parts.push(`<blockquote style="border-left:4px solid #c9a44a;padding:8px 12px;background:#2a2520;color:#e8d5b5;font-style:italic;margin:12px 0;">
<strong>📖 Read Aloud:</strong><br>${roomDef.readAloud}
</blockquote>`);
        }

        // Atmosphere
        if (roomDef.atmosphere) {
            parts.push(`<p style="color:#a89070;font-style:italic;">🌫️ ${roomDef.atmosphere}</p>`);
        }

        // Features
        if (roomDef.features && roomDef.features.length > 0) {
            parts.push(`<h3>Notable Features</h3><ul>${roomDef.features.map(f => `<li>${f}</li>`).join("")}</ul>`);
        }

        // Hazards
        if (roomDef.hazards && roomDef.hazards.length > 0) {
            parts.push(`<h3>⚠️ Hazards</h3><ul style="color:#cc4444;">${roomDef.hazards.map(h => `<li>${h}</li>`).join("")}</ul>`);
        }

        // Interactables
        if (roomDef.interactables && roomDef.interactables.length > 0) {
            parts.push(`<h3>🔍 Investigate</h3><ul>${roomDef.interactables.map(t => `<li>${t}</li>`).join("")}</ul>`);
        }

        // Fallback for old-style outline data with no rich fields
        if (!roomDef.readAloud && !roomDef.features && !roomDef.hazards && !roomDef.interactables) {
            parts.push(`<p><strong>Purpose:</strong> ${roomDef.purpose}</p>`);
        }

        return parts.join("\n");
    }

    /**
     * Parse the abstract SVG to extract locations for walls, journals, and lights.
     * Doors are parsed FIRST so wall segments can be split around them.
     */
    async _addElementsFromSvgAndState(scene, state, targetW, targetH) {
        const svgString = state.svg;
        const outline = state.outline;

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, "image/svg+xml");
        const svgElement = doc.documentElement;

        if (svgElement.tagName.toLowerCase() !== "svg") {
            console.warn("SceneBuilder | Invalid SVG string; skipping wall/light placement.");
            return;
        }

        // Determine coordinate scale
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
            scaleX = targetW / 1000;
            scaleY = targetH / 1000;
        }

        const offsetX = scene.dimensions?.sceneX || 0;
        const offsetY = scene.dimensions?.sceneY || 0;

        const wallsData = [];
        const lightsData = [];
        const notesData = [];
        const journalEntries = [];

        // ──────────────────────────────────────────────────
        // STEP 1: Parse ALL doors first so we can split walls around them
        // ──────────────────────────────────────────────────
        const doorSegments = [];
        const lines = svgElement.querySelectorAll("line");
        lines.forEach(line => {
            const x1 = (Number(line.getAttribute("x1")) || 0) * scaleX + offsetX;
            const y1 = (Number(line.getAttribute("y1")) || 0) * scaleY + offsetY;
            const x2 = (Number(line.getAttribute("x2")) || 0) * scaleX + offsetX;
            const y2 = (Number(line.getAttribute("y2")) || 0) * scaleY + offsetY;
            if (x1 === x2 && y1 === y2) return;
            doorSegments.push({ c: [x1, y1, x2, y2], door: 1, ds: 0 });
        });

        // Add door segments to wall data
        doorSegments.forEach(d => wallsData.push(d));
        console.log(`SceneBuilder | Found ${doorSegments.length} door segment(s).`);

        // ──────────────────────────────────────────────────
        // STEP 2: Parse room shapes and split walls around doors
        // ──────────────────────────────────────────────────
        let roomIndex = 0;

        /**
         * Process a single room shape: create walls (split around doors),
         * a light placeholder, and a journal entry.
         */
        const processRoom = (el, edges, cx, cy, radius) => {
            const isOutdoor = el.getAttribute("data-outdoor") === "true";

            // Create walls (split around doors) unless outdoor
            if (!isOutdoor) {
                for (const edge of edges) {
                    const scaled = [
                        edge[0] * scaleX + offsetX,
                        edge[1] * scaleY + offsetY,
                        edge[2] * scaleX + offsetX,
                        edge[3] * scaleY + offsetY
                    ];
                    const subWalls = this._splitWallForDoors(scaled, doorSegments);
                    subWalls.forEach(sw => wallsData.push(sw));
                }
            }

            // Scaled center
            const sCx = cx * scaleX + offsetX;
            const sCy = cy * scaleY + offsetY;
            const sRadius = radius * Math.max(scaleX, scaleY);

            // Placeholder light (will be replaced by AI vision lights in improvement #4)
            lightsData.push({
                x: sCx, y: sCy, rotation: 0,
                config: {
                    dim: sRadius * 2,
                    bright: sRadius,
                    color: "#ffc880",
                    alpha: 0.2
                }
            });

            // Match with outline room
            const roomId = el.getAttribute("data-room-id");
            let roomDef;
            if (roomId && outline.rooms) {
                roomDef = outline.rooms.find(r => String(r.id) === String(roomId));
            }
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
                        text: { content: this._buildJournalHtml(roomDef) }
                    }],
                    _c: { cx: sCx, cy: sCy }
                });
            }
        };

        // ── Rectangles ──
        svgElement.querySelectorAll("rect").forEach(rect => {
            const x = Number(rect.getAttribute("x")) || 0;
            const y = Number(rect.getAttribute("y")) || 0;
            const w = Number(rect.getAttribute("width")) || 0;
            const h = Number(rect.getAttribute("height")) || 0;
            if (w === 0 || h === 0) return;

            const edges = [
                [x, y, x + w, y],
                [x + w, y, x + w, y + h],
                [x + w, y + h, x, y + h],
                [x, y + h, x, y]
            ];
            processRoom(rect, edges, x + w / 2, y + h / 2, Math.max(w, h) / 2);
        });

        // ── Circles ──
        svgElement.querySelectorAll("circle").forEach(circle => {
            const cx = Number(circle.getAttribute("cx")) || 0;
            const cy = Number(circle.getAttribute("cy")) || 0;
            const r = Number(circle.getAttribute("r")) || 0;
            if (r === 0) return;
            const edges = this._circleToEdges(cx, cy, r, r, 24);
            processRoom(circle, edges, cx, cy, r);
        });

        // ── Ellipses ──
        svgElement.querySelectorAll("ellipse").forEach(ellipse => {
            const cx = Number(ellipse.getAttribute("cx")) || 0;
            const cy = Number(ellipse.getAttribute("cy")) || 0;
            const rx = Number(ellipse.getAttribute("rx")) || 0;
            const ry = Number(ellipse.getAttribute("ry")) || 0;
            if (rx === 0 || ry === 0) return;
            const edges = this._circleToEdges(cx, cy, rx, ry, 24);
            processRoom(ellipse, edges, cx, cy, Math.max(rx, ry));
        });

        // ── Polygons ──
        svgElement.querySelectorAll("polygon").forEach(poly => {
            const pts = poly.getAttribute("points");
            if (!pts) return;
            const edges = this._polygonToEdges(pts);
            if (edges.length === 0) return;
            // Compute centroid
            const nums = pts.trim().split(/[\s,]+/).map(Number);
            let cx = 0, cy = 0, count = 0;
            for (let i = 0; i < nums.length - 1; i += 2) {
                cx += nums[i]; cy += nums[i + 1]; count++;
            }
            cx /= count; cy /= count;
            const maxDist = edges.reduce((m, e) => Math.max(m, Math.hypot(e[0] - cx, e[1] - cy)), 0);
            processRoom(poly, edges, cx, cy, maxDist);
        });

        // ── Paths ──
        svgElement.querySelectorAll("path").forEach(pathEl => {
            const d = pathEl.getAttribute("d");
            if (!d) return;
            const edges = this._pathToEdges(d);
            if (edges.length === 0) return;
            // Compute centroid from edge midpoints
            let cx = 0, cy = 0;
            for (const e of edges) {
                cx += (e[0] + e[2]) / 2;
                cy += (e[1] + e[3]) / 2;
            }
            cx /= edges.length; cy /= edges.length;
            const maxDist = edges.reduce((m, e) => Math.max(m, Math.hypot(e[0] - cx, e[1] - cy)), 0);
            processRoom(pathEl, edges, cx, cy, maxDist);
        });

        // ──────────────────────────────────────────────────
        // STEP 3: Create Journals & Notes
        // ──────────────────────────────────────────────────
        if (journalEntries.length > 0) {
            let folder = await Folder.create({ name: scene.name, type: "JournalEntry" });
            for (const jeData of journalEntries) {
                jeData.folder = folder.id;
                const coords = jeData._c;
                delete jeData._c;
                const journal = await JournalEntry.create(jeData);
                if (journal) {
                    notesData.push({
                        x: coords.cx, y: coords.cy,
                        entryId: journal.id,
                        icon: "icons/svg/book.svg",
                        iconSize: 40,
                        text: journal.name,
                        fontFamily: "Signika",
                        fontSize: 32,
                        textAnchor: 1
                    });
                }
            }
        }

        // ──────────────────────────────────────────────────
        // STEP 4: Embed documents into scene
        // ──────────────────────────────────────────────────
        if (wallsData.length > 0 && state.options?.generateWalls !== false) {
            await scene.createEmbeddedDocuments("Wall", wallsData);
        } else if (state.options?.generateWalls === false) {
            console.log("SceneBuilder | Wall generation disabled by user, skipping.");
        }
        if (lightsData.length > 0) await scene.createEmbeddedDocuments("AmbientLight", lightsData);
        if (notesData.length > 0) await scene.createEmbeddedDocuments("Note", notesData);

        const doorCount = doorSegments.length;
        const wallCount = state.options?.generateWalls !== false ? wallsData.length - doorCount : 0;
        console.log(`SceneBuilder | Placed ${wallCount} wall segments + ${doorCount} doors, ${lightsData.length} lights, and ${notesData.length} journals.`);

        // Tile overlay
        if (state.options?.includeTileOverlay && state.layoutImageBuffer) {
            try {
                const tilePath = await this._saveImageBuffer(state.layoutImageBuffer, state.outline.title + "-tile-overlay");
                await scene.createEmbeddedDocuments("Tile", [{
                    texture: { src: tilePath },
                    x: offsetX, y: offsetY,
                    width: targetW, height: targetH,
                    overhead: false, alpha: 0.5, z: 100
                }]);
                console.log("SceneBuilder | Added layout image as tile overlay.");
            } catch (e) {
                console.warn("SceneBuilder | Failed to add tile overlay:", e.message);
            }
        }
    }
}
