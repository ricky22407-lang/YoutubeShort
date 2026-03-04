
import express from 'express';
import pipelineHandler from './api/pipeline';
import authHandler from './api/auth';
import uploadVideoHandler from './api/upload_video';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' })); // Increase limit for video uploads
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.all('/api/pipeline', async (req, res) => {
    try {
      await pipelineHandler(req, res);
    } catch (e: any) {
      console.error('Pipeline Error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.all('/api/auth', async (req, res) => {
    try {
      await authHandler(req, res);
    } catch (e: any) {
      console.error('Auth Error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Meta OAuth (Facebook/Instagram)
  app.get('/api/auth/meta', (req, res) => {
      const platform = req.query.platform as string;
      const appId = process.env.META_APP_ID;
      const redirectUri = `${process.env.APP_URL}/api/auth/meta/callback`;
      
      if (!appId) {
          return res.status(500).send("Missing META_APP_ID");
      }

      // Common scopes for both FB and IG posting
      const scope = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
      
      const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&state=${platform}&scope=${scope}&response_type=code`;
      
      res.redirect(authUrl);
  });

  app.get('/api/auth/meta/callback', async (req, res) => {
      const code = req.query.code as string;
      const platform = req.query.state as string; // 'facebook' or 'instagram'
      
      if (!code) return res.send("Authorization failed.");

      // Exchange code for token would happen here
      // For now, we simulate success and redirect back to app
      
      // In a real app:
      // 1. Exchange code for short-lived token
      // 2. Exchange short-lived for long-lived token
      // 3. Store token in DB

      res.redirect(`/?meta_auth_success=true&platform=${platform}&code=${code}`);
  });

  app.all('/api/upload_video', async (req, res) => {
    try {
      await uploadVideoHandler(req, res);
    } catch (e: any) {
      console.error('Upload Error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Vite Middleware (for development)
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve static files
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
