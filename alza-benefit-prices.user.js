// ==UserScript==
// @name         Alza Benefit Prices
// @icon         https://www.alza.cz/favicon-alza.ico
// @author       Dexnis
// @namespace    alza-benefit-prices
// @version      1.4.1
// @updateURL    https://raw.githubusercontent.com/dexnis-dev/Alza-Benefit-Prices/main/alza-benefit-prices.user.js
// @downloadURL  https://raw.githubusercontent.com/dexnis-dev/Alza-Benefit-Prices/main/alza-benefit-prices.user.js
// @description  Userscript for Alza.cz, Alza.sk, Alza.hu, Alza.de and Alza.at that shows the prices of the Gold, Silver, ISIC, Bronze, B2B and Basic price lists
// @description:cs  Userscript pro Alza.cz, Alza.sk, Alza.hu, Alza.de a Alza.at, který zobrazuje ceny ceníků Gold, Silver, ISIC, Bronze, B2B a Basic
// @description:sk  Userscript pre Alza.cz, Alza.sk, Alza.hu, Alza.de a Alza.at, ktorý zobrazuje ceny cenníkov Gold, Silver, ISIC, Bronze, B2B a Basic
// @description:hu  Userscript az Alza.cz, Alza.sk, Alza.hu, Alza.de és Alza.at oldalakhoz, amely megjeleníti a Gold, Silver, ISIC, Bronze, B2B és Basic árlisták árait
// @description:de  Userscript für Alza.cz, Alza.sk, Alza.hu, Alza.de und Alza.at, das die Preise der Preislisten Gold, Silver, ISIC, Bronze, B2B und Basic anzeigt
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
// @match        https://www.alza.hu/*-d*.htm*
// @match        https://www.alza.hu/*?*dq=*
// @match        https://alza.hu/*-d*.htm*
// @match        https://alza.hu/*?*dq=*
// @match        https://m.alza.hu/*-d*.htm*
// @match        https://m.alza.hu/*?*dq=*
// @match        https://www.alza.de/*-d*.htm*
// @match        https://www.alza.de/*?*dq=*
// @match        https://alza.de/*-d*.htm*
// @match        https://alza.de/*?*dq=*
// @match        https://m.alza.de/*-d*.htm*
// @match        https://m.alza.de/*?*dq=*
// @match        https://www.alza.at/*-d*.htm*
// @match        https://www.alza.at/*?*dq=*
// @match        https://alza.at/*-d*.htm*
// @match        https://alza.at/*?*dq=*
// @match        https://m.alza.at/*-d*.htm*
// @match        https://m.alza.at/*?*dq=*
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

  // The shop by its domain; the price API is always webapi.alza.cz and takes the country as a parameter.
  const country = /(?:^|\.)alza\.sk$/i.test(location.hostname) ? 'SK'
    : /(?:^|\.)alza\.hu$/i.test(location.hostname) ? 'HU'
    : /(?:^|\.)alza\.de$/i.test(location.hostname) ? 'DE'
    : /(?:^|\.)alza\.at$/i.test(location.hostname) ? 'AT' : 'CZ';
  const locale = { SK: 'sk-SK', HU: 'hu-HU', DE: 'de-DE', AT: 'de-AT', CZ: 'cs-CZ' }[country];
  const euro = ['SK', 'DE', 'AT'].includes(country); // prices in euro, with cents
  const hasTracker = country === 'CZ' || country === 'SK';
  const hasIsic = !['HU', 'AT'].includes(country); // these shops have no ISIC price list
  const discountFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const priceFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  // Euro cents always have two digits, as on Alza.sk: "54,90 €", not "54,9 €".
  const centsFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mobile = /^m\.alza\.(?:cz|sk|hu|de|at)$/i.test(location.hostname);

  // Texts shown to the user (panel, copied offer), one dictionary per language. Console messages are in
  // English only and live in LOG.
  const TEXTS = {
    cs: {
      others: 'OSTATNÍ',
      pricesWith: 'Ceny s ',
      priceWith: 'Cena s ',
      prices: 'Ceny ',
      price: 'Cena ',
      withWord: 'S ',
      withCode: 'S kódem {code}',
      promoDefault: 'Akční cena',
      tableLabel: 'Ceny ceníků: ',
      thTier: 'Ceník',
      thPrice: 'Cena',
      thDiscount: 'Sleva',
      originalPrice: 'Původní cena',
      settingsTitle: 'Nastavení ceníků',
      copyOffer: 'Kopírovat nabídku',
      equalNotice: 'Všechny ceníky mají stejnou cenu',
      loadError: 'Ceny se nepodařilo načíst.',
      retry: 'Zkusit znovu',
      createdBy: 'Vytvořil ',
      productFallback: 'Produkt Alza',
      originalColon: 'Původní cena: ',
      link: 'Odkaz ➤ ',
      copied: 'Zkopírováno',
      copyFailedTitle: 'Kopírování selhalo — zkus to znovu',
      groupTiers: 'Ceníky',
      groupPromos: 'Akce',
      tradeIn: 'Výkup',
      groupView: 'Zobrazení',
      helpAbout: 'Co dělá volba: ',
      optAlways: 'Vždy zobrazit ceníky',
      optAlwaysHint: 'Zobrazí zapnuté ceníky i bez slevy nebo při shodných cenách.',
      optLeft: 'Přesunout ceník doleva',
      optLeftHint: 'Přesune ceník z pravého sloupce pod miniatury fotek vlevo.',
      optTrackerLeft: 'Přesunout Hlídač shopů doleva',
      optTrackerLeftHint: 'Přesune Hlídač shopů z pravého sloupce pod miniatury fotek vlevo.',
      clear: 'Smazat',
      clearAffiliate: 'Smazat affiliate ID',
      whatIsAffiliate: 'Co je affiliate ID?',
      affiliateHint: 'Číslo partnera, které se přidá do kopírovaného odkazu jako ?idp=číslo.',
      version: 'Verze ',
      sourceCode: 'Zdrojový kód',
      loading: 'Načítání…',
      pricesLoaded: 'Ceny načteny: ',
    },
    sk: {
      others: 'OSTATNÉ',
      pricesWith: 'Ceny s ',
      priceWith: 'Cena s ',
      prices: 'Ceny ',
      price: 'Cena ',
      withWord: 'S ',
      withCode: 'S kódom {code}',
      promoDefault: 'Akčná cena',
      tableLabel: 'Ceny cenníkov: ',
      thTier: 'Cenník',
      thPrice: 'Cena',
      thDiscount: 'Zľava',
      originalPrice: 'Pôvodná cena',
      settingsTitle: 'Nastavenie cenníkov',
      copyOffer: 'Kopírovať ponuku',
      equalNotice: 'Všetky cenníky majú rovnakú cenu',
      loadError: 'Ceny sa nepodarilo načítať.',
      retry: 'Skúsiť znova',
      createdBy: 'Vytvoril ',
      productFallback: 'Produkt Alza',
      originalColon: 'Pôvodná cena: ',
      link: 'Odkaz ➤ ',
      copied: 'Skopírované',
      copyFailedTitle: 'Kopírovanie zlyhalo — skús to znova',
      groupTiers: 'Cenníky',
      groupPromos: 'Akcie',
      tradeIn: 'Výkup',
      groupView: 'Zobrazenie',
      helpAbout: 'Čo robí voľba: ',
      optAlways: 'Vždy zobraziť cenníky',
      optAlwaysHint: 'Zobrazí zapnuté cenníky aj bez zľavy alebo pri rovnakých cenách.',
      optLeft: 'Presunúť cenník doľava',
      optLeftHint: 'Presunie cenník z pravého stĺpca pod miniatúry fotiek vľavo.',
      optTrackerLeft: 'Presunúť Hlídač shopů pod fotku',
      optTrackerLeftHint: 'Presunie Hlídač shopů pod fotky vľavo. Vypne presunutie cenníka doľava.',
      clear: 'Zmazať',
      clearAffiliate: 'Zmazať affiliate ID',
      whatIsAffiliate: 'Čo je affiliate ID?',
      affiliateHint: 'Číslo partnera, ktoré sa pridá do kopírovaného odkazu ako ?idp=číslo.',
      version: 'Verzia ',
      sourceCode: 'Zdrojový kód',
      loading: 'Načítavam…',
      pricesLoaded: 'Ceny načítané: ',
    },
    en: {
      others: 'OTHERS',
      pricesWith: 'Prices with ',
      priceWith: 'Price with ',
      prices: 'Prices ',
      price: 'Price ',
      withWord: 'With ',
      withCode: 'With code {code}',
      promoDefault: 'Special price',
      tableLabel: 'Prices by price list: ',
      thTier: 'Price list',
      thPrice: 'Price',
      thDiscount: 'Discount',
      originalPrice: 'Original price',
      settingsTitle: 'Price list settings',
      copyOffer: 'Copy offer',
      equalNotice: 'All price lists have the same price',
      loadError: 'The prices could not be loaded.',
      retry: 'Try again',
      createdBy: 'Created by ',
      productFallback: 'Alza product',
      originalColon: 'Original price: ',
      link: 'Link ➤ ',
      copied: 'Copied',
      copyFailedTitle: 'Copying failed — try again',
      groupTiers: 'Price lists',
      groupPromos: 'Promotions',
      tradeIn: 'Trade-in',
      groupView: 'Display',
      helpAbout: 'What the option does: ',
      optAlways: 'Always show price lists',
      optAlwaysHint: 'Always shows your enabled price lists, even when a price list has no discount or all price lists have the same price.',
      optLeft: 'Move the price list to the left',
      optLeftHint: 'Moves the price list from the right column to the left, below the product photo thumbnails.',
      optTrackerLeft: 'Move Hlídač shopů below the photos',
      optTrackerLeftHint: 'Moves Hlídač shopů below the photos on the left. Turns off moving the price panel to the left.',
      clear: 'Clear',
      clearAffiliate: 'Clear affiliate ID',
      whatIsAffiliate: 'What is an affiliate ID?',
      affiliateHint: 'The partner number that is added to the copied link as ?idp=number.',
      version: 'Version ',
      sourceCode: 'Source code',
      loading: 'Loading…',
      pricesLoaded: 'Prices loaded: ',
    },
    de: {
      others: 'SONSTIGE',
      pricesWith: 'Preise mit ',
      priceWith: 'Preis mit ',
      prices: 'Preise ',
      price: 'Preis ',
      withWord: 'Mit ',
      withCode: 'Mit Code {code}',
      promoDefault: 'Aktionspreis',
      tableLabel: 'Preise der Preislisten: ',
      thTier: 'Preisliste',
      thPrice: 'Preis',
      thDiscount: 'Rabatt',
      originalPrice: 'Ursprünglicher Preis',
      settingsTitle: 'Einstellungen der Preislisten',
      copyOffer: 'Angebot kopieren',
      equalNotice: 'Alle Preislisten haben denselben Preis',
      loadError: 'Die Preise konnten nicht geladen werden.',
      retry: 'Erneut versuchen',
      createdBy: 'Erstellt von ',
      productFallback: 'Alza-Produkt',
      originalColon: 'Ursprünglicher Preis: ',
      link: 'Link ➤ ',
      copied: 'Kopiert',
      copyFailedTitle: 'Kopieren fehlgeschlagen — versuche es erneut',
      groupTiers: 'Preislisten',
      groupPromos: 'Aktionen',
      tradeIn: 'Inzahlungnahme',
      groupView: 'Anzeige',
      helpAbout: 'Was die Option bewirkt: ',
      optAlways: 'Preislisten immer anzeigen',
      optAlwaysHint: 'Zeigt deine aktivierten Preislisten immer an, auch wenn eine Preisliste keinen Rabatt hat oder alle Preislisten denselben Preis haben.',
      optLeft: 'Preisliste nach links verschieben',
      optLeftHint: 'Verschiebt die Preisliste aus der rechten Spalte nach links unter die Miniaturen der Produktfotos.',
      optTrackerLeft: 'Hlídač shopů unter die Fotos verschieben',
      optTrackerLeftHint: 'Verschiebt Hlídač shopů links unter die Fotos. Deaktiviert das Verschieben der Preisliste nach links.',
      clear: 'Löschen',
      clearAffiliate: 'Affiliate-ID löschen',
      whatIsAffiliate: 'Was ist eine Affiliate-ID?',
      affiliateHint: 'Die Partnernummer, die dem kopierten Link als ?idp=Nummer hinzugefügt wird.',
      version: 'Version ',
      sourceCode: 'Quellcode',
      loading: 'Wird geladen…',
      pricesLoaded: 'Preise geladen: ',
    },
    hu: {
      others: 'EGYÉB',
      pricesWith: 'Árak – ',
      priceWith: 'Ár – ',
      prices: 'Árak ',
      price: 'Ár ',
      withWord: '',
      withCode: '{code} kuponkóddal',
      promoDefault: 'Akciós ár',
      tableLabel: 'Az árlisták árai: ',
      thTier: 'Árlista',
      thPrice: 'Ár',
      thDiscount: 'Kedvezmény',
      originalPrice: 'Eredeti ár',
      settingsTitle: 'Az árlisták beállításai',
      copyOffer: 'Ajánlat másolása',
      equalNotice: 'Minden árlistának ugyanaz az ára',
      loadError: 'Az árakat nem sikerült betölteni.',
      retry: 'Újrapróbálás',
      createdBy: 'Készítette: ',
      productFallback: 'Alza-termék',
      originalColon: 'Eredeti ár: ',
      link: 'Link ➤ ',
      copied: 'Másolva',
      copyFailedTitle: 'A másolás nem sikerült — próbáld újra',
      groupTiers: 'Árlisták',
      groupPromos: 'Akciók',
      tradeIn: 'Beszámítás',
      groupView: 'Megjelenítés',
      helpAbout: 'Mit csinál a beállítás: ',
      optAlways: 'Árlisták mindig megjelenítése',
      optAlwaysHint: 'A bekapcsolt árlistákat mindig megjeleníti, akkor is, ha egy árlistának nincs kedvezménye, vagy minden árlistának ugyanaz az ára.',
      optLeft: 'Árlista áthelyezése balra',
      optLeftHint: 'Az árlistát a jobb oszlopból balra, a termékfotók bélyegképei alá helyezi át.',
      optTrackerLeft: 'A Hlídač shopů áthelyezése a képek alá',
      optTrackerLeftHint: 'A Hlídač shopů paneljét balra, a képek alá helyezi. Kikapcsolja az árlista balra helyezését.',
      clear: 'Törlés',
      clearAffiliate: 'Partnerazonosító törlése',
      whatIsAffiliate: 'Mi az a partnerazonosító?',
      affiliateHint: 'A partnerszám, amely ?idp=szám formában kerül a másolt linkhez.',
      version: 'Verzió ',
      sourceCode: 'Forráskód',
      loading: 'Betöltés…',
      pricesLoaded: 'Árak betöltve: ',
    },
  };
  // Console messages (always English).
  const LOG = {
    noStorage: 'The extension does not provide settings storage. Check the script permissions.',
    noStorageWrite: 'The extension does not provide settings storage.',
    logSetting: 'Setting ',
    settingOn: 'set',
    settingOff: 'cleared',
    saveFailed: 'The setting could not be saved: ',
    logVersion: 'Version: ',
    logSettings: 'Settings:',
    cancelled: 'Loading cancelled.',
    requestError: 'The extension could not load the API. Check access to webapi.alza.cz.',
    timeout: 'Alza did not respond within 20 seconds.',
    noRequest: 'The extension does not provide API requests. Check the script permissions.',
    noClipboard: 'Clipboard API is not available.',
    placed: 'Panel placed ',
    placedGift: 'below the gift block',
    placedPhoto: 'below the product photo',
    placedTracker: 'before Hlídač shopů',
    placedModule: 'before the alternative pricing module',
    placedPrice: 'below the main price',
    placedAbovePrice: 'above the main price',
    pageChanged: 'The page changed in the meantime.',
    nothingToCopy: 'No price to copy.',
    copiedLog: 'Copied: ',
    copyFailedLog: 'Copying failed: ',
    staleCache: ': older cache used (',
    tooLarge: 'The API response is too large.',
    blocked: 'HTTP 403: access blocked.',
    apiHttp: 'The API returned HTTP ',
    redirect: 'The API redirected to an unexpected origin.',
    noPrice: 'Price not found in the response.',
    logNoTier: 'Failed: ',
    logLoaded: 'Loaded: ',
    logRendered: 'Rendered: ',
    logLoading: 'Loading prices for ItemID: ',
    logRender: 'Render:',
    isicEstimate: 'ISIC: with cashback the API returns the same price as for Basic, price worked out (ISIC price − cashback): ',
  };
  // The language follows the address: "/EN/" in the path means English in every shop, otherwise the language
  // of the shop (Slovak, Hungarian, German for alza.de and alza.at, Czech). It is read again when the page
  // changes (see sync()).
  function pageLanguage() {
    if (/^\/en(?:\/|$)/i.test(location.pathname)) return 'en';
    return { SK: 'sk', HU: 'hu', DE: 'de', AT: 'de' }[country] || 'cs';
  }
  let activeLanguage = pageLanguage();
  let T = TEXTS[activeLanguage];
  const CACHE_TTL = 5 * 60 * 1000;
  const CACHE_LIMIT = 60;
  // Shared by all panels, so returning to a product reuses its prices.
  const cache = new Map();
  // Shared response parsing without retaining raw response text in the price cache.
  const parsedResponses = new WeakMap();

  // Match Hlídač shopů's plain prefix and expandable Render object.
  // Per-request diagnostics stay at Verbose level; warnings report actual failures.
  const LOG_PREFIX = 'Alza Benefit Prices – ';
  const SCRIPT_VERSION = '1.4.1';
  // Use a fixed format string so a coupon/product containing "%c" cannot style the console.
  const log = (message, ...details) => console.log('%s', LOG_PREFIX + message, ...details);
  const debug = (message, ...details) => console.debug('%s', LOG_PREFIX + message, ...details);
  const warn = (message, ...details) => console.warn('%s', LOG_PREFIX + message, ...details);

  function scriptVersion() {
    return (typeof GM_info !== 'undefined' && GM_info?.script?.version)
      || (typeof GM !== 'undefined' && GM.info?.script?.version) || SCRIPT_VERSION;
  }

  // Safari Userscripts exposes asynchronous GM.* storage APIs.
  async function getSetting(key, fallback) {
    if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') return GM.getValue(key, fallback);
    if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    throw new Error(LOG.noStorage);
  }

  async function setSetting(key, value) {
    if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') return GM.setValue(key, value);
    if (typeof GM_setValue === 'function') return GM_setValue(key, value);
    throw new Error(LOG.noStorageWrite);
  }

  const ALL_TIERS = [
    { name: 'Gold', pgrik: 'p_pg4_e6c95' },
    { name: 'Silver', pgrik: 'p_pg3_36eef' },
    { name: 'ISIC', pgrik: 'p_pg3is1_2b2fc' },
    { name: 'Bronze', pgrik: 'p_pg5_44266' },
    { name: 'B2B', pgrik: 'p_pg6_6ce49' },
    { name: 'Basic', pgrik: 'p__26752', reference: true, badge: 'regular' },
  ];
  // Alza.hu and Alza.at have no ISIC price list, so ISIC is left out there completely (table, settings,
  // copying, requests).
  const TIERS = hasIsic ? ALL_TIERS : ALL_TIERS.filter(tier => tier.name !== 'ISIC');

  // Read only the unified settings; absent/invalid storage uses the defaults below.
  const savedSettings = await getSetting('settings', {});
  const storedSettings = savedSettings && typeof savedSettings === 'object' && !Array.isArray(savedSettings)
    ? savedSettings : {};
  const savedTiers = storedSettings['enabled-price-tiers'] || {};
  const enabled = Object.fromEntries(TIERS.map(tier => [tier.name, savedTiers[tier.name] !== false]));
  let alzaPlusPromos = storedSettings['alza-plus-promos'] !== false;
  let cashbackPromos = storedSettings['cashback-price-promos'] !== false;
  let tradeInPromos = storedSettings['trade-in-promos'] !== false;
  let alwaysShow = storedSettings['always-show-tiers'] === true;
  let trackerBelowPhoto = hasTracker && !mobile && storedSettings['tracker-below-photo'] === true;
  let belowPhoto = storedSettings['panel-below-photo'] === true && !trackerBelowPhoto;
  let belowPhotoOption = null;
  let trackerPhotoOption = null;
  // Affiliate ID added to the copied link as ?idp=<number>; digits only.
  let affiliateId = String(storedSettings['affiliate-idp'] ?? '').replace(/\D/g, '').slice(0, 12);

  let settingWrites = null;
  let pendingSettings = null;
  function saveSetting(key, value) {
    storedSettings[key] = value;
    log(LOG.logSetting + key + ' = ' + (key === 'affiliate-idp' ? (value ? LOG.settingOn : LOG.settingOff) : JSON.stringify(value)));
    pendingSettings = { ...storedSettings, 'enabled-price-tiers': { ...storedSettings['enabled-price-tiers'] } };
    // Coalesce quick changes and serialize writes, including changes made during an async save.
    if (!settingWrites) settingWrites = Promise.resolve().then(async () => {
      while (pendingSettings) {
        const snapshot = pendingSettings;
        pendingSettings = null;
        try { await setSetting('settings', snapshot); }
        catch (error) { warn(LOG.saveFailed + error.message); }
      }
      settingWrites = null;
    });
  }

  log(LOG.logVersion + scriptVersion());
  debug('Environment:', { hostname: location.hostname, country, language: activeLanguage, mobile });
  // Keys are the storage keys of the settings, so the overview is the same in every shop.
  debug(LOG.logSettings, {
    'enabled-price-tiers': { ...enabled }, 'alza-plus-promos': alzaPlusPromos, 'cashback-price-promos': cashbackPromos,
    'trade-in-promos': tradeInPromos, 'always-show-tiers': alwaysShow, 'panel-below-photo': belowPhoto, 'tracker-below-photo': trackerBelowPhoto, 'affiliate-idp': Boolean(affiliateId),
  });
  let activeId = null;
  let generation = 0;
  let panel = null;
  const pending = new Set();
  const inFlight = new Map();

  function productId(pathname, search = '') {
    const variant = new URLSearchParams(search).get('dq');
    if (/^\d+$/.test(variant || '')) return variant;
    return pathname.match(/-d(\d+)(?:\.htm|\/|$)/i)?.[1] || null;
  }

  function apiUrl(id, tier) {
    const url = new URL(`https://webapi.alza.cz/api/commodity/v1/${id}/detailPriceInfoV3`);
    url.search = new URLSearchParams({ country, pgrik: tier.pgrik, ucik: 'null' });
    return url.href;
  }

  // The same API data is read by the table and by the copied offer, so each result is computed once.
  const priceMemo = new WeakMap();
  function extractPrice(data, reference = false, promos = { plus: alzaPlusPromos, cashback: cashbackPromos, tradeIn: tradeInPromos }) {
    if (!data || typeof data !== 'object') return computePrice(data, reference, promos);
    let byKey = priceMemo.get(data);
    if (!byKey) priceMemo.set(data, byKey = new Map());
    const key = (reference ? 8 : 0) | (promos.plus ? 4 : 0) | (promos.cashback ? 2 : 0) | (promos.tradeIn ? 1 : 0);
    if (!byKey.has(key)) byKey.set(key, computePrice(data, reference, promos));
    return byKey.get(key);
  }

  const pricingMemo = new WeakMap();
  function findPricing(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 15) return null;
    if (value.mainPriceTag || Array.isArray(value.promoPrices)) return value;
    for (const child of Object.values(value)) {
      const result = findPricing(child, depth + 1);
      if (result) return result;
    }
    return null;
  }
  function computePrice(data, reference, promos) {
    if (!data || typeof data !== 'object') return null;
    // Discover the pricing object once, even when settings or reference mode change.
    if (!pricingMemo.has(data)) {
      pricingMemo.set(data, (data.data && (data.data.mainPriceTag || Array.isArray(data.data.promoPrices)))
        ? data.data : findPricing(data));
    }
    const pricing = pricingMemo.get(data);
    if (!pricing) return null;
    const main = pricing.mainPriceTag;
    // "Novinka" uses priceType 7 while its priceGroupType can remain zero.
    if (!reference && main?.priceGroupType === 0 && main.priceType !== 7) return { hidden: true };
    function candidate(value, promo = false) {
      if (!value || !['string', 'number'].includes(typeof value.primaryPrice)) return null;
      const price = String(value.primaryPrice).trim();
      let numeric = price.replace(/\s/g, '').replace(/(?:Kč|CZK|€|EUR|Ft|HUF)$/i, '').replace(/[,.][-–—]$/, '');
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
      if (!promos.plus && promo?.priceType === 4) continue;
      if (!promos.cashback && promo?.priceType === 1) continue;
      if (!promos.tradeIn && promo?.priceType === 2) continue;
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
      selected.mainAmount = mainCandidate?.amount ?? null;
    }
    return selected;
  }

  // Share requests between the panel and copied offers. Once copying uses a request,
  // navigation may discard its panel result but must not abort the clipboard's data.
  function request(url, track = true) {
    const existing = inFlight.get(url);
    if (existing) {
      if (!track) existing.keepAlive = true;
      return existing.promise;
    }
    const tracked = { keepAlive: !track };
    let settled = false;
    const promise = new Promise((resolve, reject) => {
      let handle;
      const finish = callback => value => {
        if (settled) return;
        settled = true;
        pending.delete(tracked);
        inFlight.delete(url);
        callback(value);
      };
      const fail = finish(reject);
      tracked.abort = () => {
        if (tracked.keepAlive) return;
        fail(new Error(LOG.cancelled));
        try { handle?.abort?.(); } catch { /* The request may already be finished. */ }
      };
      if (track) pending.add(tracked);
      const succeed = finish(response => resolve({
        status: response.status,
        responseText: typeof response.responseText === 'string' ? response.responseText : String(response.response ?? ''),
        finalUrl: response.finalUrl || response.responseURL || url,
      }));
      const details = {
        method: 'GET', url, timeout: 20000, responseType: 'text',
        headers: { Accept: 'application/json, text/html;q=0.9' },
        onload: succeed,
        onerror: () => fail(new Error(LOG.requestError)),
        ontimeout: () => fail(new Error(LOG.timeout)),
        onabort: () => fail(new Error(LOG.cancelled)),
      };
      try {
        if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
          handle = GM.xmlHttpRequest(details);
        } else if (typeof GM_xmlhttpRequest === 'function') {
          handle = GM_xmlhttpRequest(details);
        } else {
          throw new Error(LOG.noRequest);
        }
        // Userscripts returns an abortable Promise; other managers can use callbacks.
        if (typeof handle?.then === 'function') handle.then(succeed, fail);
      } catch (error) { fail(error); }
    });
    tracked.promise = promise;
    // Some managers/mocks invoke callbacks synchronously.
    if (!settled) inFlight.set(url, tracked);
    return promise;
  }

  function cancel() {
    generation++;
    for (const handle of pending) handle.abort();
    pending.clear();
  }

  function node(tag, text, parent) {
    const item = document.createElement(tag);
    if (text != null) item.textContent = text;
    if (parent) parent.append(item);
    return item;
  }

  function formatPrice(amount) {
    if (euro) return (Number.isInteger(amount) ? priceFormat : centsFormat).format(amount) + ' €';
    if (country === 'HU') return priceFormat.format(amount) + ' Ft';
    return priceFormat.format(amount) + ' Kč';
  }

  // Panel style of Alza's own prices, e.g. "549,-" on alza.cz; other shops keep their currency sign.
  function formatPanelPrice(amount) {
    return country === 'CZ' ? priceFormat.format(amount) + ',-' : formatPrice(amount);
  }

  function formatDiscount(percent) {
    return percent > 0 ? '−' + discountFormat.format(percent) + ' %' : '';
  }

  // Alza's API gives ISIC the very same cashback price as BASIC, so the ISIC discount is lost. When ISIC
  // has a discount of its own and its cashback price equals BASIC's, the price is worked out like for the
  // other tiers: ISIC's own price minus the cashback amount that BASIC gets (its price minus its cashback
  // price). Returns the same object when nothing applies.
  function estimateIsicCashback(isic, basic) {
    const cashback = result => result?.promo && result.priceType === 1;
    if (!cashback(isic) || !cashback(basic) || isic.amount !== basic.amount) return isic;
    if (!(isic.mainAmount > 0 && basic.mainAmount > 0 && isic.mainAmount < basic.mainAmount)) return isic;
    const cashbackAmount = basic.mainAmount - basic.amount;
    const raw = isic.mainAmount - cashbackAmount;
    if (!(cashbackAmount > 0 && raw > 0)) return isic;
    const amount = euro ? Math.round(raw * 100) / 100 : Math.round(raw);
    const base = isic.discountBaseAmount;
    const percent = base > amount ? (base - amount) / base * 100 : null;
    debug(LOG.isicEstimate + formatPrice(amount) + (percent ? ' (' + formatDiscount(percent) + ')' : ''));
    return { ...isic, amount, price: formatPanelPrice(amount), discountPercent: percent, estimated: true };
  }

  // Shared calculations take explicit inputs, never panel visibility settings.
  // The caller chooses promotions and whether to include a tier's standard-price fallback.
  function resolveTierPrice(data, tier, promos, includeStandard = false) {
    const selected = extractPrice(data, tier.reference, promos);
    if (!selected) return null;
    const comparison = selected.hidden ? extractPrice(data, true, promos) : selected;
    if (!comparison) return null;
    return { result: selected.hidden ? (includeStandard ? comparison : null) : selected, comparison };
  }

  function correctIsicPrices(items) {
    const basic = items.find(item => item?.tier.reference);
    const isic = items.find(item => item?.tier.name === 'ISIC');
    if (isic?.result && basic?.result) {
      isic.result = estimateIsicCashback(isic.result, basic.result);
      isic.comparison = isic.result;
    }
  }

  function compareWithBasic(result, basic) {
    if (!basic) return 'basic-unavailable';
    return result.amount < basic.amount ? null
      : result.amount === basic.amount ? 'same-as-basic' : 'higher-than-basic';
  }

  // Both outputs show an original price only when a displayed price is lower.
  // The panel may use BASIC's main price; copied offers use discount bases only.
  function originalPrice(results, basic, useBasicAmount = false) {
    let base = basic?.discountBaseAmount ?? (useBasicAmount ? basic?.amount : null);
    if (base == null) {
      const bases = results.map(result => result.discountBaseAmount).filter(amount => amount != null);
      base = bases.length && bases.every(amount => amount === bases[0]) ? bases[0] : null;
    }
    return base != null && results.some(result => result.amount < base) ? base : null;
  }

  // Equal amounts can require different coupons or conditions; keep those offers separate.
  function samePromotion(left, right) {
    if (Boolean(left.promo) !== Boolean(right.promo)) return false;
    return !left.promo || (left.priceType === right.priceType
      && (left.coupon || '') === (right.coupon || '') && (left.name || '') === (right.name || ''));
  }

  // Tiers share one row only when both the amount and promotion match.
  const TIER_PAIRS = [['ISIC', 'Silver'], ['B2B', 'Bronze']];
  function foldPairs(items, merge) {
    for (const [name, into] of TIER_PAIRS) {
      const source = items.find(item => item.tier.name === name);
      const target = items.find(item => item.tier.name === into);
      if (source && target && source.amount === target.amount && samePromotion(source.result, target.result)) merge(target, source);
    }
  }

  // BASIC stands for all the other tiers (shown as OSTATNÍ) when every one of them has a known price
  // and exactly one differs from BASIC. Used by the table and by the copied offer; returns that tier.
  function onlyDifferent(basicAmount, others, amountOf) {
    if (basicAmount == null || others.length < 2) return null;
    let distinct = null;
    for (const item of others) {
      const amount = amountOf(item);
      if (amount == null) return null;
      if (amount !== basicAmount) {
        if (distinct) return null;
        distinct = item;
      }
    }
    return distinct;
  }

  function visibleRows(rows) {
    return rows.filter(row => row.valid && !row.tr.hidden).sort((a, b) => a.amount - b.amount);
  }

  // The write has to start inside the click: Safari refuses it once the click is "used up" by waiting.
  // ClipboardItem takes the text as a promise, so the write starts at once and gets the text later.
  async function writeClipboard(textPromise) {
    // Observe failures even if clipboard access fails before it can consume the promised text.
    // Awaiting the original promise below still propagates its error to the copy button.
    textPromise.catch(() => {});
    const clipboard = navigator.clipboard;
    if (!clipboard) throw new Error(LOG.noClipboard);
    if (typeof ClipboardItem === 'function' && typeof clipboard.write === 'function') {
      const blobPromise = textPromise.then(text => new Blob([text], { type: 'text/plain' }));
      blobPromise.catch(() => {});
      try {
        await clipboard.write([new ClipboardItem({ 'text/plain': blobPromise })]);
        return;
      } catch { /* Older ClipboardItem without promises: fall back to writeText below. */ }
    }
    if (typeof clipboard.writeText !== 'function') throw new Error(LOG.noClipboard);
    await clipboard.writeText(await textPromise);
  }

  // "S kódem X" -> "Ceny s kódem X" (or "Cena s kódem X" for a single price), "Cena s Cashback" -> "Ceny s Cashback".
  function pricesLabel(label, single = false) {
    if (label.startsWith(T.withWord)) label = (single ? T.priceWith : T.pricesWith) + label.slice(T.withWord.length);
    // Names that Alza sends ("Cena s Cashback") are turned into the same wording.
    return label.replace(/^Cena s /, single ? T.priceWith : T.pricesWith).replace(/^Cena /, single ? T.price : T.prices);
  }

  // One expandable array containing the exact clipboard text, including blank lines.
  function logCopiedOffer(id, text) {
    log(LOG.copiedLog + id, text.split('\n'));
  }

  // The same promotion for the console, which is always English (no translated wording).
  function promoLogLabel(result) {
    if (!result.promo) return '';
    return result.priceType === 4 ? 'AlzaPlus+' : result.coupon ? 'code ' + result.coupon : result.name || 'promotion';
  }

  function promoLabel(result) {
    if (!result.promo) return '';
    return result.priceType === 4 ? T.withWord + 'AlzaPlus+' : result.coupon
      ? T.withCode.replace('{code}', () => result.coupon) : result.name || T.promoDefault;
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

  // Extensions and Alza may insert pricing anchors inside a late-rendered wrapper,
  // outside the panel's immediate parents. Watch the document, but only react to
  // added/removed anchors or the panel itself; ordinary page mutations do no remount.
  const PLACEMENT_ANCHORS = (hasTracker ? '[data-hs], #hlidacShopu, ' : '') + '#detailPicture, '
    + '[data-react-client-component="alternativePricingModule"], '
    + '[data-react-client-component="promoListModule"], '
    + '.js-price-detail__main-price-box-wrapper, [data-testid="price-primary"]';
  let mountFrame = 0;
  const mountObserver = new MutationObserver(records => {
    if (!panel || mountFrame) return;
    const host = panel.host;
    const affectsPlacement = element => element.nodeType === 1 && (
      element === host || element.contains(host) || element.matches(PLACEMENT_ANCHORS)
      || element.querySelector(PLACEMENT_ANCHORS));
    const relevant = records.some(record => {
      if (record.type === 'attributes') return record.target.matches(PLACEMENT_ANCHORS);
      return Array.prototype.some.call(record.addedNodes, affectsPlacement)
        || Array.prototype.some.call(record.removedNodes, affectsPlacement);
    });
    if (!relevant) return;
    // Batch related mutations and synchronize navigation before placing the panel.
    mountFrame = requestAnimationFrame(() => { mountFrame = 0; sync(); });
  });

  // The gallery can render after the panel; retry briefly until the photo strip exists.
  let stripRetries = 0;
  let stripTimer = 0;
  let observedRoot = null;

  function mount(host) {
    place(host);
    clearTimeout(stripTimer);
    if ((belowPhoto || trackerBelowPhoto) && !mobile && !stripAvailable && stripRetries++ < 12) {
      stripTimer = setTimeout(() => { if (panel) mount(panel.host); }, 250);
    }
    if (document.documentElement !== observedRoot) {
      mountObserver.disconnect();
      observedRoot = document.documentElement;
      if (observedRoot) mountObserver.observe(observedRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['id', 'data-react-client-component', 'data-testid', ...(hasTracker ? ['data-hs'] : [])],
      });
    }
  }

  // Alza's gallery classes are generated, so anchor on the stable #detailPicture wrapper.
  function photoStrip() {
    return document.querySelector('#detailPicture');
  }

  // Remembered so that the console says where the panel went only when that changes.
  let lastPlacement = '';
  let stripAvailable = false;
  function placed(where) {
    if (where === lastPlacement) return;
    lastPlacement = where;
    debug(LOG.placed + where + '.');
  }

  // Remember the exact position without touching Hlídač shopů's internal content.
  let trackerHome = null;
  function restoreTracker() {
    const home = trackerHome;
    trackerHome = null;
    if (!home) return;
    if (home.tracker.isConnected) {
      if (home.placeholder.isConnected) home.placeholder.replaceWith(home.tracker);
      else {
        // Alza may replace the original container while the tracker is on the left.
        const pricingModule = document.querySelector('[data-react-client-component="alternativePricingModule"]');
        const price = pricingModule ? null
          : document.querySelector('.js-price-detail__main-price-box-wrapper, [data-testid="price-primary"]');
        const anchor = pricingModule || price?.closest('.price-detail__row, .price-info-row') || price;
        if (anchor && !home.tracker.contains(anchor)) anchor.before(home.tracker);
      }
      home.tracker.style.margin = home.margin;
      home.tracker.style.order = home.order;
    }
    home.placeholder.remove();
  }

  function photoAnchor(strip) {
    const gift = document.querySelector('[data-react-client-component="promoListModule"]');
    return gift && gift.parentNode.contains(strip) && !gift.contains(strip)
      && (strip.compareDocumentPosition(gift) & Node.DOCUMENT_POSITION_FOLLOWING) ? gift : strip;
  }

  function moveTrackerBelowPhoto(tracker, strip) {
    if (trackerHome?.tracker !== tracker) restoreTracker();
    if (!trackerHome) {
      const placeholder = document.createComment('Alza Benefit Prices: original tracker position');
      tracker.before(placeholder);
      trackerHome = { tracker, placeholder, margin: tracker.style.margin, order: tracker.style.order };
    }
    const anchor = photoAnchor(strip);
    tracker.style.margin = '12px 0';
    tracker.style.order = '';
    if (anchor.nextElementSibling !== tracker) anchor.after(tracker);
  }

  function place(host) {
    // Hlídačshopů's content lives in a closed shadow root; use its outer host.
    // Desktop only: offered whenever the photo strip is on the page.
    const strip = mobile ? null : photoStrip();
    stripAvailable = Boolean(strip);
    const tracker = hasTracker ? document.querySelector('[data-hs], #hlidacShopu') : null;
    const canMoveTracker = hasTracker && !mobile && Boolean(tracker && strip);
    if (belowPhotoOption) belowPhotoOption.hidden = !strip;
    if (trackerPhotoOption) trackerPhotoOption.hidden = !canMoveTracker;
    const trackerMoved = canMoveTracker && trackerBelowPhoto;
    if (trackerMoved) moveTrackerBelowPhoto(tracker, strip);
    else restoreTracker();
    if (strip && belowPhoto) {
      host.style.margin = '12px 0';
      host.style.order = '';
      const anchor = photoAnchor(strip);
      if (anchor.nextElementSibling !== host) anchor.after(host);
      placed(anchor === strip ? LOG.placedPhoto : LOG.placedGift);
      return;
    }
    host.style.margin = mobile ? '0' : '0 0 12px';
    const priceTracker = trackerMoved ? null : tracker;
    // Mobile payment options live in a narrower block. Use the whole main-price row
    // instead, sharing the full-width container used by Hlídač shopů.
    const mobilePrice = mobile && !tracker
      ? document.querySelector('.js-price-detail__main-price-box-wrapper, [data-testid="price-primary"]') : null;
    const mobilePriceRow = mobilePrice?.closest('.price-info-row, .price-detail__row') || mobilePrice;
    const before = priceTracker || mobilePriceRow || document.querySelector('[data-react-client-component="alternativePricingModule"]');
    if (before) {
      host.style.order = before.style.order || '';
      if (before.previousElementSibling !== host) before.before(host);
      placed(priceTracker ? LOG.placedTracker : mobilePriceRow ? LOG.placedAbovePrice : LOG.placedModule);
      return;
    }
    const price = document.querySelector('.js-price-detail__main-price-box-wrapper, [data-testid="price-primary"]');
    const after = price?.closest('.price-detail__row') || price;
    if (after && after.nextElementSibling !== host) after.after(host);
    if (after) placed(LOG.placedPrice);
  }

  // Styles of the panel (it lives in a shadow root, so the page's CSS cannot touch it).
  const PANEL_CSS = `
  :host{--row-h:28px;text-align:left;display:block;clear:both;font:13px "IBM Plex Sans Var",system-ui,sans-serif;color:#000;line-height:1.4;font-kerning:normal;font-variant-numeric:lining-nums;-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision}
  :host([hidden]),[hidden]{display:none!important}
  *{box-sizing:border-box;font-family:inherit}
  .sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
  section{position:relative;background:#fff;border:1px solid #e8e8e8;border-radius:14px;padding:8px}

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
  .discount-value{display:inline-flex;align-items:center;justify-content:center;height:var(--row-h);min-width:5.6em;font-variant-numeric:tabular-nums;padding:0 8px;border-radius:4px;background:#5dbd2f;color:#fff;font-size:15px;font-weight:700}
  .th-note{display:block;margin-top:2px;font-size:12px;font-weight:400}
  .shared-promo .promo-label{display:none}
  .promo-label{display:block;margin-top:5px;font-size:12px;font-weight:400;color:#6b6b6b;line-height:1.4}

  /* Tier badges */
  .badges{display:flex;flex-wrap:wrap;gap:6px}
  .tier-badge{display:inline-flex;align-items:center;height:var(--row-h);padding:0 10px;border-radius:4px;font-size:14px;font-weight:600;line-height:1.2;text-transform:uppercase;background:#c2c2c2;color:#171717}
  .tier-gold{background:#ffd500;color:#171717}
  .tier-bronze{background:#d2822d;color:#fff}
  .tier-isic{background:#3cba9c;color:#fff}
  .tier-b2b{background:#3a349f;color:#fff}
  .tier-regular{background:#f0f0f0;color:#606060}

  /* Footer and buttons */
  .credit{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;padding:0 8px 2px;font-size:12px;color:#6b6b6b}
  section:has(table:not([hidden]) tfoot tr:not([hidden])) .credit{margin-top:2px}
  .footer-buttons{display:flex;gap:6px;flex-shrink:0}
  .gear{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid #e8e8e8;border-radius:8px;background:#fff;color:#6b6b6b;cursor:pointer}
  .gear.retry{width:auto;padding:0 8px;font:inherit;white-space:nowrap}
  .gear:disabled{opacity:.5;cursor:wait}
  .gear:hover,.gear[aria-expanded="true"]{background:#f5f5f5;color:#000}
  .gear.done{background:#e9f7e1;border-color:#5dbd2f;color:#2f7a12}
  .gear.failed{border-color:#ca0505;color:#ca0505}
  .gear:focus-visible,input:focus-visible,.settings-info a:focus-visible,.credit a:focus-visible{outline:2px solid #545fef;outline-offset:2px}
  .price-notice{flex:1;color:#606060;font-size:13px}
  .footer-message .credit{margin-top:0;padding:0 4px;justify-content:flex-start}
  .footer-message .gear{flex-shrink:0}
  .load-error{color:#ca0505}

  /* Settings */
  .settings{display:grid;gap:16px;padding:0 8px 12px;margin-top:8px}
  .settings label{display:flex;gap:7px;align-items:center;min-height:30px;cursor:pointer}
  .settings input{accent-color:#545fef;width:16px;height:16px;margin:0}
  .settings fieldset{width:100%;min-width:0;margin:0;padding:0;border:0}
  .settings legend{padding:0;margin-bottom:4px;color:#606060;font-size:12px;font-weight:600}
  .settings-options{display:grid;width:100%;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 16px}
  .view-options{display:flex;flex-wrap:wrap;gap:4px 20px}
  .view-options .option{display:contents}
  .option-row{display:flex;align-items:center;gap:8px}
  .idp-wrap{position:relative;display:inline-flex;align-items:center}
  .idp-clear{position:absolute;right:4px;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:transparent;color:#6b6b6b;font-size:16px;line-height:1;cursor:pointer}
  .idp-clear:hover{background:#f0f0f0;color:#000}
  .idp-clear:focus-visible{outline:2px solid #545fef;outline-offset:1px}
  .settings .idp-input{width:110px;height:30px;padding:0 28px 0 8px;border:1px solid #c2c2c2;border-radius:8px;background:#fff;color:#000;font-size:13px}
  .help{flex-shrink:0;width:22px;height:22px;padding:0;border:1px solid #e8e8e8;border-radius:50%;background:#fff;color:#6b6b6b;font-size:12px;font-weight:600;line-height:1;cursor:pointer}
  .help:hover{background:#f5f5f5;color:#000}
  .help:focus-visible{outline:2px solid #545fef;outline-offset:2px}
  .tip{position:absolute;z-index:10;padding:8px 12px;border:1px solid #e8e8e8;border-radius:8px;background:#f5f5f5;color:#000;font-size:12px;line-height:1.5;pointer-events:none;text-wrap:pretty;box-shadow:0 4px 16px rgba(0,0,0,.12)}
  .settings-group{padding-top:12px!important;border-top:1px solid #e8e8e8!important}
  .settings-info{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 16px;padding-top:12px;border-top:1px solid #e8e8e8;color:#6b6b6b;font-size:12px}
  .settings-info a,.credit a{color:inherit;text-decoration:underline;text-underline-offset:2px}
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
  `;

  function createPanel(id) {
    const panelLanguage = activeLanguage;
    // History changes may precede sync() in browsers without the Navigation API.
    const isCurrent = () => state === panel && productId(location.pathname, location.search) === id
      && pageLanguage() === panelLanguage;
    const host = node('div');
    host.id = 'local-alza-price-tiers';
    host.hidden = true;
    Object.assign(host.style, {
      position: 'relative', width: '100%', minWidth: '0',
      margin: mobile ? '0' : '0 0 12px', padding: mobile ? '4px 0 8px' : '0',
    });
    const shadow = host.attachShadow({ mode: 'open' });
    node('style', PANEL_CSS, shadow);
    const section = node('section', null, shadow);
    section.id = 'price-table';
    section.setAttribute('aria-label', T.tableLabel + TIERS.map(tier => tier.name).join(', '));
    // One shared live region announces the result instead of every price cell.
    const status = node('div', null, section);
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    const table = node('table', null, section);
    const heading = node('tr', null, node('thead', null, table));
    node('th', T.thTier, heading).scope = 'col';
    const priceHeader = node('th', T.thPrice, heading);
    priceHeader.scope = 'col';
    // Shown instead of the per-row labels when every visible row has the same promo.
    const priceNote = node('span', null, priceHeader);
    priceNote.className = 'th-note';
    priceNote.hidden = true;
    node('th', T.thDiscount, heading).scope = 'col';
    const tbody = node('tbody', null, table);
    const rows = TIERS.map(tier => {
      const tr = node('tr', null, tbody);
      const label = node('td', null, tr);
      const badges = node('div', null, label);
      badges.className = 'badges';
      const badge = node('div', tier.name.toUpperCase(), badges);
      badge.className = 'tier-badge tier-' + (tier.badge || tier.name.toLowerCase());
      const price = node('td', '—', tr);
      const discount = node('td', '—', tr);
      discount.className = 'discount';
      return { tier, price, discount, tr, badge, displayName: tier.name.toUpperCase() };
    });
    const originalRow = node('tr', null, node('tfoot', null, table));
    originalRow.hidden = true;
    node('td', T.originalPrice, originalRow);
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
    gear.title = T.settingsTitle;
    gear.setAttribute('aria-label', T.settingsTitle);
    gear.setAttribute('aria-expanded', 'false');
    const copy = node('button', null, buttons);
    copy.className = 'gear';
    copy.type = 'button';
    copy.title = T.copyOffer;
    copy.setAttribute('aria-label', T.copyOffer);
    copy.hidden = true;
    copy.append(svgIcon('M8 8H20V21H8Z M16 8V3H3V16H8'));
    const retry = node('button', T.retry, buttons);
    retry.className = 'gear retry';
    retry.type = 'button';
    retry.hidden = true;
    retry.onclick = () => { if (isCurrent()) void load(id, state, { retry: true }); };
    const notice = node('span', T.equalNotice, footer);
    notice.className = 'price-notice';
    notice.hidden = true;
    // Shown when no tier could be loaded at all (blocked API, network error).
    const loadError = node('span', T.loadError, footer);
    loadError.className = 'price-notice load-error';
    loadError.hidden = true;
    const settings = node('div', null, section);
    // Help for the "?" buttons: a bubble on hover or focus with a mouse; on touch it stays until
    // you tap elsewhere.
    const tip = node('div', null, section);
    tip.className = 'tip';
    tip.id = 'help-tip';
    tip.hidden = true;
    tip.setAttribute('role', 'tooltip');
    const hoverQuery = mobile ? null : matchMedia('(hover: none)');
    const touchOnly = () => mobile || hoverQuery.matches;
    let tipButton = null;
    // The open bubble describes its button, so a screen reader reads it with the button.
    function hideTip() {
      tip.hidden = true;
      tipButton?.removeAttribute('aria-describedby');
      tipButton = null;
    }
    function showTip(button, text) {
      tipButton?.removeAttribute('aria-describedby');
      tipButton = button;
      button.setAttribute('aria-describedby', tip.id);
      tip.textContent = text;
      tip.hidden = false;
      const box = section.getBoundingClientRect();
      const target = button.getBoundingClientRect();
      const width = Math.min(260, box.width - 16);
      tip.style.width = width + 'px';
      const left = target.left - box.left + target.width / 2 - width / 2;
      tip.style.left = Math.max(8, Math.min(left, box.width - width - 8)) + 'px';
      const above = target.top - box.top - tip.offsetHeight - 8;
      tip.style.top = (above >= 0 ? above : target.bottom - box.top + 8) + 'px';
    }
    function attachHelp(button, text) {
      button.addEventListener('mouseenter', () => { if (!touchOnly()) showTip(button, text); });
      button.addEventListener('mouseleave', () => { if (!touchOnly()) hideTip(); });
      button.addEventListener('focus', () => { if (!touchOnly()) showTip(button, text); });
      button.addEventListener('blur', () => { if (!touchOnly()) hideTip(); });
      button.addEventListener('click', () => {
        if (touchOnly() && !tip.hidden && tipButton === button) hideTip();
        else showTip(button, text);
      });
    }
    // A tap or click anywhere else, or the Escape key, closes the bubble.
    const outside = new AbortController();
    document.addEventListener('pointerdown', event => {
      if (tip.hidden) return;
      if (!event.composedPath().some(element => element.classList?.contains('help'))) hideTip();
    }, { signal: outside.signal, capture: true });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !tip.hidden) hideTip();
    }, { signal: outside.signal, capture: true });
    settings.className = 'settings';
    settings.id = 'price-tier-settings';
    settings.hidden = true;
    gear.setAttribute('aria-controls', settings.id);
    const state = { dispose: () => { outside.abort(); clearTimeout(copyReset); }, host, rows, table, section, status, priceNote, notice, loadError, settings, copy, retry, originalRow, originalPrice, loaded: false, loading: false };
    let copyReset = 0;
    function setCopyState(label, className) {
      copy.className = className ? 'gear ' + className : 'gear';
      copy.title = label;
      copy.setAttribute('aria-label', label);
    }
    function resetCopy() {
      clearTimeout(copyReset);
      setCopyState(T.copyOffer);
    }
    function showCopyState(label, className) {
      clearTimeout(copyReset);
      setCopyState(label, className);
      copyReset = setTimeout(resetCopy, 2000);
    }
    state.resetCopy = resetCopy;
    // The copied offer ignores which tiers, promos and view are switched on in the panel. It uses the
    // prices already loaded for the panel (even if older than the cache time); missing tiers are fetched.
    async function offerText() {
      if (!isCurrent()) throw new Error(LOG.pageChanged);
      const url = new URL(location.href);
      const title = document.querySelector('h1')?.textContent.trim() || T.productFallback;
      const offer = await buildOffer(id, true);
      if (!isCurrent()) throw new Error(LOG.pageChanged);
      if (!offer) throw new Error(LOG.nothingToCopy);
      const lines = ['## ' + title, ''];
      const original = offer.original !== null ? T.originalColon + '~~' + formatPrice(offer.original) + '~~' : '';
      const priceText = entry => {
        const discount = formatDiscount(entry.result.discountPercent);
        return formatPrice(entry.amount) + (discount ? ' (' + discount + ')' : '');
      };
      if (offer.single) {
        // Every tier costs the same and there is no discount: just the price.
        lines.push('- ' + formatPrice(offer.entries[0].amount));
      } else {
        // Rows with the same promo form one block. The original price stands once at the top;
        // every block with a promo has its own "**➔ Ceny s kódem X:**" line. Rows without a
        // promo come first, directly under the original price.
        const groups = [];
        for (const entry of offer.entries) {
          const label = promoLabel(entry.result);
          let group = groups.find(item => item.label === label);
          if (!group) groups.push(group = { label, entries: [] });
          group.entries.push(entry);
        }
        groups.sort((a, b) => Boolean(a.label) - Boolean(b.label));
        const blocks = groups.map((group, index) => {
          const block = [];
          let header = index === 0 ? original : '';
          if (group.label) {
            const arrow = index > 0 || header ? '➔ ' : '';
            const promo = '**' + arrow + pricesLabel(group.label, group.entries.length === 1) + ':**';
            header = header ? header + ' ' + promo : promo;
          }
          if (header) block.push(header);
          // A lone OSTATNÍ/BASIC under its own promo header is simply "the price of the others".
          const bare = Boolean(group.label) && group.entries.length === 1
            && [T.others, 'BASIC'].includes(group.entries[0].names[0]);
          for (const entry of group.entries) {
            block.push('- ' + (entry.names.length && !bare ? '**' + entry.names.join('/') + '**: ' : '') + priceText(entry));
          }
          return block.join('\n');
        });
        lines.push(blocks.join('\n'));
      }
      // Always the desktop address (www.alza.cz), also when copied from m.alza.cz or the bare domain.
      url.hostname = url.hostname.replace(/^(?:m\.|www\.)?(alza\.(?:cz|sk|hu|de|at))$/i, 'www.$1');
      // The /EN/ language prefix is not part of the copied link.
      url.pathname = url.pathname.replace(/^\/en(?=\/)/i, '');
      const variant = url.searchParams.get('dq');
      url.search = '';
      if (variant !== null) url.searchParams.set('dq', variant);
      if (affiliateId) url.searchParams.set('idp', affiliateId);
      url.hash = '';
      lines.push('', T.link + url.href);
      return lines.join('\n');
    }
    copy.onclick = async () => {
      try {
        const text = offerText();
        await writeClipboard(text);
        if (!isCurrent()) return;
        showCopyState(T.copied, 'done');
        logCopiedOffer(id, await text);
      } catch (error) {
        if (!isCurrent()) return;
        showCopyState(T.copyFailedTitle, 'failed');
        warn(LOG.copyFailedLog + error.message);
      } finally { if (isCurrent()) copy.focus({ preventScroll: true }); }
    };
    gear.onclick = () => {
      settings.hidden = !settings.hidden;
      gear.setAttribute('aria-expanded', String(!settings.hidden));
      section.classList.toggle('settings-only', table.hidden && settings.hidden && notice.hidden && loadError.hidden && retry.hidden);
    };
    // A labelled checkbox; "change" saves a setting and schedules a reload of the prices.
    function addCheckbox(parent, text, checked, onChange) {
      const label = node('label', null, parent);
      const box = node('input', null, label);
      box.type = 'checkbox';
      box.checked = checked;
      box.onchange = () => onChange(box.checked);
      node('span', text, label);
      return label;
    }
    function change(key, value) {
      saveSetting(key, value);
      if (key === 'enabled-price-tiers') scheduleLoad(id, state);
      else if (state.loaded) render(id, state);
    }
    function addGroup(title, optionsClass) {
      const group = node('fieldset', null, settings);
      group.className = 'settings-group';
      node('legend', title, group);
      const options = node('div', null, group);
      options.className = optionsClass;
      return options;
    }
    const tierOptions = addGroup(T.groupTiers, 'settings-options');
    for (const tier of TIERS) {
      addCheckbox(tierOptions, tier.name, enabled[tier.name], value => {
        enabled[tier.name] = value;
        change('enabled-price-tiers', { ...savedTiers, ...enabled });
      });
    }
    const actionOptions = addGroup(T.groupPromos, 'settings-options');
    addCheckbox(actionOptions, 'AlzaPlus+', alzaPlusPromos, value => { alzaPlusPromos = value; change('alza-plus-promos', value); });
    addCheckbox(actionOptions, 'Cashback', cashbackPromos, value => { cashbackPromos = value; change('cashback-price-promos', value); });
    addCheckbox(actionOptions, T.tradeIn, tradeInPromos, value => { tradeInPromos = value; change('trade-in-promos', value); });
    const viewOptions = addGroup(T.groupView, 'settings-options view-options');
    // A checkbox with a "?" button that explains it.
    function viewOption(text, hint, checked, update) {
      const option = node('div', null, viewOptions);
      option.className = 'option';
      const row = node('div', null, option);
      row.className = 'option-row';
      const label = addCheckbox(row, text, checked, update);
      option.checkbox = label.children[0];
      const help = node('button', '?', row);
      help.className = 'help';
      help.type = 'button';
      help.setAttribute('aria-label', T.helpAbout + text);
      attachHelp(help, hint);
      return option;
    }
    viewOption(T.optAlways,
      T.optAlwaysHint,
      alwaysShow, value => { alwaysShow = value; change('always-show-tiers', value); });
    belowPhotoOption = viewOption(T.optLeft,
      T.optLeftHint,
      belowPhoto, value => {
        belowPhoto = value;
        if (value) {
          trackerBelowPhoto = false;
          trackerPhotoOption.checkbox.checked = false;
          saveSetting('tracker-below-photo', false);
        }
        saveSetting('panel-below-photo', value);
        mount(host);
      });
    belowPhotoOption.hidden = true;
    trackerPhotoOption = viewOption(T.optTrackerLeft, T.optTrackerLeftHint, trackerBelowPhoto, value => {
      trackerBelowPhoto = value;
      if (value) {
        belowPhoto = false;
        belowPhotoOption.checkbox.checked = false;
        saveSetting('panel-below-photo', false);
      }
      saveSetting('tracker-below-photo', value);
      mount(host);
    });
    trackerPhotoOption.hidden = true;
    const idpRow = addGroup('Affiliate', 'option-row');
    const idpWrap = node('span', null, idpRow);
    idpWrap.className = 'idp-wrap';
    const idpInput = node('input', null, idpWrap);
    idpInput.setAttribute('aria-label', 'Affiliate');
    idpInput.type = 'text';
    idpInput.inputMode = 'numeric';
    idpInput.maxLength = 12;
    idpInput.placeholder = '1234';
    idpInput.className = 'idp-input';
    idpInput.value = affiliateId;
    const idpClear = node('button', '×', idpWrap);
    idpClear.className = 'idp-clear';
    idpClear.type = 'button';
    idpClear.title = T.clear;
    idpClear.setAttribute('aria-label', T.clearAffiliate);
    idpClear.hidden = !affiliateId;
    const idpHelp = node('button', '?', idpRow);
    idpHelp.className = 'help';
    idpHelp.type = 'button';
    idpHelp.setAttribute('aria-label', T.whatIsAffiliate);
    attachHelp(idpHelp, T.affiliateHint);
    function saveAffiliate() {
      affiliateId = idpInput.value;
      idpClear.hidden = !affiliateId;
      saveSetting('affiliate-idp', affiliateId);
    }
    idpInput.oninput = () => {
      const digits = idpInput.value.replace(/\D/g, '');
      if (digits !== idpInput.value) idpInput.value = digits;
      idpClear.hidden = !digits;
    };
    idpInput.onchange = saveAffiliate;
    idpClear.onclick = () => {
      idpInput.value = '';
      saveAffiliate();
      idpInput.focus();
    };
    const info = node('div', null, settings);
    info.className = 'settings-info';
    const version = scriptVersion();
    node('span', T.version + version, info);
    const links = node('span', null, info);
    links.append(T.createdBy);
    const creditLink = node('a', 'Dexnis', links);
    creditLink.href = 'https://github.com/dexnis-dev';
    creditLink.target = '_blank';
    creditLink.rel = 'noopener noreferrer';
    links.append(' · ');
    const sourceLink = node('a', T.sourceCode, links);
    sourceLink.href = 'https://github.com/dexnis-dev/Alza-Benefit-Prices/';
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    mount(host);
    return state;
  }

  // Raw API data of one tier, from the shared cache or the network. null means the run was superseded.
  // "allowStale" accepts expired entries; only missing tiers need the network when copying.
  async function tierData(id, tier, run, allowStale = false, diagnostics = null) {
    const url = apiUrl(id, tier);
    const cached = cache.get(url);
    const age = cached ? Date.now() - cached.time : Infinity;
    if (cached && (allowStale || age < CACHE_TTL)) {
      if (diagnostics) diagnostics.source = 'cache';
      // Evict the least recently used product, rather than the oldest inserted one.
      cache.delete(url);
      cache.set(url, cached);
      if (age >= CACHE_TTL) debug(tier.name + LOG.staleCache + Math.round(age / 1000) + ' s)');
      return cached.data;
    }
    if (diagnostics) diagnostics.source = inFlight.has(url) ? 'shared' : 'network';
    debug(tier.name + ': GET ' + url);
    const response = await request(url, run !== null);
    // Cache shared responses once; a superseded panel can still supply the copied offer.
    if (parsedResponses.has(response)) return run !== null && run !== generation ? null : parsedResponses.get(response);
    debug(tier.name + ': HTTP ' + response.status + ', ' + response.responseText.length + ' B');
    if (response.responseText.length > 2 * 1024 * 1024) throw new Error(LOG.tooLarge);
    if (response.status === 403) throw new Error(LOG.blocked);
    if (response.status < 200 || response.status >= 300) throw new Error(LOG.apiHttp + response.status + '.');
    if (response.finalUrl && new URL(response.finalUrl).origin !== 'https://webapi.alza.cz') throw new Error(LOG.redirect);
    let data;
    try { data = JSON.parse(response.responseText); }
    catch { throw new Error(LOG.noPrice); }
    if (!data || typeof data !== 'object') throw new Error(LOG.noPrice);
    cache.delete(url);
    parsedResponses.set(response, data);
    cache.set(url, { data, time: Date.now() });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return run !== null && run !== generation ? null : data;
  }

  // The offer to copy: every tier with a discount, whatever tiers, promos or view the user has switched on.
  async function buildOffer(id, allowStale = false) {
    const all = { plus: true, cashback: true, tradeIn: true };
    const found = await Promise.all(TIERS.map(async tier => {
      try {
        const data = await tierData(id, tier, null, allowStale);
        const resolved = resolveTierPrice(data, tier, all);
        return resolved ? { tier, ...resolved } : null;
      } catch (error) {
        debug(tier.name + ': ' + error.message);
        return null;
      }
    }));
    const basic = found.find(item => item?.tier.reference);
    correctIsicPrices(found);
    const discounted = item => item?.result?.discountPercent > 0;
    const tiers = found.filter(item => item && !item.tier.reference && discounted(item)
      && (!basic?.result || compareWithBasic(item.result, basic.result) === null));
    const toEntry = (item, result = item.result) => (
      { tier: item.tier, names: [item.tier.name.toUpperCase()], amount: result.amount, result });
    // Same pairs as in the table; the folded entry is dropped from the list.
    const fold = list => {
      foldPairs(list, (target, source) => { target.names.push(...source.names); source.folded = true; });
      return list.filter(entry => !entry.folded);
    };
    let entries = fold(tiers.sort((a, b) => a.result.amount - b.result.amount).map(item => toEntry(item)));
    // Same rule as the OSTATNÍ row of the table: exactly one tier differs from BASIC, so BASIC
    // stands for all the others.
    const others = TIERS.filter(tier => !tier.reference)
      .map(tier => found.find(item => item?.tier === tier) || { tier, comparison: null });
    const lone = basic?.result ? onlyDifferent(basic.result.amount, others, item => item.comparison?.amount ?? null) : null;
    const stands = Boolean(lone) && tiers.includes(lone);
    // BASIC (or OSTATNÍ) is listed only with a discount of its own, as in the table.
    if (entries.length && discounted(basic)) {
      entries.push({ tier: basic.tier, names: [stands ? T.others : 'BASIC'], amount: basic.result.amount, result: basic.result });
    } else if (!entries.length && discounted(basic)) {
      entries = [{ names: [], amount: basic.result.amount, result: basic.result }];
    }
    if (!entries.length) {
      // No discount anywhere: a plain price list instead (one price line when every tier is the same).
      const priced = found.filter(item => item?.result).sort((a, b) => a.result.amount - b.result.amount);
      if (!priced.length) return null;
      const plain = fold(priced.map(item => toEntry(item, { ...item.result, discountPercent: null })));
      const single = priced.every(item => item.result.amount === priced[0].result.amount);
      return { entries: single ? [{ names: [T.thPrice], amount: priced[0].result.amount, result: { ...priced[0].result, discountPercent: null } }] : plain,
        original: null, single };
    }
    return { entries, original: originalPrice(entries.map(entry => entry.result), basic?.result) };
  }

  // Several quick toggles trigger a single reload.
  let reloadTimer = 0;
  function scheduleLoad(id, state) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { if (state === panel) void load(id, state, { missing: true }); }, 250);
  }

  async function load(id, state, { retry = false, missing = false } = {}) {
    if (retry && state.loading) return;
    const targets = state.rows.filter(row => retry ? Boolean(row.error)
      : missing ? enabled[row.tier.name] && !row.data && !row.error : enabled[row.tier.name]);
    if (retry && !targets.length) return;
    if (missing && !targets.length) { if (state.loaded) render(id, state); return; }
    const started = performance.now();
    const run = ++generation;
    state.loading = true;
    state.section.setAttribute('aria-busy', 'true');
    state.retry.disabled = true;
    state.retry.textContent = T.loading;
    state.resetCopy();
    if (!state.loaded) state.host.hidden = true;
    if (!retry && !missing) {
      for (const row of state.rows) {
        row.data = null;
        row.error = null;
        row.source = null;
        row.requested = false;
      }
    }
    async function loadRow(row) {
      row.requested = true;
      row.error = null;
      row.data = null;
      // Invalid payloads may have reached the cache before price extraction failed.
      if (retry) cache.delete(apiUrl(id, row.tier));
      try {
        const data = await tierData(id, row.tier, run, false, row);
        if (run !== generation || data === null) return;
        row.data = data;
        row.error = null;
      } catch (error) {
        if (run !== generation) return;
        row.data = null;
        row.error = error.message;
        warn(row.tier.name + ': ' + error.message, { itemId: id, priceList: row.tier.name });
      }
    }
    await Promise.all(targets.map(loadRow));
    if (run !== generation) return;
    // A disabled BASIC is still needed to compare the enabled tiers.
    const basic = state.rows.find(row => row.tier.reference);
    if (basic && !basic.data && !basic.error && !targets.includes(basic)
      && state.rows.some(row => !row.tier.reference && enabled[row.tier.name] && row.data)) await loadRow(basic);
    if (run !== generation) return;
    state.loading = false;
    render(id, state, { operation: retry ? 'retry' : 'load', durationMs: Math.round(performance.now() - started) });
  }

  // Write one computed result without changing the retained API data.
  function renderResult(row, result) {
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
  }

  // View and promotion changes reuse retained responses, even after the shared cache expires.
  function render(id, state, { operation = 'view', durationMs = 0 } = {}) {
    const promos = { plus: alzaPlusPromos, cashback: cashbackPromos, tradeIn: tradeInPromos };
    const prices = [];
    for (const row of state.rows) {
      row.tr.hidden = true;
      row.valid = false;
      row.result = null;
      row.amount = null;
      row.comparisonAmount = null;
      row.noOwnPrice = false;
      row.hiddenReason = null;
      if (row.data == null) {
        if (row.requested && !state.loading && !row.error) row.error = LOG.noPrice;
        continue;
      }
      if (row.error) continue;
      const resolved = resolveTierPrice(row.data, row.tier, promos, alwaysShow);
      if (!resolved) { row.error = LOG.noPrice; continue; }
      prices.push({ tier: row.tier, row, ...resolved });
    }
    correctIsicPrices(prices);
    for (const { row, result, comparison } of prices) {
      row.comparisonAmount = comparison?.amount ?? null;
      if (!result) { row.noOwnPrice = true; continue; }
      renderResult(row, result);
    }
    const basic = state.rows.find(row => row.tier.reference);
    const failed = state.rows.filter(row => row.error).length;
    filterRows(state.rows);
    // Reorder the DOM only so ties keep the configured tier order.
    const sorted = visibleRows(state.rows);
    for (const row of sorted) row.tr.parentNode.append(row.tr);
    const compared = state.rows.filter(row => row.tier.reference || enabled[row.tier.name]);
    const equalPrices = compared.length > 1 && compared.every(row =>
      row.comparisonAmount !== null && row.comparisonAmount === compared[0].comparisonAmount);
    const showNotice = equalPrices && !alwaysShow;
    const hasPrices = !showNotice && sorted.length > 0;
    const commonPrice = showNotice && basic?.valid ? basic.result : null;
    const shownOriginal = originalPrice(commonPrice ? [commonPrice] : hasPrices ? sorted.map(row => row.result) : [],
      basic?.valid ? basic.result : null, true);
    state.originalRow.hidden = shownOriginal === null;
    state.originalPrice.textContent = shownOriginal === null ? '' : formatPanelPrice(shownOriginal);
    const labels = sorted.map(row => promoLabel(row.result));
    const sharedPromo = hasPrices && labels.length > 1 && labels[0] && labels.every(label => label === labels[0]) ? labels[0] : '';
    state.priceNote.textContent = sharedPromo;
    state.priceNote.hidden = !sharedPromo;
    state.section.classList.toggle('shared-promo', Boolean(sharedPromo));
    state.table.hidden = !hasPrices;
    // Nothing loaded and at least one request failed: tell the user instead of showing an empty panel.
    const anyValidOrCompared = state.rows.some(row => row.valid || row.comparisonAmount !== null);
    const loadFailed = failed > 0 && !anyValidOrCompared;
    state.notice.hidden = !showNotice;
    state.loadError.hidden = !loadFailed;
    state.retry.hidden = failed === 0;
    state.retry.disabled = state.loading;
    state.retry.textContent = state.loading ? T.loading : T.retry;
    state.section.classList.toggle('footer-message', showNotice || loadFailed);
    state.section.classList.toggle('settings-only', !hasPrices && !showNotice && !loadFailed && !failed && state.settings.hidden);
    const renderStatus = loadFailed ? 'error' : failed ? 'partial' : showNotice ? 'equal-prices' : hasPrices ? 'prices' : 'empty';
    const attempted = state.rows.filter(row => row.requested);
    const loaded = attempted.length - failed;
    const cacheHits = attempted.filter(row => row.source === 'cache').length;
    const failedTiers = attempted.filter(row => row.error).map(row => row.tier.name);
    const summary = (loadFailed ? LOG.logNoTier : operation === 'view' ? LOG.logRendered : LOG.logLoaded) + id
      + ' · ' + loaded + '/' + attempted.length + ' · ' + durationMs + ' ms'
      + ' · cache ' + cacheHits + '/' + attempted.length
      + (failedTiers.length ? ' · failed: ' + failedTiers.join('/') : '');
    if (failed) warn(summary, { failedTiers: [...failedTiers] });
    else log(summary);
    log(LOG.logRender);
    // Log a detached snapshot, so expanding an older entry after navigating or
    // changing settings still shows the values from that render. No DOM/API objects.
    console.log({
      info: {
        itemId: id,
        title: document.querySelector('h1')?.textContent.trim() || T.productFallback,
        country,
        language: activeLanguage,
        currency: euro ? 'EUR' : country === 'HU' ? 'HUF' : 'CZK',
      },
      metadata: {
        version: scriptVersion(),
        hostname: location.hostname,
        mobile,
        durationMs,
        operation,
        status: renderStatus,
        loaded,
        attempted: attempted.length,
        cacheHits,
        networkRequests: attempted.filter(row => row.source === 'network').length,
        sharedRequests: attempted.filter(row => row.source === 'shared').length,
        failed,
        failedTiers: [...failedTiers],
        settings: {
          priceLists: { ...enabled },
          promotions: { plus: alzaPlusPromos, cashback: cashbackPromos, tradeIn: tradeInPromos },
          alwaysShow,
          belowPhoto,
          trackerBelowPhoto,
          affiliate: Boolean(affiliateId),
        },
      },
      dataset: {
        originalPrice: shownOriginal,
        basicPrice: basic?.valid ? basic.amount : null,
        commonPrice: commonPrice?.amount ?? null,
        currentPrice: hasPrices ? sorted.map(row => ({
          priceList: row.displayName,
          price: row.amount,
          discountPercent: row.result.discountPercent,
          promotion: promoLogLabel(row.result) || null,
        })) : [],
        priceLists: state.rows.map(row => ({
          priceList: row.tier.name,
          enabled: enabled[row.tier.name],
          visible: hasPrices && !row.tr.hidden,
          hiddenReason: row.hiddenReason || (showNotice ? 'same-as-basic' : null),
          source: row.source,
          price: row.amount,
          comparisonPrice: row.comparisonAmount,
          discountPercent: row.result?.discountPercent ?? null,
          promotion: row.result ? promoLogLabel(row.result) || null : null,
          estimated: row.result?.estimated === true,
          error: row.error,
        })),
      },
    });
    state.status.textContent = loadFailed ? state.loadError.textContent : showNotice ? state.notice.textContent
      : hasPrices ? T.pricesLoaded + sorted.map(row => row.displayName + ' ' + formatPrice(row.amount)).join(', ') : '';
    state.section.setAttribute('aria-busy', String(state.loading));
    state.loaded = true;
    state.host.hidden = false;
    // Disabling every panel tier must not disable the independent all-tier offer.
    state.copy.hidden = !anyValidOrCompared && TIERS.some(tier => enabled[tier.name]);
  }

  function filterRows(rows) {
    const basic = rows.find(row => row.tier.reference);
    for (const row of rows) {
      row.displayName = row.tier.name.toUpperCase();
      if (row.badge) row.badge.textContent = row.displayName;
      row.extraBadges?.forEach(badge => badge.remove());
      row.extraBadges = [];
      row.hiddenReason = !enabled[row.tier.name] ? 'disabled' : row.error ? 'error'
        : !row.valid ? (row.noOwnPrice ? 'no-own-price' : 'no-price') : null;
      if (alwaysShow) { row.tr.hidden = !(row.valid && enabled[row.tier.name]); continue; }
      let visible = row.valid && enabled[row.tier.name];
      if (['Gold', 'Silver', 'Bronze', 'ISIC'].includes(row.tier.name) && visible) {
        const comparison = compareWithBasic(row.result, basic?.valid ? basic.result : null);
        row.hiddenReason = comparison;
        visible = comparison === null;
      }
      if (row.tier.reference) {
        if (visible && !(row.result?.discountPercent > 0)) row.hiddenReason = 'no-discount';
        visible = visible && row.result?.discountPercent > 0;
      }
      row.tr.hidden = !visible;
    }
    function mergeRow(target, source) {
      source.tr.hidden = true;
      source.hiddenReason = 'merged-with-' + target.tier.name.toLowerCase();
      target.displayName += '/' + source.displayName;
      const extra = node('div', source.displayName, target.badge.parentNode);
      extra.className = 'tier-badge tier-' + (source.tier.badge || source.tier.name.toLowerCase());
      target.extraBadges.push(extra);
    }
    // Only matching prices and promotions of Silver/ISIC and Bronze/B2B share a row.
    foldPairs(rows.filter(row => row.valid && !row.tr.hidden), mergeRow);
    if (alwaysShow) return;
    const compared = rows.filter(row => !row.tier.reference && enabled[row.tier.name]);
    const lone = basic?.valid ? onlyDifferent(basic.amount, compared, row => row.comparisonAmount) : null;
    if (lone && !lone.tr.hidden) {
      basic.displayName = T.others;
      if (basic.badge) basic.badge.textContent = basic.displayName;
      // Without a discount of its own OSTATNÍ would only repeat the original price shown below the table.
      basic.tr.hidden = !(enabled[basic.tier.name] && basic.result?.discountPercent > 0);
      // OSTATNÍ already stands for every tier priced like BASIC.
      for (const row of compared) if (row.valid && row.amount === basic.amount) {
        row.tr.hidden = true;
        row.hiddenReason = 'same-as-basic';
      }
    }
    // Keep BASIC only when there is another visible price to compare with it.
    if (basic && !rows.some(row => !row.tier.reference && !row.tr.hidden)) {
      if (!basic.tr.hidden) basic.hiddenReason = 'no-visible-comparison';
      basic.tr.hidden = true;
    }
  }

  function sync(remount = true) {
    const id = productId(location.pathname, location.search);
    const language = pageLanguage();
    if (id !== activeId || language !== activeLanguage) {
      activeLanguage = language;
      T = TEXTS[language];
      cancel();
      clearTimeout(reloadTimer);
      mountObserver.disconnect();
      cancelAnimationFrame(mountFrame);
      mountFrame = 0;
      observedRoot = null;
      restoreTracker();
      panel?.dispose();
      panel?.host.remove(); panel = null; activeId = id;
      stripRetries = 0;
      clearTimeout(stripTimer);
      lastPlacement = '';
      if (id) {
        debug(LOG.logLoading + id);
        panel = createPanel(id);
        void load(id, panel);
      }
    } else if (panel && (remount || !panel.host.isConnected)) {
      mount(panel.host);
    }
  }

  // Hidden tabs and BFCache pages have no polling interval at all.
  function startPageChecks() {
    let timer = null;
    let mountChecks = 0;
    function stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    }
    function start() {
      if (timer === null && !document.hidden) {
        timer = setInterval(() => sync(++mountChecks % 5 === 0), 1000);
      }
    }
    function resume() {
      if (document.hidden) stop();
      else { sync(); start(); }
    }
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('pagehide', stop);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('pagehide', stop);
    };
  }

  sync();
  // Detect product navigation without modifying Alza's history or scripts.
  // Navigation events (currententrychange) and the mount observer react at once; the slow timer is a safety net
  // for browsers without the Navigation API and for a re-rendered container.
  window.navigation?.addEventListener?.('currententrychange', sync);
  window.addEventListener('popstate', sync);
  const stopPageChecks = startPageChecks();
  window.addEventListener('pagehide', event => {
    if (!event.persisted) {
      stopPageChecks();
      clearTimeout(reloadTimer);
      clearTimeout(stripTimer);
      cancelAnimationFrame(mountFrame);
      mountObserver.disconnect();
      restoreTracker();
      panel?.dispose();
      cancel();
    }
  });
})().catch(error => console.error('%s', 'Alza Benefit Prices – Startup failed: ' + error.message, error));
