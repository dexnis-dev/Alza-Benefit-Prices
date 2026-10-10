// ==UserScript==
// @name         Alza Benefit Prices
// @icon         https://www.alza.cz/favicon-alza.ico
// @author       Dexnis
// @namespace    local.alza-ceny
// @version      1.2.0
// @updateURL    https://raw.githubusercontent.com/dexnis-dev/Alza-Benefit-Prices/main/alza-benefit-prices.user.js
// @downloadURL  https://raw.githubusercontent.com/dexnis-dev/Alza-Benefit-Prices/main/alza-benefit-prices.user.js
// @description  Userscript pro Alza.cz a Alza.sk, který přímo na stránce produktu zobrazí ceny ceníků Gold, Silver, ISIC, Bronze, B2B a Basic včetně procentuálních slev.
// @compatible   chrome
// @compatible   edge
// @compatible   firefox
// @compatible   opera
// @compatible   safari
// @match        https://www.alza.cz/*-d*.htm*
// @match        https://www.alza.cz/*?*dq=*
// @match        https://alza.cz/*-d*.htm*
// @match        https://alza.cz/*?*dq=*
// @match        https://m.alza.cz/*-d*.htm*
// @match        https://m.alza.cz/*?*dq=*
// @match        https://www.alza.sk/*-d*.htm*
// @match        https://www.alza.sk/*?*dq=*
// @match        https://alza.sk/*-d*.htm*
// @match        https://alza.sk/*?*dq=*
// @match        https://m.alza.sk/*-d*.htm*
// @match        https://m.alza.sk/*?*dq=*
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

  // Do not initialize settings, requests or observers outside product pages.
  if (!productId(location.pathname, location.search)) return;

  const country = /(?:^|\.)alza\.sk$/i.test(location.hostname) ? 'SK' : 'CZ';
  const locale = country === 'SK' ? 'sk-SK' : 'cs-CZ';
  const discountFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const priceFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const mobile = /^m\.alza\.(?:cz|sk)$/i.test(location.hostname);
  const CACHE_TTL = 5 * 60 * 1000;
  const CACHE_LIMIT = 60;
  // Shared by all panels, so returning to a product reuses its prices.
  const cache = new Map();

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
      .catch(error => console.warn('[Alza Benefit Prices] Nastavení: ' + error.message));
  }

  const TIERS = [
    { name: 'Gold', pgrik: 'p_pg4_e6c95' },
    { name: 'Silver', pgrik: 'p_pg3_36eef' },
    { name: 'ISIC', pgrik: 'p_pg3is1_2b2fc' },
    { name: 'Bronze', pgrik: 'p_pg5_44266' },
    { name: 'B2B', pgrik: 'p_pg6_6ce49', badge: 'isic' },
    { name: 'Basic', pgrik: 'p__26752', reference: true, badge: 'regular' },
  ];
  const [saved, savedPlus, savedCashback, savedCashbackPrice, savedTradeIn, savedAlways, savedBelowPhoto] = await Promise.all([
    getSetting('enabled-price-tiers', {}),
    getSetting('alza-plus-promos', true),
    getSetting('cashback-promos', true),
    getSetting('cashback-price-promos', null),
    getSetting('trade-in-promos', null),
    getSetting('always-show-tiers', false),
    getSetting('panel-below-photo', false),
  ]);
  const enabled = Object.fromEntries(TIERS.map(tier => [tier.name,
    (tier.name === 'Basic' ? saved?.Basic ?? saved?.BASIC ?? saved?.['Běžná cena'] : saved?.[tier.name]) !== false,
  ]));
  let alzaPlusPromos = savedPlus !== false;
  let cashbackPromos = (savedCashbackPrice ?? savedCashback) !== false;
  let tradeInPromos = (savedTradeIn ?? savedCashback) !== false;
  let alwaysShow = savedAlways === true;
  let belowPhoto = savedBelowPhoto === true;
  let belowPhotoOption = null;
  let activeId = null;
  let generation = 0;
  let panel = null;
  let pending = [];

  function productId(pathname, search = '') {
    const variant = new URLSearchParams(search).get('dq');
    if (/^\d+$/.test(variant || '')) return variant;
    return pathname.match(/-d(\d+)(?:\.htm|\/|$)/i)?.[1] || null;
  }

  function apiUrl(id, tier) {
    const url = new URL(`https://webapi.alza.cz/api/commodity/v1/${id}/detailPriceInfoV3`);
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
      if (!cashbackPromos && promo?.priceType === 1) continue;
      if (!tradeInPromos && promo?.priceType === 2) continue;
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
    if (selected) {
      selected.discountPercent = discountBase && discountBase.amount > 0 && discountBase.amount > selected.amount
        ? (discountBase.amount - selected.amount) / discountBase.amount * 100 : null;
      selected.discountBaseAmount = discountBase?.amount ?? null;
    }
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

  function formatPrice(amount) {
    return priceFormat.format(amount) + (country === 'SK' ? ' €' : ' Kč');
  }

  // Panel style of Alza's own prices, e.g. "549,-"; Slovak prices keep the euro sign.
  function formatPanelPrice(amount) {
    return country === 'SK' ? formatPrice(amount) : priceFormat.format(amount) + ',-';
  }

  function formatDiscount(percent) {
    return percent > 0 ? '−' + discountFormat.format(percent) + ' %' : '';
  }

  function visibleRows(rows) {
    return rows.filter(row => row.valid && !row.tr.hidden).sort((a, b) => a.amount - b.amount);
  }

  async function writeClipboard(text) {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API není dostupné.');
    await navigator.clipboard.writeText(text);
  }

  function promoLabel(result) {
    if (!result.promo) return '';
    return result.priceType === 4 ? 'S AlzaPlus+' : result.coupon
      ? 'S kódem ' + result.coupon : result.name || 'Akční cena';
  }

  function svgIcon(path, withCenter = false) {
    const namespace = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(namespace, 'svg');
    for (const [key, value] of Object.entries({
      viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', focusable: 'false',
    })) icon.setAttribute(key, value);
    const outline = document.createElementNS(namespace, 'path');
    outline.setAttribute('d', path);
    icon.append(outline);
    if (withCenter) {
      const center = document.createElementNS(namespace, 'circle');
      center.setAttribute('cx', '12');
      center.setAttribute('cy', '12');
      center.setAttribute('r', '3');
      icon.append(center);
    }
    return icon;
  }

  // Hlídač shopů is injected after the page loads; re-mount as soon as a sibling appears.
  let mountFrame = 0;
  const mountObserver = new MutationObserver(() => {
    if (mountFrame) return;
    mountFrame = requestAnimationFrame(() => { mountFrame = 0; if (panel) mount(panel.host); });
  });

  // The gallery can render after the panel; retry briefly until the photo strip exists.
  let stripRetries = 0;
  let stripTimer = 0;

  function mount(host) {
    place(host);
    clearTimeout(stripTimer);
    if (belowPhoto && !mobile && !photoStrip() && stripRetries++ < 12) {
      stripTimer = setTimeout(() => { if (panel) mount(panel.host); }, 250);
    }
    mountObserver.disconnect();
    if (host.parentNode) mountObserver.observe(host.parentNode, { childList: true });
  }

  // Alza's gallery classes are generated, so anchor on the stable #detailPicture wrapper.
  function photoStrip() {
    return document.querySelector('#detailPicture');
  }

  function place(host) {
    // Hlídačshopů's content lives in a closed shadow root; use its outer host.
    const tracker = document.querySelector('[data-hs], #hlidacShopu');
    // Desktop only: offered whenever the photo strip is on the page.
    const strip = mobile ? null : photoStrip();
    if (belowPhotoOption) belowPhotoOption.hidden = !strip;
    if (strip && belowPhoto) {
      host.style.margin = '12px 0';
      host.style.order = '';
      if (strip.nextElementSibling !== host) strip.after(host);
      return;
    }
    host.style.margin = mobile ? '0' : '0 0 12px';
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
      :host{--row-h:28px;text-align:left;display:block;clear:both;font:13px "IBM Plex Sans Var",system-ui,sans-serif;color:#000;line-height:1.4;font-kerning:normal;font-variant-numeric:lining-nums;-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision}
      :host([hidden]),[hidden]{display:none!important}
      *{box-sizing:border-box;font-family:inherit}
      .sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
      section{background:#fff;border:1px solid #e8e8e8;border-radius:14px;padding:8px}

      /* Table */
      table{border-collapse:collapse;table-layout:fixed;width:100%;margin:0}
      th:first-child{width:38%}th:nth-child(2){width:36%}th:last-child{width:26%}
      th,td{text-align:left;vertical-align:top;padding:10px 8px;border-bottom:1px solid #e8e8e8}
      th{font-size:14px;font-weight:500;color:#6b6b6b}
      thead th{padding-top:4px}
      td:nth-child(2){font-size:16px;font-weight:700;color:#ca0505;overflow-wrap:anywhere}
      tbody tr:last-child td{border-bottom:0}
      tbody td:nth-child(2){line-height:var(--row-h)}
      tfoot td{vertical-align:baseline;border-bottom:0;border-top:1px solid #e8e8e8;padding-top:14px;padding-bottom:8px;color:#6b6b6b;font-size:14px}
      tfoot td:nth-child(2){color:#6b6b6b;font-size:16px;font-weight:700}
      .discount{white-space:nowrap}
      .discount-value{display:inline-flex;align-items:center;justify-content:center;height:var(--row-h);min-width:5em;font-variant-numeric:tabular-nums;padding:0 8px;border-radius:4px;background:#5dbd2f;color:#fff;font-size:15px;font-weight:700}
      .th-note{display:block;margin-top:2px;font-size:12px;font-weight:400}
      .shared-promo .promo-label{display:none}
      .promo-label{display:block;margin-top:5px;font-size:12px;font-weight:400;color:#6b6b6b;line-height:1.4}

      /* Tier badges */
      .tier-badge{display:inline-flex;align-items:center;height:var(--row-h);padding:0 10px;border-radius:4px;font-size:14px;font-weight:600;line-height:1.2;text-transform:uppercase;background:#c2c2c2;color:#171717}
      .tier-gold{background:#ffd500;color:#171717}
      .tier-silver{background:#c2c2c2;color:#171717}
      .tier-bronze{background:#d2822d;color:#fff}
      .tier-isic{background:#3cba9c;color:#fff}
      .tier-regular{background:#f0f0f0;color:#606060}

      /* Footer and buttons */
      .credit{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;padding:0 8px 2px;font-size:12px;color:#6b6b6b}
      section:has(table:not([hidden]) tfoot tr:not([hidden])) .credit{margin-top:2px}
      .footer-buttons{display:flex;gap:6px;flex-shrink:0}
      .gear{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid #e8e8e8;border-radius:8px;background:#fff;color:#6b6b6b;font-size:20px;cursor:pointer}
      .gear:hover,.gear[aria-expanded="true"]{background:#f5f5f5;color:#000}
      .gear.done{background:#e9f7e1;border-color:#5dbd2f;color:#2f7a12}
      .gear.failed{border-color:#ca0505;color:#ca0505}
      .gear:focus-visible,input:focus-visible,.settings-info a:focus-visible{outline:2px solid #545fef;outline-offset:2px}
      .price-notice{flex:1;color:#606060;font-size:13px}
      .equal-prices .credit{margin-top:0;padding:0 4px;justify-content:flex-start}
      .equal-prices .gear{flex-shrink:0}

      /* Settings */
      .settings{display:grid;gap:16px;padding:0 8px 12px;margin-top:8px}
      .settings label{display:flex;gap:7px;align-items:center;min-height:30px;cursor:pointer}
      .settings input{accent-color:#545fef;width:16px;height:16px;margin:0}
      .settings fieldset{width:100%;min-width:0;margin:0;padding:0;border:0}
      .settings legend{padding:0;margin-bottom:8px;color:#606060;font-size:12px;font-weight:600}
      .settings-options{display:grid;width:100%;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 16px}
      .view-options{grid-template-columns:minmax(0,1fr)}
      .option-row{display:flex;align-items:center;gap:8px}
      .help{flex-shrink:0;width:22px;height:22px;padding:0;border:1px solid #e8e8e8;border-radius:50%;background:#fff;color:#6b6b6b;font-size:12px;font-weight:600;line-height:1;cursor:pointer}
      .help:hover,.help[aria-expanded="true"]{background:#f5f5f5;color:#000}
      .help:focus-visible{outline:2px solid #545fef;outline-offset:2px}
      .hint{margin:2px 0 8px 23px;color:#606060;font-size:12px;line-height:1.5;text-align:left;text-wrap:pretty}
      .settings-actions{padding-top:12px!important;border-top:1px solid #e8e8e8!important}
      .settings-info{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 16px;padding-top:12px;border-top:1px solid #e8e8e8;color:#6b6b6b;font-size:12px}
      .settings-info a{color:inherit;text-decoration:underline;text-underline-offset:2px}
      .settings-only{border:0;padding:0}
      .settings-only .credit{margin-top:0;justify-content:flex-end}

      @media(max-width:420px){
        section{padding:6px}
        th,td{padding:10px 6px}
        th{font-size:13px}
        .gear{width:40px;height:40px}
        :host{--row-h:26px}
        .tier-badge{padding:0 7px;font-size:12px}
        .discount-value{padding:0 6px;font-size:13px}
        .promo-label{font-size:11px;overflow-wrap:anywhere}
        .settings-options{column-gap:8px}
        .settings label{gap:5px;font-size:12px}
        .settings input{flex-shrink:0}
      }
    `, shadow);
    const section = node('section', null, shadow);
    section.id = 'price-table';
    section.setAttribute('aria-label', 'Ceny ceníků: ' + TIERS.map(tier => tier.name).join(', '));
    // One shared live region announces the result instead of every price cell.
    const status = node('div', null, section);
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    const table = node('table', null, section);
    const heading = node('tr', null, node('thead', null, table));
    node('th', 'Ceník', heading).scope = 'col';
    const priceHeader = node('th', 'Cena', heading);
    priceHeader.scope = 'col';
    // Shown instead of the per-row labels when every visible row has the same promo.
    const priceNote = node('span', null, priceHeader);
    priceNote.className = 'th-note';
    priceNote.hidden = true;
    node('th', 'Sleva', heading).scope = 'col';
    const tbody = node('tbody', null, table);
    const rows = TIERS.map(tier => {
      const tr = node('tr', null, tbody);
      const label = node('td', null, tr);
      const badge = node('div', tier.name.toUpperCase(), label);
      badge.className = 'tier-badge tier-' + (tier.badge || tier.name.toLowerCase());
      const price = node('td', '—', tr);
      const discount = node('td', '—', tr);
      discount.className = 'discount';
      return { tier, price, discount, tr, badge, displayName: tier.name.toUpperCase() };
    });
    const originalRow = node('tr', null, node('tfoot', null, table));
    originalRow.hidden = true;
    node('td', 'Původní cena', originalRow);
    const originalPrice = node('s', null, node('td', null, originalRow));
    node('td', '', originalRow);
    const footer = node('footer', null, section);
    footer.className = 'credit';
    const buttons = node('div', null, footer);
    buttons.className = 'footer-buttons';
    const gear = node('button', null, buttons);
    gear.append(svgIcon('M19.42 9.59L21.85 10.26L21.85 13.74L19.42 14.41L18.95 15.54L20.19 17.74L17.74 20.19L15.54 18.95L14.41 19.42L13.74 21.85L10.26 21.85L9.59 19.42L8.46 18.95L6.26 20.19L3.81 17.74L5.05 15.54L4.58 14.41L2.15 13.74L2.15 10.26L4.58 9.59L5.05 8.46L3.81 6.26L6.26 3.81L8.46 5.05L9.59 4.58L10.26 2.15L13.74 2.15L14.41 4.58L15.54 5.05L17.74 3.81L20.19 6.26L18.95 8.46Z', true));
    gear.className = 'gear';
    gear.type = 'button';
    gear.title = 'Nastavení ceníků';
    gear.setAttribute('aria-label', 'Nastavení ceníků');
    gear.setAttribute('aria-expanded', 'false');
    const copy = node('button', null, buttons);
    copy.className = 'gear';
    copy.type = 'button';
    copy.title = 'Kopírovat nabídku';
    copy.setAttribute('aria-label', 'Kopírovat nabídku');
    copy.hidden = true;
    copy.append(svgIcon('M8 8H20V21H8Z M16 8V3H3V16H8'));
    const notice = node('span', 'Všechny ceníky mají stejnou cenu', footer);
    notice.className = 'price-notice';
    notice.hidden = true;
    const credit = node('span', 'Vytvořil Dexnis', footer);
    const settings = node('div', null, section);
    settings.className = 'settings';
    settings.id = 'price-tier-settings';
    settings.hidden = true;
    gear.setAttribute('aria-controls', settings.id);
    const state = { host, rows, table, section, status, priceNote, credit, notice, settings, copy, originalRow, originalPrice, originalAmount: null, loaded: false };
    let copyReset = 0;
    function setCopyState(label, className) {
      copy.className = className ? 'gear ' + className : 'gear';
      copy.title = label;
      copy.setAttribute('aria-label', label);
    }
    function resetCopy() {
      clearTimeout(copyReset);
      setCopyState('Kopírovat nabídku');
    }
    function showCopyState(label, className) {
      clearTimeout(copyReset);
      setCopyState(label, className);
      copyReset = setTimeout(resetCopy, 2000);
    }
    state.resetCopy = resetCopy;
    copy.onclick = async () => {
      try {
        const visible = visibleRows(rows);
        if (!state.commonPrice && (table.hidden || !visible.length)) return;
        const title = document.querySelector('h1')?.textContent.trim() || 'Produkt Alza';
        const lines = ['**' + title + '**', ''];
        if (state.commonPrice) {
          const result = state.commonPrice;
          const discounted = result.discountPercent > 0;
          lines.push('**' + (discounted ? 'Cena po slevě: ' : 'Cena: ') + formatPrice(result.amount) + '**'
            + (discounted ? ' (' + formatDiscount(result.discountPercent) + ')' : ''));
          if (result.promo) lines.push('- ' + promoLabel(result));
        } else {
          const labels = visible.map(row => promoLabel(row.result));
          const sharedPromo = labels[0] && labels.every(label => label === labels[0]) ? labels[0] : '';
          for (const [index, row] of visible.entries()) {
            const result = row.result;
            const discount = formatDiscount(result.discountPercent);
            lines.push(row.displayName + ': **' + formatPrice(row.amount) + '**' + (discount ? ' (' + discount + ')' : ''));
            if (!sharedPromo && labels[index]) lines.push('- ' + labels[index]);
          }
          if (sharedPromo) lines.push('', '- ' + sharedPromo);
        }
        if (state.originalAmount !== null) {
          lines.push('', 'Původní cena: ~~' + formatPrice(state.originalAmount) + '~~');
        }
        const url = new URL(location.href);
        const variant = url.searchParams.get('dq');
        url.search = '';
        if (variant !== null) url.searchParams.set('dq', variant);
        url.hash = '';
        lines.push('', 'Odkaz ➤ ' + url.href);
        const text = lines.join('\n');
        await writeClipboard(text);
        showCopyState('Zkopírováno', 'done');
      } catch (error) {
        showCopyState('Kopírování selhalo — zkus to znovu', 'failed');
        console.warn('[Alza Benefit Prices] Kopírování: ' + error.message);
      } finally { copy.focus({ preventScroll: true }); }
    };
    gear.onclick = () => {
      settings.hidden = !settings.hidden;
      gear.setAttribute('aria-expanded', String(!settings.hidden));
      section.classList.toggle('settings-only', table.hidden && settings.hidden && notice.hidden);
    };
    const tierSettings = node('fieldset', null, settings);
    tierSettings.className = 'settings-actions';
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
        scheduleLoad(id, state);
      };
    }
    const actionSettings = node('fieldset', null, settings);
    actionSettings.className = 'settings-actions';
    node('legend', 'Akce', actionSettings);
    const actionOptions = node('div', null, actionSettings);
    actionOptions.className = 'settings-options';
    function actionCheckbox(labelText, checked, key, update) {
      const label = node('label', null, actionOptions);
      const checkbox = node('input', null, label);
      checkbox.type = 'checkbox';
      checkbox.checked = checked;
      node('span', labelText, label);
      checkbox.onchange = () => {
        update(checkbox.checked);
        saveSetting(key, checkbox.checked);
        scheduleLoad(id, state);
      };
    }
    actionCheckbox('AlzaPlus+', alzaPlusPromos, 'alza-plus-promos', value => { alzaPlusPromos = value; });
    actionCheckbox('Cashback', cashbackPromos, 'cashback-price-promos', value => { cashbackPromos = value; });
    actionCheckbox('Výkup', tradeInPromos, 'trade-in-promos', value => { tradeInPromos = value; });
    const viewSettings = node('fieldset', null, settings);
    viewSettings.className = 'settings-actions';
    node('legend', 'Zobrazení', viewSettings);
    const viewOptions = node('div', null, viewSettings);
    viewOptions.className = 'settings-options view-options';
    // A checkbox with a "?" button that unfolds a longer description.
    function viewOption(text, hint, checked, update) {
      const option = node('div', null, viewOptions);
      option.className = 'option';
      const row = node('div', null, option);
      row.className = 'option-row';
      const label = node('label', null, row);
      const box = node('input', null, label);
      box.type = 'checkbox';
      box.checked = checked;
      box.onchange = () => update(box.checked);
      node('span', text, label);
      const help = node('button', '?', row);
      help.className = 'help';
      help.type = 'button';
      help.title = 'Co to dělá';
      help.setAttribute('aria-label', 'Co dělá volba: ' + text);
      help.setAttribute('aria-expanded', 'false');
      const note = node('p', hint, option);
      note.className = 'hint';
      note.id = 'hint-' + viewOptions.children.length;
      note.hidden = true;
      help.setAttribute('aria-controls', note.id);
      help.onclick = () => {
        note.hidden = !note.hidden;
        help.setAttribute('aria-expanded', String(!note.hidden));
      };
      return option;
    }
    viewOption('Zobrazit všechny ceníky',
      'Ukáže všechny Vaše zapnuté ceníky, i když mají stejnou cenu nebo nejsou levnější než běžná cena. Jinak se takové ceníky skryjí.',
      alwaysShow, value => {
        alwaysShow = value;
        saveSetting('always-show-tiers', value);
        scheduleLoad(id, state);
      });
    belowPhotoOption = viewOption('Přesunout ceník doleva',
      'Přesune ceník z pravého sloupce pod miniatury fotek vlevo.',
      belowPhoto, value => {
        belowPhoto = value;
        saveSetting('panel-below-photo', value);
        mount(host);
      });
    belowPhotoOption.hidden = true;
    const info = node('div', null, settings);
    info.className = 'settings-info';
    const version = (typeof GM_info !== 'undefined' && GM_info?.script?.version)
      || (typeof GM !== 'undefined' && GM.info?.script?.version) || '';
    node('span', version ? 'Verze ' + version : 'Alza Benefit Prices', info);
    const sourceLink = node('a', 'Zdrojový kód', info);
    sourceLink.href = 'https://github.com/dexnis-dev/Alza-Benefit-Prices/';
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    mount(host);
    return state;
  }

  // Several quick toggles trigger a single reload.
  let reloadTimer = 0;
  function scheduleLoad(id, state) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { if (state === panel) void load(id, state); }, 250);
  }

  async function load(id, state) {
    cancel();
    const run = generation;
    state.host.hidden = !state.loaded;
    state.table.hidden = true;
    state.copy.hidden = true;
    state.resetCopy();
    state.status.textContent = '';
    state.section.setAttribute('aria-busy', 'true');
    state.commonPrice = null;
    state.originalRow.hidden = true;
    state.originalAmount = null;
    state.rows.forEach(row => { row.tr.hidden = true; row.valid = false; row.result = null; row.amount = null; row.comparisonAmount = null; row.price.className = ''; row.discount.textContent = '—'; row.price.textContent = 'Načítání…'; });
    async function loadRow(row) {
      try {
        const url = apiUrl(id, row.tier);
        let cached = cache.get(url);
        if (!cached || Date.now() - cached.time >= CACHE_TTL) {
          const response = await request(url);
          if (run !== generation) return;
          if (response.responseText.length > 2 * 1024 * 1024) throw new Error('Odpověď API je příliš velká.');
          if (response.status === 403) throw new Error('HTTP 403: přístup blokován.');
          if (response.status < 200 || response.status >= 300) throw new Error('API vrátilo HTTP ' + response.status + '.');
          if (response.finalUrl && new URL(response.finalUrl).hostname !== 'webapi.alza.cz') throw new Error('API přesměrovalo na jinou doménu.');
          try { cached = { data: JSON.parse(response.responseText), time: Date.now() }; }
          catch { throw new Error('Cena v odpovědi nenalezena.'); }
          cache.set(url, cached);
          if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        }
        if (run !== generation) return;
        let result = extractPrice(cached.data, row.tier.reference);
        if (!result) throw new Error('Cena v odpovědi nenalezena.');
        // Check equality even when a standard priceGroupType hides the row.
        const comparison = result.hidden ? extractPrice(cached.data, true) : result;
        row.comparisonAmount = comparison?.amount ?? null;
        // With "always show", a tier without its own price falls back to the standard one.
        if (result.hidden && alwaysShow && comparison) result = comparison;
        if (result.hidden) {
          row.tr.hidden = true;
          return;
        }
        row.price.textContent = result.price;
        row.discount.textContent = '—';
        if (result.discountPercent !== null) {
          row.discount.textContent = '';
          node('span', formatDiscount(result.discountPercent), row.discount).className = 'discount-value';
        }
        if (result.promo) {
          const label = node('span', promoLabel(result), row.price);
          label.className = 'promo-label';
        }
        row.amount = result.amount;
        row.result = result;
        row.valid = true;
        row.tr.hidden = false;
      } catch (error) {
        if (run !== generation) return;
        row.tr.hidden = true;
        console.warn('[Alza Benefit Prices] ' + row.tier.name + ': ' + error.message);
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
      const sorted = visibleRows(state.rows);
      for (const row of sorted) row.tr.parentNode.append(row.tr);
      const compared = state.rows.filter(row => row.tier.reference || enabled[row.tier.name]);
      const equalPrices = compared.length > 1 && compared.every(row =>
        row.comparisonAmount !== null && row.comparisonAmount === compared[0].comparisonAmount);
      const showNotice = equalPrices && !alwaysShow;
      const hasPrices = !showNotice && sorted.length > 0;
      state.commonPrice = showNotice && basic?.valid ? basic.result : null;
      const bases = sorted.map(row => row.result.discountBaseAmount).filter(amount => amount !== null);
      const originalAmount = basic?.valid ? basic.result.discountBaseAmount ?? basic.amount
        : bases.length && bases.every(amount => amount === bases[0]) ? bases[0] : null;
      state.originalAmount = (hasPrices || state.commonPrice) && originalAmount !== null
        && (state.commonPrice ? state.commonPrice.amount < originalAmount : sorted.some(row => row.amount < originalAmount))
        ? originalAmount : null;
      state.originalRow.hidden = state.originalAmount === null;
      state.originalPrice.textContent = state.originalAmount === null ? ''
        : formatPanelPrice(state.originalAmount);
      const labels = sorted.map(row => promoLabel(row.result));
      const sharedPromo = hasPrices && labels.length > 1 && labels[0] && labels.every(label => label === labels[0]) ? labels[0] : '';
      state.priceNote.textContent = sharedPromo;
      state.priceNote.hidden = !sharedPromo;
      state.section.classList.toggle('shared-promo', Boolean(sharedPromo));
      state.table.hidden = !hasPrices;
      state.copy.hidden = !hasPrices && !state.commonPrice;
      state.credit.hidden = !hasPrices;
      state.notice.hidden = !showNotice;
      state.section.classList.toggle('equal-prices', showNotice);
      state.section.classList.toggle('settings-only', !hasPrices && !showNotice && state.settings.hidden);
      state.status.textContent = showNotice ? state.notice.textContent
        : hasPrices ? 'Ceny načteny: ' + sorted.map(row => row.displayName + ' ' + formatPrice(row.amount)).join(', ') : '';
      state.section.setAttribute('aria-busy', 'false');
      state.loaded = true;
      state.host.hidden = false;
    }
  }

  function filterRows(rows) {
    const basic = rows.find(row => row.tier.reference);
    for (const row of rows) {
      row.displayName = row.tier.name.toUpperCase();
      if (row.badge) row.badge.textContent = row.displayName;
      if (alwaysShow) { row.tr.hidden = !(row.valid && enabled[row.tier.name]); continue; }
      let visible = row.valid && enabled[row.tier.name];
      if (['Gold', 'Silver', 'Bronze', 'ISIC'].includes(row.tier.name)) {
        visible = visible && basic?.valid && row.amount < basic.amount;
      }
      if (row.tier.reference) visible = visible && row.result?.discountPercent > 0;
      row.tr.hidden = !visible;
    }
    if (alwaysShow) return;
    const bronze = rows.find(row => row.tier.name === 'Bronze');
    const b2b = rows.find(row => row.tier.name === 'B2B');
    if (b2b && bronze?.valid && !bronze.tr.hidden && bronze.amount === b2b.amount) b2b.tr.hidden = true;
    const isic = rows.find(row => row.tier.name === 'ISIC');
    const silver = rows.find(row => row.tier.name === 'Silver');
    if (isic?.valid && silver?.valid && !silver.tr.hidden && isic.amount === silver.amount) {
      isic.tr.hidden = true;
    }
    const compared = rows.filter(row => !row.tier.reference && enabled[row.tier.name]);
    const distinct = compared.filter(row => row.comparisonAmount !== basic?.amount);
    if (basic?.valid && compared.length > 1 && compared.every(row => row.comparisonAmount !== null)
      && distinct.length === 1 && !distinct[0].tr.hidden) {
      basic.displayName = 'OSTATNÍ';
      if (basic.badge) basic.badge.textContent = basic.displayName;
      basic.tr.hidden = false;
      // OSTATNÍ already stands for every tier priced like BASIC.
      for (const row of compared) if (row.valid && row.amount === basic.amount) row.tr.hidden = true;
    }
    // Keep BASIC only when there is another visible price to compare with it.
    if (basic && !rows.some(row => !row.tier.reference && !row.tr.hidden)) basic.tr.hidden = true;
  }

  function sync() {
    const id = productId(location.pathname, location.search);
    if (id !== activeId) {
      cancel();
      clearTimeout(reloadTimer);
      mountObserver.disconnect();
      panel?.host.remove(); panel = null; activeId = id;
      stripRetries = 0;
      clearTimeout(stripTimer);
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
  // Navigation events (currententrychange) and the mount observer react at once; the slow timer is a safety net
  // for browsers without the Navigation API and for a re-rendered container.
  window.navigation?.addEventListener?.('currententrychange', sync);
  window.addEventListener('popstate', sync);
  const timer = setInterval(() => { if (!document.hidden) sync(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { clearInterval(timer); cancel(); }
  });
})().catch(error => console.error('[Alza Benefit Prices] Spuštění: ' + error.message));
