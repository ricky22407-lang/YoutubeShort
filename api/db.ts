
export default async function handler(req: any, res: any) {
  const { action } = req.query;
  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();
  
  if (!ID_OR_URL) {
    return res.status(200).json({ 
      success: false, 
      error: '環境變數遺失: 請在 Vercel 設定中配置 VITE_FIREBASE_PROJECT_ID。' 
    });
  }

  const getFullUrl = (input: string) => {
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    // 判斷是否為自定義區域專案 (ID 中包含 . 或 -rtdb)
    if (input.includes('.') || input.includes('-rtdb')) {
      const id = input.split('.')[0];
      const region = input.includes('.') ? input.split('.')[1] : 'asia-southeast1';
      return `https://${id}.${region}.firebasedatabase.app/channels.json`;
    }
    // 預設舊版
    return `https://${input}.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);

  try {
    if (action === 'list') {
      const dbRes = await fetch(DB_URL);
      if (!dbRes.ok) {
        if (dbRes.status === 404) {
          throw new Error(`找不到路徑。解決方案：1. 請確保已在 Firebase Console 點擊「建立資料庫」。2. 如果您的專案在台灣，請將環境變數改為完整網址。當前嘗試：${DB_URL}`);
        }
        throw new Error(`Firebase Error: ${dbRes.status}`);
      }
      
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
