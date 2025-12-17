import { ShortsData, TrendSignals, IModule } from '../types';
import { generateJSON } from '../services/geminiService';
import { SYSTEM_INSTRUCTIONS } from '../constants';
import { Type } from '@google/genai';

export class TrendSignalExtractor implements IModule<ShortsData[], TrendSignals> {
  name = "Trend Signal Extractor";
  description = "Analyzes raw Shorts data to extract frequency maps of verbs, subjects, and structures.";

  async execute(input: ShortsData[]): Promise<TrendSignals> {
    const prompt = `
      Analyze the following YouTube Shorts dataset:
      ${JSON.stringify(input, null, 2)}
      
      Return a statistical summary of the trends found.
    `;

    // Define schema for strict output
    const schema = {
      type: Type.OBJECT,
      properties: {
        action_verb_frequency: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
        subject_type_frequency: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
        object_type_frequency: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
        structure_type_frequency: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
        algorithm_signal_frequency: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
      },
      required: [
        "action_verb_frequency",
        "subject_type_frequency",
        "object_type_frequency",
        "structure_type_frequency",
        "algorithm_signal_frequency"
      ],
    };

    return await generateJSON<TrendSignals>(prompt, SYSTEM_INSTRUCTIONS.TREND_EXTRACTOR, schema);
  }
}