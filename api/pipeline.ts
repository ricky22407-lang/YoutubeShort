
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
    const time = new Date().toLocaleTimeString();
    console.log(`[Pipeline ${time}] ${msg}`);
    logs.push(msg);
  };

  let capturedTrends: ShortsData[] = [];
  let capturedWinner: any = null;
  let capturedMetadata: any = null;

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // 預檢環境變數，這通常是 500 崩潰的主因
    const apiKey = process.env.API_KEY;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!apiKey) throw new Error("Phase: CRITICAL - 系統缺失 API_KEY 環境變數。");
    if (!clientId) throw new Error("Phase: CRITICAL - 系統缺失 GOOGLE_CLIENT_ID 配置，無法執行 OAuth。");

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { channelConfig } = body as { channelConfig: ChannelConfig };
    
    if (!channelConfig) throw new Error("Phase: START - 請求中缺失頻道配置數據 (channelConfig)。");

    // Stage 0/1: Trends
    try {
        log("Phase: TRENDS - 正在啟動 YouTube Data API 模組抓取即時數據...");
        const searcher = new TrendSearcher();
        capturedTrends = await searcher.execute(channelConfig);
        if (!capturedTrends || capturedTrends.length === 0) {
            log("Phase: TRENDS - 警告：未找到該地區與關鍵字的熱門影片，改用系統預設趨勢模組。");
        } else {
            log(`Phase: TRENDS - 成功提取 ${capturedTrends.length} 個趨勢實例。`);
        }
    } catch (e: any) {
        throw new Error(`[TRENDS_ERROR] 影音數據抓取失敗：${e.message}`);
    }

    // Stage 2: Extraction
    let signals;
    try {
        log("Phase: ANALYSIS - Gemini 3 正在進行深度語義解析與權重標記...");
        const extractor = new TrendSignalExtractor();
        signals = await extractor.execute(capturedTrends);
        log("Phase: ANALYSIS - 語義訊號提取完成。");
    } catch (e: any) {
        throw new Error(`[ANALYSIS_ERROR] 趨勢分析失敗：${e.message}`);
    }

    // Stage 3: Generation
    let candidates;
    try {
        log("Phase: CREATIVE - 正在發想最具爆紅潛力的 3 個創意主題...");
        const candidateGen = new CandidateThemeGenerator();
        candidates = await candidateGen.execute(signals);
        log("Phase: CREATIVE - 創意概念生成完成。");
    } catch (e: any) {
        throw new Error(`[THEMES_ERROR] 創意發想失敗：${e.message}`);
    }

    // Stage 4: Evaluation
    try {
        log("Phase: WEIGHT - 正在執行演算法評分與頻道主軸對齊...");
        const weightEngine = new CandidateWeightEngine();
        const scored = await weightEngine.execute({
            candidates,
            channelState: channelConfig.channelState
        });
        capturedWinner = scored.find(c => c.selected);
        if (!capturedWinner) throw new Error("評分引擎異常：未選出合適主題。");
        log(`Phase: WEIGHT - 最佳方案選定：${capturedWinner.subject_type} (得分: ${capturedWinner.total_score})`);
    } catch (e: any) {
        throw new Error(`[WEIGHT_ERROR] 權重計算失敗：${e.message}`);
    }

    // Stage 5: Prompting
    try {
        log("Phase: PROMPT - 正在為 Veo 3.1 編排高精細度視覺腳本...");
        const composer = new PromptComposer();
        capturedMetadata = await composer.execute(capturedWinner);
        log("Phase: PROMPT - 生成指令與 SEO 元數據編排完成。");
    } catch (e: any) {
        throw new Error(`[PROMPT_ERROR] 指令編排失敗：${e.message}`);
    }

    // Stage 6: Video (Veo)
    let videoAsset;
    try {
        log("Phase: VEO - 正在啟動 Veo 3.1 渲染引擎 (長延時任務)...");
        const videoGen = new VideoGenerator();
        videoAsset = await videoGen.execute(capturedMetadata);
        log("Phase: VEO - 影片渲染與編碼成功。");
    } catch (e: any) {
        throw new Error(`[VEO_ERROR] Veo 影片生成失敗：${e.message}`);
    }

    // Stage 7: Upload
    let uploadResult;
    try {
        log("Phase: UPLOAD - 正在發送至 YouTube API 進行發布與排程...");
        const uploader = new UploaderScheduler();
        uploadResult = await uploader.execute({
            video_asset: videoAsset,
            metadata: capturedMetadata,
            schedule: channelConfig.schedule,
            authCredentials: channelConfig.auth || undefined
        });
        log(`Phase: UPLOAD - 流程圓滿成功！影片 ID: ${(uploadResult as any).video_id}`);
    } catch (e: any) {
        throw new Error(`[UPLOAD_ERROR] YouTube 上傳失敗：${e.message}`);
    }
    
    // 成功回傳 JSON
    return res.status(200).json({
        success: true,
        logs: logs,
        videoUrl: videoAsset.video_url,
        uploadId: (uploadResult as any).video_id,
        trends: capturedTrends,
        winner: capturedWinner,
        metadata: capturedMetadata
    });

  } catch (error: any) {
    // 即使失敗，也確保返回的是 JSON，避免前端解析出錯
    console.error("PIPELINE_CRASH:", error);
    return res.status(200).json({ 
        success: false, 
        logs: logs, 
        error: error.message || "發生未預期的伺服器管線崩潰。",
        trends: capturedTrends,
        winner: capturedWinner
    });
  }
}
