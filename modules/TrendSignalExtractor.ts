import { ShortsData, TrendSignals, IModule } from '../types';
import { generateJSON } from '../services/geminiService';
import { SYSTEM_INSTRUCTIONS } from '../constants';
import { Type } from '@google/genai';

/**
 * Phase 1: Trend Signal Extractor
 * 
 * Goal: Analyze raw Shorts data and extract frequency maps for trends.
 * Input: ShortsData[]
 * Output: TrendSignals (JSON)
 */
export class TrendSignalExtractor implements IModule<ShortsData[], TrendSignals> {
  name = "Trend Signal Extractor";
  description = "Analyzes raw Shorts data to extract frequency maps of verbs, subjects, and structures.";

  async execute(input: ShortsData[]): Promise<TrendSignals> {
    if (!input || input.length === 0) {
      throw new Error("Input ShortsData array cannot be empty.");
    }

    const prompt = `
      Analyze the following YouTube Shorts dataset:
      ${JSON.stringify(input, null, 2)}
      
      Return a statistical summary of the trends found.
      Calculate frequency counts for:
      1. Action Verbs (what is happening?)
      2. Subject Types (who/what is performing the action?)
      3. Object Types (what is being acted upon?)
      4. Structure Types (e.g., POV, Experiment, Storytime)
      5. Algorithm Signals (high-performing keywords/hashtags)
    `;

    // Strict schema definition matching schemas/TrendSignalExtractor.output.json
    const schema = {
      type: Type.OBJECT,
      properties: {
        action_verb_frequency: { 
          type: Type.OBJECT, 
          description: "Map of action verb to count",
          additionalProperties: { type: Type.NUMBER } 
        },
        subject_type_frequency: { 
          type: Type.OBJECT, 
          description: "Map of subject to count",
          additionalProperties: { type: Type.NUMBER } 
        },
        object_type_frequency: { 
          type: Type.OBJECT, 
          description: "Map of object to count",
          additionalProperties: { type: Type.NUMBER } 
        },
        structure_type_frequency: { 
          type: Type.OBJECT, 
          description: "Map of structure type to count",
          additionalProperties: { type: Type.NUMBER } 
        },
        algorithm_signal_frequency: { 
          type: Type.OBJECT, 
          description: "Map of signal keywords to count",
          additionalProperties: { type: Type.NUMBER } 
        },
      },
      required: [
        "action_verb_frequency",
        "subject_type_frequency",
        "object_type_frequency",
        "structure_type_frequency",
        "algorithm_signal_frequency"
      ],
    };

    try {
      return await generateJSON<TrendSignals>(prompt, SYSTEM_INSTRUCTIONS.TREND_EXTRACTOR, schema);
    } catch (error) {
      console.error("TrendSignalExtractor Execution Failed:", error);
      throw error;
    }
  }
}