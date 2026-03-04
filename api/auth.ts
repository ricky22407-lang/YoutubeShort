
export default async function handler(req: any, res: any) {
  const { action, platform = 'youtube' } = req.query;

  // Google / YouTube Config
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (req.headers.host?.includes('localhost') ? 'http://localhost:3000/' : `https://${req.headers.host}/`);

  // Facebook / Instagram Config
  const FB_APP_ID = process.env.FB_APP_ID;
  const FB_APP_SECRET = process.env.FB_APP_SECRET;
  const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI || (req.headers.host?.includes('localhost') ? 'http://localhost:3000/auth/callback/facebook' : `https://${req.headers.host}/auth/callback/facebook`);

  // 1. 生成授權網址並直接跳轉
  if (action === 'url') {
    if (platform === 'facebook' || platform === 'instagram') {
        // Facebook / Instagram Login
        if (!FB_APP_ID) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Error: FB_APP_ID not configured in environment variables.');
        }
        const scope = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
        const url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&state=${platform}&scope=${scope}`;
        res.writeHead(302, { Location: url });
        return res.end();
    } else {
        // Default: YouTube
        const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
        res.writeHead(302, { Location: url });
        return res.end();
    }
  }

  // 2. 交換 Code 變為 Token (處理 POST)
  if (req.method === 'POST') {
    const { code: bodyCode, platform: bodyPlatform = 'youtube' } = req.body;
    
    try {
      if (bodyPlatform === 'facebook' || bodyPlatform === 'instagram') {
          // Exchange FB Code
          const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&client_secret=${FB_APP_SECRET}&code=${bodyCode}`);
          const tokens = await tokenRes.json();
          if (tokens.error) throw new Error(tokens.error.message);
          return res.status(200).json({ success: true, tokens, platform: bodyPlatform });
      } else {
          // Exchange Google Code
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code: bodyCode,
              client_id: GOOGLE_CLIENT_ID!,
              client_secret: GOOGLE_CLIENT_SECRET!,
              redirect_uri: GOOGLE_REDIRECT_URI,
              grant_type: 'authorization_code'
            })
          });
          const tokens = await tokenRes.json();
          if (tokens.error) throw new Error(tokens.error_description || tokens.error);
          return res.status(200).json({ success: true, tokens, platform: 'youtube' });
      }
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
