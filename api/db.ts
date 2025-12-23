
import { NextRequest, NextResponse } from 'next/server';

/**
 * 簡單的 Firebase REST API 橋接器
 * 用來讓前端將頻道配置存入雲端數據庫
 */
export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
  const DB_URL = `https://${PROJECT_ID}.firebaseio.com/channels.json`;

  try {
    if (action === 'list') {
      const res = await fetch(DB_URL);
      const data = await res.json();
      const channels = data ? Object.values(data) : [];
      return NextResponse.json({ success: true, channels });
    }

    if (action === 'sync' && req.method === 'POST') {
      const { channels } = await req.json();
      
      // 使用 PUT 覆蓋整個 Firebase Realtime DB 路徑
      await fetch(DB_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channels)
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid Action' }, { status: 400 });

  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
