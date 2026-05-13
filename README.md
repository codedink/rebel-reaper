# Rebel Reaper Clothing Co — Storefront

Premium moto, hardcore-music, and traditional-tattoo apparel.
Live demo storefront with full e-commerce UX.

## Live preview

Once GitHub Pages is enabled this site is served from the repo root.
Set up at: **Settings → Pages → Source: `main` branch / `/ (root)`**

## What's in here

- **154 product detail pages** sourced from Square Online's catalog API
- **15 category pages** (Tees, Vests, Jackets, Gloves, Sunglasses, etc.)
- **Cart, checkout, account, wishlist, search** — all client-side, persists in `localStorage`
- **Admin / CMS** at `/admin.html` — edit/add/remove products, edit site copy, view orders
- **AI assistant** — "The Reaper" chibi mascot, bottom-right of every page
  - Outfit Builder (kit-of-4 with one-click bundle add)
  - Side-by-side product compare
  - Smart fallback search with synonym matching
  - Use-case kits (long ride, daily, track)
- **Reviews** on every PDP — 7–16 per product, deterministically generated
- **Size guide** modal per product with real size variants from Square API
- **Sale treatment** — 36 products on sale, Vans-style strikethrough + red price, savings shown in cart
- **Mega menu** on the main nav (Shop hover)
- **Mobile nav drawer** + responsive across all viewports

## Structure

```
/
├── index.html                  # Homepage
├── shop.html                   # Shop all
├── about.html                  # Manifesto
├── cart.html / checkout.html / checkout-success.html
├── signin.html / signup.html
├── account*.html               # Account dashboard, orders, addresses, payment, settings
├── admin*.html                 # CMS / admin
├── wishlist.html / search.html
├── preview-product.html        # Generic preview for admin-created products
├── products/                   # 154 PDPs
├── categories/                 # 15 category pages
├── images/                     # 652 product images
└── assets/
    ├── style.css               # Design system + components
    ├── app.js                  # Cart, wishlist, auth, search, admin, chat
    ├── products.js             # Catalog index (window.RR_PRODUCTS)
    ├── logo-chrome.png         # Brand mark
    ├── hero-brand.jpg          # Homepage hero artwork
    └── noise.svg               # Hero texture
```

## Stack

- Static HTML / vanilla JS / hand-rolled CSS
- No framework, no build step required at deploy time
- Google Fonts (Anton, Inter, Metal Mania, JetBrains Mono) loaded via `<link>`
- Catalog data baked into `assets/products.js`

## Notes

- All commerce state lives in `localStorage` (no backend)
- Payment is mocked — no real charges
- Designed in California · Built for the road
