
export default async function handler(req: any, res: any) {
  const { action } = req.query;

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (req.headers.host?.includes('localhost') ? 'http://localhost:3000/' : `https://${req.headers.host}/`);

  // 1. 生成授權網址並直接跳轉
  if (action === 'url') {
    const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    
    // 直接執行 302 重定向，不再回傳 JSON
    res.writeHead(302, { Location: url });
    return res.end();
  }

  // 2. 交換 Code 變為 Token (處理 POST)
  if (req.method === 'POST') {
    const { code: bodyCode } = req.body;
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: bodyCode,
          client_id: CLIENT_ID!,
          client_secret: CLIENT_SECRET!,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });
      const tokens = await tokenRes.json();
      if (tokens.error) throw new Error(tokens.error_description || tokens.error);
      return res.status(200).json({ success: true, tokens });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
