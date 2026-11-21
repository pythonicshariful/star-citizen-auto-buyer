# Star Citizen Auto Buyer — RSI Pledge Store Bot (Tampermonkey)

A browser bot that watches the Star Citizen pledge store and buys a
limited ship the moment it comes back in stock — for example the
**Drake Kraken** ($1,400 Warbond / $1,650 standard).

> ⚠️ **No purchase is guaranteed.** Limited ships sell out in seconds,
> RSI monitors for bots and blocks scripted activity, and each account
> is limited to one limited ship. This bot gives you the fastest fair
> chance it can — it cannot promise a ship.

## What it does

1. **Watches without refreshing the page.** It asks RSI's own store API
   (the same check the RSI website itself makes) every 8–15 seconds
   whether your ship is in stock. Refreshing the page over and over is
   what gets bots detected — this bot never does that.
2. **Buys the right version.** If a cheaper Warbond version is in stock
   (Kraken Warbond $1,400 instead of standard $1,650) it picks that one.
   It never buys above the max price you set.
3. **Adds it to your cart and walks through checkout** — but it **stops
   at the payment step** unless you switch Auto-Pay on. It never types
   card details. On the express checkout page, with Auto-Pay ON, it
   walks the final steps itself (v1.3.0): clicks **"Jump to bottom"**,
   checks the **Terms of Service** box, then clicks **"Place order"**.
   With Auto-Pay OFF it clicks none of those — it stops at the
   checkout page and waits for you.
4. **Clicks Buy Now like a human (v1.1.0).** When a Buy Now button
   shows up, it scrolls it into view, moves the mouse to a random
   point inside the button on a random curved path (random steps and
   timing, random hover pause), then clicks. It never does an instant
   `el.click()` straight to the centre. Honest limit: Tampermonkey
   clicks are synthetic (`isTrusted=false`), so a site checking that
   flag can still tell — the random path only removes the obvious
   instant-jump signal.
5. **Stops for CAPTCHAs and queues.** If RSI shows a real CAPTCHA
   challenge, a queue or a "verify you are human" screen, the bot
   pauses, sounds an alarm and waits for you. It never tries to solve
   a CAPTCHA by itself. (v1.1.1: it only pauses when a challenge is
   actually visible — the small "protected by reCAPTCHA" badge that
   sits on every normal RSI page no longer pauses the bot.)
6. **Any product, not just ships (v1.2.0).** Add any RSI store
   product — a ship, a package, a vehicle — from the panel, no code
   editing. Each product has its own max price, and the bot never
   buys above it.

## Install (5 minutes)

1. Install the **Tampermonkey** extension in Chrome, Edge or Firefox
   (from your browser's extension store — search "Tampermonkey").
2. Open `star-citizen-auto-buyer.user.js` from this repo and click
   **Raw** (or drag the file into your browser). Tampermonkey will ask
   to install it — click **Install**.
3. Log in to https://robertsspaceindustries.com with **your own**
   RSI account, then open any RSI pledge page. A dark panel
   **"🚀 SC Auto Buyer"** appears at the top-right.

## How to add any product (v1.2.0)

The bot already watches the **Kraken, max $1,400, Warbond first**.
To watch any other product — a ship, a package, a vehicle — add it
from the panel. No code editing:

1. Open any RSI page. The dark panel **"🚀 SC Auto Buyer"** is at
   the top-right.
2. Under **"➕ Add any product"**, paste the product's URL — copy it
   from the address bar on the product's own page (for example
   `.../en/pledge/Packages/Star-Citizen-First-Flight-Pack`).
3. The **name fills in by itself** from the URL. Change it if you
   want.
4. **Max price $** — the bot NEVER buys above this. Type the most
   you will pay.
5. **List ID** — optional. Ships use `72` (Standalone Ships). With a
   list ID, the bot also checks the product by API from any RSI page.
   **Leave it empty if you don't know it** — the product is then
   "page only": the bot can only see its Buy Now button, so keep
   that product's page open in a tab while monitoring.
6. Tick **"Prefer Warbond"** only for ships that have a cheaper
   Warbond version.
7. Click **Add product**. It appears in the list above. Remove any
   product with the red **✕** next to it.

The watchlist is saved in your browser (Tampermonkey storage), so
it stays there after you close the tab.

## Test it first — with an in-stock ship (no purchase)

Do this before any real release, so you know it works:

1. Add an in-stock ship to the watchlist from the panel, for
   example **PTV - 10 Year** ($15, list `72`) — or just use the
   panel's test button.
2. Click **"🔍 Test stock check now (no purchase)"** in the panel.
3. You should see `TEST PTV - 10 Year: in_stock` in the log — and
   **nothing is added to your cart**. That proves the stock check works.
4. To see the Buy Now click itself: keep the test product in the
   watchlist, open **that product's own page** (for example the PTV
   page), and click **▶ Start monitoring**. The bot should click
   Buy Now and take you to the cart — then it stops at payment
   (Auto-Pay is OFF), so nothing is bought. If it doesn't click,
   check the panel log: it says what happened on each check.
   A package works the same way: add **First Flight Pack** ($60, no
   list ID needed — it is "page only"), open its page, press Start.
5. Remove the test product, then click **▶ Start monitoring** before
   the release wave.

## On release day

1. Log in to RSI in the browser with the bot installed.
2. Open the product's own page (for the Kraken, its pledge page)
   and click **▶ Start monitoring**. For a "page only" product (no
   list ID), this page must stay open — the bot watches its Buy Now
   button there.
3. Leave the tab open. When the product appears, the bot adds it to
   your cart, moves through checkout and **stops at payment** (unless
   you switched Auto-Pay on) — you pay yourself, fast.
4. If a CAPTCHA or queue appears, the bot pauses and alarms — solve it
   yourself, then press Start again.

## Safety notes

- **Auto-Pay is OFF by default.** The bot stops at the payment step
  and waits for you. Only switch it on if you understand it may click
  Place Order with a payment method you already saved on RSI.
- The bot never asks for your password or card details, and never
  sends your data anywhere — it only talks to robertsspaceindustries.com.
- One ship per account, one quantity — RSI's own limit.
- Keep the poll speed as set (8–15 seconds). Faster checking looks
  more like a bot and can get the account blocked.

## What is proven / not proven (v1.3.0, 2026-11-21)

| | Status |
|---|---|
| Stock check via RSI's own GraphQL API | ✅ Proven live — Kraken correctly shows "not listed" while out of stock; PTV ($15) and First Flight Pack ($60) correctly show in stock; Pioneer correctly shows out of stock |
| Picking the Warbond version under the max price | ✅ Proven — 180/180 automated tests (`node test/test-harness.js`) |
| Add any product from the panel (ship / package / vehicle) | ✅ Proven in harness — URL + max price validated, name read from the URL, list ID optional; a product NOT in the watchlist never clicks. **Not live-proven in a real browser yet** |
| Page-only products (no list ID) | ✅ Proven in harness — API check skipped, DOM Buy Now path watches the product's own page; the page must stay open. **Not live-proven in a real browser yet** |
| Max price respected on the Buy Now click too | ✅ Proven in harness — page price above the cap does NOT click |
| CAPTCHA pause only on a real visible challenge | ✅ Fixed in v1.1.1 — a normal RSI page (reCAPTCHA badge text in the page, badge iframe in the DOM) no longer pauses the bot on Start; a genuinely visible challenge (checkbox / image challenge / hCaptcha) still pauses + alarms. Regression-tested |
| Start Monitor → Buy Now on a watched in-stock page | ✅ Fixed in v1.1.2 (page matching), v1.2.1 (scroll-then-click) and v1.2.2 (MouseEvent fix, below) — the DOM Buy Now click never fired for any "Name - 10 Year" ship, the click used a stale position while the smooth scroll was still running, and then the mouse event itself failed to build inside Tampermonkey ("Failed to construct 'MouseEvent' … 'view' … 'Window'") so nothing was clicked even with the button found and the price under max. Regression-tested (PTV, Meteor, Kraken, First Flight Pack pages; sandbox-mimicking MouseEvent test). **Still needs a real-browser check:** open the test product's own page, press Start, and watch it click Buy Now and go to the cart (it stops at payment — Auto-Pay OFF) |
| No page-refresh polling | ✅ Proven — the script contains no page refresh; only API calls |
| Human-like Buy Now click (random curved mouse path) | ✅ Proven in harness (227 checks) — the bot scrolls the button into view FIRST, waits for the scroll/layout to settle, re-reads the position, checks the button is really visible and not covered, then random point, curved path, random hover/hold timings; a covered / off-screen / disabled button is NOT clicked. **v1.2.2:** the mouse events are now built without a `view` property, so they construct inside the Tampermonkey sandbox (the old `view: window` threw "Failed to construct 'MouseEvent'" on a real page and nothing was clicked). **Not live-proven on a real Buy Now button yet**. Note: synthetic clicks are `isTrusted=false`; only a real mouse / CDP mouse makes a truly trusted click |
| Express checkout walk — Jump to bottom → Terms → Place order (v1.3.0) | ✅ Proven in harness — the three steps run in order on the express checkout page, matched by button text ("Jump to bottom") and `data-testid` (Terms checkbox, Place order); the Terms checkbox is never matched by its React id, is clicked via its label, and is verified checked afterwards; a failed step stops the walk and Place order is never attempted; Auto-Pay OFF means zero checkout clicks; a page asking for card details stops the walk (the bot never types card details). **Not live-proven on a real express checkout page yet** — needs a test in a real logged-in browser with a cheap in-stock item, Auto-Pay ON, stopping to check the confirmation |
| Panel draggable + resizable | ✅ Proven in harness — drag the header to move, drag the bottom-right corner to resize (width 20–60%, height 25–90% of the window, same as the Microsoft bot); position/size save in Tampermonkey storage and restore on every page; double-click the header to reset. **Not live-proven in a real browser yet** |
| Every panel button works | ✅ Proven in harness (fake-browser test) — Start starts monitoring, Stop stops it (and clears a PAUSED state), Test runs a dry-run check, Add product adds + rejects duplicates, Remove (✕) removes that product, Auto-Pay checkbox flips the setting. **Not live-proven in a real browser yet** |
| Add-to-cart + checkout steps | ⚠️ Built from RSI's own store code, **not yet proven live** — needs a test in a real logged-in browser with a cheap in-stock item, stopping before payment |
| Buying a Kraken in a real wave | ❌ Not proven — no wave was live during testing, and no real purchase was made |

Test evidence: `test/live-test-2026-11-21.json` (live API results),
`test/test-harness.js` (227 checks), `RESEARCH.md` (full findings).

## Files

- `star-citizen-auto-buyer.user.js` — the bot (install this)
- `README.md` — this file
- `RESEARCH.md` — how the RSI store works, with evidence
- `test/test-harness.js` — automated tests (run: `node test/test-harness.js`)
- `test/live-test.py` — live API test (run: `python3 test/live-test.py`)
- `test/fixtures/` — real + synthetic API responses used by the tests

## Version

v1.3.0 — 2026-11-21. Express-checkout walk: on the express checkout page (`.../store/pledge/express-checkout`) the bot now walks the final three steps in order, ONLY when Auto-Pay is ON in the panel (Auto-Pay stays OFF by default): (1) click "Jump to bottom" — matched by its button TEXT, never by class or data-cy-id alone (other buttons share those); (2) check the Terms of Service box — matched by `data-testid="express-terms-checkbox"`, NEVER by its id (React generates a new id on every render), clicked via its label so the React handler fires, and verified checked afterwards (already-checked skips the click); (3) click "Place order" — matched by `data-testid="express-card-form-submit"`. Each step re-finds its element after a short settle wait and checks it is visible and clickable before the human-like click (scroll-then-click, random curved path, v1.2.2 MouseEvent construction); if any step fails the walk STOPS there and later steps are never attempted. When Auto-Pay is OFF the bot clicks NONE of the three — it stops at the checkout page with an alarm, exactly as before (and turning Auto-Pay ON while on the page runs the walk). The bot NEVER types card details or CVV: if the page shows a payment form that still needs card details, the walk stops and alarms instead. The panel Auto-Pay label now says plainly that ON means the bot places the order itself. Harness 227/227 (47 new checks in section 16, including a fake-browser end-to-end walk: happy path in order, already-checked Terms, Auto-Pay OFF = zero clicks, missing Terms stops before Place order, card-details page stops before any click). No change to scroll-then-click, the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.2.2 — 2026-11-21. Fixed the mouse-click error that stopped Buy Now from working on a real page: the button was found and the price guard passed, but the click never happened — "Failed to construct 'MouseEvent': Failed to read the 'view' property from 'UIEventInit': Failed to convert value to 'Window'." Cause: the bot passed `view: window` to `new MouseEvent(...)`, but inside Tampermonkey the script's `window` is a sandbox proxy, not the page's real Window, so the constructor rejects it. `view` is optional (it defaults to null and no click handler reads it), so it is simply not passed anymore, with a legacy createEvent / initMouseEvent fallback if the modern constructor ever throws. A click failure is now also logged plainly ("Buy Now click FAILED … will retry on the next tick") instead of hiding behind "continuing with API checks", and the loop retries the DOM click on the next tick while the button is still available. Harness 180/180 (11 new checks in section 15, including a sandbox-mimicking MouseEvent test that reproduces the exact live error). No change to scroll-then-click, the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.2.1 — 2026-11-21. The Buy Now click now scrolls FIRST and only then clicks: the old code scrolled smooth and read the button position after a fixed 200–600 ms, but on a long product page the smooth scroll was still running, so the click used a stale position and "did nothing" on a real page. Now the bot scrolls instantly, waits for the scroll + layout to settle, re-reads the position, checks the button is really visible and not covered, and only then moves the mouse (random curved path, random point) and clicks — a covered / off-screen / disabled button is never clicked blind. The panel is now draggable by its header and resizable from the bottom-right corner (same as the Microsoft bot: width 20–60%, height 25–90% of the window, position/size saved and restored; double-click the header to reset). Every panel button was audited and behaviorally tested — Start, Stop (now also clears a PAUSED state), Test dry-run, Add product, Remove (✕) per product, Auto-Pay checkbox — all work. Harness 169/169. No change to the any-product watchlist, API-only stock checks, max-price guard, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.2.0 — 2026-11-21. Any product can be watched now, not just ships: the panel has an "Add any product" form (paste any RSI store product URL, set a max price — no code editing), with a Remove button per product. Entries carry an optional store-list ID (ships: 72 = Standalone Ships): with one, the bot also checks the product by API from any page; without one, the product is "page only" — the bot watches its Buy Now button, so its page must stay open in a tab. The DOM Buy Now path now also respects the max price (page price above the cap does not click), and a product NOT in the watchlist never clicks. Kraken is still the default entry; harness 114/114. No change to API-only stock checks, human-like click, CAPTCHA pause on visible challenges only, or Auto-Pay default OFF.

v1.1.2 — 2026-11-21. Fixed Start Monitor → Buy Now never firing for "Name - 10 Year" ships: the page check turned "PTV - 10 Year" into "ptv---10-year", which the real ".../PTV-10-Year" page URL never contains, so the bot never recognised the page and never clicked Buy Now (this also blocked testing with the in-stock PTV/Meteor). Page matching now slugifies the name and the URL the same way, and also matches the watchlist entry's own URL. Kraken (single word) worked before and still does. No change to the watchlist, API stock check, or Auto-Pay default OFF.

v1.1.1 — 2026-11-21. Fixed false-positive CAPTCHA pause: the bot only pauses when a CAPTCHA challenge is actually visible (visible checkbox / image challenge / hCaptcha / Turnstile, not the reCAPTCHA corner badge). Before this fix, the word "captcha" in the page text ("protected by reCAPTCHA" on every RSI page) paused the bot the second Start was pressed, with no challenge on screen. A real CAPTCHA / queue still pauses + alarms. No change to the watchlist, API stock check, or Auto-Pay default OFF.

v1.1.0 — 2026-11-21. Human-like Buy Now click (random curved mouse path, random point/timing). Built for Fiverr order FO42A585D35C8 (superdrol).
