/* ============================================
   THE FALSE POSITIVE — main.js
   Shared: Ink overlay, Search modal, Nav
   ============================================ */

'use strict';


// ── Footer Year ───────────────────────────────
const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ── Search Modal ──────────────────────────────
const searchModal   = document.getElementById('search-modal');
const searchTrigger = document.getElementById('search-trigger');
const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// Site search index
const SEARCH_INDEX = [
  { title: 'Pre-Engagement',       section: 'Handbook / Red-Teaming',  url: 'pentest.html' },
  { title: 'Legal Foundation',     section: 'Handbook / Pre-Engagement', url: 'pentest.html#legal-foundation' },
  { title: 'Scope Definition',     section: 'Handbook / Pre-Engagement', url: 'pentest.html#scope-definition' },
  { title: 'Rules of Engagement',  section: 'Handbook / Pre-Engagement', url: 'pentest.html#rules-of-engagement' },
  { title: 'Nmap Enumeration',     section: 'Handbook / Recon',         url: 'pentest.html#nmap' },
  { title: 'Web Recon',            section: 'Handbook / Recon',         url: 'pentest.html#web-recon' },
  { title: 'Shells & Payloads',    section: 'Handbook / Pre-Exploit',   url: 'pentest.html#shells-payloads' },
  { title: 'Privilege Escalation', section: 'Handbook / Post-Exploit',  url: 'pentest.html#priv-esc' },
  { title: 'XSS',                  section: 'Handbook / Web-Attacks',   url: 'pentest.html#xss' },
  { title: 'SQL Injection',        section: 'Handbook / Web-Attacks',   url: 'pentest.html#sqli' },
  { title: 'Local File Inclusion', section: 'Handbook / Web-Attacks',   url: 'pentest.html#lfi' },
  { title: 'SSRF',                 section: 'Handbook / Web-Attacks',   url: 'pentest.html#ssrf' },
  { title: 'CTF Case Files',       section: 'Case Files',               url: 'ctf.html' },
  { title: 'Cyber Intel',          section: 'Intel / News Feed',        url: 'news.html' },
  { title: 'Home',                 section: 'The False Positive',        url: 'index.html' },
];

function openSearch() {
  if (!searchModal) return;
  searchModal.classList.add('open');
  searchInput?.focus();
  document.body.style.overflow = 'hidden';
}

function closeSearch() {
  if (!searchModal) return;
  searchModal.classList.remove('open');
  if (searchInput) searchInput.value = '';
  if (searchResults) searchResults.innerHTML = '<div class="search-empty">Start typing to search the notebook...</div>';
  document.body.style.overflow = '';
}

function renderResults(query) {
  if (!query.trim()) {
    searchResults.innerHTML = '<div class="search-empty">Start typing to search the notebook...</div>';
    return;
  }
  const q = query.toLowerCase();
  const matches = SEARCH_INDEX.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.section.toLowerCase().includes(q)
  );
  if (!matches.length) {
    searchResults.innerHTML = '<div class="search-empty">No results found. The notebook doesn\'t have that yet.</div>';
    return;
  }
  searchResults.innerHTML = matches.map((item, i) => `
    <a href="${item.url}" class="search-result-item" role="option" id="search-result-${i}" tabindex="-1">
      <span class="result-title">${item.title}</span>
      <span class="result-section">${item.section}</span>
    </a>
  `).join('');
}

// Keyboard shortcut Ctrl+K
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchModal?.classList.contains('open') ? closeSearch() : openSearch();
  }
  if (e.key === 'Escape') closeSearch();
});

searchTrigger?.addEventListener('click', openSearch);
searchModal?.addEventListener('click', e => { if (e.target === searchModal) closeSearch(); });
searchInput?.addEventListener('input', e => renderResults(e.target.value));

// ── Mobile Nav ────────────────────────────────
const hamburger = document.getElementById('nav-hamburger');
const navLinks  = document.querySelector('.nav-links');

hamburger?.addEventListener('click', () => {
  const isOpen = hamburger.getAttribute('aria-expanded') === 'true';
  hamburger.setAttribute('aria-expanded', String(!isOpen));
  navLinks?.classList.toggle('mobile-open');
});

// ── Copy Page Button ──────────────────────────
const copyBtn = document.getElementById('copy-page-btn') || document.getElementById('ctf-copy-btn');
copyBtn?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyBtn.textContent = '✓ Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy page`;
    }, 2000);
  } catch { /* clipboard not available */ }
});

// ── Fade-in observer ──────────────────────────
const fadeEls = document.querySelectorAll('.home-card, .news-card');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'fadeIn 0.5s ease forwards';
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  fadeEls.forEach(el => { el.style.opacity = '0'; io.observe(el); });
}
