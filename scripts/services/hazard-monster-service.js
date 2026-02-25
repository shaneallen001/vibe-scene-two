/**
 * Hazard Monster Service
 * Analyzes journal hazard text and generates a single D&D 5e actor via the Vibe Actor API.
 * Provides live inline progress updates directly in the journal page.
 */

import { callGemini, extractJson } from "../../../vibe-common/scripts/services/gemini-service.js";
import { getGeminiApiKey } from "../../../vibe-common/scripts/settings.js";
import { VibeToast } from "../../../vibe-common/scripts/ui/toast-manager.js";

/** Unique HTML marker used to identify the progress element in journal content. */
const PROGRESS_MARKER = 'vibe-hazard-progress';

export class HazardMonsterService {

    /**
     * System prompt for the monster-extraction AI call.
     */
    static get MONSTER_EXTRACTION_PROMPT() {
        return `You are a D&D 5e monster designer. You are given the full text of a dungeon room journal entry generated for a Foundry VTT scene. The room contains one or more hazards.

Your job is to analyze the room description, atmosphere, and hazard text to create ONE concrete MONSTER concept that would inhabit or guard this room. The monster should feel thematically tied to the room's vibe and story.

Output JSON ONLY, as a single object:
{
  "name": "Monster Name",
  "prompt": "A vivid, detailed description of the monster — its appearance, behavior, lore, and combat style. This will be sent directly to an AI actor generator, so be thorough and evocative. Include how it relates to the room.",
  "cr": 3,
  "type": "monstrosity",
  "size": "large"
}

RULES:
- cr must be a number (0.125, 0.25, 0.5, or 1-30).
- type must be one of: aberration, beast, celestial, construct, dragon, elemental, fey, fiend, giant, humanoid, monstrosity, ooze, plant, undead.
- size must be one of: tiny, small, medium, large, huge, gargantuan.
- If the hazard describes a trap or environmental effect rather than a creature, invent a thematic guardian creature that would logically be associated with that hazard.
- The prompt field should be 2-4 sentences, rich and specific enough for a full actor generation.
- Return exactly ONE monster.`;
    }

    /**
     * Generate a single monster from a journal page's hazard section,
     * with live inline progress updates in the journal.
     * @param {string} journalEntryId - The JournalEntry document ID
     * @param {string} pageId - The JournalEntryPage ID
     */
    static async generateMonstersFromHazards(journalEntryId, pageId) {
        const journal = game.journal.get(journalEntryId);
        if (!journal) {
            VibeToast.error("Could not find journal entry.");
            return;
        }

        const page = journal.pages.get(pageId);
        if (!page) {
            VibeToast.error("Could not find journal page.");
            return;
        }

        // Check that vibe-actor is available
        const vibeActorApi = game.modules.get("vibe-actor")?.api;
        if (!vibeActorApi?.GeminiPipeline) {
            VibeToast.error("Vibe Actor module is required but not available. Please enable it.");
            return;
        }

        const apiKey = getGeminiApiKey();
        const pageText = page.text?.content || "";

        if (!pageText.trim()) {
            VibeToast.error("Journal page has no content to analyze.");
            return;
        }

        // Insert initial progress line into the journal
        await this._updateProgress(page, "🐉 Analyzing hazards…", 0);

        try {
            // Step 1: AI call to extract a single monster concept
            await this._updateProgress(page, "🧠 Reading room context and extracting monster concept…", 5);
            const concept = await this._extractMonsterConcept(apiKey, pageText);

            if (!concept || !concept.name) {
                await this._clearProgress(page);
                VibeToast.warning("AI could not identify a monster from the hazards.");
                return;
            }

            console.log("HazardMonsterService | Monster concept extracted:", concept);
            await this._updateProgress(page, `🐉 Designing: <strong>${concept.name}</strong>`, 10);

            // Step 2: Generate the monster via Vibe Actor pipeline with progress callbacks
            const pipeline = new vibeActorApi.GeminiPipeline(apiKey);

            const actorData = await pipeline.generateActor(
                {
                    prompt: concept.prompt,
                    cr: concept.cr,
                    type: concept.type,
                    size: concept.size
                },
                {
                    onProgress: async (message, percent) => {
                        // Map pipeline progress messages to user-friendly blurbs
                        let display = message;
                        if (message.includes("Architecting")) {
                            display = `📐 Architecting <strong>${concept.name}</strong> — stats, abilities, lore…`;
                        } else if (message.includes("Selecting equipment")) {
                            display = `⚔️ Selecting equipment & features for <strong>${concept.name}</strong>…`;
                        } else if (message.includes("Fabricating")) {
                            display = `🔨 Forging custom abilities for <strong>${concept.name}</strong>…`;
                        } else if (message.includes("Painting icons")) {
                            display = `🎨 Painting item icons for <strong>${concept.name}</strong>…`;
                        } else if (message.includes("Assembling")) {
                            display = `🧩 Assembling final actor sheet for <strong>${concept.name}</strong>…`;
                        } else if (message.includes("Complete")) {
                            display = `✅ <strong>${concept.name}</strong> forged successfully!`;
                        }
                        await this._updateProgress(page, display, percent);
                    }
                }
            );

            // Step 3: Create the actor in Foundry
            await this._updateProgress(page, `📦 Creating <strong>${concept.name}</strong> in Actor Directory…`, 95);
            const actor = await Actor.create(actorData);

            if (actor) {
                console.log(`HazardMonsterService | Created actor: ${actor.name} (${actor.id})`);

                // Step 4: Replace progress with the final linked actor
                await this._finalizeWithActorLink(page, actor);
                VibeToast.success(`🐉 ${actor.name} created and linked!`);
            } else {
                await this._clearProgress(page);
                VibeToast.error("Failed to create the actor document.");
            }

        } catch (err) {
            console.error("HazardMonsterService | Error:", err);
            await this._clearProgress(page);
            VibeToast.error(`Monster generation failed: ${err.message}`);
        }
    }

    /**
     * Call Gemini to extract a single monster concept from journal text.
     * @param {string} apiKey
     * @param {string} journalHtml - The full HTML content of the journal page
     * @returns {Object} {name, prompt, cr, type, size}
     */
    static async _extractMonsterConcept(apiKey, journalHtml) {
        // Strip HTML tags to get clean text for the AI
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = journalHtml;
        const plainText = tempDiv.textContent || tempDiv.innerText || "";

        const fullPrompt = `${this.MONSTER_EXTRACTION_PROMPT}\n\n--- JOURNAL ENTRY ---\n${plainText}`;

        const responseText = await callGemini({
            apiKey,
            prompt: fullPrompt,
            responseSchema: null
        });

        const result = extractJson(responseText);

        // Normalize — handle if AI returned an array despite instructions
        if (Array.isArray(result)) return result[0] || null;
        return result;
    }

    // ─── Inline Journal Progress Helpers ──────────────────────────────────

    /**
     * Insert or update the progress line in the journal page.
     * @param {JournalEntryPage} page
     * @param {string} message - HTML-safe status message
     * @param {number} percent - 0-100 progress
     */
    static async _updateProgress(page, message, percent) {
        let content = page.text?.content || "";
        const barWidth = Math.max(2, Math.min(100, percent));

        const progressHtml = `<div id="${PROGRESS_MARKER}" style="margin:10px 0;padding:10px 14px;background:#1a1a1a;border:1px solid #c9a44a;border-radius:6px;">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
<span style="font-size:13px;color:#e8d5b5;">${message}</span>
</div>
<div style="background:#2a2520;border-radius:3px;height:6px;overflow:hidden;">
<div style="background:linear-gradient(90deg, #c9a44a, #e8b84a);width:${barWidth}%;height:100%;border-radius:3px;transition:width 0.4s ease;"></div>
</div>
</div>`;

        if (content.includes(`id="${PROGRESS_MARKER}"`)) {
            // Update existing progress block
            content = content.replace(
                /<div id="vibe-hazard-progress"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
                progressHtml
            );
        } else {
            // Insert progress block after the hazard button wrapper
            if (content.includes("vibe-hazard-monster-btn-wrapper")) {
                content = content.replace(
                    /(<div[^>]*class="vibe-hazard-monster-btn-wrapper"[^>]*>[\s\S]*?<\/div>)/,
                    `$1\n${progressHtml}`
                );
            } else {
                // Fallback: insert after the hazards section
                content += `\n${progressHtml}`;
            }
        }

        await page.update({ "text.content": content });
    }

    /**
     * Remove the progress block from the journal (on error/cancel).
     * @param {JournalEntryPage} page
     */
    static async _clearProgress(page) {
        let content = page.text?.content || "";
        content = content.replace(
            /<div id="vibe-hazard-progress"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
            ""
        );
        await page.update({ "text.content": content });
    }

    /**
     * Replace the progress block and button with a final linked actor section.
     * @param {JournalEntryPage} page
     * @param {Actor} actor
     */
    static async _finalizeWithActorLink(page, actor) {
        let content = page.text?.content || "";

        // Remove the progress block
        content = content.replace(
            /<div id="vibe-hazard-progress"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
            ""
        );

        // Keep the generate button so the user can create additional monsters

        // Build the new actor link
        const actorLink = `<li>@UUID[Actor.${actor.id}]{${actor.name}}</li>`;

        // If a Linked Monsters section already exists, append to its list
        if (content.includes("🐉 Linked Monsters")) {
            content = content.replace(
                /(🐉 Linked Monsters<\/h3>\s*<ul[^>]*>)([\s\S]*?)(<\/ul>)/,
                `$1$2${actorLink}$3`
            );
        } else {
            // Create new section
            const monsterSection = `<h3>🐉 Linked Monsters</h3><ul style="color:#c9a44a;">${actorLink}</ul>`;

            // Insert before the Investigate section if it exists, otherwise append
            if (content.includes("🔍 Investigate")) {
                content = content.replace(
                    /(<h3>🔍 Investigate<\/h3>)/,
                    `${monsterSection}\n$1`
                );
            } else {
                content += `\n${monsterSection}`;
            }
        }

        await page.update({ "text.content": content });
        console.log("HazardMonsterService | Finalized journal with actor link.");
    }
}
