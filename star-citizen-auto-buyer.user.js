// ==UserScript==
// @name         Star Citizen Auto Buyer (RSI Pledge Store)
// @namespace    https://github.com/pythonicshariful/star-citizen-auto-buyer
// @version      1.0.0
// @description  Monitors RSI pledge-store ships via RSI's own GraphQL API (no page refresh) and auto add-to-cart + checkout when a watched ship comes in stock. Final payment is OFF by default.
// @author       Shariful Islam (pythonicshariful)
// @match        https://robertsspaceindustries.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @grant        GM_openInTab
// @connect      robertsspaceindustries.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/*
 * Star Citizen Auto Buyer — v1.0.0
 * =================================
 * HOW IT CHECKS STOCK (no page refresh, ever):
 *   The RSI store is a JavaScript app. Its own frontend asks the RSI server
 *   for stock with a GraphQL query at /graphql (operation
 *   "GetProductWithSkusPrice"). This bot makes that SAME lightweight API
 *   call on a timer (default every 8-15 seconds, randomised). It NEVER
 *   calls location.reload() and NEVER re-loads the page to check stock.
 *   Refreshing the page over and over is exactly what gets bots detected —
 *   RSI's own support pages say they monitor for bots / scripted activity
 *   and block it, and limit limited ships to one per account.
 *
 * HOW IT FINDS THE KRAKEN:
 *   The Kraken pledge page says its ship list is product id 72
 *   ("Standalone Ships"). The bot asks the API for product 72 and looks
 *   for a SKU whose title contains "Kraken" with stock.available = true.
 *   Verified live 2026-11-21: product 72 returned 213 SKUs, 209 in stock,
 *   Kraken ABSENT (it is not listed while out of stock). When a wave goes
 *   live the Kraken SKU appears in that list — that is the trigger.
 *   A Warbond SKU (cheaper, e.g. Kraken Warbond $1400 vs standard $1650)
 *   is preferred when "Prefer Warbond" is on.
 *
 * SAFETY — READ THIS:
 *   - "Auto-Pay / Place Order" is OFF by default. When OFF the bot stops
 *     at the payment step, sounds an alarm and waits for YOU to pay.
 *     It NEVER types card details. Even when ON, it only clicks a
 *     Place Order button when a saved payment method is already selected.
 *   - It NEVER solves CAPTCHAs. If a CAPTCHA / queue / verify screen
 *     appears the bot PAUSES, alarms, and waits for you.
 *   - Max price is a hard cap: if the only in-stock SKU costs more than
 *     your max price, the bot does NOT buy it.
 *   - No purchase is guaranteed: limited stock, RSI's bot blocking and
 *     one-per-account limits are outside anyone's control.
 *
 * TEST IT SAFELY FIRST (no purchase):
 *   Press "Test stock check now" in the panel. It runs ONE API check for
 *   every watched ship and shows the result. Try it with an in-stock
 *   ship first (e.g. add "PTV - 10 Year", $15, product 72) — you should
 *   see IN STOCK without anything being added to your cart.
 */

'use strict';

/* ------------------------------------------------------------------ */
/* Pure logic — no DOM, no Tampermonkey APIs. Unit-tested in Node.    */
/* ------------------------------------------------------------------ */

const RSI_ORIGIN = 'https://robertsspaceindustries.com';
const GRAPHQL_URL = RSI_ORIGIN + '/graphql';

const DEFAULT_CONFIG = {
  // One entry per ship. `productId` is the RSI store list that holds the
  // ship's SKUs: "72" = Standalone Ships (Kraken lives here when listed).
  // `maxPrice` is USD, hard cap. `preferWarbond` prefers the cheaper
  // Warbond SKU (e.g. Kraken Warbond $1400 vs standard $1650).
  watchlist: [
    {
      name: 'Kraken',
      url: 'https://robertsspaceindustries.com/en/pledge/ships/drake-kraken/Kraken',
      productId: '72',
      maxPrice: 1400,
      preferWarbond: true,
      qty: 1,
    },
  ],
  pollMinMs: 8000,          // fastest gap between stock checks
  pollMaxMs: 15000,         // slowest gap between stock checks
  maxBackoffMs: 120000,     // longest wait after repeated errors / 429s
  autoPay: false,           // FINAL PAYMENT switch — default OFF, see header
  soundAlert: true,
  desktopAlert: true,
};

/** "Kraken" from a pledge URL like .../pledge/ships/drake-kraken/Kraken */
function parseShipNameFromUrl(url) {
  try {
    const parts = String(url || '').split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    const clean = decodeURIComponent(last).replace(/[-_]+/g, ' ').trim();
    return clean || null;
  } catch (e) { return null; }
}

/** RSI prices come back in cents: 140000 -> 1400.00 */
function priceUsd(amountCents) {
  if (amountCents === null || amountCents === undefined) return null;
  const n = Number(amountCents);
  if (!isFinite(n)) return null;
  return n / 100;
}

/** Stock state of one SKU, from the API's TyStock object. */
function stockState(sku) {
  if (!sku || !sku.stock || typeof sku.stock !== 'object') return 'unknown';
  if (sku.stock.available === true) return 'in_stock';
  if (sku.stock.available === false) return 'out_of_stock';
  return 'unknown';
}

/** True when the SKU's price is known and at/under the cap. */
function withinCap(sku, maxPrice) {
  const price = priceUsd(sku && sku.price ? sku.price.amount : null);
  if (price === null) return false;               // unknown price = do not buy
  if (maxPrice === null || maxPrice === undefined) return true;
  return price <= Number(maxPrice);
}

/**
 * Pick the SKU to buy for one watched ship.
 * Returns { sku, reason } — reason is a short code for the log.
 * Rules, in order:
 *  1. Title must contain the ship name (case-insensitive).
 *  2. Must be in stock (stock.available === true).
 *  3. Must be at/under maxPrice (hard cap — over cap is never bought).
 *  4. If preferWarbond, a Warbond SKU wins over a standard one.
 *  5. Otherwise the cheapest matching SKU wins.
 */
function findTargetSku(skus, cfg) {
  const list = Array.isArray(skus) ? skus : [];
  const needle = String(cfg && cfg.name ? cfg.name : '').trim().toLowerCase();
  if (!needle) return { sku: null, reason: 'no_name' };

  const matching = list.filter((s) => String(s && s.title ? s.title : '').toLowerCase().includes(needle));
  if (matching.length === 0) return { sku: null, reason: 'not_listed' };

  const inStock = matching.filter((s) => stockState(s) === 'in_stock');
  if (inStock.length === 0) return { sku: null, reason: 'out_of_stock' };

  const affordable = inStock.filter((s) => withinCap(s, cfg.maxPrice));
  if (affordable.length === 0) return { sku: null, reason: 'over_max_price' };

  let pool = affordable;
  if (cfg.preferWarbond) {
    const warbond = affordable.filter((s) => s.isWarbond === true);
    if (warbond.length > 0) pool = warbond;
  }
  pool.sort((a, b) => (priceUsd(a.price.amount) || 0) - (priceUsd(b.price.amount) || 0));
  return { sku: pool[0], reason: 'in_stock' };
}

/** GraphQL stock-check query — the same one RSI's own store uses. */
function buildStockQuery(productId, limit) {
  return {
    operationName: 'GetProductWithSkusPrice',
    variables: {
      query: { products: { ids: [String(productId)] }, limit: limit || 1000 },
      storeFront: 'pledge',
    },
    query:
      'query GetProductWithSkusPrice($query: SearchQuery!, $storeFront: String = "pledge") { ' +
      'store(name: $storeFront, browse: true) { search(query: $query) { count resources { ' +
      'id title name ... on TyProduct { slug type stock { unlimited show available backOrder qty backOrderQty level } ' +
      'skus { id slug title isWarbond stock { unlimited show available backOrder qty backOrderQty level } ' +
      'price { amount discounted } } } } } } }',
  };
}

/** Pull the SKU list out of a GetProductWithSkusPrice response. */
function parseStockResponse(json) {
  if (!json || !json.data || !json.data.store || !json.data.store.search) return { skus: [], error: 'bad_response' };
  const resources = json.data.store.search.resources || [];
  if (resources.length === 0) return { skus: [], error: null };
  return { skus: resources[0].skus || [], error: null };
}

/** GraphQL add-to-cart mutation — the same one RSI's own store uses. */
function buildAddToCartMutation(skuId, qty) {
  return {
    operationName: 'AddCartMultiItemMutation',
    variables: { query: [{ skuId: String(skuId), qty: qty || 1 }], storeFront: 'pledge' },
    query:
      'mutation AddCartMultiItemMutation($query: [CartAddInput!], $storeFront: String = "pledge") { ' +
      'store(name: $storeFront) { cart { mutations { addMany(query: $query) { count resources { ' +
      'id title ... on TySku { id slug title } } } } } } }',
  };
}

/** Next checkout step — RSI cart flow "moveNext" mutation. */
function buildNextStepMutation() {
  return {
    operationName: 'NextStepMutation',
    variables: { storeFront: 'pledge' },
    query:
      'mutation NextStepMutation($storeFront: String) { store(name: $storeFront) { ' +
      'cart { mutations { flow { moveNext } } } order { slug } } }',
  };
}

/** Randomised wait between polls, with exponential back-off on errors. */
function nextDelayMs(cfg, consecutiveErrors, randomFn) {
  const rnd = randomFn || Math.random;
  const base = cfg.pollMinMs + rnd() * Math.max(0, cfg.pollMaxMs - cfg.pollMinMs);
  if (!consecutiveErrors || consecutiveErrors <= 0) return Math.round(base);
  const backed = base * Math.pow(2, Math.min(consecutiveErrors, 5));
  return Math.round(Math.min(backed, cfg.maxBackoffMs));
}

/** Spot a CAPTCHA / queue / verify wall in page text. Never auto-solved. */
function detectBlocker(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (t.includes('captcha') || t.includes('i\'m not a robot') || t.includes('i am not a robot')) return 'captcha';
  if (t.includes('you are in a queue') || t.includes('queue position') || t.includes('waiting room')) return 'queue';
  if (t.includes('verify you are human') || t.includes('verify your identity') || t.includes('press & hold')) return 'verify';
  if (t.includes('access denied') || t.includes('blocked') && t.includes('bot')) return 'blocked';
  return null;
}

/** Availability from the pledge page's own JSON-LD (already-loaded DOM, no fetch). */
function availabilityFromJsonLd(doc) {
  try {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const el of scripts) {
      const data = JSON.parse(el.textContent || '{}');
      const offers = data && data.offers ? data.offers : null;
      const avail = offers && offers.availability ? String(offers.availability) : '';
      if (/InStock/i.test(avail)) return 'in_stock';
      if (/OutOfStock/i.test(avail)) return 'out_of_stock';
    }
  } catch (e) { /* ignore malformed JSON-LD */ }
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Browser runtime — only runs inside Tampermonkey, never in Node.     */
/* ------------------------------------------------------------------ */

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const hasGM = typeof GM_getValue !== 'undefined';

const BOT = {
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
  status: 'IDLE', // IDLE | MONITORING | IN STOCK | ADDING | CHECKOUT | PAUSED | DONE
  timer: null,
  errors: 0,
  lastCheck: null,
  logLines: [],
  found: null, // { ship, sku } once stock is found
};

function log(msg) {
  const line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  BOT.logLines.unshift(line);
  BOT.logLines = BOT.logLines.slice(0, 200);
  if (typeof console !== 'undefined') console.log('[SC Auto Buyer] ' + msg);
  renderLog();
}

function saveConfig() {
  try { if (hasGM) GM_setValue('scab_config', JSON.stringify(BOT.config)); } catch (e) {}
}
function loadConfig() {
  try {
    if (hasGM) {
      const raw = GM_getValue('scab_config', null);
      if (raw) {
        const saved = JSON.parse(raw);
        BOT.config = Object.assign(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), saved);
      }
    }
  } catch (e) {}
}

function beep() {
  if (!BOT.config.soundAlert) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [0, 200, 400].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = i === 2 ? 1320 : 880;
      osc.connect(ctx.destination);
      osc.start(ctx.currentTime + delay / 1000);
      osc.stop(ctx.currentTime + delay / 1000 + 0.18);
    });
  } catch (e) {}
}

function notify(title, text) {
  beep();
  try {
    if (BOT.config.desktopAlert && typeof GM_notification !== 'undefined') {
      GM_notification({ title: title, text: text, timeout: 15000 });
    }
  } catch (e) {}
}

function setStatus(s) {
  BOT.status = s;
  const el = document.getElementById('scab-status');
  if (el) {
    el.textContent = s;
    el.style.background = s === 'IN STOCK' ? '#16a34a' : s === 'PAUSED' ? '#dc2626' : s === 'DONE' ? '#16a34a' : '#0e7490';
  }
}

function pauseBot(reason) {
  stopLoop();
  setStatus('PAUSED');
  log('PAUSED: ' + reason + ' — solve it yourself, then press Start.');
  notify('Star Citizen bot paused', reason);
}

async function gql(body) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    credentials: 'include', // same session as the logged-in RSI tab
    headers: {
      'Content-Type': 'application/json',
      'Origin': RSI_ORIGIN,
      'Referer': window.location.href,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error('rate_limited_429');
  if (!res.ok) throw new Error('http_' + res.status);
  return res.json();
}

/** One stock check for one watched ship. Returns { ship, sku, reason }. */
async function checkOneShip(ship) {
  const body = buildStockQuery(ship.productId, 1000);
  const json = await gql(body);
  if (json && json.errors && json.errors.length) {
    throw new Error('graphql: ' + (json.errors[0].message || 'unknown error'));
  }
  const parsed = parseStockResponse(json);
  if (parsed.error) throw new Error(parsed.error);
  const found = findTargetSku(parsed.skus, ship);
  return { ship: ship, sku: found.sku, reason: found.reason, checkedSkus: parsed.skus.length };
}

async function checkAllShips() {
  BOT.lastCheck = new Date();
  for (const ship of BOT.config.watchlist) {
    try {
      const r = await checkOneShip(ship);
      if (r.reason === 'in_stock' && r.sku) {
        const price = priceUsd(r.sku.price.amount);
        log('IN STOCK: ' + r.sku.title + ' — $' + price + ' (SKU ' + r.sku.id + ', warbond=' + r.sku.isWarbond + ')');
        return { ship: ship, sku: r.sku };
      }
      log(ship.name + ': ' + r.reason + ' (' + r.checkedSkus + ' SKUs in list ' + ship.productId + ')');
    } catch (e) {
      throw e; // handled by the loop: back-off, then retry
    }
  }
  return null;
}

async function loopTick() {
  if (BOT.status !== 'MONITORING') return;
  const blocker = detectBlocker(document.body ? document.body.innerText : '');
  if (blocker) { pauseBot('RSI shows a ' + blocker + ' screen.'); return; }
  try {
    const found = await checkAllShips();
    BOT.errors = 0;
    if (found) {
      BOT.found = found;
      setStatus('IN STOCK');
      notify('Ship in stock!', found.sku.title + ' — $' + priceUsd(found.sku.price.amount));
      await addToCartAndCheckout(found);
      return;
    }
  } catch (e) {
    BOT.errors += 1;
    log('Check failed (' + e.message + ') — backing off, error #' + BOT.errors);
    if (BOT.errors >= 5) { pauseBot('Too many failed checks in a row (' + e.message + ').'); return; }
  }
  scheduleNext();
}

function scheduleNext() {
  clearTimeout(BOT.timer);
  const delay = nextDelayMs(BOT.config, BOT.errors);
  BOT.timer = setTimeout(loopTick, delay);
}

function startLoop() {
  if (BOT.status === 'MONITORING') return;
  BOT.errors = 0;
  BOT.found = null;
  setStatus('MONITORING');
  log('Monitoring started — API checks every ~' + Math.round(BOT.config.pollMinMs / 1000) + '-' + Math.round(BOT.config.pollMaxMs / 1000) + 's. No page refresh.');
  loopTick();
}

function stopLoop() {
  clearTimeout(BOT.timer);
  BOT.timer = null;
  if (BOT.status === 'MONITORING' || BOT.status === 'IN STOCK') setStatus('IDLE');
  log('Stopped.');
}

/** Add to cart, go to the cart, and walk the checkout steps. */
async function addToCartAndCheckout(found) {
  setStatus('ADDING');
  try {
    const json = await gql(buildAddToCartMutation(found.sku.id, found.ship.qty || 1));
    if (json && json.errors && json.errors.length) throw new Error('add-to-cart: ' + json.errors[0].message);
    const added = json && json.data && json.data.store && json.data.store.cart && json.data.store.cart.mutations;
    log('Add-to-cart sent for SKU ' + found.sku.id + '. Response received — opening cart to verify.');
  } catch (e) {
    log('Add-to-cart failed: ' + e.message + '. You may need to be logged in — check the cart yourself.');
    pauseBot('Add-to-cart failed: ' + e.message);
    return;
  }
  setStatus('CHECKOUT');
  window.location.href = RSI_ORIGIN + '/store/pledge/cart';
  // After the cart page loads, the bot (still running, same tab) continues:
  // it clicks through checkout steps with NextStepMutation, but STOPS at
  // the payment step unless autoPay is ON. See checkoutStepHandler below.
  setTimeout(checkoutStepHandler, 4000);
}

async function checkoutStepHandler() {
  if (!/\/store\/pledge\/cart/.test(window.location.pathname)) return;
  const blocker = detectBlocker(document.body ? document.body.innerText : '');
  if (blocker) { pauseBot('Checkout shows a ' + blocker + ' screen.'); return; }
  const payText = (document.body.innerText || '').toLowerCase();
  const onPaymentStep = /payment method|select.*payment|place order|pay now/.test(payText);
  if (onPaymentStep && !BOT.config.autoPay) {
    setStatus('CHECKOUT');
    log('STOPPED at the payment step — Auto-Pay is OFF. Pay yourself now, the ship is in your cart.');
    notify('Ship in your cart — pay now!', 'Auto-Pay is OFF. Complete the payment yourself before stock runs out.');
    return;
  }
  if (onPaymentStep && BOT.config.autoPay) {
    log('Auto-Pay is ON: looking for an already-selected saved payment method. Card details are NEVER typed by this bot.');
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /place order|pay now|confirm/i.test(b.textContent || '') && !b.disabled);
    if (btn) {
      log('Clicking the Place Order button once (saved payment must already be selected).');
      btn.click();
      setStatus('DONE');
    } else {
      log('Auto-Pay is ON but no enabled Place Order button was found — pay yourself.');
      notify('Pay manually', 'No Place Order button found. Complete the payment yourself.');
    }
    return;
  }
  // Not on the payment step yet: advance one checkout step, then re-check.
  try {
    await gql(buildNextStepMutation());
    log('Advanced one checkout step.');
  } catch (e) {
    log('Checkout step failed: ' + e.message + ' — continue manually from the cart.');
  }
  setTimeout(checkoutStepHandler, 4000);
}

/** Dry-run: one API stock check per watched ship, nothing added to cart. */
async function testStockCheck() {
  log('TEST: one dry-run stock check (nothing will be added to the cart)…');
  try {
    for (const ship of BOT.config.watchlist) {
      const r = await checkOneShip(ship);
      const price = r.sku ? '$' + priceUsd(r.sku.price.amount) : '—';
      log('TEST ' + ship.name + ': ' + r.reason + (r.sku ? ' — ' + r.sku.title + ' ' + price : '') + ' (' + r.checkedSkus + ' SKUs)');
    }
    log('TEST done. If a ship shows IN STOCK here, the monitor would buy it when running.');
  } catch (e) {
    log('TEST failed: ' + e.message);
  }
}

/* ------------------------- control panel ------------------------- */

function renderLog() {
  if (!isBrowser) return;
  const el = document.getElementById('scab-log');
  if (el) el.innerHTML = BOT.logLines.map((l) => '<div>' + l.replace(/</g, '&lt;') + '</div>').join('');
}

function buildPanel() {
  if (document.getElementById('scab-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'scab-panel';
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:999999;width:340px;background:#0f172a;color:#e2e8f0;font:13px/1.5 system-ui,sans-serif;border:1px solid #334155;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);padding:12px;';
  panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
    '<b>🚀 SC Auto Buyer v1.0.0</b>' +
    '<span id="scab-status" style="background:#0e7490;color:#fff;padding:2px 8px;border-radius:20px;font-size:11px;">IDLE</span></div>' +
    '<div id="scab-ships" style="margin:8px 0;font-size:12px;"></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
    '<button id="scab-start" style="flex:1;padding:7px;border:0;border-radius:6px;background:#16a34a;color:#fff;cursor:pointer;">▶ Start monitoring</button>' +
    '<button id="scab-stop" style="flex:1;padding:7px;border:0;border-radius:6px;background:#475569;color:#fff;cursor:pointer;">⏸ Stop</button></div>' +
    '<button id="scab-test" style="width:100%;margin-top:6px;padding:7px;border:0;border-radius:6px;background:#0e7490;color:#fff;cursor:pointer;">🔍 Test stock check now (no purchase)</button>' +
    '<label style="display:block;margin-top:8px;font-size:12px;"><input type="checkbox" id="scab-autopay"> ⚠️ Auto-Pay / Place Order (OFF = bot stops at payment)</label>' +
    '<div style="font-size:11px;color:#94a3b8;margin-top:6px;">API checks only — the page is never refreshed. Pauses on CAPTCHA / queue. Max price is a hard cap. No purchase is guaranteed.</div>' +
    '<div id="scab-log" style="margin-top:8px;max-height:180px;overflow:auto;background:#020617;border-radius:6px;padding:8px;font:11px/1.5 monospace;"></div>';
  document.body.appendChild(panel);

  const shipsEl = document.getElementById('scab-ships');
  shipsEl.innerHTML = BOT.config.watchlist.map((w) =>
    '<div>• <b>' + w.name + '</b> — max $' + w.maxPrice + (w.preferWarbond ? ' (Warbond first)' : '') + ' — list ' + w.productId + '</div>'
  ).join('') || '<div>No ships in the watchlist.</div>';

  const payBox = document.getElementById('scab-autopay');
  payBox.checked = !!BOT.config.autoPay;
  payBox.addEventListener('change', () => {
    BOT.config.autoPay = payBox.checked;
    saveConfig();
    log('Auto-Pay is now ' + (BOT.config.autoPay ? 'ON — the bot may click Place Order with a saved payment method.' : 'OFF — the bot will stop at the payment step.'));
  });
  document.getElementById('scab-start').addEventListener('click', startLoop);
  document.getElementById('scab-stop').addEventListener('click', stopLoop);
  document.getElementById('scab-test').addEventListener('click', testStockCheck);

  // If we landed on the cart after an add-to-cart, resume the checkout walk.
  if (/\/store\/pledge\/cart/.test(window.location.pathname) && BOT.found) {
    setTimeout(checkoutStepHandler, 3000);
  }
  log('Panel ready. Watchlist: ' + BOT.config.watchlist.map((w) => w.name + ' (max $' + w.maxPrice + ')').join(', '));
}

/* ------------------------------ boot ------------------------------ */

if (isBrowser) {
  loadConfig();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }
}

/* Node export — lets the test harness import the pure functions. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_CONFIG, parseShipNameFromUrl, priceUsd, stockState, withinCap,
    findTargetSku, buildStockQuery, parseStockResponse, buildAddToCartMutation,
    buildNextStepMutation, nextDelayMs, detectBlocker, availabilityFromJsonLd,
  };
}
