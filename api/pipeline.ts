
import { TrendSearcher } from '../modules/TrendSearcher';
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';
import { ChannelConfig, PipelineResult, ShortsData } from '../types';

export const config = {
  maxDuration: 60, // 垂直影片生成需要較長時間，確保超時設定足夠
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

    // 1. 環境變數嚴格預檢 (這是防止 FUNCTION_INVOCATION_FAILED 的關鍵)
    const apiKey = process.env.API_KEY;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!apiKey) throw new Error("Phase: CRITICAL - 環境變數缺失: API_KEY。請檢查 Vercel 設定。");
    if (!clientId || !clientSecret) throw new Error("Phase: CRITICAL - 環境變數缺失: GOOGLE_CLIENT_ID/SECRET。無法執行 YouTube 管線。");

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { channelConfig } = body as { channelConfig: ChannelConfig };
    
    if (!channelConfig) throw new Error("Phase: START - 請求中缺失 channelConfig 數據結構。");

    // 2. 測試 googleapis 動態載入
    try {
        log("Phase: INIT - 正在檢測 Google API 模組狀態...");
        await import('googleapis');
    } catch (importErr: any) {
        throw new Error(`Phase: CRITICAL - googleapis 套件載入失敗: ${importErr.message}`);
    }

    // Stage 0: Trends
    try {
        log("Phase: TRENDS - 正在抓取 YouTube 即時趨勢資料...");
        const searcher = new TrendSearcher();
        capturedTrends = await searcher.execute(channelConfig);
        log(`Phase: TRENDS - 成功抓取 ${capturedTrends.length} 部影片趨勢。`);
    } catch (e: any) {
        throw new Error(`[TRENDS_ERROR] 影音數據抓取失敗: ${e.message}`);
    }

    // Stage 1: Extraction
    let signals;
    try {
        log("Phase: ANALYSIS - Gemini 正在解析標題與演算法訊號...");
        const extractor = new TrendSignalExtractor();
        signals = await extractor.execute(capturedTrends);
        log("Phase: ANALYSIS - 訊號提取完成。");
    } catch (e: any) {
        throw new Error(`[ANALYSIS_ERROR] 訊號解析失敗: ${e.message}`);
    }

    // Stage 2: Generation
    let candidates;
    try {
        log("Phase: CREATIVE - 正在發想最具爆紅潛力的創意主題...");
        const candidateGen = new CandidateThemeGenerator();
        candidates = await candidateGen.execute(signals);
        log("Phase: CREATIVE - 創意方案生成完成。");
    } catch (e: any) {
        throw new Error(`[THEMES_ERROR] 主題生成失敗: ${e.message}`);
    }

    // Stage 3: Evaluation
    try {
        log("Phase: WEIGHT - 正在進行演算法評分與頻道主軸對齊...");
        const weightEngine = new CandidateWeightEngine();
        const scored = await weightEngine.execute({
            candidates,
            channelState: channelConfig.channelState
        });
        capturedWinner = scored.find(c => c.selected);
        if (!capturedWinner) throw new Error("權重引擎未選出適合的方案。");
        log(`Phase: WEIGHT - 選定方案: ${capturedWinner.subject_type} (得分: ${capturedWinner.total_score})`);
    } catch (e: any) {
        throw new Error(`[WEIGHT_ERROR] 權重分析失敗: ${e.message}`);
    }

    // Stage 4: Prompting
    try {
        log("Phase: PROMPT - 正在編排 Veo 3.1 視覺指令與 YouTube 元數據...");
        const composer = new PromptComposer();
        capturedMetadata = await composer.execute(capturedWinner);
        log("Phase: PROMPT - 製作指令編排完成。");
    } catch (e: any) {
        throw new Error(`[PROMPT_ERROR] 指令生成失敗: ${e.message}`);
    }

    // Stage 5: Video (Veo)
    let videoAsset;
    try {
        log("Phase: VEO - 正在啟動 Veo 3.1 渲染引擎 (這可能需要 40-60 秒)...");
        const videoGen = new VideoGenerator();
        videoAsset = await videoGen.execute(capturedMetadata);
        log("Phase: VEO - 影片渲染完成。");
    } catch (e: any) {
        throw new Error(`[VEO_ERROR] Veo 生成失敗: ${e.message}`);
    }

    // Stage 6: Upload
    let uploadResult;
    try {
        log("Phase: UPLOAD - 正在發佈至 YouTube Channel...");
        const uploader = new UploaderScheduler();
        uploadResult = await uploader.execute({
            video_asset: videoAsset,
            metadata: capturedMetadata,
            schedule: channelConfig.schedule,
            authCredentials: channelConfig.auth || undefined
        });
        log(`Phase: UPLOAD - 流程圓滿成功! 影片 ID: ${(uploadResult as any).video_id}`);
    } catch (e: any) {
        throw new Error(`[UPLOAD_ERROR] YouTube 上傳失敗: ${e.message}`);
    }
    
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
    console.error("PIPELINE_CRASH:", error);
    // 即使失敗也回傳 JSON，確保前端能正常顯示 Phase 錯誤
    return res.status(200).json({ 
        success: false, 
        logs: logs, 
        error: error.message || "發生未預期的系統核心錯誤",
        trends: capturedTrends,
        winner: capturedWinner
    });
  }
}
