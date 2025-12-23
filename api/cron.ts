
/**
 * 已棄用的 Vercel Cron 處理函式
 * 為了修正編譯錯誤，我們將其改為標準 Node.js 格式
 * 所有的定時排程現在統一由 Google Apps Script (GAS) 驅動
 */
export default async function handler(req: any, res: any) {
  res.status(200).json({ 
    message: "Vercel Cron is deprecated in this project. Please use Google Apps Script (GAS) for automation.",
    status: "inactive"
  });
}
