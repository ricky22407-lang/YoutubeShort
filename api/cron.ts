
import handler from './pipeline';

/**
 * 雲端自動化觸發器 (Cloud Automation Trigger)
 * 
 * 若要實現網頁關閉後自動運作：
 * 1. 使用 Vercel Cron 或 GitHub Actions 定時呼叫此 API。
 * 2. 傳入 channel 物件與 metadata。
 * 3. 本 API 將在伺服器端執行所有的 AI 分析與影片生成。
 */
export default async function cronHandler(req: any, res: any) {
    // 檢查安全性 (可自訂 SECRET_KEY)
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || 'pilot_v8_secret';

    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: 'Ready', 
            instruction: '請使用 POST 請求並攜帶 Channel 數據以觸發自動化流程。' 
        });
    }

    if (req.method === 'POST') {
        // 這裡可以加入簡單的密鑰檢查
        if (req.body.secret && req.body.secret !== cronSecret) {
            return res.status(403).json({ error: 'Unauthorized Trigger' });
        }
        
        // 轉發給 pipeline 處理核心
        return handler(req, res);
    }
    
    return res.status(405).json({ error: 'Method Not Allowed' });
}
