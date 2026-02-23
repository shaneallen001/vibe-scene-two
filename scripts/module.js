import { GeneratorApp } from "./ui/generator-app.js";

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
