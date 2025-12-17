import { CandidateTheme, ChannelState, IModule } from '../types';
import { generateJSON } from '../services/geminiService';
import { SYSTEM_INSTRUCTIONS } from '../constants';
import { Type } from '@google/genai';

interface WeightEngineInput {
  candidates: CandidateTheme[];
  channelState: ChannelState;
}

/**
 * Phase 3: Candidate Weight Engine
 * 
 * Goal: Score candidates based on channel fit and trends. Select ONE winner.
 * Input: Candidates + Channel State
 * Output: Candidates with scores and 'selected' boolean.
 */
export class CandidateWeightEngine implements IModule<WeightEngineInput, CandidateTheme[]> {
  name = "Candidate Weight Engine";
  description = "Scores candidates and selects the best one based on channel fit and virality.";

  async execute(input: WeightEngineInput): Promise<CandidateTheme[]> {
    if (!input.candidates || input.candidates.length === 0) {
      throw new Error("Candidate list cannot be empty.");
    }

    const prompt = `
      Channel Context:
      ${JSON.stringify(input.channelState, null, 2)}
      
      Candidates to Evaluate:
      ${JSON.stringify(input.candidates, null, 2)}
      
      Task:
      1. Analyze each candidate against the Channel Context.
      2. Assign 0-10 scores for:
         - Virality (Broad appeal?)
         - Feasibility (Easy to make?)
         - Trend Alignment (Fits current signals?)
      3. Sum scores to 'total_score'.
      4. Mark EXACTLY ONE candidate as 'selected': true (the one with the highest score).
      5. Return the full list of candidates with these new fields added.
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
             },
             required: ["virality", "feasibility", "trend_alignment"]
          }
        },
        required: ["id", "subject_type", "total_score", "selected", "scoring_breakdown"]
      }
    };

    try {
      const scoredCandidates = await generateJSON<CandidateTheme[]>(prompt, SYSTEM_INSTRUCTIONS.WEIGHT_ENGINE, schema);

      // --- Post-Processing Safety Layer ---
      // AI sometimes selects multiple or none. We enforce the logic here.
      
      // 1. Sort by score descending
      scoredCandidates.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

      // 2. Force top 1 to be selected, others false
      scoredCandidates.forEach((c, index) => {
        c.selected = index === 0;
      });

      return scoredCandidates;
    } catch (error) {
      console.error("CandidateWeightEngine Execution Failed:", error);
      throw error;
    }
  }
}