
/**
 * 修正後的 Firebase REST API 橋接器
 * 不再依賴 next/server，改用 Vercel Node.js 標準格式
 */
export default async function handler(req: any, res: any) {
  const { action } = req.query;
  const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
  const DB_URL = `https://${PROJECT_ID}.firebaseio.com/channels.json`;

  try {
    if (action === 'list') {
      const dbRes = await fetch(DB_URL);
      const data = await dbRes.json();
      const channels = data ? Object.values(data) : [];
      return res.status(200).json({ success: true, channels });
    }

    if (action === 'sync' && req.method === 'POST') {
      const { channels } = req.body;
      
      await fetch(DB_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channels)
      });

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid Action' });

  } catch (e: any) {
    console.error("[DB Bridge Error]", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
