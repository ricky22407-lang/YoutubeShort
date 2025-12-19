
export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  // 強制設定為 JSON，防止 Vercel 回傳 HTML 錯誤頁面
  res.setHeader('Content-Type', 'application/json');
  
  const logs: string[] = [];
  const log = (msg: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { stage, channelConfig, metadata, videoAsset } = req.body;
    
    // Fix: Must use process.env.API_KEY exclusively according to SDK guidelines.
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("CRITICAL_ENV_MISSING: 伺服器找不到 API_KEY。請確認 Vercel 環境變數名稱為 API_KEY。");
    }

    // --- 階段 A: 分析與企劃 ---
    if (stage === 'analyze') {
      log("正在載入分析模組...");
      const { TrendSearcher } = await import('../modules/TrendSearcher');
      const { TrendSignalExtractor } = await import('../modules/TrendSignalExtractor');
      const { CandidateThemeGenerator } = await import('../modules/CandidateThemeGenerator');
      const { CandidateWeightEngine } = await import('../modules/CandidateWeightEngine');
      const { PromptComposer } = await import('../modules/PromptComposer');

      log("Phase: START - 執行趨勢掃描...");
      const searcher = new TrendSearcher();
      const trends = await searcher.execute(channelConfig);
      
      const extractor = new TrendSignalExtractor();
      const signals = await extractor.execute(trends);
      
      const candidateGen = new CandidateThemeGenerator();
      const candidates = await candidateGen.execute(signals);

      const weightEngine = new CandidateWeightEngine();
      const scored = await weightEngine.execute({ candidates, channelState: channelConfig.channelState });
      const winner = scored.find(c => c.selected);
      if (!winner) throw new Error("企劃引擎未能選出高潛力主題。");

      const composer = new PromptComposer();
      const resultMetadata = await composer.execute(winner);

      return res.status(200).json({
        success: true,
        logs,
        trends,
        winner,
        metadata: resultMetadata,
        nextStage: 'video'
      });
    }

    // --- 階段 B: 影片生成 ---
    if (stage === 'video') {
      log("正在載入 Veo 渲染模組...");
      const { VideoGenerator } = await import('../modules/VideoGenerator');
      const videoGen = new VideoGenerator();
      const resultVideo = await videoGen.execute(metadata);
      
      return res.status(200).json({
        success: true,
        logs,
        videoAsset: resultVideo,
        nextStage: 'upload'
      });
    }

    // --- 階段 C: 上傳發布 ---
    if (stage === 'upload') {
      log("正在載入 YouTube 上傳模組...");
      const { UploaderScheduler } = await import('../modules/UploaderScheduler');
      const uploader = new UploaderScheduler();
      const uploadResult = await uploader.execute({
        video_asset: videoAsset,
        metadata: metadata,
        schedule: channelConfig.schedule,
        authCredentials: channelConfig.auth
      });

      return res.status(200).json({
        success: true,
        logs,
        uploadId: uploadResult.video_id,
        finalUrl: uploadResult.platform_url
      });
    }

    return res.status(400).json({ success: false, error: "無效的 Stage 參數" });

  } catch (error: any) {
    console.error("Pipeline Runtime Error:", error);
    // 確保這裡回傳的是 JSON
    return res.status(200).json({
      success: false,
      error: error.message || "系統核心發生未知異常 (Runtime Error)",
      logs,
      debug_env: { has_key: !!process.env.API_KEY }
    });
  }
}
