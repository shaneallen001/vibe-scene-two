import { GeneratorApp } from "./ui/generator-app.js";
import { HazardMonsterService } from "./services/hazard-monster-service.js";

Hooks.once('init', async function () {
    console.log('Vibe Scene Two | Initializing module');

    const module = game.modules.get("vibe-scene-two");
    if (module) {
        module.api = {
            GeneratorApp
        };
    }
});

Hooks.once('ready', async function () {
    console.log('Vibe Scene Two | Ready');
});

// Add a standalone button for testing the experimental workflow
Hooks.on('getSceneControlButtons', (controls) => {
    if (!game.user.isGM) return;

    const isObjectControls = !Array.isArray(controls);
    const tokenGroup = isObjectControls ? (controls["tokens"] || controls["token"]) : controls.find(c => c.name === "tokens" || c.name === "token");

    if (tokenGroup && tokenGroup.tools) {
        const tool = {
            name: "vibe-scene-two",
            title: "Vibe Scene Two (Experimental)",
            icon: "fas fa-map-marked",
            button: true,
            onClick: () => {
                const App = game.modules.get("vibe-scene-two")?.api?.GeneratorApp;
                if (App) new App().render(true);
            },
            onChange: () => {
                // Fallback for some Foundry versions
                const App = game.modules.get("vibe-scene-two")?.api?.GeneratorApp;
                if (App) new App().render(true);
            }
        };

        if (isObjectControls) {
            tokenGroup.tools["vibe-scene-two"] = tool;
        } else {
            tokenGroup.tools.push(tool);
        }
    }
});

// ─── Hazard Monster Generation — Document-Level Event Delegation ─────
// Uses event delegation to catch clicks on .vibe-generate-hazard-monsters
// buttons inside journal pages. This is more robust than render hooks
// because it works regardless of Foundry version or ApplicationV2 hook naming.
Hooks.once("ready", () => {
    document.addEventListener("click", async (event) => {
        const btn = event.target.closest(".vibe-generate-hazard-monsters");
        if (!btn || !game.user.isGM) return;

        event.preventDefault();
        event.stopPropagation();

        // Disable immediately to prevent double-clicks
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "⏳ Generating...";
        btn.style.opacity = "0.6";

        try {
            // Find the journal entry that owns this button by checking all open apps
            let journalEntry = null;

            // Check ApplicationV2 instances (Foundry v13+)
            if (foundry.applications?.instances) {
                for (const app of foundry.applications.instances.values()) {
                    const el = app.element;
                    if (el && el.contains(btn)) {
                        journalEntry = app.document instanceof JournalEntry
                            ? app.document
                            : app.document?.parent;
                        break;
                    }
                }
            }

            // Fallback: check legacy ui.windows (Foundry v11/v12)
            if (!journalEntry) {
                for (const app of Object.values(ui.windows || {})) {
                    const el = app.element instanceof jQuery ? app.element[0] : app.element;
                    if (el && el.contains(btn)) {
                        journalEntry = app.document instanceof JournalEntry
                            ? app.document
                            : (app.object instanceof JournalEntry ? app.object : null);
                        break;
                    }
                }
            }

            if (!journalEntry) {
                console.error("Vibe Scene Two | Could not find the parent JournalEntry for the clicked button.");
                btn.textContent = origText;
                btn.disabled = false;
                btn.style.opacity = "1";
                return;
            }

            // Find which page contains the hazard button
            // Each vibe-scene-two journal has one page per room
            const page = journalEntry.pages.find(p =>
                p.text?.content?.includes("vibe-generate-hazard-monsters")
            ) || journalEntry.pages.contents?.[0];

            if (!page) {
                console.error("Vibe Scene Two | Could not find a journal page with hazards.");
                btn.textContent = origText;
                btn.disabled = false;
                btn.style.opacity = "1";
                return;
            }

            console.log(`Vibe Scene Two | Generating hazard monsters for "${journalEntry.name}" / "${page.name}"`);
            await HazardMonsterService.generateMonstersFromHazards(journalEntry.id, page.id);

        } catch (err) {
            console.error("Vibe Scene Two | Hazard monster generation error:", err);
            btn.textContent = origText;
            btn.disabled = false;
            btn.style.opacity = "1";
        }
    });
});
