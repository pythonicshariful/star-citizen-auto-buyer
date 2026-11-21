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
   card details.
4. **Stops for CAPTCHAs and queues.** If RSI shows a CAPTCHA, a queue
   or a "verify you are human" screen, the bot pauses, sounds an alarm
   and waits for you. It never tries to solve a CAPTCHA by itself.

## Install (5 minutes)

1. Install the **Tampermonkey** extension in Chrome, Edge or Firefox
   (from your browser's extension store — search "Tampermonkey").
2. Open `star-citizen-auto-buyer.user.js` from this repo and click
   **Raw** (or drag the file into your browser). Tampermonkey will ask
   to install it — click **Install**.
3. Log in to https://robertsspaceindustries.com with **your own**
   RSI account, then open any RSI pledge page. A dark panel
   **"🚀 SC Auto Buyer"** appears at the top-right.

## Set up your ship

The bot already watches the **Kraken, max $1,400, Warbond first**.
To watch a different ship, edit the top of the script (the `watchlist`):

```js
watchlist: [
  {
    name: 'Kraken',            // exact ship name as shown on RSI
    url: 'https://robertsspaceindustries.com/en/pledge/ships/drake-kraken/Kraken',
    productId: '72',           // "72" = Standalone Ships — keep this
    maxPrice: 1400,            // USD — the bot NEVER buys above this
    preferWarbond: true,       // pick the cheaper Warbond version first
    qty: 1,                    // limited ships are 1 per account
  },
],
```

Add more ships by adding more entries. Save the file and Tampermonkey
reloads it.

## Test it first — with an in-stock ship (no purchase)

Do this before any real release, so you know it works:

1. Temporarily add an in-stock ship to the watchlist, for example
   **PTV - 10 Year** ($15) — or just use the panel's test button.
2. Click **"🔍 Test stock check now (no purchase)"** in the panel.
3. You should see `TEST PTV - 10 Year: in_stock` in the log — and
   **nothing is added to your cart**. That proves the stock check works.
4. Remove the test ship, then click **▶ Start monitoring** before
   the release wave.

## On release day

1. Log in to RSI in the browser with the bot installed.
2. Open the Kraken pledge page and click **▶ Start monitoring**.
3. Leave the tab open. When the Kraken appears, the bot adds it to
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

## What is proven / not proven (v1.0.0, 2026-11-21)

| | Status |
|---|---|
| Stock check via RSI's own GraphQL API | ✅ Proven live — Kraken correctly shows "not listed" while out of stock; PTV ($15) and First Flight Pack ($60) correctly show in stock; Pioneer correctly shows out of stock |
| Picking the Warbond version under the max price | ✅ Proven — 40/40 automated tests (`node test/test-harness.js`) |
| No page-refresh polling | ✅ Proven — the script contains no page refresh; only API calls |
| Add-to-cart + checkout steps | ⚠️ Built from RSI's own store code, **not yet proven live** — needs a test in a real logged-in browser with a cheap in-stock item, stopping before payment |
| Buying a Kraken in a real wave | ❌ Not proven — no wave was live during testing, and no real purchase was made |

Test evidence: `test/live-test-2026-11-21.json` (live API results),
`test/test-harness.js` (40 checks), `RESEARCH.md` (full findings).

## Files

- `star-citizen-auto-buyer.user.js` — the bot (install this)
- `README.md` — this file
- `RESEARCH.md` — how the RSI store works, with evidence
- `test/test-harness.js` — automated tests (run: `node test/test-harness.js`)
- `test/live-test.py` — live API test (run: `python3 test/live-test.py`)
- `test/fixtures/` — real + synthetic API responses used by the tests

## Version

v1.0.0 — 2026-11-21. Built for Fiverr order FO42A585D35C8 (superdrol).
