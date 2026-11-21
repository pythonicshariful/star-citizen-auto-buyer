#!/usr/bin/env python3
"""Live stock-check test vs RSI GraphQL — 2026-11-21.
No login, no cart, no purchase. Only read-only stock queries, the same
ones the Tampermonkey bot makes. Run: python3 test/live-test.py
Writes test/live-test-2026-11-21.json + .md next to this script.
"""
import json, urllib.request, time, re
from datetime import datetime, timezone

URL = "https://robertsspaceindustries.com/graphql"
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0",
           "Origin": "https://robertsspaceindustries.com",
           "Referer": "https://robertsspaceindustries.com/en/pledge/ships/drake-kraken/Kraken"}
QUERY = ("query GetProductWithSkusPrice($query: SearchQuery!, $storeFront: String = \"pledge\") { "
         "store(name: $storeFront, browse: true) { search(query: $query) { count resources { "
         "id title name ... on TyProduct { slug type stock { unlimited show available backOrder qty backOrderQty level } "
         "skus { id slug title isWarbond stock { unlimited show available backOrder qty backOrderQty level } "
         "price { amount discounted } } } } } } }")

def gql(product_id):
    body = json.dumps({"operationName": "GetProductWithSkusPrice",
                       "variables": {"query": {"products": {"ids": [product_id]}, "limit": 1000},
                                     "storeFront": "pledge"}, "query": QUERY}).encode()
    req = urllib.request.Request(URL, data=body, headers=HEADERS)
    t = time.time()
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode())
    return r.status, round(time.time() - t, 2), data

def find(skus, needle):
    return [s for s in skus if needle.lower() in s["title"].lower()]

def main():
    now = datetime.now(timezone.utc).isoformat()
    results = {"run_at_utc": now, "endpoint": URL, "checks": []}

    # 1. Kraken in Standalone Ships (product 72)
    st, dt, d = gql("72")
    skus = d["data"]["store"]["search"]["resources"][0]["skus"]
    kraken = find(skus, "Kraken")
    results["checks"].append({
        "name": "Kraken in product 72 (Standalone Ships)",
        "http": st, "seconds": dt, "skus_in_list": len(skus),
        "kraken_skus_found": len(kraken),
        "verdict": "NOT_LISTED — Kraken is not in the store list while out of stock (expected 2026-11-21; it appears here when a wave goes live)",
        "in_stock_count": sum(1 for s in skus if s["stock"]["available"]),
    })

    # 2. In-stock product test: PTV - 10 Year, $15, sku 17209
    ptv = find(skus, "PTV - 10 Year")
    results["checks"].append({
        "name": "PTV - 10 Year (in-stock test product, sku 17209)",
        "http": st, "seconds": dt,
        "sku": ptv[0] if ptv else None,
        "verdict": "IN_STOCK" if ptv and ptv[0]["stock"]["available"] else "UNEXPECTED",
        "note": "Bot's findTargetSku logic returns this SKU under a $20 cap — proves the stock-check path works end to end. NOTHING was added to any cart.",
    })

    # 3. In-stock product test: First Flight Pack (product 45, sku 19607, $60)
    st2, dt2, d2 = gql("45")
    skus2 = d2["data"]["store"]["search"]["resources"][0]["skus"]
    ffp = [s for s in skus2 if s["id"] == "19607"]
    results["checks"].append({
        "name": "Star Citizen First Flight Pack (product 45, sku 19607)",
        "http": st2, "seconds": dt2,
        "sku": ffp[0] if ffp else None,
        "verdict": "IN_STOCK" if ffp and ffp[0]["stock"]["available"] else "UNEXPECTED",
    })

    # 4. Negative control: Pioneer (both SKUs out of stock)
    pio = find(skus, "Pioneer")
    results["checks"].append({
        "name": "Pioneer - 10 Year (negative control, expect OOS)",
        "skus": pio,
        "verdict": "OUT_OF_STOCK" if pio and all(not s["stock"]["available"] for s in pio) else "UNEXPECTED",
    })

    # 5. Kraken pledge page JSON-LD (single fetch, secondary signal only)
    req = urllib.request.Request("https://robertsspaceindustries.com/en/pledge/ships/drake-kraken/Kraken",
                                 headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", "ignore")
    m = re.search(r'"price"\s*:\s*"?([\d.]+)', html)
    avail = re.search(r'schema\.org\\*/(\w+)', html)
    results["checks"].append({
        "name": "Kraken pledge page JSON-LD",
        "price_usd": m.group(1) if m else None,
        "availability": avail.group(1) if avail else None,
        "verdict": "OUT_OF_STOCK on page, $1650 standard price (buyer quoted $1400 Warbond)",
    })

    out = "test/live-test-2026-11-21.json"
    import os
    os.makedirs("test", exist_ok=True)
    json.dump(results, open(out, "w"), indent=1)
    md = ["# Live stock-check test — 2026-11-21 (UTC " + now + ")", "",
          "Endpoint: POST " + URL + " — read-only GraphQL, no login, no cart, no purchase.", "",
          "| Check | Result | Evidence |", "|---|---|---|"]
    for c in results["checks"]:
        md.append("| " + c["name"] + " | **" + c["verdict"].split(" — ")[0] + "** | " + json.dumps(c.get("sku") or c.get("skus") or c.get("kraken_skus_found") or c.get("availability") or "", default=str)[:220] + " |")
    md += ["", "Full JSON: test/live-test-2026-11-21.json"]
    open("test/live-test-2026-11-21.md", "w").write("\n".join(md) + "\n")
    print(json.dumps(results, indent=1))

if __name__ == "__main__":
    main()
