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
    type: o.type || '',
    value: (o.value !== undefined ? o.value : ''),
    _sitekey: o.sitekey || null,
    _testid: o.testid || null,
    _arialabel: o.arialabel || null,
    _cyid: o.cyid || null,
    _autocomplete: o.autocomplete || null,
    _name: o.name || null,
    _placeholder: o.placeholder || null,
    _elid: o.elid || null,
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
      if (n === 'autocomplete') return this._autocomplete;
      if (n === 'name') return this._name;
      if (n === 'placeholder') return this._placeholder;
      if (n === 'id') return this._elid;
      if (n === 'type') return this.type || null;
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
    // Generic data-testid match (v1.3.0: express-terms-checkbox, express-card-form-submit).
    var tm = sel.match(/^\[data-testid="([^"]+)"\]$/);
    if (tm) return el.getAttribute('data-testid') === tm[1];
    if (sel === 'input') return el.tagName === 'INPUT';
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
    querySelector: function (selector) {
      var all = this.querySelectorAll(selector);
      return all.length ? all[0] : null;
    },
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
// v1.3.1: the plain .click() fallback exists ONLY in the Buy Now path
// (after the human-like click got no reaction from the page). The
// Place Order paths — checkoutStepHandler and the express walk — must
// still use humanClick only, never a plain click.
const checkoutFnSrc = (SRC.match(/async function checkoutStepHandler[\s\S]*?\n}/) || [''])[0];
const walkFnSrc = (SRC.match(/async function runExpressCheckoutWalk[\s\S]*?\n}/) || [''])[0];
check('Place Order uses humanClick, not instant btn.click()',
  checkoutFnSrc.includes('await humanClick(btn)') && !/\.click\s*\(\)/.test(checkoutFnSrc) && !/\.click\s*\(\)/.test(walkFnSrc));
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
check('panel version label is v1.3.0', SRC.includes('SC Auto Buyer v1.3.0'));
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
// General fake selector matcher (v1.3.0): tag, .class, [attr], [attr="v"],
// [attr*="v"] and combinations like button[data-testid="x"] or
// script[type="application/ld+json"]. Used by the fake browser's
// querySelector(All) so finders behave like on a real page.
function fakeSelMatch(el, sel) {
  sel = sel.trim();
  if (!sel) return false;
  if (sel.indexOf(',') !== -1) return sel.split(',').some(function (p) { return fakeSelMatch(el, p); });
  var m = sel.match(/^([a-zA-Z][\w-]*)?((?:\.[\w-]+)?)((?:\[[^\]]+\])?)$/);
  if (!m) return false;
  var tag = m[1] || null, cls = m[2] ? m[2].slice(1) : null, attrPart = m[3] || null;
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  if (cls && (el.className || '').split(/\s+/).indexOf(cls) === -1) return false;
  if (attrPart) {
    var am = attrPart.match(/^\[([\w-]+)(\*?=)?(?:"([^"]*)")?\]$/);
    if (!am) return false;
    var v = null;
    try { v = (typeof el.getAttribute === 'function') ? el.getAttribute(am[1]) : null; } catch (e) { v = null; }
    if (v === null || v === undefined) return false;
    if (!am[2]) return true;
    if (am[2] === '=') return String(v) === am[3];
    if (am[2] === '*=') return String(v).indexOf(am[3]) !== -1;
    return false;
  }
  return true;
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
    appendChild: function (c) { c.parentNode = this; c.parentElement = this; this.children.push(c); registerIds(c); return c; },
    contains: function (n) { return n === this || this.children.indexOf(n) !== -1; },
    closest: function (sel) {
      var n = this;
      while (n) {
        if (sel.charAt(0) === '.') { if ((n.className || '').split(/\s+/).indexOf(sel.slice(1)) !== -1) return n; }
        else if (n.tagName === sel.toUpperCase()) return n;
        n = n.parentNode || null;
      }
      return null;
    },
    querySelector: function (sel) {
      var all = this.querySelectorAll(sel);
      return all.length ? all[0] : null;
    },
    querySelectorAll: function (sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (fakeSelMatch(c, sel)) out.push(c);
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
    querySelector: function (sel) {
      var all = this.querySelectorAll(sel);
      return all.length ? all[0] : null;
    },
    querySelectorAll: function (sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children || []) {
          if (fakeSelMatch(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(body);
      return out;
    },
    addEventListener: function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    dispatchEvent: function (ev) { this._events.push(ev); (this._listeners[ev.type] || []).slice().forEach((f) => f(ev)); return true; },
    elementFromPoint: function () { return null; },
    contains: function (el) {
      let found = false;
      const walk = (node) => { for (const c of node.children || []) { if (c === el) found = true; walk(c); } };
      walk(body);
      return found;
    },
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

  console.log('== 16. Express checkout walk (v1.3.0) ==');
  // NOTE: `fakeDoc` is shadowed inside this IIFE by section 14's fake
  // document object, so the pure tests below use this local helper.
  function docOf(els, text) {
    return {
      body: { innerText: text || '' },
      querySelector: function (sel) { const all = this.querySelectorAll(sel); return all.length ? all[0] : null; },
      querySelectorAll: function (sel) {
        return els.filter(function (el) {
          if (sel === 'button') return el.tagName === 'BUTTON';
          if (sel === 'input') return el.tagName === 'INPUT';
          var tm = sel.match(/^\[data-testid="([^"]+)"\]$/);
          if (tm) return el.getAttribute && el.getAttribute('data-testid') === tm[1];
          return false;
        });
      },
    };
  }
  // --- pure finders (first loader, section 7 fakes) ---
  var EXPRESS_URL = 'https://robertsspaceindustries.com/en/store/pledge/express-checkout';
  check('isExpressCheckoutPage: the pasted URL is an express checkout page',
    bot.isExpressCheckoutPage(EXPRESS_URL) === true);
  check('isExpressCheckoutPage: cart / product pages are not',
    bot.isExpressCheckoutPage('https://robertsspaceindustries.com/store/pledge/cart') === false &&
    bot.isExpressCheckoutPage(KRAKEN.url) === false && bot.isExpressCheckoutPage('') === false);
  // Step 1 finder: by TEXT, never by class/data-cy-id alone — the other
  // button on the page shares the same class and data-cy-id.
  var jumpBtn = fakeEl({ tag: 'button', text: 'Jump to bottom', cls: 'a-button -regular -weak -filled -withShapes -fullWidth', cyid: 'button' });
  var otherBtn = fakeEl({ tag: 'button', text: 'Add to cart', cls: 'a-button -regular -weak -filled -withShapes -fullWidth', cyid: 'button' });
  check('findJumpToBottomButton finds the button by its text (other button shares class + data-cy-id)',
    bot.findJumpToBottomButton(docOf([otherBtn, jumpBtn])) === jumpBtn);
  check('findJumpToBottomButton ignores a disabled Jump button',
    bot.findJumpToBottomButton(docOf([fakeEl({ tag: 'button', text: 'Jump to bottom', disabled: true })])) === null);
  check('findJumpToBottomButton returns null when there is no Jump button',
    bot.findJumpToBottomButton(docOf([otherBtn])) === null);
  // Step 2 finder: by data-testid, never by id.
  var termsInput = fakeEl({ tag: 'input', testid: 'express-terms-checkbox' });
  termsInput.type = 'checkbox'; termsInput.checked = false;
  check('findTermsCheckbox finds the checkbox by data-testid',
    bot.findTermsCheckbox(docOf([termsInput])) === termsInput);
  check('findTermsCheckbox finds it even with a different React id (the id is never used)',
    (() => { const t = fakeEl({ tag: 'input', testid: 'express-terms-checkbox', elid: ':r9x:' }); t.type = 'checkbox'; return bot.findTermsCheckbox(docOf([t])) === t; })());
  check('findTermsCheckbox returns null when the checkbox is absent',
    bot.findTermsCheckbox(docOf([])) === null);
  check('the script never selects the checkbox by its React id',
    !SRC.includes(':r1l:') && !/getElementById\(\s*['"]:r/.test(SRC));
  // termsClickTarget: label first, display wrapper second, input last.
  var tLabel = fakeEl({ tag: 'label', cls: 'a-checkbox__inside' });
  var tInput = fakeEl({ tag: 'input', testid: 'express-terms-checkbox' });
  tInput.type = 'checkbox'; tInput.parentNode = tLabel;
  check('termsClickTarget prefers the wrapping label', bot.termsClickTarget(tInput) === tLabel);
  var tDisp = fakeEl({ tag: 'div', cls: 'a-checkboxDisplay a-checkbox__wrapper -interactive' });
  var tInput2 = fakeEl({ tag: 'input', testid: 'express-terms-checkbox' });
  tInput2.type = 'checkbox'; tInput2.parentNode = tDisp;
  check('termsClickTarget falls back to the checkbox display wrapper', bot.termsClickTarget(tInput2) === tDisp);
  var tInput3 = fakeEl({ tag: 'input', testid: 'express-terms-checkbox' });
  tInput3.type = 'checkbox'; tInput3.parentNode = null;
  check('termsClickTarget falls back to the input itself with no label/wrapper', bot.termsClickTarget(tInput3) === tInput3);
  // Step 3 finder: by data-testid.
  var placeBtn = fakeEl({ tag: 'button', text: 'Place order', cls: 'a-button c-expressCardForm__submit -regular -transaction -filled -withShapes -fullWidth', testid: 'express-card-form-submit', cyid: 'button' });
  check('findPlaceOrderButton finds the button by data-testid',
    bot.findPlaceOrderButton(docOf([placeBtn])) === placeBtn);
  check('findPlaceOrderButton ignores a disabled Place order button',
    bot.findPlaceOrderButton(docOf([fakeEl({ tag: 'button', text: 'Place order', testid: 'express-card-form-submit', disabled: true })])) === null);
  check('findPlaceOrderButton returns null when absent',
    bot.findPlaceOrderButton(docOf([])) === null);
  // Card-details guard.
  function cardInput(o) {
    const el = fakeEl(Object.assign({ tag: 'input' }, o || {}));
    el.type = (o && o.type) || 'text';
    el.value = (o && o.value) || '';
    return el;
  }
  check('needsPaymentDetails: visible empty card-number field (autocomplete cc-number) is found',
    bot.needsPaymentDetails(docOf([cardInput({ autocomplete: 'cc-number' })])) !== null);
  check('needsPaymentDetails: visible empty CVV field (name) is found',
    bot.needsPaymentDetails(docOf([cardInput({ name: 'cvv' })])) !== null);
  check('needsPaymentDetails: visible empty expiry field (placeholder) is found',
    bot.needsPaymentDetails(docOf([cardInput({ placeholder: 'MM / YY expiry' })])) !== null);
  check('needsPaymentDetails: filled card field (saved card) does NOT count',
    bot.needsPaymentDetails(docOf([cardInput({ autocomplete: 'cc-number', value: '4111111111111111' })])) === null);
  check('needsPaymentDetails: hidden card field does NOT count',
    bot.needsPaymentDetails(docOf([cardInput({ autocomplete: 'cc-number', hidden: true })])) === null);
  check('needsPaymentDetails: the Terms checkbox itself does NOT count',
    bot.needsPaymentDetails(docOf([termsInput])) === null);
  check('needsPaymentDetails: no card fields -> null',
    bot.needsPaymentDetails(docOf([])) === null);
  // Static: gating, wiring, exports.
  check('walk is gated on Auto-Pay (OFF returns before any find/click)',
    walkFnSrc.indexOf("if (!BOT.config.autoPay)") !== -1 &&
    walkFnSrc.indexOf("if (!BOT.config.autoPay)") < walkFnSrc.indexOf('waitForEl('));
  check('panel label says ON places the order itself', SRC.includes('ON = the bot places the order itself'));
  check('walk checks for card details before Place order (never types them)',
    SRC.includes('needsPaymentDetails(document)') && SRC.includes('NEVER types card details'));
  check('checkoutStepHandler hands the express page to the walk',
    SRC.includes("isExpressCheckoutPage(window.location.pathname)) { await runExpressCheckoutWalk(); return; }"));
  check('panel boots the express walk on the express checkout page',
    SRC.includes('if (isExpressCheckoutPage(window.location.pathname))') && SRC.includes('setTimeout(runExpressCheckoutWalk, 3000)'));
  check('walk re-checks the checkbox state after clicking it',
    SRC.includes('if (!terms.checked)') && SRC.includes('terms_still_unchecked'));
  check('walk never skips ahead: failures return via expressWalkFail',
    SRC.includes('expressWalkFail(') && SRC.includes('later steps will NOT run'));
  check('script exports the express helpers',
    ['isExpressCheckoutPage', 'findJumpToBottomButton', 'findTermsCheckbox', 'findPlaceOrderButton', 'termsClickTarget', 'needsPaymentDetails', 'runExpressCheckoutWalk'].every((f) => Object.prototype.hasOwnProperty.call(bot, f)));

  // --- behavioral: the walk end-to-end in a fake express-checkout page ---
  global.MouseEvent = function (type, init) { this.type = type; if (init) { for (const k in init) this[k] = init[k]; } };
  function makeExpressEnv(o) {
    o = o || {};
    const win = makeFakeWindow();
    win.location.href = EXPRESS_URL;
    win.location.pathname = '/en/store/pledge/express-checkout';
    const doc = makeFakeDocument();
    doc.body.innerText = '';
    const order = [];
    function scrollable(el, rect, settledTop) {
      el._rect = rect;
      el.scrollCalls = [];
      el.scrollIntoView = function (opts) {
        this.scrollCalls.push(opts);
        this._rect = { left: rect.left, top: settledTop, width: rect.width, height: rect.height, right: rect.right, bottom: settledTop + rect.height };
      };
      el.getBoundingClientRect = function () { return this._rect; };
      el.offsetParent = {};
      return el;
    }
    // (v1.3.2) tIn is declared up here so the Jump listener can enable
    // the Terms checkbox when it is clicked (the live page enables the
    // checkbox only after scrolling to the bottom).
    let tIn = null, tLab = null;
    // Step 1: "Jump to bottom" — exactly as Shariful pasted it.
    // v1.3.2 options: noJump (never renders), lateJumpMs (renders late,
    // like the live React page).
    let jump = null;
    if (!o.noJump) {
      jump = scrollable(FakeEl('button', { text: 'Jump to bottom', cls: 'a-button -regular -weak -filled -withShapes -fullWidth', attrs: { 'data-cy-id': 'button' } }),
        { left: 100, top: 2400, width: 600, height: 50, right: 700, bottom: 2450 }, 100);
      jump.addEventListener('click', () => {
        order.push('jump');
        if (o.termsDisabledUntilJump && tIn) {
          setTimeout(() => { if (tIn) tIn.disabled = false; },
            (o.termsEnableDelayMs === undefined ? 800 : o.termsEnableDelayMs));
        }
      });
      if (o.lateJumpMs) setTimeout(() => doc.body.appendChild(jump), o.lateJumpMs);
      else doc.body.appendChild(jump);
    }
    // Step 2: Terms checkbox + label — exactly as Shariful pasted it.
    if (!o.noTerms) {
      tLab = scrollable(FakeEl('label', { cls: 'a-checkbox__inside', text: 'I agree to the Terms of Service and Privacy Policy' }),
        { left: 100, top: 2600, width: 600, height: 40, right: 700, bottom: 2640 }, 300);
      const disp = FakeEl('div', { cls: 'a-checkboxDisplay a-checkbox__wrapper -interactive' });
      tIn = FakeEl('input', { attrs: { 'data-testid': 'express-terms-checkbox', 'data-cy-id': 'checkbox__input' } });
      tIn.type = 'checkbox';
      tIn.checked = !!o.termsChecked;
      // v1.3.2: the live page keeps the checkbox DISABLED until the page
      // is scrolled to the bottom (the Jump click enables it, after a
      // short delay, via the Jump listener above).
      if (o.termsDisabledUntilJump) tIn.disabled = true;
      tLab.appendChild(disp);
      tLab.appendChild(tIn);
      // A real browser forwards a label click to its checkbox.
      tLab.addEventListener('click', () => { tIn.checked = !tIn.checked; });
      tLab.addEventListener('click', () => order.push('terms'));
      doc.body.appendChild(tLab);
    }
    // Step 3: "Place order" — exactly as Shariful pasted it.
    const place = scrollable(FakeEl('button', { text: 'Place order', cls: 'a-button c-expressCardForm__submit -regular -transaction -filled -withShapes -fullWidth', attrs: { 'data-testid': 'express-card-form-submit', 'data-cy-id': 'button' } }),
      { left: 100, top: 2800, width: 600, height: 50, right: 700, bottom: 2850 }, 500);
    place.addEventListener('click', () => order.push('place'));
    // v1.3.2: the live page keeps Place order DISABLED until the Terms
    // box is checked AND a payment method is selected.
    if (o.placeDisabled) place.disabled = true;
    doc.body.appendChild(place);
    // Optional: a visible, empty card-number field (payment form asking for details).
    if (o.cardField) {
      const card = FakeEl('input', { attrs: { autocomplete: 'cc-number', name: 'cardNumber', placeholder: 'Card number' } });
      card.type = 'text'; card.value = '';
      card._rect = { left: 100, top: 200, width: 300, height: 40, right: 400, bottom: 240 };
      card.offsetParent = {};
      doc.body.appendChild(card);
    }
    // v1.3.3: a FILLED card field (a saved payment method) — the
    // guard must NOT count it, so the walk completes.
    if (o.savedCardField) {
      const card = FakeEl('input', { attrs: { autocomplete: 'cc-number', name: 'cardNumber', placeholder: 'Card number' } });
      card.type = 'text'; card.value = '4111111111111111';
      card._rect = { left: 100, top: 200, width: 300, height: 40, right: 400, bottom: 240 };
      card.offsetParent = {};
      doc.body.appendChild(card);
    }
    // v1.3.2: the card form renders LATE (after the Jump click) — the
    // guard before Place order must catch it (v1.3.3: the walk-start
    // guard was removed, so this is the only guard).
    if (o.lateCardMs) {
      const card = FakeEl('input', { attrs: { autocomplete: 'cc-number', name: 'cardNumber', placeholder: 'Card number' } });
      card.type = 'text'; card.value = '';
      card._rect = { left: 100, top: 200, width: 300, height: 40, right: 400, bottom: 240 };
      card.offsetParent = {};
      setTimeout(() => doc.body.appendChild(card), o.lateCardMs);
    }
    const clickables = [jump, tLab, place].filter(Boolean);
    doc.elementFromPoint = function (x, y) {
      for (const c of clickables) {
        const r = c._rect;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c;
      }
      return null;
    };
    const loaderN = new Function('module', 'exports', 'window', 'document', SRC);
    const moduleObjN = { exports: {} };
    loaderN(moduleObjN, moduleObjN.exports, win, doc);
    return { win: win, doc: doc, bot: moduleObjN.exports, $: function (id) { return doc.getElementById(id); }, order: order, jump: jump, termsInput: tIn, place: place };
  }
  function setAutoPay(env, on) {
    const box = env.$('scab-autopay');
    box.checked = !!on;
    box.dispatchEvent({ type: 'change', target: box });
  }

  // (a) Happy path: Auto-Pay ON, all three present, Terms unchecked.
  const envA = makeExpressEnv();
  setAutoPay(envA, true);
  const resA = await envA.bot.runExpressCheckoutWalk();
  check('(a) happy path: walk succeeds', resA.ok === true && resA.reason === 'placed', JSON.stringify(resA));
  check('(a) happy path: the three steps ran IN ORDER (jump -> terms -> place)',
    envA.order.join(',') === 'jump,terms,place', envA.order.join(','));
  check('(a) happy path: Terms checkbox is checked afterwards', envA.termsInput.checked === true);
  check('(a) happy path: each step was logged', ['step 1/3', 'step 2/3', 'step 3/3', '"Place order" clicked'].every((s) => envA.$('scab-log')._html.indexOf(s) !== -1));
  check('(a) happy path: status is DONE', envA.$('scab-status').textContent === 'DONE');

  // (b) Terms already checked: the checkbox click is skipped, Place order still fires.
  const envB = makeExpressEnv({ termsChecked: true });
  setAutoPay(envB, true);
  const resB = await envB.bot.runExpressCheckoutWalk();
  check('(b) already-checked Terms: walk succeeds', resB.ok === true);
  check('(b) already-checked Terms: label NOT clicked, Place order still clicked',
    envB.order.join(',') === 'jump,place', envB.order.join(','));
  check('(b) already-checked Terms: log says it was already checked',
    envB.$('scab-log')._html.indexOf('already checked') !== -1);

  // (c) Auto-Pay OFF: ZERO checkout clicks.
  const envC = makeExpressEnv();
  const resC = await envC.bot.runExpressCheckoutWalk();
  check('(c) Auto-Pay OFF: walk refuses', resC.ok === false && resC.reason === 'autopay_off', JSON.stringify(resC));
  check('(c) Auto-Pay OFF: zero checkout clicks', envC.order.length === 0, envC.order.join(','));
  check('(c) Auto-Pay OFF: log says it will NOT click any of the three',
    envC.$('scab-log')._html.indexOf('Auto-Pay is OFF') !== -1 && envC.$('scab-log')._html.indexOf('will NOT click') !== -1);

  // (d) Terms checkbox missing: Jump runs, then the walk STOPS — Place order is never attempted.
  const envD = makeExpressEnv({ noTerms: true });
  setAutoPay(envD, true);
  const resD = await envD.bot.runExpressCheckoutWalk();
  check('(d) missing Terms checkbox: walk fails at step 2', resD.ok === false && resD.reason === 'terms_not_found', JSON.stringify(resD));
  check('(d) missing Terms checkbox: Jump ran, Place order was NEVER attempted',
    envD.order.indexOf('jump') !== -1 && envD.order.indexOf('place') === -1, envD.order.join(','));
  check('(d) missing Terms checkbox: log says the walk stopped and later steps will NOT run',
    envD.$('scab-log')._html.indexOf('STOPPED') !== -1 && envD.$('scab-log')._html.indexOf('later steps will NOT run') !== -1);

  // (e) Payment form asking for card details: v1.3.3 — the walk
  // runs Jump + Terms FIRST (the walk-start guard was removed: on a
  // fully-rendered page it aborted the walk at step 0, live
  // 2026-11-21 17:55) and stops BEFORE Place order.
  const envE = makeExpressEnv({ cardField: true });
  setAutoPay(envE, true);
  const resE = await envE.bot.runExpressCheckoutWalk();
  check('(e) card details needed: walk stops before Place order', resE.ok === false && resE.reason === 'needs_payment_details', JSON.stringify(resE));
  check('(e) card details needed: Jump + Terms ran, Place order was NEVER attempted',
    envE.order.join(',') === 'jump,terms', envE.order.join(','));
  check('(e) card details needed: log names the step it stopped at and says the bot NEVER types card details',
    envE.$('scab-log')._html.indexOf('STOPPED before Place order') !== -1 && envE.$('scab-log')._html.indexOf('NEVER types card details') !== -1);

  console.log('== 17. Cart-page resume + click verification (v1.3.1) ==');
  // REGRESSION (live 2026-11-21, First Flight Pack, v1.3.0, Auto-Pay ON):
  // "Buy Now clicked (human-like path)" at 17:15:52, then NOTHING — the
  // panel log ran on the SAME product page until 17:22:25, no checkout
  // walk ever started. Two causes: (1) the cart page boots with a fresh
  // BOT (BOT.found is null there) and the panel only resumed the walk
  // "if (.../cart... && BOT.found)", so it never resumed — same for the
  // API path, whose setTimeout(checkoutStepHandler, 4000) died with the
  // page unload; (2) "Buy Now clicked" only meant the synthetic events
  // dispatched — the page never reacted.
  // Tampermonkey storage for the §17 envs (shared across loaders, like
  // a real GM store surviving a page navigation).
  const gmStore = {};
  global.GM_getValue = function (k, d) { return (k in gmStore) ? gmStore[k] : (d === undefined ? null : d); };
  global.GM_setValue = function (k, v) { gmStore[k] = v; };
  const PENDING_KEY = 'scab_checkout_pending';
  function setPending(p) { gmStore[PENDING_KEY] = JSON.stringify(p); }
  function clearPending() { delete gmStore[PENDING_KEY]; }

  // --- pure: page matching + flag storage (first loader, memory fallback) ---
  check('isCartPage: the cart URL is a cart page',
    bot.isCartPage('https://robertsspaceindustries.com/en/store/pledge/cart') === true);
  check('isCartPage: express / product pages are not',
    bot.isCartPage(EXPRESS_URL) === false && bot.isCartPage(KRAKEN.url) === false && bot.isCartPage('') === false);
  check('pending flag round-trips (save -> load)',
    (() => { bot.saveCheckoutPending({ source: 'dom_buy_now', product: 'First Flight Pack', maxPrice: 100, at: Date.now() }); const p = bot.loadCheckoutPending(); return p && p.source === 'dom_buy_now' && p.product === 'First Flight Pack' && p.maxPrice === 100; })());
  check('pending flag clears (clear -> load null)',
    (() => { bot.clearCheckoutPending(); return bot.loadCheckoutPending() === null; })());
  check('stale flag (31 min old) is invalid and cleared',
    (() => { bot.saveCheckoutPending({ source: 'dom_buy_now', product: 'X', at: Date.now() - 31 * 60 * 1000 }); const ok = bot.checkoutPendingValid(bot.loadCheckoutPending()) === false; return ok && bot.loadCheckoutPending() === null; })());
  check('fresh flag is valid',
    (() => { bot.saveCheckoutPending({ source: 'api_add_to_cart', product: 'Kraken', skuId: '1', at: Date.now() }); const ok = bot.checkoutPendingValid(bot.loadCheckoutPending()) === true; bot.clearCheckoutPending(); return ok; })());
  check('clickReacted: same href + enabled + present -> false',
    bot.clickReacted('https://robertsspaceindustries.com/en/pledge/x', { disabled: false }) === false);
  check('clickReacted: disabled button -> true',
    bot.clickReacted('https://robertsspaceindustries.com/en/pledge/x', { disabled: true }) === true);

  // --- static: wiring ---
  const domSave = SRC.indexOf("saveCheckoutPending({ source: 'dom_buy_now'");
  check('DOM path saves the pending flag before navigating to the cart',
    domSave !== -1 && SRC.indexOf("window.location.href = RSI_ORIGIN + '/store/pledge/cart'", domSave) !== -1);
  const apiSave = SRC.indexOf("saveCheckoutPending({ source: 'api_add_to_cart'");
  check('API path saves the pending flag before navigating to the cart',
    apiSave !== -1 && SRC.indexOf("window.location.href = RSI_ORIGIN + '/store/pledge/cart'", apiSave) !== -1);
  const atcSrc = (SRC.match(/async function addToCartAndCheckout[\s\S]*?\n}/) || [''])[0];
  check('the dead setTimeout after navigation is gone from add-to-cart',
    atcSrc.length > 0 && atcSrc.indexOf('setTimeout(checkoutStepHandler') === -1);
  const bpSrc = (SRC.match(/function buildPanel[\s\S]*?\n}/) || [''])[0];
  check('panel boot resumes from the pending flag, not BOT.found',
    bpSrc.indexOf('maybeResumeCheckout()') !== -1 && bpSrc.indexOf('BOT.found)') === -1);
  check('maybeResumeCheckout requires the cart page + a valid flag',
    SRC.includes('if (!isCartPage(window.location.pathname)) return false') && SRC.includes('checkoutPendingValid(pending)'));
  const slSrc = (SRC.match(/function stopLoop[\s\S]*?\n}/) || [''])[0];
  check('Stop clears the pending flag', slSrc.indexOf('clearCheckoutPending()') !== -1);
  const ewfSrc2 = (SRC.match(/function expressWalkFail[\s\S]*?\n}/) || [''])[0];
  check('express walk clears the flag when it stops', ewfSrc2.indexOf('clearCheckoutPending()') !== -1);
  const walkFnSrc2 = (SRC.match(/async function runExpressCheckoutWalk[\s\S]*?\n}/) || [''])[0];
  check('express walk clears the flag when it finishes (placed)',
    walkFnSrc2.indexOf('clearCheckoutPending()') !== -1 && walkFnSrc2.indexOf("reason: 'placed'") !== -1);
  const cshSrc = (SRC.match(/async function checkoutStepHandler[\s\S]*?\n}/) || [''])[0];
  check('cart walk clears the flag when it stops at payment / finishes',
    cshSrc.indexOf('clearCheckoutPending()') !== -1);
  check('click verification: the Buy Now path waits for a reaction and retries once with a plain click',
    SRC.includes('waitForClickReaction(beforeHref, btn, 2000)') && SRC.includes('retrying once with a plain click') && SRC.includes('did NOT move the page even after a plain click retry'));
  check('click verification: no cart navigation when the click did not move the page',
    SRC.includes('NOT navigating to the cart; will retry on the next tick'));
  check('the bot does not force the cart navigation when RSI is already navigating',
    SRC.includes('if (!clicked.alreadyNavigating) window.location.href'));
  check('script exports the new helpers',
    ['isCartPage', 'maybeResumeCheckout', 'saveCheckoutPending', 'loadCheckoutPending', 'clearCheckoutPending', 'checkoutPendingValid', 'clickBuyNowIfAvailable', 'clickReacted', 'waitForClickReaction'].every((f) => Object.prototype.hasOwnProperty.call(bot, f)));

  // --- behavioral: Buy Now click verification on a fake product page ---
  function makeBuyNowEnv(o) {
    o = o || {};
    const win = makeFakeWindow();
    win.location.href = FFP_URL;
    win.location.pathname = '/en/pledge/Packages/Star-Citizen-First-Flight-Pack';
    const doc = makeFakeDocument();
    doc.body.innerText = '';
    const btn = FakeEl('button');
    btn.setAttribute('data-testid', 'express-buy-now');
    btn.offsetParent = {};
    btn._rect = { left: 100, top: 1500, width: 200, height: 50, right: 300, bottom: 1550 };
    btn.scrollCalls = [];
    btn.scrollIntoView = function (opts) {
      this.scrollCalls.push(opts);
      win.scrollY = 1200;
      this._rect = { left: 100, top: 300, width: 200, height: 50, right: 300, bottom: 350 };
    };
    btn.getBoundingClientRect = function () { return this._rect; };
    let clicks = 0;
    btn.addEventListener('click', () => {
      clicks++;
      if (o.reacts === 'navigate') {
        win.location.href = EXPRESS_URL;
        win.location.pathname = '/en/store/pledge/express-checkout';
      } else if (o.reacts === 'disable') {
        btn.disabled = true;
      } else if (o.reacts === 'plain-only') {
        if (clicks >= 2) { win.location.href = EXPRESS_URL; win.location.pathname = '/en/store/pledge/express-checkout'; }
      } else if (o.reacts === 'remove') {
        doc.body.children = doc.body.children.filter((c) => c !== btn);
      }
      // 'ignore': nothing happens — the page does not react.
    });
    doc.body.appendChild(btn);
    doc.elementFromPoint = function (x, y) {
      const r = btn._rect;
      return (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) ? btn : null;
    };
    const loaderN = new Function('module', 'exports', 'window', 'document', SRC);
    const moduleObjN = { exports: {} };
    loaderN(moduleObjN, moduleObjN.exports, win, doc);
    const env = { win: win, doc: doc, bot: moduleObjN.exports, $: function (id) { return doc.getElementById(id); }, btn: btn, clicks: function () { return clicks; } };
    // Add First Flight Pack to the watchlist via the panel form.
    env.$('scab-add-url').value = FFP_URL;
    env.$('scab-add-price').value = '60';
    env.$('scab-add-btn').click();
    return env;
  }
  function clickCount(env) { return env.btn._events.filter((e) => e.type === 'click').length; }

  // (f) The click works: the page navigates (RSI express flow).
  const envF = makeBuyNowEnv({ reacts: 'navigate' });
  const resF = await envF.bot.clickBuyNowIfAvailable();
  check('(f) reacting page: click returns the entry', !!resF && resF.entry && resF.entry.name === 'Star Citizen First Flight Pack', JSON.stringify(resF && resF.entry && resF.entry.name));
  check('(f) reacting page: already navigating is true', !!resF && resF.alreadyNavigating === true);
  check('(f) reacting page: exactly one click dispatched (no plain retry)', clickCount(envF) === 1, 'clicks=' + clickCount(envF));
  check('(f) reacting page: log says the page reacted', envF.$('scab-log')._html.indexOf('the page reacted') !== -1);

  // (g) The page ignores the human-like click, reacts to the plain retry.
  const envG = makeBuyNowEnv({ reacts: 'plain-only' });
  const resG = await envG.bot.clickBuyNowIfAvailable();
  check('(g) plain-only page: click returns the entry after the retry', !!resG && !!resG.entry, JSON.stringify(resG));
  check('(g) plain-only page: the retry was logged', envG.$('scab-log')._html.indexOf('retrying once with a plain click') !== -1);
  check('(g) plain-only page: two clicks were dispatched (human-like + one plain retry)', clickCount(envG) === 2, 'clicks=' + clickCount(envG));

  // (h) The page ignores everything: no entry, no cart navigation, plainly logged.
  const envH = makeBuyNowEnv({ reacts: 'ignore' });
  const resH = await envH.bot.clickBuyNowIfAvailable();
  check('(h) ignoring page: click returns false', resH === false, JSON.stringify(resH));
  check('(h) ignoring page: log says the click did NOT move the page', envH.$('scab-log')._html.indexOf('did NOT move the page') !== -1);
  check('(h) ignoring page: log says it is NOT navigating to the cart', envH.$('scab-log')._html.indexOf('NOT navigating to the cart') !== -1);
  check('(h) ignoring page: the page URL did not change', envH.win.location.href === FFP_URL, envH.win.location.href);

  // (i) The button disappears after the click (RSI removed it): counts as a reaction.
  const envI = makeBuyNowEnv({ reacts: 'remove' });
  const resI = await envI.bot.clickBuyNowIfAvailable();
  check('(i) removed button: click returns the entry', !!resI && !!resI.entry, JSON.stringify(resI));
  check('(i) removed button: no plain retry was needed', clickCount(envI) === 1, 'clicks=' + clickCount(envI));

  // (o) End-to-end DOM path via Start: click -> page navigates -> flag saved, RSI navigation NOT overridden.
  const envO = makeBuyNowEnv({ reacts: 'navigate' });
  clearPending();
  envO.$('scab-start').click();
  await sleepMs(3000);
  const flagO = envO.bot.loadCheckoutPending();
  check('(o) DOM path via Start: pending flag saved with source dom_buy_now',
    !!flagO && flagO.source === 'dom_buy_now' && flagO.product === 'Star Citizen First Flight Pack', JSON.stringify(flagO));
  check('(o) DOM path via Start: RSI navigation to express checkout was NOT overridden with the cart',
    envO.win.location.href === EXPRESS_URL, envO.win.location.href);
  clearPending();

  // (p) End-to-end API path via Start: in-stock Kraken -> add-to-cart -> flag saved, cart navigation.
  const envP = (function () {
    const win = makeFakeWindow(); // default location is the Kraken page
    const doc = makeFakeDocument();
    doc.body.innerText = '';
    const loaderN = new Function('module', 'exports', 'window', 'document', SRC);
    const moduleObjN = { exports: {} };
    loaderN(moduleObjN, moduleObjN.exports, win, doc);
    return { win: win, doc: doc, bot: moduleObjN.exports, $: function (id) { return doc.getElementById(id); } };
  })();
  const realFetch2 = global.fetch;
  global.fetch = async () => ({ status: 200, ok: true, json: async () => loadFixture('kraken-in-stock-synthetic.json') });
  clearPending();
  envP.$('scab-start').click();
  await sleepMs(1500);
  const flagP = envP.bot.loadCheckoutPending();
  check('(p) API path via Start: pending flag saved with source api_add_to_cart',
    !!flagP && flagP.source === 'api_add_to_cart' && flagP.product === 'Kraken' && !!flagP.skuId, JSON.stringify(flagP));
  check('(p) API path via Start: bot navigated to the cart',
    envP.win.location.href === 'https://robertsspaceindustries.com/store/pledge/cart', envP.win.location.href);
  global.fetch = realFetch2;
  clearPending();

  // --- behavioral: cart-page resume ---
  function makeCartEnv(o) {
    o = o || {};
    const win = makeFakeWindow();
    win.location.href = 'https://robertsspaceindustries.com/en/store/pledge/cart';
    win.location.pathname = '/en/store/pledge/cart';
    const doc = makeFakeDocument();
    doc.body.innerText = o.bodyText || '';
    const loaderN = new Function('module', 'exports', 'window', 'document', SRC);
    const moduleObjN = { exports: {} };
    loaderN(moduleObjN, moduleObjN.exports, win, doc);
    return { win: win, doc: doc, bot: moduleObjN.exports, $: function (id) { return doc.getElementById(id); } };
  }
  // (j) Flag set: the cart page resumes the walk (boot schedules it).
  setPending({ source: 'dom_buy_now', product: 'First Flight Pack', maxPrice: 100, at: Date.now() });
  const realFetch3 = global.fetch;
  global.fetch = async () => ({ status: 200, ok: true, json: async () => ({}) });
  const envJ = makeCartEnv();
  await sleepMs(3800);
  check('(j) cart page WITH flag: the walk resumed', envJ.$('scab-log')._html.indexOf('Resuming the checkout walk on the cart page') !== -1);
  check('(j) cart page WITH flag: a checkout step ran', envJ.$('scab-log')._html.indexOf('Advanced one checkout step.') !== -1);
  check('(j) cart page WITH flag: the flag stays while the walk is in progress',
    !!envJ.bot.loadCheckoutPending(), JSON.stringify(envJ.bot.loadCheckoutPending()));
  global.fetch = realFetch3;
  clearPending();
  // (k) No flag: the cart page starts NO walk.
  const envK = makeCartEnv();
  check('(k) cart page WITHOUT flag: maybeResumeCheckout refuses', envK.bot.maybeResumeCheckout(50) === false);
  await sleepMs(300);
  check('(k) cart page WITHOUT flag: no checkout step ran',
    envK.$('scab-log')._html.indexOf('Advanced one checkout step.') === -1 &&
    envK.$('scab-log')._html.indexOf('Resuming the checkout walk') === -1);
  // (l) Stale flag: refused and cleared.
  setPending({ source: 'dom_buy_now', product: 'Kraken', at: Date.now() - 31 * 60 * 1000 });
  const envL = makeCartEnv();
  check('(l) stale flag: maybeResumeCheckout refuses', envL.bot.maybeResumeCheckout(50) === false);
  check('(l) stale flag: the stale flag is cleared', envL.bot.loadCheckoutPending() === null);
  clearPending();
  // (m) Walk stopped (Auto-Pay OFF): the flag is cleared.
  const envM = makeExpressEnv();
  envM.bot.saveCheckoutPending({ source: 'dom_buy_now', product: 'First Flight Pack', at: Date.now() });
  const resM = await envM.bot.runExpressCheckoutWalk(); // Auto-Pay OFF by default
  check('(m) walk stopped (Auto-Pay OFF): flag is cleared',
    resM.reason === 'autopay_off' && envM.bot.loadCheckoutPending() === null, JSON.stringify(resM));
  // (n) Stop press clears the flag.
  const envN = makeBuyNowEnv({ reacts: 'ignore' });
  envN.bot.saveCheckoutPending({ source: 'dom_buy_now', product: 'X', at: Date.now() });
  envN.$('scab-stop').click();
  check('(n) Stop press clears the pending flag', envN.bot.loadCheckoutPending() === null);

  console.log('== 18. Express walk waits (v1.3.2) ==');
  // REGRESSION (live 2026-11-21, First Flight Pack, v1.3.0, Auto-Pay ON):
  // the walk at 17:38:40 logged "the 'Jump to bottom' button was not
  // found" — yet a live browser inspection a minute later showed the
  // button EXISTS and VISIBLE ("JUMP TO BOTTOM", ~680x50, enabled).
  // The React page renders asynchronously; the walk checked ONCE, 3s
  // after panel boot, and failed permanently. The same inspection
  // found the Terms checkbox DISABLED until the page is scrolled to
  // the bottom, and Place order DISABLED until Terms is checked and a
  // payment method is selected.
  function docWith(els) {
    return {
      body: { innerText: '' },
      querySelector: function (sel) { const all = this.querySelectorAll(sel); return all.length ? all[0] : null; },
      querySelectorAll: function (sel) {
        return els.filter(function (el) {
          if (sel === 'input') return el.tagName === 'INPUT';
          if (sel === 'iframe') return el.tagName === 'IFRAME';
          if (sel === 'button') return el.tagName === 'BUTTON';
          var tm = sel.match(/^\[data-testid="([^"]+)"\]$/);
          if (tm) return el.getAttribute && el.getAttribute('data-testid') === tm[1];
          return false;
        });
      },
    };
  }
  // --- pure: wait helpers ---
  const jumpPure = fakeEl({ tag: 'button', text: 'Jump to bottom' });
  check('waitForEl: immediately-present element is returned at once',
    (await bot.waitForEl(() => jumpPure, docWith([]), 'x', 1000, 50)) === jumpPure);
  let latePolls = 0;
  const lateEl = await bot.waitForEl(() => (++latePolls >= 3 ? jumpPure : null), docWith([]), 'x', 2000, 50);
  check('waitForEl: element appearing after several polls is found', lateEl === jumpPure && latePolls >= 3, 'polls=' + latePolls);
  const t0 = Date.now();
  const noEl = await bot.waitForEl(() => null, docWith([]), 'x', 300, 50);
  check('waitForEl: returns null after the timeout', noEl === null && Date.now() - t0 >= 250, 'took ' + (Date.now() - t0) + 'ms');
  check('waitForEnabled: already-enabled element returns true at once',
    (await bot.waitForEnabled({ disabled: false }, 'x', 1000, 50)) === true);
  const lateEn = { disabled: true };
  setTimeout(() => { lateEn.disabled = false; }, 120);
  check('waitForEnabled: element enabled during the wait returns true',
    (await bot.waitForEnabled(lateEn, 'x', 2000, 50)) === true);
  check('waitForEnabled: element staying disabled returns false after the timeout',
    (await bot.waitForEnabled({ disabled: true }, 'x', 300, 50)) === false);
  // --- pure: raw finders return disabled elements (the walk waits for enabled separately) ---
  check('findJumpToBottomButtonEl returns a disabled Jump button',
    bot.findJumpToBottomButtonEl(docOf([fakeEl({ tag: 'button', text: 'Jump to bottom', disabled: true })])) !== null);
  check('findPlaceOrderButtonEl returns a disabled Place order button',
    bot.findPlaceOrderButtonEl(docOf([fakeEl({ tag: 'button', text: 'Place order', testid: 'express-card-form-submit', disabled: true })])) !== null);
  // --- pure: card guard sees hosted card fields in iframes ---
  check('needsPaymentDetails: visible Stripe card iframe counts as card details needed',
    bot.needsPaymentDetails(docWith([fakeEl({ tag: 'iframe', src: 'https://js.stripe.com/v3/elements-inner-card-123' })])) !== null);
  check('needsPaymentDetails: hidden card iframe does NOT count',
    bot.needsPaymentDetails(docWith([fakeEl({ tag: 'iframe', src: 'https://js.stripe.com/v3/elements-inner-card-123', hidden: true })])) === null);
  check('needsPaymentDetails: iframe with an unrelated src does NOT count',
    bot.needsPaymentDetails(docWith([fakeEl({ tag: 'iframe', src: 'https://www.youtube.com/embed/xyz' })])) === null);
  // --- static: the walk waits ---
  check('walk waits for each step instead of failing on first sight',
    walkFnSrc2.indexOf('waitForEl(') !== -1 && walkFnSrc2.indexOf('waitForEnabled(') !== -1);
  check('walk waits for the Terms checkbox to become enabled after the jump',
    walkFnSrc2.indexOf('terms_disabled') !== -1 && walkFnSrc2.indexOf('waitForEnabled(terms') !== -1);
  check('walk stops with a payment-method reason when Place order never enables',
    walkFnSrc2.indexOf('place_disabled_no_payment') !== -1 && walkFnSrc2.indexOf('saved payment method') !== -1);
  check('script exports the wait helpers',
    ['findJumpToBottomButtonEl', 'findPlaceOrderButtonEl', 'waitForEl', 'waitForEnabled'].every((f) => Object.prototype.hasOwnProperty.call(bot, f)));

  // (q) Jump renders LATE (live React page): the walk waits and the three steps run in order.
  const envQ = makeExpressEnv({ lateJumpMs: 1200 });
  setAutoPay(envQ, true);
  const resQ = await envQ.bot.runExpressCheckoutWalk({ presenceMs: 5000, enabledMs: 2000 });
  check('(q) late Jump: walk succeeds', resQ.ok === true && resQ.reason === 'placed', JSON.stringify(resQ));
  check('(q) late Jump: the three steps ran IN ORDER (jump -> terms -> place)',
    envQ.order.join(',') === 'jump,terms,place', envQ.order.join(','));
  check('(q) late Jump: log says it waited for the button',
    envQ.$('scab-log')._html.indexOf('Waiting for') !== -1);

  // (r) Terms DISABLED until the Jump click: the walk waits for it to become enabled, then checks it.
  const envR = makeExpressEnv({ termsDisabledUntilJump: true, termsEnableDelayMs: 800 });
  setAutoPay(envR, true);
  const resR = await envR.bot.runExpressCheckoutWalk({ presenceMs: 5000, enabledMs: 5000 });
  check('(r) disabled-until-scrolled Terms: walk succeeds', resR.ok === true && resR.reason === 'placed', JSON.stringify(resR));
  check('(r) disabled-until-scrolled Terms: the three steps ran IN ORDER',
    envR.order.join(',') === 'jump,terms,place', envR.order.join(','));
  check('(r) disabled-until-scrolled Terms: checkbox is checked afterwards', envR.termsInput.checked === true);
  check('(r) disabled-until-scrolled Terms: log says it waited for the checkbox to become enabled',
    envR.$('scab-log')._html.indexOf('disabled until the page is scrolled') !== -1);

  // (s) Place order stays DISABLED (no payment method): the walk stops with the payment-method reason.
  const envS = makeExpressEnv({ placeDisabled: true });
  setAutoPay(envS, true);
  const resS = await envS.bot.runExpressCheckoutWalk({ presenceMs: 1000, enabledMs: 800 });
  check('(s) disabled Place order: walk fails with the payment-method reason',
    resS.ok === false && resS.reason === 'place_disabled_no_payment', JSON.stringify(resS));
  check('(s) disabled Place order: Jump + Terms ran, Place order was NEVER clicked',
    envS.order.join(',') === 'jump,terms', envS.order.join(','));
  check('(s) disabled Place order: log says a saved payment method is needed',
    envS.$('scab-log')._html.indexOf('saved payment method') !== -1);

  // (t) Card form renders LATE (after the Jump): the guard before
  // Place order catches it (v1.3.3: there is only one guard now —
  // the walk-start guard was removed).
  const envT = makeExpressEnv({ lateCardMs: 800 });
  setAutoPay(envT, true);
  const resT = await envT.bot.runExpressCheckoutWalk({ presenceMs: 5000, enabledMs: 5000 });
  check('(t) late card form: walk stops at the guard before Place order', resT.ok === false && resT.reason === 'needs_payment_details', JSON.stringify(resT));
  check('(t) late card form: Jump + Terms ran, Place order was NEVER attempted',
    envT.order.join(',') === 'jump,terms', envT.order.join(','));
  check('(t) late card form: log says the bot NEVER types card details',
    envT.$('scab-log')._html.indexOf('NEVER types card details') !== -1);

  // (u) Jump NEVER appears: the walk fails at step 1 after waiting, with zero clicks.
  const envU = makeExpressEnv({ noJump: true });
  setAutoPay(envU, true);
  const resU = await envU.bot.runExpressCheckoutWalk({ presenceMs: 600, enabledMs: 500 });
  check('(u) missing Jump: walk fails at step 1 after waiting',
    resU.ok === false && resU.reason === 'jump_not_found', JSON.stringify(resU));
  check('(u) missing Jump: zero clicks', envU.order.length === 0, envU.order.join(','));
  check('(u) missing Jump: log says the button did not appear',
    envU.$('scab-log')._html.indexOf('did not appear') !== -1);

  console.log('== 19. Walk-start card guard removed (v1.3.3) ==');
  // REGRESSION (live 2026-11-21, First Flight Pack, v1.3.2, Auto-Pay
  // ON, 17:55 Dhaka): the console showed ONLY "Express checkout
  // STOPPED: the page needs card details filled in" — no "walking
  // Jump to bottom → Terms → Place order…" line, no Jump click.
  // The card-details guard ran at WALK START, before step 1, and on
  // a fully-rendered page it saw the empty card form immediately
  // and aborted the whole walk at step 0. The guard now runs ONLY
  // immediately before Place order; Jump + Terms run first.
  // --- static: no guard at walk start ---
  const walkFnSrc3 = (SRC.match(/async function runExpressCheckoutWalk[\s\S]*?\n}/) || [''])[0];
  const walkStart = walkFnSrc3.indexOf("log('Express checkout (Auto-Pay ON): walking Jump to bottom");
  check('no card-details guard before the walk start log',
    walkStart !== -1 && walkFnSrc3.indexOf('needsPaymentDetails(document)') > walkStart);
  check('the guard runs once, immediately before Place order',
    (walkFnSrc3.match(/needsPaymentDetails\(document\)/g) || []).length === 1);
  check('the guard-stop log names the step it stopped at',
    walkFnSrc3.indexOf('STOPPED before Place order') !== -1);

  // (a) Card form ALREADY rendered at walk start: Jump + Terms run,
  // then the walk stops before Place order — Place order is NEVER
  // clicked. (The exact live 17:55 failure.)
  const env19A = makeExpressEnv({ cardField: true });
  setAutoPay(env19A, true);
  const res19A = await env19A.bot.runExpressCheckoutWalk();
  check('(a) card form present at walk start: walk stops before Place order',
    res19A.ok === false && res19A.reason === 'needs_payment_details', JSON.stringify(res19A));
  check('(a) card form present at walk start: Jump + Terms ran, Place order was NEVER attempted',
    env19A.order.join(',') === 'jump,terms', env19A.order.join(','));
  check('(a) card form present at walk start: the walk start log ran (it got past step 0)',
    env19A.$('scab-log')._html.indexOf('walking Jump to bottom') !== -1);
  check('(a) card form present at walk start: log names the step and says the bot NEVER types card details',
    env19A.$('scab-log')._html.indexOf('STOPPED before Place order') !== -1 && env19A.$('scab-log')._html.indexOf('NEVER types card details') !== -1);

  // (b) Saved payment present (filled card field, Place order
  // enabled): the guard does NOT stop the walk — all three steps run.
  const env19B = makeExpressEnv({ savedCardField: true });
  setAutoPay(env19B, true);
  const res19B = await env19B.bot.runExpressCheckoutWalk();
  check('(b) saved payment present: walk completes', res19B.ok === true && res19B.reason === 'placed', JSON.stringify(res19B));
  check('(b) saved payment present: the three steps ran IN ORDER (jump -> terms -> place)',
    env19B.order.join(',') === 'jump,terms,place', env19B.order.join(','));

  // (c) Jump renders LATE + no saved payment: the walk still waits
  // for Jump, runs Jump + Terms, then stops at step 3.
  const env19C = makeExpressEnv({ lateJumpMs: 1200, placeDisabled: true });
  setAutoPay(env19C, true);
  const res19C = await env19C.bot.runExpressCheckoutWalk({ presenceMs: 5000, enabledMs: 800 });
  check('(c) late Jump + no saved payment: walk stops at step 3 with the payment-method reason',
    res19C.ok === false && res19C.reason === 'place_disabled_no_payment', JSON.stringify(res19C));
  check('(c) late Jump + no saved payment: Jump + Terms ran, Place order was NEVER clicked',
    env19C.order.join(',') === 'jump,terms', env19C.order.join(','));
  check('(c) late Jump + no saved payment: log says it waited for the button',
    env19C.$('scab-log')._html.indexOf('Waiting for') !== -1);

  delete global.GM_getValue;
  delete global.GM_setValue;

  delete global.MouseEvent;
})().then(() => {
  console.log('\n----------------------------------------');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  process.exit(fail === 0 ? 0 : 1);
}).catch((e) => { console.log('BEHAVIORAL ERROR: ' + (e && e.stack || e)); process.exit(1); });
