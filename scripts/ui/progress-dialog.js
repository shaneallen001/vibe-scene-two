import { VibeApplicationV2 } from "../../../vibe-common/scripts/ui/vibe-application.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * ProgressDialog
 * A standalone window that replaces the generator during long-running operations.
 * Shows scrolling text log during Phase 1 and SVG silhouette with light-trace animation during Phase 2.
 */
export class ProgressDialog extends HandlebarsApplicationMixin(VibeApplicationV2) {
    constructor(options = {}) {
        super(options);
        this._logEntries = [];
        this._svgContent = null;
        this._phase = options.phase || 1; // 1 = outline+SVG, 2 = image render
        this._traceAnimationFrame = null;
    }

    static DEFAULT_OPTIONS = {
        id: "vibe-scene-two-progress",
        title: "Vibe Scene Two — Generating...",
        classes: ["vibe-app-v2", "vibe-theme", "vibe-scene-two", "vibe-progress-dialog"],
        position: { width: 600, height: "auto" },
        window: {
            icon: "fas fa-cog fa-spin",
            resizable: false,
        }
    };

    static PARTS = {
        main: {
            template: "modules/vibe-scene-two/templates/progress-dialog.hbs"
        }
    };

    async _prepareContext(options) {
        return {
            phase: this._phase,
            hasSvg: !!this._svgContent,
            svgContent: this._svgContent
        };
    }

    /**
     * Add a log message to the scrolling log area
     */
    addLog(message, cssClass = "") {
        this._logEntries.push({ message, cssClass });
        const logEl = this.element?.querySelector(".progress-log");
        if (logEl) {
            const entry = document.createElement("div");
            entry.className = `log-entry ${cssClass}`;
            entry.textContent = `› ${message}`;
            logEl.appendChild(entry);
            logEl.scrollTop = logEl.scrollHeight;
        }
    }

    /**
     * Update the header status text
     */
    setStatus(text) {
        const el = this.element?.querySelector(".progress-status");
        if (el) el.textContent = text;
    }

    /**
     * Show the SVG silhouette with light-trace animation (Phase 2)
     */
    showSilhouette(svgString) {
        this._svgContent = svgString;
        this._phase = 2;
        this.render({ force: true });

        // Wait for render, then start the light-trace animation
        setTimeout(() => this._startTraceAnimation(), 300);
    }

    /**
     * Start a "construction beam" animation where a glowing dot traces
     * around each room outline sequentially, giving a "building" effect.
     */
    _startTraceAnimation() {
        const container = this.element?.querySelector(".silhouette-container");
        if (!container) return;

        const svgEl = container.querySelector("svg");
        if (!svgEl) return;

        // Gather all room elements and create overlay trace paths for each
        const rooms = svgEl.querySelectorAll("[data-room-id]");
        if (rooms.length === 0) return;

        // Ensure SVG has proper namespace for our overlay elements
        const ns = "http://www.w3.org/2000/svg";

        // Create a defs element for the glow filter if it doesn't exist
        let defs = svgEl.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS(ns, "defs");
            svgEl.prepend(defs);
        }

        // Add a glow filter for the tracing beam
        const filter = document.createElementNS(ns, "filter");
        filter.setAttribute("id", "traceGlow");
        filter.setAttribute("x", "-50%");
        filter.setAttribute("y", "-50%");
        filter.setAttribute("width", "200%");
        filter.setAttribute("height", "200%");
        const blur = document.createElementNS(ns, "feGaussianBlur");
        blur.setAttribute("stdDeviation", "4");
        blur.setAttribute("result", "glow");
        filter.appendChild(blur);
        const merge = document.createElementNS(ns, "feMerge");
        const mergeGlow = document.createElementNS(ns, "feMergeNode");
        mergeGlow.setAttribute("in", "glow");
        merge.appendChild(mergeGlow);
        const mergeOrig = document.createElementNS(ns, "feMergeNode");
        mergeOrig.setAttribute("in", "SourceGraphic");
        merge.appendChild(mergeOrig);
        filter.appendChild(merge);
        defs.appendChild(filter);

        // For each room, create a trace path (rect outline as a path)
        rooms.forEach((room, idx) => {
            let pathD = "";
            const tag = room.tagName.toLowerCase();

            if (tag === "rect") {
                const x = parseFloat(room.getAttribute("x")) || 0;
                const y = parseFloat(room.getAttribute("y")) || 0;
                const w = parseFloat(room.getAttribute("width")) || 0;
                const h = parseFloat(room.getAttribute("height")) || 0;
                pathD = `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
            } else if (tag === "circle") {
                const cx = parseFloat(room.getAttribute("cx")) || 0;
                const cy = parseFloat(room.getAttribute("cy")) || 0;
                const r = parseFloat(room.getAttribute("r")) || 0;
                // Approximate circle with arc path
                pathD = `M${cx - r},${cy} A${r},${r} 0 1,1 ${cx + r},${cy} A${r},${r} 0 1,1 ${cx - r},${cy} Z`;
            } else if (tag === "polygon") {
                const points = room.getAttribute("points");
                if (points) {
                    const pts = points.trim().split(/[\s,]+/);
                    for (let i = 0; i < pts.length; i += 2) {
                        pathD += (i === 0 ? "M" : " L") + `${pts[i]},${pts[i + 1]}`;
                    }
                    pathD += " Z";
                }
            }

            if (!pathD) return;

            const tracePath = document.createElementNS(ns, "path");
            tracePath.setAttribute("d", pathD);
            tracePath.setAttribute("fill", "none");
            tracePath.setAttribute("stroke", `hsl(${200 + idx * 30}, 80%, 65%)`);
            tracePath.setAttribute("stroke-width", "3");
            tracePath.setAttribute("filter", "url(#traceGlow)");
            tracePath.setAttribute("class", "trace-path");
            tracePath.setAttribute("opacity", "0");
            svgEl.appendChild(tracePath);

            // Calculate path length and set up dash animation
            requestAnimationFrame(() => {
                const len = tracePath.getTotalLength();
                tracePath.style.strokeDasharray = `${len}`;
                tracePath.style.strokeDashoffset = `${len}`;
                tracePath.setAttribute("opacity", "1");

                // Stagger each room's trace start
                const baseDelay = idx * 1.2;
                tracePath.style.animation = `traceBeam 2s ${baseDelay}s ease-in-out infinite`;
            });
        });
    }

    /**
     * Stop trace animation and clean up
     */
    _stopTraceAnimation() {
        if (this._traceAnimationFrame) {
            cancelAnimationFrame(this._traceAnimationFrame);
            this._traceAnimationFrame = null;
        }
    }

    /**
     * Highlight a specific room as "currently generating" in the silhouette.
     * Previously highlighted rooms transition to "completed" (green).
     * @param {string} roomId - The data-room-id to highlight
     */
    highlightRoom(roomId) {
        const container = this.element?.querySelector(".silhouette-container");
        if (!container) return;

        // Stop the trace animation — we're doing targeted highlights now
        this._stopTraceAnimation();

        // Remove trace paths
        const tracePaths = container.querySelectorAll(".trace-path");
        tracePaths.forEach(p => p.remove());

        // Move any currently-active room to completed state
        const activeRooms = container.querySelectorAll("[data-room-id].room-active");
        activeRooms.forEach(el => {
            el.classList.remove("room-active", "room-blinking");
            el.classList.add("room-completed");
        });

        // Highlight the new room
        const targetRoom = container.querySelector(`[data-room-id="${roomId}"]`);
        if (targetRoom) {
            targetRoom.classList.remove("room-blinking", "room-completed");
            targetRoom.classList.add("room-active");
        }
    }

    /**
     * Mark all rooms as completed (used when inpainting finishes).
     */
    markAllRoomsComplete() {
        const container = this.element?.querySelector(".silhouette-container");
        if (!container) return;

        this._stopTraceAnimation();
        const tracePaths = container.querySelectorAll(".trace-path");
        tracePaths.forEach(p => p.remove());

        const allRooms = container.querySelectorAll("[data-room-id]");
        allRooms.forEach(el => {
            el.classList.remove("room-blinking", "room-active");
            el.classList.add("room-completed");
        });
    }

    close(options) {
        this._stopTraceAnimation();
        return super.close(options);
    }
}
