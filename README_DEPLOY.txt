# ShortsPilot v8.15 - Deployment & API Configuration Guide

This document outlines the necessary API keys and environment variables required to run ShortsPilot v8.15 in a production environment (e.g., Vercel).

## 1. Core AI Engine

The application relies heavily on Google's Gemini models for script generation, analysis, and video generation (Veo).

*   **Variable Name:** `API_KEY`
*   **Description:** Google Gemini API Key.
*   **Required For:** Script generation, Optimization Reports, Topic Suggestions, Veo Video Generation.
*   **Get it here:** [Google AI Studio](https://aistudio.google.com/)

## 2. Stock Footage (Pexels)

Used for the "Hybrid Mode" video generation to fetch real-world stock footage.

*   **Variable Name:** `PEXELS_API_KEY`
*   **Description:** Pexels API Key.
*   **Required For:** Searching and downloading stock videos.
*   **Get it here:** [Pexels API](https://www.pexels.com/api/)

## 3. YouTube Integration (OAuth)

Required for uploading Shorts to YouTube and fetching channel analytics (future implementation).

*   **Variable Name:** `GOOGLE_CLIENT_ID`
*   **Variable Name:** `GOOGLE_CLIENT_SECRET`
*   **Description:** OAuth 2.0 Client ID and Secret from Google Cloud Console.
*   **Configuration:**
    *   **Authorized JavaScript origins:** Your Vercel domain (e.g., `https://your-app.vercel.app`)
    *   **Authorized redirect URIs:** `https://your-app.vercel.app` (The app handles the code in the frontend)
*   **Get it here:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

## 4. Social Media Integration (Instagram / Facebook) [Coming Soon]

Currently, the UI shows these options, but the backend integration is pending. When implemented, you will need:

*   **Variable Name:** `META_APP_ID`
*   **Variable Name:** `META_APP_SECRET`
*   **Description:** App ID and Secret for Facebook Login / Instagram Graph API.
*   **Get it here:** [Meta for Developers](https://developers.facebook.com/)

## 5. Cron Jobs (Automation)

Used to secure the automated pipeline trigger endpoint.

*   **Variable Name:** `CRON_SECRET`
*   **Description:** A secret string used to authenticate requests to `/api/cron`.
*   **Usage:** When setting up Vercel Cron Jobs, this secret must be included in the header.

## 6. Other Settings

*   **Variable Name:** `NODE_ENV`
*   **Value:** `production`

---

## Summary of Environment Variables

```env
API_KEY=your_gemini_api_key
PEXELS_API_KEY=your_pexels_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
CRON_SECRET=your_custom_cron_secret
# META_APP_ID= (Future)
# META_APP_SECRET= (Future)
```
