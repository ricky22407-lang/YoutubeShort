import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { MOCK_SHORTS_DATA } from '../constants';
import { TestResult } from '../types';

export const runTrendExtractorTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new TrendSignalExtractor();

  logs.push("Running TrendSignalExtractor tests...");
  
  try {
    const result = await module.execute(MOCK_SHORTS_DATA.slice(0, 2));
    
    // Assertion 1: Check structure
    if (!result.action_verb_frequency) throw new Error("Missing action_verb_frequency");
    if (!result.subject_type_frequency) throw new Error("Missing subject_type_frequency");
    
    logs.push("✅ Output Schema Validated");
    logs.push(`Sample output key count: ${Object.keys(result.action_verb_frequency).length}`);
    
    return { moduleName: "TrendSignalExtractor", passed: true, logs };
  } catch (e: any) {
    logs.push(`❌ Test Failed: ${e.message}`);
    return { moduleName: "TrendSignalExtractor", passed: false, logs };
  }
};