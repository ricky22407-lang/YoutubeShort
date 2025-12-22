
// Firebase 初始化與通訊模組
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, collection, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * 💡 雲端自動化連線配置：
 * 系統會優先讀取 Vercel 的環境變數 (VITE_FIREBASE_...)
 * 若無變數，則使用下方的預備值。
 */
const firebaseConfig = {
  // 優先嘗試從 Vite 環境變數讀取 (Vercel 部署時使用)
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "REPLACE_WITH_YOUR_API_KEY",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "your-project-id.firebaseapp.com",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "your-project-id",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "your-project-id.appspot.com",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "REPLACE_WITH_SENDER_ID",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || "REPLACE_WITH_APP_ID"
};

// 檢查是否已具備有效的連線資訊
export const isFirebaseConfigured = 
  firebaseConfig.projectId !== "your-project-id" && 
  firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY";

let dbInstance: any = null;

if (isFirebaseConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    dbInstance = getFirestore(app);
    console.log("Firebase 雲端大腦已連線。");
  } catch (e) {
    console.error("Firebase 初始化失敗:", e);
  }
} else {
  console.warn("Firebase 尚未配置，系統將切換至本地預覽模式。");
}

export const db = dbInstance;

/**
 * 將本地配置同步至雲端，供後端自動化使用
 */
export const syncChannelToCloud = async (channel: any) => {
  if (!db || !isFirebaseConfigured) {
    console.warn("尚未配置 Firebase，無法同步至雲端。");
    return;
  }
  
  const channelRef = doc(db, "channels", channel.id);
  await setDoc(channelRef, {
    ...channel,
    updatedAt: Date.now(),
    cloudAutoPilot: true,
    // 儲存授權與排程，讓 Vercel 的 Cron Job 可以代表您執行
    auth: channel.auth 
  }, { merge: true });
};
