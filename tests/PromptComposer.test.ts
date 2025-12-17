import { PromptComposer } from '../modules/PromptComposer';
import { TestResult, CandidateTheme } from '../types';

const MOCK_SELECTED_CANDIDATE: CandidateTheme = {
  id: "c1",
  subject_type: "Hydraulic Press",
  action_verb: "Crush",
  object_type: "Smartphone",
  structure_type: "Experiment",
  algorithm_signals: ["satisfying"],
  selected: true,
  total_score: 25
};

export const runPromptComposerTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new PromptComposer();

  logs.push("Running PromptComposer tests...");

  try {
    const result = await module.execute(MOCK_SELECTED_CANDIDATE);

    if (!result.prompt) throw new Error("Missing prompt field");
    if (!result.title_template) throw new Error("Missing title_template");
    if (result.candidate_id !== MOCK_SELECTED_CANDIDATE.id) throw new Error("Candidate ID mismatch");

    logs.push("✅ Prompt generation valid");
    logs.push(`Title generated: "${result.title_template}"`);

    return { moduleName: "PromptComposer", passed: true, logs };
  } catch (e: any) {
    logs.push(`❌ Test Failed: ${e.message}`);
    return { moduleName: "PromptComposer", passed: false, logs };
  }
};