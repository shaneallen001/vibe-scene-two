import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock Foundry globally in case imported services touch game hooks
global.foundry = {
    utils: {
        randomID: (len = 16) => {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            let result = "";
            for (let i = 0; i < len; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }
    }
};

global.game = {
    settings: {
        get: (module, setting) => {
            // Mock common api settings if necessary
            console.log(`Mocking game.settings.get for ${module}.${setting}`);
            return "imagen-4"; // example fallback
        }
    },
    user: {
        isGM: true
    }
};

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("Please set the GEMINI_API_KEY environment variable.");
    console.error("Example: $env:GEMINI_API_KEY='your_key_here'; npm run test:pipeline");
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.join(__dirname, 'test-output');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

async function runTest() {
    console.log("======================================");
    console.log("Vibe Scene Two | Local Test Loop Start");
    console.log("======================================");

    // We will dynamically import the pipeline once it's created
    const { ScenePipeline } = await import('./scripts/services/pipeline.js');
    const pipeline = new ScenePipeline(apiKey);

    let userPrompt = process.argv[2] || "A cozy interior of a fantasy tavern named 'The Prancing Pony'";
    console.log(`Test Prompt: "${userPrompt}"`);

    try {
        await pipeline.runFullTestingFlow(userPrompt);

        const outPath = path.join(outDir, 'phase1_outline.json');
        fs.writeFileSync(outPath, JSON.stringify(pipeline.state.outline, null, 2));
        console.log(`\nSaved Phase 1 output to ${outPath}`);
    } catch (error) {
        console.error("Test Loop Error:", error);
    }

    console.log("\n======================================");
    console.log("Vibe Scene Two | Local Test Loop End");
    console.log("======================================");
}

runTest();
