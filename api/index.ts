import express from 'express';
// import { createServer as createViteServer } from 'vite'; // Dynamic import used below
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

// Increase max listeners to prevent memory leak warnings
EventEmitter.defaultMaxListeners = 100;
process.setMaxListeners(100);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// --- ROUTES START ---

// API Route: Scrape images from a URL
app.post('/api/scrape', async (req: any, res: any) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Try multiple scraping strategies to bypass IP/Bot detection
  const strategies = [
    {
      name: 'Browser-like',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': new URL(url).origin,
      }
    },
    {
      name: 'Search Bot',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }
  ];

  for (const strategy of strategies) {
    try {
      const response = await axios.get(url, {
        headers: strategy.headers,
        timeout: 8000 // Tight timeout for Vercel (10s total limit)
      });

      const html = response.data;
      const $ = cheerio.load(html);
      const imagesArr: string[] = [];
      const baseUrl = new URL(url);

      // 1. Scan DOM elements in order
      $('img, source, div, section, a, [style*="url("]').each((_, el) => {
        const element = $(el);
        const node = el.type === 'tag' ? el : null;
        if (!node) return;

        let foundUrl = '';
        
        // Priority attributes (especially for lazy-loaded content like manga/comics)
        const prioAttrs = [
          'data-src', 
          'data-lazy-src', 
          'data-lazy', 
          'data-original', 
          'data-srcset', 
          'src', 
          'srcset',
          'data-medium-file',
          'data-large-file'
        ];

        for (const attr of prioAttrs) {
          const val = element.attr(attr);
          if (val && typeof val === 'string' && val.trim()) {
            const cleaned = val.trim().split(',')[0].split(' ')[0].trim();
            if (cleaned.startsWith('http') || cleaned.startsWith('/') || cleaned.startsWith('//') || cleaned.startsWith('./') || cleaned.startsWith('../')) {
              foundUrl = cleaned;
              break;
            }
          }
        }

        // If still not found, check background-image style
        if (!foundUrl) {
          const style = element.attr('style');
          if (style && style.includes('url(')) {
            const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (match && match[1]) foundUrl = match[1];
          }
        }

        if (foundUrl) {
          try {
            let preparedUrl = foundUrl;
            if (foundUrl.startsWith('//')) {
              preparedUrl = `${baseUrl.protocol}${foundUrl}`;
            }
            const absoluteUrl = new URL(preparedUrl, baseUrl.href).href;
            
            // Basic deduplication while maintaining order
            if (!imagesArr.includes(absoluteUrl)) {
              imagesArr.push(absoluteUrl);
            }
          } catch (e) {}
        }
      });

      // 2. Fallback for sites that use JSON/scripts to store images (like some webtoons)
      // Only do this if we haven't found many images yet or if images look like placeholders
      if (imagesArr.length < 5) {
        $('script').each((_, el) => {
          const content = $(el).html();
          if (content && (content.includes('images') || content.includes('chapters') || content.includes('data-src'))) {
            const urlRegex = /https?:\/\/[^\/\s"'<>]+[^\s"'<>]*\.(?:jpg|jpeg|gif|png|webp|avif|bmp|svg|jfif|tiff|heic|heif)/gi;
            const matches = content.match(urlRegex);
            if (matches) {
              matches.forEach(match => {
                if (!imagesArr.includes(match)) imagesArr.push(match);
              });
            }
          }
        });
      }

      const allImages = imagesArr;
      const cleanedImages = Array.from(new Set(allImages.map(img => {
        if (img.includes('komiku.org') && img.includes('?resize=')) {
          return img.split('?')[0];
        }
        return img;
      })));

      let filteredImages = cleanedImages.filter(img => {
        const lowerImg = img.toLowerCase();
        if (lowerImg.includes('uploads') || lowerImg.includes('chapter') || lowerImg.includes('manga') || lowerImg.includes('comic') || lowerImg.includes('komiku')) {
          return true;
        }
        const junkKeywords = ['logo', 'avatar', 'profile', 'banner', 'button', 'loading', 'spinner', 'pixel', 'advertisement', 'ads', 'facebook', 'twitter', 'instagram', 'header', 'footer', 'menu'];
        const isJunk = junkKeywords.some(keyword => lowerImg.includes(keyword));
        return !isJunk;
      });

      if (filteredImages.length === 0 && cleanedImages.length > 0) {
        filteredImages = cleanedImages.slice(0, 100);
      }

      return res.json({ images: filteredImages });
    } catch (error: any) {
      console.error(`Scraping strategy ${strategy.name} failed:`, error.message);
      // If this was the last strategy, throw error
      if (strategy.name === strategies[strategies.length - 1].name) {
        return res.status(500).json({ 
          error: 'Gagal mengambil gambar. Website tersebut memblokir akses dari Vercel. Silakan gunakan fitur SHARE di AI Studio (kiri bawah) yang lebih stabil, atau coba link dari website mirror lain.' 
        });
      }
    }
  }
});

// API Route: Proxy image
app.get('/api/proxy-image', async (req: any, res: any) => {
  const imageUrl = req.query.url as string;
  const referer = req.query.referer as string;
  
  if (!imageUrl) {
    return res.status(400).send('URL is required');
  }

  const presets = [
    {
      name: 'Same-Origin',
      url: imageUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': referer || `https://${new URL(imageUrl).hostname}/`,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      timeout: 3500
    },
    {
      name: 'Google Proxy',
      url: `https://images1-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&refresh=2592000&url=${encodeURIComponent(imageUrl)}`,
      headers: { 'Accept': 'image/*' },
      timeout: 4000
    },
    {
      name: 'DuckDuckGo Proxy',
      url: `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(imageUrl)}&f=1`,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 4000
    }
  ];

  for (let i = 0; i < presets.length; i++) {
    try {
      const preset = presets[i];
      const response = await axios.get(preset.url, {
        responseType: 'arraybuffer',
        headers: preset.headers,
        timeout: preset.timeout,
        validateStatus: (status) => status === 200
      });

      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(response.data);
    } catch (error: any) {
      if (i === presets.length - 1) {
        return res.status(500).send('Forbidden or error after multiple attempts');
      }
      continue;
    }
  }
});

// --- ROUTES END ---

async function configureServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    // Only serve static files if NOT on Vercel (AI Studio / Local Prod)
    // Vercel handles static hosting via rewrites in vercel.json
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

configureServer();

export default app;
