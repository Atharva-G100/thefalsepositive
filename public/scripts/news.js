/* ============================================
   THE FALSE POSITIVE — news.js
   Live cybersecurity RSS feed fetcher
   ============================================ */

'use strict';

// ── Config ────────────────────────────────────
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// RSS feeds via rss2json (free, no auth)
const FEEDS = [
  {
    name: 'The Hacker News',
    url:  'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Ffeeds.feedburner.com%2FTheHackersNews',
    category: 'vulnerability'
  },
  {
    name: 'Krebs on Security',
    url:  'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fkrebsonsecurity.com%2Ffeed%2F',
    category: 'breach'
  },
  {
    name: 'Bleeping Computer',
    url:  'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.bleepingcomputer.com%2Ffeed%2F',
    category: 'research'
  },
  {
    name: 'Dark Reading',
    url:  'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.darkreading.com%2Frss.xml',
    category: 'research'
  }
];

// ── State ─────────────────────────────────────
let allArticles    = [];
let activeFilter   = 'all';
let refreshTimer   = null;

// ── DOM refs ──────────────────────────────────
const newsGrid     = document.getElementById('news-grid');
const countLabel   = document.getElementById('news-count-label');
const lastUpdated  = document.getElementById('news-last-updated');
const refreshBtn   = document.getElementById('news-refresh-btn');
const filterBtns   = document.querySelectorAll('.news-filter-btn');

// ── Helpers ───────────────────────────────────
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function truncate(text, maxLen = 140) {
  const clean = stripHtml(text).trim();
  return clean.length > maxLen ? clean.slice(0, maxLen).trimEnd() + '...' : clean;
}

function getCategoryLabel(category) {
  const map = {
    vulnerability: 'CVE',
    breach:        'Breach',
    tools:         'Tools',
    research:      'Research',
    all:           'General'
  };
  return map[category] || 'Cyber';
}

// ── Keyword-based category detection ─────────
function detectCategory(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  if (/cve|vulnerability|patch|zero.day|exploit|rce|injection/i.test(text)) return 'vulnerability';
  if (/breach|leak|stolen|compromised|ransomware|data exposed/i.test(text)) return 'breach';
  if (/tool|framework|open.source|release|scanner|burp|nmap/i.test(text)) return 'tools';
  return 'research';
}

// ── Render a single card ──────────────────────
function createCard(article) {
  const card = document.createElement('a');
  card.href   = article.link;
  card.target = '_blank';
  card.rel    = 'noopener noreferrer';
  card.className = 'news-card';
  card.setAttribute('aria-label', article.title);

  card.innerHTML = `
    <div class="news-card-body">
      <div class="news-card-meta">
        <span class="news-source">${article.source}</span>
        <span class="news-date">${formatDate(article.pubDate)}</span>
      </div>
      <h2 class="news-card-title">${article.title}</h2>
      <p class="news-card-excerpt">${truncate(article.description)}</p>
    </div>
    <div class="news-card-footer">
      <span class="news-category-tag">${getCategoryLabel(article.category)}</span>
      <span class="news-read-link">
        Read →
      </span>
    </div>
  `;

  return card;
}

// ── Render skeletons ──────────────────────────
function showSkeletons(count = 6) {
  newsGrid.innerHTML = Array.from({ length: count }, () => `
    <div class="news-skeleton" aria-hidden="true">
      <div class="skeleton-line w-30"></div>
      <div class="skeleton-line h-tall w-80" style="margin-top:0.5rem;"></div>
      <div class="skeleton-line w-full"></div>
      <div class="skeleton-line w-60"></div>
    </div>
  `).join('');
}

// ── Render articles ───────────────────────────
function renderArticles(articles) {
  newsGrid.innerHTML = '';

  if (!articles.length) {
    newsGrid.innerHTML = `
      <div class="news-error" style="grid-column:1/-1">
        <div class="news-error-icon">📡</div>
        <p class="news-error-title">No articles found</p>
        <p class="news-error-text">Try a different filter or refresh the feed.</p>
      </div>
    `;
    return;
  }

  articles.forEach((article, i) => {
    const card = createCard(article);
    card.style.animationDelay = `${i * 40}ms`;
    card.style.opacity = '0';
    card.style.animation = `fadeIn 0.4s ease ${i * 40}ms forwards`;
    newsGrid.appendChild(card);
  });

  if (countLabel) countLabel.textContent = `${articles.length} article${articles.length !== 1 ? 's' : ''} loaded`;
}

// ── Fetch one RSS feed ────────────────────────
async function fetchFeed(feed) {
  const res  = await fetch(feed.url);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) return [];

  return data.items.slice(0, 10).map(item => ({
    title:       item.title || 'Untitled',
    link:        item.link  || '#',
    description: item.description || item.content || '',
    pubDate:     item.pubDate,
    source:      feed.name,
    category:    detectCategory(item.title, item.description || '')
  }));
}

// ── Fetch all feeds ───────────────────────────
async function fetchAllFeeds() {
  showSkeletons();
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const articles = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    allArticles = articles;

    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (lastUpdated) {
      lastUpdated.innerHTML = `
        <span class="news-live-dot"></span>
        Last updated: ${now} IST · Auto-refreshes every 30 minutes
      `;
    }

    applyFilter(activeFilter);

    // Schedule next refresh
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(fetchAllFeeds, REFRESH_INTERVAL);

  } catch (err) {
    newsGrid.innerHTML = `
      <div class="news-error" style="grid-column:1/-1">
        <div class="news-error-icon">⚠️</div>
        <p class="news-error-title">Failed to fetch intel</p>
        <p class="news-error-text">
          Network error or RSS source unavailable.<br>
          Check your connection and try refreshing.
        </p>
      </div>
    `;
    if (countLabel) countLabel.textContent = 'Failed to load articles';
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// ── Apply filter ──────────────────────────────
function applyFilter(filter) {
  activeFilter = filter;
  const filtered = filter === 'all'
    ? allArticles
    : allArticles.filter(a => a.category === filter);
  renderArticles(filtered);
}

// ── Filter buttons ────────────────────────────
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilter(btn.dataset.filter);
  });
});

// ── Refresh button ────────────────────────────
refreshBtn?.addEventListener('click', fetchAllFeeds);

// ── CTF search filter ─────────────────────────
const ctfSearch = document.getElementById('ctf-table-search');
const ctfTableBody = document.getElementById('ctf-table-body');

ctfSearch?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  ctfTableBody?.querySelectorAll('tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
});

// ── Init ──────────────────────────────────────
fetchAllFeeds();
