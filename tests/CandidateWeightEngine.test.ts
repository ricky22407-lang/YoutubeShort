import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { MOCK_CHANNEL_STATE } from '../constants';
import { TestResult, CandidateTheme } from '../types';

const MOCK_CANDIDATES: CandidateTheme[] = [
  {
    id: "c1",
    subject_type: "Hydraulic Press",
    action_verb: "Crush",
    object_type: "Smartphone",
    structure_type: "Experiment",
    algorithm_signals: ["satisfying"],
    selected: false
  },
  {
    id: "c2",
    subject_type: "Cat",
    action_verb: "Jump",
    object_type: "Cucumber",
    structure_type: "Reaction",
    algorithm_signals: ["funny"],
    selected: false
  }
];

export const runWeightEngineTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new CandidateWeightEngine();

  logs.push("Running CandidateWeightEngine tests...");

  try {
    const result = await module.execute({
      candidates: MOCK_CANDIDATES,
      channelState: MOCK_CHANNEL_STATE
    });

    const selectedCount = result.filter(c => c.selected).length;
    if (selectedCount !== 1) throw new Error(`Expected exactly 1 selected candidate, found ${selectedCount}`);
    
    if (typeof result[0].total_score !== 'number') throw new Error("Total score is missing");

    logs.push(`✅ Selection Logic Validated. Selected: ${result.find(c => c.selected)?.id}`);

    return { moduleName: "CandidateWeightEngine", passed: true, logs };
  } catch (e: any) {
    logs.push(`❌ Test Failed: ${e.message}`);
    return { moduleName: "CandidateWeightEngine", passed: false, logs };
  }
};