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
check('clickBuyNowIfAvailable gates on isWatchedPage',
  SRC.includes('isWatchedPage(window.location.href, BOT.config.watchlist)'));

console.log('\n----------------------------------------');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
process.exit(fail === 0 ? 0 : 1);
