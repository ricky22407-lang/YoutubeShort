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
    console.log(`[Pipeline] ${msg}`);
    logs.push(msg);
  };

  log("Request Received");

  try {
    // 1. Method Validation
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Environment Diagnostics (Safe Check)
    const envStatus = {
      API_KEY: process.env.API_KEY ? "Present" : "MISSING",
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "Present" : "MISSING",
    };
    log(`Env Check: ${JSON.stringify(envStatus)}`);

    if (!process.env.API_KEY) {
      throw new Error("Server Misconfiguration: API_KEY is missing.");
    }

    // 3. Body Parsing
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        throw new Error("Invalid JSON body received.");
    }

    const { channelConfig, forceMock } = body as { channelConfig: ChannelConfig, forceMock?: boolean };
    
    if (!channelConfig) {
        throw new Error("Invalid Input: 'channelConfig' is required.");
    }
    
    log(`🚀 Starting Automation for Channel: ${channelConfig.name}`);

    // --- Step 0: Trend Search (Real or Mock) ---
    const searcher = new TrendSearcher();
    let shortsData: ShortsData[] = [];
    
    try {
        const hasAuth = channelConfig.auth || (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
        
        if (forceMock || !hasAuth) {
            log("⚠️ Running in Simulation Mode (Mock Data).");
            shortsData = (searcher as any).getMockData();
        } else {
            shortsData = await searcher.execute(channelConfig);
        }
    } catch (e: any) {
        log(`⚠️ Trend Search Error: ${e.message}. Falling back to Mock.`);
        shortsData = (searcher as any).getMockData();
    }
    
    if (!shortsData || shortsData.length === 0) {
        throw new Error("Failed to retrieve Shorts Data.");
    }
    log(`✅ Trends Data Ready: ${shortsData.length} items`);

    // --- Step 1: Extract Signals ---
    const extractor = new TrendSignalExtractor();
    const trendSignals = await extractor.execute(shortsData);
    log("✅ Signals Extracted");

    // --- Step 2: Generate Candidates ---
    const candidateGen = new CandidateThemeGenerator();
    const candidates = await candidateGen.execute(trendSignals);
    log(`✅ Candidates Generated: ${candidates.length}`);

    // --- Step 3: Weight & Select ---
    const weightEngine = new CandidateWeightEngine();
    const scoredCandidates = await weightEngine.execute({
        candidates,
        channelState: channelConfig.channelState
    });
    const winner = scoredCandidates.find(c => c.selected);
    if (!winner) throw new Error("No winner selected by Weight Engine.");
    log(`✅ Winner Selected: ${winner.id} (${winner.total_score} pts)`);

    // --- Step 4: Compose Prompt ---
    const composer = new PromptComposer();
    const promptOutput = await composer.execute(winner);
    log("✅ Prompt & Metadata Composed");

    // --- Step 5: Generate Video (Veo) ---
    const videoGen = new VideoGenerator();
    let videoAsset;
    try {
        log("🎬 Starting Veo Video Generation (this may take up to 60s)...");
        videoAsset = await videoGen.execute(promptOutput);
        log("✅ Video Generated (Veo 3.1 9:16)");
    } catch (e: any) {
        console.error("CRITICAL: Video Generation Failed", e);
        
        // Detailed Error Logging for Frontend
        log(`❌ Veo Error: ${e.message}`);
        
        // Add specific hints for common errors
        if (e.message.includes("429") || e.message.includes("quota")) {
            log("💡 HINT: API Quota Exceeded. Check Google Cloud Console.");
        } else if (e.message.includes("400")) {
            log("💡 HINT: Bad Request. Check if Veo model is enabled in your project.");
        } else if (e.message.includes("Timed Out")) {
            log("💡 HINT: Vercel Function Timed Out (Max 10s/60s). Veo is slow.");
        }

        // RE-THROW to stop the pipeline. Do NOT proceed to upload.
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
        uploadResult = await uploader.execute(uploadInput);
        log(`✅ Upload Process Complete. Status: ${uploadResult.status}`);
    } catch (e: any) {
         log(`⚠️ Upload Failed: ${e.message}`);
         uploadResult = { status: 'failed', platform_url: '', video_id: '', uploaded_at: new Date().toISOString() };
    }
    
    if (uploadResult.status === 'uploaded' || uploadResult.status === 'scheduled') {
        log(`🔗 URL: ${uploadResult.platform_url}`);
    }

    const result: PipelineResult = {
        success: true,
        logs: logs,
        videoUrl: videoAsset.video_url,
        uploadId: (uploadResult as any).video_id
    };

    return res.status(200).json(result);

  } catch (error: any) {
    console.error("CRITICAL PIPELINE FAILURE:", error);
    
    // Return 200 OK with success: false so Frontend can read the logs
    return res.status(200).json({ 
        success: false, 
        logs: logs, 
        error: error.message || "Unknown Server Error",
        // Include stack only in dev or if needed for debugging
        details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}