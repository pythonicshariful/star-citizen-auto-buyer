# Research notes — RSI pledge store (live, 2026-11-21)

All findings below were verified live from the public store on 2026-11-21.
No login was used for the API probes. No purchase was made.

## 1. The Kraken right now

| Fact | Evidence |
|---|---|
| Pledge page | https://robertsspaceindustries.com/en/pledge/ships/drake-kraken/Kraken |
| Price on page (standard) | **$1,650.00** (JSON-LD `Product.offers.price`) — the buyer quoted **$1,400 Warbond**; Warbond is the cheaper variant, standard is $1,650 |
| Availability on page | **OutOfStock** (JSON-LD `schema.org/OutOfStock`), checked 2026-11-21 ~07:02 UTC |
| IAE Expo 2956 | Live until Nov 27, 2026 (banner on the page) — this is the sale window the buyer means by "end of next week" |

## 2. How the store actually works (from its own JavaScript)

- The store is a JavaScript single-page app. The static HTML has **no**
  add-to-cart button and no stock info except the JSON-LD block — all
  product data is loaded by JavaScript after the page loads.
- Client bundle: `https://static.robertsspaceindustries.com/plt-client/plt-client.es.js`
  loads `./assets/main-Dp9lUL8D.js` (3.7 MB, app version 9.622.3).
- The store talks to the RSI server with **GraphQL at
  `POST https://robertsspaceindustries.com/graphql`** (Apollo HttpLink,
  `uri: '/graphql'`). There is also a `/graphql/v2` endpoint in the bundle.
- The page carries `window.__RSI_STORE_V2__` and router params. The Kraken
  pledge page's router params are:
  `productsId: {ship_id: 72, ship_upgrade_id: 241, ship_package_id: 45, paint_id: 268, packs: 270}`
  — these are **store list ids**, not the ship itself.

## 3. The stock API (verified live, unauthenticated, ~0.5–1.2 s per call)

**Stock check — `GetProductWithSkusPrice`:**
```graphql
query GetProductWithSkusPrice($query: SearchQuery!, $storeFront: String = "pledge") {
  store(name: $storeFront, browse: true) {
    search(query: $query) {
      count
      resources {
        id title name
        ... on TyProduct {
          slug type
          stock { unlimited show available backOrder qty backOrderQty level }
          skus {
            id slug title isWarbond
            stock { unlimited show available backOrder qty backOrderQty level }
            price { amount discounted }
          }
        }
      }
    }
  }
}
# variables: {"query": {"products": {"ids": ["72"]}, "limit": 1000}, "storeFront": "pledge"}
```
Stock model (`TyStock`): `available` (boolean — the trigger),
`unlimited`, `show`, `backOrder`, `qty`, `backOrderQty`, `level`
(`high` / `low` / `none`). Prices are in **cents** (`amount: 140000` = $1,400).

**What the list ids mean (verified):**
- `72` = "Standalone Ships" — the list the Kraken lives in when listed.
- `45` = "Package" (game packages), `268` = "Paints", `270` = "Packs".

**Live results, 2026-11-21 07:02 UTC** (see `test/live-test-2026-11-21.json`):
- Product 72: **213 SKUs, 209 in stock, 0 Kraken SKUs** — the Kraken is
  **not listed at all while out of stock**. Its SKU appears in this list
  when a wave goes live; that appearance is the bot's trigger.
- In-stock proof: **PTV - 10 Year, SKU 17209, $15.00, available=true**;
  **Star Citizen First Flight Pack, SKU 19607, $60.00, available=true**.
- Negative control: Pioneer - 10 Year Warbond $825 / standard $925,
  both `available=false`, `level=none`.
- Warbond vs standard: same title, two SKUs — Warbond is cheaper
  (Pioneer $825 vs $925; Galaxy $360 vs $400). Kraken Warbond $1,400 vs
  standard $1,650 fits the same pattern.

**Dead ends (documented so nobody re-tries them):**
- `products.slugs: ["kraken"]` → `ErrValidationFailed: query:products:slugs is not valid`
  (slugs are opaque codes like `6gnx24xe9xqa9`, not display names).
- `products.keywords: "Kraken"/"Aurora"` → `count: 0` (keywords is not a text search).
- `skus.shipSlugs: ["kraken"]` / `skus.keywords` → internal server error / count 0.
- `GetShip` with `ships.name: "Kraken"` works (ids 170 Kraken, 175 Kraken
  Privateer) but that id does **not** join to SKUs — do not use it for stock.

## 4. Add-to-cart + checkout (from the same bundle — NOT live-proven)

- Add to cart: mutation `AddCartMultiItemMutation`, input `CartAddInput
  { skuId: ID!, qty: Int }` → `store.cart.mutations.addMany`.
- Checkout steps: mutation `NextStepMutation` (`cart.mutations.flow.moveNext`),
  `SetStepMutation` (`flow.moveTo(step)`), `CartValidateCartMutation`
  (`mutations.validate(mark, token, isGift)` — the `token` is a
  **reCAPTCHA Enterprise** token; the site loads
  `recaptcha.net/recaptcha/enterprise.js`, key `6LerBOgU…`).
- Cart page: `https://robertsspaceindustries.com/store/pledge/cart`
  (also `/store/order` for the order). Payment providers in the bundle:
  Stripe, Adyen, PayPal, Amazon Pay, KakaoPay, WeChat Pay.
- **Unproven:** add-to-cart and every checkout step need a logged-in
  session (browser cookies). They were **not** executed from this VM —
  doing so would touch a real account/cart. They must be tested in a real
  browser logged in as the test account (handle QPPQMPMR9X) with a cheap
  in-stock item, stopping before payment.

## 5. Anti-bot behaviour (RSI's own words + observed)

- RSI support: *"We do monitor for bots and scripted activity on the
  back-end and block when it is happening, as well as limiting the stock
  of these ships to one per account"* — and *"Only a fully completed
  order will secure the ship."*
  (https://support.robertsspaceindustries.com/hc/en-us/articles/360059709013)
- Out-of-stock limited pledges show red **"Sold out"** text.
- Observed 2026-11-21: no CAPTCHA and no Cloudflare challenge on the
  home/pledge pages for anonymous browsing; a text CAPTCHA **did**
  appear during account creation (Enlist) and had to be solved by the
  user. reCAPTCHA Enterprise is loaded on store pages.
- Consequence for this bot: API polling only (8–15 s, randomised,
  back-off on errors/429), one-per-account limit respected (qty 1),
  pause + alert on any CAPTCHA/queue/verify screen, never auto-solve.
  Even so, RSI can still block it — no guarantee is possible.

## 6. Test account (Shariful's own — testing only)

- Handle **QPPQMPMR9X**, rank Civilian, Google-linked to
  pythonicshariful@gmail.com, created 2026-11-21. Store Credit $0,
  UEC 0, REC 0. Never the buyer's account; never used for a real purchase.
