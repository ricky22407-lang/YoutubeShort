# YouTube Shorts Automation System 2.0 (Production Ready)

A production-grade, multi-channel automation suite for YouTube Shorts. Integrates **Real Trend Analysis (YouTube Data API)**, **Veo 3.1 Video Generation (9:16)**, and **Multi-account OAuth Management**.

**Roles:**
*   **Project Lead**: Grok
*   **Lead Engineer**: Gemini

---

## 🌟 Key Features

*   **Multi-Channel Management**: Manage config/auth for unlimited YouTube channels via UI.
*   **Real-Time Trends**: Fetches actual high-performing Shorts data using `googleapis`.
*   **Veo 3.1 Integration**: Automatically generates 9:16 vertical videos.
*   **Automated Pipeline**: Trend -> Theme -> Script -> Video -> Upload in one click.
*   **Persistent Auth**: Stores OAuth tokens locally for seamless re-runs.

---

## 🛠️ Setup Guide

### 1. Environment Variables

Create `.env` in root:

```env
API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/
```

### 2. Google Cloud Console (Required)

1.  Enable **YouTube Data API v3**.
2.  Create OAuth 2.0 Client (Web Application).
3.  Add Redirect URI: `http://localhost:3000/`.
4.  Add Test Users (your email) if in "Testing" mode.

### 3. Running the App

```bash
npm install
npm run dev
```

---

## 📅 Scheduling & Automation (Cron)

Since this project uses a Client-Side config storage (LocalStorage) for simplicity in this demo, "True Background Cron" requires a database adapter.

**Current Automation Method:**
1.  Keep the browser tab open.
2.  Use the "立即執行全自動流程" (Run Now) button on the dashboard.

**Production Cron Setup (Optional):**
To enable server-side cron (e.g. Vercel Cron):
1.  You must implement a Database (Postgres/Redis) to store `ChannelConfig` and `AuthTokens`.
2.  Update `api/cron.ts` to fetch configs from DB instead of `req.body`.
3.  Configure `vercel.json` crons to hit `/api/cron`.

---

## 🧩 Architecture

*   **Frontend**: React Dashboard (Channel Management, Logs).
*   **Backend**: Next.js API Routes (Pipeline Orchestration).
*   **TrendSearcher**: `googleapis` (YouTube Data API).
*   **AI Engine**: Google GenAI SDK (`gemini-2.5-flash` for text, `veo-3.1` for video).

---

## ⚠️ Quotas & Limits

*   **YouTube Search**: Costs 100 quota units per run.
*   **YouTube Upload**: Costs 1600 quota units per run.
*   **Veo Generation**: Costs approx $0.05 - $0.10 per video (Preview pricing).
