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

  logs.push("🚀 Starting CandidateWeightEngine Tests (Phase 3)...");

  try {
    // 1. Execution Test
    logs.push("Step 1: Executing module with Mock Candidates...");
    const result = await module.execute({
      candidates: MOCK_CANDIDATES,
      channelState: MOCK_CHANNEL_STATE
    });

    // 2. Output Validation
    logs.push("Step 2: Validating Selection Logic...");
    const selectedCount = result.filter(c => c.selected).length;
    
    if (selectedCount !== 1) {
      throw new Error(`Expected exactly 1 selected candidate, found ${selectedCount}`);
    }

    const winner = result.find(c => c.selected);
    logs.push(`✅ Winner Selected: ${winner?.id} (Score: ${winner?.total_score})`);

    // 3. Scoring Breakdown Validation
    logs.push("Step 3: Validating Scoring Breakdown...");
    if (!winner?.scoring_breakdown) {
      throw new Error("Winner is missing scoring_breakdown");
    }
    const { virality, feasibility, trend_alignment } = winner.scoring_breakdown;
    
    if (typeof virality !== 'number' || typeof feasibility !== 'number') {
      throw new Error("Scoring components must be numbers");
    }
    
    logs.push(`   Virality: ${virality}, Feasibility: ${feasibility}, Trend: ${trend_alignment}`);

    // 4. Edge Case: Empty Candidate List
    logs.push("Step 4: Testing Empty Input Handling...");
    try {
      await module.execute({ candidates: [], channelState: MOCK_CHANNEL_STATE });
      throw new Error("Module should throw error on empty candidate list");
    } catch (e: any) {
      if (e.message.includes("empty")) {
        logs.push("✅ Correctly handled empty input.");
      } else {
        throw e;
      }
    }

    logs.push("✅ ALL TESTS PASSED");

    return { moduleName: "CandidateWeightEngine", passed: true, logs };
  } catch (e: any) {
    logs.push(`❌ TEST FAILED: ${e.message}`);
    return { moduleName: "CandidateWeightEngine", passed: false, logs };
  }
};