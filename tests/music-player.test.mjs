import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the shipped component scripts with a controlled YouTube API and clock.
// No network, browser dependencies, audio files, or generated fixtures are needed.
const script = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^\s*import .*;\s*$/m, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const musicScript = script('../src/layouts/YouTubeMusic.astro');
const toolsScript = script('../src/layouts/PageTools.astro');
const tracks = [
  ['jIrFOvKYWoI', 'Wind (Instrumental)', 'Akeboshi'],
  ['mbm3Llu2114', 'Jacob and the Stone', 'Emile Mosseri'],
  ['YbJpH9to-9Y', 'eye-water', ''],
  ['twcvAJcirfo', 'Call of Silence (Instrumental)', 'Hiroyuki Sawano · Gemie'],
];

function environment(storage = new Map()) {
  let now = 100000, nextTimer = 0;
  const timers = new Map(), registry = new Map();
  let document;
  class Element extends EventTarget {
    dataset = {}; attributes = new Map(); children = []; singles = new Map(); multiples = new Map();
    style = { setProperty() {} }; classList = { toggle() {} }; hidden = false; disabled = false; open = false; textContent = ''; value = ''; tabIndex = 0;
    get valueAsNumber() { return Number(this.value); }
    querySelector(selector) { return this.singles.get(selector) || null; }
    querySelectorAll(selector) { return this.multiples.get(selector) || []; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    append(child) { child.parent = this; this.children.push(child); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    closest() { return null; }
    focus() { document.activeElement = this; }
    show() { this.open = true; }
    showModal() { this.show(); }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
  }
  const schedule = (callback, delay, repeat = false) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + delay, delay, repeat });
    return id;
  };
  const tick = milliseconds => {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.repeat) timer.at += timer.delay;
      else timers.delete(id);
      timer.callback();
    }
    now = end;
  };
  document = new Element();
  Object.assign(document, { hidden: false, head: new Element(), body: new Element(), createElement: () => new Element() });
  document.getElementById = () => null;
  const window = new Element();
  window.location = { origin: 'http://localhost:4323' };
  const context = vm.createContext({
    window, document, HTMLElement: Element, Element, AbortController, Event, CustomEvent, URL,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    customElements: { get: name => registry.get(name), define: (name, constructor) => registry.set(name, constructor) },
    setTimeout: (callback, delay) => schedule(callback, delay), clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => schedule(callback, delay, true), clearInterval: id => timers.delete(id),
    Date: class extends Date { static now() { return now; } }, queueMicrotask,
    readingDefaults: { font: 'theme', size: 16, lineHeight: 1.75, measure: 'auto', justify: false },
    loadReadingPreferences: () => ({ font: 'theme', size: 16, lineHeight: 1.75, measure: 'auto', justify: false }),
    applyReadingPreferences() {}, saveReadingPreferences() {}, normalizeReadingPreferences: value => value,
  });
  const bind = (root, selector, element = new Element()) => { root.singles.set(selector, element); root.append(element); return element; };
  const visibility = hidden => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  const pageEvent = (name, persisted) => window.dispatchEvent(Object.assign(new Event(name), { persisted }));
  return { context, registry, document, window, Element, tick, timers, storage, bind, visibility, pageEvent };
}

async function music({ storage, hidden = false, deferApi = false } = {}) {
  const env = environment(storage), { window, document, bind, Element } = env;
  const players = [];
  const api = { Player: class {
    time = 0; state = -1; calls = []; destroyed = false;
    constructor(iframe, { events }) {
      this.iframe = iframe; this.events = events;
      this.id = new URL(iframe.src).pathname.split('/').at(-1);
      players.push(this);
    }
    ready() { this.events.onReady({ target: this }); }
    emit(state) { this.state = state; this.events.onStateChange({ target: this, data: state }); }
    loadVideoById(video) { this.calls.push(['load', video.videoId, video.startSeconds]); this.id = video.videoId; this.time = video.startSeconds; }
    cueVideoById(id) { this.calls.push(['cue', id]); this.id = id; this.time = 0; }
    playVideo() { this.calls.push(['play']); }
    pauseVideo() { this.calls.push(['pause']); }
    seekTo(time) { this.calls.push(['seek', time]); this.time = time; }
    setVolume(value) { this.volume = value; }
    unMute() {}
    getCurrentTime() { return this.time; }
    getDuration() { return 240; }
    getVideoUrl() { return `https://www.youtube.com/watch?v=${this.id}`; }
    getIframe() { return this.iframe; }
    destroy() { this.destroyed = true; }
  } };
  if (!deferApi) window.YT = api;
  document.hidden = hidden;
  vm.runInContext(musicScript, env.context);
  const root = new (env.registry.get('nayuta-youtube-music'))();
  const select = bind(root, '#music-track');
  select.options = tracks.map(([value, textContent, artist]) => Object.assign(new Element(), { value, textContent, dataset: { artist } }));
  select.selectedIndex = 0;
  Object.defineProperties(select, {
    value: { get() { return this.options[this.selectedIndex].value; }, set(value) { this.selectedIndex = this.options.findIndex(option => option.value === value); } },
    selectedOptions: { get() { return [this.options[this.selectedIndex]]; } },
  });
  const controls = {};
  for (const name of ['play', 'seek', 'volume', 'volume-value', 'current-time', 'duration', 'music-status', 'track-title', 'track-artist', 'previous', 'next']) controls[name] = bind(root, `[data-${name}]`);
  controls.volume.value = '10';
  const buttons = tracks.map((_, index) => Object.assign(new Element(), { dataset: { trackIndex: String(index) } }));
  root.multiples.set('[data-track-index]', buttons);
  root.connectedCallback();
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  await flush();
  return {
    ...env, root, select, controls, players, buttons, flush,
    apiReady: async () => { window.YT = api; window.onYouTubeIframeAPIReady(); await flush(); },
    click: async control => { (typeof control === 'number' ? buttons[control] : controls[control]).dispatchEvent(new Event('click')); await flush(); },
    startPlaying: () => { const player = players.at(-1); player.ready(); player.emit(1); return player; },
  };
}

const snapshot = env => JSON.parse(env.storage.get('nayuta-music-position'));
const preferences = env => JSON.parse(env.storage.get('nayuta-music-preferences'));

test('starts at 10%, and a hidden initial page defers player creation', async () => {
  const env = await music({ hidden: true });
  assert.equal(env.players.length, 0);
  env.visibility(false); await env.flush();
  assert.equal(env.players.length, 1);
  assert.equal(env.startPlaying().volume, 10);
});

test('tab departure pauses Jacob; return resumes the same iframe and timestamp', async () => {
  const env = await music(), player = env.startPlaying();
  await env.click(1); player.emit(1); player.time = 57.5;
  const loads = player.calls.filter(call => call[0] === 'load').length;
  env.visibility(true);
  assert.equal(env.root.dataset.playing, 'false');
  assert.deepEqual(snapshot(env), { id: tracks[1][0], time: 57.5 });
  assert.equal(player.calls.at(-1)[0], 'pause');
  env.tick(30000); env.visibility(false); await env.flush(); player.emit(1);
  assert.equal(player.time, 57.5);
  assert.equal(env.players.length, 1);
  assert.equal(player.calls.filter(call => call[0] === 'load').length, loads);
  assert.equal(env.controls['track-title'].textContent, tracks[1][1]);
  assert.equal(env.root.dataset.state, 'playing');
});

test('Astro page navigation does not pause or rebuild the existing player', async () => {
  const env = await music(), player = env.startPlaying();
  await env.click(1); player.emit(1); player.time = 42;
  const calls = player.calls.length;
  for (let index = 0; index < 4; index++) {
    env.document.dispatchEvent(new Event('astro:before-swap'));
    env.document.dispatchEvent(new Event('astro:after-swap'));
    env.document.dispatchEvent(new Event('astro:page-load'));
  }
  assert.equal(player.calls.length, calls);
  assert.equal(env.players.length, 1);
  assert.equal(player.destroyed, false);
  assert.equal(player.time, 42);
  assert.equal(env.controls['track-title'].textContent, tracks[1][1]);
});

test('manual pause survives tab departure and return', async () => {
  const env = await music(), player = env.startPlaying();
  player.time = 31; await env.click('play');
  const plays = player.calls.filter(call => call[0] === 'play').length;
  env.visibility(true); env.visibility(false); await env.flush();
  assert.equal(player.calls.filter(call => call[0] === 'play').length, plays);
  assert.equal(preferences(env).enabled, false);
  assert.equal(snapshot(env).time, 31);
});

test('leaving while the API loads creates no background player; return retries', async () => {
  const env = await music({ deferApi: true });
  env.visibility(true); await env.apiReady();
  assert.equal(env.players.length, 0);
  env.visibility(false); await env.flush();
  assert.equal(env.players.length, 1);
});

test('leaving while the iframe loads does not play on a late ready event', async () => {
  const env = await music(), player = env.players[0];
  env.visibility(true); player.ready();
  assert.equal(player.calls.some(call => call[0] === 'play'), false);
  env.visibility(false); await env.flush();
  assert.equal(player.calls.at(-1)[0], 'play');
});

test('late background PLAYING is paused and ENDED cannot advance the playlist', async () => {
  const env = await music(), player = env.startPlaying();
  env.visibility(true); player.emit(1); player.emit(0);
  assert.equal(player.calls.at(-1)[0], 'pause');
  assert.equal(env.select.value, tracks[0][0]);
  assert.equal(env.root.dataset.playing, 'false');
});

test('stale events from the previous song cannot change the new selection', async () => {
  const env = await music(), player = env.startPlaying();
  await env.click(1);
  player.id = tracks[0][0]; player.emit(1); player.emit(0);
  assert.equal(env.select.value, tracks[1][0]);
  assert.equal(env.root.dataset.playing, 'false');
  player.id = tracks[1][0]; player.emit(1);
  assert.equal(env.controls['track-title'].textContent, tracks[1][1]);
  assert.equal(env.root.dataset.state, 'playing');
});

test('a late PLAYING event for an old song is still paused while away', async () => {
  const env = await music(), player = env.startPlaying();
  await env.click(1); env.visibility(true);
  player.id = tracks[0][0]; player.emit(1);
  assert.equal(player.calls.at(-1)[0], 'pause');
  assert.equal(env.controls['track-title'].textContent, tracks[1][1]);
  assert.equal(env.root.dataset.playing, 'false');
});

test('Back cache restores the latest song, position, volume and pause choice', async () => {
  const env = await music(), player = env.startPlaying();
  env.pageEvent('pagehide', true);
  assert.equal(player.destroyed, false);
  env.storage.set('nayuta-music-position', JSON.stringify({ id: tracks[1][0], time: 76 }));
  env.storage.set('nayuta-music-preferences', JSON.stringify({ version: 2, enabled: true, volume: 23 }));
  env.pageEvent('pageshow', true); await env.flush(); player.emit(1);
  assert.equal(env.controls['track-title'].textContent, tracks[1][1]);
  assert.equal(player.id, tracks[1][0]);
  assert.equal(player.time, 76);
  assert.equal(player.volume, 23);
  env.pageEvent('pagehide', true);
  env.storage.set('nayuta-music-preferences', JSON.stringify({ version: 2, enabled: false, volume: 9 }));
  const plays = player.calls.length;
  env.pageEvent('pageshow', true); await env.flush();
  assert.equal(player.calls.length, plays);
  assert.equal(player.volume, 9);
});

test('ordinary navigation restores Jacob and its timestamp instead of Wind', async () => {
  const first = await music(), player = first.startPlaying();
  await first.click(1); player.emit(1); player.time = 52.75;
  first.pageEvent('pagehide', false);
  assert.equal(player.destroyed, true);
  const next = await music({ storage: first.storage });
  const nextPlayer = next.startPlaying();
  assert.equal(nextPlayer.id, tracks[1][0]);
  assert.equal(nextPlayer.time, 52.75);
  assert.equal(next.controls['track-title'].textContent, tracks[1][1]);
});

test('saved manual pause prevents startup; explicit Play restores the saved time', async () => {
  const storage = new Map([
    ['nayuta-music-position', JSON.stringify({ id: tracks[2][0], time: 42 })],
    ['nayuta-music-preferences', JSON.stringify({ version: 2, enabled: false, volume: 17 })],
  ]);
  const env = await music({ storage });
  assert.equal(env.players.length, 0);
  assert.equal(env.controls['track-title'].textContent, tracks[2][1]);
  await env.click('play');
  assert.equal(env.startPlaying().time, 42);
});

test('a cached page that never started respects a pause made on another site page', async () => {
  const env = await music({ hidden: true });
  env.pageEvent('pagehide', true);
  env.storage.set('nayuta-music-preferences', JSON.stringify({ version: 2, enabled: false, volume: 10 }));
  env.pageEvent('pageshow', true); env.visibility(false); await env.flush();
  assert.equal(env.players.length, 0);
});

test('a new track starts at zero and paused next/previous do not autoplay', async () => {
  const env = await music(), player = env.startPlaying();
  player.time = 93; await env.click('play'); await env.click('next');
  assert.equal(player.calls.at(-1)[0], 'cue');
  assert.deepEqual(snapshot(env), { id: tracks[1][0], time: 0 });
  env.visibility(true); env.visibility(false); await env.flush();
  assert.equal(player.calls.at(-1)[0], 'cue');
  assert.equal(preferences(env).enabled, false);
});

test('seeking and volume changes are saved', async () => {
  const env = await music(), player = env.startPlaying();
  env.controls.seek.value = '68'; env.controls.seek.dispatchEvent(new Event('input'));
  env.controls.volume.value = '7'; env.controls.volume.dispatchEvent(new Event('input'));
  assert.equal(snapshot(env).time, 68);
  assert.equal(player.time, 68);
  assert.equal(player.volume, 7);
  assert.equal(preferences(env).volume, 7);
});

test('leaving before YouTube finishes seeking preserves the requested timestamp', async () => {
  const env = await music(), player = env.startPlaying();
  player.time = 20;
  player.seekTo = time => player.calls.push(['seek', time]);
  env.controls.seek.value = '68'; env.controls.seek.dispatchEvent(new Event('input'));
  env.tick(500); env.visibility(true);
  assert.equal(snapshot(env).time, 68);
  env.visibility(false); await env.flush();
  assert.deepEqual(player.calls.at(-2), ['seek', 68]);
  player.time = 68; player.emit(1); env.visibility(true);
  assert.equal(snapshot(env).time, 68);
});

test('natural end advances once; manual pause ignores a delayed ended event', async () => {
  const env = await music(), player = env.startPlaying();
  player.emit(0); await env.flush();
  assert.equal(env.select.value, tracks[1][0]);
  player.emit(1); await env.click('play'); player.emit(0);
  assert.equal(env.select.value, tracks[1][0]);
});

test('blocked autoplay remains recoverable through explicit Play', async () => {
  const env = await music(), player = env.players[0];
  player.ready(); player.events.onAutoplayBlocked();
  assert.equal(env.root.dataset.state, 'blocked');
  await env.click('play'); player.emit(1);
  assert.equal(env.root.dataset.state, 'playing');
});

test('iframe timeout removes the failed player and retry creates only one replacement', async () => {
  const env = await music(), first = env.players[0];
  env.tick(15000);
  assert.equal(first.destroyed, true);
  assert.equal(env.document.body.children.length, 0);
  await env.click('play');
  assert.equal(env.players.length, 2);
  assert.equal(env.document.body.children.length, 1);
  first.ready(); first.emit(1);
  assert.notEqual(env.root.dataset.state, 'playing');
  env.startPlaying();
  assert.equal(env.root.dataset.state, 'playing');
});

test('YouTube error stays readable; return does not silently restart a failed track', async () => {
  const env = await music(), player = env.startPlaying();
  player.events.onError({ target: player, data: 153 });
  assert.match(env.controls['music-status'].textContent, /YouTube error 153/);
  env.visibility(true); env.tick(20000); env.visibility(false); await env.flush();
  assert.equal(env.root.dataset.state, 'error');
  assert.match(env.controls['music-status'].textContent, /YouTube error 153/);
});

test('malformed session data falls back to a valid first track and 10%', async () => {
  const env = await music({ storage: new Map([['nayuta-music-position', '{broken'], ['nayuta-music-preferences', 'null']]) });
  assert.equal(env.select.value, tracks[0][0]);
  assert.equal(env.startPlaying().volume, 10);
});

test('old default 30% migrates, while explicit versioned volume stays unchanged', async () => {
  for (const [stored, expected] of [[{ volume: 30 }, 10], [{ version: 2, volume: 30 }, 30]]) {
    const env = await music({ storage: new Map([['nayuta-music-preferences', JSON.stringify(stored)]]) });
    assert.equal(env.startPlaying().volume, expected);
  }
});

function tools() {
  const env = environment(), { bind, Element } = env;
  vm.runInContext(toolsScript, env.context);
  const root = new (env.registry.get('nayuta-page-tools'))();
  const trigger = bind(root, '.tools-trigger');
  const menu = bind(root, '.tools-menu'); menu.hidden = true;
  const tip = bind(root, '[data-music-tip]'); tip.hidden = true;
  bind(root, '[data-tip-open-music]'); bind(root, '[data-dismiss-music-tip]');
  for (const selector of ['#reading-settings-form', '#reading-size', '#reading-line-height', '#reading-measure', '#reading-justify']) bind(root, selector);
  const music = bind(root, 'nayuta-youtube-music'); music.dataset.state = 'paused';
  const dialogs = ['reading-settings', 'music-panel'].map(id => {
    const dialog = new Element(); dialog.id = id;
    bind(dialog, '[data-close-panel]'); root.append(dialog);
    return dialog;
  });
  root.multiples.set('dialog', dialogs);
  const openers = dialogs.map(dialog => Object.assign(new Element(), { dataset: { openPanel: dialog.id } }));
  root.multiples.set('[data-open-panel]', openers);
  root.connectedCallback();
  return { ...env, root, tip, trigger, menu, dialogs, openers };
}

test('music tip remains visible for ten seconds, with one stable message', () => {
  const env = tools();
  env.tick(1200); assert.equal(env.tip.hidden, false);
  env.tick(9999); assert.equal(env.tip.hidden, false);
  assert.equal(env.storage.has('nayuta-music-tip-dismissed'), false);
  env.tick(1); assert.equal(env.tip.hidden, true);
  assert.equal(env.storage.get('nayuta-music-tip-dismissed'), '1');
});

test('tip countdown excludes hidden time and time spent hovering or focusing it', () => {
  const env = tools();
  env.tick(1200); env.tick(2000); env.visibility(true); env.tick(30000);
  env.visibility(false); env.tip.dispatchEvent(new Event('pointerenter')); env.tick(20000);
  assert.equal(env.tip.hidden, false);
  env.tip.dispatchEvent(new Event('pointerleave')); env.tick(7999);
  assert.equal(env.tip.hidden, false);
  env.tick(1); assert.equal(env.tip.hidden, true);
});

test('keyboard focus pauses the tip timer and playback events do not restart it', async () => {
  const env = tools();
  env.tick(1200); env.tick(3000);
  env.document.activeElement = env.tip;
  env.tip.dispatchEvent(new Event('focusin'));
  env.tick(30000); assert.equal(env.tip.hidden, false);
  env.document.activeElement = env.document;
  env.tip.dispatchEvent(new Event('focusout')); await Promise.resolve();
  env.root.dispatchEvent(new CustomEvent('nayuta:music-state', { detail: { state: 'playing', volume: 10 } }));
  env.tick(6999); assert.equal(env.tip.hidden, false);
  env.tick(1); assert.equal(env.tip.hidden, true);
});

test('outside click closes music without restoring focus or pausing the player', () => {
  const env = tools(), dialog = env.dialogs[1];
  env.openers[1].dispatchEvent(new Event('click')); assert.equal(dialog.open, true);
  const outside = new env.Element(); env.document.activeElement = outside;
  env.document.dispatchEvent(new Event('pointerdown'));
  assert.equal(dialog.open, false);
  assert.equal(env.document.activeElement, outside);
  assert.equal(env.menu.hidden, true);
});

test('Escape hides music and restores keyboard focus to the tools button', () => {
  const env = tools();
  env.openers[1].dispatchEvent(new Event('click'));
  env.document.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
  assert.equal(env.dialogs[1].open, false);
  assert.equal(env.document.activeElement, env.trigger);
});

test('navigation closes the tools panel without moving keyboard focus into the persistent tools', () => {
  const env = tools();
  env.openers[1].dispatchEvent(new Event('click'));
  env.document.activeElement = env.document;
  env.document.dispatchEvent(new Event('astro:before-swap'));
  env.document.dispatchEvent(new Event('astro:after-swap'));
  assert.equal(env.dialogs[1].open, false);
  assert.equal(env.document.activeElement, env.document);
  assert.equal(env.root.inert, false);
});
