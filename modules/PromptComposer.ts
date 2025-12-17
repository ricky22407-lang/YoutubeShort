import { CandidateTheme, PromptOutput, IModule } from '../types';
import { generateJSON } from '../services/geminiService';
import { SYSTEM_INSTRUCTIONS } from '../constants';
import { Type } from '@google/genai';

export class PromptComposer implements IModule<CandidateTheme, PromptOutput> {
  name = "Prompt Composer";
  description = "Generates the final video production prompt, title, and description.";

  async execute(input: CandidateTheme): Promise<PromptOutput> {
    if (!input.selected) {
      throw new Error("Input candidate must be selected.");
    }

    const prompt = `
      Create production assets for this selected candidate:
      ${JSON.stringify(input, null, 2)}
    `;

    const schema = {
      type: Type.OBJECT,
      properties: {
        candidate_id: { type: Type.STRING },
        prompt: { type: Type.STRING },
        title_template: { type: Type.STRING },
        description_template: { type: Type.STRING },
        candidate_reference: {
            type: Type.OBJECT,
            properties: {
                id: {type: Type.STRING},
                subject_type: {type: Type.STRING},
                action_verb: {type: Type.STRING}
            }
        }
      },
      required: ["candidate_id", "prompt", "title_template", "description_template"]
    };

    return await generateJSON<PromptOutput>(prompt, SYSTEM_INSTRUCTIONS.PROMPT_COMPOSER, schema);
  }
}