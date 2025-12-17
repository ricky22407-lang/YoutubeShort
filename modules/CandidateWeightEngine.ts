import { CandidateTheme, ChannelState, IModule } from '../types';
import { generateJSON } from '../services/geminiService';
import { SYSTEM_INSTRUCTIONS } from '../constants';
import { Type } from '@google/genai';

interface WeightEngineInput {
  candidates: CandidateTheme[];
  channelState: ChannelState;
}

export class CandidateWeightEngine implements IModule<WeightEngineInput, CandidateTheme[]> {
  name = "Candidate Weight Engine";
  description = "Scores candidates and selects the best one based on channel fit and virality.";

  async execute(input: WeightEngineInput): Promise<CandidateTheme[]> {
    const prompt = `
      Channel State: ${JSON.stringify(input.channelState, null, 2)}
      
      Candidates to Score:
      ${JSON.stringify(input.candidates, null, 2)}
      
      Score them and mark exactly one as 'selected': true.
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
          rationale: { type: Type.STRING },
          total_score: { type: Type.NUMBER },
          selected: { type: Type.BOOLEAN },
          scoring_breakdown: {
             type: Type.OBJECT,
             properties: {
                virality: {type: Type.NUMBER},
                feasibility: {type: Type.NUMBER},
                trend_alignment: {type: Type.NUMBER}
             }
          }
        },
        required: ["id", "subject_type", "total_score", "selected"]
      }
    };

    return await generateJSON<CandidateTheme[]>(prompt, SYSTEM_INSTRUCTIONS.WEIGHT_ENGINE, schema);
  }
}