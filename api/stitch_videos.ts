
import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

// 設定 FFmpeg 執行檔路徑
ffmpeg.setFfmpegPath(ffmpegPath.path);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // 允許較大的 Payload 用於傳輸多個影片片段
    },
  },
  maxDuration: 60, // 拼接可能需要一點時間
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { segments } = req.body; // segments: string[] (Base64 data URLs)
  
  if (!segments || !Array.isArray(segments) || segments.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 segments to stitch.' });
  }

  const tmpDir = os.tmpdir();
  const filePaths: string[] = [];
  const outputFilePath = path.join(tmpDir, `merged_${Date.now()}.mp4`);
  const listFilePath = path.join(tmpDir, `list_${Date.now()}.txt`);

  try {
    console.log(`[Stitcher] Processing ${segments.length} segments...`);

    // 1. 將 Base64 寫入暫存檔案
    segments.forEach((segUrl, index) => {
      const base64Data = segUrl.split(',')[1]; // Remove "data:video/mp4;base64,"
      const buffer = Buffer.from(base64Data, 'base64');
      const filePath = path.join(tmpDir, `seg_${Date.now()}_${index}.mp4`);
      fs.writeFileSync(filePath, buffer);
      filePaths.push(filePath);
    });

    // 2. 建立 FFmpeg concat list file (file 'path')
    // 這是最穩定的拼接方式
    const listContent = filePaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(listFilePath, listContent);

    // 3. 執行 FFmpeg 拼接
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy']) // 直接複製串流，不重新編碼 (速度最快，畫質無損)
        .save(outputFilePath)
        .on('end', () => {
          console.log('[Stitcher] FFmpeg merge finished.');
          resolve(true);
        })
        .on('error', (err: any) => {
          console.error('[Stitcher] FFmpeg error:', err);
          reject(err);
        });
    });

    // 4. 讀取合併後的檔案並轉回 Base64
    const mergedBuffer = fs.readFileSync(outputFilePath);
    const mergedBase64 = `data:video/mp4;base64,${mergedBuffer.toString('base64')}`;

    // 5. 清理暫存檔
    try {
      filePaths.forEach(p => fs.unlinkSync(p));
      fs.unlinkSync(listFilePath);
      fs.unlinkSync(outputFilePath);
    } catch (cleanupErr) {
      console.warn("Temp file cleanup failed:", cleanupErr);
    }

    return res.status(200).json({ 
      success: true, 
      mergedVideoUrl: mergedBase64 
    });

  } catch (e: any) {
    console.error("Stitching Error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
