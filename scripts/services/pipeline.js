import { SceneOutlineGenerator } from "./scene-outline-generator.js";
import { SvgGenerator } from "./svg-generator.js";
import { SceneImageGenerator } from "./image-generator.js";

/**
 * ScenePipeline
 * State machine / orchestrator for the multi-step scene generation process.
 */
export class ScenePipeline {
    constructor(apiKey) {
        // If running in Foundry, we grab the API key from vibe-common settings.
        // Otherwise (testing loop), it's passed in.
        if (!apiKey && typeof game !== "undefined") {
            try {
                apiKey = game.settings.get("vibe-common", "geminiApiKey");
            } catch (e) {
                console.warn("ScenePipeline | Could not retrieve API key from settings.");
            }
        }

        this.apiKey = apiKey;
        this.state = {
            userConcept: "",
            outline: null,
            svg: null,
            imageBuffer: null,
            sceneId: null,
            options: {}
        };

        this.outlineGenerator = new SceneOutlineGenerator(this.apiKey);
        this.svgGenerator = new SvgGenerator(this.apiKey);
        this.imageGenerator = new SceneImageGenerator(this.apiKey);
    }

    /**
     * Phase 1: Generate Conceptual Outline
     */
    async generateOutline(userPrompt, options = {}) {
        console.log(`ScenePipeline | --- PHASE 1: Concept to Outline ---`);
        this.state.userConcept = userPrompt;
        this.state.options = options;

        try {
            this.state.outline = await this.outlineGenerator.generateOutline(userPrompt);
            return this.state.outline;
        } catch (error) {
            console.error("ScenePipeline | Phase 1 Failed:", error);
            throw error;
        }
    }

    /**
     * Phase 2: Generate SVG Layout
     */
    async generateSvg() {
        console.log(`ScenePipeline | --- PHASE 2: Outline to SVG ---`);
        if (!this.state.outline) throw new Error("Missing outline for Phase 2");

        try {
            this.state.svg = await this.svgGenerator.generateSvg(this.state.outline, this.state.options);
            return this.state.svg;
        } catch (error) {
            console.error("ScenePipeline | Phase 2 Failed:", error);
            throw error;
        }
    }

    /**
     * Phase 3: Generate Image Map
     */
    async generateImage() {
        console.log(`ScenePipeline | --- PHASE 3: SVG/Outline to Image ---`);
        if (!this.state.outline) throw new Error("Missing outline for Phase 3");

        try {
            const finalPrompt = await this.imageGenerator.generateFinalPrompt(this.state.outline, this.state.options);
            const result = await this.imageGenerator.generateImage(finalPrompt, this.state.svg, undefined, this.state.options);
            this.state.imageBuffer = result.finalImage;
            this.state.layoutImageBuffer = result.layoutImage;

            return this.state.imageBuffer;
        } catch (error) {
            console.error("ScenePipeline | Phase 3 Failed:", error);
            throw error;
        }
    }

    /**
     * Temporary run method for the testing loop to exercise flow sequentially
     */
    async runFullTestingFlow(userPrompt) {
        console.log("ScenePipeline | Starting full test flow...");
        await this.generateOutline(userPrompt);
        await this.generateSvg();
        await this.generateImage();

        console.log("ScenePipeline | Flow complete for now."); // Avoid logging entire base64 image
        return this.state;
    }
}
