
import { PipelineCore } from '../services/pipelineCore';

export const config = {
  maxDuration: 120, // 增加 Veo 渲染等待時長
};

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  const logs: string[] = [];
  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    logs.push(`[${time}] ${msg}`);
    console.log(`[PIPELINE] ${msg}`);
  };

  try {
    const { stage, channelConfig, metadata, videoAsset } = req.body;
    
    if (!process.env.API_KEY) throw new Error("缺少 API_KEY 環境變數");

    // --- 階段處理 ---
    if (stage === 'analyze') {
      log("正在執行趨勢掃描...");
      const trends = await PipelineCore.fetchTrends(channelConfig);
      log(`分析 ${trends.length} 筆趨勢並生成企劃...`);
      const resultMetadata = await PipelineCore.planContent(trends, channelConfig.channelState);
      return res.status(200).json({ success: true, logs, trends, metadata: resultMetadata });
    }

    if (stage === 'video') {
      log("正在發送 Veo 3.1 渲染請求...");
      const resultVideo = await PipelineCore.renderVideo(metadata);
      log("影片生成成功！");
      return res.status(200).json({ success: true, logs, videoAsset: resultVideo });
    }

    if (stage === 'upload') {
      log("啟動 YouTube API 上傳程序...");
      const result = await PipelineCore.uploadVideo({
        video_asset: videoAsset,
        metadata: metadata,
        schedule: channelConfig.schedule,
        authCredentials: channelConfig.auth
      });
      log(`發布完成: ${result.platform_url}`);
      return res.status(200).json({ success: true, logs, uploadId: result.video_id, finalUrl: result.platform_url });
    }

    return res.status(400).json({ success: false, error: "未知的執行階段" });

  } catch (error: any) {
    console.error("Critical Pipeline Failure:", error);
    return res.status(200).json({
      success: false,
      error: `[SYSTEM_CONFLICT] ${error.message || "未知系統錯誤"}`,
      logs
    });
  }
}
