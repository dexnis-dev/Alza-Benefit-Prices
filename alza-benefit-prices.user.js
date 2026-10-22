// ==UserScript==
// @name         Alza Benefit Prices
// @icon         https://raw.githubusercontent.com/dexnis-dev/Alza-Benefit-Prices/main/photos/logo/logo.svg
// @author       Dexnis
// @namespace    alza-benefit-prices
// @version      1.5.1
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
// @match        https://www.alza.cz/*
// @match        https://alza.cz/*
// @match        https://m.alza.cz/*
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
// @run-at       document-start
// @noframes
// ==/UserScript==

(async () => {
  'use strict';

  // The shop by its domain; the price API is always webapi.alza.cz and takes the country as a parameter.
  const country = /(?:^|\.)alza\.sk$/i.test(location.hostname) ? 'SK'
    : /(?:^|\.)alza\.hu$/i.test(location.hostname) ? 'HU'
    : /(?:^|\.)alza\.de$/i.test(location.hostname) ? 'DE'
    : /(?:^|\.)alza\.at$/i.test(location.hostname) ? 'AT' : 'CZ';
  const locale = { SK: 'sk-SK', HU: 'hu-HU', DE: 'de-DE', AT: 'de-AT', CZ: 'cs-CZ' }[country];
  const euro = ['SK', 'DE', 'AT'].includes(country); // prices in euro, with cents
  // Feature matrix is also read by the regional userscript generator.
  const SHOP_FEATURES = {
    "CZ": { "tracker": true, "fxalza": true, "isic": true },
    "SK": { "tracker": true, "fxalza": true, "isic": true },
    "HU": { "tracker": false, "fxalza": true, "isic": false },
    "DE": { "tracker": false, "fxalza": true, "isic": true },
    "AT": { "tracker": false, "fxalza": true, "isic": false }
  };
  const { tracker: hasTracker, fxalza: hasFxalza } = SHOP_FEATURES[country];
  // #betteralza config
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
      yourTier: 'Tvůj ceník: {tier}',
      thPrice: 'Cena',
      thDiscount: 'Sleva',
      originalPrice: 'Původní cena',
      settingsTitle: 'Nastavení ceníků',
      closeSettings: 'Zavřít nastavení',
      copyOffer: 'Kopírovat nabídku',
      copyLink: 'Kopírovat odkaz',
      useFxalza: 'Kopírovat odkaz přes fxalza.cz',
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
      excludePromo: 'Nezapočítávat: {action}',
      includePromo: 'Započítat: {action}',
      tradeIn: 'Výkup',
      tradeInBonus: 'Výkupní bonus',
      groupView: 'Zobrazení',
      groupShare: 'Sdílení',
      fxalzaHint: 'Odkaz s náhledem na Discordu. Po vypnutí se kopíruje textová nabídka.',
      helpAbout: 'Co dělá volba: ',
      optAlways: 'Vždy zobrazit ceníky',
      optAlwaysHint: 'Zobrazí zapnuté ceníky i bez slevy nebo při shodných cenách.',
      // #betteralza labels-cs
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
      yourTier: 'Tvoj cenník: {tier}',
      thPrice: 'Cena',
      thDiscount: 'Zľava',
      originalPrice: 'Pôvodná cena',
      settingsTitle: 'Nastavenie cenníkov',
      closeSettings: 'Zavrieť nastavenia',
      copyOffer: 'Kopírovať ponuku',
      copyLink: 'Kopírovať odkaz',
      useFxalza: 'Kopírovať odkaz cez fxalza.cz',
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
      excludePromo: 'Nezapočítavať: {action}',
      includePromo: 'Započítať: {action}',
      tradeIn: 'Výkup',
      tradeInBonus: 'Výkupný bonus',
      groupView: 'Zobrazenie',
      groupShare: 'Zdieľanie',
      fxalzaHint: 'Odkaz s náhľadom na Discorde. Po vypnutí sa kopíruje textová ponuka.',
      helpAbout: 'Čo robí voľba: ',
      optAlways: 'Vždy zobraziť cenníky',
      optAlwaysHint: 'Zobrazí zapnuté cenníky aj bez zľavy alebo pri rovnakých cenách.',
      // #betteralza labels-sk
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
      yourTier: 'Your price list: {tier}',
      thPrice: 'Price',
      thDiscount: 'Discount',
      originalPrice: 'Original price',
      settingsTitle: 'Price list settings',
      closeSettings: 'Close settings',
      copyOffer: 'Copy offer',
      copyLink: 'Copy link',
      useFxalza: 'Copy link via fxalza.cz',
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
      excludePromo: 'Exclude from prices: {action}',
      includePromo: 'Include in prices: {action}',
      tradeIn: 'Trade-in',
      tradeInBonus: 'Trade-in bonus',
      groupView: 'Display',
      groupShare: 'Sharing',
      fxalzaHint: 'Link with a Discord preview. Turn off to copy the offer as text.',
      helpAbout: 'What the option does: ',
      optAlways: 'Always show price lists',
      optAlwaysHint: 'Always shows your enabled price lists, even when a price list has no discount or all price lists have the same price.',
      // #betteralza labels-en
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
      yourTier: 'Deine Preisliste: {tier}',
      thPrice: 'Preis',
      thDiscount: 'Rabatt',
      originalPrice: 'Ursprünglicher Preis',
      settingsTitle: 'Einstellungen der Preislisten',
      closeSettings: 'Einstellungen schließen',
      copyOffer: 'Angebot kopieren',
      copyLink: 'Link kopieren',
      useFxalza: 'Link über fxalza.cz kopieren',
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
      excludePromo: 'Nicht einrechnen: {action}',
      includePromo: 'Einrechnen: {action}',
      tradeIn: 'Inzahlungnahme',
      tradeInBonus: 'Inzahlungnahmebonus',
      groupView: 'Anzeige',
      groupShare: 'Teilen',
      fxalzaHint: 'Link mit Discord-Vorschau. Deaktivieren, um das Angebot als Text zu kopieren.',
      helpAbout: 'Was die Option bewirkt: ',
      optAlways: 'Preislisten immer anzeigen',
      optAlwaysHint: 'Zeigt deine aktivierten Preislisten immer an, auch wenn eine Preisliste keinen Rabatt hat oder alle Preislisten denselben Preis haben.',
      // #betteralza labels-de
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
      yourTier: 'Saját árlistád: {tier}',
      thPrice: 'Ár',
      thDiscount: 'Kedvezmény',
      originalPrice: 'Eredeti ár',
      settingsTitle: 'Az árlisták beállításai',
      closeSettings: 'Beállítások bezárása',
      copyOffer: 'Ajánlat másolása',
      copyLink: 'Link másolása',
      useFxalza: 'Link másolása az fxalza.cz segítségével',
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
      excludePromo: 'Kihagyás az árakból: {action}',
      includePromo: 'Beszámítás az árakba: {action}',
      tradeIn: 'Beszámítás',
      tradeInBonus: 'Beszámítási bónusz',
      groupView: 'Megjelenítés',
      groupShare: 'Megosztás',
      fxalzaHint: 'Link Discord-előnézettel. Kikapcsolva szöveges ajánlatot másol.',
      helpAbout: 'Mit csinál a beállítás: ',
      optAlways: 'Árlisták mindig megjelenítése',
      optAlwaysHint: 'A bekapcsolt árlistákat mindig megjeleníti, akkor is, ha egy árlistának nincs kedvezménye, vagy minden árlistának ugyanaz az ára.',
      // #betteralza labels-hu
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
  const SCRIPT_VERSION = '1.5.1';
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
    { name: 'B2B', accountName: 'BRONZE+B2B', pgrik: 'p_pg6_6ce49' },
    { name: 'Basic', pgrik: 'p__26752', reference: true, badge: 'regular' },
  ];
  // Alza.hu and Alza.at have no ISIC price list, so ISIC is left out there completely (table, settings,
  // copying, requests).
  const TIERS = hasIsic ? ALL_TIERS : ALL_TIERS.filter(tier => tier.name !== 'ISIC');

  // Display names are independent of storage keys and price-fetching identifiers.
  function tierLabel(tier) {
    return tier.name.toUpperCase();
  }
  function offerTierNames(names) {
    return names.join('/');
  }

  // Read only the unified settings; absent/invalid storage uses the defaults below.
  const savedSettings = await getSetting('settings', {});
  const storedSettings = savedSettings && typeof savedSettings === 'object' && !Array.isArray(savedSettings)
    ? savedSettings : {};
  // #betteralza startup
  // The standalone userscript only runs on product pages.
  if (!productId(location.pathname, location.search)) return;
  const savedTiers = storedSettings['enabled-price-tiers'] || {};
  const enabled = Object.fromEntries(TIERS.map(tier => [tier.name, savedTiers[tier.name] !== false]));
  let alzaPlusPromos = storedSettings['alza-plus-promos'] !== false;
  let cashbackPromos = storedSettings['cashback-price-promos'] !== false;
  let tradeInPromos = storedSettings['trade-in-promos'] !== false;
  let useFxalza = hasFxalza && storedSettings['copy-fxalza'] !== false;
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

  // #betteralza helpers

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
  // #shared-pricing
  // Shared by the standalone userscript and BetterAlza; bundled at build time.
  function parsePriceAmount(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    let text = String(value).trim().replace(/\s/g, '').replace(/(?:Kč|CZK|€|EUR|Ft|HUF)$/i, '').replace(/[,.][-–—]$/, '');
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)) text = text.replace(/\./g, '');
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) return null;
    const number = Number(text.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  function findPricing(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 15) return null;
    if (value.mainPriceTag || Array.isArray(value.promoPrices)) return value;
    for (const child of Object.values(value)) {
      const pricing = findPricing(child, depth + 1);
      if (pricing) return pricing;
    }
    return null;
  }

  // Call only for promotion records, never main/alternative price tags.
  function promoKind(priceType, coupon) {
    return priceType === 4 ? 'plus' : coupon ? 'coupon'
      : priceType === 1 ? 'cashback' : priceType === 2 ? 'tradein' : null;
  }
  // #end-shared-pricing
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
      const amount = parsePriceAmount(price);
      if (amount === null) return null;
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
    if (!(percent > 0)) return '';
    return percent < 0.1 ? '< ' + discountFormat.format(0.1) + ' %'
      : '−' + discountFormat.format(percent) + ' %';
  }

  // #feature isic
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

  // #endfeature
  // Shared calculations take explicit inputs, never panel visibility settings.
  // The caller chooses promotions and whether to include a tier's standard-price fallback.
  function resolveTierPrice(data, tier, promos, includeStandard = false) {
    const selected = extractPrice(data, tier.reference, promos);
    if (!selected) return null;
    const comparison = selected.hidden ? extractPrice(data, true, promos) : selected;
    if (!comparison) return null;
    return { result: selected.hidden ? (includeStandard ? comparison : null) : selected, comparison };
  }

  // #feature isic
  function correctIsicPrices(items) {
    const basic = items.find(item => item?.tier.reference);
    const isic = items.find(item => item?.tier.name === 'ISIC');
    if (isic?.result && basic?.result) {
      isic.result = estimateIsicCashback(isic.result, basic.result);
      isic.comparison = isic.result;
    }
  }

  // #endfeature
  function compareWithBasic(result, basic) {
    if (!basic) return 'basic-unavailable';
    return result.amount < basic.amount ? null
      : result.amount === basic.amount ? 'same-as-basic' : 'higher-than-basic';
  }

  function compareWithBronze(amount, bronzeAmount) {
    if (bronzeAmount == null) return 'bronze-unavailable';
    return amount < bronzeAmount ? null
      : amount === bronzeAmount ? 'same-as-bronze' : 'higher-than-bronze';
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
    log(LOG.copiedLog + id, useFxalza ? text : text.split('\n'));
  }

  function shareUrl() {
    const url = new URL(location.href);
    url.hostname = 'www.alza.' + country.toLowerCase();
    // #feature fxalza
    if (hasFxalza) url.hostname = country === 'CZ' ? 'fxalza.cz' : country.toLowerCase() + '.fxalza.cz';
    // #endfeature
    url.pathname = url.pathname.replace(/^\/en(?=\/)/i, '');
    const variant = url.searchParams.get('dq');
    url.search = '';
    if (/^\d+$/.test(variant || '')) url.searchParams.set('dq', variant);
    if (affiliateId) url.searchParams.set('idp', affiliateId);
    url.hash = '';
    url.protocol = 'https:';
    url.port = '';
    return url.href;
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

  /* Icons from https://github.com/danielsebesta/fxalza (assets/emoji/small).
   * MIT License
   *
   * Copyright (c) 2026 Daniel Šebesta
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  const PROMO_ICONS = {
    plus: 'data:image/png;base64,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',
    coupon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtLjMzMzkwOCAuMzMzMDAxKSI+PHBhdGggZmlsbD0iI2M1MTcxOCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMTcsOS42NjdDMTcuMDAxLDkuMzY2IDE3LjA4NCw5LjA3IDE3LjIzOSw4LjgxMkMxNy4zOTUsOC41NTMgMTcuNjE3LDguMzQyIDE3Ljg4Myw4LjJDMTguMTI4LDguMDU0IDE4LjMyOSw3Ljg0NiAxOC40NjYsNy41OTdDMTguNjA0LDcuMzQ4IDE4LjY3Myw3LjA2NyAxOC42NjYsNi43ODNMMTguNjY2LDQuNjY3QzE4LjY2NSw0LjIyNSAxOC40ODksMy44MDIgMTguMTc3LDMuNDlDMTcuODY1LDMuMTc4IDE3LjQ0MiwzLjAwMiAxNywzTDMuNjY3LDNDMy40NSwzIDMuMjM0LDMuMDQyIDMuMDMyLDMuMTI2QzIuODMxLDMuMjA5IDIuNjQ4LDMuMzMxIDIuNDk0LDMuNDg1QzIuMzQsMy42MzkgMi4yMTgsMy44MjIgMi4xMzQsNC4wMjNDMi4wNTEsNC4yMjQgMi4wMDgsNC40NCAyLjAwOCw0LjY1OEwyLjAwOCw2Ljc4M0MxLjk5OSw3LjA2NyAyLjA2Nyw3LjM0NyAyLjIwNSw3LjU5NUMyLjM0Myw3Ljg0MyAyLjU0Niw4LjA0OSAyLjc5MSw4LjE5MUMzLjA1Niw4LjMzNiAzLjI3Nyw4LjU0OSAzLjQzMSw4LjgwOUMzLjU4NSw5LjA2OCAzLjY2Niw5LjM2NCAzLjY2Niw5LjY2NkMzLjY2Nyw5Ljk2OCAzLjU4NSwxMC4yNjQgMy40MjksMTAuNTIyQzMuMjczLDEwLjc4MSAzLjA1LDEwLjk5MiAyLjc4MywxMS4xMzNDMi41MzksMTEuMjc5IDIuMzM4LDExLjQ4NyAyLjIwMSwxMS43MzZDMi4wNjMsMTEuOTg1IDEuOTk0LDEyLjI2NiAyLDEyLjU1TDIsMTQuNjY3QzIuMDAyLDE1LjEwOSAyLjE3OCwxNS41MzIgMi40OSwxNS44NDRDMi44MDIsMTYuMTU3IDMuMjI2LDE2LjMzMyAzLjY2NywxNi4zMzRMMTcsMTYuMzM0QzE3LjQ0MiwxNi4zMzMgMTcuODY1LDE2LjE1NyAxOC4xNzgsMTUuODQ0QzE4LjQ5LDE1LjUzMiAxOC42NjYsMTUuMTA5IDE4LjY2NywxNC42NjdMMTguNjY3LDEyLjU1QzE4LjY3NCwxMi4yNjYgMTguNjA1LDExLjk4NSAxOC40NjcsMTEuNzM2QzE4LjMzLDExLjQ4NyAxOC4xMjksMTEuMjc5IDE3Ljg4NCwxMS4xMzNDMTcuNjE4LDEwLjk5MSAxNy4zOTYsMTAuNzggMTcuMjQsMTAuNTIyQzE3LjA4NCwxMC4yNjQgMTcuMDAyLDkuOTY4IDE3LDkuNjY3Wk0xMi40MTcsMTMuMDg0TDEwLjMzMywxMS43NUw4LjI1LDEzLjA5MkM4LjE4LDEzLjEzNiA4LjA5NywxMy4xNTggOC4wMTQsMTMuMTU1QzcuOTMsMTMuMTUyIDcuODUsMTMuMTI0IDcuNzgzLDEzLjA3NUM3LjcxNSwxMy4wMjYgNy42NjQsMTIuOTU3IDcuNjM2LDEyLjg3OUM3LjYwOCwxMi44IDcuNjA0LDEyLjcxNSA3LjYyNSwxMi42MzRMOC4yNSwxMC4yMzRMNi4zMzMsOC42NjdDNi4yNjgsOC42MTMgNi4yMjEsOC41NDIgNi4xOTcsOC40NjFDNi4xNzQsOC4zOCA2LjE3NSw4LjI5NCA2LjIwMSw4LjIxM0M2LjIyNyw4LjEzMyA2LjI3Nyw4LjA2MyA2LjM0NCw4LjAxMUM2LjQxMSw3Ljk2IDYuNDkxLDcuOTMgNi41NzUsNy45MjVMOS4wNDIsNy43ODNMOS45NDIsNS40OTFDOS45NzMsNS40MTMgMTAuMDI3LDUuMzQ3IDEwLjA5Niw1LjNDMTAuMTY1LDUuMjUzIDEwLjI0Niw1LjIyOCAxMC4zMyw1LjIyOEMxMC40MTMsNS4yMjggMTAuNDk1LDUuMjUzIDEwLjU2NCw1LjNDMTAuNjMzLDUuMzQ3IDEwLjY4Nyw1LjQxMyAxMC43MTcsNS40OTFMMTEuNjE3LDcuNzkxTDE0LjA4NCw3LjkzM0MxNC4xNjgsNy45MzkgMTQuMjQ4LDcuOTY5IDE0LjMxNCw4LjAyMUMxNC4zOCw4LjA3MyAxNC40Myw4LjE0MyAxNC40NTYsOC4yMjJDMTQuNDgyLDguMzAyIDE0LjQ4Myw4LjM4OCAxNC40Niw4LjQ2OEMxNC40MzcsOC41NDkgMTQuMzksOC42MjEgMTQuMzI2LDguNjc1TDEyLjQwOSwxMC4yNDJMMTMuMDQyLDEyLjYyNUMxMy4wNjUsMTIuNzA2IDEzLjA2MiwxMi43OTIgMTMuMDM1LDEyLjg3MkMxMy4wMDcsMTIuOTUxIDEyLjk1NiwxMy4wMjEgMTIuODg4LDEzLjA3QzEyLjgyLDEzLjEyIDEyLjczOSwxMy4xNDggMTIuNjU1LDEzLjE1QzEyLjU3MSwxMy4xNTIgMTIuNDg4LDEzLjEyOSAxMi40MTcsMTMuMDgzTDEyLjQxNywxMy4wODRaIi8+PC9nPjwvc3ZnPgo=',
    cashback: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9Imljb24tY2FzaGJhY2siID4KPHBhdGggaWQ9InNoYXBlIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTE0LjM5MiA1Ljc0MkMxNS42ODk4IDUuOTkzNTIgMTYuODU5NSA2LjY4ODgxIDE3LjcwMDcgNy43MDg2QzE4LjU0MTggOC43MjgzOCAxOS4wMDE4IDEwLjAwOTEgMTkuMDAxOCAxMS4zMzFDMTkuMDAxOCAxMi42NTI5IDE4LjU0MTggMTMuOTMzNiAxNy43MDA3IDE0Ljk1MzRDMTYuODU5NSAxNS45NzMyIDE1LjY4OTggMTYuNjY4NSAxNC4zOTIgMTYuOTJDMTUuMzczIDE2LjM1MzUgMTYuMTg3NiAxNS41Mzg4IDE2Ljc1MzkgMTQuNTU3N0MxNy4zMjAzIDEzLjU3NjcgMTcuNjE4NCAxMi40NjM4IDE3LjYxODQgMTEuMzMxQzE3LjYxODQgMTAuMTk4MiAxNy4zMjAzIDkuMDg1MzUgMTYuNzUzOSA4LjEwNDI4QzE2LjE4NzYgNy4xMjMyMiAxNS4zNzMgNi4zMDg1IDE0LjM5MiA1Ljc0MlpNNi4yMDAwMSAxMy4yNzZMNy44MTMwMSAxMS4wNjlDOC4wNDQwNCAxMC43NTE4IDguMTY4MzUgMTAuMzY5NCA4LjE2ODAxIDkuOTc3QzguMTcxOTUgOS41NjcyOCA4LjAzNjY4IDkuMTY4MzUgNy43ODQzNSA4Ljg0NTUzQzcuNTMyMDEgOC41MjI3MSA3LjE3NzU2IDguMjk1MTEgNi43NzkwMSA4LjJDNy4yNDg0MSA3LjQ2NTA2IDcuODg1ODUgNi44NTIyOCA4LjYzODcxIDYuNDEyMjFDOS4zOTE1OCA1Ljk3MjE0IDEwLjIzODMgNS43MTczOSAxMS4xMDkgNS42NjlIMTEuMTQ2QzExLjIyNzMgNS42NjU2NyAxMS4zMDkzIDUuNjY0IDExLjM5MiA1LjY2NEMxMi4xMTcxIDUuNjU5ODMgMTIuODM1NiA1LjgwMjY0IDEzLjUwNCA2LjA4MzgyQzE0LjE3MjQgNi4zNjUwMSAxNC43NzY5IDYuNzc4NzIgMTUuMjgxIDcuM0MxNi4zMjYyIDguMzgxOTkgMTYuOTEzMyA5LjgyNTY3IDE2LjkyIDExLjMzQzE2LjkzODcgMTIuODE0OSAxNi4zNjY4IDE0LjI0NjQgMTUuMzMwMSAxNS4zMDk3QzE0LjI5MzUgMTYuMzczIDEyLjg3NjkgMTYuOTgxIDExLjM5MiAxN0MxMC42NjYyIDE3LjAwNDIgOS45NDY5OSAxNi44NjExIDkuMjc4MDMgMTYuNTc5NEM4LjYwOTA2IDE2LjI5NzcgOC4wMDQxOSAxNS44ODMyIDcuNTAwMDEgMTUuMzYxQzYuOTIxNDMgMTQuNzY3OCA2LjQ3Nzk2IDE0LjA1NjYgNi4yMDAwMSAxMy4yNzZaTTEyLjA4MiAxMy40NTdWOS4ySDEwLjdMMTAuMDExIDEwLjYxN0gxMC43VjEzLjQ1MkwxMi4wODIgMTMuNDU3Wk0yLjc5MDAxIDkuMzcxQzIuNzgzMiA3LjQ0NzU3IDMuNTMwOTYgNS41OTgxOCA0Ljg3MjY4IDQuMjJDNi4yMTQ0IDIuODQxODEgOC4wNDMwOSAyLjA0NDc2IDkuOTY2MDEgMlY0LjQ1NkM4LjY4Mjk1IDQuNDkwNzUgNy40NjM2NiA1LjAyMjkyIDYuNTY1NzMgNS45NDAwNkM1LjY2NzgxIDYuODU3MjEgNS4xNjE1OCA4LjA4NzUgNS4xNTQwMSA5LjM3MUg2LjQwMDAxQzYuNTU4NDQgOS4zNzM2MyA2LjcwOTQgOS40Mzg4MyA2LjgxOTk0IDkuNTUyMzdDNi45MzA0OCA5LjY2NTkgNi45OTE2MSA5LjgxODU1IDYuOTkwMDEgOS45NzdDNi45OTAyNCAxMC4xMDc4IDYuOTQ4OTIgMTAuMjM1MiA2Ljg3MjAxIDEwLjM0MUw0LjQ2NzAxIDEzLjYzMkM0LjQyMTYxIDEzLjY5NTMgNC4zNjM5MSAxMy43NDg5IDQuMjk3MzcgMTMuNzg5NEM0LjIzMDgzIDEzLjgyOTkgNC4xNTY4IDEzLjg1NjYgNC4wNzk3IDEzLjg2NzlDNC4wMDI2MSAxMy44NzkyIDMuOTI0MDMgMTMuODc0OSAzLjg0ODY2IDEzLjg1NTFDMy43NzMyOCAxMy44MzU0IDMuNzAyNjYgMTMuODAwNiAzLjY0MTAxIDEzLjc1M0MzLjU5NjE2IDEzLjcxODQgMy41NTY0MyAxMy42Nzc3IDMuNTIzMDEgMTMuNjMyTDEuMTE4MDEgMTAuMzQxQzEuMDIzODMgMTAuMjExOCAwLjk4MzQ5OCAxMC4wNTEgMS4wMDU1MSA5Ljg5MjY2QzEuMDI3NTIgOS43MzQyOSAxLjExMDE2IDkuNTkwNjQgMS4yMzYwMSA5LjQ5MkMxLjMzNzQgOS40MTM2NyAxLjQ2MTg4IDkuMzcxMTMgMS41OTAwMSA5LjM3MUgyLjc5MDAxWiIgZmlsbD0iIzY4OTcwMCIvPgo8L2c+Cjwvc3ZnPgo=',
    tradein: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9Imljb24tc2NyYXBwYWdlIj4KPHBhdGggaWQ9InNoYXBlIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTEyLjI4NTIgMTQuODQyMkgxNC44NDUyQzE0Ljk4MDEgMTQuODM5OCAxNS4xMTMzIDE0LjgxMDYgMTUuMjM2OSAxNC43NTY0QzE1LjM2MDUgMTQuNzAyMSAxNS40NzIgMTQuNjIzOSAxNS41NjUyIDE0LjUyNjJMMTYuMTI1MiAxMy43MzcyQzE2LjE5NjMgMTMuNjE5OSAxNi4yNDA0IDEzLjQ4ODIgMTYuMjU0MiAxMy4zNTE3QzE2LjI2ODEgMTMuMjE1MyAxNi4yNTEzIDEzLjA3NzQgMTYuMjA1MiAxMi45NDgyTDE0Ljg0NTIgMTAuNjU5MkwxNi4yMDUyIDkuODcwMjFMMTcuNTY1MiAxMi4xNTkyQzE3Ljc5NTYgMTIuNTMzMyAxNy45MDQgMTIuOTY5OCAxNy44NzUzIDEzLjQwODJDMTcuODQ2NyAxMy44NDY2IDE3LjY4MjQgMTQuMjY1MyAxNy40MDUyIDE0LjYwNjJMMTYuODQ1MiAxNS4zOTUyQzE2LjYxNDQgMTUuNzA5OCAxNi4zMTM1IDE1Ljk2NjMgMTUuOTY2MyAxNi4xNDQ0QzE1LjYxOTIgMTYuMzIyNSAxNS4yMzUzIDE2LjQxNzMgMTQuODQ1MiAxNi40MjEySDEyLjI4NTJWMTguMDAwMkw5Ljg4NTE5IDE1LjYzMjJMMTIuMjg1MiAxMy4yNjQyVjE0Ljg0MjJaTTEyLjc4NTIgNy4yNzAyMUwxMS40ODUyIDUuMDUzMjFDMTEuNDA5MiA0LjkwNzUzIDExLjI5NDEgNC43ODU5NyAxMS4xNTI3IDQuNzAyMjJDMTEuMDExNCA0LjYxODQ3IDEwLjg0OTQgNC41NzU4NyAxMC42ODUyIDQuNTc5MjFIOS4wODUxOUM4LjkyMDkyIDQuNTc1ODcgOC43NTg5OSA0LjYxODQ3IDguNjE3NjUgNC43MDIyMkM4LjQ3NjMgNC43ODU5NyA4LjM2MTE1IDQuOTA3NTMgOC4yODUxOCA1LjA1MzIxTDcuMDA1MTkgNy4xODQyMUw1LjY0NTE5IDYuMzk1MjFMNi45MjUxOSA0LjI2MzIxQzcuMTM3IDMuODc2NzMgNy40NDk4NSAzLjU1NTA3IDcuODMwMyAzLjMzMjYyQzguMjEwNzUgMy4xMTAxNiA4LjY0NDUgMi45OTUyNiA5LjA4NTE5IDMuMDAwMjFIMTAuNjg1MkMxMS4xMzY4IDIuOTk0NDMgMTEuNTgxOSAzLjEwODIzIDExLjk3NTMgMy4zMzAwNEMxMi4zNjg3IDMuNTUxODYgMTIuNjk2NCAzLjg3MzgxIDEyLjkyNTIgNC4yNjMyMUwxNC4yMjUyIDYuNDA3MjFMMTUuNTYyMiA1LjYwNzIxTDE0Ljc2MjIgOC44NDQyMUwxMS40ODUyIDguMDUzMjFMMTIuNzg1MiA3LjI3MDIxWk01LjAxNTE5IDEwLjcyNzJMMy43MTUxOSAxMi45NDcyQzMuNjY5MDUgMTMuMDc2NCAzLjY1MjI5IDEzLjIxNDMgMy42NjYxMyAxMy4zNTA3QzMuNjc5OTcgMTMuNDg3MiAzLjcyNDA1IDEzLjYxODkgMy43OTUxOSAxMy43MzYyTDQuMzU1MTkgMTQuNTI1MkM0LjM1NTE5IDE0LjY4MzIgNC42NzUxOSAxNC44NDEyIDQuOTk1MTkgMTQuODQxMkg4LjI4NTE4VjE2LjQyMDJINS4wMDUxOUM0LjYxMzM5IDE2LjQyNTQgNC4yMjYyNyAxNi4zMzQ3IDMuODc3NjQgMTYuMTU1OEMzLjUyOTAxIDE1Ljk3NyAzLjIyOTQ3IDE1LjcxNTUgMy4wMDUxOSAxNS4zOTQyTDIuNDQ1MTkgMTQuNjA1MkMyLjE4NjA5IDE0LjI1NTkgMi4wMzMyIDEzLjgzOTMgMi4wMDQ4MiAxMy40MDUzQzEuOTc2NDQgMTIuOTcxMyAyLjA3Mzc5IDEyLjUzODMgMi4yODUxOSAxMi4xNTgyTDMuNjg1MTkgOS44ODMyMUwyLjI4NTE5IDkuMDAwMjFMNS41NjUxOSA4LjI4OTIxTDYuMjg1MTkgMTEuNTI2Mkw1LjAxNTE5IDEwLjcyNzJaIiBmaWxsPSIjNjg5NzAwIi8+CjwvZz4KPC9zdmc+Cg==',
  };

  function renderPromo(target, result) {
    target.textContent = '';
    const label = promoLabel(result);
    target.title = label;
    const kind = promoKind(result.priceType, result.coupon) || 'promo';
    if (kind !== 'promo') {
      const icon = node('img', null, target);
      icon.className = 'promo-icon';
      icon.src = PROMO_ICONS[kind];
      icon.alt = label;
      icon.width = 20;
      icon.height = 20;
    }
    // Preserve the code itself and unfamiliar promotion conditions as readable text.
    if (result.coupon) node('span', result.coupon, target).className = 'promo-code';
    else if (kind === 'tradein') node('span', T.tradeInBonus, target);
    else if (kind === 'cashback') node('span', 'Cashback', target);
    else if (kind === 'promo') node('span', label, target);
  }

  // Inspect only Alza's own product/navigation resources, never our detailPriceInfoV3 calls.
  function currentTierFromResource(name, id) {
    try {
      const url = new URL(name);
      if (url.origin !== 'https://webapi.alza.cz' || url.searchParams.get('country') !== country) return null;
      const product = url.pathname.match(/^\/api\/commodity\/v\d+\/(\d+)\/(ribbon|buyActions|reviewStats)\/?$/);
      const navigation = /\/navigation\/?$/.test(url.pathname);
      if ((!product || product[1] !== id) && !navigation) return null;
      const key = url.searchParams.get('pgrik');
      // Account-only aliases: recognize them without requesting extra price lists.
      if (key === 'p_pg2_a25f3') return 'GOLD+B2B';
      if (key === 'p_pg1cd1_af922') return 'SILVER+B2B';
      // #feature isic
      if (key === 'p_pg4is1_24abf') return 'GOLD+ISIC';
      if (key === 'p_pg5is1_16aa0') return 'BRONZE+ISIC';
      // #endfeature
      const tier = TIERS.find(tier => tier.pgrik === key);
      return tier ? (tier.accountName || tier.name) : null;
    } catch { return null; }
  }

  // Infer only a unique match against unconditional main prices, never promo prices.
  function currentTierFromPage(state) {
    if (state.loading) return null;
    const element = document.querySelector('[data-testid="price-primary"] .ads-pb__price');
    if (!element || (element.getClientRects && !element.getClientRects().length)) return null;
    const amount = parsePriceAmount(element.textContent);
    if (!(amount > 0)) return null;
    const precision = euro ? 100 : 1;
    const matches = state.rows.filter(row => {
      if (!row.data || row.error) return false;
      const main = findPricing(row.data)?.mainPriceTag;
      if (!main || (typeof main.primaryPricePrefix === 'string' && main.primaryPricePrefix.trim())) return false;
      const value = parsePriceAmount(main.primaryPrice);
      return value !== null && Math.round(value * precision) === Math.round(amount * precision);
    });
    return matches.length === 1 ? matches[0].tier.name : null;
  }

  function updateCurrentTier(state) {
    state.currentTierIcons?.forEach(icon => icon.remove());
    state.currentTierIcons = [];
    state.priceMatchedTier = state.currentTier ? null : currentTierFromPage(state);
    const currentTier = state.currentTier || state.priceMatchedTier;
    if (!currentTier) return;
    const corporateTier = { 'GOLD+B2B': 'Gold', 'SILVER+B2B': 'Silver', 'BRONZE+B2B': 'Bronze' }[currentTier];
    const b2bVisible = state.rows.some(row => row.tier.name === 'B2B' && row.valid && !row.tr.hidden);
    let priceTiers = corporateTier ? [b2bVisible ? 'B2B' : corporateTier]
      : [currentTier];
    // #feature isic
    const studentBase = { 'GOLD+ISIC': 'Gold', 'BRONZE+ISIC': 'Bronze' }[currentTier];
    if (studentBase) {
      const base = state.rows.find(row => row.tier.name === studentBase && row.valid);
      const isic = state.rows.find(row => row.tier.name === 'ISIC' && row.valid);
      priceTiers = [isic && base && isic.amount < base.amount ? 'ISIC' : studentBase];
    }
    // #endfeature
    const labels = priceTiers.flatMap(name => {
      const tier = TIERS.find(item => item.name === name);
      return [name.toUpperCase(), tier ? tierLabel(tier) : name.toUpperCase()];
    });
    for (const row of state.rows) {
      if (!row.valid || row.tr.hidden) continue;
      for (const badge of [row.badge, ...(row.extraBadges || [])]) {
        if (!labels.includes(badge.textContent)) continue;
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '15', height: '15', fill: 'currentColor', class: 'current-tier-icon', role: 'img', 'aria-label': T.yourTier.replace('{tier}', currentTier) })) icon.setAttribute(key, value);
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = T.yourTier.replace('{tier}', currentTier);
        icon.append(title);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 11.898q-1.74 0-2.971-1.231T7.797 7.695t1.232-2.968q1.23-1.23 2.971-1.23 1.74 0 2.972 1.23 1.23 1.228 1.231 2.968 0 1.74-1.231 2.972-1.232 1.23-2.972 1.231M3.797 18.03v-.74q0-.905.467-1.664a3.1 3.1 0 0 1 1.246-1.16q1.569-.78 3.192-1.174a14.108 14.108 0 0 1 6.608-.003q1.623.39 3.18 1.171.778.4 1.246 1.157t.467 1.673v.74q0 .944-.665 1.61-.665.665-1.61.665H6.072q-.945 0-1.61-.665a2.2 2.2 0 0 1-.665-1.61');
        icon.append(path);
        badge.append(icon);
        state.currentTierIcons.push(icon);
      }
    }
  }

  function watchCurrentTier(id, state) {
    const inspect = entries => {
      let detected = null;
      for (const entry of entries) {
        const tier = currentTierFromResource(entry.name, id);
        if (tier) detected = tier;
      }
      if (detected && detected !== state.currentTier) {
        state.currentTier = detected;
        updateCurrentTier(state);
      }
    };
    inspect(performance.getEntriesByType?.('resource') || []);
    if (typeof PerformanceObserver !== 'function') return () => {};
    const observer = new PerformanceObserver(list => inspect(list.getEntries()));
    try { observer.observe({ type: 'resource', buffered: true }); }
    catch { observer.disconnect(); return () => {}; }
    return () => observer.disconnect();
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

  // #feature tracker
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

  // #endfeature
  function photoAnchor(strip) {
    const gift = document.querySelector('[data-react-client-component="promoListModule"]');
    return gift && gift.parentNode.contains(strip) && !gift.contains(strip)
      && (strip.compareDocumentPosition(gift) & Node.DOCUMENT_POSITION_FOLLOWING) ? gift : strip;
  }

  // #feature tracker
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

  // #endfeature
  function place(host) {
    // Hlídačshopů's content lives in a closed shadow root; use its outer host.
    // Desktop only: offered whenever the photo strip is on the page.
    const strip = mobile ? null : photoStrip();
    stripAvailable = Boolean(strip);
    let tracker = null;
    let trackerMoved = false;
    if (belowPhotoOption) belowPhotoOption.hidden = !strip;
    // #feature tracker
    tracker = hasTracker ? document.querySelector('[data-hs], #hlidacShopu') : null;
    const canMoveTracker = hasTracker && !mobile && Boolean(tracker && strip);
    if (trackerPhotoOption) trackerPhotoOption.hidden = !canMoveTracker;
    trackerMoved = canMoveTracker && trackerBelowPhoto;
    if (trackerMoved) moveTrackerBelowPhoto(tracker, strip);
    else restoreTracker();
    // #endfeature
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
  :host{--row-h:28px;text-align:left;display:block;clear:both;font:400 13px Roboto,system-ui,sans-serif;color:#000;line-height:1.4;font-kerning:normal;font-variant-numeric:lining-nums;-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision}
  :host([hidden]),[hidden]{display:none!important}
  *{box-sizing:border-box;font-family:inherit}
  .sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
  section{position:relative;background:#fff;border:1px solid #e8e8e8;border-radius:14px;padding:8px}

  /* Table */
  table{border-collapse:collapse;table-layout:fixed;width:100%;margin:0}
  th:first-child{width:38%}th:nth-child(2){width:36%}th:last-child{width:26%}
  th,td{text-align:left;vertical-align:top;padding:10px 8px;border-bottom:1px solid #e8e8e8}
  th{font-size:14px;font-weight:400;color:#6b6b6b}
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
  .promo-icon{display:inline-block;width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:4px}
  .promo-code{vertical-align:middle;overflow-wrap:anywhere}
  .promo-label{display:block;margin-top:5px;font-size:12px;font-weight:400;color:#6b6b6b;line-height:1.4}

  /* Tier badges */
  .badges{display:flex;flex-wrap:wrap;gap:6px}
  .tier-badge{display:inline-flex;align-items:center;height:var(--row-h);padding:0 10px;border-radius:4px;font-size:14px;font-weight:700;line-height:1.2;text-transform:uppercase;background:#c2c2c2;color:#171717}
  .current-tier-icon{flex-shrink:0;margin-left:5px;color:inherit;vertical-align:middle}
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

  .promo-controls{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;margin-left:auto;max-width:100%;min-width:0}
  .promo-toggle{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:4px 8px;line-height:1.2;border:1px solid #e8e8e8;border-radius:8px;background:#fff;color:#6b6b6b;font:inherit;cursor:pointer}
  .promo-toggle img{flex-shrink:0;object-fit:contain}
  .promo-toggle[aria-pressed="false"]{color:#858585}
  .promo-toggle[aria-pressed="false"] img{opacity:.55}
  .promo-toggle:hover{background:#f5f5f5;border-color:#c2c2c2;color:#000}
  .promo-toggle:focus-visible{outline:2px solid #545fef;outline-offset:2px}

  /* Compact settings: price tiers, display switches and sharing. */
  .settings-dialog{width:460px;max-width:calc(100vw - 24px);max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid #e8e8e8;border-radius:16px;background:#fff;color:#171717;font:inherit;overflow:auto;overscroll-behavior:contain;box-shadow:0 20px 70px #0003}
  .settings-dialog::backdrop{background:#0006}
  .settings-header{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;background:#fff;border-bottom:1px solid #ededed}
  .settings-header h2{margin:0;font:inherit;font-size:16px;font-weight:600;line-height:1.4}
  .settings-close{flex-shrink:0}
  .settings{display:grid;gap:20px;padding:18px 20px 16px;margin:0}
  .settings fieldset{width:100%;min-width:0;margin:0;padding:0;border:0}
  .settings legend{padding:0;margin-bottom:8px;color:#606060;font-size:12px;font-weight:600}
  .settings label{cursor:pointer}
  .settings input{accent-color:#545fef;flex-shrink:0}
  .settings-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;width:100%}
  .settings-options>label{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:36px;padding:8px 10px;border:1px solid #e8e8e8;border-radius:8px;background:#fff;color:#777;font-size:12px;line-height:1.2}
  .settings-options>label>span{display:flex;align-items:center;gap:6px;min-width:0;order:-1}
  .settings-options>label>span:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--tier-dot,#b5b5b5);flex-shrink:0}
  .settings-options>label[data-tier="gold"]{--tier-dot:#d9b600}
  .settings-options>label[data-tier="isic"]{--tier-dot:#3cba9c}
  .settings-options>label[data-tier="bronze"]{--tier-dot:#d2822d}
  .settings-options>label[data-tier="b2b"]{--tier-dot:#3a349f}
  .settings-options>label input{appearance:none;-webkit-appearance:none;width:14px;height:14px;margin:0;border:1px solid #ccc;border-radius:4px;background:#fff;display:grid;place-content:center;cursor:pointer}
  .settings-options>label input:checked{background:#545fef;border-color:#545fef}
  .settings-options>label input:checked:after{content:"";width:6px;height:3px;border-left:1.5px solid #fff;border-bottom:1.5px solid #fff;transform:translateY(-1px) rotate(-45deg)}
  .settings-options>label:has(input:checked){color:#171717;border-color:#d7d7dc}
  .settings-options>label:hover{background:#fafafa;border-color:#aaa}
  .view-options,.share-options{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
  .option{min-width:0}
  .switch-label{display:grid;grid-template-columns:minmax(0,1fr) 34px;align-items:center;gap:12px;min-height:28px;font-size:13px;line-height:1.4}
  .switch-label>span{grid-column:1;grid-row:1}
  .switch-label>input{grid-column:2;grid-row:1;appearance:none;-webkit-appearance:none;position:relative;width:34px;height:20px;margin:0;border:1px solid #c2c2c2;border-radius:12px;background:#e8e8e8;cursor:pointer}
  .switch-label>input:after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0003}
  .switch-label>input:checked{background:#545fef;border-color:#545fef}
  .switch-label>input:checked:after{left:16px}
  .option-description{margin:2px 46px 0 0;color:#6b6b6b;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
  .affiliate-option{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;align-items:center;padding-top:2px}
  .affiliate-option>label{grid-column:1;grid-row:1;font-size:13px}
  .affiliate-option>.option-description{grid-column:1;grid-row:2;margin:0}
  .idp-wrap{position:relative;display:inline-flex;align-items:center;grid-column:2;grid-row:1/3}
  .idp-clear{position:absolute;right:4px;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:transparent;color:#6b6b6b;font-size:16px;line-height:1;cursor:pointer}
  .idp-clear:hover{background:#f0f0f0;color:#000}
  .settings .idp-input{width:112px;height:34px;padding:0 30px 0 9px;border:1px solid #c2c2c2;border-radius:8px;background:#fff;color:#000;font:inherit}
  .idp-clear:focus-visible{outline:2px solid #545fef;outline-offset:1px}
  .settings-info{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 12px;padding-top:10px;border-top:1px solid #e8e8e8;color:#6b6b6b;font-size:11px}
  .settings-info a,.credit a{color:inherit;text-decoration:underline;text-underline-offset:2px}
  .settings-only{border:0;padding:0}
  .settings-only .credit{margin-top:0;justify-content:flex-end}
  @media(pointer:coarse){.settings-options>label,.switch-label{min-height:40px}.settings .idp-input{height:40px}}
  @media(forced-colors:active){.settings-options>label input{appearance:auto;-webkit-appearance:auto}.settings-options>label input:after{display:none}.switch-label>input{appearance:auto;-webkit-appearance:auto}.switch-label>input:after{display:none}}

  @media(max-width:420px){
    section{padding:6px}
    th,td{padding:10px 6px}
    th{font-size:13px}
    .gear{width:32px;height:32px}
    .promo-toggle{min-height:32px;padding:3px 7px;gap:4px;font-size:12px}
    .promo-toggle img{width:18px;height:18px}
    .footer-buttons,.promo-controls{gap:5px}
    :host{--row-h:26px}
    .tier-badge{padding:0 7px;font-size:12px}
    .discount-value{padding:0 6px;font-size:13px}
    .promo-label{font-size:11px;overflow-wrap:anywhere}
    .settings-options{column-gap:8px}
    .settings-header{padding:12px 14px}
    .settings{padding:14px}
    .affiliate-option{grid-template-columns:minmax(0,1fr)}
    .affiliate-option>.option-description{grid-row:2}
    .idp-wrap{grid-column:1;grid-row:3;margin-top:5px}
    .settings input{flex-shrink:0}
  }
  `;

  // overflow:hidden alone does not lock the background behind a dialog in iOS Safari.
  // Fix the body at its current offset, then restore only the properties we changed.
  function lockBackgroundScroll() {
    const root = document.documentElement;
    const body = document.body;
    const x = window.scrollX || 0;
    const y = window.scrollY || 0;
    const scrollbar = Math.max(0, (window.innerWidth || 0) - (root.clientWidth || 0));
    const changes = [];
    function set(element, name, value) {
      const style = element.style;
      changes.push([style, name, style.getPropertyValue(name), style.getPropertyPriority(name)]);
      style.setProperty(name, value, 'important');
    }
    set(root, 'overflow', 'hidden');
    set(body, 'position', 'fixed');
    set(body, 'top', -y + 'px');
    set(body, 'left', -x + 'px');
    set(body, 'width', scrollbar ? 'calc(100% - ' + scrollbar + 'px)' : '100%');
    let locked = true;
    return () => {
      if (!locked) return;
      locked = false;
      for (const [style, name, value, priority] of changes.reverse()) {
        if (value) style.setProperty(name, value, priority);
        else style.removeProperty(name);
      }
      // A page-wide smooth-scroll rule must not animate returning to the saved position.
      const behavior = root.style.getPropertyValue('scroll-behavior');
      const priority = root.style.getPropertyPriority('scroll-behavior');
      root.style.setProperty('scroll-behavior', 'auto', 'important');
      window.scrollTo(x, y);
      if (behavior) root.style.setProperty('scroll-behavior', behavior, priority);
      else root.style.removeProperty('scroll-behavior');
    };
  }

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
      const badge = node('div', tierLabel(tier), badges);
      badge.className = 'tier-badge tier-' + (tier.badge || tier.name.toLowerCase());
      const price = node('td', '—', tr);
      const discount = node('td', '—', tr);
      discount.className = 'discount';
      return { tier, price, discount, tr, badge, displayName: tierLabel(tier) };
    });
    const originalRow = node('tr', null, node('tfoot', null, table));
    originalRow.hidden = true;
    node('td', T.originalPrice, originalRow);
    const originalPrice = node('s', null, node('td', null, originalRow));
    node('td', '', originalRow);
    const promoControls = node('div');
    promoControls.className = 'promo-controls';
    promoControls.setAttribute('role', 'group');
    promoControls.setAttribute('aria-label', T.groupPromos);
    promoControls.hidden = true;
    const promoButtons = [
      { type: 4, label: 'AlzaPlus+', icon: 'plus', key: 'alza-plus-promos', get: () => alzaPlusPromos, set: value => { alzaPlusPromos = value; } },
      { type: 1, label: 'Cashback', icon: 'cashback', key: 'cashback-price-promos', get: () => cashbackPromos, set: value => { cashbackPromos = value; } },
      { type: 2, label: T.tradeInBonus, icon: 'tradein', key: 'trade-in-promos', get: () => tradeInPromos, set: value => { tradeInPromos = value; } },
    ].map(action => {
      const button = node('button', null, promoControls);
      button.type = 'button';
      button.className = 'promo-toggle';
      button.hidden = true;
      const icon = node('img', null, button);
      icon.src = PROMO_ICONS[action.icon];
      icon.alt = '';
      icon.width = 20;
      icon.height = 20;
      node('span', action.label, button);
      button.setAttribute('aria-label', action.label);
      button.onclick = () => {
        if (!isCurrent()) return;
        const value = !action.get();
        action.set(value);
        saveSetting(action.key, value);
        if (state.loaded) render(id, state);
      };
      return { ...action, button };
    });
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
    copy.title = useFxalza ? T.copyLink : T.copyOffer;
    copy.setAttribute('aria-label', useFxalza ? T.copyLink : T.copyOffer);
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
    footer.append(promoControls);
    // Keep the modal outside the movable panel. Reparenting an open dialog's ancestor
    // removes it from the browser's top layer and can leave it displayed inline.
    const settingsHost = node('div');
    settingsHost.id = 'local-alza-price-settings';
    settingsHost.style.display = 'contents';
    const settingsShadow = settingsHost.attachShadow({ mode: 'open' });
    node('style', PANEL_CSS, settingsShadow);
    const settingsDialog = node('dialog', null, settingsShadow);
    settingsDialog.className = 'settings-dialog';
    settingsDialog.id = 'price-settings-dialog';
    settingsDialog.setAttribute('aria-labelledby', 'price-settings-title');
    const settingsHeader = node('div', null, settingsDialog);
    settingsHeader.className = 'settings-header';
    const settingsHeading = node('h2', T.settingsTitle, settingsHeader);
    settingsHeading.id = 'price-settings-title';
    const closeSettings = node('button', null, settingsHeader);
    closeSettings.type = 'button';
    closeSettings.className = 'gear settings-close';
    closeSettings.setAttribute('aria-label', T.closeSettings);
    closeSettings.title = T.closeSettings;
    closeSettings.append(svgIcon('M6 6L18 18 M18 6L6 18'));
    const settings = node('div', null, settingsDialog);
    settings.className = 'settings';
    settings.id = 'price-tier-settings';
    settings.hidden = true;
    gear.setAttribute('aria-haspopup', 'dialog');
    let unlockScroll = null;
    let disposed = false;
    let stopTierWatch = () => {};
    const state = { dispose: () => { disposed = true; stopTierWatch(); unlockScroll?.(); unlockScroll = null; if (settingsDialog.open) settingsDialog.close(); settingsHost.remove(); clearTimeout(copyReset); }, host, rows, table, section, status, priceNote, notice, loadError, settings, copy, retry, originalRow, originalPrice, promoControls, promoButtons, settingsDialog, settingsHost, gear, loaded: false, loading: false };
    let copyReset = 0;
    function setCopyState(label, className) {
      copy.className = className ? 'gear ' + className : 'gear';
      copy.title = label;
      copy.setAttribute('aria-label', label);
    }
    function resetCopy() {
      clearTimeout(copyReset);
      setCopyState(useFxalza ? T.copyLink : T.copyOffer);
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
      // #feature fxalza
      if (useFxalza) return shareUrl();
      // #endfeature
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
            block.push('- ' + (entry.names.length && !bare ? '**' + offerTierNames(entry.names) + '**: ' : '') + priceText(entry));
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
    settingsDialog.onclose = () => {
      if (settingsDialog.open) return;
      unlockScroll?.();
      unlockScroll = null;
      settings.hidden = true;
      gear.setAttribute('aria-expanded', 'false');
      if (!disposed && isCurrent()) gear.focus({ preventScroll: true });
    };
    closeSettings.onclick = () => settingsDialog.close();
    // Native dialog supplies focus trapping and Escape; backdrop clicks close only outside the box.
    let backdropPress = false;
    const outsideDialog = event => {
      if (event.target !== settingsDialog) return false;
      const box = settingsDialog.getBoundingClientRect();
      return event.clientX < box.left || event.clientX > box.right
        || event.clientY < box.top || event.clientY > box.bottom;
    };
    settingsDialog.onpointerdown = event => { backdropPress = outsideDialog(event); };
    settingsDialog.onclick = event => {
      if (backdropPress && outsideDialog(event)) settingsDialog.close();
      backdropPress = false;
    };
    gear.onclick = () => {
      if (!isCurrent()) return;
      if (settingsDialog.open) { settingsDialog.close(); return; }
      settings.hidden = false;
      unlockScroll?.();
      unlockScroll = lockBackgroundScroll();
      try { settingsDialog.showModal(); }
      catch (error) {
        unlockScroll();
        unlockScroll = null;
        settings.hidden = true;
        throw error;
      }
      gear.setAttribute('aria-expanded', 'true');
      closeSettings.focus({ preventScroll: true });
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
      const tierLabel = addCheckbox(tierOptions, tier.name, enabled[tier.name], value => {
        enabled[tier.name] = value;
        change('enabled-price-tiers', { ...savedTiers, ...enabled });
      });
      tierLabel.setAttribute('data-tier', tier.name.toLowerCase());
    }
    const viewOptions = addGroup(T.groupView, 'settings-options view-options');
    let optionId = 0;
    function viewOption(text, hint, checked, update, parent = viewOptions) {
      const option = node('div', null, parent);
      option.className = 'option';
      const label = addCheckbox(option, text, checked, update);
      label.className = 'switch-label';
      option.checkbox = label.children[0];
      option.checkbox.setAttribute('role', 'switch');
      const description = node('p', hint, option);
      description.className = 'option-description';
      description.id = 'price-option-' + (++optionId);
      option.checkbox.setAttribute('aria-describedby', description.id);
      return option;
    }
    viewOption(T.optAlways,
      T.optAlwaysHint,
      alwaysShow, value => { alwaysShow = value; change('always-show-tiers', value); });
    belowPhotoOption = viewOption(T.optLeft,
      T.optLeftHint,
      belowPhoto, value => {
        belowPhoto = value;
        // #feature tracker
        if (value) {
          trackerBelowPhoto = false;
          trackerPhotoOption.checkbox.checked = false;
          saveSetting('tracker-below-photo', false);
        }
        // #endfeature
        saveSetting('panel-below-photo', value);
        mount(host);
      });
    belowPhotoOption.hidden = true;
  // #feature tracker
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
  // #endfeature
    // #betteralza settings
    const shareOptions = addGroup(T.groupShare, 'share-options');
    // #feature fxalza
    if (hasFxalza) {
      viewOption(T.useFxalza, T.fxalzaHint, useFxalza, value => {
        useFxalza = value;
        saveSetting('copy-fxalza', value);
        resetCopy();
        if (state.loaded) render(id, state);
      }, shareOptions);
    }
    // #endfeature
    const idpRow = node('div', null, shareOptions);
    idpRow.className = 'affiliate-option';
    const idpLabel = node('label', 'Affiliate ID', idpRow);
    idpLabel.setAttribute('for', 'price-affiliate-id');
    const idpDescription = node('p', T.affiliateHint, idpRow);
    idpDescription.className = 'option-description';
    idpDescription.id = 'price-affiliate-description';
    const idpWrap = node('span', null, idpRow);
    idpWrap.className = 'idp-wrap';
    const idpInput = node('input', null, idpWrap);
    idpInput.id = 'price-affiliate-id';
    idpInput.setAttribute('aria-describedby', 'price-affiliate-description');
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
    document.body.append(settingsHost);
    mount(host);
    stopTierWatch = watchCurrentTier(id, state);
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

  // SILVER/BRONZE are inferred only from matching GOLD/BASIC prices and promotion payloads.
  // This is a pricing hierarchy assumption, not a verified response for those tiers.
  function matchingGoldBasic(gold, basic) {
    if (!gold || !basic) return false;
    const g = extractPrice(gold, true, { plus: true, cashback: true, tradeIn: true });
    const b = extractPrice(basic, true, { plus: true, cashback: true, tradeIn: true });
    if (!(g?.mainAmount > 0) || g.mainAmount !== b?.mainAmount) return false;
    const gp = pricingMemo.get(gold), bp = pricingMemo.get(basic);
    return gp.mainPriceTag?.priceType === bp.mainPriceTag?.priceType
      && gp.mainPriceTag?.comparePrice === bp.mainPriceTag?.comparePrice
      && JSON.stringify(gp.promoPrices || []) === JSON.stringify(bp.promoPrices || []);
  }

  async function loadTierBatch(rows, loadRow, isCurrent = () => true, infer = true) {
    const gold = rows.find(row => row.tier.name === 'Gold');
    const basic = rows.find(row => row.tier.reference);
    if (!infer || !gold || !basic) { await Promise.all(rows.map(loadRow)); return; }
    const deferred = rows.filter(row => ['Silver', 'Bronze'].includes(row.tier.name));
    const started = new Map(rows.filter(row => !deferred.includes(row)).map(row => [row, loadRow(row)]));
    await Promise.all([started.get(gold), started.get(basic)]);
    if (!isCurrent()) { await Promise.all(started.values()); return; }
    const same = matchingGoldBasic(gold.data, basic.data);
    await Promise.all([
      ...started.values(),
      ...deferred.map(row => {
        if (!same) return loadRow(row);
        row.data = gold.data;
        row.error = null;
        row.requested = false;
        row.source = 'inferred-gold-basic';
      }),
    ]);
  }

  // The offer to copy: every tier with a discount, whatever tiers, promos or view the user has switched on.
  async function buildOffer(id, allowStale = false) {
    const all = { plus: true, cashback: true, tradeIn: true };
    const rows = TIERS.map(tier => ({ tier }));
    await loadTierBatch(rows, async row => {
      try { row.data = await tierData(id, row.tier, null, allowStale); }
      catch (error) { debug(row.tier.name + ': ' + error.message); }
    });
    const found = rows.map(({ tier, data }) => {
      const resolved = resolveTierPrice(data, tier, all);
      return resolved ? { tier, ...resolved } : null;
    });
    const basic = found.find(item => item?.tier.reference);
    // #feature isic
    correctIsicPrices(found);
    // #endfeature
    const bronze = found.find(item => item?.tier.name === 'Bronze');
    const b2bUseful = item => item.tier.name !== 'B2B' || compareWithBronze(item.result.amount, bronze?.comparison?.amount) === null;
    const discounted = item => item?.result?.discountPercent > 0;
    const tiers = found.filter(item => item && !item.tier.reference && discounted(item) && b2bUseful(item)
      && (!basic?.result || compareWithBasic(item.result, basic.result) === null));
    const toEntry = (item, result = item.result) => (
      { tier: item.tier, names: [tierLabel(item.tier)], amount: result.amount, result });
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
      const priced = found.filter(item => item?.result && b2bUseful(item)).sort((a, b) => a.result.amount - b.result.amount);
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
    // B2B is meaningful only against BRONZE; load its reference even if its row is disabled.
    const bronze = state.rows.find(row => row.tier.name === 'Bronze');
    if (!retry && targets.some(row => row.tier.name === 'B2B') && bronze
      && !bronze.data && !bronze.error && !targets.includes(bronze)) targets.push(bronze);
    await loadTierBatch(targets, loadRow, () => run === generation, !retry);
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
      const label = node('span', null, row.price);
      label.className = 'promo-label';
      renderPromo(label, result);
    }
    row.amount = result.amount;
    row.result = result;
    row.valid = true;
    row.tr.hidden = false;
  }

  function updatePromoControls(state) {
    if (!state.promoControls) return;
    const available = new Set();
    for (const row of state.rows) {
      if (!row.data || row.error) continue;
      const pricing = pricingMemo.get(row.data) || findPricing(row.data);
      for (const promo of pricing?.promoPrices || []) {
        if (extractPrice({ mainPriceTag: promo }, true)?.amount > 0) available.add(promo.priceType);
      }
    }
    for (const action of state.promoButtons) {
      action.button.hidden = !available.has(action.type);
      const active = action.get();
      action.button.setAttribute('aria-pressed', String(active));
      action.button.title = (active ? T.excludePromo : T.includePromo).replace('{action}', () => action.label);
    }
    state.promoControls.hidden = !state.promoButtons.some(action => !action.button.hidden);
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
    updatePromoControls(state);
    // #feature isic
    correctIsicPrices(prices);
    // #endfeature
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
    state.priceNote.textContent = '';
    if (sharedPromo) renderPromo(state.priceNote, sorted[0].result);
    state.priceNote.hidden = !sharedPromo;
    state.section.classList.toggle('shared-promo', Boolean(sharedPromo));
    state.table.hidden = !hasPrices;
    updateCurrentTier(state);
    // Nothing loaded and at least one request failed: tell the user instead of showing an empty panel.
    const anyValidOrCompared = state.rows.some(row => row.valid || row.comparisonAmount !== null);
    const loadFailed = failed > 0 && !anyValidOrCompared;
    state.notice.hidden = !showNotice;
    state.loadError.hidden = !loadFailed;
    state.retry.hidden = failed === 0;
    state.retry.disabled = state.loading;
    state.retry.textContent = state.loading ? T.loading : T.retry;
    state.section.classList.toggle('footer-message', showNotice || loadFailed);
    state.section.classList.toggle('settings-only', !hasPrices && !showNotice && !loadFailed && !failed && (!state.promoControls || state.promoControls.hidden));
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
        currentPriceList: state.currentTier || state.priceMatchedTier || null,
        currentPriceListSource: state.currentTier ? 'pgrik' : state.priceMatchedTier ? 'page-price' : null,
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
        inferredTiers: state.rows.filter(row => row.source === 'inferred-gold-basic').map(row => row.tier.name),
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
    state.copy.hidden = !useFxalza && !anyValidOrCompared && TIERS.some(tier => enabled[tier.name]);
  }

  function filterRows(rows) {
    const basic = rows.find(row => row.tier.reference);
    const bronze = rows.find(row => row.tier.name === 'Bronze');
    for (const row of rows) {
      row.displayName = tierLabel(row.tier);
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
      if (row.tier.name === 'B2B' && visible) {
        const comparison = compareWithBronze(row.amount, bronze?.comparisonAmount);
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
      target.displayName = offerTierNames([target.displayName, source.displayName]);
      const extra = node('div', source.tier.name === 'B2B' ? 'B2B' : source.displayName, target.badge.parentNode);
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
    // #betteralza sync
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
      // #feature tracker
      restoreTracker();
      // #endfeature
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
    if (panel?.loaded && !panel.currentTier && currentTierFromPage(panel) !== (panel.priceMatchedTier || null)) updateCurrentTier(panel);
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

  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
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
      // #feature tracker
      restoreTracker();
      // #endfeature
      panel?.dispose();
      cancel();
    }
  });
})().catch(error => console.error('%s', 'Alza Benefit Prices – Startup failed: ' + error.message, error));
