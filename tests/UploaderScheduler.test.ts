import { UploaderScheduler } from '../modules/UploaderScheduler';
import { UploaderInput, TestResult } from '../types';

const MOCK_INPUT: UploaderInput = {
  video_asset: {
    candidate_id: "test_1",
    video_url: "blob:xxx",
    mime_type: "video/mp4",
    status: "generated",
    generated_at: new Date().toISOString()
  },
  metadata: {
    candidate_id: "test_1",
    prompt: "prompt",
    title_template: "Test Video",
    description_template: "Test Desc",
    candidate_reference: {} as any
  },
  schedule: {
    active: false,
    privacy_status: "public"
  }
};

export const runUploaderTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new UploaderScheduler();

  logs.push("🚀 Starting UploaderScheduler Tests (Phase 6)...");

  try {
    // 1. Immediate Upload Test
    logs.push("Step 1: Testing Immediate Upload...");
    const result1 = await module.execute(MOCK_INPUT);
    
    if (result1.status !== 'uploaded') throw new Error("Expected status 'uploaded'");
    if (!result1.platform_url.includes('youtube.com/shorts/')) throw new Error("Invalid URL format");
    logs.push(`✅ Uploaded: ${result1.platform_url}`);

    // 2. Scheduled Upload Test
    logs.push("Step 2: Testing Scheduled Upload...");
    const scheduledInput: UploaderInput = {
      ...MOCK_INPUT,
      schedule: {
        active: true,
        privacy_status: "private",
        publish_at: "2025-01-01T12:00:00Z"
      }
    };
    const result2 = await module.execute(scheduledInput);
    
    if (result2.status !== 'scheduled') throw new Error("Expected status 'scheduled'");
    if (result2.scheduled_for !== scheduledInput.schedule.publish_at) throw new Error("Schedule time mismatch");
    logs.push(`✅ Scheduled for: ${result2.scheduled_for}`);

    // 3. Validation Logic
    logs.push("Step 3: Testing Invalid Input...");
    try {
      await module.execute({ ...MOCK_INPUT, video_asset: { status: 'failed' } as any });
      throw new Error("Should fail on failed video asset");
    } catch (e: any) {
      if (e.message.includes("Invalid video")) {
        logs.push("✅ Correctly rejected invalid video.");
      } else {
        throw e;
      }
    }

    logs.push("✅ ALL TESTS PASSED");
    return { moduleName: "UploaderScheduler", passed: true, logs };

  } catch (e: any) {
    logs.push(`❌ TEST FAILED: ${e.message}`);
    return { moduleName: "UploaderScheduler", passed: false, logs };
  }
};