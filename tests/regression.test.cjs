'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../alza-benefit-prices.user.js'), 'utf8');

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.textContent = ''; this.hidden = false; this.style = {}; this.children = []; this.classList = { toggle() {} }; }
  append(child) { this.children.push(child); if (typeof child === 'object') child.parentNode = this; }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  attachShadow() { return new Element('shadow'); }
  focus() {}
  remove() {}
}
async function harness({ hostname = 'www.alza.cz', settings = {}, mode = 'callback', input = source, save = null, clipboardItem = undefined, pathname = '/product-d123.htm' } = {}) {
  const calls = [];
  const logs = [];
  const clipboardWrites = [];
  const storageReads = [];
  const storageWrites = [];
  const capture = level => (...args) => logs.push({ level, args });
  let scans = 0;
  const docEvents = new Map();
  const windowEvents = new Map();
  const intervals = new Map();
  let intervalId = 0;
  const doc = {
    hidden: false,
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    querySelector() { scans++; return null; },
    addEventListener(name, listener) { docEvents.set(name, listener); },
    removeEventListener(name) { docEvents.delete(name); },
  };
  const context = vm.createContext({
    URL, URLSearchParams, Intl, AbortController, Blob, performance, ClipboardItem: clipboardItem,
    console: { info: capture('info'), debug: capture('debug'), warn: capture('warn'), error(message) { throw Error(message); }, log: capture('log'), groupCollapsed: capture('groupCollapsed'), groupEnd: capture('groupEnd'), table: capture('table') },
    location: { hostname, pathname, search: '', href: 'https://' + hostname + pathname },
    navigator: { clipboard: { async writeText(text) { clipboardWrites.push(text); } } },
    document: doc,
    window: { addEventListener(name, listener) { windowEvents.set(name, listener); }, removeEventListener(name) { windowEvents.delete(name); } },
    matchMedia: () => ({ matches: false }),
    setInterval(callback) { const id = ++intervalId; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout, clearTimeout, cancelAnimationFrame() {},
    GM: {
      getValue: async key => { storageReads.push(key); return settings; },
      setValue: async (key, value) => { storageWrites.push({ key, value }); if (save) await save(key, value); },
      xmlHttpRequest(details) {
        const call = { details, aborted: false };
        calls.push(call);
        const abort = () => { call.aborted = true; details.onabort(); };
        if (mode === 'promise') {
          const promise = new Promise((resolve, reject) => { call.resolve = resolve; call.reject = reject; });
          promise.abort = abort;
          return promise;
        }
        if (mode === 'sync') details.onload({ status: 200, responseText: '{}' });
        return { abort };
      },
    },
  });
  // Expose the real helpers in a VM, stopping just before DOM initialization.
  const tail = input.indexOf('\n  sync();\n');
  assert.ok(tail > 0);
  await vm.runInContext(input.slice(0, tail) + `
    globalThis.api = { request, cancel, tierData, extractPrice, computePrice, buildOffer, load, render, createPanel, startPageChecks, logCopiedOffer, saveSetting, writeClipboard,
      setView(value) { alwaysShow = value; },
      setPromos(value) { alzaPlusPromos = value.plus; cashbackPromos = value.cashback; tradeInPromos = value.tradeIn; },
      get settingWrites() { return settingWrites; },
      TIERS, enabled, cache, apiUrl, pending, sync,
      setPanel(state, id) { panel = state; activeId = id; }, get generation() { return generation; } };
  })().catch(error => { throw error; });`, context);
  function reply(call, data = {}, status = 200) {
    const response = { status, responseText: JSON.stringify(data) };
    call.details.onload(response);
    call.resolve?.(response); // Managers may deliver both callbacks and a Promise.
  }
  return { api: context.api, navigator: context.navigator, location: context.location, calls, reply, logs, clipboardWrites, storageReads, storageWrites, doc, docEvents, windowEvents, intervals, get scans() { return scans; } };
}
const price = (amount, group = 1) => ({ data: {
  mainPriceTag: { primaryPrice: String(amount), comparePrice: '1200', priceGroupType: group, priceType: 0 }, promoPrices: [],
} });
function stateFor(api) {
  const body = new Element();
  const rows = api.TIERS.map(tier => {
    const tr = new Element(); body.append(tr);
    const badge = new Element(); new Element().append(badge);
    return { tier, tr, badge, price: new Element(), discount: new Element() };
  });
  return Object.assign(Object.fromEntries(['host', 'table', 'copy', 'status', 'section', 'originalRow', 'originalPrice', 'loadError', 'retry', 'notice', 'settings', 'priceNote'].map(key => [key, new Element()])), { rows, resetCopy() {}, loaded: false });
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('all enabled tiers including BASIC start concurrently and render', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  assert.equal(h.calls.length, 6, 'BASIC must not wait for the other five responses');
  for (const [i, call] of h.calls.entries()) h.reply(call, price(700 + i * 50));
  await loading;
  assert.equal(state.loaded, true);
  assert.equal(state.section.hidden, false);
  assert.equal(state.rows.find(row => row.tier.reference).amount, 950);
  assert.equal(h.api.pending.size, 0);
});
test('disabled BASIC is fetched only when another tier supplies a comparison', async () => {
  const h = await harness({ settings: { 'enabled-price-tiers': { Basic: false } } });
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  assert.equal(h.calls.length, 5);
  for (const call of [...h.calls]) h.reply(call, price(800));
  await flush();
  assert.equal(h.calls.length, 6);
  h.reply(h.calls[5], price(1000));
  await loading;
  assert.equal(state.rows.find(row => row.tier.reference).tr.hidden, true);
});
test('no enabled tiers trigger no API calls', async () => {
  const h = await harness();
  Object.keys(h.api.enabled).forEach(name => h.api.enabled[name] = false);
  await h.api.load('123', stateFor(h.api));
  assert.equal(h.calls.length, 0);
});
test('copy joins panel requests and survives cancellation; stale panel gets no data', async () => {
  const h = await harness();
  const tier = h.api.TIERS[0];
  const panelData = h.api.tierData('123', tier, h.api.generation);
  const copiedData = h.api.tierData('123', tier, null, true);
  assert.equal(h.calls.length, 1);
  h.api.cancel();
  assert.equal(h.calls[0].aborted, false);
  h.reply(h.calls[0], price(800));
  assert.equal(await panelData, null);
  const copied = await copiedData;
  assert.equal(h.api.extractPrice(copied).amount, 800);
  assert.equal(await h.api.tierData('123', tier, null), copied);
  assert.equal(h.calls.length, 1);
});
test('cancellation aborts unused requests and allows a fresh request to the same URL', async () => {
  const h = await harness();
  const first = h.api.request('https://webapi.alza.cz/test');
  const rejected = assert.rejects(first, /cancelled/);
  h.api.cancel();
  await rejected;
  assert.equal(h.calls[0].aborted, true);
  const second = h.api.request('https://webapi.alza.cz/test');
  assert.equal(h.calls.length, 2);
  h.reply(h.calls[1]);
  await second;
});
test('promise managers and duplicate callback delivery settle once', async () => {
  const h = await harness({ mode: 'promise' });
  const first = h.api.request('https://webapi.alza.cz/test');
  const second = h.api.request('https://webapi.alza.cz/test', false);
  assert.equal(first, second);
  h.reply(h.calls[0], price(800));
  assert.equal((await first).status, 200);
  assert.equal(h.api.pending.size, 0);
});
test('synchronous managers leave no settled request in the in-flight map', async () => {
  const h = await harness({ mode: 'sync' });
  await h.api.request('https://webapi.alza.cz/test');
  await h.api.request('https://webapi.alza.cz/test');
  assert.equal(h.calls.length, 2);
  assert.equal(h.api.pending.size, 0);
});
test('errors are not cached and the next attempt can succeed', async () => {
  const h = await harness();
  const first = h.api.tierData('123', h.api.TIERS[0], null);
  const rejected = assert.rejects(first, /403/);
  h.reply(h.calls[0], {}, 403);
  await rejected;
  assert.equal(h.api.cache.size, 0);
  const next = h.api.tierData('123', h.api.TIERS[0], null);
  h.reply(h.calls[1], price(800));
  assert.equal(h.api.extractPrice(await next).amount, 800);
});
test('cache refreshes usage order and stale data remains available for copying', async () => {
  const h = await harness();
  const tier = h.api.TIERS[0];
  const url = h.api.apiUrl('123', tier);
  const data = price(800);
  h.api.cache.set(url, { data, time: Date.now() - 600000 });
  h.api.cache.set('other', { data: {}, time: Date.now() });
  assert.equal(await h.api.tierData('123', tier, null, true), data);
  assert.equal([...h.api.cache.keys()].at(-1), url);
  assert.equal(h.calls.length, 0);
  const refresh = h.api.tierData('123', tier, null);
  h.reply(h.calls[0], price(750));
  assert.equal(h.api.extractPrice(await refresh).amount, 750);
  assert.equal('response' in h.api.cache.get(url), false, 'raw JSON must not stay in the price cache');
});
test('promo combinations keep separate memo entries and currencies parse correctly', async () => {
  const h = await harness();
  const data = price(1000);
  data.data.promoPrices = [
    { primaryPrice: '900', priceType: 4 },
    { primaryPrice: '800', priceType: 1 },
    { primaryPrice: '700', priceType: 2 },
  ];
  for (let bits = 0; bits < 8; bits++) {
    const promos = { plus: Boolean(bits & 4), cashback: Boolean(bits & 2), tradeIn: Boolean(bits & 1) };
    const expected = promos.tradeIn ? 700 : promos.cashback ? 800 : promos.plus ? 900 : 1000;
    assert.equal(h.api.extractPrice(data, false, promos).amount, expected);
  }
  for (const [text, expected] of [['1 234,50 Kč', 1234.5], ['1.234,50 €', 1234.5], ['54,90 €', 54.9], ['1 234 Ft', 1234], ['549,-', 549]]) {
    const fixture = price(1000); fixture.data.mainPriceTag.primaryPrice = text;
    assert.equal(h.api.extractPrice(fixture).amount, expected, text);
  }
});
test('ISIC is omitted for HU and AT; equal prices produce a notice', async () => {
  for (const hostname of ['www.alza.hu', 'www.alza.at', 'www.alza.sk', 'www.alza.de', 'm.alza.cz']) {
    const h = await harness({ hostname });
    assert.equal(h.api.TIERS.some(tier => tier.name === 'ISIC'), !/hu|at/.test(hostname));
    const state = stateFor(h.api);
    const loading = h.api.load('123', state);
    h.calls.forEach(call => h.reply(call, price(800)));
    await loading;
    assert.equal(state.notice.hidden, false);
    assert.equal(state.table.hidden, true);
  }
});
test('polling skips DOM scans for connected panels and repairs disconnected panels immediately', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  state.host.isConnected = true;
  h.api.setPanel(state, '123');
  h.api.sync(false);
  assert.equal(h.scans, 0);
  h.api.sync(true);
  assert.ok(h.scans > 0);
  const before = h.scans;
  state.host.isConnected = false;
  h.api.sync(false);
  assert.ok(h.scans > before);
});
test('promise-only request completion works without onload', async () => {
  const h = await harness({ mode: 'promise' });
  const data = h.api.tierData('123', h.api.TIERS[0], null);
  h.calls[0].resolve({ status: 200, responseText: JSON.stringify(price(800)) });
  assert.equal(h.api.extractPrice(await data).amount, 800);
  assert.equal(h.api.pending.size, 0);
});
test('Hlídač-style logs expose a stable render snapshot and version', async () => {
  const h = await harness({ settings: { 'affiliate-idp': '123456' } });
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => h.reply(call, price(700 + i * 50)));
  await loading;
  const messages = h.logs.filter(entry => entry.level === 'log');
  assert.equal(messages[0].args[1], 'Alza Benefit Prices – Version: 1.4.0');
  assert.ok(messages.some(entry => entry.args[1]?.startsWith('Alza Benefit Prices – Loaded: 123 · 6/6 ·')));
  assert.ok(messages.some(entry => entry.args[1] === 'Alza Benefit Prices – Render:'));
  assert.equal(h.logs.some(entry => entry.level === 'warn'), false);
  const render = messages.at(-1).args[0];
  assert.equal(render.info.itemId, '123');
  assert.equal(render.info.currency, 'CZK');
  assert.equal(render.metadata.status, 'prices');
  assert.ok(render.metadata.durationMs >= 0);
  assert.ok(render.dataset.currentPrice.length > 0);
  assert.equal(render.dataset.priceLists.length, 6);
  assert.equal(render.metadata.settings.affiliate, true);
  assert.equal(JSON.stringify(render).includes('123456'), false);
  const snapshot = JSON.stringify(render);
  h.api.enabled.Gold = false;
  state.rows[0].amount = 1;
  assert.equal(JSON.stringify(render), snapshot, 'old log data must not change with live panel state');
});
test('equal-price render logs common price and no visible table rows', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach(call => h.reply(call, price(800)));
  await loading;
  const render = h.logs.filter(entry => entry.level === 'log').at(-1).args[0];
  assert.equal(render.metadata.status, 'equal-prices');
  assert.equal(render.dataset.commonPrice, 800);
  assert.equal(render.dataset.currentPrice.length, 0);
  assert.ok(render.dataset.priceLists.every(row => !row.visible));
});
test('failed render logs per-tier errors and an error summary', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach(call => h.reply(call, {}, 403));
  await loading;
  const render = h.logs.filter(entry => entry.level === 'log').at(-1).args[0];
  assert.equal(render.metadata.status, 'error');
  assert.equal(render.metadata.failed, 6);
  assert.ok(render.dataset.priceLists.every(row => row.error.includes('403')));
  assert.ok(h.logs.some(entry => entry.level === 'warn' && entry.args[1]?.startsWith('Alza Benefit Prices – Failed: 123 · 0/6 ·')));
  assert.equal(h.logs.some(entry => entry.args[1]?.startsWith('Alza Benefit Prices – Loaded: 123 · 6/6 ·')), false);
});
test('copied offer logs only one array preserving exact clipboard lines', async () => {
  const h = await harness();
  const text = '## Product %c%s\n\n- **GOLD**: 142 Kč\n\nOdkaz ➤ https://www.alza.cz/product-d123.htm';
  const before = h.logs.length;
  h.api.logCopiedOffer('123', text);
  const entries = h.logs.slice(before);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, 'log');
  assert.equal(entries[0].args[0], '%s');
  assert.equal(entries[0].args[1], 'Alza Benefit Prices – Copied: 123');
  const lines = entries[0].args[2];
  assert.ok(Array.isArray(lines));
  assert.equal(lines.length, 5);
  assert.equal(lines[1], '');
  assert.equal(lines.join('\n'), text);
});
const renderLog = h => h.logs.filter(entry => entry.level === 'log' && entry.args[0]?.info).at(-1).args[0];
test('reloading cached prices reports hits and performs no new requests', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const first = h.api.load('123', state);
  h.calls.forEach((call, i) => h.reply(call, price(700 + i * 50)));
  await first;
  assert.equal(renderLog(h).metadata.networkRequests, 6);
  await h.api.load('123', state);
  assert.equal(h.calls.length, 6);
  const render = renderLog(h);
  assert.equal(render.metadata.cacheHits, 6);
  assert.equal(render.metadata.loaded, 6);
  assert.equal(render.metadata.networkRequests, 0);
  assert.ok(render.dataset.priceLists.every(row => row.source === 'cache'));
  assert.ok(h.logs.some(entry => /Loaded: 123 · 6\/6 · \d+ ms · cache 6\/6$/.test(entry.args[1])));
});
test('shared in-flight requests are not reported as cache hits or new requests', async () => {
  const h = await harness();
  const copied = h.api.TIERS.map(tier => h.api.tierData('123', tier, null));
  const loading = h.api.load('123', stateFor(h.api));
  assert.equal(h.calls.length, 6);
  h.calls.forEach(call => h.reply(call, price(800)));
  await Promise.all([...copied, loading]);
  const render = renderLog(h);
  assert.equal(render.metadata.cacheHits, 0);
  assert.equal(render.metadata.networkRequests, 0);
  assert.equal(render.metadata.sharedRequests, 6);
});
test('partial failure summary reports successful and attempted tiers', async () => {
  const h = await harness();
  const loading = h.api.load('123', stateFor(h.api));
  h.calls.forEach((call, i) => h.reply(call, i === 0 ? {} : price(750 + i * 50), i === 0 ? 403 : 200));
  await loading;
  const render = renderLog(h);
  assert.equal(render.metadata.status, 'partial');
  assert.equal(render.metadata.loaded, 5);
  assert.equal(render.metadata.attempted, 6);
  assert.equal(render.metadata.failedTiers.join('/'), 'Gold');
  assert.ok(h.logs.some(entry => entry.level === 'warn' && /Loaded: 123 · 5\/6 · \d+ ms · cache 0\/6 · failed: Gold$/.test(entry.args[1])));
  assert.equal(render.dataset.priceLists[0].hiddenReason, 'error');
});
test('merged rows explain their target and retain slash labels', async () => {
  const h = await harness();
  const loading = h.api.load('123', stateFor(h.api));
  const amounts = [700, 800, 800, 900, 900, 1000];
  h.calls.forEach((call, i) => h.reply(call, price(amounts[i])));
  await loading;
  const render = renderLog(h);
  const row = name => render.dataset.priceLists.find(item => item.priceList === name);
  assert.equal(row('ISIC').hiddenReason, 'merged-with-silver');
  assert.equal(row('B2B').hiddenReason, 'merged-with-bronze');
  assert.equal(row('Gold').hiddenReason, null);
  assert.ok(render.dataset.currentPrice.some(item => item.priceList === 'SILVER/ISIC'));
  assert.ok(render.dataset.currentPrice.some(item => item.priceList === 'BRONZE/B2B'));
});
test('disabled, equal-to-basic and missing-own-price rows explain hiding', async () => {
  const h = await harness({ settings: { 'enabled-price-tiers': { Gold: false } } });
  const loading = h.api.load('123', stateFor(h.api));
  h.calls.forEach(call => {
    const pgrik = new URL(call.details.url).searchParams.get('pgrik');
    h.reply(call, price(800, pgrik === 'p_pg3is1_2b2fc' ? 0 : 1));
  });
  await loading;
  const render = renderLog(h);
  const row = name => render.dataset.priceLists.find(item => item.priceList === name);
  assert.equal(row('Gold').hiddenReason, 'disabled');
  assert.equal(row('Gold').source, null);
  assert.equal(row('Silver').hiddenReason, 'same-as-basic');
  assert.equal(row('ISIC').hiddenReason, 'no-own-price');
  assert.equal(render.metadata.attempted, 5);
});
test('settings startup reads only the unified key without migration writes', async () => {
  for (const settings of [null, {}, false, []]) {
    const h = await harness({ settings });
    assert.deepEqual(h.storageReads, ['settings']);
    assert.equal(h.storageWrites.length, 0);
    assert.ok(Object.values(h.api.enabled).every(Boolean));
  }
});
test('same-product settings reload reuses pending requests without rendering stale results', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const first = h.api.load('123', state);
  const second = h.api.load('123', state);
  assert.equal(h.calls.length, 6);
  assert.ok(h.calls.every(call => !call.aborted));
  h.calls.forEach((call, i) => h.reply(call, price(700 + i * 50)));
  await Promise.all([first, second]);
  assert.equal(h.logs.filter(entry => entry.args[0]?.info).length, 1);
  assert.equal(renderLog(h).metadata.sharedRequests, 6);
});
test('navigation still aborts panel requests retained during a settings reload', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const first = h.api.load('123', state);
  const second = h.api.load('123', state);
  h.api.cancel();
  await Promise.all([first, second]);
  assert.ok(h.calls.every(call => call.aborted));
  assert.equal(h.logs.filter(entry => entry.args[0]?.info).length, 0);
});
test('quick settings changes coalesce into one complete storage snapshot', async () => {
  const h = await harness();
  h.api.saveSetting('always-show-tiers', true);
  h.api.saveSetting('cashback-price-promos', false);
  h.api.saveSetting('enabled-price-tiers', { Gold: false });
  await h.api.settingWrites;
  assert.equal(h.storageWrites.length, 1);
  const saved = h.storageWrites[0].value;
  assert.equal(saved['always-show-tiers'], true);
  assert.equal(saved['cashback-price-promos'], false);
  assert.equal(saved['enabled-price-tiers'].Gold, false);
  assert.equal(h.api.settingWrites, null);
});
test('settings changed during async storage writes are saved afterward', async () => {
  let finish;
  const h = await harness({ save: () => new Promise(resolve => { finish = resolve; }) });
  h.api.saveSetting('always-show-tiers', true);
  await flush();
  h.api.saveSetting('cashback-price-promos', false);
  h.api.saveSetting('affiliate-idp', '1234');
  const saving = h.api.settingWrites;
  finish();
  await flush();
  assert.equal(h.storageWrites.length, 2);
  assert.equal(h.storageWrites[1].value['affiliate-idp'], '1234');
  assert.equal(h.storageWrites[0].value['affiliate-idp'], undefined);
  finish();
  await saving;
  assert.equal(h.api.settingWrites, null);
});
test('a failed settings write does not prevent subsequent saves', async () => {
  let count = 0;
  const h = await harness({ save: async () => { if (++count === 1) throw Error('Storage failure'); } });
  h.api.saveSetting('always-show-tiers', true);
  await h.api.settingWrites;
  h.api.saveSetting('affiliate-idp', '1234');
  await h.api.settingWrites;
  assert.equal(h.storageWrites.length, 2);
  assert.equal(h.storageWrites[1].value['always-show-tiers'], true);
});
test('disabled BASIC remains hidden when it represents the other tiers', async () => {
  const h = await harness({ settings: { 'enabled-price-tiers': { Basic: false } } });
  const loading = h.api.load('123', stateFor(h.api));
  h.calls.forEach((call, i) => h.reply(call, price(i === 0 ? 700 : 1000)));
  await flush();
  h.reply(h.calls[5], price(1000));
  await loading;
  const basic = renderLog(h).dataset.priceLists.find(row => row.priceList === 'Basic');
  assert.equal(basic.visible, false);
  assert.equal(basic.hiddenReason, 'disabled');
});
test('view changes and promotion changes render retained data after cache eviction', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach(call => {
    const data = price(1000, 0);
    data.data.promoPrices = [{ primaryPrice: '800', priceType: 4 }];
    h.reply(call, data);
  });
  await loading;
  h.api.cache.clear();
  const generation = h.api.generation;
  h.api.setView(true);
  h.api.render('123', state);
  assert.equal(state.rows[0].valid, true);
  assert.equal(state.rows[0].amount, 800);
  h.api.setPromos({ plus: false, cashback: false, tradeIn: false });
  h.api.render('123', state);
  assert.equal(state.rows[0].amount, 1000);
  assert.equal(h.calls.length, 6);
  assert.equal(h.api.generation, generation);
  assert.equal(renderLog(h).metadata.operation, 'view');
  h.api.setView(false);
  h.api.render('123', state);
  assert.equal(state.rows[0].valid, false);
});
test('retry requests only failed tiers, keeps successful prices and prevents duplicate retries', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => h.reply(call, i === 0 ? {} : price(800 + i * 10), i === 0 ? 403 : 200));
  await loading;
  const retained = state.rows[1].data;
  assert.equal(state.retry.hidden, false);
  const retrying = h.api.load('123', state, { retry: true });
  assert.equal(h.calls.length, 7);
  assert.equal(state.retry.disabled, true);
  await h.api.load('123', state, { retry: true });
  assert.equal(h.calls.length, 7);
  h.reply(h.calls[6], price(700));
  await retrying;
  assert.equal(state.rows[1].data, retained);
  assert.equal(state.retry.hidden, true);
  assert.equal(state.retry.disabled, false);
  assert.equal(renderLog(h).metadata.failed, 0);
  assert.equal(renderLog(h).metadata.operation, 'retry');
});
test('retry invalidates an unusable cached payload and survives view changes while pending', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => h.reply(call, i === 0 ? {} : price(800 + i * 10)));
  await loading;
  assert.equal(state.rows[0].error, 'Price not found in the response.');
  const retrying = h.api.load('123', state, { retry: true });
  assert.equal(h.calls.length, 7);
  h.api.setView(true);
  h.api.render('123', state);
  h.reply(h.calls[6], price(700));
  await retrying;
  assert.equal(state.rows[0].amount, 700);
  assert.equal(state.rows[0].error, null);
  assert.equal(state.retry.hidden, true);
});
test('enabling a missing tier fetches only that tier and retains other data', async () => {
  const h = await harness({ settings: { 'enabled-price-tiers': { Gold: false } } });
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach(call => h.reply(call, price(900)));
  await loading;
  const retained = state.rows[1].data;
  h.api.enabled.Gold = true;
  const adding = h.api.load('123', state, { missing: true });
  assert.equal(h.calls.length, 6);
  h.reply(h.calls[5], price(700));
  await adding;
  assert.equal(state.rows[1].data, retained);
  assert.equal(state.rows[0].amount, 700);
  h.api.enabled.Gold = false;
  const generation = h.api.generation;
  await h.api.load('123', state, { missing: true });
  assert.equal(h.api.generation, generation);
  assert.equal(h.calls.length, 6);
});
test('hidden tabs stop polling; visibility and BFCache restoration restart only one interval', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  state.host.isConnected = true;
  h.api.setPanel(state, '123');
  const dispose = h.api.startPageChecks();
  assert.equal(h.intervals.size, 1);
  h.doc.hidden = true;
  h.docEvents.get('visibilitychange')();
  assert.equal(h.intervals.size, 0);
  const before = h.scans;
  h.doc.hidden = false;
  h.docEvents.get('visibilitychange')();
  assert.ok(h.scans > before, 'foregrounding must immediately synchronize the page');
  h.docEvents.get('visibilitychange')();
  assert.equal(h.intervals.size, 1);
  h.windowEvents.get('pagehide')();
  assert.equal(h.intervals.size, 0);
  h.windowEvents.get('pageshow')();
  assert.equal(h.intervals.size, 1);
  dispose();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.docEvents.has('visibilitychange'), false);
  assert.equal(h.windowEvents.has('pageshow'), false);
});
test('starting on a hidden tab creates no polling interval', async () => {
  const h = await harness();
  h.doc.hidden = true;
  const dispose = h.api.startPageChecks();
  assert.equal(h.intervals.size, 0);
  dispose();
});
test('actual panel retry control invokes failed-only loading', async () => {
  const h = await harness();
  const state = h.api.createPanel('123');
  h.api.setPanel(state, '123');
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => h.reply(call, i === 0 ? {} : price(900), i === 0 ? 403 : 200));
  await loading;
  assert.equal(state.retry.textContent, 'Zkusit znovu');
  assert.equal(state.retry.hidden, false);
  state.retry.onclick();
  assert.equal(h.calls.length, 7);
  h.reply(h.calls[6], price(700));
  await flush();
  assert.equal(state.retry.hidden, true);
  state.dispose();
});
test('actual view and promotion controls redraw without a load cycle', async () => {
  const h = await harness();
  const state = h.api.createPanel('123');
  h.api.setPanel(state, '123');
  const loading = h.api.load('123', state);
  h.calls.forEach(call => {
    const data = price(1000, 0);
    data.data.promoPrices = [{ primaryPrice: '800', priceType: 4 }];
    h.reply(call, data);
  });
  await loading;
  h.api.cache.clear();
  const descendants = root => [root, ...root.children.filter(child => typeof child === 'object').flatMap(descendants)];
  const labels = descendants(state.settings).filter(element => element.tagName === 'label');
  const control = text => labels.find(label => label.children.some(child => child.textContent === text)).children[0];
  const generation = h.api.generation;
  const always = control('Vždy zobrazit ceníky');
  always.checked = true;
  always.onchange();
  assert.equal(state.rows[0].amount, 800);
  const plus = control('AlzaPlus+');
  plus.checked = false;
  plus.onchange();
  assert.equal(state.rows[0].amount, 1000);
  assert.equal(h.api.generation, generation);
  assert.equal(h.calls.length, 6);
  assert.equal(state.loading, false);
  state.dispose();
});
test('a repeated retry failure keeps retry available and successful prices visible', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => h.reply(call, price(700 + i * 50), i === 0 ? 403 : 200));
  await loading;
  const retrying = h.api.load('123', state, { retry: true });
  h.reply(h.calls[6], {}, 403);
  await retrying;
  assert.equal(state.retry.hidden, false);
  assert.equal(state.retry.disabled, false);
  assert.equal(state.table.hidden, false);
  assert.equal(renderLog(h).metadata.failed, 1);
});
test('null API payloads become retryable errors', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach(call => h.reply(call, null));
  await loading;
  assert.equal(state.retry.hidden, false);
  assert.equal(renderLog(h).metadata.failed, 6);
});
test('copied offer ignores every tier, promotion and always-show setting combination', async () => {
  const h = await harness();
  const copying = h.api.buildOffer('123');
  const amounts = [700, 800, 800, 900, 900, 1000];
  h.calls.forEach((call, i) => {
    const data = price(amounts[i]);
    data.data.promoPrices = [
      { primaryPrice: String(amounts[i] - 100), priceType: 4 },
      { primaryPrice: String(amounts[i] - 150), priceType: 1 },
      { primaryPrice: String(amounts[i] - 50), priceType: 2 },
    ];
    h.reply(call, data);
  });
  const expected = JSON.stringify(await copying);
  for (let mask = 0; mask < 64; mask++) {
    h.api.TIERS.forEach((tier, i) => { h.api.enabled[tier.name] = Boolean(mask & (1 << i)); });
    for (let promos = 0; promos < 8; promos++) {
      h.api.setPromos({ plus: Boolean(promos & 1), cashback: Boolean(promos & 2), tradeIn: Boolean(promos & 4) });
      for (const always of [false, true]) {
        h.api.setView(always);
        assert.equal(JSON.stringify(await h.api.buildOffer('123', true)), expected);
      }
    }
  }
  assert.equal(h.calls.length, 6);
});
test('actual clipboard text stays identical when panel settings hide tiers and promotions', async () => {
  const h = await harness();
  const state = h.api.createPanel('123');
  h.api.setPanel(state, '123');
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => {
    const amount = [700, 800, 800, 900, 900, 1000][i];
    const data = price(amount);
    data.data.promoPrices = [{ primaryPrice: String(amount - 100), priceType: 4 }];
    h.reply(call, data);
  });
  await loading;
  await state.copy.onclick();
  const expected = h.clipboardWrites[0];
  assert.ok(expected.includes('**GOLD**'));
  assert.ok(expected.includes('**SILVER/ISIC**'));
  assert.ok(expected.includes('**BRONZE/B2B**'));
  assert.ok(expected.includes('AlzaPlus+'));
  h.api.enabled.Gold = false;
  h.api.enabled.Silver = false;
  h.api.enabled.ISIC = false;
  h.api.enabled.Bronze = false;
  h.api.enabled.B2B = false;
  h.api.setPromos({ plus: false, cashback: false, tradeIn: false });
  h.api.setView(true);
  h.api.render('123', state);
  assert.equal(state.rows.find(row => row.tier.name === 'Gold').tr.hidden, true);
  assert.equal(state.rows.find(row => row.tier.reference).amount, 1000);
  await state.copy.onclick();
  assert.equal(h.clipboardWrites[1], expected);
  assert.equal(h.calls.length, 6);
  state.dispose();
});
test('panel and copy share ISIC cashback correction and the original discount base', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => {
    const main = [700, 800, 800, 900, 900, 1000][i];
    const data = price(main);
    data.data.promoPrices = [{ primaryPrice: String(i === 2 ? 900 : main - 100), priceType: 1 }];
    // ISIC and BASIC report the same cashback price despite different main prices.
    if (i === 2) data.data.mainPriceTag.primaryPrice = '950';
    h.reply(call, data);
  });
  await loading;
  const offer = await h.api.buildOffer('123', true);
  const isic = offer.entries.find(entry => entry.names.includes('ISIC'));
  assert.equal(isic.amount, 850);
  assert.equal(state.rows.find(row => row.tier.name === 'ISIC').amount, isic.amount);
  assert.equal(renderLog(h).dataset.originalPrice, offer.original);
});
test('shared original-price calculation preserves panel and copy fallback policies', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => {
    const data = price(i === 5 ? 1000 : 700);
    if (i === 5) delete data.data.mainPriceTag.comparePrice;
    h.reply(call, data);
  });
  await loading;
  const offer = await h.api.buildOffer('123', true);
  // Panel compares with BASIC's main price; copy uses the API's explicit discount base.
  assert.equal(renderLog(h).dataset.originalPrice, 1000);
  assert.equal(offer.original, 1200);
});
test('API responses from unexpected origins are rejected before caching', async () => {
  for (const finalUrl of ['http://webapi.alza.cz/test', 'https://webapi.alza.cz:8443/test', 'https://webapi.alza.cz.evil.example/test', 'https://example.com/test']) {
    const h = await harness();
    const data = h.api.tierData('123', h.api.TIERS[0], null);
    const rejected = assert.rejects(data, /unexpected origin/);
    h.calls[0].details.onload({ status: 200, responseText: JSON.stringify(price(800)), finalUrl });
    await rejected;
    assert.equal(h.api.cache.size, 0);
  }
});
test('oversized and malformed JSON responses are rejected without caching', async () => {
  for (const responseText of ['x'.repeat(2 * 1024 * 1024 + 1), '<html>blocked</html>', 'null', '42', '"price"']) {
    const h = await harness();
    const data = h.api.tierData('123', h.api.TIERS[0], null);
    const rejected = assert.rejects(data);
    h.calls[0].details.onload({ status: 200, responseText });
    await rejected;
    assert.equal(h.api.cache.size, 0);
  }
});
test('unavailable clipboard observes a later text rejection', async () => {
  const h = await harness();
  h.navigator.clipboard = undefined;
  let rejectText;
  const text = new Promise((resolve, reject) => { rejectText = reject; });
  await assert.rejects(h.api.writeClipboard(text), /Clipboard/);
  rejectText(Error('Offer failed later'));
  await flush(); // An unhandled rejection here fails node:test.
});
test('unsupported ClipboardItem handles rejected blob promises and propagates offer errors', async () => {
  const h = await harness({ clipboardItem: class { constructor() { throw Error('Promises unsupported'); } } });
  h.navigator.clipboard.write = async () => {};
  let rejectText;
  const text = new Promise((resolve, reject) => { rejectText = reject; });
  const copying = assert.rejects(h.api.writeClipboard(text), /Offer failed/);
  rejectText(Error('Offer failed'));
  await copying;
  await flush();
  assert.equal(h.clipboardWrites.length, 0);
});
test('navigation before sync prevents old prices being copied with a new product URL', async () => {
  for (const navigateBeforeClick of [true, false]) {
    const h = await harness();
    const state = h.api.createPanel('123');
    h.api.setPanel(state, '123');
    const navigate = () => {
      h.location.pathname = '/new-product-d456.htm';
      h.location.href = 'https://www.alza.cz/new-product-d456.htm';
    };
    if (navigateBeforeClick) navigate();
    const copying = state.copy.onclick();
    if (!navigateBeforeClick) navigate();
    h.calls.forEach(call => h.reply(call, price(800)));
    await copying;
    assert.equal(h.clipboardWrites.length, 0);
    if (navigateBeforeClick) assert.equal(h.calls.length, 0);
    state.dispose();
  }
});
test('equal tier amounts with different coupons stay separate in panel and copied offer', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => {
    const data = price(1000);
    if (i < 5) data.data.promoPrices = [{ primaryPrice: '800', priceType: 3, discountCouponCode: 'CODE' + i }];
    h.reply(call, data);
  });
  await loading;
  const offer = await h.api.buildOffer('123', true);
  assert.ok(offer.entries.every(entry => entry.names.length <= 1));
  const rows = renderLog(h).dataset.currentPrice;
  assert.ok(rows.some(row => row.priceList === 'SILVER'));
  assert.ok(rows.some(row => row.priceList === 'ISIC'));
});
test('a hidden tier with no usable comparison price is a retryable failure', async () => {
  const h = await harness();
  const state = stateFor(h.api);
  const loading = h.api.load('123', state);
  h.calls.forEach((call, i) => {
    const data = price(800, i === 0 ? 0 : 1);
    if (i === 0) data.data.mainPriceTag.primaryPrice = 'invalid';
    h.reply(call, data);
  });
  await loading;
  assert.equal(state.rows[0].error, 'Price not found in the response.');
  assert.equal(state.retry.hidden, false);
});
test('copy remains usable with every panel tier disabled and loads all tiers on demand', async () => {
  const h = await harness();
  h.api.TIERS.forEach(tier => { h.api.enabled[tier.name] = false; });
  const state = h.api.createPanel('123');
  h.api.setPanel(state, '123');
  await h.api.load('123', state);
  assert.equal(h.calls.length, 0);
  assert.equal(state.copy.hidden, false);
  const copying = state.copy.onclick();
  assert.equal(h.calls.length, 6);
  h.calls.forEach((call, i) => h.reply(call, price(700 + i * 50)));
  await copying;
  assert.equal(h.clipboardWrites.length, 1);
  assert.ok(h.clipboardWrites[0].includes('GOLD'));
  state.dispose();
});
test('coupon headings use natural singular and plural wording in each supported language', async () => {
  const languages = [
    ['www.alza.cz', 'Cena s kódem ', 'Ceny s kódem ', ''],
    ['www.alza.sk', 'Cena s kódom ', 'Ceny s kódom ', ''],
    ['www.alza.de', 'Preis mit Code ', 'Preise mit Code ', ''],
    ['www.alza.hu', 'Ár – ', 'Árak – ', ' kuponkóddal'],
    ['www.alza.cz', 'Price with code ', 'Prices with code ', '', '/en/product-d123.htm'],
  ];
  for (const [hostname, singular, plural, suffix, pathname] of languages) {
    for (const single of [true, false]) {
      const h = await harness({ hostname, pathname });
      const state = h.api.createPanel('123');
      h.api.setPanel(state, '123');
      const loading = h.api.load('123', state);
      h.calls.forEach((call, i) => {
        const data = price(1000);
        data.data.promoPrices = [{ primaryPrice: String(single ? 800 : 600 + i * 50), priceType: 3, discountCouponCode: 'SAVE$&10' }];
        h.reply(call, data);
      });
      await loading;
      await state.copy.onclick();
      const expected = (single ? singular : plural) + 'SAVE$&10' + suffix + ':';
      assert.ok(h.clipboardWrites[0].includes(expected), hostname + ': ' + expected);
      state.dispose();
    }
  }
});
module.exports = { harness, price };
