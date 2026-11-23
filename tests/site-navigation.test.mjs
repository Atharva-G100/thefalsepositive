import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/theme/layouts/SiteNavigation.astro', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;\s*$/m, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function navigation() {
  class Element {
    values = new Map(); children = []; dataset = {};
    constructor(id = '') { this.id = id; }
    get attributes() { return [...this.values].map(([name, value]) => ({ name, value })); }
    setAttribute(name, value) { this.values.set(name, value); }
    removeAttribute(name) { this.values.delete(name); }
    getAttribute(name) { return this.values.get(name); }
    append(element) { if (element.parentElement) element.parentElement.children = element.parentElement.children.filter(child => child !== element); element.parentElement = this; this.children.push(element); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]).filter(child => child.tagName === 'SCRIPT'); }
    replaceWith(element) {
      const siblings = this.parentElement.children;
      siblings.splice(siblings.indexOf(this), 1, element);
      element.parentElement = this.parentElement;
      this.parentElement = null;
    }
    cloneNode() { const clone = new Element(this.id); clone.src = this.src; clone.values = new Map(this.values); return clone; }
  }
  const document = new EventTarget();
  document.body = new Element('body'); document.head = new Element('head'); document.scripts = [];
  document.getElementById = id => document.body.children.find(element => element.id === id);
  document.querySelectorAll = () => [];
  const currentPage = new Element('site-page'), tools = new Element('tools'), host = new Element('youtube-host');
  const iframe = new Element('iframe'); host.append(iframe);
  [currentPage, tools, host].forEach(element => document.body.append(element));
  const calls = [];
  vm.runInNewContext(script, { document, URL, swapFunctions: {
    deselectScripts: incoming => calls.push(['scripts', incoming]),
    swapRootAttributes: incoming => calls.push(['root', incoming]),
    swapHeadElements: incoming => calls.push(['head', incoming]),
    saveFocus: () => () => calls.push(['focus']),
    swapBodyElement: (next, current) => { calls.push(['replace', next, current]); current.replaceWith(next); },
  } });
  function next() {
    const body = new Element('incoming-body'), page = new Element('site-page'); body.append(page);
    const incoming = { body, head: new Element('incoming-head'), getElementById: id => body.children.find(element => element.id === id) };
    const originalSwap = () => calls.push(['default']);
    const event = Object.assign(new Event('astro:before-swap'), { newDocument: incoming, swap: originalSwap });
    return { event, incoming, page, originalSwap };
  }
  return { Element, document, currentPage, tools, host, iframe, next, calls };
}

test('internal navigation replaces content while keeping body, player and iframe connected', () => {
  const env = navigation(), body = env.document.body;
  env.document.body.setAttribute('class', 'home-page');
  env.document.body.setAttribute('inert', '');
  for (let index = 0; index < 4; index++) {
    const { event, page, incoming } = env.next();
    incoming.body.setAttribute('class', index % 2 ? 'home-page' : '');
    env.document.dispatchEvent(event); event.swap();
    assert.equal(env.document.body, body);
    assert.equal(env.document.getElementById('site-page'), page);
    assert.equal(env.tools.parentElement, body);
    assert.equal(env.host.parentElement, body);
    assert.equal(env.iframe.parentElement, env.host);
    assert.equal(body.children.length, 3);
    assert.equal(body.getAttribute('class'), index % 2 ? 'home-page' : '');
    assert.equal(body.getAttribute('inert'), undefined);
  }
  assert.equal(env.calls.filter(([action]) => action === 'replace').length, 4);
  assert.equal(env.calls.filter(([action]) => action === 'head').length, 4);
});

test('runtime scripts are not rerun and YouTube SDK gets a head-persistence placeholder', () => {
  const env = navigation(), sdk = new env.Element('sdk');
  sdk.src = 'https://www.youtube.com/s/player/example/www-widgetapi.vflset/www-widgetapi.js';
  env.document.head.append(sdk); env.document.scripts.push(sdk);
  const { event, incoming } = env.next();
  env.document.dispatchEvent(event);
  assert.equal(sdk.dataset.astroExec, '');
  assert.match(sdk.getAttribute('data-astro-transition-persist'), /^music-sdk:/);
  assert.equal(incoming.head.children[0].getAttribute('data-astro-transition-persist'), sdk.getAttribute('data-astro-transition-persist'));
  assert.equal(sdk.parentElement, env.document.head);
});

test('page scripts emitted after the layout enter the swapped region for Astro to execute', () => {
  const env = navigation(), { event, incoming, page } = env.next();
  const pageScript = new env.Element('ctf-script'); pageScript.tagName = 'SCRIPT';
  incoming.body.append(pageScript);
  env.document.dispatchEvent(event); event.swap();
  assert.equal(pageScript.parentElement, page);
  assert.equal(env.document.getElementById('site-page').contains(pageScript), true);
});

test('documents without the site frame keep Astro’s normal navigation behavior', () => {
  const env = navigation(), { event, incoming, originalSwap } = env.next();
  incoming.body.children = [];
  env.document.dispatchEvent(event);
  assert.equal(event.swap, originalSwap);
});

test('news listeners and pending feed requests are cleaned up when leaving, then reinitialized on return', async () => {
  const document = new EventTarget(), requests = [], timers = new Map();
  let grid, nextTimer = 0;
  document.getElementById = id => id === 'news-grid' ? grid : null;
  document.querySelectorAll = () => [];
  const source = readFileSync(new URL('../public/scripts/news.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { document, AbortController, Date, Promise,
    fetch: (url, { signal }) => new Promise((resolve, reject) => {
      requests.push({ url, signal }); signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => timers.delete(id),
  });
  assert.equal(requests.length, 0);
  grid = { innerHTML: '' };
  document.dispatchEvent(new Event('astro:page-load'));
  document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(requests.length, 4);
  document.dispatchEvent(new Event('astro:before-swap'));
  assert.equal(requests.every(request => request.signal.aborted), true);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(timers.size, 0);
  grid = { innerHTML: '' };
  document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(requests.length, 8);
  assert.equal(requests.slice(4).every(request => !request.signal.aborted), true);
  document.dispatchEvent(new Event('astro:before-swap'));
});
