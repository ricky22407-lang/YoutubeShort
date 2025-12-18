
import { TrendSearcher } from '../modules/TrendSearcher';
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';
import { ChannelConfig, PipelineResult, ShortsData } from '../types';

// Vercel Serverless Config
export const config = {
  maxDuration: 60, // Try to extend execution time for Veo
};

export default async function handler(req: any, res: any) {
  const logs: string[] = [];
  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[Pipeline ${time}] ${msg}`);
    logs.push(msg);
  };

  try {
    // 1. Method Validation
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    log("Request Received");

    // 2. Early Environment Check
    const apiKey = process.env.API_KEY;
    const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
    
    if (!apiKey) {
      log("❌ CRITICAL: API_KEY environment variable is missing on server.");
      return res.status(500).json({
        success: false,
        logs,
        error: "Server Configuration Error: API_KEY is missing."
      });
    }

    // 3. Body Parsing
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ success: false, logs, error: "Invalid JSON body." });
    }

    const { channelConfig, forceMock } = body as { channelConfig: ChannelConfig, forceMock?: boolean };
    
    if (!channelConfig) {
        return res.status(400).json({ success: false, logs, error: "Missing channelConfig." });
    }
    
    log(`🚀 Automation Start: ${channelConfig.name}`);

    // --- Step 0: Trend Search (Real or Mock) ---
    const searcher = new TrendSearcher();
    let shortsData: ShortsData[] = [];
    
    try {
        const canSearchReal = hasClientId && channelConfig.auth;
        if (forceMock || !canSearchReal) {
            log("⚠️ Using Simulated Trend Data (Auth Missing or ForceMock).");
            shortsData = (searcher as any).getMockData();
        } else {
            log("🔍 Fetching Real YouTube Trends...");
            shortsData = await searcher.execute(channelConfig);
        }
    } catch (e: any) {
        log(`⚠️ Trend Search error, using fallback. (${e.message})`);
        shortsData = (searcher as any).getMockData();
    }
    
    if (!shortsData || shortsData.length === 0) {
        throw new Error("Trend module returned no data.");
    }
    log(`✅ Trends Ready: ${shortsData.length} entries`);

    // --- Step 1: Extract Signals ---
    const extractor = new TrendSignalExtractor();
    const trendSignals = await extractor.execute(shortsData);
    log("✅ Signals Extracted");

    // --- Step 2: Generate Candidates ---
    const candidateGen = new CandidateThemeGenerator();
    const candidates = await candidateGen.execute(trendSignals);
    log(`✅ Candidates Brainstormed: ${candidates.length}`);

    // --- Step 3: Weight & Select ---
    const weightEngine = new CandidateWeightEngine();
    const scoredCandidates = await weightEngine.execute({
        candidates,
        channelState: channelConfig.channelState
    });
    const winner = scoredCandidates.find(c => c.selected);
    if (!winner) throw new Error("Selection logic failed.");
    log(`✅ Concept Selected: ${winner.id} (Score: ${winner.total_score})`);

    // --- Step 4: Compose Prompt ---
    const composer = new PromptComposer();
    const promptOutput = await composer.execute(winner);
    log("✅ Prompt Composed");

    // --- Step 5: Generate Video (Veo) ---
    const videoGen = new VideoGenerator();
    let videoAsset;
    try {
        log("🎬 Generating Veo 9:16 Video (This usually takes 30-50s)...");
        videoAsset = await videoGen.execute(promptOutput);
        log("✅ Video Asset Generated");
    } catch (e: any) {
        log(`❌ Veo Error: ${e.message}`);
        // Bubble up as critical error
        throw new Error(`Veo Generation Failed: ${e.message}`);
    }

    // --- Step 6: Upload to YouTube ---
    const uploader = new UploaderScheduler();
    const uploadInput = {
        video_asset: videoAsset,
        metadata: promptOutput,
        schedule: channelConfig.schedule,
        authCredentials: channelConfig.auth || undefined
    };

    let uploadResult;
    try {
        log("📤 Uploading to YouTube...");
        uploadResult = await uploader.execute(uploadInput);
        log(`✅ Final Status: ${uploadResult.status}`);
    } catch (e: any) {
         log(`⚠️ Upload logic error: ${e.message}`);
         uploadResult = { status: 'failed', platform_url: '', video_id: '', uploaded_at: new Date().toISOString() };
    }
    
    const result: PipelineResult = {
        success: true,
        logs: logs,
        videoUrl: videoAsset.video_url,
        uploadId: (uploadResult as any).video_id
    };

    return res.status(200).json(result);

  } catch (error: any) {
    console.error("PIPELINE_CRASH:", error);
    return res.status(200).json({ 
        success: false, 
        logs: logs, 
        error: error.message || "An unexpected server error occurred during the pipeline execution."
    });
  }
}
