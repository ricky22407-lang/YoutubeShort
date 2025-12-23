
export default async function handler(req: any, res: any) {
  const { action } = req.query;
  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();
  
  console.log(`[ONYX DB] Request: ${action}, Project: ${ID_OR_URL ? 'PRESENT' : 'MISSING'}`);

  if (!ID_OR_URL) {
    return res.status(200).json({ 
      success: false, 
      error: '環境變數遺失: 請在 Vercel 設定中配置 VITE_FIREBASE_PROJECT_ID。' 
    });
  }

  let DB_URL = '';
  if (ID_OR_URL.startsWith('http')) {
    DB_URL = ID_OR_URL.endsWith('.json') ? ID_OR_URL : `${ID_OR_URL.endsWith('/') ? ID_OR_URL : ID_OR_URL + '/'}channels.json`;
  } else {
    DB_URL = `https://${ID_OR_URL}.firebaseio.com/channels.json`;
  }

  try {
    if (action === 'list') {
      const dbRes = await fetch(DB_URL);
      if (!dbRes.ok) throw new Error(`Firebase Access Failed: ${dbRes.status}`);
      
      const rawText = await dbRes.text();
      const data = rawText ? JSON.parse(rawText) : null;
      let channels = data ? (Array.isArray(data) ? data : Object.values(data)) : [];
      channels = channels.filter((c: any) => c && typeof c === 'object' && c.id);
      
      return res.status(200).json({ success: true, channels });
    }

    if (action === 'sync' && req.method === 'POST') {
      const { channels } = req.body;
      const syncRes = await fetch(DB_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channels || [])
      });
      if (!syncRes.ok) throw new Error(`Firebase Sync Failed: ${syncRes.status}`);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Unknown Action' });
  } catch (e: any) {
    console.error("[ONYX DB Error]", e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}
