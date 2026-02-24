import { VibeApplicationV2 } from "../../../vibe-common/scripts/ui/vibe-application.js";
import { ScenePipeline } from "../services/pipeline.js";
import { InpaintingPipeline } from "../services/inpainting-pipeline.js";
import { VibeToast } from "../../../vibe-common/scripts/ui/toast-manager.js";
import { SceneBuilder } from "../services/scene-builder.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class GeneratorApp extends HandlebarsApplicationMixin(VibeApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.pipeline = new ScenePipeline();
        this.step = 1;
        this.userPrompt = "";
        this.includeRoomLabels = false;
        this.useInpaintingPipeline = false;
        this.isGenerating = false;
    }

    static DEFAULT_OPTIONS = {
        id: "vibe-scene-two-generator",
        title: "Vibe Scene Two - AI Generator",
        classes: ["vibe-app-v2", "vibe-theme", "vibe-scene-two"],
        position: { width: 700, height: "auto" },
        window: {
            icon: "fas fa-map-marked-alt",
            resizable: true,
        },
        actions: {
            next: this.prototype._onNextStep,
            back: this.prototype._onBackStep,
            finish: this.prototype._onFinish,
            randomize: this.prototype._onRandomize
        }
    };

    static PARTS = {
        main: {
            template: "modules/vibe-scene-two/templates/generator-app.hbs"
        }
    };

    /**
     * Prepares data for the Handlebars template
     */
    async _prepareContext(options) {
        return {
            step: this.step,
            userPrompt: this.userPrompt,
            includeRoomLabels: this.includeRoomLabels,
            useInpaintingPipeline: this.useInpaintingPipeline,
            isGenerating: this.isGenerating,
            outline: this.pipeline.state.outline,
            svg: this.pipeline.state.svg,
            imageBuffer: this.pipeline.state.imageBuffer
        };
    }

    // ---- Random Prompt Tables (40 items each) ----
    static MOODS = [
        "eerie", "cozy", "ancient", "crumbling", "opulent", "haunted", "overgrown", "frozen",
        "sunlit", "shadowy", "magical", "cursed", "sacred", "abandoned", "ruined", "bustling",
        "flooded", "burning", "petrified", "crystalline", "mossy", "dusty", "gilded", "blood-soaked",
        "serene", "foreboding", "mystical", "war-torn", "enchanted", "decrepit", "lavish", "moldy",
        "scorched", "windswept", "moonlit", "fog-shrouded", "vine-covered", "glittering", "submerged", "primitive"
    ];
    static LOCATIONS = [
        "tavern", "dungeon", "temple", "throne room", "crypt", "wizard's tower", "dragon's lair", "marketplace",
        "goblin warren", "sewer system", "bandit camp", "library", "alchemist's lab", "arena", "prison", "chapel",
        "mine shaft", "war camp", "noble's estate", "smuggler's den", "necromancer's sanctum", "fairy grove", "forge", "bathhouse",
        "observatory", "catacomb", "shipwreck", "cave network", "colosseum", "inn", "barracks", "greenhouse",
        "clocktower", "mausoleum", "thieves' guild", "harbor warehouse", "underground river", "ritual chamber", "hunting lodge", "brewery"
    ];
    static FEATURES = [
        "with a hidden passage behind a bookcase", "with a collapsed ceiling revealing the sky",
        "with a grand fireplace and trophy heads", "with a bubbling cauldron in the center",
        "with cages hanging from the ceiling", "with a spiral staircase descending into darkness",
        "with glowing runes etched into the floor", "with a central fountain of clear water",
        "with shelves overflowing with dusty tomes", "with a map table covered in war plans",
        "with a pit trap in the main corridor", "with stained glass windows depicting battles",
        "with a secret vault behind a false wall", "with chains and manacles on the walls",
        "with a raised dais and ancient altar", "with natural hot springs steaming gently",
        "with a drawbridge over a lava moat", "with mushrooms growing from every surface",
        "with a massive chandelier of bone", "with an underground waterfall",
        "with training dummies and weapon racks", "with a telescope aimed at the stars",
        "with barrels of ale stacked to the rafters", "with a frozen pond in the center",
        "with a massive pipe organ against one wall", "with kobold graffiti scratched everywhere",
        "with a partially excavated fossil", "with a portal shimmering in the corner",
        "with animated suits of armor standing guard", "with a banquet table set for a feast",
        "with roots breaking through the stone floor", "with a chessboard-patterned tile floor",
        "with curtains of spider silk", "with a sundial that moves on its own",
        "with a glass floor over a chasm below", "with trophy pelts hung on every wall",
        "with a mechanical clockwork orrery", "with bioluminescent fungi lighting the way",
        "with iron maidens lining the hallway", "with a mirrored ceiling reflecting everything"
    ];
    static ENVIRONMENTS = [
        "nestled deep in a dark forest", "carved into the side of a mountain",
        "floating on a lake", "hidden beneath a bustling city",
        "perched atop a sea cliff", "in the heart of an active volcano",
        "among the branches of a colossal tree", "in a desert oasis",
        "under a perpetual thunderstorm", "in the frozen tundra",
        "on a small island surrounded by fog", "in rolling green farmland",
        "beside a roaring waterfall", "in a swampy marshland",
        "at the bottom of a ravine", "on the edge of a magical rift",
        "along an ancient trade road", "in the ruins of a collapsed kingdom",
        "inside a giant petrified creature", "on a floating island in the sky",
        "beneath the roots of a dead world-tree", "at a crossroads of ley lines",
        "inside a glacier", "on the deck of a beached galleon",
        "at the mouth of a dragon's canyon", "surrounded by standing stones",
        "in a field of giant crystals", "under a blood-red moon",
        "overlooking a vast underground ocean", "at the base of a dormant golem",
        "in a pocket dimension", "beside a river of liquid silver",
        "within a coral reef dome", "on the back of a titan turtle",
        "in an eternal twilight glade", "amid the wreckage of an airship",
        "on a bridge spanning an abyss", "inside a hollowed-out meteor",
        "in a valley of howling winds", "at the edge of the known world"
    ];

    /**
     * Fill the prompt with a randomized scene description
     */
    async _onRandomize(event, target) {
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const mood = pick(GeneratorApp.MOODS);
        const location = pick(GeneratorApp.LOCATIONS);
        const feature = pick(GeneratorApp.FEATURES);
        const environment = pick(GeneratorApp.ENVIRONMENTS);

        const vowels = ['a', 'e', 'i', 'o', 'u'];
        const article = vowels.includes(mood[0].toLowerCase()) ? 'An' : 'A';
        const prompt = `${article} ${mood} ${location} ${feature}, ${environment}.`;

        const textarea = this.element.querySelector('textarea[name="userPrompt"]');
        if (textarea) {
            textarea.value = prompt;
            this.userPrompt = prompt;
        }
    }

    /**
     * Go back one step
     */
    async _onBackStep(event, target) {
        if (this.step > 1) {
            this.step--;
            this.render({ force: true });
        }
    }

    /**
     * Advance to the next generation step
     */
    async _onNextStep(event, target) {
        // Save prompt if we are on step 1
        if (this.step === 1) {
            const textarea = this.element.querySelector('textarea[name="userPrompt"]');
            if (textarea) this.userPrompt = textarea.value.trim();

            const checkbox = this.element.querySelector('input[name="includeRoomLabels"]');
            if (checkbox) this.includeRoomLabels = checkbox.checked;

            if (!this.userPrompt) {
                VibeToast.warn("Please enter a concept for the scene.");
                return;
            }

            this.isGenerating = true;
            this.render({ force: true });
            this.showLoading("Generating Outline and SVG Layout...");
            VibeToast.info("Brainstorming scene architecture...");
            try {
                await this.pipeline.generateOutline(this.userPrompt, {
                    includeRoomLabels: this.includeRoomLabels
                });

                VibeToast.info("Drawing SVG Layout boundaries...");
                await this.pipeline.generateSvg();
                this.step = 2; // Move to review outline
            } catch (e) {
                VibeToast.error("Failed to generate layout: " + e.message);
            } finally {
                this.isGenerating = false;
                this.hideLoading();
                this.render({ force: true });
            }
        }
        else if (this.step === 2) {
            const inpaintCheckbox = this.element.querySelector('input[name="useInpaintingPipeline"]');
            if (inpaintCheckbox) this.useInpaintingPipeline = inpaintCheckbox.checked;

            // If toggled, swap the pipeline implementation but keep the state
            if (this.useInpaintingPipeline && !(this.pipeline instanceof InpaintingPipeline)) {
                const oldState = this.pipeline.state;
                this.pipeline = new InpaintingPipeline();
                this.pipeline.state = oldState;
            } else if (!this.useInpaintingPipeline && (this.pipeline instanceof InpaintingPipeline)) {
                const oldState = this.pipeline.state;
                this.pipeline = new ScenePipeline();
                this.pipeline.state = oldState;
            }

            this.isGenerating = true;
            this.render({ force: true });

            const msg = this.useInpaintingPipeline
                ? "Rendering Final Map Image room-by-room (Inpainting). This may take a while..."
                : "Rendering Final Map Image with Imagen 4. This may take a minute...";

            this.showLoading(msg);
            VibeToast.info("Starting map diffusion process...");

            try {
                await this.pipeline.generateImage();
                this.step = 3; // Move to review final image
            } catch (e) {
                VibeToast.error("Failed to render image: " + e.message);
            } finally {
                this.isGenerating = false;
                this.hideLoading();
                this.render({ force: true });
            }
        }
    }

    /**
     * Finish the workflow and create the scene
     */
    async _onFinish(event, target) {
        this.isGenerating = true;
        this.render({ force: true });
        this.showLoading("Creating Scene in Foundry...");
        VibeToast.info("Transforming map into a playable scene...");
        try {
            const builder = new SceneBuilder();
            const scene = await builder.createSceneFromState(this.pipeline.state);
            VibeToast.info(`Scene "${scene.name}" created successfully!`);
            await scene.view();
            this.close();
        } catch (e) {
            VibeToast.error("Failed to create scene: " + e.message);
            console.error(e);
        } finally {
            this.isGenerating = false;
            this.hideLoading();
        }
    }
}
