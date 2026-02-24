import { VibeApplicationV2 } from "../../../vibe-common/scripts/ui/vibe-application.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * ProgressDialog
 * A standalone window that replaces the generator during long-running operations.
 * Shows scrolling text log during Phase 1 and SVG silhouette with blinking rooms during Phase 2.
 */
export class ProgressDialog extends HandlebarsApplicationMixin(VibeApplicationV2) {
    constructor(options = {}) {
        super(options);
        this._logEntries = [];
        this._svgContent = null;
        this._phase = options.phase || 1; // 1 = outline+SVG, 2 = image render
        this._blinkInterval = null;
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
     * Show the SVG silhouette with blinking rooms (Phase 2)
     */
    showSilhouette(svgString) {
        this._svgContent = svgString;
        this._phase = 2;
        this.render({ force: true });

        // Wait for render, then start blink loop
        setTimeout(() => this._startBlinkLoop(), 300);
    }

    /**
     * Start random room blink animation loop
     */
    _startBlinkLoop() {
        const container = this.element?.querySelector(".silhouette-container");
        if (!container) return;

        // Gather all room elements
        const rooms = container.querySelectorAll("[data-room-id]");
        if (rooms.length === 0) return;

        // Assign staggered random blink
        const usedDelays = new Set();
        rooms.forEach(room => {
            let delay;
            do {
                delay = Math.floor(Math.random() * rooms.length) * 0.4;
            } while (usedDelays.has(delay) && usedDelays.size < rooms.length);
            usedDelays.add(delay);

            room.classList.add("room-blinking");
            room.style.animationDelay = `${delay}s`;
        });

        // Periodically re-shuffle animation delays for randomness
        this._blinkInterval = setInterval(() => {
            const activeRooms = container.querySelectorAll("[data-room-id]");
            activeRooms.forEach(room => {
                const newDelay = Math.random() * activeRooms.length * 0.4;
                room.style.animationDelay = `${newDelay}s`;
            });
        }, 5000);
    }

    /**
     * Stop blink loop and clean up
     */
    _stopBlinkLoop() {
        if (this._blinkInterval) {
            clearInterval(this._blinkInterval);
            this._blinkInterval = null;
        }
    }

    close(options) {
        this._stopBlinkLoop();
        return super.close(options);
    }
}
