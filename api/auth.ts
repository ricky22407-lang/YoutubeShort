
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  
  const { action } = req.query;

  // 1. 環境診斷
  if (action === 'check') {
    const hasApiKey = !!(process.env.API_KEY || process.env.GEMINI_API_KEY);
    return res.status(200).json({
      api_key: hasApiKey,
      oauth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      env_info: {
        timestamp: Date.now(),
        api_key_found: hasApiKey,
        oauth_configured: !!process.env.GOOGLE_CLIENT_ID
      }
    });
  }

  try {
    const { google } = await import('googleapis');
    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/';

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(200).json({ 
        success: false, 
        error: "伺服器環境配置不完整 (GOOGLE_CLIENT_ID 缺失)。" 
      });
    }

    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

    if (req.method === 'GET' && action === 'url') {
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
        prompt: 'consent'
      });
      return res.status(200).json({ url });
    }

    if (req.method === 'POST') {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Missing code' });
      const { tokens } = await oauth2Client.getToken(code);
      return res.status(200).json({ tokens });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (error: any) {
    console.error("Auth Module Error:", error);
    return res.status(200).json({ 
        success: false, 
        error: "授權模組發生內部錯誤: " + (error.message || "Unknown") 
    });
  }
}
