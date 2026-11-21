// ==UserScript==
// @name         Star Citizen Auto Buyer (RSI Pledge Store)
// @namespace    https://github.com/pythonicshariful/star-citizen-auto-buyer
// @version      1.3.0
// @description  Monitors RSI pledge-store ships via RSI's own GraphQL API (no page refresh) and auto add-to-cart + checkout when a watched ship comes in stock. Buy Now / Place Order clicks use random human-like mouse movement. Final payment is OFF by default.
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
 * Star Citizen Auto Buyer — v1.3.0
 * =================================
 * v1.3.0 (2026-11-21): express-checkout walk. When the page is the
 *   express checkout page (.../store/pledge/express-checkout) the bot
 *   now walks the final three steps in order, ONLY when Auto-Pay is
 *   ON in the panel (Auto-Pay stays OFF by default): (1) click the
 *   "Jump to bottom" button — matched by its TEXT, never by class or
 *   data-cy-id alone (other buttons share those); (2) check the Terms
 *   of Service box — matched by data-testid="express-terms-checkbox",
 *   NEVER by its id (React generates a new id on every render), clicked
 *   via its label so the React handler fires, and verified checked
 *   afterwards; (3) click "Place order" — matched by
 *   data-testid="express-card-form-submit". Each step re-finds its
 *   element after a short settle wait and checks it is visible and
 *   clickable before the human-like click; if any step fails the walk
 *   STOPS right there and later steps are never attempted. When
 *   Auto-Pay is OFF the bot clicks NONE of the three — it stops at
 *   the checkout page with an alarm, exactly as before. The bot NEVER
 *   types card details or CVV: if the page shows a payment form that
 *   needs card details, the walk stops and alarms instead.
 * v1.2.2 FIX (2026-11-21): the Buy Now click itself threw on the real
 *   RSI page, so the button was found, the price guard passed — and
 *   still nothing was clicked. The live error was:
 *   "Failed to construct 'MouseEvent': Failed to read the 'view'
 *   property from 'UIEventInit': Failed to convert value to 'Window'."
 *   Cause: dispatchMouse passed `view: window` to `new MouseEvent(...)`,
 *   but inside Tampermonkey the script's `window` is a sandbox proxy,
 *   NOT the page's real Window, so the constructor rejects it. `view`
 *   is OPTIONAL (it defaults to null and no click handler reads it),
 *   so it is simply not passed anymore — with a legacy createEvent /
 *   initMouseEvent fallback if the modern constructor ever throws.
 *   A click failure is now also logged plainly ("Buy Now click FAILED
 *   ... will retry on the next tick") instead of hiding behind
 *   "continuing with API checks", and the loop retries the DOM click
 *   on the next tick while the button is still available.
 * v1.2.1 (2026-11-21): the Buy Now click now scrolls FIRST and only
 *   then clicks — and the panel can be moved and resized.
 *   CLICK FIX: the old code scrolled the button into view with a
 *   SMOOTH scroll and then read its position after a fixed 200-600 ms
 *   wait. On a long product page the smooth scroll was still running
 *   when the position was read, so the click used a STALE position
 *   (the button had moved by the time the mouse got there) — that is
 *   why the click "did nothing" on a real page even with the button
 *   visible and the price under max. Now the bot scrolls with an
 *   instant scroll, WAITS until the scroll and the layout have
 *   settled (scroll position + button rect stable), RE-READS the
 *   button's position, checks it is really in the viewport and not
 *   covered by another element, and only then moves the mouse
 *   (random curved path, random point) and clicks. If the button is
 *   not clickable after scrolling, it logs why and does NOT click
 *   blind at a stale coordinate.
 *   PANEL: draggable by its header and resizable from the bottom-
 *   right corner (same approach as the Microsoft bot v2.11: width
 *   20-60% and height 25-90% of the window, position/size saved in
 *   Tampermonkey storage and restored on every page; double-click
 *   the header to reset). The panel never drags fully off-screen.
 *   BUTTONS: every panel button was audited — Start, Stop, Test
 *   dry-run, Add product, Remove (x) per product, Auto-Pay checkbox
 *   — all wired and working; Stop now also clears a PAUSED state.
 * v1.2.0 (2026-11-21): ANY product can be watched now, not just ships.
 *   The panel has an "Add any product" form — paste any RSI store
 *   product URL (ship, package, vehicle…), set a max price, and the bot
 *   watches it. No code editing anymore. Entries carry an optional
 *   store-list ID (ships: 72 = Standalone Ships): with one, the bot
 *   also checks the product by API from any page; without one, the
 *   product is "page only" — the bot watches its Buy Now button, so
 *   its page must stay open in a tab. The DOM Buy Now path now also
 *   respects the max price: if the price shown on the page is above
 *   your max, it does NOT click. Kraken is still the default entry.
 * v1.1.2 FIX (2026-11-21): Start Monitor -> Buy Now never fired for
 *   "Name - 10 Year" ships (PTV - 10 Year, Meteor - 10 Year — the
 *   in-stock test products). The old page check turned "PTV - 10 Year"
 *   into "ptv---10-year", but the real RSI page is ".../PTV-10-Year",
 *   so the bot never recognised the page as a watched ship page and
 *   never clicked its Buy Now button. Page matching now slugifies the
 *   name and the URL the same way, and also matches the watchlist
 *   entry's own URL. Kraken (single word) worked before and still does.
 * v1.1.1 FIX (2026-11-21): CAPTCHA pause no longer fires on a normal
 *   page. The old check paused whenever the word "captcha" appeared
 *   in the page text — but every RSI page loads reCAPTCHA, so the
 *   corner badge's "protected by reCAPTCHA" text paused the bot the
 *   second Start was pressed, with no challenge on screen. Now the bot
 *   pauses ONLY for a challenge that is actually visible (a visible
 *   checkbox / image-challenge / hCaptcha / Turnstile widget that is
 *   not the corner badge) or for strong challenge wording on the page.
 *   A real CAPTCHA / queue still pauses + alarms exactly as before.
 * HOW IT CLICKS LIKE A HUMAN (v1.1.0, scroll fixed in v1.2.1):
 *   When a Buy Now / Place Order button is available, the bot does NOT
 *   call el.click() instantly. It FIRST scrolls the button into the
 *   middle of the viewport and waits until the scroll and the layout
 *   have settled, then RE-READS the button's on-screen position and
 *   checks it is really visible and not covered by another element.
 *   Only then does it pick a RANDOM point inside the button, move the
 *   mouse there along a RANDOM curved path (random steps, random
 *   8-30 ms gaps, random hover pause 80-350 ms), then mousedown →
 *   short random hold 40-150 ms → mouseup → click. No two clicks take
 *   the same path or timing. If the button is not clickable after
 *   scrolling, the bot logs why and does NOT click blind.
 *   Honest limit: Tampermonkey events are synthetic, so the browser
 *   marks them isTrusted=false — a site that checks that flag can still
 *   tell they were scripted. The random path removes the obvious
 *   "instant jump straight to the centre" signal, but it does NOT make
 *   a synthetic click a real trusted mouse click. A truly trusted click
 *   needs a real mouse, or browser automation (CDP / Playwright mouse).
 *   Buttons matched: [data-testid="express-buy-now"],
 *   button[aria-label="Buy Now"], .a-buyNowButton,
 *   .m-storeAction__buyNow, plus any visible button whose text is
 *   "Buy Now" / "Add to Cart" / "Place Order" on a watched ship page.
 *
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
 * ANY PRODUCT (v1.2.0) — not just ships:
 *   The watchlist can hold ANY RSI store product: a ship, a package
 *   (e.g. First Flight Pack), a vehicle — anything with a Buy Now
 *   button. Add it from the panel, no code editing. Each entry has a
 *   max price (hard cap, never bought above it) and an OPTIONAL
 *   store-list ID. With a list ID (ships: 72 = Standalone Ships) the
 *   bot checks the product by API from any RSI page. Without one the
 *   product is "page only": the bot can only see its Buy Now button,
 *   so that product's page must stay open in a tab while monitoring.
 *   The DOM Buy Now path also checks the price shown on the page
 *   against your max — above max, it does not click.
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
 *   every watched product that has a list ID, and shows the result.
 *   Try it with an in-stock ship first (add "PTV - 10 Year", $15,
 *   list 72, from the panel) — you should see IN STOCK without
 *   anything being added to your cart. To test the Buy Now click
 *   itself, add a cheap in-stock product (e.g. First Flight Pack,
 *   $60 — no list ID needed), open its own page, press Start: the
 *   bot clicks Buy Now and takes you to the cart, then stops at
 *   payment (Auto-Pay is OFF), so nothing is bought.
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
  humanClick: true,         // v1.1.0: Buy Now / Place Order via random human-like mouse path, not instant el.click()
  soundAlert: true,
  desktopAlert: true,
  panel: null,              // v1.2.1: saved panel position/size in % of the window ({left, top, width, height}); null = default spot
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

/**
 * Is this element actually visible on screen? Hidden elements
 * (display:none, zero size) are NOT visible. position:fixed elements
 * (e.g. the reCAPTCHA corner badge) have offsetParent null too, so
 * they are checked with computed style instead.
 */
function elVisible(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  var r;
  try { r = el.getBoundingClientRect(); } catch (e) { return false; }
  if (!r || r.width <= 0 || r.height <= 0) return false;
  if (el.offsetParent !== null) return true;
  // offsetParent is null: display:none OR position:fixed.
  if (typeof getComputedStyle === 'function') {
    try {
      var cs = getComputedStyle(el);
      if (!cs) return false;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      return cs.position === 'fixed';
    } catch (e) { return false; }
  }
  return false; // no computed style available (test env): treat as hidden
}

/** Is `el` inside the small "protected by reCAPTCHA" corner badge? */
function insideRecaptchaBadge(el) {
  var n = el;
  while (n) {
    try {
      if (typeof n.closest === 'function' && n.closest('.grecaptcha-badge')) return true;
    } catch (e) { /* ignore */ }
    var cls = (n.className && typeof n.className === 'string') ? n.className : '';
    if (/\bgrecaptcha-badge\b/.test(cls)) return true;
    n = n.parentNode || n.parentElement || null;
  }
  return false;
}

function iframeSrc(el) {
  try {
    var s = el.getAttribute ? el.getAttribute('src') : null;
    return String(s || el.src || '');
  } catch (e) { return ''; }
}

/**
 * Spot a CAPTCHA / queue / verify wall — ONLY when it is actually
 * presented to the user. Never auto-solved.
 *
 * v1.1.0 BUG (fixed in v1.1.1): the old check matched the bare word
 * "captcha" anywhere in the page text. Every RSI page loads reCAPTCHA
 * Enterprise, so the corner badge's "protected by reCAPTCHA" text is
 * in document.body.innerText on every normal page — Start Monitor
 * paused instantly with no challenge on screen. The bare word alone
 * is NOT a challenge anymore:
 *   - a challenge counts only as a VISIBLE challenge widget/iframe
 *     (checkbox, image challenge, hCaptcha, Turnstile) that is NOT
 *     the reCAPTCHA corner badge, or as strong challenge wording
 *     ("verify you are human", "press & hold", ...) in the page text.
 *   - queue / access-denied pages still count (they really block).
 */
function detectBlocker(doc) {
  if (!doc) return null;
  // Back-compat: a plain string is treated as page text only.
  if (typeof doc === 'string') {
    doc = { body: { innerText: doc }, querySelectorAll: function () { return []; } };
  }
  var body = doc.body || null;
  var text = '';
  try { text = String((body && body.innerText) || ''); } catch (e) { text = ''; }
  var t = text.toLowerCase();

  // 1) Visible challenge widgets / iframes (never the corner badge).
  var selectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="challenges.cloudflare.com"]',
    'iframe[src*="arkose"]',
    'iframe[src*="funcaptcha"]',
    '.g-recaptcha',
    '.h-captcha',
    '.cf-turnstile',
    '[data-sitekey]',
  ];
  try {
    var els = doc.querySelectorAll ? doc.querySelectorAll(selectors.join(',')) : [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!elVisible(el)) continue;
      if (insideRecaptchaBadge(el)) continue; // the corner badge is not a challenge
      var src = iframeSrc(el).toLowerCase();
      if (src.indexOf('size=invisible') !== -1) continue; // invisible-mode frame
      if (src.indexOf('recaptcha') !== -1) {
        // Only real challenge frames count (checkbox / challenge popup),
        // not the badge or other loader frames.
        var isChallengeFrame = src.indexOf('anchor') !== -1 || src.indexOf('bframe') !== -1 || src.indexOf('enterprise') !== -1;
        if (!isChallengeFrame) continue;
      }
      return 'captcha';
    }
  } catch (e) { /* ignore selector errors, fall through to text checks */ }

  // 2) Strong challenge wording in the page text. The bare word
  // "captcha" is deliberately NOT here — it appears on every RSI page
  // (reCAPTCHA badge / footer) without any challenge being shown.
  if (!t) return null;
  if (t.indexOf("i'm not a robot") !== -1 || t.indexOf('i am not a robot') !== -1 ||
      t.indexOf('complete the captcha') !== -1 || t.indexOf('select all images') !== -1 ||
      t.indexOf('complete the security check') !== -1 || t.indexOf('confirm you are human') !== -1 ||
      t.indexOf('prove you are human') !== -1 || t.indexOf('are you a robot') !== -1) return 'captcha';
  if (t.indexOf('verify you are human') !== -1 || t.indexOf('verify your identity') !== -1 ||
      t.indexOf('press & hold') !== -1) return 'verify';
  if (t.indexOf('you are in a queue') !== -1 || t.indexOf('queue position') !== -1 ||
      t.indexOf('waiting room') !== -1) return 'queue';
  if (t.indexOf('access denied') !== -1 || (t.indexOf('blocked') !== -1 && t.indexOf('bot') !== -1)) return 'blocked';
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

/* --- v1.1.0 human-like click helpers (pure, unit-tested) --- */

/** Random integer in [min, max], inclusive. */
function randInt(min, max, rnd) {
  const r = rnd || Math.random;
  return Math.floor(r() * (Number(max) - Number(min) + 1)) + Number(min);
}

/** A random point inside a button rect (10%-90% of width/height, never the exact centre). */
function randomPointInRect(rect, rnd) {
  const r = rnd || Math.random;
  const x = rect.left + rect.width * (0.1 + r() * 0.8);
  const y = rect.top + rect.height * (0.1 + r() * 0.8);
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Random curved mouse path from `from` to `to`.
 * Quadratic Bezier with a random control point offset, `steps` points.
 * Returns [{x, y}, ...] including the end point, never a straight line.
 */
function humanPath(from, to, steps, rnd) {
  const r = rnd || Math.random;
  const n = Math.max(2, steps || 12);
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  // Control point: midpoint pushed sideways by a random amount.
  const bend = (r() - 0.5) * dist * 0.6;
  const cx = (from.x + to.x) / 2 - (dy / dist) * bend;
  const cy = (from.y + to.y) / 2 + (dx / dist) * bend;
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x;
    const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * to.y;
    pts.push({ x: Math.round(x), y: Math.round(y) });
  }
  return pts;
}

/** Selectors for a Buy Now button, including the exact one Shariful pasted. */
const BUY_NOW_SELECTORS = [
  '[data-testid="express-buy-now"]',
  'button[aria-label="Buy Now"]',
  '.a-buyNowButton',
  '.m-storeAction__buyNow',
  'button[data-cy-id="button"]',
];

/** True when an element is visible and clickable (not disabled / hidden). */
function isClickableEl(el) {
  if (!el || el.disabled) return false;
  if (typeof el.getBoundingClientRect !== 'function') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Normalise a string for URL matching: lowercase, every run of
 * non-alphanumerics becomes a single '-'. "PTV - 10 Year" -> "ptv-10-year".
 */
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * True when `url` is this ONE entry's own product page.
 * v1.1.2: slugifies the name AND the URL the same way, and also
 * matches the entry's own URL (its last path segment). Works for any
 * product — ship, package, vehicle — not just ships.
 */
function entryMatchesPage(entry, url) {
  if (!entry || !url) return false;
  const u = String(url).toLowerCase();
  if (entry.url) {
    try {
      const path = new URL(String(entry.url)).pathname.toLowerCase();
      const last = path.split('/').filter(Boolean).pop() || '';
      if (last && u.includes(last)) return true;
      if (path && u.includes(path)) return true;
    } catch (e) { /* bad URL in config — fall through to name match */ }
  }
  const name = slugify(entry.name);
  return !!(name && u.includes(name));
}

/** True when the current page is any watched product's page. */
function isWatchedPage(url, watchlist) {
  const u = String(url || '').toLowerCase();
  if (!u) return false;
  return (watchlist || []).some((w) => entryMatchesPage(w, u));
}

/** True when the string is an RSI pledge-store page URL. */
function isRsiUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (!/robertsspaceindustries\.com$/.test(u.hostname.toLowerCase())) return false;
    return u.pathname.toLowerCase().indexOf('/pledge/') !== -1;
  } catch (e) { return false; }
}

/**
 * Validate + normalise one watchlist entry typed into the panel
 * (v1.2.0 — any product, not just ships).
 * Input: { name?, url, maxPrice, productId?, preferWarbond? }.
 *   - url: required, must be an RSI pledge-store page. The name is
 *     read from the URL when left empty ("Star-Citizen-First-Flight-
 *     Pack" -> "Star Citizen First Flight Pack").
 *   - maxPrice: required, USD, above 0 — the hard cap.
 *   - productId: optional, digits only. Empty means "page only": the
 *     bot cannot check this product by API, it only watches its
 *     Buy Now button — so its page must stay open in a tab.
 *   - qty is always 1 (RSI's one-per-account limit).
 * Returns { entry } or { error } (plain words for the panel).
 */
function normalizeWatchEntry(raw) {
  const r = raw || {};
  const url = String(r.url || '').trim();
  if (!url) return { error: 'Paste the product URL from the RSI store.' };
  if (!isRsiUrl(url)) return { error: 'That is not an RSI pledge-store page — copy the URL from robertsspaceindustries.com.' };
  let name = String(r.name || '').trim();
  if (!name) {
    name = parseShipNameFromUrl(url) || '';
    if (!name) return { error: 'Type a product name — it could not be read from the URL.' };
  }
  const maxPrice = Number(r.maxPrice);
  if (!isFinite(maxPrice) || maxPrice <= 0) return { error: 'Max price must be a number above 0 (USD).' };
  let productId = (r.productId === undefined || r.productId === null) ? '' : String(r.productId).trim();
  if (productId && !/^\d+$/.test(productId)) return { error: 'List ID must be digits only (e.g. 72) — or leave it empty.' };
  if (!productId) productId = null;
  return {
    entry: {
      name: name,
      url: url,
      productId: productId,
      maxPrice: maxPrice,
      preferWarbond: r.preferWarbond === true,
      qty: 1,
    },
  };
}

/** True when the entry can be checked via the API (it has a store-list ID). */
function isApiCheckable(entry) {
  return !!(entry && entry.productId !== null && entry.productId !== undefined &&
    String(entry.productId).trim() !== '' && /^\d+$/.test(String(entry.productId)));
}

/** Read the price (USD) off the current product page's JSON-LD, if it has one. Returns a number or null. */
function pagePriceUsd(doc) {
  try {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const el of scripts) {
      const data = JSON.parse(el.textContent || '{}');
      const offers = data && data.offers ? data.offers : null;
      if (!offers) continue;
      const p = offers.price;
      if (p === undefined || p === null) continue;
      const n = Number(String(p).replace(/[^0-9.]/g, ''));
      if (isFinite(n) && n > 0) return n;
    }
  } catch (e) { /* malformed JSON-LD — no price */ }
  return null;
}

/**
 * May the DOM Buy Now path click for this entry at this page price?
 *   - price unknown (null): allowed, as before — the API check is the
 *     strict cap, the DOM path is the fast path when the API lags.
 *   - price at/under maxPrice: allowed.
 *   - price above maxPrice: NOT allowed — never buy above the cap.
 */
function domBuyAllowed(entry, pagePrice) {
  if (!entry) return { allowed: false, reason: 'no_entry' };
  if (pagePrice === null || pagePrice === undefined) return { allowed: true, reason: 'price_unknown' };
  if (pagePrice <= Number(entry.maxPrice)) return { allowed: true, reason: 'under_cap' };
  return { allowed: false, reason: 'over_max_price' };
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
  mouse: null, // last known mouse position {x, y} for human-like paths
  expressWalk: 'idle', // v1.3.0: idle | running | done | stopped (express-checkout walk state, one run per page load)
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

/* --- v1.1.0 human-like clicking (browser only) --- */

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Build a mouse event that works inside the Tampermonkey sandbox.
 *
 * v1.2.2 — the live v1.2.1 bug: dispatchMouse passed `view: window`
 * to `new MouseEvent(...)`. Inside Tampermonkey the script's `window`
 * is a sandbox proxy, NOT the page's real Window, so the constructor
 * threw on the real RSI page:
 *   "Failed to construct 'MouseEvent': Failed to read the 'view'
 *   property from 'UIEventInit': Failed to convert value to 'Window'."
 * `view` is OPTIONAL (it defaults to null and no click handler reads
 * it) — so it is simply not passed anymore. If the modern constructor
 * throws for any reason, fall back to the legacy createEvent /
 * initMouseEvent path (also with a null view); if that fails too, the
 * ORIGINAL error is re-thrown so the caller can log it.
 */
function makeMouseEvent(type, init) {
  init = init || {};
  var err = null;
  try {
    return new MouseEvent(type, init);
  } catch (e) { err = e; }
  try {
    var doc = (typeof document !== 'undefined') ? document : null;
    if (doc && typeof doc.createEvent === 'function') {
      var ev = doc.createEvent('MouseEvents');
      ev.initMouseEvent(type, !!init.bubbles, !!init.cancelable, null, type === 'click' ? 1 : 0,
        init.clientX || 0, init.clientY || 0, init.clientX || 0, init.clientY || 0,
        false, false, false, false, init.button || 0, null);
      return ev;
    }
  } catch (e2) { /* fall through to re-throw the original error */ }
  throw err;
}

function dispatchMouse(el, type, x, y) {
  const ev = makeMouseEvent(type, {
    bubbles: true, cancelable: true,
    clientX: x, clientY: y, button: 0, buttons: type === 'mousedown' || type === 'mousemove' ? 1 : 0,
  });
  (el || document).dispatchEvent(ev);
}

/** Move the mouse from the last known position to (x, y) on a random curved path. */
async function humanMoveTo(x, y) {
  const from = BOT.mouse || { x: randInt(0, window.innerWidth || 800), y: randInt(0, window.innerHeight || 600) };
  const steps = randInt(12, 25);
  const pts = humanPath(from, { x: x, y: y }, steps);
  for (const p of pts) {
    dispatchMouse(document, 'mousemove', p.x, p.y);
    BOT.mouse = p;
    await sleep(randInt(8, 30));
  }
}

/** True when the rect is at least partly inside the viewport. `win` defaults to window; pass a fake in tests. */
function isRectInViewport(rect, win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!rect || !w) return false;
  const vw = w.innerWidth || 0, vh = w.innerHeight || 0;
  if (!vw || !vh) return false;
  return rect.left < vw && rect.right > 0 && rect.top < vh && rect.bottom > 0;
}

/**
 * True when the point (x, y) actually lands on `el` (or one of its
 * children) — i.e. no sticky header / overlay / other element covers
 * it. `doc` defaults to document; pass a fake doc in tests. When the
 * page has no elementFromPoint (test env), returns true so the click
 * is not blocked by a check that cannot run.
 */
function pointHitsElement(el, x, y, doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!el || !d || typeof d.elementFromPoint !== 'function') return true;
  let hit = null;
  try { hit = d.elementFromPoint(x, y); } catch (e) { return false; }
  if (!hit) return false;
  if (hit === el) return true;
  try { return typeof el.contains === 'function' && el.contains(hit); } catch (e) { return false; }
}

/**
 * Scroll `el` into the middle of the viewport and wait until the scroll
 * AND the layout have settled (scroll position + button rect stable for
 * ~150 ms), up to `timeoutMs` (default 2000). Returns true when settled.
 *
 * v1.2.1 — this is the fix for "click does nothing" on a real page:
 * the old code scrolled SMOOTH and read the position after a fixed
 * 200-600 ms, but on a long product page the smooth scroll was still
 * running, so the click used a stale position. An instant scroll plus
 * a settle-wait makes the position deterministic.
 */
async function scrollIntoViewAndSettle(el, win, sleepFn, timeoutMs) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  const doSleep = sleepFn || sleep;
  if (!el || typeof el.scrollIntoView !== 'function') return false;
  try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e2) { /* cannot scroll */ }
  }
  const deadline = Date.now() + (timeoutMs === undefined ? 2000 : timeoutMs);
  let stable = 0, lastY = null, lastTop = null, lastLeft = null;
  while (Date.now() < deadline) {
    let y = null, r = null;
    try { y = w ? w.scrollY : null; } catch (e) {}
    try { r = el.getBoundingClientRect(); } catch (e) {}
    const top = r ? Math.round(r.top) : null;
    const left = r ? Math.round(r.left) : null;
    if (y === lastY && top === lastTop && left === lastLeft) {
      stable++;
      if (stable >= 3) return true;
    } else {
      stable = 0; lastY = y; lastTop = top; lastLeft = left;
    }
    await doSleep(50);
  }
  return false;
}

/**
 * Click an element the way a human would: FIRST scroll it into view
 * and wait for the scroll/layout to settle, THEN re-read its position
 * and verify it is really visible and not covered, THEN move the mouse
 * on a random curved path to a random point inside it, hover a random
 * 80-350 ms, then mousedown → random 40-150 ms hold → mouseup → click.
 * Returns false (without clicking blind) when the button is not
 * clickable after scrolling. NOTE: these are synthetic events
 * (isTrusted=false) — see header.
 */
async function humanClick(el) {
  if (!el || !isClickableEl(el)) return false;
  // 1. Scroll FIRST, wait for the scroll + layout to settle.
  await scrollIntoViewAndSettle(el);
  // 2. Re-read the position AFTER scrolling — never trust the pre-scroll rect.
  if (!isClickableEl(el)) { log('Button is no longer clickable after scrolling — not clicking.'); return false; }
  const rect = el.getBoundingClientRect();
  if (!isRectInViewport(rect)) { log('Button is not in the viewport after scrolling — not clicking.'); return false; }
  // 3. The random point must actually land on the button (not a sticky header / overlay).
  let target = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = randomPointInRect(rect);
    if (pointHitsElement(el, p.x, p.y)) { target = p; break; }
  }
  if (!target) { log('Button is covered by another element — not clicking blind.'); return false; }
  // 4. Human-like mouse movement to the verified point, hover, hold, click.
  // v1.2.2: if building/dispatching the mouse events throws (e.g. the
  // Tampermonkey sandbox rejecting the event — the live v1.2.1
  // "Failed to construct 'MouseEvent'" error), say so PLAINLY and
  // return false — the loop retries the DOM click on the next tick
  // while the button is still available. Never swallow it as a quiet
  // "continuing with API checks".
  try {
    await humanMoveTo(target.x, target.y);
    dispatchMouse(el, 'mouseover', target.x, target.y);
    dispatchMouse(el, 'mouseenter', target.x, target.y);
    await sleep(randInt(80, 350)); // human hover pause
    dispatchMouse(el, 'mousedown', target.x, target.y);
    await sleep(randInt(40, 150)); // human hold
    dispatchMouse(el, 'mouseup', target.x, target.y);
    dispatchMouse(el, 'click', target.x, target.y);
  } catch (e) {
    log('Buy Now click FAILED: ' + (e && e.message ? e.message : e) + ' — will retry on the next tick while the button is still available.');
    return false;
  }
  BOT.mouse = target;
  return true;
}

/** Find a visible, enabled Buy Now button on this page, if one is showing. */
function findBuyNowButton(doc) {
  const d = doc || document;
  for (const sel of BUY_NOW_SELECTORS) {
    const els = d.querySelectorAll(sel);
    for (const el of els) {
      if (isClickableEl(el)) return el;
    }
  }
  // Fallback: any visible button whose text says Buy Now / Add to Cart.
  const btns = d.querySelectorAll('button');
  for (const b of btns) {
    const t = (b.textContent || '').trim().toLowerCase();
    if ((t === 'buy now' || t.includes('buy now') || t.includes('add to cart')) && isClickableEl(b)) return b;
  }
  return null;
}

/* --- v1.3.0 express-checkout helpers (pure, unit-tested) --- */

/** True when the URL is RSI's express checkout page (.../store/pledge/express-checkout). */
function isExpressCheckoutPage(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return false;
  return u.indexOf('express-checkout') !== -1;
}

/**
 * Find the "Jump to bottom" button on the express checkout page.
 * Matched by its TEXT, not by class or data-cy-id alone — other
 * buttons on the page share those (class "a-button ... -fullWidth",
 * data-cy-id="button"). Exact text match first, then a contains match.
 */
function findJumpToBottomButton(doc) {
  const d = doc || document;
  const btns = d.querySelectorAll ? d.querySelectorAll('button') : [];
  for (const b of btns) {
    const t = (b.textContent || '').trim().toLowerCase();
    if (t === 'jump to bottom' && isClickableEl(b)) return b;
  }
  for (const b of btns) {
    const t = (b.textContent || '').trim().toLowerCase();
    if (t.indexOf('jump to bottom') !== -1 && isClickableEl(b)) return b;
  }
  return null;
}

/**
 * Find the Terms of Service checkbox on the express checkout page.
 * Matched ONLY by data-testid="express-terms-checkbox". NEVER by its
 * id — React generates a new id (":r...:") on every render, so an id
 * selector would break on the next page load.
 */
function findTermsCheckbox(doc) {
  const d = doc || document;
  if (!d.querySelector) return null;
  try {
    const el = d.querySelector('[data-testid="express-terms-checkbox"]');
    return el || null;
  } catch (e) { return null; }
}

/**
 * Find the "Place order" button on the express checkout page.
 * Matched by data-testid="express-card-form-submit", and only returned
 * when it is visible and clickable.
 */
function findPlaceOrderButton(doc) {
  const d = doc || document;
  if (!d.querySelector) return null;
  let el = null;
  try { el = d.querySelector('[data-testid="express-card-form-submit"]'); } catch (e) { return null; }
  if (!el || !isClickableEl(el)) return null;
  return el;
}

/**
 * What to click to check the Terms box: the <label> wrapping the
 * checkbox if there is one (clicking a label fires the React handler
 * on the input), else the checkbox's display wrapper, else the input
 * itself. The input is often visually hidden (0-size), so clicking it
 * directly is the last resort, not the first.
 */
function termsClickTarget(input) {
  if (!input) return null;
  try {
    if (typeof input.closest === 'function') {
      const label = input.closest('label');
      if (label) return label;
    }
  } catch (e) { /* fall through to the parent walk */ }
  let n = input.parentNode || input.parentElement || null;
  while (n) {
    const tag = (n.tagName || '').toUpperCase();
    const cls = (n.className && typeof n.className === 'string') ? n.className : '';
    if (tag === 'LABEL') return n;
    if (/\ba-checkboxDisplay\b/.test(cls) || /\ba-checkbox__inside\b/.test(cls)) return n;
    n = n.parentNode || n.parentElement || null;
  }
  return input;
}

/**
 * Does this checkout page show a payment form that still needs card
 * details typed in? Returns the first visible, EMPTY card field found
 * (card number / CVV / CVC / expiry), or null. A field that already
 * has a value (a saved card) does NOT count. The bot NEVER types card
 * details — when this returns a field, the checkout walk stops.
 */
function needsPaymentDetails(doc) {
  const d = doc || document;
  if (!d.querySelectorAll) return null;
  let inputs = [];
  try { inputs = d.querySelectorAll('input'); } catch (e) { return null; }
  for (const el of inputs) {
    if (!el) continue;
    const type = String((el.type || '')).toLowerCase();
    if (type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'submit' || type === 'button') continue;
    if (!isClickableEl(el)) continue; // hidden / 0-size fields are not a form asking for input
    const val = String(el.value === undefined || el.value === null ? '' : el.value).trim();
    if (val !== '') continue; // already filled (e.g. a saved card) — not asking for details
    let ac = '';
    try { ac = String(el.getAttribute ? el.getAttribute('autocomplete') || '' : '').toLowerCase(); } catch (e) {}
    if (ac === 'cc-number' || ac === 'cc-csc' || ac === 'cc-exp' || ac === 'cc-exp-month' || ac === 'cc-exp-year') return el;
    let hay = '';
    try {
      hay = [el.getAttribute ? el.getAttribute('name') : '', el.getAttribute ? el.getAttribute('id') : '', el.getAttribute ? el.getAttribute('placeholder') : ''].join(' ').toLowerCase();
    } catch (e) { hay = ''; }
    if (/card.?number|cvv|cvc|expir|card.?holder|card.?name/.test(hay)) return el;
  }
  return null;
}

/** If a Buy Now button is available on a watched product's page, click it human-like. */
async function clickBuyNowIfAvailable() {
  if (!BOT.config.humanClick) return false;
  // v1.2.0: match by the entry's own URL, so ANY watchlisted product
  // (ship, package, vehicle) clicks on its own page — and a product
  // that is NOT in the watchlist never clicks.
  const entry = (BOT.config.watchlist || []).find((w) => entryMatchesPage(w, window.location.href));
  if (!entry) return false;
  const btn = findBuyNowButton(document);
  if (!btn) return false;
  // v1.2.0: respect the max price on the DOM path too. If the price
  // shown on the page is above the cap, do NOT click.
  const price = pagePriceUsd(document);
  const gate = domBuyAllowed(entry, price);
  if (!gate.allowed) {
    log(entry.name + ': page price is $' + price + ', above your max $' + entry.maxPrice + ' — NOT clicking Buy Now.');
    return false;
  }
  if (gate.reason === 'price_unknown') log(entry.name + ': page price could not be read — clicking per your max $' + entry.maxPrice + ' (the API check is the strict cap).');
  log('Buy Now button is available for ' + entry.name + ' — clicking it with random human-like mouse movement…');
  const ok = await humanClick(btn);
  if (ok) log('Buy Now clicked (human-like path).');
  return ok;
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

/** One stock check for one watched product. Returns { ship, sku, reason }. */
async function checkOneShip(ship) {
  // v1.2.0: entries without a store-list ID are "page only" — the API
  // cannot check them, the DOM Buy Now path on their own page does.
  if (!isApiCheckable(ship)) {
    return { ship: ship, sku: null, reason: 'page_only', checkedSkus: 0 };
  }
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
      if (r.reason === 'page_only') {
        log(ship.name + ': page-only (no list ID) — keep its product page open; the bot watches its Buy Now button there.');
        continue;
      }
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
  const blocker = detectBlocker(document);
  if (blocker) { pauseBot('RSI shows a ' + blocker + ' screen.'); return; }
  // v1.1.0: if a Buy Now button is already showing on a watched ship
  // page, click it human-like right away (API list can lag the page).
  try {
    if (await clickBuyNowIfAvailable()) {
      setStatus('IN STOCK');
      notify('Buy Now clicked!', 'The Buy Now button was available and clicked with human-like mouse movement. Check the cart now.');
      window.location.href = RSI_ORIGIN + '/store/pledge/cart';
      return;
    }
  } catch (e) {
    // v1.2.2: say it plainly — the DOM click will be retried on the next
    // tick (it runs before the API checks every tick), it is NOT given up on.
    log('Buy Now DOM check failed: ' + e.message + ' — will retry the DOM click on the next tick; API checks continue meanwhile.');
  }
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
  // v1.2.1: Stop also clears a PAUSED state, so the button does what it
  // says after a pause. (pauseBot calls stopLoop() first and sets PAUSED
  // after, so this never clears a fresh pause.)
  if (BOT.status === 'MONITORING' || BOT.status === 'IN STOCK' || BOT.status === 'PAUSED') setStatus('IDLE');
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

/* --- v1.3.0 express-checkout walk (browser only) --- */

/** Log a stopped walk: why it stopped, and that later steps will NOT run. */
function expressWalkFail(reason, msg) {
  BOT.expressWalk = 'stopped';
  setStatus('CHECKOUT');
  log('Express checkout STOPPED: ' + msg + ' — later steps will NOT run. Finish the order yourself, or turn Auto-Pay ON and reload the page to try again.');
  notify('Express checkout stopped', msg);
  return { ok: false, reason: reason };
}

/**
 * Walk the express checkout page (.../store/pledge/express-checkout),
 * in order: (1) "Jump to bottom", (2) Terms of Service checkbox,
 * (3) "Place order". Each step re-finds its element after a short
 * settle wait and checks it is visible/clickable before the human-like
 * click. If any step fails, the walk STOPS there — it never skips ahead
 * to Place order.
 *
 * GATING: runs ONLY when Auto-Pay is ON in the panel. When OFF, it
 * clicks NOTHING — it stops at the checkout page with an alarm,
 * exactly as the bot did before v1.3.0.
 *
 * The bot NEVER types card details or CVV. If the page shows a payment
 * form that still needs card details, the walk stops and alarms.
 */
async function runExpressCheckoutWalk() {
  if (BOT.expressWalk === 'running' || BOT.expressWalk === 'done') return { ok: false, reason: 'already_' + BOT.expressWalk };
  BOT.expressWalk = 'running';

  // Gate: Auto-Pay OFF means zero checkout clicks.
  if (!BOT.config.autoPay) {
    BOT.expressWalk = 'stopped';
    setStatus('CHECKOUT');
    log('STOPPED at express checkout — Auto-Pay is OFF. The bot will NOT click "Jump to bottom", the Terms checkbox or "Place order". Turn Auto-Pay ON in the panel to let the bot place the order, or finish it yourself.');
    notify('Express checkout — Auto-Pay is OFF', 'The bot stopped at the checkout page. Pay yourself, or turn Auto-Pay ON.');
    return { ok: false, reason: 'autopay_off' };
  }

  const blocker = detectBlocker(document);
  if (blocker) {
    BOT.expressWalk = 'stopped';
    pauseBot('Express checkout shows a ' + blocker + ' screen.');
    return { ok: false, reason: 'blocker_' + blocker };
  }

  // The bot never types card details: if the page asks for them, stop.
  let cardField = needsPaymentDetails(document);
  if (cardField) {
    BOT.expressWalk = 'stopped';
    setStatus('CHECKOUT');
    log('Express checkout STOPPED: the page needs card details filled in — the bot NEVER types card details or CVV. Add a saved payment method on RSI first, or finish the order yourself.');
    notify('Express checkout needs card details', 'The bot never types card details. Finish the payment yourself.');
    return { ok: false, reason: 'needs_payment_details' };
  }

  setStatus('CHECKOUT');
  log('Express checkout (Auto-Pay ON): walking Jump to bottom → Terms → Place order…');

  // Step 1/3 — "Jump to bottom" (matched by its text).
  await sleep(400);
  const jumpBtn = findJumpToBottomButton(document);
  if (!jumpBtn) return expressWalkFail('jump_not_found', 'the "Jump to bottom" button was not found on the express checkout page');
  log('Express checkout: step 1/3 — clicking "Jump to bottom"…');
  if (!(await humanClick(jumpBtn))) return expressWalkFail('jump_not_clickable', 'the "Jump to bottom" button could not be clicked (not visible / covered after scrolling)');
  log('Express checkout: step 1/3 done — jumped to the bottom.');
  await sleep(700);

  // Step 2/3 — Terms of Service checkbox (matched by data-testid, never by id).
  const terms = findTermsCheckbox(document);
  if (!terms) return expressWalkFail('terms_not_found', 'the Terms of Service checkbox was not found on the express checkout page');
  if (terms.checked) {
    log('Express checkout: step 2/3 — the Terms checkbox is already checked, skipping the click.');
  } else {
    log('Express checkout: step 2/3 — checking the Terms of Service box…');
    const target = termsClickTarget(terms);
    if (!target || !(await humanClick(target))) return expressWalkFail('terms_not_clickable', 'the Terms checkbox could not be clicked (label / checkbox not visible / covered)');
    await sleep(300);
    if (!terms.checked && target !== terms && isClickableEl(terms)) {
      // The label click did not check the box — try the input itself once.
      await humanClick(terms);
      await sleep(300);
    }
    if (!terms.checked) return expressWalkFail('terms_still_unchecked', 'the Terms checkbox is still unchecked after clicking it — NOT placing the order');
    log('Express checkout: step 2/3 done — Terms of Service checked.');
  }
  await sleep(500);

  // Card-details guard again before the final click (the form can
  // appear only once the page has scrolled to the bottom).
  cardField = needsPaymentDetails(document);
  if (cardField) {
    BOT.expressWalk = 'stopped';
    setStatus('CHECKOUT');
    log('Express checkout STOPPED: the page needs card details filled in — the bot NEVER types card details or CVV. Finish the order yourself.');
    notify('Express checkout needs card details', 'The bot never types card details. Finish the payment yourself.');
    return { ok: false, reason: 'needs_payment_details' };
  }

  // Step 3/3 — "Place order" (matched by data-testid).
  const placeBtn = findPlaceOrderButton(document);
  if (!placeBtn) return expressWalkFail('place_not_found', 'the "Place order" button was not found on the express checkout page');
  log('Express checkout: step 3/3 — clicking "Place order"…');
  if (!(await humanClick(placeBtn))) return expressWalkFail('place_not_clickable', 'the "Place order" button could not be clicked (not visible / covered after scrolling)');
  log('Express checkout: "Place order" clicked — check the order confirmation yourself. The bot never types card details.');
  notify('Place order clicked!', 'Check the RSI order confirmation to make sure the order went through.');
  setStatus('DONE');
  BOT.expressWalk = 'done';
  return { ok: true, reason: 'placed' };
}

async function checkoutStepHandler() {
  // v1.3.0: the express checkout page has its own walk (Jump to bottom
  // -> Terms -> Place order), gated on Auto-Pay — it does not use the
  // cart's moveNext steps.
  if (isExpressCheckoutPage(window.location.pathname)) { await runExpressCheckoutWalk(); return; }
  if (!/\/store\/pledge\/cart/.test(window.location.pathname)) return;
  const blocker = detectBlocker(document);
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
      log('Clicking the Place Order button once with random human-like mouse movement (saved payment must already be selected).');
      await humanClick(btn);
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

/** Dry-run: one API stock check per watched product with a list ID, nothing added to cart. */
async function testStockCheck() {
  log('TEST: one dry-run stock check (nothing will be added to the cart)…');
  try {
    for (const ship of BOT.config.watchlist) {
      const r = await checkOneShip(ship);
      if (r.reason === 'page_only') {
        log('TEST ' + ship.name + ': page-only (no list ID) — the API cannot check it. Open its product page and press Start; the bot watches the Buy Now button there.');
        continue;
      }
      const price = r.sku ? '$' + priceUsd(r.sku.price.amount) : '—';
      log('TEST ' + ship.name + ': ' + r.reason + (r.sku ? ' — ' + r.sku.title + ' ' + price : '') + ' (' + r.checkedSkus + ' SKUs)');
    }
    log('TEST done. If a ship shows IN STOCK here, the monitor would buy it when running.');
  } catch (e) {
    log('TEST failed: ' + e.message);
  }
}

/* ------------------------- control panel ------------------------- */

function escHtml(s) {
  return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Re-draw the watchlist with a Remove button per product (v1.2.0). */
function renderWatchlist() {
  if (!isBrowser) return;
  const shipsEl = document.getElementById('scab-ships');
  if (!shipsEl) return;
  const list = BOT.config.watchlist || [];
  if (list.length === 0) {
    shipsEl.innerHTML = '<div>No products in the watchlist — add one below.</div>';
    return;
  }
  shipsEl.innerHTML = list.map((w, i) =>
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">' +
    '<span>• <b>' + escHtml(w.name) + '</b> — max $' + escHtml(w.maxPrice) +
    (w.preferWarbond ? ' (Warbond first)' : '') +
    (isApiCheckable(w) ? ' — list ' + escHtml(w.productId) : ' — page only') + '</span>' +
    '<button data-scab-remove="' + i + '" title="Remove" style="flex:none;padding:1px 7px;border:0;border-radius:6px;background:#7f1d1d;color:#fff;cursor:pointer;">✕</button></div>'
  ).join('');
  shipsEl.querySelectorAll('[data-scab-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-scab-remove'));
      const removed = BOT.config.watchlist[idx];
      BOT.config.watchlist.splice(idx, 1);
      saveConfig();
      renderWatchlist();
      log('Removed from watchlist: ' + (removed ? removed.name : '?'));
    });
  });
}

/** Wire the "Add any product" form (v1.2.0). */
function bindWatchlistForm() {
  if (!isBrowser) return;
  const btn = document.getElementById('scab-add-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const msgEl = document.getElementById('scab-add-msg');
    const setMsg = (t, ok) => { if (msgEl) { msgEl.textContent = t; msgEl.style.color = ok ? '#4ade80' : '#f87171'; } };
    const urlEl = document.getElementById('scab-add-url');
    const nameEl = document.getElementById('scab-add-name');
    const priceEl = document.getElementById('scab-add-price');
    const listEl = document.getElementById('scab-add-list');
    const warbondEl = document.getElementById('scab-add-warbond');
    const res = normalizeWatchEntry({
      url: urlEl ? urlEl.value : '',
      name: nameEl ? nameEl.value : '',
      maxPrice: priceEl ? priceEl.value : '',
      productId: listEl ? listEl.value : '',
      preferWarbond: warbondEl ? warbondEl.checked : false,
    });
    if (res.error) { setMsg(res.error, false); return; }
    const entry = res.entry;
    const dupe = (BOT.config.watchlist || []).some((w) => String(w.url || '').toLowerCase() === entry.url.toLowerCase());
    if (dupe) { setMsg('That product is already in the watchlist.', false); return; }
    BOT.config.watchlist.push(entry);
    saveConfig();
    renderWatchlist();
    if (urlEl) urlEl.value = '';
    if (nameEl) nameEl.value = '';
    if (priceEl) priceEl.value = '';
    if (listEl) listEl.value = '';
    if (warbondEl) warbondEl.checked = false;
    setMsg('Added: ' + entry.name + ' (max $' + entry.maxPrice + ')' + (isApiCheckable(entry) ? '' : ' — page only, keep its page open.'), true);
    log('Added to watchlist: ' + entry.name + ' (max $' + entry.maxPrice + ')' + (isApiCheckable(entry) ? ' — list ' + entry.productId : ' — page only'));
  });
}

function renderLog() {
  if (!isBrowser) return;
  const el = document.getElementById('scab-log');
  if (el) el.innerHTML = BOT.logLines.map((l) => '<div>' + l.replace(/</g, '&lt;') + '</div>').join('');
}

/* --- v1.2.1: draggable + resizable panel (same approach as the
 * Microsoft bot v2.11: width 20-60% and height 25-90% of the window,
 * position/size saved in Tampermonkey storage and restored on every
 * page; double-click the header to reset. The panel is never dragged
 * fully off-screen. Geometry lives in BOT.config.panel and is saved
 * by saveConfig() with the rest of the config. --- */
function clampPct(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function panelPct(v, total) { return Math.round(v / total * 1000) / 10; }

function applyPanelGeometry() {
  if (!isBrowser) return;
  const panel = document.getElementById('scab-panel');
  if (!panel) return;
  const g = BOT.config.panel || {};
  const w = (typeof g.width === 'number') ? clampPct(g.width, 20, 60) : null;
  const h = (typeof g.height === 'number') ? clampPct(g.height, 25, 90) : null;
  if (w !== null) panel.style.width = w + '%';
  if (h !== null) { panel.style.height = h + '%'; panel.style.overflow = 'auto'; }
  if (typeof g.left === 'number' && typeof g.top === 'number') {
    panel.style.left = clampPct(g.left, 0, 100 - (w === null ? 27 : w)) + '%';
    panel.style.top = clampPct(g.top, 0, 90) + '%';
    panel.style.right = '';
    panel.style.bottom = '';
  }
}

function savePanelGeometry() {
  if (!isBrowser) return;
  const panel = document.getElementById('scab-panel');
  if (!panel) return;
  const r = panel.getBoundingClientRect();
  const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
  BOT.config.panel = {
    width: clampPct(panelPct(r.width, vw), 20, 60),
    height: panel.style.height ? clampPct(panelPct(r.height, vh), 25, 90) : null,
    left: panel.style.left ? clampPct(panelPct(r.left, vw), 0, 90) : null,
    top: panel.style.top ? clampPct(panelPct(r.top, vh), 0, 90) : null,
  };
  saveConfig();
}

function resetPanelGeometry() {
  const panel = document.getElementById('scab-panel');
  if (panel) {
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '12px';
    panel.style.bottom = '';
    panel.style.width = '340px';
    panel.style.height = '';
    panel.style.overflow = '';
  }
  BOT.config.panel = null;
  saveConfig();
  log('Panel position and size reset to the default (top-right, 340px wide).');
}

function buildPanel() {
  if (document.getElementById('scab-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'scab-panel';
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:999999;width:340px;max-width:calc(100vw - 24px);background:#0f172a;color:#e2e8f0;font:13px/1.5 system-ui,sans-serif;border:1px solid #334155;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);padding:12px;';
  panel.innerHTML =
    '<div id="scab-header" title="Drag to move the panel (double-click to reset position and size)" style="display:flex;justify-content:space-between;align-items:center;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;">' +
    '<b>🚀 SC Auto Buyer v1.3.0</b>' +
    '<span id="scab-status" style="background:#0e7490;color:#fff;padding:2px 8px;border-radius:20px;font-size:11px;">IDLE</span></div>' +
    '<div id="scab-ships" style="margin:8px 0;font-size:12px;"></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
    '<button id="scab-start" style="flex:1;padding:7px;border:0;border-radius:6px;background:#16a34a;color:#fff;cursor:pointer;">▶ Start monitoring</button>' +
    '<button id="scab-stop" style="flex:1;padding:7px;border:0;border-radius:6px;background:#475569;color:#fff;cursor:pointer;">⏸ Stop</button></div>' +
    '<button id="scab-test" style="width:100%;margin-top:6px;padding:7px;border:0;border-radius:6px;background:#0e7490;color:#fff;cursor:pointer;">🔍 Test stock check now (no purchase)</button>' +
    '<div style="margin-top:10px;border-top:1px solid #334155;padding-top:8px;">' +
    '<b style="font-size:12px;">➕ Add any product</b>' +
    '<div style="font-size:11px;color:#94a3b8;">Any ship, package or vehicle — paste its RSI page URL. No code editing.</div>' +
    '<input id="scab-add-url" placeholder="Product URL — paste from the RSI store" style="width:100%;box-sizing:border-box;margin-top:6px;padding:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;">' +
    '<input id="scab-add-name" placeholder="Name (optional — filled in from the URL)" style="width:100%;box-sizing:border-box;margin-top:6px;padding:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;">' +
    '<div style="display:flex;gap:6px;margin-top:6px;">' +
    '<input id="scab-add-price" type="number" min="1" step="0.01" placeholder="Max price $" style="flex:1;min-width:0;padding:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;">' +
    '<input id="scab-add-list" placeholder="List ID (optional, e.g. 72)" style="flex:1;min-width:0;padding:6px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;"></div>' +
    '<label style="display:block;margin-top:6px;font-size:12px;"><input type="checkbox" id="scab-add-warbond"> Prefer Warbond (cheaper version first)</label>' +
    '<button id="scab-add-btn" style="width:100%;margin-top:6px;padding:7px;border:0;border-radius:6px;background:#16a34a;color:#fff;cursor:pointer;">Add product</button>' +
    '<div id="scab-add-msg" style="font-size:12px;margin-top:4px;min-height:16px;"></div>' +
    '<div style="font-size:11px;color:#94a3b8;">List ID: ships use 72 (Standalone Ships) — with it, the bot also checks by API from any page. Leave it empty and the product is "page only": keep its page open in a tab, the bot watches its Buy Now button there.</div></div>' +
    '<label style="display:block;margin-top:8px;font-size:12px;"><input type="checkbox" id="scab-autopay"> ⚠️ Auto-Pay / Place Order — ON = the bot places the order itself (express checkout too: Jump to bottom → Terms → Place order). OFF = bot stops at payment.</label>' +
    '<div style="font-size:11px;color:#94a3b8;margin-top:6px;">API checks only — the page is never refreshed. Pauses on CAPTCHA / queue. Max price is a hard cap. No purchase is guaranteed. Drag the header to move the panel, the corner to resize (double-click the header to reset).</div>' +
    '<div id="scab-log" style="margin-top:8px;max-height:180px;overflow:auto;background:#020617;border-radius:6px;padding:8px;font:11px/1.5 monospace;"></div>' +
    '<div id="scab-resize-grip" title="Drag to resize the panel" style="position:absolute;right:2px;bottom:2px;width:18px;height:18px;cursor:nwse-resize;touch-action:none;display:flex;align-items:flex-end;justify-content:flex-end;color:#64748b;font-size:13px;line-height:1;z-index:2;">↘</div>';
  document.body.appendChild(panel);

  renderWatchlist();
  bindWatchlistForm();

  const payBox = document.getElementById('scab-autopay');
  payBox.checked = !!BOT.config.autoPay;
  payBox.addEventListener('change', () => {
    BOT.config.autoPay = payBox.checked;
    saveConfig();
    log('Auto-Pay is now ' + (BOT.config.autoPay ? 'ON — the bot may click Place Order with a saved payment method, including the express checkout walk (Jump to bottom → Terms → Place order).' : 'OFF — the bot will stop at the payment step.'));
    // v1.3.0: if Auto-Pay was just switched ON while sitting on the
    // express checkout page, run the walk now (it was blocked while OFF).
    if (BOT.config.autoPay && isExpressCheckoutPage(window.location.href) &&
        (BOT.expressWalk === 'idle' || BOT.expressWalk === 'stopped')) {
      setTimeout(runExpressCheckoutWalk, 500);
    }
  });
  document.getElementById('scab-start').addEventListener('click', startLoop);
  document.getElementById('scab-stop').addEventListener('click', stopLoop);
  document.getElementById('scab-test').addEventListener('click', testStockCheck);

  // v1.2.1: drag the header to move, drag the corner grip to resize.
  // Position/size save on release and restore on every page.
  applyPanelGeometry();
  const headerEl = document.getElementById('scab-header');
  if (headerEl) {
    headerEl.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      const grabX = e.clientX - r.left;
      const grabY = e.clientY - r.top;
      const wPct = panelPct(r.width, window.innerWidth);
      const onMove = (ev) => {
        const left = clampPct(panelPct(ev.clientX - grabX, window.innerWidth), 0, 100 - wPct);
        const top = clampPct(panelPct(ev.clientY - grabY, window.innerHeight), 0, 90);
        panel.style.left = left + '%';
        panel.style.top = top + '%';
        panel.style.right = '';
        panel.style.bottom = '';
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        savePanelGeometry();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    headerEl.addEventListener('dblclick', resetPanelGeometry);
  }
  const gripEl = document.getElementById('scab-resize-grip');
  if (gripEl) {
    gripEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r0 = panel.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = panelPct(r0.width, window.innerWidth);
      const startH = panelPct(r0.height, window.innerHeight);
      const onMove = (ev) => {
        panel.style.width = clampPct(startW + panelPct(ev.clientX - startX, window.innerWidth), 20, 60) + '%';
        panel.style.height = clampPct(startH + panelPct(ev.clientY - startY, window.innerHeight), 25, 90) + '%';
        panel.style.overflow = 'auto';
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        savePanelGeometry();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // If we landed on the cart after an add-to-cart, resume the checkout walk.
  if (/\/store\/pledge\/cart/.test(window.location.pathname) && BOT.found) {
    setTimeout(checkoutStepHandler, 3000);
  }
  // v1.3.0: if we landed on the express checkout page, walk it
  // (Jump to bottom -> Terms -> Place order). The walk itself is gated
  // on Auto-Pay: with Auto-Pay OFF it clicks nothing and stops.
  if (isExpressCheckoutPage(window.location.pathname)) {
    setTimeout(runExpressCheckoutWalk, 3000);
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
    randInt, randomPointInRect, humanPath, BUY_NOW_SELECTORS, isClickableEl,
    slugify, isWatchedPage, findBuyNowButton,
    entryMatchesPage, isRsiUrl, normalizeWatchEntry, isApiCheckable,
    pagePriceUsd, domBuyAllowed,
    isRectInViewport, pointHitsElement, scrollIntoViewAndSettle, humanClick,
    makeMouseEvent,
    isExpressCheckoutPage, findJumpToBottomButton, findTermsCheckbox,
    findPlaceOrderButton, termsClickTarget, needsPaymentDetails,
    runExpressCheckoutWalk,
    clampPct, applyPanelGeometry, savePanelGeometry, resetPanelGeometry,
    startLoop, stopLoop, testStockCheck, renderWatchlist, bindWatchlistForm, buildPanel,
  };
}
