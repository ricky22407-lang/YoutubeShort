import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { TestResult, TrendSignals } from '../types';

const MOCK_TRENDS: TrendSignals = {
  action_verb_frequency: { "crush": 5, "cut": 2 },
  subject_type_frequency: { "hydraulic press": 5, "knife": 2 },
  object_type_frequency: { "ball": 3, "fruit": 4 },
  structure_type_frequency: { "experiment": 6 },
  algorithm_signal_frequency: { "satisfying": 9 }
};

export const runCandidateGeneratorTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new CandidateThemeGenerator();

  logs.push("Running CandidateThemeGenerator tests...");

  try {
    const result = await module.execute(MOCK_TRENDS);

    if (!Array.isArray(result)) throw new Error("Output is not an array");
    if (result.length === 0) throw new Error("Output array is empty");
    if (!result[0].id) throw new Error("Candidate missing ID");

    logs.push(`✅ Generated ${result.length} candidates`);
    logs.push(`Sample ID: ${result[0].id}`);

    return { moduleName: "CandidateThemeGenerator", passed: true, logs };
  } catch (e: any) {
    logs.push(`❌ Test Failed: ${e.message}`);
    return { moduleName: "CandidateThemeGenerator", passed: false, logs };
  }
};