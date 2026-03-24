# Deployment Guide

## 🚀 Quick Deployment Options

### Option 1: GitHub Pages (Free, Simplest)

#### Prerequisites
- GitHub account
- Git installed locally

#### Steps

1. **Create a GitHub repo**
   ```bash
   # In your project directory
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/football-tracking-radar.git
   git branch -M main
   git push -u origin main
   ```

2. **Enable GitHub Pages**
   - Go to repo Settings → Pages
   - Under "Source", select `main` branch
   - Set folder to `/dist`
   - Save

3. **Configure Vite for GitHub Pages**
   
   Edit `vite.config.js`:
   ```javascript
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
     base: '/football-tracking-radar/',  // Match repo name
   });
   ```

4. **Build and deploy**
   ```bash
   npm run build
   git add dist
   git commit -m "Deploy to GitHub Pages"
   git push
   ```

   Your app is live at: `https://YOUR_USERNAME.github.io/football-tracking-radar/`

---

### Option 2: Netlify (Very Easy)

1. **Build locally**
   ```bash
   npm run build
   ```

2. **Go to [netlify.com](https://netlify.com)**
   - Drag-and-drop the `dist` folder
   - Done! Instant live URL

Or connect your GitHub repo for auto-deployment on push.

---

### Option 3: Vercel

1. Install Vercel CLI
   ```bash
   npm i -g vercel
   ```

2. Deploy
   ```bash
   vercel
   ```

3. Follow prompts - deployed instantly

---

### Option 4: Self-Host (Advanced)

If you want to host on your own server (AWS, DigitalOcean, etc.):

1. Build
   ```bash
   npm run build
   ```

2. Upload `dist/` folder to server
3. Configure web server to serve `index.html` for SPA routing

Example Nginx config:
```nginx
server {
  listen 80;
  server_name yourdomain.com;
  root /var/www/football-tracking;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

---

## 📋 Pre-Deployment Checklist

- [ ] Data path works correctly in production
  - For local JSON: ensure `public/Data/` folder is included
  - For API endpoint: make sure CORS is enabled
- [ ] Canvas renders correctly at different screen sizes
- [ ] Test on mobile (if needed)
- [ ] Update `base` in `vite.config.js` if deploying to subdirectory
- [ ] Build completes without errors: `npm run build`

---

## 🔗 Loading Data in Production

### Local JSON (GitHub Pages/Netlify)

1. Place files in `public/` directory:
   ```
   public/
   └── Data/
       ├── 1886347_match.json
       └── 1886347_tracking_extrapolated.jsonl
   ```

2. Reference in App.jsx:
   ```javascript
   <TrackingRadar dataPath="/Data/1886347_tracking_extrapolated.jsonl" useMockData={false} />
   ```

### Remote API

If your data is on a server (e.g., AWS S3, custom API):

```javascript
<TrackingRadar 
  dataPath="https://api.example.com/tracking-data.jsonl"
  useMockData={false}
/>
```

**Enable CORS on your API if cross-origin!**

---

## 📊 File Size & Performance

### Production Build Size
```
dist/index.html        ~10 KB
dist/assets/main.js    ~150 KB (React + your code, minified)
```

Third-party dependencies are already minified by Vite.

### Data Size Limits
- GitHub Pages: Entire repo max 100 GB (not a concern)
- Netlify: Free tier 100 GB/month bandwidth
- Browser: Load-time increases with file size
  - 250 frames: ~200 KB JSONL
  - 2500 frames: ~2 MB JSONL
  - Limit is browser memory, typically OK for <10K frames

---

## 🔒 Security Notes

- No sensitive data is sent to servers (loads locally)
- Vite auto-handles XSS protection
- HTML5 Canvas is sandboxed

---

## 📱 Mobile Support

The app works on mobile! For best experience:

```javascript
// In vite.config.js, add viewport meta tag handling
// Already included in index.html automatically
```

Test on phone with:
```bash
npm run dev
# Then visit http://YOUR_IP:5173 on mobile
```

---

## 🆘 Deployment Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank page after deployment | Check console (F12), verify data paths |
| 404 on data load | Data files in `public/`, check path prefix |
| Slow load | Compress JSONL with gzip, use CDN |
| CSS/JS not loading | Update `base` in vite.config.js |

---

## 💡 Tips

1. **Reduce data file size**
   ```bash
   # Gzip your JSONL
   gzip 1886347_tracking_extrapolated.jsonl
   ```

2. **Use a CDN for large datasets**
   - Upload to CloudFront, Cloudflare, or jsDelivr
   - Reference in App.jsx with full HTTPS URL

3. **Monitor performance**
   - Use Lighthouse in Chrome DevTools
   - Target: <3s initial load, 60fps playback

4. **Update frequently?**
   - Set up GitHub Actions for auto-deploy
   - Deploy on every push to `main` branch

---

## ✨ Example: Full GitHub Pages Setup

```bash
# One-time setup
git init
git remote add origin https://github.com/YOUR_USERNAME/football-radar.git

# Build
npm run build

# Deploy
git add dist/
git commit -m "Build for deployment"
git push

# Check GitHub Settings > Pages to verify
# Live at: https://YOUR_USERNAME.github.io/football-radar/
```

**That's it!** Your app is live in 2 minutes. 🚀

---

See README.md for more project info.
