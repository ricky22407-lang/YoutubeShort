import { TrendSignals, CandidateTheme, IModule } from '../types';
import { generateJSON } from '../services/geminiService';
import { SYSTEM_INSTRUCTIONS } from '../constants';
import { Type } from '@google/genai';

export class CandidateThemeGenerator implements IModule<TrendSignals, CandidateTheme[]> {
  name = "Candidate Theme Generator";
  description = "Generates video candidates based on extracted trend signals.";

  async execute(input: TrendSignals): Promise<CandidateTheme[]> {
    const prompt = `
      Using these Trend Signals:
      ${JSON.stringify(input, null, 2)}
      
      Generate 3 potential viral Shorts concepts.
    `;

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          subject_type: { type: Type.STRING },
          action_verb: { type: Type.STRING },
          object_type: { type: Type.STRING },
          structure_type: { type: Type.STRING },
          algorithm_signals: { type: Type.ARRAY, items: { type: Type.STRING } },
          rationale: { type: Type.STRING }
        },
        required: ["id", "subject_type", "action_verb", "object_type", "structure_type", "algorithm_signals"]
      }
    };

    return await generateJSON<CandidateTheme[]>(prompt, SYSTEM_INSTRUCTIONS.CANDIDATE_GENERATOR, schema);
  }
}