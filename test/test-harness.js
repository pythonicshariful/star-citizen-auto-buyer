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
  return hits.length === 1 && SRC.includes("/store/pledge/cart");
})());
check('script contains NO setInterval page refresh', !/setInterval\s*\(\s*\(\s*\)\s*=>\s*\{?\s*location/.test(SRC));
check('script never fills CAPTCHA fields', !/captcha.*\.value\s*=|g-recaptcha-response/i.test(SRC.replace(/detectBlocker[\s\S]*?return null;/, '')));

console.log('== 7. Blocker detection ==');
check('detects captcha text', bot.detectBlocker('Please complete the captcha challenge') === 'captcha');
check('detects queue text', bot.detectBlocker('You are in a queue, position 42') === 'queue');
check('detects verify-human text', bot.detectBlocker('Verify you are human') === 'verify');
check('normal page text -> no blocker', bot.detectBlocker('Kraken - Drake Interplanetary') === null);

console.log('== 8. Safety defaults ==');
check('autoPay defaults OFF', bot.DEFAULT_CONFIG.autoPay === false);
check('default watchlist is Kraken, max $1400, warbond first', bot.DEFAULT_CONFIG.watchlist[0].name === 'Kraken' && bot.DEFAULT_CONFIG.watchlist[0].maxPrice === 1400 && bot.DEFAULT_CONFIG.watchlist[0].preferWarbond === true);
check('default poll window is 8-15s', bot.DEFAULT_CONFIG.pollMinMs === 8000 && bot.DEFAULT_CONFIG.pollMaxMs === 15000);

console.log('\n----------------------------------------');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
process.exit(fail === 0 ? 0 : 1);
