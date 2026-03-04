# ShortsPilot - Automated Short Video Production System

A production-grade, multi-channel automation suite for YouTube Shorts, Instagram Reels, and Facebook Reels. Integrates **Real Trend Analysis**, **AI Video Generation (Veo/Sora)**, **Advanced TTS (Edge/ElevenLabs)**, and **Multi-platform Publishing**.

---

## 🚀 Deployment & Environment Setup

When deploying to Vercel, Cloud Run, or any other environment, you **MUST** configure the following Environment Variables.

### 1. Core System (Required)

| Variable Name | Description | Example / How to Get |
| :--- | :--- | :--- |
| `API_KEY` | **Google Gemini API Key**. Used for script generation, trend analysis, and Veo video generation. | [Google AI Studio](https://aistudio.google.com/) |
| `APP_URL` | The base URL of your deployed application. Used for OAuth redirects. | `https://your-app.vercel.app` |

### 2. Video & Asset Generation (Required)

| Variable Name | Description | Example / How to Get |
| :--- | :--- | :--- |
| `PEXELS_API_KEY` | **Pexels API Key**. Used for searching stock footage. | [Pexels API](https://www.pexels.com/api/) |
| `VOLC_ACCESS_KEY` | **Volcengine Access Key**. Required for Jimeng (即夢) video generation. | [Volcengine Console](https://console.volcengine.com/) |
| `VOLC_SECRET_KEY` | **Volcengine Secret Key**. Required for Jimeng (即夢) video generation. | [Volcengine Console](https://console.volcengine.com/) |
| `HEYGEN_API_KEY` | **HeyGen API Key**. Required for Digital Twin video generation. | [HeyGen API](https://docs.heygen.com/) |

### 3. Voice & Audio (Optional but Recommended)

| Variable Name | Description | Example / How to Get |
| :--- | :--- | :--- |
| `ELEVENLABS_API_KEY` | **ElevenLabs API Key**. Required if you want to use "IP Cloning" or custom voices. | [ElevenLabs](https://elevenlabs.io/) |

### 4. Social Media Integration (OAuth)

#### Google / YouTube (Required for YouTube Uploads)
| Variable Name | Description | Example / How to Get |
| :--- | :--- | :--- |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID for YouTube Data API. | [Google Cloud Console](https://console.cloud.google.com/) |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret. | [Google Cloud Console](https://console.cloud.google.com/) |
| `GOOGLE_REDIRECT_URI` | **MUST MATCH** your deployment URL + `/`. | `https://your-app.vercel.app/` |

#### Meta / Facebook & Instagram (Required for FB/IG Uploads)
| Variable Name | Description | Example / How to Get |
| :--- | :--- | :--- |
| `META_APP_ID` | Meta App ID (Facebook Developers). | [Meta for Developers](https://developers.facebook.com/) |
| `META_APP_SECRET` | Meta App Secret. | [Meta for Developers](https://developers.facebook.com/) |

---

## 🛠️ Feature Configuration

### Audio Engine
- **Edge TTS (Default)**: Free, high-quality neural voices. No key required.
- **ElevenLabs**: Paid, supports Voice Cloning. Requires `ELEVENLABS_API_KEY`.

### Video Engine
- **Veo (Default)**: Google's video generation model. Uses `API_KEY`.
- **Stock Footage**: Uses Pexels. Uses `PEXELS_API_KEY`.

### Social Platforms
- **YouTube**: Requires Google OAuth setup.
- **Instagram/Facebook**: Requires Meta App setup with "Instagram Graph API" and "Pages API" permissions.

---

## ⚠️ Quotas & Limits

*   **YouTube Search**: Costs 100 quota units per run.
*   **YouTube Upload**: Costs 1600 quota units per run.
*   **Veo Generation**: Costs approx $0.05 - $0.10 per video (Preview pricing).
*   **ElevenLabs**: Costs per character generated. Check your plan limits.

---

## 🧩 Architecture

*   **Frontend**: React Dashboard (Channel Management, Logs).
*   **Backend**: Node.js/Express (Pipeline Orchestration, FFmpeg Video Assembly).
*   **TrendSearcher**: `googleapis` (YouTube Data API).
*   **AI Engine**: Google GenAI SDK (`gemini-2.5-flash` for text, `veo-3.1` for video).
*   **TTS Engine**: `edge-tts` (Free) or `elevenlabs` (Paid).
