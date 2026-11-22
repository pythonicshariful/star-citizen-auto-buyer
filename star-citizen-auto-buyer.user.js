// ==UserScript==
// @name         Star Citizen Auto Buyer (RSI Pledge Store)
// @namespace    https://github.com/pythonicshariful/star-citizen-auto-buyer
// @version      1.3.5
// @description  Monitors RSI pledge-store ships via RSI's own GraphQL API (no page refresh) and auto add-to-cart + checkout when a watched ship comes in stock. Buy Now / Place Order clicks use random human-like mouse movement. Final payment is OFF by default.
// @author       Shariful Islam (pythonicshariful)
// @match        https://robertsspaceindustries.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_info
// @connect      robertsspaceindustries.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/*
 * Star Citizen Auto Buyer — v1.3.5
 * =================================
 * v1.3.5 FIX (2026-11-22): "Start monitoring" on the express checkout
 *   page did NOTHING — live 2026-11-22 12:40, First Flight Pack,
 *   Auto-Pay ON, v1.3.4. The bot arrived on express-checkout after
 *   Buy Now, Shariful pressed Start at 12:36:42, and the log just
 *   repeated the "page-only" reminder every 8-15s — no "Express
 *   checkout" line at all, Jump to bottom present, visible and
 *   enabled, never clicked. A fresh tab opened by the inspector DID
 *   run the walk on its own (Jump → Terms → stopped at Place order,
 *   disabled — no saved payment method on the test account).
 *   Root cause: the walk was triggered ONLY on panel boot
 *   (setTimeout(runExpressCheckoutWalk, 3000) in buildPanel) and on
 *   the Auto-Pay toggle. RSI navigates product → express checkout
 *   inside the page (SPA client-side routing, NO full reload), so
 *   Tampermonkey does NOT re-run, the panel is NOT rebuilt, and the
 *   boot trigger never fires — the panel log proves it: "Panel
 *   ready" appears ONCE (12:35:43, product page), never again after
 *   arriving on express checkout. And startLoop() never called the
 *   walk at all: it only started the API loop, whose loopTick()
 *   on an express page just logs the page-only reminder. Three
 *   triggers now, so the walk can no longer be missed:
 *   (1) Start pressed on the express page runs the walk directly
 *   (Auto-Pay OFF = zero clicks + a clear message, as before);
 *   (2) the monitoring loop itself checks the page route on every
 *   tick — on express checkout it stops the API loop and runs the
 *   walk, on the cart it resumes the pending checkout;
 *   (3) a 1s URL watcher catches SPA navigations to express
 *   checkout / cart with NO reload and NO Start press, and starts
 *   the walk / resume. The walk still runs Jump → Terms → Place
 *   order, Auto-Pay gated, no card details typed, Place order
 *   disabled (no saved payment method) still stops at step 3 with
 *   the clear message. Harness 357 -> see section 21.
 * v1.3.4 FIX (2026-11-21): two things Shariful asked for.
 *   (1) The card-details guard is REMOVED ENTIRELY. The 18:04 live
 *   run still showed the "Express checkout needs card details"
 *   popup: v1.3.3 had removed the walk-start guard, but the second
 *   guard — immediately before Place order — still fired on the
 *   test account (no saved payment method) and stopped the walk.
 *   Shariful: "ri restriction ta uthaiya daw". The guard is gone:
 *   the walk runs Jump → Terms → waits for Place order to become
 *   enabled (~15s). If a saved payment method is present (the
 *   buyer's account WILL have his card saved), Place order enables
 *   and the bot CLICKS it — that is the whole point. If no payment
 *   method is saved, Place order stays disabled and the walk stops
 *   at step 3 with place_disabled_no_payment and a clear "add a
 *   saved payment method" message — panel log + sound alarm, NO
 *   blocking popup. Removing the guard does NOT complete an order
 *   without a payment method; the fix for that is a saved payment
 *   method on RSI (or card details typed by hand). The bot still
 *   NEVER types card details, CVV, expiry or name — that rule is
 *   absolute and unchanged; only the early stop goes away. The
 *   Place-order enabled-wait is now the SOLE backstop.
 *   (2) The bot STALLED on the checkout page after Buy Now and had
 *   to be started again by hand (Shariful, 18:04). Root cause in
 *   the cart-page handler: it detected the "payment step" with a
 *   body-text regex (/payment method|select.*payment|place order|
 *   pay now/) — the cart summary itself contains "payment method"
 *   text, so the handler thought the page was already on the
 *   payment step, found no enabled Place Order button, logged "pay
 *   yourself" and CLEARED the pending flag: dead end. And when the
 *   moveNext step mutation failed once, the handler logged and
 *   never re-scheduled: dead end. Now the handler detects the
 *   payment step by a REAL Place Order / Pay Now button in the DOM
 *   (never by body text); with no such button it advances with
 *   moveNext and RETRIES a failed step (bounded, ~6 attempts),
 *   keeping the pending flag so a page reload resumes the checkout
 *   hands-off. Buy Now click → navigation → the walk auto-starts on
 *   the checkout page (cart and/or express-checkout) with NO manual
 *   Start press. Harness 317 -> see section 20.
 *   (3) The panel header hardcoded "v1.3.0" — the version never
 *   showed. The header now shows the real version
 *   ("SC Auto Buyer v1.3.4"), read from GM_info.script.version
 *   with a hardcoded SCAB_VERSION fallback kept in sync with the
 *   @version metadata.
 * v1.3.3 FIX (2026-11-21): the express-checkout walk STILL never
 *   clicked "Jump to bottom" — live run 17:55 Dhaka (First Flight
 *   Pack, Auto-Pay ON) logged "Express checkout STOPPED: the page
 *   needs card details filled in" and nothing else: no "walking
 *   Jump to bottom → Terms → Place order…" line, no Jump click.
 *   Root cause: the card-details guard ran at WALK START, before
 *   step 1. In v1.3.2 that was meant to catch the form before React
 *   rendered it — but on a fully-rendered page the empty card form
 *   is ALREADY there, so the guard aborted the whole walk at step 0.
 *   The guard is now REMOVED from walk start: the walk always runs
 *   Jump → Terms first, and the guard runs ONLY immediately before
 *   Place order (the post-jump+scroll check from v1.3.2). If no saved
 *   payment method exists, the walk stops THERE with the clear
 *   message (add a saved payment method / place_disabled_no_payment
 *   backstop) and Place order is NEVER clicked. The bot still NEVER
 *   types card details, CVV, expiry or name — that rule is absolute.
 *   The guard-stop log now names the step it stopped at ("stopped
 *   before Place order"). Harness 305 -> see section 19.
 * v1.3.2 FIX (2026-11-21): the express-checkout walk FAILED at step 1
 *   on a REAL checkout page (First Flight Pack, 17:38 Dhaka, logged
 *   in as QPPQMPMR9X, total $45.00): "the 'Jump to bottom' button was
 *   not found" — yet a live browser inspection a minute later showed
 *   the button EXISTS, VISIBLE ("JUMP TO BOTTOM", ~680x50, enabled).
 *   Root cause: the React page renders asynchronously, and the walk
 *   checked ONCE, 3s after panel boot, and failed permanently when
 *   the button simply had not rendered yet. The finder lowercases
 *   text, so the uppercase display text was NOT the problem. Now the
 *   walk WAITS for each step's element instead of failing on first
 *   sight: it polls every ~500ms, up to ~20s for an element to appear
 *   and ~15s for it to become enabled, logging while it waits, and
 *   only fails the step if it still has not appeared. The same live
 *   inspection found two more real behaviours the walk must handle:
 *   (a) the Terms checkbox is DISABLED until the page is scrolled to
 *   the bottom — that is exactly what "Jump to bottom" is for — so
 *   after step 1 the walk now waits for the checkbox to become
 *   enabled before clicking it (matched ONLY by
 *   data-testid="express-terms-checkbox", never by label text — the
 *   live label reads "I agree to Terms & Conditions and certify that
 *   I am over 18 years of age." — or by its React id); (b) the
 *   "Place order" button stays DISABLED until the Terms box is
 *   checked AND a payment method is selected, so after Terms the walk
 *   waits for it to become enabled, and if it never does it stops
 *   with a clear reason saying a saved payment method is needed — the
 *   bot NEVER types card details. The card-details guard also runs
 *   too early to see the form: it checked at walk start, before React
 *   rendered the payment form (the live page HAS an empty card form —
 *   card number, expiry, CVC/CVV, name on card — the test account has
 *   NO saved payment method), so the first check passed even though
 *   the form exists. The guard now ALSO runs after the jump+scroll,
 *   when the form is rendered, and it now treats a VISIBLE iframe
 *   whose src/name/title/id says card/payment as the same signal —
 *   hosted card fields live inside cross-origin iframes the bot
 *   cannot read into. Honest limit: if the card fields are hosted in
 *   cross-origin iframes with no tell-tale src/name, the guard cannot
 *   see them; the Place-order-disabled wait is then the backstop that
 *   stops the walk. Harness 274 -> see section 18.
 * v1.3.1 FIX (2026-11-21): the bot STALLED on the cart page after Buy
 *   Now. The live run (First Flight Pack, 17:15 Dhaka) logged "Buy Now
 *   clicked" and then nothing — the panel log ran on the SAME product
 *   page for 7 minutes, no checkout walk ever started. Two causes:
 *   (1) after the click the bot navigates to the cart, but the cart
 *   page loads with a brand-new BOT (BOT.found is null there), and the
 *   panel only resumed the checkout walk "if (.../cart... && BOT.found)"
 *   — so the walk NEVER resumed; the same dead end hit the API path,
 *   where a setTimeout(checkoutStepHandler, 4000) was scheduled and
 *   then the page navigated, killing the timer. Now the bot saves a
 *   "checkout pending" flag in Tampermonkey storage BEFORE navigating
 *   (which product, how it got there, when), and the cart page resumes
 *   the checkout walk from that flag — a cart page WITHOUT the flag
 *   starts no walk, so a cart the user opened themselves is left
 *   alone. The flag is cleared when the walk finishes (DONE), when it
 *   stops with a clear reason, or when the user presses Stop; a flag
 *   older than 30 minutes is treated as stale and ignored. (The
 *   express-checkout page keeps its v1.3.0 3-second walk trigger,
 *   gated on Auto-Pay.) (2) "Buy Now clicked" only meant the synthetic
 *   events dispatched without throwing — it never checked whether RSI
 *   actually reacted. Now the bot waits briefly after the click and
 *   checks the page reacted (navigating, or the button changed); if
 *   nothing happened it says so plainly and retries ONCE with a plain
 *   element.click() before giving up for that tick — and it never
 *   claims "clicked" when nothing reacted, and never forces the cart
 *   navigation when RSI is already navigating to express checkout.
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
 *   needs card details, the walk stops and alarms instead. (v1.3.4:
 *   the card-details guard is REMOVED entirely at Shariful's request
 *   — the walk now only stops at step 3 when Place order never
 *   becomes enabled, i.e. no saved payment method is selected.)
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

/* v1.3.4: the version the panel shows. Read from the installed
 * userscript's own metadata (GM_info.script.version) when available,
 * with this constant as the fallback — keep it in sync with the
 * @version metadata above, so the panel always shows the version
 * that is actually installed. (v1.3.0–v1.3.3 the header hardcoded
 * "v1.3.0", so the panel never showed the real version.) */
const SCAB_VERSION = '1.3.5';
function scabVersion() {
  try {
    if (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) {
      return String(GM_info.script.version);
    }
  } catch (e) {}
  return SCAB_VERSION;
}

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
  checkoutRetries: 0, // v1.3.4: failed cart checkout-step attempts in a row (bounded retries, see checkoutStepHandler)
  lastUrl: null, // v1.3.5: URL the SPA watcher last saw (detects client-side navigation with no reload)
  urlWatcher: null, // v1.3.5: setInterval id for the SPA URL watcher (one per panel)
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

/* --- v1.3.1 checkout-pending flag (Tampermonkey storage) ---
 * WHY: after Buy Now / add-to-cart the bot navigates to the cart, and
 * the cart page loads with a brand-new BOT — in-memory state (BOT.found,
 * timers) does NOT survive the navigation. The old panel boot resumed
 * the checkout walk only "if (.../cart... && BOT.found)", which is
 * always false on a fresh page load, so the bot sat idle on the cart
 * page (live bug 2026-11-21). The flag is saved BEFORE navigating and
 * read on the next page's boot. Shape: { source, product, skuId,
 * maxPrice, at } — source is 'dom_buy_now' or 'api_add_to_cart'.
 * Cleared when the walk finishes (DONE), when it stops with a clear
 * reason, or when the user presses Stop. A flag older than 30 minutes
 * is stale (e.g. a crashed session) and is ignored + cleared.
 * When Tampermonkey storage is unavailable (tests), an in-memory
 * fallback is used instead. */
const CHECKOUT_PENDING_KEY = 'scab_checkout_pending';
const CHECKOUT_PENDING_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const CHECKOUT_STEP_MAX_RETRIES = 6; // v1.3.4: failed cart checkout-step attempts before the handler stops (flag kept, reload resumes)
var checkoutPendingMemory = null;
function saveCheckoutPending(pending) {
  try {
    if (hasGM) { GM_setValue(CHECKOUT_PENDING_KEY, JSON.stringify(pending || null)); return; }
  } catch (e) {}
  try { checkoutPendingMemory = pending || null; } catch (e) {}
}
function loadCheckoutPending() {
  try {
    if (hasGM) {
      const raw = GM_getValue(CHECKOUT_PENDING_KEY, null);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
  } catch (e) {}
  return checkoutPendingMemory;
}
function clearCheckoutPending() { saveCheckoutPending(null); }
/** True when the saved flag is usable: present and not stale. A stale flag is cleared. */
function checkoutPendingValid(pending) {
  if (!pending || typeof pending !== 'object') return false;
  if (!pending.at || (Date.now() - Number(pending.at)) > CHECKOUT_PENDING_MAX_AGE_MS) {
    clearCheckoutPending();
    return false;
  }
  return true;
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

/** True when the URL is RSI's cart page (.../store/pledge/cart). */
function isCartPage(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return false;
  return u.indexOf('/store/pledge/cart') !== -1;
}

/**
 * What kind of page is this URL? 'express-checkout' | 'cart' | 'monitor'.
 * v1.3.5: the Start button, the monitoring loop and the SPA URL watcher
 * all route on this one function, so the express walk can no longer be
 * missed when RSI navigates without a reload.
 */
function pageRoute(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return 'monitor';
  if (u.indexOf('express-checkout') !== -1) return 'express-checkout';
  if (u.indexOf('/store/pledge/cart') !== -1) return 'cart';
  return 'monitor';
}

/**
 * Find the "Jump to bottom" button on the express checkout page,
 * regardless of whether it is clickable yet — the walk waits for it
 * to appear and become enabled separately. Matched by its TEXT, not
 * by class or data-cy-id alone — other buttons on the page share
 * those (class "a-button ... -fullWidth", data-cy-id="button").
 * Exact text match first, then a contains match.
 */
function findJumpToBottomButtonEl(doc) {
  const d = doc || document;
  const btns = d.querySelectorAll ? d.querySelectorAll('button') : [];
  for (const b of btns) {
    const t = (b.textContent || '').trim().toLowerCase();
    if (t === 'jump to bottom') return b;
  }
  for (const b of btns) {
    const t = (b.textContent || '').trim().toLowerCase();
    if (t.indexOf('jump to bottom') !== -1) return b;
  }
  return null;
}

/** The "Jump to bottom" button, only when it is visible and clickable. */
function findJumpToBottomButton(doc) {
  const el = findJumpToBottomButtonEl(doc);
  return el && isClickableEl(el) ? el : null;
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
 * Find the "Place order" button on the express checkout page,
 * regardless of whether it is clickable yet — it stays DISABLED
 * until the Terms box is checked and a payment method is selected,
 * and the walk waits for it to become enabled. Matched by
 * data-testid="express-card-form-submit".
 */
function findPlaceOrderButtonEl(doc) {
  const d = doc || document;
  if (!d.querySelector) return null;
  try { return d.querySelector('[data-testid="express-card-form-submit"]'); } catch (e) { return null; }
}

/**
 * The "Place order" button, only when it is visible and clickable.
 */
function findPlaceOrderButton(doc) {
  const el = findPlaceOrderButtonEl(doc);
  return el && isClickableEl(el) ? el : null;
}

/**
 * Find a "Place order" / "Pay now" button on a CART checkout page,
 * regardless of whether it is clickable yet — the cart handler waits
 * for it to become enabled separately. Matched by button TEXT.
 * "Confirm" alone is deliberately NOT matched: cookie banners and
 * address forms have "Confirm" buttons, and clicking one of those
 * is not placing an order ("Confirm order" IS matched — that is a
 * real order button). v1.3.4: the old handler detected the payment
 * step with a body-text regex instead, and the cart summary's own
 * "payment method" text made it misfire on the plain cart page.
 */
function findPlaceOrderLikeButtonEl(doc) {
  const d = doc || document;
  const btns = d.querySelectorAll ? d.querySelectorAll('button') : [];
  for (const b of btns) {
    const t = (b.textContent || '').trim().toLowerCase();
    if (/place order|pay now|confirm order/.test(t)) return b;
  }
  return null;
}

/** A "Place order" / "Pay now" button, only when visible and clickable. */
function findPlaceOrderLikeButton(doc) {
  const el = findPlaceOrderLikeButtonEl(doc);
  return el && isClickableEl(el) ? el : null;
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

/* v1.3.4: needsPaymentDetails() (the card-details guard) is REMOVED
 * entirely at Shariful's request — the walk no longer stops early on
 * an empty card form. The Place-order enabled-wait in the walk is
 * now the sole backstop: with a saved payment method Place order
 * enables and is clicked; without one it stays disabled and the
 * walk stops at step 3 with a clear "add a saved payment method"
 * message. The bot still NEVER types card details.

/* --- v1.3.1: did the Buy Now click actually do anything? ---
 * "Buy Now clicked" used to mean only that the synthetic events
 * dispatched without throwing — the live 2026-11-21 run logged it
 * while the page never moved. A dispatched click is not a bought
 * item: the page has to react (start navigating, or the button has
 * to change — disabled, or removed from the page). */
function clickReacted(beforeHref, btn) {
  try {
    if (typeof window !== 'undefined' && window && window.location && window.location.href !== beforeHref) return true;
  } catch (e) {}
  try {
    if (btn && btn.disabled) return true;
  } catch (e) {}
  try {
    if (typeof document !== 'undefined' && document && typeof document.contains === 'function' && btn && !document.contains(btn)) return true;
  } catch (e) {}
  return false;
}
async function waitForClickReaction(beforeHref, btn, timeoutMs) {
  const deadline = Date.now() + (timeoutMs === undefined ? 2000 : timeoutMs);
  while (Date.now() < deadline) {
    if (clickReacted(beforeHref, btn)) return true;
    await sleep(200);
  }
  return clickReacted(beforeHref, btn);
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
  const beforeHref = (typeof window !== 'undefined' && window && window.location) ? window.location.href : '';
  log('Buy Now button is available for ' + entry.name + ' — clicking it with random human-like mouse movement…');
  const ok = await humanClick(btn);
  if (!ok) return false;
  // v1.3.1: a dispatched click is not a bought item — verify the page
  // actually reacted. The live 2026-11-21 run logged "Buy Now clicked"
  // while the page never moved, and the bot then claimed success.
  // The first wait is deliberately ~2s: RSI's button disables or the
  // page starts navigating well within that on a working click, so a
  // slow-but-working click is not mistaken for an ignored one and
  // double-clicked.
  let reacted = await waitForClickReaction(beforeHref, btn, 2000);
  if (!reacted && isClickableEl(btn)) {
    log('Buy Now click dispatched but the page did not react — retrying once with a plain click…');
    try { btn.click(); } catch (e) { log('Plain click retry failed: ' + (e && e.message ? e.message : e) + ' — will retry on the next tick.'); return false; }
    reacted = await waitForClickReaction(beforeHref, btn, 2000);
  }
  if (!reacted) {
    log('Buy Now click did NOT move the page even after a plain click retry — the button may need a real mouse click. NOT navigating to the cart; will retry on the next tick.');
    return false;
  }
  const navigating = (typeof window !== 'undefined' && window && window.location) ? window.location.href !== beforeHref : false;
  log('Buy Now clicked (human-like path) — the page reacted' + (navigating ? ' (already navigating)' : '') + '.');
  return { entry: entry, alreadyNavigating: navigating };
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
  // v1.3.5: the monitoring loop routes on the page, not just on API
  // results. RSI navigates product → express checkout inside the page
  // (SPA, no reload), so a MONITORING loop that arrived there must
  // switch to the checkout walk instead of logging page-only reminders
  // forever — live 2026-11-22 the log repeated "page-only" every
  // 8-15s while Jump to bottom sat there unclicked. Same for the cart:
  // resume the pending checkout instead of polling.
  const route = pageRoute(window.location.href);
  if (route === 'express-checkout') {
    clearTimeout(BOT.timer); BOT.timer = null;
    // v1.3.5: Auto-Pay OFF means zero checkout clicks — and the walk
    // must NOT run here, because its Auto-Pay-OFF branch CLEARS the
    // pending flag (a stopped walk is no longer pending). Clearing it
    // on a passive loop tick would kill the cart resume for a
    // checkout the user may still finish by hand. Log the reason and
    // stop the loop instead.
    if (!BOT.config.autoPay) {
      setStatus('CHECKOUT');
      log('On the express checkout page while monitoring — Auto-Pay is OFF. The bot will NOT click "Jump to bottom", the Terms checkbox or "Place order". Turn Auto-Pay ON in the panel to let the bot place the order, or finish it yourself.');
      notify('Express checkout — Auto-Pay is OFF', 'The bot stopped at the checkout page. Pay yourself, or turn Auto-Pay ON.');
      return;
    }
    if (BOT.expressWalk !== 'running') BOT.expressWalk = 'idle';
    log('On the express checkout page while monitoring — switching to the checkout walk (Jump to bottom → Terms → Place order)…');
    await runExpressCheckoutWalk();
    return;
  }
  if (route === 'cart') {
    clearTimeout(BOT.timer); BOT.timer = null;
    if (checkoutPendingValid(loadCheckoutPending())) {
      log('On the cart page while monitoring — resuming the pending checkout walk…');
      await checkoutStepHandler();
    } else {
      setStatus('IDLE');
      log('On the cart page with no pending checkout — nothing to walk. Open a product page and press Start, or finish the cart yourself.');
    }
    return;
  }
  const blocker = detectBlocker(document);
  if (blocker) { pauseBot('RSI shows a ' + blocker + ' screen.'); return; }
  // v1.1.0: if a Buy Now button is already showing on a watched ship
  // page, click it human-like right away (API list can lag the page).
  try {
    const clicked = await clickBuyNowIfAvailable();
    if (clicked) {
      setStatus('IN STOCK');
      notify('Buy Now clicked!', 'The Buy Now button was available and clicked with human-like mouse movement. Continuing to checkout…');
      // v1.3.1: persist the checkout BEFORE leaving the page — the next
      // page load starts with a fresh BOT, so without this the cart
      // page never knows a checkout is in progress (live bug
      // 2026-11-21: the bot sat idle on the cart page).
      saveCheckoutPending({ source: 'dom_buy_now', product: clicked.entry.name, maxPrice: clicked.entry.maxPrice, at: Date.now() });
      // RSI's own Buy Now flow may already be navigating to express
      // checkout — do not override that with a cart navigation; the
      // pending flag lets the walk resume on whichever page we land on.
      if (!clicked.alreadyNavigating) window.location.href = RSI_ORIGIN + '/store/pledge/cart';
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
  // v1.3.5: Start on the express checkout page means "run the walk",
  // NOT "start API monitoring". Live 2026-11-22 Shariful pressed
  // Start on this page and nothing happened — startLoop never called
  // the walk, it only started loopTick, which logs page-only reminders
  // on a checkout page. Reset the walk state first so a previously
  // stopped walk retries instead of being stuck on 'stopped'.
  if (isExpressCheckoutPage(window.location.pathname)) {
    BOT.errors = 0;
    if (BOT.expressWalk !== 'running') BOT.expressWalk = 'idle';
    setStatus('CHECKOUT');
    log('Start pressed on the express checkout page — running the checkout walk (Jump to bottom → Terms → Place order)…');
    runExpressCheckoutWalk();
    return;
  }
  if (isCartPage(window.location.pathname) && checkoutPendingValid(loadCheckoutPending())) {
    BOT.errors = 0;
    setStatus('CHECKOUT');
    log('Start pressed on the cart page — resuming the pending checkout walk…');
    checkoutStepHandler();
    return;
  }
  BOT.errors = 0;
  BOT.found = null;
  // v1.3.1: a fresh monitoring run drops any stale checkout-pending
  // flag from an abandoned checkout, so it can never resume a walk
  // later by surprise.
  clearCheckoutPending();
  setStatus('MONITORING');
  log('Monitoring started — API checks every ~' + Math.round(BOT.config.pollMinMs / 1000) + '-' + Math.round(BOT.config.pollMaxMs / 1000) + 's. No page refresh.');
  loopTick();
}

function stopLoop() {
  clearTimeout(BOT.timer);
  BOT.timer = null;
  // v1.3.1: Stop also clears a pending checkout, so pressing Stop ends
  // the checkout walk too (and a pause, which calls stopLoop first,
  // clears it as well — a paused checkout never resumes by itself).
  clearCheckoutPending();
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
  // v1.3.1: persist the checkout BEFORE navigating — the setTimeout
  // that used to follow this line died with the page unload, and the
  // cart page boots with a fresh BOT (BOT.found is null there), so the
  // pending flag is the only way the walk resumes on the cart page
  // (live bug 2026-11-21: the bot sat idle on the cart page).
  saveCheckoutPending({ source: 'api_add_to_cart', product: found.ship.name, skuId: found.sku.id, maxPrice: found.ship.maxPrice, at: Date.now() });
  window.location.href = RSI_ORIGIN + '/store/pledge/cart';
}

/* --- v1.3.0 express-checkout walk (browser only) --- */

/** Log a stopped walk: why it stopped, and that later steps will NOT run. */
function expressWalkFail(reason, msg) {
  BOT.expressWalk = 'stopped';
  // v1.3.1: a stopped walk is no longer pending — clear the flag so a
  // later cart/express page load does not resume it by surprise.
  clearCheckoutPending();
  setStatus('CHECKOUT');
  log('Express checkout STOPPED: ' + msg + ' — later steps will NOT run. Finish the order yourself, or turn Auto-Pay ON and reload the page to try again.');
  notify('Express checkout stopped', msg);
  return { ok: false, reason: reason };
}

/* --- v1.3.2: wait for an element instead of failing on first sight ---
 * The React checkout page renders asynchronously — at 3s after panel
 * boot the "Jump to bottom" button simply had not rendered yet, and
 * the walk failed permanently for an element that appeared moments
 * later (live 2026-11-21). These helpers poll instead of checking
 * once: waitForEl polls a finder until it returns an element,
 * waitForEnabled polls until an element stops being disabled. Both
 * log while waiting so the panel log shows the walk is working, not
 * stuck, and only give up after their timeout. Timeouts are
 * parameters (tests pass small ones) — production defaults are
 * ~20s to appear, ~15s to become enabled. */
async function waitForEl(findFn, doc, label, timeoutMs, intervalMs) {
  const timeout = timeoutMs === undefined ? 20000 : timeoutMs;
  const interval = intervalMs === undefined ? 500 : intervalMs;
  const deadline = Date.now() + timeout;
  let logged = false;
  for (;;) {
    let el = null;
    try { el = findFn(doc); } catch (e) { el = null; }
    if (el) {
      if (logged) log('Found ' + label + '.');
      return el;
    }
    if (Date.now() >= deadline) {
      log('Still waiting for ' + label + ' — it did not appear after ~' + Math.round(timeout / 1000) + 's.');
      return null;
    }
    if (!logged) { log('Waiting for ' + label + ' to appear…'); logged = true; }
    await sleep(Math.min(interval, Math.max(0, deadline - Date.now())));
  }
}

async function waitForEnabled(el, label, timeoutMs, intervalMs) {
  const timeout = timeoutMs === undefined ? 15000 : timeoutMs;
  const interval = intervalMs === undefined ? 500 : intervalMs;
  const deadline = Date.now() + timeout;
  let logged = false;
  for (;;) {
    if (el && !el.disabled) return true;
    if (Date.now() >= deadline) {
      log('Still waiting for ' + label + ' to become enabled — it stayed disabled after ~' + Math.round(timeout / 1000) + 's.');
      return false;
    }
    if (!logged) { log('Waiting for ' + label + ' to become enabled…'); logged = true; }
    await sleep(Math.min(interval, Math.max(0, deadline - Date.now())));
  }
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
 * The bot NEVER types card details or CVV. (v1.3.4: the
 * card-details guard is REMOVED entirely — the walk no longer stops
 * early on an empty card form. With a saved payment method Place
 * order enables and is clicked; without one it stays disabled and
 * the walk stops at step 3 with a clear "add a saved payment
 * method" message.)
 */
async function runExpressCheckoutWalk(opts) {
  opts = opts || {};
  // v1.3.2: how long to wait for each step's element to appear
  // (~20s) and to become enabled (~15s). Tests pass small values.
  const presenceMs = opts.presenceMs === undefined ? 20000 : opts.presenceMs;
  const enabledMs = opts.enabledMs === undefined ? 15000 : opts.enabledMs;
  if (BOT.expressWalk === 'running' || BOT.expressWalk === 'done') return { ok: false, reason: 'already_' + BOT.expressWalk };
  BOT.expressWalk = 'running';

  // Gate: Auto-Pay OFF means zero checkout clicks.
  if (!BOT.config.autoPay) {
    BOT.expressWalk = 'stopped';
    clearCheckoutPending(); // v1.3.1: a stopped walk is no longer pending
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

  // v1.3.4: NO card-details guard anywhere in this walk anymore.
  // v1.3.2 ran one at walk start (aborted the whole walk at step 0
  // on a fully-rendered page, live 2026-11-21 17:55); v1.3.3 kept
  // one immediately before Place order (still stopped the walk on
  // the test account, live 2026-11-21 18:04). Both are removed at
  // Shariful's request — the buyer WILL have a card saved, so the
  // walk must not stop on an empty card form. Jump + Terms run
  // first; the Place-order enabled-wait below is now the SOLE
  // backstop for the no-payment case.

  setStatus('CHECKOUT');
  log('Express checkout (Auto-Pay ON): walking Jump to bottom → Terms → Place order…');

  // Step 1/3 — "Jump to bottom" (matched by its text). v1.3.2: the
  // React page renders asynchronously, so WAIT for the button to
  // appear instead of failing on first sight — live 2026-11-21 the
  // walk checked once at 3s and failed while the button appeared
  // moments later.
  const jumpBtn = await waitForEl(() => findJumpToBottomButtonEl(document), document, 'the "Jump to bottom" button', presenceMs);
  if (!jumpBtn) return expressWalkFail('jump_not_found', 'the "Jump to bottom" button did not appear on the express checkout page after waiting ~' + Math.round(presenceMs / 1000) + 's — the page may still be loading; reload the page to try again');
  if (!(await waitForEnabled(jumpBtn, 'the "Jump to bottom" button', enabledMs))) return expressWalkFail('jump_disabled', 'the "Jump to bottom" button stayed disabled after waiting ~' + Math.round(enabledMs / 1000) + 's');
  log('Express checkout: step 1/3 — clicking "Jump to bottom"…');
  if (!(await humanClick(jumpBtn))) return expressWalkFail('jump_not_clickable', 'the "Jump to bottom" button could not be clicked (not visible / covered after scrolling)');
  log('Express checkout: step 1/3 done — jumped to the bottom.');
  await sleep(700);

  // Step 2/3 — Terms of Service checkbox (matched by data-testid, never by id or label text).
  const terms = await waitForEl(() => findTermsCheckbox(document), document, 'the Terms of Service checkbox', presenceMs);
  if (!terms) return expressWalkFail('terms_not_found', 'the Terms of Service checkbox did not appear on the express checkout page after waiting ~' + Math.round(presenceMs / 1000) + 's');
  if (terms.checked) {
    log('Express checkout: step 2/3 — the Terms checkbox is already checked, skipping the click.');
  } else {
    // v1.3.2: the checkbox is DISABLED until the page is scrolled to
    // the bottom — that is what step 1 is for. Wait for it to become
    // enabled instead of clicking a disabled box.
    if (terms.disabled) {
      log('Express checkout: step 2/3 — the Terms checkbox is disabled until the page is scrolled to the bottom; waiting for it to become enabled…');
      if (!(await waitForEnabled(terms, 'the Terms of Service checkbox', enabledMs))) return expressWalkFail('terms_disabled', 'the Terms checkbox never became enabled — it stays disabled until the page is scrolled to the bottom');
    }
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

  // v1.3.4: NO card-details guard here anymore — the guard (which
  // ran at walk start in v1.3.2 and immediately before Place order
  // in v1.3.3) is REMOVED entirely at Shariful's request: on the
  // test account it kept stopping the walk even though the buyer
  // WILL have a card saved on his RSI account. The Place-order
  // enabled-wait below is now the SOLE backstop: with a saved
  // payment method Place order enables and is clicked; without one
  // it stays disabled and the walk stops at step 3 with a clear
  // "add a saved payment method" message. The bot still NEVER types
  // card details, CVV, expiry or name.

  // Step 3/3 — "Place order" (matched by data-testid). v1.3.2: it
  // stays DISABLED until the Terms box is checked AND a payment
  // method is selected, so wait for it to appear AND become enabled.
  // If it never enables, the account has no usable payment method —
  // stop with a clear reason instead of clicking a disabled button.
  const placeBtn = await waitForEl(() => findPlaceOrderButtonEl(document), document, 'the "Place order" button', presenceMs);
  if (!placeBtn) return expressWalkFail('place_not_found', 'the "Place order" button did not appear on the express checkout page after waiting ~' + Math.round(presenceMs / 1000) + 's');
  if (placeBtn.disabled) {
    log('Express checkout: step 3/3 — the "Place order" button is disabled; waiting for it to become enabled (it stays disabled until the Terms box is checked and a payment method is selected)…');
    if (!(await waitForEnabled(placeBtn, 'the "Place order" button', enabledMs))) return expressWalkFail('place_disabled_no_payment', 'the "Place order" button never became enabled — it stays disabled until the Terms box is checked AND a payment method is selected. Add a saved payment method on RSI first — the bot NEVER types card details.');
  }
  log('Express checkout: step 3/3 — clicking "Place order"…');
  if (!(await humanClick(placeBtn))) return expressWalkFail('place_not_clickable', 'the "Place order" button could not be clicked (not visible / covered after scrolling)');
  log('Express checkout: "Place order" clicked — check the order confirmation yourself. The bot never types card details.');
  notify('Place order clicked!', 'Check the RSI order confirmation to make sure the order went through.');
  setStatus('DONE');
  BOT.expressWalk = 'done';
  clearCheckoutPending(); // v1.3.1: the checkout finished — no longer pending
  return { ok: true, reason: 'placed' };
}

/* --- v1.3.1: resume a checkout after a page navigation ---
 * The cart page boots with a fresh BOT, so it cannot know a checkout
 * is in progress from memory — it reads the pending flag saved before
 * the navigation instead. Returns true when a resume was scheduled.
 * A cart page WITHOUT the flag starts NO walk: a cart the user opened
 * themselves is left alone. A stale flag (older than 30 minutes) is
 * ignored and cleared. The express page keeps its own v1.3.0 boot
 * trigger and does not go through here. */
function maybeResumeCheckout(delayMs, opts) {
  if (!isCartPage(window.location.pathname)) return false;
  const pending = loadCheckoutPending();
  if (!checkoutPendingValid(pending)) return false;
  log('Resuming the checkout walk on the cart page — a checkout is pending from the ' + (pending.source === 'api_add_to_cart' ? 'add-to-cart' : 'Buy Now') + ' step (' + pending.product + ').');
  BOT.checkoutRetries = 0; // v1.3.4: fresh resume, fresh retry budget
  setTimeout(function () { checkoutStepHandler(opts); }, (delayMs === undefined ? 3000 : delayMs));
  return true;
}

/* --- v1.3.5: SPA URL watcher ---
 * RSI navigates product → express checkout (and → cart) inside the
 * page with client-side routing — NO full reload, so Tampermonkey
 * does NOT re-run and the panel is NOT rebuilt. The boot trigger in
 * buildPanel (setTimeout 3s) therefore never fires on such a
 * navigation, and the walk was missed entirely (live 2026-11-22:
 * "Panel ready" appeared ONCE, on the product page). This watcher
 * polls the URL every 1s; when it changes to express checkout it
 * stops the API loop and starts the walk, and when it changes to
 * the cart it resumes a pending checkout. No reload and no Start
 * press needed. One watcher per panel (guarded by BOT.urlWatcher). */
function watchUrlChanges() {
  if (BOT.urlWatcher) return;
  try { BOT.lastUrl = window.location.href; } catch (e) { BOT.lastUrl = null; }
  BOT.urlWatcher = setInterval(() => {
    try {
      const href = window.location.href;
      if (href === BOT.lastUrl) return;
      BOT.lastUrl = href;
      const route = pageRoute(href);
      if (route === 'express-checkout') {
        // v1.3.5: the watcher is PASSIVE — with Auto-Pay OFF it logs
        // once and does nothing. Running the walk here would clear the
        // pending flag the Buy Now click just saved (the walk's
        // Auto-Pay-OFF stop clears it), which killed the cart resume
        // in the harness (live pattern: Buy Now -> SPA navigation ->
        // watcher fires before the flag is even read).
        if (!BOT.config.autoPay) {
          log('Page changed to express checkout (RSI navigated inside the page, no reload) — Auto-Pay is OFF, so the bot will not click anything here. Turn Auto-Pay ON or finish the order yourself.');
          return;
        }
        log('Page changed to express checkout (RSI navigated inside the page, no reload) — starting the checkout walk…');
        clearTimeout(BOT.timer); BOT.timer = null;
        if (BOT.expressWalk !== 'running') BOT.expressWalk = 'idle';
        if (BOT.status === 'MONITORING') setStatus('CHECKOUT');
        setTimeout(runExpressCheckoutWalk, 1000);
      } else if (route === 'cart') {
        if (checkoutPendingValid(loadCheckoutPending())) {
          log('Page changed to the cart (no reload) — resuming the pending checkout walk…');
          setTimeout(() => checkoutStepHandler(), 1000);
        }
      }
    } catch (e) { /* never let the watcher kill the panel */ }
  }, 1000);
}

/* v1.3.4: one failed cart-checkout attempt. Retries are bounded:
 * after maxRetries failures the handler stops WITHOUT clearing the
 * pending flag, so reloading the page resumes the checkout
 * hands-off (the flag is only cleared when the walk finishes or
 * stops with a clear reason). */
function checkoutStepRetry(why, opts) {
  opts = opts || {};
  const retryDelayMs = opts.retryDelayMs === undefined ? 4000 : opts.retryDelayMs;
  const maxRetries = opts.maxRetries === undefined ? CHECKOUT_STEP_MAX_RETRIES : opts.maxRetries;
  BOT.checkoutRetries = (BOT.checkoutRetries || 0) + 1;
  if (BOT.checkoutRetries >= maxRetries) {
    log('Checkout step failed ' + BOT.checkoutRetries + ' times in a row (' + why + ') — stopping here. The pending checkout is KEPT: reload the page and the walk resumes by itself.');
    notify('Checkout step failed', 'Reload the page — the checkout walk will resume by itself.');
    return;
  }
  log(why + ' — retry ' + BOT.checkoutRetries + '/' + maxRetries + ' in a few seconds…');
  setTimeout(function () { checkoutStepHandler(opts); }, retryDelayMs);
}

async function checkoutStepHandler(opts) {
  opts = opts || {};
  const retryDelayMs = opts.retryDelayMs === undefined ? 4000 : opts.retryDelayMs;
  const enabledMs = opts.enabledMs === undefined ? 15000 : opts.enabledMs;
  // v1.3.0: the express checkout page has its own walk (Jump to bottom
  // -> Terms -> Place order), gated on Auto-Pay — it does not use the
  // cart's moveNext steps.
  if (isExpressCheckoutPage(window.location.pathname)) { await runExpressCheckoutWalk(); return; }
  if (!isCartPage(window.location.pathname)) return;
  const blocker = detectBlocker(document);
  if (blocker) { pauseBot('Checkout shows a ' + blocker + ' screen.'); return; }
  // v1.3.4: the payment step is detected by a REAL Place Order /
  // Pay Now button in the DOM — NEVER by body text. The old
  // body-text regex (/payment method|select.*payment|place order|
  // pay now/) misfired on the plain cart page (the cart summary
  // itself contains "payment method" text), so the handler thought
  // the page was already on the payment step, found no enabled
  // Place Order button, logged "pay yourself" and CLEARED the
  // pending flag: dead end — the bot stopped on the checkout page
  // and Shariful had to press Start again (live 2026-11-21 18:04).
  const payBtnEl = findPlaceOrderLikeButtonEl(document);
  if (payBtnEl) {
    if (!BOT.config.autoPay) {
      setStatus('CHECKOUT');
      clearCheckoutPending(); // v1.3.1: the walk stopped here with a clear reason — no longer pending
      log('STOPPED at the payment step — Auto-Pay is OFF. Pay yourself now, the ship is in your cart.');
      notify('Ship in your cart — pay now!', 'Auto-Pay is OFF. Complete the payment yourself before stock runs out.');
      return;
    }
    // Auto-Pay ON: the button may still be DISABLED (a saved payment
    // method is still loading, or none is selected) — wait for it to
    // become enabled instead of giving up on first sight (same
    // lesson as v1.3.2: the React page renders asynchronously).
    if (payBtnEl.disabled) {
      log('The "Place order" button is disabled — waiting for it to become enabled (a saved payment method must be selected)…');
      if (!(await waitForEnabled(payBtnEl, 'the "Place order" button', enabledMs))) {
        setStatus('CHECKOUT');
        clearCheckoutPending(); // the walk stopped here with a clear reason — no longer pending
        log('STOPPED at the payment step — the "Place order" button never became enabled. No saved payment method is selected: add one on RSI first, or pay yourself. The bot NEVER types card details.');
        notify('Place order is disabled', 'Add a saved payment method on RSI, then reload the page.');
        return;
      }
    }
    log('Clicking the Place Order button once with random human-like mouse movement (a saved payment method must already be selected — the bot NEVER types card details).');
    if (await humanClick(payBtnEl)) {
      setStatus('DONE');
      clearCheckoutPending(); // v1.3.1: the checkout finished — no longer pending
      return;
    }
    // The click did not land — retry it like any other failed step.
    checkoutStepRetry('the Place Order button could not be clicked', opts);
    return;
  }
  // No Place Order button yet: the page is not on the payment step —
  // advance one checkout step (moveNext), then re-check. RSI
  // navigates to the next step (eventually express-checkout, where
  // the walk runs). v1.3.4: a failed step used to kill the handler
  // silently (the catch logged and never re-scheduled) — the bot
  // stopped on the cart page. Now it retries, bounded, and keeps
  // the pending flag so a reload resumes the checkout.
  try {
    await gql(buildNextStepMutation());
    log('Advanced one checkout step.');
    BOT.checkoutRetries = 0;
  } catch (e) {
    checkoutStepRetry('checkout step failed: ' + e.message, opts);
    return;
  }
  setTimeout(function () { checkoutStepHandler(opts); }, retryDelayMs);
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
    '<b>🚀 SC Auto Buyer <span id="scab-version">v' + scabVersion() + '</span></b>' +
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
    '<div style="font-size:11px;color:#94a3b8;margin-top:6px;">API checks only — the page is never refreshed. Pauses on CAPTCHA / queue. Max price is a hard cap. No purchase is guaranteed. On the express checkout page, Start runs the checkout walk (Jump to bottom → Terms → Place order). Drag the header to move the panel, the corner to resize (double-click the header to reset).</div>' +
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

  // v1.3.5: watch for SPA navigations (product → express checkout /
  // cart with no reload) — the boot trigger below never fires then.
  watchUrlChanges();
  // v1.3.1: if we landed on the cart after a Buy Now / add-to-cart,
  // resume the checkout walk from the pending flag saved before the
  // navigation. The old check used BOT.found, which is always null on
  // a fresh page load — so the walk never resumed (live bug
  // 2026-11-21). Without the flag the bot starts NO walk here.
  maybeResumeCheckout();
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
    findPlaceOrderButton, termsClickTarget,
    findJumpToBottomButtonEl, findPlaceOrderButtonEl,
    findPlaceOrderLikeButtonEl, findPlaceOrderLikeButton,
    checkoutStepHandler, checkoutStepRetry, CHECKOUT_STEP_MAX_RETRIES,
    waitForEl, waitForEnabled,
    runExpressCheckoutWalk,
    scabVersion, SCAB_VERSION,
    BOT,
    isCartPage, maybeResumeCheckout, saveCheckoutPending, loadCheckoutPending,
    clearCheckoutPending, checkoutPendingValid, clickBuyNowIfAvailable,
    clickReacted, waitForClickReaction,
    pageRoute, watchUrlChanges,
    clampPct, applyPanelGeometry, savePanelGeometry, resetPanelGeometry,
    startLoop, stopLoop, testStockCheck, renderWatchlist, bindWatchlistForm, buildPanel,
  };
}
