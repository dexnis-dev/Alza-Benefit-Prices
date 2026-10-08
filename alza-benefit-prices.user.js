// ==UserScript==
// @name         Alza Benefit Prices
// @namespace    local.alza-ceny
// @version      1.0.0
// @description  Userscript pro Alza.cz, který přehledně zobrazuje ceny a procentuální slevy jednotlivých benefitních úrovní (Gold, Silver, Bronze a ISIC) přímo na stránce produktu.
// @compatible   chrome
// @compatible   edge
// @compatible   firefox
// @compatible   opera
// @compatible   safari
// @match        https://www.alza.cz/*
// @match        https://alza.cz/*
// @match        https://m.alza.cz/*
// @match        https://www.alza.sk/*
// @match        https://alza.sk/*
// @match        https://m.alza.sk/*
// @connect      webapi.alza.cz
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @inject-into  content
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async () => {
  'use strict';

  const country = /(?:^|\.)alza\.sk$/i.test(location.hostname) ? 'SK' : 'CZ';
  const locale = country === 'SK' ? 'sk-SK' : 'cs-CZ';
  const discountFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const mobile = /^m\.alza\.(?:cz|sk)$/i.test(location.hostname);
  const CACHE_TTL = 60000;

  // Safari Userscripts exposes asynchronous GM.* storage APIs.
  async function getSetting(key, fallback) {
    if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') return await GM.getValue(key, fallback);
    if (typeof GM_getValue === 'function') return await GM_getValue(key, fallback);
    throw new Error('Rozšíření neposkytuje ukládání nastavení. Zkontroluj oprávnění skriptu.');
  }

  async function setSetting(key, value) {
    if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') return await GM.setValue(key, value);
    if (typeof GM_setValue === 'function') return await GM_setValue(key, value);
    throw new Error('Rozšíření neposkytuje ukládání nastavení.');
  }

  let settingWrites = Promise.resolve();
  function saveSetting(key, value) {
    settingWrites = settingWrites.then(() => setSetting(key, value))
      .catch(error => console.warn('[Alza ceny] Nastavení: ' + error.message));
  }

  const TIERS = [
    { name: 'Gold', pgrik: 'p_pg4_e6c95', endpoint: 'detailPriceInfoV3' },
    { name: 'ISIC', pgrik: 'p_pg3is1_2b2fc', endpoint: 'detailPriceInfoV3' },
    { name: 'Bronze', pgrik: 'p_pg5_44266', endpoint: 'detailPriceInfoV3' },
    { name: 'B2B', pgrik: 'p_pg6_6ce49', endpoint: 'detailPriceInfoV3', badge: 'isic' },
    { name: 'Basic', pgrik: 'p__26752', endpoint: 'detailPriceInfoV3', reference: true, badge: 'regular' },
  ];
  const [saved, savedPlus, savedCashback] = await Promise.all([
    getSetting('enabled-price-tiers', {}),
    getSetting('alza-plus-promos', true),
    getSetting('cashback-promos', true),
  ]);
  const enabled = Object.fromEntries(TIERS.map(tier => [tier.name,
    (tier.name === 'Basic' ? saved?.Basic ?? saved?.BASIC ?? saved?.['Běžná cena'] : saved?.[tier.name]) !== false,
  ]));
  let alzaPlusPromos = savedPlus !== false;
  let cashbackPromos = savedCashback !== false;
  let activeId = null;
  let generation = 0;
  let panel = null;
  let pending = [];

  function productId(pathname) {
    return pathname.match(/-d(\d+)(?:\.htm|\/|$)/i)?.[1] || null;
  }

  function apiUrl(id, tier) {
    const url = new URL(`https://webapi.alza.cz/api/commodity/v1/${id}/${tier.endpoint}`);
    url.search = new URLSearchParams({ country, pgrik: tier.pgrik, ucik: 'GB' });
    return url.href;
  }

  function extractPrice(raw, reference = false) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    function findPricing(value, depth = 0) {
      if (!value || typeof value !== 'object' || depth > 30) return null;
      if (value.mainPriceTag || Array.isArray(value.promoPrices)) return value;
      for (const child of Object.values(value)) {
        const result = findPricing(child, depth + 1);
        if (result) return result;
      }
      return null;
    }
    const pricing = findPricing(data);
    if (!pricing) return null;
    const main = pricing.mainPriceTag;
    // "Novinka" uses priceType 7 while its priceGroupType can remain zero.
    if (!reference && main?.priceGroupType === 0 && main.priceType !== 7) return { hidden: true };
    function candidate(value, promo = false) {
      if (!value || !['string', 'number'].includes(typeof value.primaryPrice)) return null;
      const price = String(value.primaryPrice).trim();
      let numeric = price.replace(/\s/g, '').replace(/(?:Kč|CZK|€|EUR)$/i, '').replace(/[,.][-–—]$/, '');
      if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(numeric)) numeric = numeric.replace(/\./g, '');
      if (!/^\d+(?:[,.]\d{1,2})?$/.test(numeric)) return null;
      const amount = Number(numeric.replace(',', '.'));
      if (!Number.isFinite(amount)) return null;
      return {
        price, amount, promo, priceType: value.priceType,
        name: promo && typeof value.name === 'string' ? value.name.trim() : '',
        coupon: promo && typeof value.discountCouponCode === 'string' ? value.discountCouponCode.trim() : '',
      };
    }
    // Prefer the main price on a tie, so a coupon is shown only if it saves money.
    const mainCandidate = candidate(main);
    let selected = mainCandidate;
    for (const promo of Array.isArray(pricing.promoPrices) ? pricing.promoPrices : []) {
      if (!alzaPlusPromos && promo?.priceType === 4) continue;
      if (!cashbackPromos && promo?.priceType === 2) continue;
      const next = candidate(promo, true);
      if (next && (!selected || next.amount < selected.amount)) selected = next;
    }
    const compare = candidate({ primaryPrice: main?.comparePrice });
    // When the original comparison price is missing, measure the coupon saving
    // against the main price before applying the coupon.
    const discountBase = compare || (selected?.promo ? mainCandidate : null);
    if (!reference && (main?.priceType === 7 || main?.priceType === 4)) {
      if (!selected || !discountBase || selected.amount === discountBase.amount) return { hidden: true };
    }
    if (selected) selected.discountPercent = discountBase && discountBase.amount > 0 && discountBase.amount > selected.amount
      ? (discountBase.amount - selected.amount) / discountBase.amount * 100 : null;
    return selected;
  }

  function request(url) {
    return new Promise((resolve, reject) => {
      let handle;
      let settled = false;
      const finish = callback => value => {
        if (settled) return;
        settled = true;
        pending = pending.filter(item => item !== tracked);
        callback(value);
      };
      const fail = finish(reject);
      const tracked = { abort() {
        fail(new Error('Načítání zrušeno.'));
        try { handle?.abort?.(); } catch { /* The request may already be finished. */ }
      } };
      pending.push(tracked);
      const succeed = finish(response => resolve({
        status: response.status,
        responseText: typeof response.responseText === 'string' ? response.responseText : String(response.response ?? ''),
        finalUrl: response.finalUrl || response.responseURL || url,
      }));
      const details = {
        method: 'GET', url, timeout: 20000, responseType: 'text',
        headers: { Accept: 'application/json, text/html;q=0.9' },
        onload: succeed,
        onerror: () => fail(new Error('Rozšíření nedokázalo načíst API. Zkontroluj přístup k webapi.alza.cz.')),
        ontimeout: () => fail(new Error('Alza neodpověděla do 20 sekund.')),
        onabort: () => fail(new Error('Načítání zrušeno.')),
      };
      try {
        if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
          handle = GM.xmlHttpRequest(details);
        } else if (typeof GM_xmlhttpRequest === 'function') {
          handle = GM_xmlhttpRequest(details);
        } else {
          throw new Error('Rozšíření neposkytuje načítání API. Zkontroluj oprávnění skriptu.');
        }
        // Userscripts returns an abortable Promise; other managers can use callbacks.
        if (typeof handle?.then === 'function') handle.then(succeed, fail);
      } catch (error) { fail(error); }
    });
  }

  function cancel() {
    generation++;
    const requests = pending;
    pending = [];
    requests.forEach(handle => handle.abort());
  }

  function node(tag, text, parent) {
    const item = document.createElement(tag);
    if (text != null) item.textContent = text;
    if (parent) parent.append(item);
    return item;
  }

  function mount(host) {
    // Hlídačshopů's content lives in a closed shadow root; use its outer host.
    const tracker = document.querySelector('[data-hs], #hlidacShopu');
    const before = tracker || document.querySelector('[data-react-client-component="alternativePricingModule"]');
    if (before) {
      host.style.order = before.style.order || '';
      if (before.previousElementSibling !== host) before.before(host);
      return;
    }
    const price = document.querySelector('.js-price-detail__main-price-box-wrapper, [data-testid="price-primary"]');
    const after = price?.closest('.price-detail__row') || price;
    if (after && after.nextElementSibling !== host) after.after(host);
  }

  function createPanel(id) {
    const host = node('div');
    host.id = 'local-alza-price-tiers';
    host.hidden = true;
    Object.assign(host.style, {
      position: 'relative', width: '100%', minWidth: '0',
      margin: mobile ? '0' : '0 0 12px', padding: mobile ? '4px 0 8px' : '0',
    });
    const shadow = host.attachShadow({ mode: 'open' });
    node('style', `
      :host{display:block;clear:both;font:13px "IBM Plex Sans Var",system-ui,sans-serif;color:#000;line-height:1.4;font-kerning:normal;font-variant-numeric:lining-nums;-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision}:host([hidden]){display:none!important}
      *{box-sizing:border-box;font-family:inherit}section{background:#fff;border:1px solid #e8e8e8;border-radius:14px;padding:8px}
      table{border-collapse:collapse;width:100%;margin:0}th,td{text-align:left;vertical-align:top;padding:10px 8px;border-bottom:1px solid #e8e8e8}th{font-size:12px;font-weight:500;color:#979797}td:nth-child(2){font-size:16px;font-weight:700;color:#ca0505;overflow-wrap:anywhere}tbody tr:last-child td{border-bottom:0}.discount{white-space:nowrap}.discount-value{display:inline-block;padding:4px 8px;border-radius:4px;background:#5dbd2f;color:#fff;font-size:15px;font-weight:700}.error{color:#ca0505;font-weight:400!important;font-size:12px}
      .tier-badge{display:inline-block;padding:5px 10px;border-radius:4px;font-size:14px;font-weight:600;line-height:1.2;text-transform:uppercase;background:#c2c2c2;color:#171717}.tier-gold{background:#ffd500;color:#171717}.tier-silver{background:#c2c2c2;color:#171717}.tier-bronze{background:#d2822d;color:#fff}.tier-isic{background:#3cba9c;color:#fff}.tier-regular{background:#f0f0f0;color:#606060}
      .promo-label{display:block;margin-top:5px;font-size:12px;font-weight:400;color:#979797;line-height:1.4}.credit{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;padding:0 8px 2px;font-size:12px;color:#979797}
      .gear{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid #e8e8e8;border-radius:8px;background:#fff;color:#979797;font-size:20px;cursor:pointer}.gear:hover,.gear[aria-expanded="true"]{background:#f5f5f5;color:#000}.gear:focus-visible,input:focus-visible{outline:2px solid #545fef;outline-offset:2px}.settings{display:grid;gap:16px;padding:12px 8px;margin-top:8px;border-top:1px solid #e8e8e8}.settings label{display:flex;gap:7px;align-items:center;cursor:pointer}.settings input{accent-color:#545fef;width:16px;height:16px;margin:0}.settings-only{border:0;padding:0}.settings-only .credit{margin-top:0;justify-content:flex-end}
      @media(max-width:420px){section{padding:6px}th,td{padding:10px 6px}th:first-child{width:26%}th:nth-child(2){width:48%}th:last-child{width:26%}.tier-badge{padding:5px 7px;font-size:12px}.discount-value{padding:4px 6px;font-size:13px}.promo-label{font-size:11px;overflow-wrap:anywhere}}
      .settings fieldset{min-width:0;margin:0;padding:0;border:0}.settings legend{padding:0;margin-bottom:8px;color:#606060;font-size:12px;font-weight:600}.settings-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 16px}.settings label{min-height:30px}.settings-actions{padding-top:12px!important;border-top:1px solid #e8e8e8!important}.settings-actions .settings-options{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:420px){.settings-options{grid-template-columns:repeat(2,minmax(0,1fr))}}
      [hidden]{display:none!important}
      .price-notice{flex:1;color:#606060;font-size:13px}.equal-prices .credit{margin-top:0;padding:0 4px;justify-content:flex-start}.equal-prices .gear{flex-shrink:0}
    `, shadow);
    const section = node('section', null, shadow);
    section.id = 'price-table';
    section.setAttribute('aria-label', 'Ceny ceníků: ' + TIERS.map(tier => tier.name).join(', '));
    const table = node('table', null, section);
    const heading = node('tr', null, node('thead', null, table));
    node('th', 'Ceník', heading).scope = 'col';
    node('th', 'Cena', heading).scope = 'col';
    node('th', 'Sleva', heading).scope = 'col';
    const tbody = node('tbody', null, table);
    const rows = TIERS.map(tier => {
      const tr = node('tr', null, tbody);
      const label = node('td', null, tr);
      node('div', tier.name.toUpperCase(), label).className = 'tier-badge tier-' + (tier.badge || tier.name.toLowerCase());
      const price = node('td', '—', tr);
      price.setAttribute('aria-live', 'polite');
      const discount = node('td', '—', tr);
      discount.className = 'discount';
      return { tier, price, discount, tr };
    });
    const footer = node('footer', null, section);
    footer.className = 'credit';
    const gear = node('button', null, footer);
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const gearIcon = document.createElementNS(svgNamespace, 'svg');
    for (const [key, value] of Object.entries({
      viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', focusable: 'false',
    })) gearIcon.setAttribute(key, value);
    const outline = document.createElementNS(svgNamespace, 'path');
    outline.setAttribute('d', 'M19.42 9.59L21.85 10.26L21.85 13.74L19.42 14.41L18.95 15.54L20.19 17.74L17.74 20.19L15.54 18.95L14.41 19.42L13.74 21.85L10.26 21.85L9.59 19.42L8.46 18.95L6.26 20.19L3.81 17.74L5.05 15.54L4.58 14.41L2.15 13.74L2.15 10.26L4.58 9.59L5.05 8.46L3.81 6.26L6.26 3.81L8.46 5.05L9.59 4.58L10.26 2.15L13.74 2.15L14.41 4.58L15.54 5.05L17.74 3.81L20.19 6.26L18.95 8.46Z');
    const center = document.createElementNS(svgNamespace, 'circle');
    center.setAttribute('cx', '12');
    center.setAttribute('cy', '12');
    center.setAttribute('r', '3');
    gearIcon.append(outline, center);
    gear.append(gearIcon);
    gear.className = 'gear';
    gear.type = 'button';
    gear.title = 'Nastavení ceníků';
    gear.setAttribute('aria-label', 'Nastavení ceníků');
    gear.setAttribute('aria-expanded', 'false');
    const notice = node('span', 'Všechny ceníky mají stejnou cenu', footer);
    notice.className = 'price-notice';
    notice.hidden = true;
    const credit = node('span', 'Vytvořil Dexnis', footer);
    const settings = node('div', null, section);
    settings.className = 'settings';
    settings.id = 'price-tier-settings';
    settings.hidden = true;
    gear.setAttribute('aria-controls', settings.id);
    const state = { host, rows, table, section, credit, notice, settings, cache: new Map(), loaded: false };
    gear.onclick = () => {
      settings.hidden = !settings.hidden;
      gear.setAttribute('aria-expanded', String(!settings.hidden));
      section.classList.toggle('settings-only', table.hidden && settings.hidden && notice.hidden);
    };
    const tierSettings = node('fieldset', null, settings);
    node('legend', 'Ceníky', tierSettings);
    const tierOptions = node('div', null, tierSettings);
    tierOptions.className = 'settings-options';
    for (const tier of TIERS) {
      const label = node('label', null, tierOptions);
      const checkbox = node('input', null, label);
      checkbox.type = 'checkbox';
      checkbox.checked = enabled[tier.name];
      node('span', tier.name, label);
      checkbox.onchange = () => {
        enabled[tier.name] = checkbox.checked;
        saveSetting('enabled-price-tiers', { ...enabled });
        void load(id, state);
      };
    }
    const actionSettings = node('fieldset', null, settings);
    actionSettings.className = 'settings-actions';
    node('legend', 'Akce', actionSettings);
    const actionOptions = node('div', null, actionSettings);
    actionOptions.className = 'settings-options';
    const plusLabel = node('label', null, actionOptions);
    const plusCheckbox = node('input', null, plusLabel);
    plusCheckbox.type = 'checkbox';
    plusCheckbox.checked = alzaPlusPromos;
    node('span', 'AlzaPlus+', plusLabel);
    plusCheckbox.onchange = () => {
      alzaPlusPromos = plusCheckbox.checked;
      saveSetting('alza-plus-promos', alzaPlusPromos);
      void load(id, state);
    };
    const cashbackLabel = node('label', null, actionOptions);
    const cashbackCheckbox = node('input', null, cashbackLabel);
    cashbackCheckbox.type = 'checkbox';
    cashbackCheckbox.checked = cashbackPromos;
    node('span', 'Cashback/Výkup', cashbackLabel);
    cashbackCheckbox.onchange = () => {
      cashbackPromos = cashbackCheckbox.checked;
      saveSetting('cashback-promos', cashbackPromos);
      void load(id, state);
    };
    mount(host);
    return state;
  }

  async function load(id, state) {
    cancel();
    const run = generation;
    state.host.hidden = !state.loaded;
    state.table.hidden = true;
    state.rows.forEach(row => { row.tr.hidden = true; row.valid = false; row.amount = null; row.comparisonAmount = null; row.price.className = ''; row.price.textContent = 'Načítání…'; });
    async function loadRow(row) {
      try {
        const url = apiUrl(id, row.tier);
        let cached = state.cache.get(url);
        if (!cached || Date.now() - cached.time >= CACHE_TTL) {
          const response = await request(url);
          if (run !== generation) return;
          if (response.responseText.length > 2 * 1024 * 1024) throw new Error('Odpověď API je příliš velká.');
          if (response.status === 403) throw new Error('HTTP 403: přístup blokován.');
          if (response.status < 200 || response.status >= 300) throw new Error('API vrátilo HTTP ' + response.status + '.');
          if (response.finalUrl && new URL(response.finalUrl).hostname !== 'webapi.alza.cz') throw new Error('API přesměrovalo na jinou doménu.');
          try { cached = { data: JSON.parse(response.responseText), time: Date.now() }; }
          catch { throw new Error('Cena v odpovědi nenalezena.'); }
          state.cache.set(url, cached);
        }
        if (run !== generation) return;
        const result = extractPrice(cached.data, row.tier.reference);
        if (!result) throw new Error('Cena v odpovědi nenalezena.');
        // Check equality even when a standard priceGroupType hides the row.
        const comparison = result.hidden ? extractPrice(cached.data, true) : result;
        row.comparisonAmount = comparison?.amount ?? null;
        if (result.hidden) {
          row.tr.hidden = true;
          return;
        }
        row.price.textContent = result.price;
        row.discount.textContent = '—';
        if (result.discountPercent !== null) {
          row.discount.textContent = '';
          node('span', '−' + discountFormat.format(result.discountPercent) + ' %', row.discount).className = 'discount-value';
        }
        if (result.promo) {
          const label = node('span', result.priceType === 4 ? 'S AlzaPlus+' : result.coupon ? 'S kódem ' + result.coupon : result.name || 'Akční cena', row.price);
          label.className = 'promo-label';
        }
        row.amount = result.amount;
        row.valid = true;
        row.tr.hidden = false;
      } catch (error) {
        if (run !== generation) return;
        row.tr.hidden = true;
        console.warn('[Alza ceny] ' + row.tier.name + ': ' + error.message);
      }
    }
    // Fetch independent tiers together, then BASIC only if a price was found.
    await Promise.all(state.rows.filter(row => !row.tier.reference && enabled[row.tier.name]).map(loadRow));
    if (run !== generation) return;
    const basic = state.rows.find(row => row.tier.reference);
    if (basic && state.rows.some(row => !row.tier.reference && row.comparisonAmount !== null)) await loadRow(basic);
    if (run === generation) {
      filterRows(state.rows);
      // Reorder the DOM only so ties keep the configured tier order.
      const sorted = state.rows.filter(row => !row.tr.hidden).sort((a, b) => a.amount - b.amount);
      for (const row of sorted) row.tr.parentNode.append(row.tr);
      const compared = state.rows.filter(row => row.tier.reference || enabled[row.tier.name]);
      const equalPrices = compared.length > 1 && compared.every(row =>
        row.comparisonAmount !== null && row.comparisonAmount === compared[0].comparisonAmount);
      const hasPrices = !equalPrices && state.rows.some(row => row.valid && !row.tr.hidden);
      state.table.hidden = !hasPrices;
      state.credit.hidden = !hasPrices;
      state.notice.hidden = !equalPrices;
      state.section.classList.toggle('equal-prices', equalPrices);
      state.section.classList.toggle('settings-only', !hasPrices && !equalPrices && state.settings.hidden);
      state.loaded = true;
      state.host.hidden = false;
    }
  }

  function filterRows(rows) {
    const basic = rows.find(row => row.tier.reference);
    for (const row of rows) {
      let visible = row.valid && enabled[row.tier.name];
      if (['Gold', 'Silver', 'Bronze', 'ISIC'].includes(row.tier.name)) {
        visible = visible && basic?.valid && row.amount < basic.amount;
      }
      row.tr.hidden = !visible;
    }
    const bronze = rows.find(row => row.tier.name === 'Bronze');
    const b2b = rows.find(row => row.tier.name === 'B2B');
    if (b2b && bronze?.valid && !bronze.tr.hidden && bronze.amount === b2b.amount) b2b.tr.hidden = true;
    const isic = rows.find(row => row.tier.name === 'ISIC');
    if (b2b?.valid && basic?.valid && b2b.amount === basic.amount
      && isic?.valid && !isic.tr.hidden && isic.amount < basic.amount) b2b.tr.hidden = true;
    // Keep BASIC only when there is another visible price to compare with it.
    if (basic && !rows.some(row => !row.tier.reference && !row.tr.hidden)) basic.tr.hidden = true;
  }

  function sync() {
    const id = productId(location.pathname);
    if (id !== activeId) {
      cancel();
      panel?.host.remove(); panel = null; activeId = id;
      if (id) {
        panel = createPanel(id);
        void load(id, panel);
      }
    } else if (panel) {
      mount(panel.host);
    }
  }

  sync();
  // Detect product navigation without modifying Alza's history or scripts.
  const timer = setInterval(() => { if (!document.hidden) sync(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { clearInterval(timer); cancel(); }
  });
})().catch(error => console.error('[Alza ceny] Spuštění: ' + error.message));
