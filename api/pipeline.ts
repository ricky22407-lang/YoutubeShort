import { TrendSearcher } from '../modules/TrendSearcher';
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';
import { ChannelConfig, PipelineResult, ShortsData } from '../types';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Input is now a ChannelConfig object for full automation
  const { channelConfig, forceMock } = req.body as { channelConfig: ChannelConfig, forceMock?: boolean };

  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: API_KEY is missing.' });
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    log(`🚀 Starting Automation for Channel: ${channelConfig.name}`);

    // --- Step 0: Trend Search (Real or Mock) ---
    const searcher = new TrendSearcher();
    let shortsData: ShortsData[];
    if (forceMock) {
        log("⚠️ Force Mock Data enabled.");
        shortsData = (searcher as any).getMockData();
    } else {
        shortsData = await searcher.execute(channelConfig);
    }
    log(`✅ Trends Fetched: ${shortsData.length} items`);

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
    const videoAsset = await videoGen.execute(promptOutput);
    log("✅ Video Generated (Veo 3.1 9:16)");

    // --- Step 6: Upload to YouTube ---
    const uploader = new UploaderScheduler();
    
    // Construct Uploader Input
    const uploadInput = {
        video_asset: videoAsset,
        metadata: promptOutput,
        schedule: channelConfig.schedule,
        authCredentials: channelConfig.auth || undefined
    };

    const uploadResult = await uploader.execute(uploadInput);
    log(`✅ Upload Process Complete. Status: ${uploadResult.status}`);
    
    if (uploadResult.status === 'uploaded' || uploadResult.status === 'scheduled') {
        log(`🔗 URL: ${uploadResult.platform_url}`);
    }

    const result: PipelineResult = {
        success: true,
        logs: logs,
        videoUrl: videoAsset.video_url,
        uploadId: uploadResult.video_id
    };

    return res.status(200).json(result);

  } catch (error: any) {
    console.error("Pipeline Failed:", error);
    log(`❌ Error: ${error.message}`);
    return res.status(500).json({ 
        success: false, 
        logs, 
        error: error.message 
    });
  }
}