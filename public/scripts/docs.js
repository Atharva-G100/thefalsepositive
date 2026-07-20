/* ============================================
   THE FALSE POSITIVE — docs.js
   Sidebar collapse, TOC highlight, mobile
   ============================================ */

'use strict';

// ── Sidebar Collapse ──────────────────────────
document.querySelectorAll('.sidebar-nav-link[aria-expanded]').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.sidebar-nav-item');
    if (!item) return;
    const isOpen = item.classList.contains('open');
    item.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
  });
});

// ── Mobile Sidebar Toggle ─────────────────────
const sidebar  = document.getElementById('docs-sidebar');
const overlay  = document.getElementById('sidebar-overlay');
const hamburger = document.getElementById('nav-hamburger');

function openSidebar() {
  sidebar?.classList.add('open');
  if (overlay) { overlay.style.display = 'block'; overlay.setAttribute('aria-hidden','false'); }
  hamburger?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  sidebar?.classList.remove('open');
  if (overlay) { overlay.style.display = 'none'; overlay.setAttribute('aria-hidden','true'); }
  hamburger?.setAttribute('aria-expanded', 'false');
}

hamburger?.addEventListener('click', () => {
  sidebar?.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlay?.addEventListener('click', closeSidebar);

// ── Desktop Sidebar Collapse ──────────────────
const desktopToggle = document.getElementById('desktop-sidebar-toggle');
const tocToggle = document.getElementById('desktop-toc-toggle');
const docsLayout = document.getElementById('docs-layout');

desktopToggle?.addEventListener('click', () => {
  const isCollapsed = docsLayout.classList.toggle('left-collapsed');
  desktopToggle.setAttribute('aria-expanded', String(!isCollapsed));
});

tocToggle?.addEventListener('click', () => {
  const isCollapsed = docsLayout.classList.toggle('right-collapsed');
  tocToggle.setAttribute('aria-expanded', String(!isCollapsed));
});

// ── TOC Active Highlight ──────────────────────
const tocLinks = document.querySelectorAll('.toc-nav a');
const sections = document.querySelectorAll('.docs-content h2, .docs-content h3');

function updateTOC() {
  let current = '';
  sections.forEach(section => {
    const top = section.getBoundingClientRect().top;
    if (top <= 120) current = section.id;
  });
  tocLinks.forEach(link => {
    const href = link.getAttribute('href')?.replace('#', '');
    link.classList.toggle('active', href === current);
  });
}

window.addEventListener('scroll', updateTOC, { passive: true });
updateTOC();

// ── Smooth anchor scroll ──────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Update URL without triggering scroll
    history.pushState(null, '', anchor.getAttribute('href'));
  });
});

// ── Copy code blocks ──────────────────────────
document.querySelectorAll('pre').forEach(pre => {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.setAttribute('aria-label', 'Copy code');
  btn.style.cssText = `
    position:absolute;top:0.5rem;right:0.5rem;
    font-family:var(--font-mono);font-size:0.68rem;
    background:var(--bg-elevated);border:1px solid var(--border);
    border-radius:3px;padding:0.2rem 0.5rem;
    color:var(--muted);cursor:pointer;opacity:0;
    transition:opacity 0.2s ease;
  `;
  pre.style.position = 'relative';
  pre.appendChild(btn);

  pre.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
  pre.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });

  btn.addEventListener('click', async () => {
    const code = pre.querySelector('code')?.textContent || pre.textContent;
    try {
      await navigator.clipboard.writeText(code.trim());
      btn.textContent = '✓';
      btn.style.color = 'var(--red-bright)';
      setTimeout(() => { btn.textContent = 'Copy'; btn.style.color = 'var(--muted)'; }, 2000);
    } catch { /* clipboard not available */ }
  });
});
