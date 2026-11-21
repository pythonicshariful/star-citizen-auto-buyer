/**
 * Test harness for star-citizen-auto-buyer.user.js — run with: node test/test-harness.js
 * No browser needed. Loads the userscript's pure functions via Function()
 * (window/document are undefined in Node, so the Tampermonkey UI never boots)
 * and checks them against real RSI API fixtures + synthetic wave fixtures.
 * Also statically asserts the script never refreshes the page to poll.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_PATH = path.join(ROOT, 'star-citizen-auto-buyer.user.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

// Load the userscript as a CommonJS-ish module in Node.
const moduleObj = { exports: {} };
const loader = new Function('module', 'exports', 'window', 'document', SRC);
loader(moduleObj, moduleObj.exports, undefined, undefined);
const bot = moduleObj.exports;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' :: ' + extra : '')); }
}
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

const KRAKEN = { name: 'Kraken', url: 'https://robertsspaceindustries.com/en/pledge/ships/drake-kraken/Kraken', productId: '72', maxPrice: 1400, preferWarbond: true, qty: 1 };

console.log('== 1. URL parsing ==');
check('parses "Kraken" from pledge URL', bot.parseShipNameFromUrl(KRAKEN.url) === 'Kraken', bot.parseShipNameFromUrl(KRAKEN.url));
check('parses ship name from another pledge URL', bot.parseShipNameFromUrl('https://robertsspaceindustries.com/en/pledge/ships/drake-cutlass/Cutlass-Black') === 'Cutlass Black');
check('bad URL returns null', bot.parseShipNameFromUrl('not a url') === null || typeof bot.parseShipNameFromUrl('not a url') === 'string');

console.log('== 2. Price + stock helpers ==');
check('priceUsd converts cents (140000 -> 1400)', bot.priceUsd(140000) === 1400);
check('priceUsd converts cents (1500 -> 15)', bot.priceUsd(1500) === 15);
check('priceUsd null -> null', bot.priceUsd(null) === null);
check('stockState in_stock', bot.stockState({ stock: { available: true } }) === 'in_stock');
check('stockState out_of_stock', bot.stockState({ stock: { available: false } }) === 'out_of_stock');
check('stockState unknown on missing stock', bot.stockState({}) === 'unknown');
check('withinCap: $1400 <= $1400 cap', bot.withinCap({ price: { amount: 140000 } }, 1400) === true);
check('withinCap: $1650 > $1400 cap', bot.withinCap({ price: { amount: 165000 } }, 1400) === false);
check('withinCap: unknown price is NOT buyable', bot.withinCap({ price: { amount: null } }, 1400) === false);

console.log('== 3. SKU picking — real Kraken-absent fixture (live 2026-11-21) ==');
const absent = bot.parseStockResponse(loadFixture('kraken-absent-product72.json'));
check('fixture parses, SKUs present', absent.skus.length >= 4, 'got ' + absent.skus.length);
const rAbsent = bot.findTargetSku(absent.skus, KRAKEN);
check('Kraken absent from list -> not_listed, no SKU', rAbsent.sku === null && rAbsent.reason === 'not_listed', rAbsent.reason);
const ptv = bot.findTargetSku(absent.skus, { name: 'PTV - 10 Year', maxPrice: 20, preferWarbond: false });
check('PTV - 10 Year ($15) found in stock under $20 cap', ptv.sku !== null && ptv.reason === 'in_stock' && ptv.sku.id === '17209', JSON.stringify(ptv.sku && ptv.sku.id));
const pioneer = bot.findTargetSku(absent.skus, { name: 'Pioneer', maxPrice: 1000, preferWarbond: true });
check('Pioneer (both SKUs OOS) -> out_of_stock', pioneer.sku === null && pioneer.reason === 'out_of_stock', pioneer.reason);
const galaxy = bot.findTargetSku(absent.skus, { name: 'Galaxy', maxPrice: 400, preferWarbond: true });
check('Galaxy: warbond $360 preferred over standard $400', galaxy.sku !== null && galaxy.sku.isWarbond === true && bot.priceUsd(galaxy.sku.price.amount) === 360, JSON.stringify(galaxy.sku));

console.log('== 4. SKU picking — synthetic Kraken wave fixtures ==');
const live = bot.parseStockResponse(loadFixture('kraken-in-stock-synthetic.json'));
const rLive = bot.findTargetSku(live.skus, KRAKEN);
check('Kraken wave live -> warbond $1400 picked', rLive.sku !== null && rLive.reason === 'in_stock' && rLive.sku.isWarbond === true && bot.priceUsd(rLive.sku.price.amount) === 1400, JSON.stringify(rLive.sku));
const over = bot.parseStockResponse(loadFixture('kraken-over-max-price.json'));
const rOver = bot.findTargetSku(over.skus, KRAKEN);
check('Only standard $1650 in stock -> over_max_price, NO buy', rOver.sku === null && rOver.reason === 'over_max_price', rOver.reason);
const noWarbondPref = bot.findTargetSku(live.skus, { name: 'Kraken', maxPrice: 2000, preferWarbond: false });
check('Cap $2000, no warbond pref -> cheapest ($1400) picked', noWarbondPref.sku !== null && bot.priceUsd(noWarbondPref.sku.price.amount) === 1400);

console.log('== 5. GraphQL builders ==');
const q = bot.buildStockQuery('72', 1000);
check('stock query targets /graphql op GetProductWithSkusPrice', q.operationName === 'GetProductWithSkusPrice' && q.variables.query.products.ids[0] === '72');
check('stock query asks for stock + isWarbond + price', /stock\s*\{[^}]*available/.test(q.query) && q.query.includes('isWarbond') && q.query.includes('price'));
check('stock query uses product ids, not page URLs', !q.query.includes('location') && !JSON.stringify(q.variables).includes('http'));
const m = bot.buildAddToCartMutation('19999', 1);
check('add-to-cart mutation uses skuId + qty', m.operationName === 'AddCartMultiItemMutation' && m.variables.query[0].skuId === '19999' && m.variables.query[0].qty === 1);
check('add-to-cart mutation has no payment fields', !/card|payment|pay/i.test(m.query));
const n = bot.buildNextStepMutation();
check('checkout step mutation is moveNext only', n.operationName === 'NextStepMutation' && n.query.includes('moveNext') && !/placeOrder|pay/i.test(n.query));

console.log('== 6. Poll timing — jitter + backoff, no refresh ==');
const d1 = bot.nextDelayMs(bot.DEFAULT_CONFIG, 0, () => 0);
const d2 = bot.nextDelayMs(bot.DEFAULT_CONFIG, 0, () => 1);
check('no-error delay within 8-15s window', d1 === 8000 && d2 === 15000, d1 + '/' + d2);
const dErr = bot.nextDelayMs(bot.DEFAULT_CONFIG, 3, () => 0);
check('3 errors -> backoff grows (8s * 2^3 = 64s)', dErr === 64000, String(dErr));
const dCap = bot.nextDelayMs(bot.DEFAULT_CONFIG, 10, () => 1);
check('backoff capped at 120s', dCap === 120000, String(dCap));
check('script contains NO location.reload() (code, comments stripped)', !/location\.reload\s*\(/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')));
check('script contains NO polling via location.href assignment except cart nav', (() => {
  const hits = SRC.match(/location\.href\s*=/g) || [];
  const cartNavs = (SRC.match(/location\.href\s*=\s*RSI_ORIGIN\s*\+\s*'\/store\/pledge\/cart'/g) || []).length;
  return hits.length === cartNavs && cartNavs >= 1 && cartNavs <= 2;
})());
check('script contains NO setInterval page refresh', !/setInterval\s*\(\s*\(\s*\)\s*=>\s*\{?\s*location/.test(SRC));
check('script never fills CAPTCHA fields', !/captcha.*\.value\s*=|g-recaptcha-response/i.test(SRC.replace(/detectBlocker[\s\S]*?return null;/, '')));

console.log('== 7. Blocker detection (v1.1.1 — visible challenge only) ==');
// Minimal fake DOM for detectBlocker: elements carry the fields the
// bot reads (tagName/src/className, offsetParent, getBoundingClientRect,
// getAttribute, closest). Visible = offsetParent set + non-zero rect;
// hidden = offsetParent null (no getComputedStyle in Node).
function fakeEl(o) {
  o = o || {};
  return {
    tagName: (o.tag || 'DIV').toUpperCase(),
    src: o.src || '',
    className: o.cls || '',
    textContent: o.text || '',
    disabled: !!o.disabled,
    _sitekey: o.sitekey || null,
    _testid: o.testid || null,
    _arialabel: o.arialabel || null,
    _cyid: o.cyid || null,
    offsetParent: o.hidden ? null : {},
    // A hidden element has a 0-size rect in a real browser.
    _rect: o.hidden ? { width: 0, height: 0 } : (o.rect || { width: 300, height: 65 }),
    getBoundingClientRect: function () { return this._rect; },
    getAttribute: function (n) {
      if (n === 'src') return this.src || null;
      if (n === 'data-sitekey') return this._sitekey;
      if (n === 'data-testid') return this._testid;
      if (n === 'aria-label') return this._arialabel;
      if (n === 'data-cy-id') return this._cyid;
      return null;
    },
    closest: function (sel) { return (o.inBadge && sel === '.grecaptcha-badge') ? { className: 'grecaptcha-badge' } : null; },
    parentNode: null,
  };
}
function fakeDoc(o) {
  o = o || {};
  var els = o.els || [];
  function selMatch(el, sel) {
    sel = sel.trim();
    var m = sel.match(/^iframe\[src\*="([^"]+)"\]$/);
    if (m) return el.tagName === 'IFRAME' && (el.src || '').indexOf(m[1]) !== -1;
    if (sel === '.g-recaptcha') return (el.className || '').split(/\s+/).indexOf('g-recaptcha') !== -1;
    if (sel === '.h-captcha') return (el.className || '').split(/\s+/).indexOf('h-captcha') !== -1;
    if (sel === '.cf-turnstile') return (el.className || '').split(/\s+/).indexOf('cf-turnstile') !== -1;
    if (sel === '[data-sitekey]') return !!el._sitekey;
    // Buy Now selectors (v1.1.2 section 10).
    if (sel === '[data-testid="express-buy-now"]') return el.getAttribute('data-testid') === 'express-buy-now';
    if (sel === 'button[aria-label="Buy Now"]') return el.tagName === 'BUTTON' && el.getAttribute('aria-label') === 'Buy Now';
    if (sel === '.a-buyNowButton' || sel === '.m-storeAction__buyNow') return (el.className || '').split(/\s+/).indexOf(sel.slice(1)) !== -1;
    if (sel === 'button[data-cy-id="button"]') return el.tagName === 'BUTTON' && el.getAttribute('data-cy-id') === 'button';
    if (sel === 'button') return el.tagName === 'BUTTON';
    return false;
  }
  return {
    body: { innerText: o.text || '' },
    querySelectorAll: function (selector) {
      var parts = String(selector).split(',');
      return els.filter(function (el) { return parts.some(function (p) { return selMatch(el, p); }); });
    },
  };
}
var RSI_BADGE = 'https://www.google.com/recaptcha/api2/anchor?size=invisible&k=6LerBOgUAAAAAKPg6vsAFPTN66Woz-jBClxdQU-o';
var RSI_NORMAL_TEXT = 'Star Citizen First Flight Pack $60.00\nprotected by reCAPTCHA\nPrivacy - Terms';
// REGRESSION (v1.1.1 bug): a normal RSI page has the reCAPTCHA badge
// text in its visible text and a badge iframe in its DOM — the bot
// must NOT pause on Start Monitor when no challenge is shown.
check('REGRESSION normal RSI page (badge text + badge iframe) -> no blocker',
  bot.detectBlocker(fakeDoc({ text: RSI_NORMAL_TEXT, els: [fakeEl({ tag: 'iframe', src: RSI_BADGE, inBadge: true })] })) === null);
check('REGRESSION bare word "captcha" in page text -> no blocker',
  bot.detectBlocker(fakeDoc({ text: 'This site is protected by reCAPTCHA and the Google Privacy Policy' })) === null);
check('REGRESSION hidden captcha iframe (display:none) -> no blocker',
  bot.detectBlocker(fakeDoc({ text: 'Kraken - Drake Interplanetary', els: [fakeEl({ tag: 'iframe', src: 'https://www.google.com/recaptcha/api2/anchor?k=xxx', hidden: true })] })) === null);
check('REGRESSION hidden .g-recaptcha widget -> no blocker',
  bot.detectBlocker(fakeDoc({ text: '', els: [fakeEl({ cls: 'g-recaptcha', hidden: true })] })) === null);
check('REGRESSION badge iframe outside .grecaptcha-badge but size=invisible -> no blocker',
  bot.detectBlocker(fakeDoc({ text: '', els: [fakeEl({ tag: 'iframe', src: RSI_BADGE })] })) === null);
// Real protection still intact: a genuinely visible challenge pauses.
check('visible checkbox iframe -> captcha',
  bot.detectBlocker(fakeDoc({ text: '', els: [fakeEl({ tag: 'iframe', src: 'https://www.google.com/recaptcha/api2/anchor?ar=1&k=xxx' })] })) === 'captcha');
check('visible challenge popup iframe (bframe) -> captcha',
  bot.detectBlocker(fakeDoc({ text: '', els: [fakeEl({ tag: 'iframe', src: 'https://www.google.com/recaptcha/api2/bframe?k=xxx' })] })) === 'captcha');
check('visible hCaptcha iframe -> captcha',
  bot.detectBlocker(fakeDoc({ text: '', els: [fakeEl({ tag: 'iframe', src: 'https://js.hcaptcha.com/1/api.js' })] })) === 'captcha');
check('visible .g-recaptcha widget -> captcha',
  bot.detectBlocker(fakeDoc({ text: '', els: [fakeEl({ cls: 'g-recaptcha' })] })) === 'captcha');
check('detects "complete the captcha challenge" wording -> captcha',
  bot.detectBlocker(fakeDoc({ text: 'Please complete the captcha challenge' })) === 'captcha');
check('detects verify-human text -> verify',
  bot.detectBlocker(fakeDoc({ text: 'Verify you are human' })) === 'verify');
check('detects press & hold text -> verify',
  bot.detectBlocker(fakeDoc({ text: 'Press & hold the button to continue' })) === 'verify');
check('detects queue text', bot.detectBlocker(fakeDoc({ text: 'You are in a queue, position 42' })) === 'queue');
check('detects access denied -> blocked',
  bot.detectBlocker(fakeDoc({ text: 'Access denied — error 403' })) === 'blocked');
check('normal page text -> no blocker', bot.detectBlocker(fakeDoc({ text: 'Kraken - Drake Interplanetary' })) === null);
check('empty / null doc -> no blocker', bot.detectBlocker(null) === null && bot.detectBlocker({}) === null);

console.log('== 8. Safety defaults ==');
check('autoPay defaults OFF', bot.DEFAULT_CONFIG.autoPay === false);
check('default watchlist is Kraken, max $1400, warbond first', bot.DEFAULT_CONFIG.watchlist[0].name === 'Kraken' && bot.DEFAULT_CONFIG.watchlist[0].maxPrice === 1400 && bot.DEFAULT_CONFIG.watchlist[0].preferWarbond === true);
check('default poll window is 8-15s', bot.DEFAULT_CONFIG.pollMinMs === 8000 && bot.DEFAULT_CONFIG.pollMaxMs === 15000);

console.log('== 9. Human-like click (v1.1.0) ==');
check('humanClick defaults ON', bot.DEFAULT_CONFIG.humanClick === true);
check('randInt stays in range', (() => { for (let i = 0; i < 100; i++) { const v = bot.randInt(8, 30); if (v < 8 || v > 30) return false; } return true; })());
check('randomPointInRect stays inside 10-90% of the button', (() => {
  const rect = { left: 100, top: 200, width: 200, height: 50 };
  for (let i = 0; i < 100; i++) { const p = bot.randomPointInRect(rect); if (p.x < 120 || p.x > 280 || p.y < 205 || p.y > 245) return false; }
  return true;
})());
check('humanPath returns requested steps and ends at target', (() => {
  const pts = bot.humanPath({ x: 0, y: 0 }, { x: 100, y: 50 }, 15, () => 0.5);
  return pts.length === 15 && pts[14].x === 100 && pts[14].y === 50;
})());
check('humanPath is curved, not a straight line', (() => {
  const pts = bot.humanPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, () => 0.9);
  return pts.some((p) => p.y !== 0);
})());
check('Buy Now selectors include the pasted button', bot.BUY_NOW_SELECTORS.includes('[data-testid="express-buy-now"]') && bot.BUY_NOW_SELECTORS.includes('.a-buyNowButton') && bot.BUY_NOW_SELECTORS.includes('button[aria-label="Buy Now"]') && bot.BUY_NOW_SELECTORS.includes('.m-storeAction__buyNow'));
check('script defines humanClick + humanMoveTo + findBuyNowButton', SRC.includes('async function humanClick') && SRC.includes('async function humanMoveTo') && SRC.includes('function findBuyNowButton'));
check('humanClick dispatches mousemove / mousedown / mouseup / click with random delays', SRC.includes("'mousemove'") && SRC.includes("'mousedown'") && SRC.includes("'mouseup'") && SRC.includes("'click'") && SRC.includes('randInt(8, 30)') && SRC.includes('randInt(80, 350)'));
check('Place Order uses humanClick, not instant btn.click()', !/btn\.click\s*\(\)/.test(SRC) && SRC.includes('await humanClick(btn)'));
check('loop checks DOM Buy Now before API (fallback if API lags)', SRC.includes('clickBuyNowIfAvailable()'));

console.log('== 10. Start Monitor -> Buy Now path (v1.1.2) ==');
var PTV = { name: 'PTV - 10 Year', url: 'https://robertsspaceindustries.com/en/pledge/Standalone-Ships/PTV-10-Year', productId: '72', maxPrice: 20, preferWarbond: false, qty: 1 };
var PTV_URL = 'https://robertsspaceindustries.com/en/pledge/Standalone-Ships/PTV-10-Year';
var METEOR = { name: 'Meteor - 10 Year', url: 'https://robertsspaceindustries.com/en/pledge/Standalone-Ships/Meteor-10-Year', productId: '72', maxPrice: 300, preferWarbond: false, qty: 1 };
// REGRESSION: the v1.1.1 page gate turned "PTV - 10 Year" into
// "ptv---10-year", which the real ".../PTV-10-Year" URL never contains,
// so the DOM Buy Now click never fired for any "Name - 10 Year" ship.
check('REGRESSION PTV page is a watched page', bot.isWatchedPage(PTV_URL, [PTV]) === true);
check('REGRESSION Meteor page is a watched page', bot.isWatchedPage('https://robertsspaceindustries.com/en/pledge/Standalone-Ships/Meteor-10-Year', [METEOR]) === true);
check('Kraken page still a watched page', bot.isWatchedPage(KRAKEN.url, [KRAKEN]) === true);
check('First Flight Pack page is a watched page',
  bot.isWatchedPage('https://robertsspaceindustries.com/en/pledge/Packages/Star-Citizen-First-Flight-Pack',
    [{ name: 'First Flight Pack', url: 'https://robertsspaceindustries.com/en/pledge/Packages/Star-Citizen-First-Flight-Pack', productId: '72', maxPrice: 60, preferWarbond: false, qty: 1 }]) === true);
check('unrelated page is NOT a watched page', bot.isWatchedPage('https://robertsspaceindustries.com/en/pledge/Standalone-Ships/Cutlass-Black', [KRAKEN]) === false);
check('name-only match works when entry has no URL',
  bot.isWatchedPage(PTV_URL, [{ name: 'PTV - 10 Year', productId: '72', maxPrice: 20 }]) === true);
check('empty URL / empty watchlist -> false', bot.isWatchedPage('', [KRAKEN]) === false && bot.isWatchedPage(KRAKEN.url, []) === false);
check('slugify: "PTV - 10 Year" -> "ptv-10-year"', bot.slugify('PTV - 10 Year') === 'ptv-10-year');
// findBuyNowButton with Shariful's pasted Buy Now button markup.
var pastedBtn = fakeEl({ tag: 'button', cls: 'a-button a-buyNowButton m-storeAction__buyNow -regular -transaction -filled -withShapes', testid: 'express-buy-now', arialabel: 'Buy Now', cyid: 'button' });
check('findBuyNowButton finds the pasted Buy Now button',
  bot.findBuyNowButton(fakeDoc({ els: [pastedBtn] })) === pastedBtn);
check('findBuyNowButton ignores a disabled Buy Now button',
  bot.findBuyNowButton(fakeDoc({ els: [fakeEl({ tag: 'button', cls: 'a-buyNowButton', disabled: true })] })) === null);
check('findBuyNowButton ignores a hidden Buy Now button',
  bot.findBuyNowButton(fakeDoc({ els: [fakeEl({ tag: 'button', cls: 'a-buyNowButton', hidden: true })] })) === null);
check('findBuyNowButton finds a button by "Buy Now" text',
  bot.findBuyNowButton(fakeDoc({ els: [fakeEl({ tag: 'button', text: 'Buy Now' })] })) !== null);
check('findBuyNowButton returns null when no button exists',
  bot.findBuyNowButton(fakeDoc({ text: 'Kraken - Drake Interplanetary' })) === null);
check('loop calls detectBlocker(document) before the Buy Now check (no text call left)',
  !/detectBlocker\(document\.body/.test(SRC));
check('isWatchedPage still exported as a helper (v1.2.0 uses entryMatchesPage per entry)',
  typeof bot.isWatchedPage === 'function' && typeof bot.entryMatchesPage === 'function');

console.log('== 11. Any product watchlist (v1.2.0) ==');
var FFP_URL = 'https://robertsspaceindustries.com/en/pledge/Packages/Star-Citizen-First-Flight-Pack';
var FFP = { name: 'First Flight Pack', url: FFP_URL, productId: null, maxPrice: 60, preferWarbond: false, qty: 1 };

// (a) Adding a package product makes the DOM Buy Now path fire on its page.
check('(a) First Flight Pack page matches its own watchlist entry', bot.entryMatchesPage(FFP, FFP_URL) === true);
check('(a) isWatchedPage true for FFP when FFP is watchlisted', bot.isWatchedPage(FFP_URL, [KRAKEN, FFP]) === true);
check('(a) findBuyNowButton finds the button on the FFP page',
  bot.findBuyNowButton(fakeDoc({ els: [pastedBtn] })) === pastedBtn);
// (b) A product NOT in the watchlist still does NOT click.
check('(b) FFP page is NOT watched when only Kraken is watchlisted', bot.isWatchedPage(FFP_URL, [KRAKEN]) === false);
check('(b) Cutlass page is NOT watched when only FFP is watchlisted',
  bot.isWatchedPage('https://robertsspaceindustries.com/en/pledge/Standalone-Ships/Cutlass-Black', [FFP]) === false);
// (c) Kraken behavior unchanged.
check('(c) Kraken still the only default watchlist entry', bot.DEFAULT_CONFIG.watchlist.length === 1 && bot.DEFAULT_CONFIG.watchlist[0].name === 'Kraken');
check('(c) Kraken entry is API-checkable (list 72)', bot.isApiCheckable(KRAKEN) === true);
check('(c) Kraken page still matches', bot.isWatchedPage(KRAKEN.url, [KRAKEN]) === true);

// normalizeWatchEntry — the panel form.
var normFFP = bot.normalizeWatchEntry({ url: FFP_URL, name: '', maxPrice: '60', productId: '', preferWarbond: false });
check('normalize: URL-only FFP -> name derived from URL, page-only, qty 1',
  !normFFP.error && normFFP.entry.name === 'Star Citizen First Flight Pack' && normFFP.entry.productId === null && normFFP.entry.maxPrice === 60 && normFFP.entry.qty === 1, JSON.stringify(normFFP));
var normKraken = bot.normalizeWatchEntry({ url: KRAKEN.url, name: 'Kraken', maxPrice: 1400, productId: '72', preferWarbond: true });
check('normalize: full Kraken entry passes through with list 72 + warbond',
  !normKraken.error && normKraken.entry.productId === '72' && normKraken.entry.preferWarbond === true, JSON.stringify(normKraken));
check('normalize: non-RSI URL rejected', !!bot.normalizeWatchEntry({ url: 'https://example.com/product', maxPrice: 10 }).error);
check('normalize: missing URL rejected', !!bot.normalizeWatchEntry({ url: '', maxPrice: 10 }).error);
check('normalize: missing max price rejected', !!bot.normalizeWatchEntry({ url: FFP_URL }).error);
check('normalize: max price 0 rejected', !!bot.normalizeWatchEntry({ url: FFP_URL, maxPrice: 0 }).error);
check('normalize: non-digit list ID rejected', !!bot.normalizeWatchEntry({ url: FFP_URL, maxPrice: 60, productId: 'abc' }).error);
check('normalize: explicit name wins over URL-derived name',
  bot.normalizeWatchEntry({ url: FFP_URL, name: 'My Pack', maxPrice: 60 }).entry.name === 'My Pack');
check('isRsiUrl accepts pledge URLs, rejects other sites',
  bot.isRsiUrl(FFP_URL) === true && bot.isRsiUrl(KRAKEN.url) === true && bot.isRsiUrl('https://example.com/en/pledge/x') === false && bot.isRsiUrl('not a url') === false);
check('isApiCheckable: FFP without list ID is page-only', bot.isApiCheckable(FFP) === false);
check('isApiCheckable: entry with list 72 is API-checkable', bot.isApiCheckable({ productId: '72' }) === true);
check('isApiCheckable: missing/blank list ID is page-only', bot.isApiCheckable({}) === false && bot.isApiCheckable({ productId: '' }) === false && bot.isApiCheckable({ productId: '  ' }) === false);

// findTargetSku works for a package, not just ships.
var ffpSkus = [{ id: '50001', title: 'Star Citizen - First Flight Pack', isWarbond: false, stock: { available: true }, price: { amount: 6000 } }];
check('findTargetSku: First Flight Pack $60 in stock under $60 cap',
  (() => { const r = bot.findTargetSku(ffpSkus, FFP); return r.sku !== null && r.reason === 'in_stock' && r.sku.id === '50001'; })());
check('findTargetSku: First Flight Pack $60 over a $50 cap -> over_max_price',
  bot.findTargetSku(ffpSkus, { name: 'First Flight Pack', maxPrice: 50 }).reason === 'over_max_price');

// DOM price guard (pagePriceUsd + domBuyAllowed).
function jsonLdDoc(price) {
  var scripts = [];
  if (price !== null && price !== undefined) scripts = [{ textContent: JSON.stringify({ offers: { price: price, availability: 'https://schema.org/InStock' } }) }];
  return { querySelectorAll: function (sel) { return sel === 'script[type="application/ld+json"]' ? scripts : []; } };
}
check('pagePriceUsd reads $60.00 from JSON-LD', bot.pagePriceUsd(jsonLdDoc('60.00')) === 60);
check('pagePriceUsd reads numeric 75 from JSON-LD', bot.pagePriceUsd(jsonLdDoc(75)) === 75);
check('pagePriceUsd returns null with no JSON-LD', bot.pagePriceUsd(jsonLdDoc(null)) === null);
check('pagePriceUsd returns null on malformed JSON-LD',
  bot.pagePriceUsd({ querySelectorAll: function () { return [{ textContent: '{not json' }]; } }) === null);
check('domBuyAllowed: page $60 at max $60 -> allowed', bot.domBuyAllowed(FFP, 60).allowed === true);
check('domBuyAllowed: page $70 above max $60 -> NOT allowed', bot.domBuyAllowed(FFP, 70).allowed === false && bot.domBuyAllowed(FFP, 70).reason === 'over_max_price');
check('domBuyAllowed: unknown page price -> allowed (API is the strict cap)', bot.domBuyAllowed(FFP, null).allowed === true);

// Panel + wiring (static).
check('panel has an "Add any product" form', SRC.includes('scab-add-url') && SRC.includes('scab-add-name') && SRC.includes('scab-add-price') && SRC.includes('scab-add-list') && SRC.includes('scab-add-btn'));
check('panel rows have a Remove button', SRC.includes('data-scab-remove'));
check('panel explains page-only entries', SRC.includes('page only'));
check('panel version label is v1.2.1', SRC.includes('SC Auto Buyer v1.2.1'));
check('clickBuyNowIfAvailable gates on entryMatchesPage (any watchlisted product)',
  SRC.includes('entryMatchesPage(w, window.location.href)'));
check('clickBuyNowIfAvailable enforces the max price from the page', SRC.includes('domBuyAllowed(entry, price)'));
check('API check skipped for page-only entries', SRC.includes("reason: 'page_only'"));
check('script exports the new pure functions',
  ['normalizeWatchEntry', 'isApiCheckable', 'entryMatchesPage', 'pagePriceUsd', 'domBuyAllowed', 'isRsiUrl'].every((f) => Object.prototype.hasOwnProperty.call(bot, f)));

console.log('== 12. Scroll-then-click (v1.2.1) ==');
// REGRESSION: the old humanClick scrolled SMOOTH and read the button
// position after a fixed 200-600 ms — on a long product page the smooth
// scroll was still running, so the click used a stale position and
// "did nothing" on a real page even with the button visible and the
// price under max.
check('REGRESSION no smooth scroll left in the click path', !SRC.includes("behavior: 'smooth'"));
check('humanClick scrolls and settles BEFORE reading the position',
  SRC.indexOf('await scrollIntoViewAndSettle(el);') !== -1 &&
  SRC.indexOf('await scrollIntoViewAndSettle(el);') < SRC.indexOf('const rect = el.getBoundingClientRect();', SRC.indexOf('async function humanClick')));
check('humanClick re-verifies viewport + coverage after scrolling',
  SRC.includes('isRectInViewport(rect)') && SRC.includes('pointHitsElement(el, p.x, p.y)') && SRC.includes('not clicking blind'));
check('humanClick bails when the button is not clickable after scrolling',
  SRC.includes('no longer clickable after scrolling') && SRC.includes('not in the viewport after scrolling'));
check('isRectInViewport: inside -> true', bot.isRectInViewport({ left: 100, top: 100, right: 300, bottom: 150 }, { innerWidth: 1280, innerHeight: 800 }) === true);
check('isRectInViewport: fully below the fold -> false', bot.isRectInViewport({ left: 100, top: 900, right: 300, bottom: 950 }, { innerWidth: 1280, innerHeight: 800 }) === false);
check('isRectInViewport: partly visible -> true', bot.isRectInViewport({ left: 100, top: 750, right: 300, bottom: 850 }, { innerWidth: 1280, innerHeight: 800 }) === true);
check('isRectInViewport: null rect / no window -> false', bot.isRectInViewport(null, { innerWidth: 1280, innerHeight: 800 }) === false && bot.isRectInViewport({ left: 0, top: 0, right: 10, bottom: 10 }, null) === false);
// pointHitsElement with a fake doc.
function hitDoc(el) { return { elementFromPoint: function () { return el; } }; }
var hitChild = {};
var hitBtn = { contains: function (h) { return h === hitBtn || h === hitChild; } };
var coverEl = {};
check('pointHitsElement: point on the button -> true', bot.pointHitsElement(hitBtn, 10, 10, hitDoc(hitBtn)) === true);
check('pointHitsElement: point on a child of the button -> true', bot.pointHitsElement(hitBtn, 10, 10, hitDoc(hitChild)) === true);
check('pointHitsElement: point on a covering element -> false', bot.pointHitsElement(hitBtn, 10, 10, hitDoc(coverEl)) === false);
check('pointHitsElement: nothing at the point -> false', bot.pointHitsElement(hitBtn, 10, 10, hitDoc(null)) === false);
check('pointHitsElement: doc without elementFromPoint does not block', bot.pointHitsElement(hitBtn, 10, 10, {}) === true);
check('script exports the new click helpers',
  ['isRectInViewport', 'pointHitsElement', 'scrollIntoViewAndSettle', 'humanClick'].every((f) => Object.prototype.hasOwnProperty.call(bot, f)));

console.log('== 13. Panel buttons — wiring (v1.2.1) ==');
// Audit: every panel button must be wired to the action it claims.
check('Start button is wired to startLoop', SRC.includes("getElementById('scab-start').addEventListener('click', startLoop)"));
check('Stop button is wired to stopLoop', SRC.includes("getElementById('scab-stop').addEventListener('click', stopLoop)"));
check('Test button is wired to testStockCheck', SRC.includes("getElementById('scab-test').addEventListener('click', testStockCheck)"));
check('Add product button is wired (bindWatchlistForm)', SRC.includes("getElementById('scab-add-btn')") && SRC.includes("btn.addEventListener('click'"));
check('Remove buttons are wired in renderWatchlist', SRC.includes("querySelectorAll('[data-scab-remove]')") && SRC.includes("addEventListener('click', () =>"));
check('Auto-Pay checkbox is wired (change -> saveConfig)', SRC.includes("getElementById('scab-autopay')") && SRC.includes("payBox.addEventListener('change'"));
check('Stop also clears a PAUSED state', SRC.includes("BOT.status === 'PAUSED') setStatus('IDLE')"));
check('panel has a draggable header', SRC.includes('scab-header') && SRC.includes("headerEl.addEventListener('pointerdown'"));
check('panel has a resize grip', SRC.includes('scab-resize-grip') && SRC.includes("gripEl.addEventListener('pointerdown'"));
check('panel geometry clamps like the Microsoft bot (width 20-60, height 25-90)',
  SRC.includes('clampPct(g.width, 20, 60)') && SRC.includes('clampPct(g.height, 25, 90)'));
check('panel geometry is saved and restored (config.panel + applyPanelGeometry)',
  SRC.includes('BOT.config.panel') && SRC.includes('applyPanelGeometry()') && SRC.includes('savePanelGeometry()'));
check('double-click the header resets the panel', SRC.includes("headerEl.addEventListener('dblclick', resetPanelGeometry)"));

// ---- Fake browser for behavioral tests (v1.2.1 section 14) ----
// Enough DOM for buildPanel + humanClick to run in Node. The script is
// loaded a second time with these fakes, so isBrowser is true and the
// panel boots.
var fakeDocRegistry = {};
function registerIds(el) {
  if (el.id) fakeDocRegistry[el.id] = el;
  for (const c of el.children) registerIds(c);
}
function FakeEl(tag, o) {
  o = o || {};
  const el = {
    tagName: (tag || 'DIV').toUpperCase(),
    className: o.cls || '',
    style: {},
    children: [],
    _listeners: {},
    _events: [],
    textContent: o.text || '',
    value: (o.value !== undefined ? o.value : ''),
    checked: !!o.checked,
    disabled: !!o.disabled,
    innerText: o.innerText || '',
    _rect: o.rect || { left: 0, top: 0, width: 100, height: 30, right: 100, bottom: 30 },
    _attrs: o.attrs || {},
    _id: '',
    getBoundingClientRect: function () { return this._rect; },
    getAttribute: function (n) { return (n in this._attrs) ? this._attrs[n] : null; },
    setAttribute: function (n, v) { this._attrs[n] = String(v); },
    addEventListener: function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) { this._listeners[t] = (this._listeners[t] || []).filter((f) => f !== fn); },
    dispatchEvent: function (ev) { this._events.push(ev); (this._listeners[ev.type] || []).slice().forEach((f) => f(ev)); return true; },
    click: function () { this.dispatchEvent({ type: 'click', target: this, preventDefault: function () {}, stopPropagation: function () {} }); },
    appendChild: function (c) { this.children.push(c); registerIds(c); return c; },
    contains: function (n) { return n === this || this.children.indexOf(n) !== -1; },
    closest: function () { return null; },
    querySelectorAll: function (sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (sel === '[data-scab-remove]' && c._attrs && ('data-scab-remove' in c._attrs)) out.push(c);
          else if (sel === 'button' && c.tagName === 'BUTTON') out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    },
  };
  Object.defineProperty(el, 'id', {
    get: function () { return this._id; },
    set: function (v) { this._id = String(v || ''); if (this._id) fakeDocRegistry[this._id] = this; },
  });
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return this._html || ''; },
    set: function (html) {
      this._html = String(html);
      this.children = [];
      const idRe = /<(\w+)[^>]*\sid="([^"]+)"[^>]*>/g;
      let m;
      while ((m = idRe.exec(this._html))) {
        const child = FakeEl(m[1], { id: m[2] });
        this.children.push(child);
      }
      const rbRe = /<button[^>]*data-scab-remove="(\d+)"[^>]*>/g;
      while ((m = rbRe.exec(this._html))) {
        const b = FakeEl('button', { attrs: { 'data-scab-remove': m[1] } });
        b.textContent = '✕';
        this.children.push(b);
      }
    },
  });
  if (o.id) el.id = o.id;
  return el;
}
function makeFakeDocument() {
  fakeDocRegistry = {};
  const body = FakeEl('body');
  body.innerText = '';
  return {
    readyState: 'complete',
    body: body,
    _listeners: {},
    _events: [],
    getElementById: function (id) { return fakeDocRegistry[id] || null; },
    createElement: function (tag) { return FakeEl(tag); },
    querySelectorAll: function () { return []; },
    addEventListener: function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { this._events.push(ev); (this._listeners[ev.type] || []).slice().forEach((f) => f(ev)); return true; },
    elementFromPoint: function () { return null; },
  };
}
function makeFakeWindow() {
  return {
    innerWidth: 1280, innerHeight: 800, scrollY: 0,
    location: { href: 'https://robertsspaceindustries.com/en/pledge/ships/drake-kraken/Kraken', pathname: '/en/pledge/ships/drake-kraken/Kraken' },
    _listeners: {},
    addEventListener: function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) { this._listeners[t] = (this._listeners[t] || []).filter((f) => f !== fn); },
    emit: function (t, ev) { (this._listeners[t] || []).slice().forEach((f) => f(ev)); },
  };
}
function ptrEvent(type, x, y, target) {
  return { type: type, clientX: x, clientY: y, target: target, preventDefault: function () {}, stopPropagation: function () {} };
}
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

(async function behavioral() {
  console.log('== 14. Behavioral — fake browser (v1.2.1) ==');
  // --- scrollIntoViewAndSettle (pure, first loader) ---
  const settleWin = { scrollY: 0 };
  const settleEl = {
    _rect: { left: 100, top: 1500, width: 200, height: 50, right: 300, bottom: 1550 },
    scrollCalls: [],
    scrollIntoView: function (opts) { this.scrollCalls.push(opts); settleWin.scrollY = 1200; this._rect = { left: 100, top: 300, width: 200, height: 50, right: 300, bottom: 350 }; },
    getBoundingClientRect: function () { return this._rect; },
  };
  check('(a) scrollIntoViewAndSettle returns true once settled', (await bot.scrollIntoViewAndSettle(settleEl, settleWin)) === true);
  check('(a) it scrolled with behavior instant', settleEl.scrollCalls.length === 1 && settleEl.scrollCalls[0].behavior === 'instant');
  let moveN = 0;
  const movingEl = {
    scrollIntoView: function () {},
    getBoundingClientRect: function () { moveN++; return { left: 100, top: 100 + moveN, width: 200, height: 50, right: 300, bottom: 150 + moveN }; },
  };
  check('(b) rect that never settles -> false (timeout)', (await bot.scrollIntoViewAndSettle(movingEl, { scrollY: 0 }, undefined, 160)) === false);
  check('(b) element without scrollIntoView -> false', (await bot.scrollIntoViewAndSettle({}, { scrollY: 0 })) === false);

  // --- second loader: real panel boots in the fake browser ---
  global.MouseEvent = function (type, init) { this.type = type; if (init) { for (const k in init) this[k] = init[k]; } };
  const fakeWin = makeFakeWindow();
  const fakeDoc = makeFakeDocument();
  const loader2 = new Function('module', 'exports', 'window', 'document', SRC);
  const moduleObj2 = { exports: {} };
  loader2(moduleObj2, moduleObj2.exports, fakeWin, fakeDoc);
  const bot2 = moduleObj2.exports;
  const $ = (id) => fakeDoc.getElementById(id);
  check('panel boots with every button + drag handle + resize grip',
    !!$('scab-panel') && !!$('scab-start') && !!$('scab-stop') && !!$('scab-test') &&
    !!$('scab-add-btn') && !!$('scab-autopay') && !!$('scab-header') && !!$('scab-resize-grip'));

  // --- humanClick end-to-end: below-fold button ---
  let clickBtn = null;
  const coverEl2 = FakeEl('div');
  fakeDoc.elementFromPoint = function (x, y) {
    if (!clickBtn) return null;
    const r = clickBtn._rect;
    return (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) ? clickBtn : coverEl2;
  };
  function makeClickButton() {
    const btn = FakeEl('button');
    btn.setAttribute('data-testid', 'express-buy-now');
    btn.offsetParent = {};
    btn._rect = { left: 100, top: 1500, width: 200, height: 50, right: 300, bottom: 1550 };
    btn.scrollCalls = [];
    btn.scrollIntoView = function (opts) {
      this.scrollCalls.push(opts);
      fakeWin.scrollY = 1200;
      this._rect = { left: 100, top: 300, width: 200, height: 50, right: 300, bottom: 350 };
    };
    btn.getBoundingClientRect = function () { return this._rect; };
    return btn;
  }
  clickBtn = makeClickButton();
  const order = [];
  const origScroll = clickBtn.scrollIntoView.bind(clickBtn);
  clickBtn.scrollIntoView = function (opts) { order.push('scroll'); return origScroll(opts); };
  const okClick = await bot2.humanClick(clickBtn);
  check('humanClick returns true for a visible in-stock button', okClick === true);
  check('humanClick scrolled BEFORE moving the mouse',
    order[0] === 'scroll' && fakeDoc._events.some((e) => e.type === 'mousemove'));
  const clickEv = clickBtn._events.find((e) => e.type === 'click');
  check('humanClick dispatched a click on the button', !!clickEv);
  check('click used the POST-scroll position (inside the settled rect, not the below-fold rect)',
    !!clickEv && clickEv.clientY >= 300 && clickEv.clientY <= 350 && clickEv.clientX >= 100 && clickEv.clientX <= 300);
  check('humanClick dispatched mousedown + mouseup before click',
    clickBtn._events.some((e) => e.type === 'mousedown') && clickBtn._events.some((e) => e.type === 'mouseup'));
  // Covered button -> no click.
  fakeDoc.elementFromPoint = function () { return coverEl2; };
  const btnCovered = makeClickButton();
  check('covered button is NOT clicked', (await bot2.humanClick(btnCovered)) === false && !btnCovered._events.some((e) => e.type === 'click'));
  // Still off-viewport after scrolling -> no click.
  const btnOff = makeClickButton();
  btnOff.scrollIntoView = function (opts) { this.scrollCalls.push(opts); this._rect = { left: 100, top: -600, width: 200, height: 50, right: 300, bottom: -550 }; };
  fakeDoc.elementFromPoint = function (x, y) { const r = btnOff._rect; return (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) ? btnOff : null; };
  check('button still off-viewport after scrolling is NOT clicked',
    (await bot2.humanClick(btnOff)) === false && !btnOff._events.some((e) => e.type === 'click'));
  // Disabled button -> no click, no scroll.
  const btnDisabled = makeClickButton();
  btnDisabled.disabled = true;
  check('disabled button is NOT clicked and NOT scrolled to',
    (await bot2.humanClick(btnDisabled)) === false && btnDisabled.scrollCalls.length === 0);

  // --- panel buttons, behaviorally ---
  $('scab-add-url').value = FFP_URL;
  $('scab-add-price').value = '60';
  $('scab-add-btn').click();
  check('Add product button adds the product to the watchlist', $('scab-ships')._html.indexOf('First Flight Pack') !== -1);
  check('Add product shows a confirmation', $('scab-add-msg').textContent.indexOf('Added') === 0);
  $('scab-add-url').value = FFP_URL;
  $('scab-add-price').value = '60';
  $('scab-add-btn').click();
  check('adding the same product twice is rejected', $('scab-add-msg').textContent.indexOf('already in the watchlist') !== -1);

  // Start / Stop / Test with a stubbed fetch (no network in tests).
  const realFetch = global.fetch;
  global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ data: { store: { search: { count: 0, resources: [] } } } }) });
  $('scab-start').click();
  await sleepMs(400);
  check('Start button starts monitoring', $('scab-status').textContent === 'MONITORING');
  check('monitoring ran an API check (Kraken not_listed logged)', $('scab-log')._html.indexOf('not_listed') !== -1);
  $('scab-stop').click();
  check('Stop button stops monitoring', $('scab-status').textContent === 'IDLE');
  await sleepMs(300);
  check('monitoring stays stopped after Stop', $('scab-status').textContent === 'IDLE');
  $('scab-test').click();
  await sleepMs(300);
  check('Test button runs a dry-run check', $('scab-log')._html.indexOf('TEST done') !== -1);
  global.fetch = realFetch;

  // Remove button.
  const rmBtns = $('scab-ships').querySelectorAll('[data-scab-remove]');
  check('Remove buttons exist per product', rmBtns.length === 2);
  rmBtns[0].click(); // removes Kraken (index 0)
  check('Remove button removes that product',
    $('scab-ships')._html.indexOf('Kraken') === -1 && $('scab-ships')._html.indexOf('First Flight Pack') !== -1);

  // Auto-Pay checkbox.
  const payBox = $('scab-autopay');
  payBox.checked = true;
  payBox.dispatchEvent({ type: 'change', target: payBox });
  check('Auto-Pay checkbox flips the setting ON', $('scab-log')._html.indexOf('Auto-Pay is now ON') !== -1);
  payBox.checked = false;
  payBox.dispatchEvent({ type: 'change', target: payBox });
  check('Auto-Pay checkbox flips the setting back OFF', $('scab-log')._html.indexOf('Auto-Pay is now OFF') !== -1);

  // --- drag / resize / persist / reset ---
  const panel = $('scab-panel');
  panel.style.width = '340px';
  panel.style.right = '12px';
  panel.getBoundingClientRect = function () {
    const w = this.style.width && this.style.width.slice(-1) === '%' ? (parseFloat(this.style.width) / 100) * fakeWin.innerWidth : (parseFloat(this.style.width) || 340);
    const h = this.style.height && this.style.height.slice(-1) === '%' ? (parseFloat(this.style.height) / 100) * fakeWin.innerHeight : 400;
    const l = this.style.left ? (parseFloat(this.style.left) / 100) * fakeWin.innerWidth : (this.style.right ? fakeWin.innerWidth - 12 - w : 0);
    const t = this.style.top ? (parseFloat(this.style.top) / 100) * fakeWin.innerHeight : 12;
    return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h };
  };
  const header = $('scab-header');
  header.dispatchEvent(ptrEvent('pointerdown', 1000, 30, header));
  fakeWin.emit('pointermove', ptrEvent('pointermove', 500, 200, fakeWin));
  fakeWin.emit('pointerup', ptrEvent('pointerup', 500, 200, fakeWin));
  check('dragging the header moves the panel', panel.style.left === '33.4%' && panel.style.top === '22.8%');
  const grip = $('scab-resize-grip');
  grip.dispatchEvent(ptrEvent('pointerdown', 767, 582, grip));
  fakeWin.emit('pointermove', ptrEvent('pointermove', 1023, 582, fakeWin));
  fakeWin.emit('pointerup', ptrEvent('pointerup', 1023, 582, fakeWin));
  check('dragging the corner resizes the panel', panel.style.width === '46.6%' && panel.style.height === '50%');
  // Persistence round-trip: rebuild the panel, saved geometry must restore.
  delete fakeDocRegistry['scab-panel'];
  fakeDoc.body.children = fakeDoc.body.children.filter((c) => c !== panel);
  bot2.buildPanel();
  const panel2 = $('scab-panel');
  check('panel position/size persist across rebuilds', panel2.style.width === '46.6%' && panel2.style.left === '33.4%');
  // Reset via double-click on the header.
  $('scab-header').dispatchEvent({ type: 'dblclick', target: $('scab-header') });
  check('double-click the header resets position and size',
    panel2.style.width === '340px' && panel2.style.left === '');

  console.log('== 15. MouseEvent in the Tampermonkey sandbox (v1.2.2) ==');
  // REGRESSION (live 2026-11-21, First Flight Pack page, max $100, price $60):
  // the button was found and the price guard passed, but the click never
  // happened — "Failed to construct 'MouseEvent': Failed to read the 'view'
  // property from 'UIEventInit': Failed to convert value to 'Window'."
  // Cause: dispatchMouse passed `view: window`, and inside Tampermonkey the
  // script's `window` is a sandbox proxy, NOT the page's real Window, so the
  // page's MouseEvent constructor rejects it. `view` is optional, so the
  // fix is to not pass it at all.
  // The strict constructor below mimics the browser: it only accepts the
  // PAGE window as `view`; any other object throws exactly like the browser.
  const pageWin = {};
  function StrictMouseEvent(type, init) {
    if (init && Object.prototype.hasOwnProperty.call(init, 'view') && init.view !== pageWin) {
      throw new TypeError("Failed to construct 'MouseEvent': Failed to read the 'view' property from 'UIEventInit': Failed to convert value to 'Window'.");
    }
    this.type = type;
    if (init) { for (const k in init) this[k] = init[k]; }
  }
  // The OLD shape throws exactly the live error…
  check('REGRESSION old shape { view: sandboxWindow } is rejected by the page MouseEvent constructor',
    (() => { try { new StrictMouseEvent('click', { view: { sandboxed: true }, clientX: 1, clientY: 2 }); return false; } catch (e) { return e instanceof TypeError && e.message.indexOf("Failed to convert value to 'Window'") !== -1; } })());
  // …while an init without `view` builds fine.
  check('init without view builds fine',
    (() => { try { const ev = new StrictMouseEvent('click', { bubbles: true, clientX: 10, clientY: 20 }); return ev.type === 'click' && ev.clientX === 10 && !('view' in ev); } catch (e) { return false; } })());
  // The source must not pass a `view` to the event constructor anymore.
  const dmSrc = (SRC.match(/function dispatchMouse[\s\S]*?\n}/) || [''])[0];
  const mmSrc = (SRC.match(/function makeMouseEvent[\s\S]*?\n}/) || [''])[0];
  check('dispatchMouse passes no view to the event constructor', dmSrc.length > 0 && dmSrc.indexOf('view:') === -1);
  check('makeMouseEvent builds events without a view property', mmSrc.length > 0 && mmSrc.indexOf('view:') === -1 && mmSrc.indexOf('new MouseEvent') !== -1);
  check('makeMouseEvent is exported for tests', typeof bot.makeMouseEvent === 'function');
  // Behavioral: the bot's click path inside a Tampermonkey-like sandbox —
  // the script's `window` is a sandbox proxy, NOT the page's real Window.
  global.MouseEvent = StrictMouseEvent;
  const sandboxWin = makeFakeWindow();
  sandboxWin.location.href = FFP_URL;
  sandboxWin.location.pathname = '/en/pledge/Packages/Star-Citizen-First-Flight-Pack';
  const sandboxDoc = makeFakeDocument();
  const loader3 = new Function('module', 'exports', 'window', 'document', SRC);
  const moduleObj3 = { exports: {} };
  loader3(moduleObj3, moduleObj3.exports, sandboxWin, sandboxDoc);
  const bot3 = moduleObj3.exports;
  const $3 = (id) => sandboxDoc.getElementById(id);
  // The exact live scenario: First Flight Pack button, below the fold.
  let sbBtn = null;
  const sbCover = FakeEl('div');
  sandboxDoc.elementFromPoint = function (x, y) {
    if (!sbBtn) return null;
    const r = sbBtn._rect;
    return (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) ? sbBtn : sbCover;
  };
  function makeSandboxButton() {
    const btn = FakeEl('button');
    btn.setAttribute('data-testid', 'express-buy-now');
    btn.offsetParent = {};
    btn._rect = { left: 100, top: 1500, width: 200, height: 50, right: 300, bottom: 1550 };
    btn.scrollCalls = [];
    btn.scrollIntoView = function (opts) {
      this.scrollCalls.push(opts);
      sandboxWin.scrollY = 1200;
      this._rect = { left: 100, top: 300, width: 200, height: 50, right: 300, bottom: 350 };
    };
    btn.getBoundingClientRect = function () { return this._rect; };
    return btn;
  }
  sbBtn = makeSandboxButton();
  const okSandbox = await bot3.humanClick(sbBtn);
  check('REGRESSION humanClick works when window is a sandbox proxy (no real Window view)', okSandbox === true);
  const sbClickEv = sbBtn._events.find((e) => e.type === 'click');
  check('click event reached the button in the sandbox',
    !!sbClickEv && sbClickEv.clientY >= 300 && sbClickEv.clientY <= 350);
  check('dispatched events carry no view property', !!sbClickEv && !('view' in sbClickEv));
  check('makeMouseEvent (first loader) builds events under the strict constructor',
    (() => { try { const ev = bot.makeMouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 6 }); return ev.type === 'mousedown' && ev.clientX === 5 && !('view' in ev); } catch (e) { return false; } })());
  // Failure path: if event construction throws anyway, the click fails
  // LOUDLY (log says FAILED + retry) instead of hiding as "continuing".
  global.MouseEvent = function () { throw new Error('boom: no MouseEvent'); };
  const failBtn = makeSandboxButton();
  sbBtn = failBtn;
  const okFail = await bot3.humanClick(failBtn);
  check('click construction failure returns false, does not throw out of humanClick', okFail === false);
  check('click failure is logged plainly as FAILED with a retry note',
    !!$3('scab-log') && $3('scab-log')._html.indexOf('Buy Now click FAILED') !== -1 &&
    $3('scab-log')._html.indexOf('will retry on the next tick') !== -1);
  global.MouseEvent = StrictMouseEvent;

  delete global.MouseEvent;
})().then(() => {
  console.log('\n----------------------------------------');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  process.exit(fail === 0 ? 0 : 1);
}).catch((e) => { console.log('BEHAVIORAL ERROR: ' + (e && e.stack || e)); process.exit(1); });
