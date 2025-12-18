import { TrendSearcher } from '../modules/TrendSearcher';
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';
import { ChannelConfig, PipelineResult, ShortsData } from '../types';

export const config = {
  maxDuration: 60, 
};

export default async function handler(req: any, res: any) {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[Pipeline] ${msg}`);
    logs.push(msg);
  };

  try {
    log("Pipeline API execution started.");

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Checking critical env vars
    if (!process.env.API_KEY) {
      log("WARNING: process.env.API_KEY is undefined on server.");
    }

    // Robust body parsing for Vercel environments
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        log("ERROR: Failed to parse request body as JSON.");
        return res.status(400).json({ success: false, error: "Malformed JSON body" });
      }
    }

    const { channelConfig, forceMock } = body || {};
    
    if (!channelConfig) {
      log("ERROR: Required 'channelConfig' missing in request.");
      return res.status(400).json({ success: false, error: "Missing channelConfig" });
    }
    
    log(`Running automation for: ${channelConfig.name}`);

    // Step 0: Search (Trend Discovery)
    const searcher = new TrendSearcher();
    let shortsData: ShortsData[] = [];
    try {
      if (forceMock || !channelConfig.auth) {
        log("Mode: Simulation (Mock Data)");
        shortsData = searcher.getMockData();
      } else {
        log("Mode: Real-time Trend Search");
        shortsData = await searcher.execute(channelConfig);
      }
    } catch (e: any) {
      log(`Trend Search Exception: ${e.message}. Falling back to mocks.`);
      shortsData = searcher.getMockData();
    }

    // Step 1: Extract Signals
    log("Module: TrendSignalExtractor");
    const extractor = new TrendSignalExtractor();
    const trendSignals = await extractor.execute(shortsData);
    log("Signals extracted successfully.");

    // Step 2: Generate Candidates
    log("Module: CandidateThemeGenerator");
    const candidateGen = new CandidateThemeGenerator();
    const candidates = await candidateGen.execute(trendSignals);
    log(`Generated ${candidates.length} candidates.`);

    // Step 3: Scoring & Selection
    log("Module: CandidateWeightEngine");
    const weightEngine = new CandidateWeightEngine();
    const scoredCandidates = await weightEngine.execute({
      candidates,
      channelState: channelConfig.channelState
    });
    const winner = scoredCandidates.find(c => c.selected);
    if (!winner) throw new Error("Candidate selection engine failed.");
    log(`Winning Candidate: ${winner.id}`);

    // Step 4: Asset Composition
    log("Module: PromptComposer");
    const composer = new PromptComposer();
    const promptOutput = await composer.execute(winner);
    log("Final production assets composed.");

    // Step 5: Video Generation (Gemini Veo)
    log("Module: VideoGenerator (Calling Veo API)");
    const videoGen = new VideoGenerator();
    const videoAsset = await videoGen.execute(promptOutput);
    log("Video asset generated successfully.");

    // Step 6: Platform Upload
    log("Module: UploaderScheduler");
    const uploader = new UploaderScheduler();
    const uploadResult = await uploader.execute({
      video_asset: videoAsset,
      metadata: promptOutput,
      schedule: channelConfig.schedule,
      authCredentials: channelConfig.auth || undefined
    });
    log(`Upload process status: ${uploadResult.status}`);

    log("Pipeline completed successfully.");
    return res.status(200).json({
      success: true,
      logs,
      videoUrl: videoAsset.video_url,
      uploadId: uploadResult.video_id
    });

  } catch (error: any) {
    console.error("[PIPELINE_FATAL_ERROR]", error);
    return res.status(200).json({ 
      success: false, 
      logs, 
      error: error.message || "An internal error occurred during the pipeline execution."
    });
  }
}