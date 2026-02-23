import { VibeApplicationV2 } from "../../../vibe-common/scripts/ui/vibe-application.js";
import { ScenePipeline } from "../services/pipeline.js";
import { VibeToast } from "../../../vibe-common/scripts/ui/toast-manager.js";
import { SceneBuilder } from "../services/scene-builder.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class GeneratorApp extends HandlebarsApplicationMixin(VibeApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.pipeline = new ScenePipeline();
        this.step = 1;
        this.userPrompt = "";
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
            finish: this.prototype._onFinish
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
            outline: this.pipeline.state.outline,
            svg: this.pipeline.state.svg,
            imageBuffer: this.pipeline.state.imageBuffer
        };
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

            if (!this.userPrompt) {
                VibeToast.warn("Please enter a concept for the scene.");
                return;
            }

            this.showLoading("Generating Outline and SVG Layout...");
            try {
                await this.pipeline.generateOutline(this.userPrompt);
                await this.pipeline.generateSvg();
                this.step = 2; // Move to review outline
            } catch (e) {
                VibeToast.error("Failed to generate layout: " + e.message);
            } finally {
                this.hideLoading();
                this.render({ force: true });
            }
        }
        else if (this.step === 2) {
            this.showLoading("Rendering Final Map Image with Imagen 4. This may take a minute...");
            try {
                await this.pipeline.generateImage();
                this.step = 3; // Move to review final image
            } catch (e) {
                VibeToast.error("Failed to render image: " + e.message);
            } finally {
                this.hideLoading();
                this.render({ force: true });
            }
        }
    }

    /**
     * Finish the workflow and create the scene
     */
    async _onFinish(event, target) {
        this.showLoading("Creating Scene in Foundry...");
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
            this.hideLoading();
        }
    }
}
