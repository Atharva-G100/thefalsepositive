/* ============================================
   THE FALSE POSITIVE — ctf.js
   CTF table search, sidebar mobile toggle
   ============================================ */

'use strict';

// ── CTF Table Search ──────────────────────────
const ctfSearch    = document.getElementById('ctf-table-search');
const ctfTableBody = document.getElementById('ctf-table-body');

ctfSearch?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  ctfTableBody?.querySelectorAll('tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = q === '' || text.includes(q) ? '' : 'none';
  });
});

// ── Security Helpers ─────────────────────────
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function sanitizeUrl(url) {
  if (!url) return '#';
  if (url.startsWith('/') || url.startsWith('https://') || url.startsWith('http://')) return url;
  return '#';
}

// ── Mobile Sidebar Toggle ─────────────────────
const sidebar   = document.getElementById('ctf-sidebar');
const overlay   = document.getElementById('sidebar-overlay');
const hamburger = document.getElementById('nav-hamburger');

function openSidebar() {
  sidebar?.classList.add('open');
  if (overlay) { overlay.style.display = 'block'; }
  hamburger?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  sidebar?.classList.remove('open');
  if (overlay) { overlay.style.display = 'none'; }
  hamburger?.setAttribute('aria-expanded', 'false');
}

hamburger?.addEventListener('click', () => {
  sidebar?.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlay?.addEventListener('click', closeSidebar);

// ── CTF Data (add entries here as you compete) ─
// To add a new CTF: push an object into CTF_DATA below.
// Fields: name, solves, placement, totalTeams, team, ctftimeUrl, writeupUrl, icon
const CTF_DATA = [
  // Example (uncomment and fill in when you have your first CTF):
  // {
  //   name:        'ExampleCTF 2025',
  //   solves:      12,
  //   placement:   '4th',
  //   totalTeams:  300,
  //   team:        'Solo',
  //   ctftimeUrl:  'https://ctftime.org/event/1234',
  //   writeupUrl:  '#',
  //   icon:        '🏴'
  // }
];

function getPlaceClass(placement) {
  const n = parseInt(placement);
  if (n === 1) return 'place-1st';
  if (n <= 10) return 'place-top10';
  if (n <= 25) return 'place-top25';
  return 'place-other';
}

function populateCTFTable() {
  if (!ctfTableBody || !CTF_DATA.length) return;

  ctfTableBody.innerHTML = '';

  CTF_DATA.forEach((ctf, i) => {
    const placeClass = getPlaceClass(ctf.placement);
    const safeUrl = sanitizeUrl(ctf.writeupUrl || ctf.ctftimeUrl);
    const row = document.createElement('tr');
    row.id = `ctf-row-${i}`;
    row.innerHTML = `
      <td>
        <a href="${safeUrl}" target="_blank" rel="noopener" id="ctf-link-${i}">
          ${escapeHtml(ctf.icon || '🚩')} ${escapeHtml(ctf.name)}
        </a>
      </td>
      <td>${escapeHtml(String(ctf.solves))}</td>
      <td><span class="${placeClass}">${escapeHtml(ctf.placement)} out of ${escapeHtml(String(ctf.totalTeams))} teams</span></td>
      <td><span class="team-badge">${escapeHtml(ctf.team)}</span></td>
    `;
    ctfTableBody.appendChild(row);
  });

  // Also populate sidebar nav
  const ctfNavList = document.getElementById('ctf-nav-list');
  if (ctfNavList) {
    // Remove placeholder
    const placeholder = document.getElementById('ctf-nav-placeholder');
    placeholder?.remove();

    CTF_DATA.forEach((ctf, i) => {
      const li = document.createElement('li');
      li.className = 'ctf-nav-item';
      li.id = `ctf-nav-item-${i}`;
      li.innerHTML = `
        <a href="${sanitizeUrl(ctf.writeupUrl)}" id="ctf-nav-link-${i}">
          <span class="ctf-nav-icon">${escapeHtml(ctf.icon || '🏴')}</span>
          ${escapeHtml(ctf.name)}
        </a>
      `;
      ctfNavList.appendChild(li);
    });
  }
}

// Run on load
populateCTFTable();
