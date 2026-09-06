const DEVELOPER_ID = '8492935961111201169';
const DEVELOPER_URL = `https://play.google.com/store/apps/dev?id=${DEVELOPER_ID}&hl=ar&gl=EG`;
const PLAY_ORIGIN = 'https://play.google.com';
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  'pragma': 'no-cache'
};

function cleanText(value = '') {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&#x3D;/gi, '=')
    .replace(/&#61;/g, '=');
}

function normalizeHtml(html = '') {
  return decodeEntities(String(html))
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMeta(html, key) {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return '';
}

function findSoftwareApplication(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSoftwareApplication(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  const type = value['@type'];
  if (type === 'SoftwareApplication' || (Array.isArray(type) && type.includes('SoftwareApplication'))) return value;
  if (value['@graph']) return findSoftwareApplication(value['@graph']);
  return null;
}

function getStructuredData(html) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(decodeEntities(script[1]).trim());
      const app = findSoftwareApplication(parsed);
      if (app) return app;
    } catch {}
  }
  return null;
}

function toWesternDigits(value = '') {
  const map = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
  return String(value).replace(/[٠-٩]/g, digit => map[digit]);
}

function parseInstallText(html = '') {
  const normalized = normalizeHtml(html).replace(/\s+/g, ' ');
  const patterns = [
    /(\+[0-9٠-٩][0-9٠-٩.,٬]*|[0-9٠-٩][0-9٠-٩.,٬]*\+)\s*.{0,80}?(?:عملية تنزيل|تنزيل|Downloads?)/i,
    /(?:Downloads?|عمليات التنزيل|التنزيلات).{0,80}?(\+[0-9٠-٩][0-9٠-٩.,٬]*|[0-9٠-٩][0-9٠-٩.,٬]*\+)/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return toWesternDigits(match[1]).replace(/٬/g, ',');
  }
  return '';
}

function installsToNumber(value = '') {
  const normalized = toWesternDigits(value).replace(/[+,٬\s]/g, '').replace(/,/g, '');
  const match = normalized.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!match) return 0;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return 0;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] || '').toUpperCase()] || 1;
  return Math.round(base * multiplier);
}

function normalizeCategory(value = '') {
  const text = cleanText(value);
  if (!text) return 'تطبيق';
  const aliases = {
    'APPLICATION': 'تطبيق',
    'GAME': 'لعبة',
    'BOOKS_AND_REFERENCE': 'كتب ومراجع',
    'EDUCATION': 'تعليم',
    'ENTERTAINMENT': 'ترفيه',
    'LIFESTYLE': 'نمط حياة',
    'PRODUCTIVITY': 'إنتاجية',
    'TOOLS': 'أدوات'
  };
  return aliases[text.toUpperCase()] || text.replace(/_/g, ' ');
}

function mapLibraryApp(app) {
  const score = Number(app.score || 0);
  const installs = cleanText(app.installs || '');
  return {
    appId: app.appId || '',
    name: cleanText(app.title || ''),
    description: cleanText(app.summary || app.description || '').slice(0, 320),
    category: normalizeCategory(app.genre || app.genreId || ''),
    rating: score > 0 ? score.toFixed(1) : '—',
    downloads: installs ? `${installs} تحميل` : 'متاح على Google Play',
    minInstalls: Number(app.minInstalls || installsToNumber(installs) || 0),
    image: app.headerImage || app.screenshots?.[0] || app.icon || '',
    icon: app.icon || '',
    url: app.url || `${PLAY_ORIGIN}/store/apps/details?id=${encodeURIComponent(app.appId || '')}&hl=ar&gl=EG`,
    buttonText: app.free === false ? 'عرض التطبيق' : 'تنزيل مجاني'
  };
}

async function fetchText(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: HEADERS,
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractAppIds(html) {
  const normalized = normalizeHtml(html);
  const ids = new Set();
  const patterns = [
    /\/store\/apps\/details\?id=([A-Za-z0-9._]+)/g,
    /play\.google\.com\/store\/apps\/details\?id=([A-Za-z0-9._]+)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalized))) ids.add(match[1]);
  }
  return [...ids];
}

async function fetchAppDetails(appId) {
  const url = `${PLAY_ORIGIN}/store/apps/details?id=${encodeURIComponent(appId)}&hl=ar&gl=EG`;
  const html = normalizeHtml(await fetchText(url));
  const data = getStructuredData(html) || {};
  const rawTitle = cleanText(data.name || getMeta(html, 'og:title') || appId);
  const name = rawTitle.replace(/\s*[—-]\s*(?:Apps?|تطبيقات) on Google Play.*$/i, '').trim();
  const description = cleanText(data.description || getMeta(html, 'og:description') || getMeta(html, 'description')).slice(0, 320);
  const score = Number(data.aggregateRating?.ratingValue || 0);
  const installText = parseInstallText(html);
  const imageValue = Array.isArray(data.image) ? data.image[0] : data.image;
  const image = cleanText(imageValue?.url || imageValue || getMeta(html, 'og:image'));
  return {
    appId,
    name,
    description,
    category: normalizeCategory(data.applicationCategory || ''),
    rating: score > 0 ? score.toFixed(1) : '—',
    downloads: installText ? `${installText} تحميل` : 'متاح على Google Play',
    minInstalls: installsToNumber(installText),
    image,
    icon: image,
    url,
    buttonText: 'تنزيل من Google Play'
  };
}

async function scrapeDirectly() {
  const developerHtml = await fetchText(DEVELOPER_URL);
  const appIds = extractAppIds(developerHtml).slice(0, 60);
  if (!appIds.length) throw new Error('NO_APP_IDS_FOUND');
  const settled = await Promise.allSettled(appIds.map(fetchAppDetails));
  const apps = settled
    .filter(item => item.status === 'fulfilled')
    .map(item => item.value)
    .filter(app => app.appId && app.name);
  if (!apps.length) throw new Error('NO_APP_DETAILS_FOUND');
  return apps;
}

async function scrapeWithLibrary() {
  const module = await import('@mradex77/google-play-scraper');
  const gplay = module.default || module;
  try {
    const full = await gplay.developer({
      devId: DEVELOPER_ID,
      lang: 'ar',
      country: 'eg',
      num: 60,
      fullDetail: true
    });
    const apps = Array.isArray(full) ? full.map(mapLibraryApp).filter(app => app.appId && app.name) : [];
    if (apps.length) return apps;
  } catch {}
  const basic = await gplay.developer({
    devId: DEVELOPER_ID,
    lang: 'ar',
    country: 'eg',
    num: 60,
    fullDetail: false
  });
  const apps = Array.isArray(basic) ? basic.map(mapLibraryApp).filter(app => app.appId && app.name) : [];
  if (!apps.length) throw new Error('LIBRARY_RETURNED_NO_APPS');
  return apps;
}

function getStats(apps) {
  const ratings = apps.map(app => Number(app.rating)).filter(value => Number.isFinite(value) && value > 0);
  return {
    appsCount: apps.length,
    averageRating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0,
    totalMinInstalls: apps.reduce((sum, app) => sum + Number(app.minInstalls || 0), 0)
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');

  let libraryError = '';
  try {
    const apps = await scrapeWithLibrary();
    return res.status(200).json({
      developerId: DEVELOPER_ID,
      developerUrl: DEVELOPER_URL,
      source: 'Google Play',
      mode: 'scraper',
      fetchedAt: new Date().toISOString(),
      stats: getStats(apps),
      apps
    });
  } catch (error) {
    libraryError = error?.message || 'SCRAPER_FAILED';
  }

  try {
    const apps = await scrapeDirectly();
    return res.status(200).json({
      developerId: DEVELOPER_ID,
      developerUrl: DEVELOPER_URL,
      source: 'Google Play',
      mode: 'direct',
      fetchedAt: new Date().toISOString(),
      stats: getStats(apps),
      apps
    });
  } catch (error) {
    return res.status(502).json({
      error: 'GOOGLE_PLAY_FETCH_FAILED',
      developerUrl: DEVELOPER_URL,
      details: {
        scraper: libraryError,
        direct: error?.message || 'DIRECT_FETCH_FAILED'
      }
    });
  }
};
