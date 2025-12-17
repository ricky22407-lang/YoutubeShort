import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { MOCK_SHORTS_DATA } from '../constants';
import { TestResult } from '../types';

export const runTrendExtractorTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new TrendSignalExtractor();

  logs.push("🚀 Starting TrendSignalExtractor Tests (Phase 1)...");
  
  try {
    // 1. Basic Execution Test
    logs.push("Step 1: Executing module with Mock Data...");
    const result = await module.execute(MOCK_SHORTS_DATA);
    
    // 2. Schema Validation (Runtime checks)
    logs.push("Step 2: Validating Output Schema...");
    
    const requiredKeys = [
      "action_verb_frequency",
      "subject_type_frequency",
      "object_type_frequency",
      "structure_type_frequency",
      "algorithm_signal_frequency"
    ];

    for (const key of requiredKeys) {
      if (!(key in result)) {
        throw new Error(`Missing required key in output: ${key}`);
      }
      // Check if it is an object
      const value = (result as any)[key];
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Key ${key} is not an object`);
      }
      // Check if values are numbers
      for (const subKey in value) {
        if (typeof value[subKey] !== 'number') {
             throw new Error(`Value in ${key}.${subKey} is not a number`);
        }
      }
    }
    
    // 3. Data Integrity Check (Loose check since AI output varies, but keys should exist)
    logs.push("Step 3: Checking Data Logic...");
    const verbCount = Object.keys(result.action_verb_frequency).length;
    if (verbCount === 0) {
      logs.push("⚠️ Warning: No verbs extracted.");
    } else {
      logs.push(`✅ Extracted ${verbCount} unique action verbs.`);
    }

    // 4. Edge Case: Empty Input
    logs.push("Step 4: Testing Empty Input Handling...");
    try {
      await module.execute([]);
      throw new Error("Module should throw error on empty input");
    } catch (e: any) {
      if (e.message.includes("empty")) {
        logs.push("✅ Correctly handled empty input.");
      } else {
        throw e;
      }
    }

    logs.push("✅ ALL TESTS PASSED");
    
    return { moduleName: "TrendSignalExtractor", passed: true, logs };
  } catch (e: any) {
    logs.push(`❌ TEST FAILED: ${e.message}`);
    return { moduleName: "TrendSignalExtractor", passed: false, logs };
  }
};