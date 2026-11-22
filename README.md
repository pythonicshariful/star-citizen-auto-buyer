# Star Citizen Auto Buyer — RSI Pledge Store Bot (Tampermonkey)

A small helper that watches the Star Citizen store for you and buys a
limited ship the moment it comes back in stock — for example the
**Drake Kraken** ($1,400 Warbond / $1,650 standard).

No coding needed to use it. If you can install a browser add-on and
click a few buttons, you can use this bot.

> ⚠️ **No purchase is guaranteed.** Limited ships sell out in seconds,
> the store watches for bots and can block scripted activity, and each
> account can only buy one limited ship. This bot gives you the fastest
> fair chance it can — it cannot promise you a ship.

## What it does, in plain words

1. **It watches the store for you.** Every few seconds it quietly asks
   the store "is my ship back yet?" — without reloading the page.
   Reloading the page again and again is what gets accounts flagged,
   so this bot never does that.
2. **It picks the cheaper version.** If the cheaper Warbond version is
   in stock (Kraken Warbond $1,400 instead of the standard $1,650),
   it takes that one. It never spends more than the max price you
   typed in.
3. **It puts the ship in your cart and walks through checkout — but
   it stops before paying.** Unless you switch Auto-Pay on, it stops
   at the payment step and waits for you to pay yourself. It never
   types card details. On the express checkout page, with Auto-Pay
   ON, it finishes the last steps itself: it clicks **"Jump to
   bottom"**, ticks the **Terms of Service** box, then clicks
   **"Place order"**. With Auto-Pay OFF it clicks none of those.
   To click "Place order", the store needs a payment method already
   saved on your RSI account — without one, the button stays greyed
   out and the bot stops there and tells you so.
4. **It clicks Buy Now like a person would.** When a Buy Now button
   appears, it scrolls it into view, moves the mouse to a random
   spot inside the button along a random curved path, pauses like a
   person, then clicks. It never does an instant straight-to-the-
   centre click. Honest limit: these clicks are made by the script,
   not by a real mouse, so a site that checks for that can still
   tell the difference.
5. **It stops for CAPTCHAs and queues.** If the store shows a real
   "prove you are human" check, a queue, or a verification screen,
   the bot pauses, sounds an alarm, and waits for you. It never
   tries to solve a CAPTCHA by itself. (The small "protected by
   reCAPTCHA" badge that sits on every normal store page does NOT
   stop the bot — only a real challenge does.)
6. **It works for any product, not just ships.** Add any store
   product — a ship, a package, a vehicle — from the panel. Each
   product has its own max price, and the bot never buys above it.

## Install (5 minutes, no coding)

You need two things: the free Tampermonkey add-on, and this bot.

1. **Add Tampermonkey to your browser.** Tampermonkey is a free
   add-on that lets your browser run small helper scripts like this
   one. In Chrome, open the Chrome Web Store, search
   "Tampermonkey", and click **Add to Chrome**. (Edge and Firefox
   have their own add-on stores — same search, same idea.)
2. **Install this bot.** Open the file
   `star-citizen-auto-buyer.user.js` here on GitHub and click the
   **Raw** button. Tampermonkey will pop up and ask to install it —
   click **Install**.
3. **Log in to the Star Citizen store** with your own account at
   https://robertsspaceindustries.com, then open any store page.
   A small dark box titled **"🚀 SC Auto Buyer"** appears in the
   top-right corner. That is your control panel — everything the bot
   does is controlled from there.

If the panel does not appear: check that Tampermonkey is switched on
(its icon in the browser toolbar should not be greyed out), then
reload the page.

When a new version comes out, Tampermonkey updates it by itself —
just reload the store page and the panel header shows the new version
number (for example "SC Auto Buyer v1.3.7").

## Your control panel — what each button does

- **▶ Start monitoring** — start watching. The bot checks the store
  every few seconds for your watched products.
- **■ Stop** — stop watching.
- **🔍 Test stock check now (no purchase)** — a safe practice run.
  It checks the store once and shows the result in the log, but it
  never adds anything to your cart.
- **Auto-Pay (ON / OFF)** — OFF by default, and that is the safe
  setting. OFF means the bot stops at the payment step and waits for
  you. ON means the bot is allowed to click "Place order" itself,
  using a payment method you already saved on your RSI account. Only
  switch it on if you are happy with that.
- **⚡ Check speed (Min / Max)** — how often the bot checks the
  store, in seconds. The default is 8–15 seconds: every check waits
  a fresh random time between the two numbers. Leave it as it is
  unless you have a reason to change it — checking faster looks
  more like a bot.
- **➕ Add any product** — add a product to watch (see below).
- **✕ (red cross next to a product)** — stop watching that product.
- **The log at the bottom of the panel** — plain-English lines saying
  what the bot just did ("Stock check list 72: 224 SKUs — Kraken:
  not_listed", "Buy Now clicked", and so on). If something goes
  wrong, the log is the first place to look.

## How to add any product

The bot already watches the **Kraken, max $1,400, Warbond first**.
To watch any other product — a ship, a package, a vehicle — add it
from the panel. No code editing:

1. Open any RSI store page. The dark panel **"🚀 SC Auto Buyer"**
   is at the top-right.
2. Under **"➕ Add any product"**, paste the product's page address
   (URL) — copy it from the address bar while you are on the
   product's own page (for example
   `.../en/pledge/Packages/Star-Citizen-First-Flight-Pack`).
3. The **name fills in by itself** from the address. Change it if
   you want.
4. **Max price $** — the bot NEVER buys above this. Type the most
   you are willing to pay.
5. **List ID** — leave it empty. The bot finds the right store list
   by itself a moment after you add the product (for example, the
   First Flight Pack ends up on list 45, Packages). If it cannot
   find one, the product still works — but you must keep that
   product's page open in a tab while monitoring, because the bot
   can then only watch its Buy Now button.
6. Tick **"Prefer Warbond"** only for ships that have a cheaper
   Warbond version.
7. Click **Add product**. It appears in the list above. Remove any
   product with the red **✕** next to it.

Your list is saved in your browser, so it is still there after you
close the tab.

## Test it first — with a cheap in-stock item (no purchase)

Do this before any real release, so you know it works:

1. Add a cheap in-stock item to the watchlist from the panel, for
   example **PTV - 10 Year** ($15) — or just use the panel's test
   button.
2. Click **"🔍 Test stock check now (no purchase)"** in the panel.
3. You should see something like `TEST PTV - 10 Year: in_stock`
   in the log — and **nothing is added to your cart**. That proves
   the stock check works.
4. To see the Buy Now click itself: keep the test product in the
   watchlist, open **that product's own page** (for example the PTV
   page), and click **▶ Start monitoring**. The bot should click
   Buy Now and take you to the cart — then it stops at payment
   (Auto-Pay is OFF), so nothing is bought. If it does not click,
   check the panel log: it says what happened on each check.
   A package works the same way: add **First Flight Pack** ($60,
   no list ID needed), open its page, press Start.
5. Remove the test product, then click **▶ Start monitoring** before
   the release wave.

## On release day

1. Log in to the store in the browser with the bot installed.
2. Open the product's own page (for the Kraken, its pledge page)
   and click **▶ Start monitoring**. If the product has no list ID
   (page-only), this page must stay open — the bot watches its Buy
   Now button there.
3. Leave the tab open. When the product appears, the bot adds it to
   your cart, moves through checkout and **stops at payment** (unless
   you switched Auto-Pay on) — you pay yourself, fast.
4. If a CAPTCHA or queue appears, the bot pauses and sounds an
   alarm — solve it yourself, then press Start again.

## Safety notes — please read

- **Auto-Pay is OFF by default.** The bot stops at the payment step
  and waits for you. Only switch it on if you understand it may
  click Place Order with a payment method you already saved on the
  store.
- The bot never asks for your password or card details, and never
  sends your data anywhere — it only talks to
  robertsspaceindustries.com.
- One ship per account, one quantity — the store's own limit.
- Leave the check speed as it is (8–15 seconds). Checking faster
  looks more like a bot and can get the account blocked.

## What is proven / not proven (v1.3.7, 2026-11-22)

"Proven live" means it was actually seen working on the real store.
"Proven in tests" means it was checked by the automated tests
(`node test/test-harness.js`, 410 checks) but not yet seen on the real
store. "Not proven" means it has not been tried yet.

| | Status |
|---|---|
| Stock check | ✅ Proven live — Kraken correctly shows as "not in stock" while it is sold out; PTV ($15) and First Flight Pack ($60) correctly show as in stock; Pioneer correctly shows as out of stock |
| Check speed from the panel (Min / Max delay, a fresh random wait each check) | ✅ Proven in tests — the panel has Min and Max delay boxes (seconds); every check waits a fresh random time between them, and the numbers are saved (smallest 2s, largest 300s; Max is raised to Min if it is below Min). **Not yet seen in a real browser** |
| Store replies shown in the browser console | ✅ Proven in tests — every store check writes one easy-to-read line to the browser console (DevTools → Console), for example "Stock check list 72: 224 SKUs — Kraken: not_listed", plus the full reply as an expandable object, and one line per add-to-cart / checkout step. **Not yet seen in a real browser** |
| List ID auto-detect | ✅ Proven in tests — leave the List ID empty when adding a product and the bot tries the known store lists (Ships 72, Packages 45, Upgrades 241, Paints 268, Packs 270) and saves the first list that holds the product. Checked live 2026-11-22: First Flight Pack is in list 45 — and NOT in list 72 (224 items, zero matches). If no list holds it, the product stays page-only as before. **Not yet seen in a real browser** |
| Gaming look of the panel | ✅ The panel has a new dark gaming look — near-black background, neon-cyan border and glow, gradient strip on top, angular buttons, terminal-style log. Same buttons, same labels — only the look changed. Tests confirm the new look did not break any button |
| Picking the cheaper Warbond version under the max price | ✅ Proven — 410/410 automated tests pass |
| Add any product from the panel (ship / package / vehicle) | ✅ Proven in tests — the address and max price are checked, the name is read from the address, the List ID is optional; a product NOT in your list never gets clicked. **Not yet seen in a real browser** |
| Page-only products (no list ID) | ✅ Proven in tests — the bot skips the store check and watches the Buy Now button on the product's own page; the page must stay open. **Not yet seen in a real browser** |
| Max price also respected on the Buy Now click | ✅ Proven in tests — if the price on the page is above your max, it does NOT click |
| CAPTCHA pause only on a real visible challenge | ✅ Fixed — a normal store page (the small "protected by reCAPTCHA" badge on every page) no longer stops the bot on Start; a genuinely visible challenge (checkbox / picture challenge) still pauses it and sounds the alarm. Tested |
| Start → Buy Now on a watched in-stock page | ✅ Fixed and tested — the Buy Now click used to never fire for ships like "PTV - 10 Year", then used a stale position while the page was still scrolling, then the click itself failed to build inside Tampermonkey. Now the bot checks after the click that the page actually reacted (it started moving, or the button changed); if nothing happened it says so plainly and tries once more with a plain click, and never claims "clicked" when nothing reacted. Tested on PTV, Meteor, Kraken and First Flight Pack pages. **Still needs a real-browser check:** open the test product's own page, press Start, and watch it click Buy Now and go to the cart (it stops at payment — Auto-Pay OFF) |
| No page reloading | ✅ Proven — the bot never reloads the page; it only asks the store quietly |
| Human-like Buy Now click (random curved mouse path) | ✅ Proven in tests — the bot scrolls the button into view FIRST, waits for the scrolling to settle, reads the position again, checks the button is really visible and not covered by something else, then clicks a random spot on it along a curved path with random hover and hold times; a covered / off-screen / greyed-out button is NOT clicked. Honest note: these clicks are made by the script, not a real mouse, so a site that checks for that can still tell |
| Express checkout walk — Jump to bottom → Terms → Place order | ✅ Proven in tests — the three steps run in order on the express checkout page, found by the button text ("Jump to bottom") and the Terms checkbox and Place order button; a failed step stops the walk and Place order is never attempted; Auto-Pay OFF means zero checkout clicks; the bot never types card details. The walk WAITS for each button to appear (about 20s) and become clickable (about 15s) instead of giving up at once — on a real page the buttons show up late. The Terms box stays greyed out until the page is scrolled to the bottom, so the walk waits for it to become clickable after the jump; Place order stays greyed out until Terms is ticked AND a payment method is saved, so the walk waits for it and stops with a clear message ("add a saved payment method") if it never becomes clickable. **Seen in part on a real page 2026-11-22:** a fresh tab did Jump → Terms and stopped at Place order, which stayed greyed out because the test account has NO saved payment method — the Place-order click itself still needs a real test with a saved payment method |
| Panel can be moved and resized | ✅ Proven in tests — drag the top of the panel to move it, drag the bottom-right corner to resize it (width 20–60%, height 25–90% of the window); the position and size are saved and come back on every page; double-click the top to reset. **Not yet seen in a real browser** |
| Every panel button works | ✅ Proven in tests — Start starts watching, Stop stops it (and clears a paused state), Test runs a safe practice check, Add product adds and rejects duplicates, Remove (✕) removes that product, the Auto-Pay switch flips the setting. **Not yet seen in a real browser** |
| Add-to-cart + checkout steps | ⚠️ Built from the store's own code, **not yet proven live** — needs a test in a real logged-in browser with a cheap in-stock item, stopping before payment. The old cart-page stall is fixed: after the Buy Now click the bot used to sit idle on the cart page, but now it remembers the checkout is in progress and picks it up on the next page by itself |
| Buying a Kraken in a real wave | ❌ Not proven — no wave was live during testing, and no real purchase was made |

Test evidence: `test/live-test-2026-11-21.json` (live store results),
`test/test-harness.js` (410 checks), `RESEARCH.md` (full findings).

## Files

- `star-citizen-auto-buyer.user.js` — the bot (install this)
- `README.md` — this file
- `RESEARCH.md` — how the RSI store works, with evidence
- `test/test-harness.js` — automated tests (run: `node test/test-harness.js`)
- `test/live-test.py` — live API test (run: `python3 test/live-test.py`)
- `test/fixtures/` — real + synthetic API responses used by the tests

## Version

Below is the full change log — the technical details, kept for the record.
The plain-English summary of what each version changed is in the
sections above.

v1.3.7 — 2026-11-22. Console API log + list-ID auto-detect. (1) Every GraphQL call now also writes to the browser console (DevTools → Console): one readable line per stock check ("Stock check list 72: 224 SKUs — Kraken: not_listed") plus the raw API response as an expandable object, and one line per add-to-cart / checkout call ("API AddCartMultiItemMutation"). No Network-tab digging needed to see what the API said. (2) The List ID field is now optional in practice: leave it empty when adding a product and the bot tries the known store lists itself (72 Standalone Ships, 45 Packages, 241 Ship Upgrades, 268 Paints, 270 Packs — from the store's own router data) and saves the first list whose SKUs contain the product's name (same title match the stock check already uses). The product is added at once (page-only) and the list is filled in a moment later in the background — the first version awaited detection before adding, which broke every flow that presses Start right after Add (23 harness checks), so Add never waits on the network now. Verified live 2026-11-22: First Flight Pack is SKU 19607, $60, in stock in list 45 — and NOT in list 72 (224 SKUs, zero matches). If no list holds it, the product stays page-only as before. Harness 410/410 (19 new checks in section 23: list matching, known lists, console hook wiring, detectListId with a per-list fetch stub, console lines from a real stock check, Add pushing the entry before detection, and Add with no list ID auto-detecting 45 for First Flight Pack). No change to the watchlist, API-only stock checks, max-price guard, CAPTCHA pause, express walk, or Auto-Pay default OFF.

v1.3.6 — 2026-11-22. Check speed from the panel + gaming UI. (1) The stock check already waited a RANDOM time between the two config values (8–15s), but the numbers lived only in the config with no way to change them from the panel. Now the panel has Min / Max delay inputs (seconds, in the "⚡ Check speed" row): every stock check waits a fresh random time between them, and the inputs save to the config (2s min, 300s max, Max raised to Min when it is below Min; a saved config from an older version is self-healed on load). The "Monitoring started" log already shows the range from the config, so it reflects the new values automatically. (2) The panel got a gaming UI vibe: near-black HUD background, neon-cyan border + glow, gradient top strip, uppercase letter-spaced headings, angular clip-path buttons, terminal-cyan log. Same buttons, same labels, same element ids — only the look changed. Harness 391/391 (16 new checks in section 22: delay validation, the random delay coming from the config, panel wiring + gaming look, and changing the inputs in a fake browser updating the config + status line + log). No change to the watchlist, API-only stock checks, max-price guard, CAPTCHA pause, express walk, or Auto-Pay default OFF.

v1.3.5 — 2026-11-22. Start on the express checkout page now actually runs the checkout walk. LIVE BUG (First Flight Pack, 12:40 Dhaka, Auto-Pay ON): after the Buy Now click the bot arrived on express checkout, Start was pressed at 12:36:42, and the log just repeated "page-only (no list ID) — keep its product page open" every 8-15s — no "Express checkout" line at all, while "Jump to bottom" was present, visible and enabled and never clicked. A fresh tab opened for inspection DID run the walk on its own (Jump → Terms → stopped at Place order, disabled — no saved payment method on the test account). Root cause: the walk was triggered ONLY on panel boot (setTimeout 3s in buildPanel) and on the Auto-Pay toggle. RSI navigates product → express checkout inside the page (SPA client-side routing, NO full reload), so Tampermonkey does NOT re-run, the panel is NOT rebuilt, and the boot trigger never fires — the panel log proves it: "Panel ready" appears ONCE (12:35:43, product page), never again after arriving on express checkout. And startLoop() never called the walk: it only started the API loop, whose loopTick() on a checkout page just logs the page-only reminder. Three triggers now, so the walk can no longer be missed: (1) Start pressed on the express checkout page runs the walk directly (Auto-Pay OFF = zero clicks + a clear message, as before; a previously stopped walk retries instead of staying stopped); (2) the monitoring loop checks the page route on every tick — on express checkout it stops the API loop and runs the walk, on the cart it resumes the pending checkout; (3) a 1-second URL watcher catches SPA navigations to express checkout / cart with NO reload and NO Start press, and starts the walk / resume. With Auto-Pay OFF the watcher and the loop only log and do nothing — running the walk there would clear the pending flag the Buy Now click just saved (that was a second bug found while fixing this one: the walk's Auto-Pay-OFF stop clears the flag). The walk itself is unchanged: Jump → Terms → Place order, Auto-Pay gated, no card details typed, Place order disabled (no saved payment method) still stops at step 3 with the clear message. The panel footer now says plainly that Start runs the checkout walk on the express checkout page. Harness 375/375 (18 new checks in section 21: pageRoute routing, the three triggers in the script, the Auto-Pay-OFF guards for the watcher and the loop, Start on express checkout + Auto-Pay ON runs Jump → Terms → Place order, Start + Auto-Pay OFF clicks nothing, and the live 2026-11-22 replay — Place order disabled → Jump + Terms run, then stops with the saved-payment message). No change to the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.
v1.3.4 — 2026-11-21. The card-details guard is REMOVED ENTIRELY, and the checkout walk auto-resumes hands-off after Buy Now. LIVE BUGS (First Flight Pack, 18:04 Dhaka, Auto-Pay ON): (1) the walk popped up "Express checkout needs card details" and stopped before Place order even though Jump + Terms were ready — Shariful asked for the restriction to go entirely ("ri restriction ta uthaiya daw"); (2) after the Buy Now click on the product page the bot stopped on the checkout page and had to be started again by hand ("product page a add to cart a click korar por checkout page a bot ta thaima jai abar active korte hoi"). Root causes: (1) the pre-Place-order guard (the only one left after v1.3.3 removed the walk-start one) fired on the test account, which has NO saved payment method — the empty card form is always there, so the guard always stopped the walk; (2) the cart handler detected the payment step with a whole-body-text regex (/payment method|select.*payment|place order|pay now/) — the cart summary itself contains "payment method" text, so it misfired on the plain cart page, found no enabled Place Order button, logged "pay yourself" and CLEARED the pending flag: dead end; and when a moveNext step failed once, the catch logged and never re-scheduled: dead end. Fixes: the `needsPaymentDetails` guard is deleted from the script entirely (no `alert()` popup anywhere — the walk stops with a panel log + sound alarm only). The walk now runs Jump → Terms → waits for Place order to become enabled (~15s, the existing waitForEnabled) → if it never enables, stops with place_disabled_no_payment and a clear "add a saved payment method" message, Place order never clicked. That enabled-wait is now the SOLE backstop. **Removing the guard does NOT complete an order without a payment method** — with no saved payment method on RSI, Place order stays disabled and the walk stops at step 3; the fix is a saved payment method on RSI (or card details typed by hand). The bot still NEVER types card details, CVV, expiry or name. The cart handler now detects the payment step by a REAL Place Order / Pay Now button in the DOM (never body text); if the button is disabled it waits for it to enable, then clicks it with Auto-Pay ON (a saved payment method present = the walk completes and clicks Place order) or stops with the clear "add it" message; a failed step retries (bounded, 6 tries) and KEEPS the pending flag so a reload resumes; the walk auto-starts on the checkout page with NO manual Start press — product → cart → express-checkout AND product → express-checkout direct both work. With Auto-Pay OFF the bot still stops at payment with alarm and zero clicks (no change). The panel header now shows the installed version ("🚀 SC Auto Buyer v1.3.4"), read from `GM_info.script.version` with a hardcoded fallback kept in sync with the @version metadata. Harness 357/357 (50 new checks in section 20: guard gone from the script entirely; cart handler detects payment by real button, retries bounded with flag kept, waits for a disabled Place Order button; panel renders the version; multi-page flows (a) product → cart → express, (b) product → express direct, (c) Auto-Pay OFF = no walk, (d) guard removed — card form + disabled Place order → place_disabled_no_payment, (d2) saved payment — card form + enabled Place order → walk completes and clicks Place order, (e) cart page mentioning payment text advances, (f) failing step retries with flag kept, (g) payment step + Auto-Pay ON clicks Place Order, (h) payment step + Auto-Pay OFF stops with zero clicks, (i) disabled-then-enabled Place Order waits and clicks, (j) never-enabling Place Order stops with the saved-payment message). No change to the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.
v1.3.3 — 2026-11-21. The walk-start card-details guard is REMOVED. LIVE BUG (First Flight Pack, 17:55 Dhaka, Auto-Pay ON): the console showed ONLY "Express checkout STOPPED: the page needs card details filled in" — no "walking Jump to bottom → Terms → Place order…" line, no Jump click. Root cause: the card-details guard ran at WALK START, before step 1, and on a fully-rendered page the empty card form is already there, so the guard aborted the whole walk at step 0. The walk now always runs Jump → Terms first, and the guard runs ONLY immediately before Place order (the post-jump+scroll check from v1.3.2). If no saved payment method exists, the walk stops THERE with the clear message (add a saved payment method / place_disabled_no_payment backstop) and Place order is NEVER clicked. The bot still NEVER types card details, CVV, expiry or name. The guard-stop log now names the step it stopped at ("STOPPED before Place order"). Harness 317/317 (12 new checks in section 19: card form present at walk start → Jump + Terms run, then stops before Place order; saved payment present → walk completes; late Jump + no saved payment → waits for Jump, then stops at step 3 — plus static checks that the guard runs once, after the walk-start log). No change to the checkout-pending flag resume, click verification, scroll-then-click, MouseEvent construction, Auto-Pay gating, the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.
v1.3.2 — 2026-11-21. The express-checkout walk now WAITS instead of failing on first sight. LIVE BUG (First Flight Pack, 17:38 Dhaka, Auto-Pay ON): the walk failed at step 1 — "the 'Jump to bottom' button was not found" — yet a live browser inspection a minute later showed the button EXISTS and is VISIBLE ("JUMP TO BOTTOM", ~680x50, enabled). Root cause: the React page renders asynchronously, and the walk checked ONCE, 3s after panel boot, and failed permanently for a button that simply had not rendered yet (the finder lowercases text, so the uppercase display text was NOT the problem). Now the walk polls every ~500ms, up to ~20s for each step's element to appear and ~15s for it to become enabled, logging while it waits, and only fails the step if it still has not appeared. The same live inspection found two more real behaviours: (a) the Terms checkbox is DISABLED until the page is scrolled to the bottom — that is exactly what "Jump to bottom" is for — so after step 1 the walk waits for the checkbox to become enabled before clicking it (matched ONLY by `data-testid="express-terms-checkbox"`, never by label text — the live label reads "I agree to Terms & Conditions and certify that I am over 18 years of age." — or by its React id); (b) the "Place order" button stays DISABLED until the Terms box is checked AND a payment method is selected, so after Terms the walk waits for it to become enabled, and if it never does it stops with a clear reason saying a saved payment method is needed — the bot NEVER types card details. The card-details guard also ran too early to see the form (it checked at walk start, before React rendered the payment form — the live page HAS an empty card form, and the test account has NO saved payment method), so it now re-checks after the jump+scroll, and treats a VISIBLE iframe whose src/name/title/id says card/payment as card details needed (hosted card fields live inside cross-origin iframes the bot cannot read into). Honest limit: if the card fields are hosted in cross-origin iframes with no tell-tale src/name, the guard cannot see them — the Place-order-disabled wait is then the backstop that stops the walk. Harness 305/305 (31 new checks in section 18: late-appearing Jump, disabled-until-scrolled Terms, disabled Place order stopping with the payment-method reason, late card form caught by the second guard, Jump never appearing, plus wait-helper and hosted-iframe guard tests). No change to the checkout-pending flag resume, click verification, scroll-then-click, MouseEvent construction, Auto-Pay gating, the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.3.1 — 2026-11-21. Fixed the bot stalling on the cart page after Buy Now, and made "Buy Now clicked" honest. LIVE BUG (First Flight Pack, 17:15 Dhaka): the log said "Buy Now clicked" and then nothing for 7 minutes — the panel log ran on the SAME product page, no checkout walk ever started. Two causes, both fixed: (1) after the click the bot navigates to the cart, but the cart page loads with a brand-new BOT (BOT.found is null there), and the panel only resumed the checkout walk "if (.../cart... && BOT.found)" — so the walk NEVER resumed; the same dead end hit the API path, where a setTimeout(checkoutStepHandler, 4000) was scheduled and then the page navigated, killing the timer. Now the bot saves a "checkout pending" flag in Tampermonkey storage BEFORE navigating (which product, how it got there, when), and the cart page resumes the checkout walk from that flag — a cart page WITHOUT the flag starts no walk, so a cart the user opened themselves is left alone. The flag is cleared when the walk finishes (DONE), when it stops with a clear reason, or when the user presses Stop; a flag older than 30 minutes is treated as stale and ignored. The express-checkout page keeps its v1.3.0 3-second walk trigger, gated on Auto-Pay. (2) "Buy Now clicked" only meant the synthetic events dispatched without throwing — it never checked whether RSI actually reacted. Now the bot waits ~2s after the click and checks the page reacted (navigating, or the button changed); if nothing happened it says so plainly ("Buy Now click dispatched but the page did not react") and retries ONCE with a plain element.click() before giving up for that tick — and it never claims "clicked" when nothing reacted, and never forces the cart navigation when RSI is already navigating to express checkout. Harness 274/274 (47 new checks in section 17, including fake-browser end-to-end runs of the DOM Buy Now path and the API add-to-cart path, the cart-page resume with/without/stale flag, and the click-verification + plain-click retry). Known limit: if RSI is slow (over ~2s) to react to a working click, the plain-click retry can double-click — the 2s wait makes that unlikely, and the loop retries anyway on the next tick. No change to scroll-then-click, the express walk steps, Auto-Pay gating, the card-details guard, the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.3.0 — 2026-11-21. Express-checkout walk: on the express checkout page (`.../store/pledge/express-checkout`) the bot now walks the final three steps in order, ONLY when Auto-Pay is ON in the panel (Auto-Pay stays OFF by default): (1) click "Jump to bottom" — matched by its button TEXT, never by class or data-cy-id alone (other buttons share those); (2) check the Terms of Service box — matched by `data-testid="express-terms-checkbox"`, NEVER by its id (React generates a new id on every render), clicked via its label so the React handler fires, and verified checked afterwards (already-checked skips the click); (3) click "Place order" — matched by `data-testid="express-card-form-submit"`. Each step re-finds its element after a short settle wait and checks it is visible and clickable before the human-like click (scroll-then-click, random curved path, v1.2.2 MouseEvent construction); if any step fails the walk STOPS there and later steps are never attempted. When Auto-Pay is OFF the bot clicks NONE of the three — it stops at the checkout page with an alarm, exactly as before (and turning Auto-Pay ON while on the page runs the walk). The bot NEVER types card details or CVV: if the page shows a payment form that still needs card details, the walk stops and alarms instead. The panel Auto-Pay label now says plainly that ON means the bot places the order itself. Harness 227/227 (47 new checks in section 16, including a fake-browser end-to-end walk: happy path in order, already-checked Terms, Auto-Pay OFF = zero clicks, missing Terms stops before Place order, card-details page stops before any click). No change to scroll-then-click, the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.2.2 — 2026-11-21. Fixed the mouse-click error that stopped Buy Now from working on a real page: the button was found and the price guard passed, but the click never happened — "Failed to construct 'MouseEvent': Failed to read the 'view' property from 'UIEventInit': Failed to convert value to 'Window'." Cause: the bot passed `view: window` to `new MouseEvent(...)`, but inside Tampermonkey the script's `window` is a sandbox proxy, not the page's real Window, so the constructor rejects it. `view` is optional (it defaults to null and no click handler reads it), so it is simply not passed anymore, with a legacy createEvent / initMouseEvent fallback if the modern constructor ever throws. A click failure is now also logged plainly ("Buy Now click FAILED … will retry on the next tick") instead of hiding behind "continuing with API checks", and the loop retries the DOM click on the next tick while the button is still available. Harness 180/180 (11 new checks in section 15, including a sandbox-mimicking MouseEvent test that reproduces the exact live error). No change to scroll-then-click, the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.2.1 — 2026-11-21. The Buy Now click now scrolls FIRST and only then clicks: the old code scrolled smooth and read the button position after a fixed 200–600 ms, but on a long product page the smooth scroll was still running, so the click used a stale position and "did nothing" on a real page. Now the bot scrolls instantly, waits for the scroll + layout to settle, re-reads the position, checks the button is really visible and not covered, and only then moves the mouse (random curved path, random point) and clicks — a covered / off-screen / disabled button is never clicked blind. The panel is now draggable by its header and resizable from the bottom-right corner (same as the Microsoft bot: width 20–60%, height 25–90% of the window, position/size saved and restored; double-click the header to reset). Every panel button was audited and behaviorally tested — Start, Stop (now also clears a PAUSED state), Test dry-run, Add product, Remove (✕) per product, Auto-Pay checkbox — all work. Harness 169/169. No change to the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.2.0 — 2026-11-21. Any product can be watched now, not just ships: the panel has an "Add any product" form (paste any RSI store product URL, set a max price — no code editing), with a Remove button per product. Entries carry an optional store-list ID (ships: 72 = Standalone Ships): with one, the bot also checks the product by API from any page; without one, the product is "page only" — the bot watches its Buy Now button, so its page must stay open in a tab. The DOM Buy Now path now also respects the max price (page price above the cap does not click), and a product NOT in the watchlist never clicks. Kraken is still the default entry; harness 114/114. No change to API-only stock checks, human-like click, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.1.2 — 2026-11-21. Fixed Start Monitor → Buy Now never firing for "Name - 10 Year" ships: the page check turned "PTV - 10 Year" into "ptv---10-year", which the real ".../PTV-10-Year" page URL never contains, so the bot never recognised the page and never clicked Buy Now (this also blocked testing with the in-stock PTV/Meteor). Page matching now slugifies the name and the URL the same way, and also matches the watchlist entry's own URL. Kraken (single word) worked before and still does. No change to the watchlist, API stock check, or Auto-Pay default OFF.

v1.1.1 — 2026-11-21. Fixed false-positive CAPTCHA pause: the bot only pauses when a CAPTCHA challenge is actually visible (visible checkbox / image challenge / hCaptcha / Turnstile, not the reCAPTCHA corner badge). Before this fix, the word "captcha" in the page text ("protected by reCAPTCHA" on every RSI page) paused the bot the second Start was pressed, with no challenge on screen. A real CAPTCHA / queue still pauses + alarms. No change to the watchlist, API stock check, or Auto-Pay default OFF.

v1.1.0 — 2026-11-21. Human-like Buy Now click (random curved mouse path, random point/timing).
