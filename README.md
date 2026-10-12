# Quote Lens — Profit Is Not Cash

**Interactive Prototype — Fictional Scenarios**

An interactive business decision prototype that separates project profitability, cash exposure, and break-even resilience.
一個互動式商業決策原型，讓你同時看見專案獲利、資金缺口與損益兩平緩衝。

- Live demo: https://apchen1978.github.io/quote-lens-demo/ (中文 / English: add `?lang=en`)
- Part of [Paul's Tradecraft](https://paulstradecraft.com/)

## What it shows

One fixed-price quote, in two fictional scenarios (a project-based service business, and a local curtain / soft-furnishing order):

- **Estimated profit**: revenue, direct costs, estimated financing cost and profit, kept separate.
- **Maximum cash gap**: the lowest point of the project's cumulative cash, and the day it happens.
- **Break-even cushion**: how far the main cost driver can overrun before profit reaches zero.
- **Profit sensitivity**: which illustrative shock changes estimated profit the most.
- A Before / After comparison, reset and undo, and a link that restores the exact same settings.

## What it is not

- All default scenarios and figures are **fictional**. No real client, company or quotation is used.
- Results are **model-based estimates**, not financial advice and not validated quotations.
- **Profit and cash exposure are different concepts.** A profitable project can still need cash up front.
- The maximum cash gap is a **single-project model** (fully allocated costs, no opening cash or other business expenses). It does not describe a company's actual liquidity.
- Commercial usefulness has **not yet been validated with real users**. Missing inputs stay `UNKNOWN`; nothing is guessed.

## Run it locally

No build step, no network calls, nothing is stored. Open `index.html` in a browser, or serve the folder with any static server.

## Files

`index.html`, `styles.css`, `app.js` (interface) · `i18n.js` (Chinese / English text) · `model.js` (calculations) · `scenarios.js` (the two fictional scenarios)
