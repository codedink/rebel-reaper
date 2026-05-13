/* Rebel Reaper — client-side commerce engine
 * All data persisted in localStorage. Mock auth/checkout (no backend).
 */
(function () {
  'use strict';

  // ---------- Storage helpers ----------
  const KEYS = {
    cart: 'rr.cart.v1',
    wish: 'rr.wishlist.v1',
    user: 'rr.user.v1',
    orders: 'rr.orders.v1',
    recent: 'rr.recent.v1',
    catalog: 'rr.catalog.v1',     // admin overrides + new products
    content: 'rr.content.v1',     // site content overrides
  };
  const get = (k, fb) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fb; }
    catch { return fb; }
  };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const fmt = (n) => '$' + Number(n || 0).toFixed(2);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ---------- Path resolution (pages live at root or in subfolders) ----------
  const isSubpage = /\/(products|categories)\//.test(location.pathname);
  const root = isSubpage ? '../' : '';

  // ---------- Product index (lazy fetch on demand, with admin overrides) ----------
  let _products = null;
  function applyOverrides(base) {
    const cat = get(KEYS.catalog, { edits: {}, deleted: [], created: [] });
    const result = [];
    for (const p of base) {
      if (cat.deleted.includes(p.id)) continue;
      if (cat.edits[p.id]) {
        result.push(Object.assign({}, p, cat.edits[p.id]));
      } else {
        result.push(p);
      }
    }
    for (const p of cat.created) result.push(p);
    return result;
  }
  async function products() {
    let base;
    if (window.RR_PRODUCTS && Array.isArray(window.RR_PRODUCTS)) {
      base = window.RR_PRODUCTS;
    } else {
      try {
        const res = await fetch(root + 'assets/products.json');
        base = await res.json();
      } catch { base = []; }
    }
    _products = applyOverrides(base);
    return _products;
  }
  function productById(id) {
    if (!_products) return null;
    return _products.find(p => p.id === id);
  }

  // ---------- Cart ----------
  const Cart = {
    items() { return get(KEYS.cart, []); },
    save(items) { set(KEYS.cart, items); render(); },
    count() { return this.items().reduce((n, i) => n + i.qty, 0); },
    subtotal() { return this.items().reduce((n, i) => n + (i.price * i.qty), 0); },
    originalSubtotal() { return this.items().reduce((n, i) => n + ((i.original_price || i.price) * i.qty), 0); },
    savings() { return Math.max(0, this.originalSubtotal() - this.subtotal()); },
    add(product, qty = 1, size = null) {
      const items = this.items();
      const key = product.id + (size ? '|' + size : '');
      const ex = items.find(i => i.key === key);
      if (ex) ex.qty += qty;
      else {
        // The actual price the customer pays (sale price if on sale)
        const payPrice = product.on_sale && product.sale_current
          ? Number(String(product.sale_current).replace(/[^0-9.]/g, '')) || Number(product.price_value || 0)
          : Number(product.price_value || product.price || 0);
        // The original/MSRP price used for the strikethrough display
        const origPrice = product.on_sale && product.sale_original
          ? Number(String(product.sale_original).replace(/[^0-9.]/g, '')) || payPrice
          : payPrice;
        items.push({
          key,
          id: product.id,
          name: product.name,
          price: payPrice,
          priceLabel: product.on_sale && product.sale_current
            ? product.sale_current
            : (product.price || ('$' + payPrice.toFixed(2))),
          original_price: origPrice,
          on_sale: !!product.on_sale,
          image: product.image,
          url: product.url || product.urlPath || '',
          size,
          qty,
        });
      }
      this.save(items);
      this.openDrawer();
    },
    remove(key) {
      this.save(this.items().filter(i => i.key !== key));
    },
    setQty(key, qty) {
      const items = this.items();
      const it = items.find(i => i.key === key);
      if (!it) return;
      it.qty = Math.max(1, qty);
      this.save(items);
    },
    clear() { this.save([]); },
    openDrawer() {
      const dr = $('#cart-drawer');
      if (dr) { dr.classList.add('is-open'); document.body.classList.add('drawer-open'); }
    },
    closeDrawer() {
      const dr = $('#cart-drawer');
      if (dr) { dr.classList.remove('is-open'); document.body.classList.remove('drawer-open'); }
    },
  };

  // ---------- Wishlist ----------
  const Wishlist = {
    ids() { return get(KEYS.wish, []); },
    has(id) { return this.ids().includes(id); },
    toggle(id) {
      const ids = this.ids();
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1); else ids.push(id);
      set(KEYS.wish, ids);
      render();
      return this.has(id);
    },
    save(ids) { set(KEYS.wish, ids); render(); },
  };

  // ---------- Auth (mock) ----------
  const Auth = {
    user() { return get(KEYS.user, null); },
    signIn(email, name) {
      const user = {
        email,
        name: name || email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        joined: new Date().toISOString(),
      };
      set(KEYS.user, user);
      render();
      return user;
    },
    signOut() { localStorage.removeItem(KEYS.user); render(); },
  };

  // ---------- Orders (mock) ----------
  const Orders = {
    list() { return get(KEYS.orders, []); },
    create(order) {
      const orders = this.list();
      orders.unshift(order);
      set(KEYS.orders, orders);
    },
  };

  // ---------- Recently Viewed ----------
  const Recent = {
    ids() { return get(KEYS.recent, []); },
    add(id) {
      const ids = this.ids().filter(x => x !== id);
      ids.unshift(id);
      set(KEYS.recent, ids.slice(0, 8));
    },
  };

  // ---------- Render: header pip, drawer, hearts ----------
  function render() {
    // Cart pip
    $$('.cart-pip').forEach(el => { el.textContent = String(Cart.count()); el.classList.toggle('is-active', Cart.count() > 0); });
    // Account label
    const u = Auth.user();
    $$('[data-account-label]').forEach(el => el.textContent = u ? (u.name.split(' ')[0]) : 'Account');
    $$('[data-account-link]').forEach(a => a.setAttribute('href', root + (u ? 'account.html' : 'signin.html')));
    // Wishlist hearts
    $$('.wishlist-btn').forEach(btn => {
      const id = btn.dataset.id;
      btn.classList.toggle('is-active', Wishlist.has(id));
      btn.setAttribute('aria-pressed', Wishlist.has(id) ? 'true' : 'false');
    });
    // Cart drawer body
    renderCartDrawer();
    // Wishlist count badge if present
    $$('[data-wish-count]').forEach(el => el.textContent = String(Wishlist.ids().length));
  }

  function renderCartDrawer() {
    const list = $('#cart-drawer-items');
    if (!list) return;
    const items = Cart.items();
    const sub = Cart.subtotal();
    const savings = Cart.savings();
    if (items.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <p>Your bag is empty.</p>
          <a class="btn btn--ghost" href="${root}shop.html" onclick="window.RR.cart.closeDrawer()">Start shopping →</a>
        </div>`;
    } else {
      list.innerHTML = items.map(i => {
        const lineTotal = i.price * i.qty;
        const lineOrig = (i.original_price || i.price) * i.qty;
        const showSale = i.on_sale && lineOrig > lineTotal;
        return `
        <div class="line">
          <a class="line__thumb" href="${root}${i.url}" onclick="window.RR.cart.closeDrawer()">
            ${i.image ? `<img src="${root}${i.image}" alt="">` : ''}
          </a>
          <div class="line__body">
            <a class="line__name" href="${root}${i.url}" onclick="window.RR.cart.closeDrawer()">${escapeHtml(i.name)}</a>
            ${i.size ? `<div class="line__opt">Size: ${i.size}</div>` : ''}
            <div class="line__row">
              <div class="qty-mini">
                <button onclick="window.RR.cart.setQty('${i.key}', ${i.qty - 1})" aria-label="Decrease">−</button>
                <span>${i.qty}</span>
                <button onclick="window.RR.cart.setQty('${i.key}', ${i.qty + 1})" aria-label="Increase">+</button>
              </div>
              <button class="link-rm" onclick="window.RR.cart.remove('${i.key}')">Remove</button>
            </div>
          </div>
          <div class="line__price">
            ${showSale ? `<div class="line__price-was">${fmt(lineOrig)}</div>` : ''}
            <div class="${showSale ? 'line__price-now' : ''}">${fmt(lineTotal)}</div>
          </div>
        </div>`;
      }).join('');
    }
    $('#cart-drawer-subtotal').textContent = fmt(sub);
    const saveLine = $('#cart-drawer-savings');
    if (saveLine) {
      if (savings > 0) {
        saveLine.style.display = 'flex';
        saveLine.querySelector('.amt').textContent = fmt(savings);
      } else {
        saveLine.style.display = 'none';
      }
    }
    $('#cart-drawer-checkout').style.display = items.length ? 'inline-flex' : 'none';
    $('#cart-drawer-view').style.display = items.length ? 'inline-flex' : 'none';
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------- Search ----------
  const Search = {
    async run(q) {
      const all = await products();
      const term = (q || '').trim().toLowerCase();
      if (!term) return [];
      const tokens = term.split(/\s+/).filter(Boolean);
      const score = (p) => {
        const hay = (p.name + ' ' + p.category).toLowerCase();
        let s = 0;
        for (const t of tokens) {
          if (hay.includes(t)) s += 1;
          if (p.name.toLowerCase().startsWith(t)) s += 2;
        }
        return s;
      };
      return all
        .map(p => [p, score(p)])
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([p]) => p);
    },
  };

  // ---------- Header overlay (search) ----------
  function bindSearchOverlay() {
    const ov = $('#search-overlay');
    if (!ov) return;
    const open = () => { ov.classList.add('is-open'); document.body.classList.add('drawer-open'); setTimeout(() => $('#search-input').focus(), 50); };
    const close = () => { ov.classList.remove('is-open'); document.body.classList.remove('drawer-open'); };
    $$('[data-action="open-search"]').forEach(b => b.addEventListener('click', open));
    $('#search-close')?.addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const input = $('#search-input');
    const results = $('#search-results');
    let t;
    input?.addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = e.target.value;
        if (!q.trim()) { results.innerHTML = '<div class="muted">Try "vest", "moto gloves", "flannel"…</div>'; return; }
        const out = await Search.run(q);
        if (!out.length) { results.innerHTML = `<div class="muted">No results for "${escapeHtml(q)}"</div>`; return; }
        results.innerHTML = `
          <div class="search-list">
            ${out.slice(0, 8).map(p => `
              <a class="search-item" href="${root}${p.url}">
                <div class="thumb">${p.image ? `<img src="${root}${p.image}" alt="">` : ''}</div>
                <div class="meta">
                  <div class="cat">${escapeHtml(p.category || '')}</div>
                  <div class="name">${escapeHtml(p.name)}</div>
                  <div class="price">${escapeHtml(p.price)}</div>
                </div>
              </a>
            `).join('')}
          </div>
          ${out.length > 8 ? `<a class="search-all" href="${root}search.html?q=${encodeURIComponent(q)}">See all ${out.length} results →</a>` : ''}`;
      }, 80);
    });
    $('#search-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) location.href = root + 'search.html?q=' + encodeURIComponent(q);
    });
  }

  // ---------- Cart drawer wiring ----------
  function bindCartDrawer() {
    $$('[data-action="open-cart"]').forEach(b => b.addEventListener('click', () => Cart.openDrawer()));
    $('#cart-drawer-close')?.addEventListener('click', () => Cart.closeDrawer());
    const dr = $('#cart-drawer');
    dr?.addEventListener('click', e => { if (e.target === dr) Cart.closeDrawer(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') Cart.closeDrawer(); });
  }

  // ---------- AI Assistant ("The Reaper") ----------
  const REAPER_SVG = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- Hood -->
    <path d="M20 4 C11 4 8 11 8 16 L8 32 C8 33 9 34 10 34 L30 34 C31 34 32 33 32 32 L32 16 C32 11 29 4 20 4 Z" fill="currentColor"/>
    <!-- Skull face cavity -->
    <ellipse cx="20" cy="21" rx="7" ry="8.5" fill="#000"/>
    <!-- Eye sockets -->
    <circle cx="17" cy="19" r="2" fill="currentColor"/>
    <circle cx="23" cy="19" r="2" fill="currentColor"/>
    <!-- Eye glow center -->
    <circle cx="17" cy="19" r="0.7" fill="#000"/>
    <circle cx="23" cy="19" r="0.7" fill="#000"/>
    <!-- Nose triangle -->
    <path d="M19 23 L21 23 L20 25.5 Z" fill="currentColor"/>
    <!-- Teeth -->
    <rect x="16.5" y="27" width="7" height="1.2" fill="currentColor"/>
    <line x1="18" y1="27" x2="18" y2="28.2" stroke="#000" stroke-width="0.6"/>
    <line x1="20" y1="27" x2="20" y2="28.2" stroke="#000" stroke-width="0.6"/>
    <line x1="22" y1="27" x2="22" y2="28.2" stroke="#000" stroke-width="0.6"/>
    <!-- Scythe handle (diagonal, behind hood) -->
    <line x1="30" y1="16" x2="38" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <!-- Scythe blade (curved) -->
    <path d="M38 6 Q43 8 41 16 Q38 11 34 10 Z" fill="currentColor"/>
  </svg>`;

  const Chat = {
    history: [],
    context: {},  // tracks last viewed product, etc.
    intents: [
      // Shipping & policies
      {
        match: /(shipping|deliver|ship to|how long|when.+arrive)/i,
        reply: () => "Standard shipping is <strong>5–7 business days</strong> in the US — <strong>FREE</strong> on orders over $100. Express is 2–3 days for $19.95. I'll personally deliver it. ⚰️",
      },
      {
        match: /(return|refund|exchange|wrong size)/i,
        reply: () => "<strong>30-day free returns</strong> on unworn gear. Email returns@rebelreaper.com with your order number — I'll send a prepaid label. Sale items are final unless they show up damaged.",
      },
      {
        match: /(siz(e|ing)|fit|measur|chest|waist|inseam)/i,
        reply: () => "Our gear runs <strong>true to size</strong>. Every product page has a <strong>Size Guide →</strong> link with chest, waist, sleeve, inseam — pull it up. Between sizes? Size up for layering, size down for slim. I don't do guesswork.",
      },
      {
        match: /(track|order status|where.+order)/i,
        reply: () => `You can check order status on your <a href="${root}account-orders.html" style="border-bottom:1px solid">Account → Orders</a> page once you're signed in. Tracking emails go out the moment your order ships.`,
      },
      {
        match: /(material|fabric|leather|cotton|denim)/i,
        reply: () => "Real materials only. Top-grain leather on jackets and vests, heavyweight 100% cotton on tees, premium denim, performance synthetics on boardshorts. Nothing print-on-demand. Every piece is small-batch.",
      },
      {
        match: /(care|wash|clean|laundry)/i,
        reply: () => "Quick care guide: cottons → machine wash cold, tumble dry low. Leather → wipe with damp cloth, condition twice a year. Denim → cold wash inside out. Don't iron over prints.",
      },
      {
        match: /(discount|coupon|promo|code|sale)/i,
        reply: () => `We've got <strong>36 items on sale</strong> right now — up to 40% off. Want me to show you what's marked down?`,
        action: 'show_sale',
      },
      {
        match: /(contact|talk.+human|customer service|support)/i,
        reply: () => "Real humans live here too: hello@rebelreaper.com or DM us on Instagram @rebelreaperclothing. Usually back within 24h.",
      },
      // ===== Compare must come BEFORE category intents (since "compare X gloves vs Y" mentions a category) =====
      {
        match: /\bcompare\b|\bvs\.?\b|difference between|which is better/i,
        reply: () => "Putting them on the slab side by side...",
        action: { compare_prompt: true },
      },
      // ===== Outfit Builder & What pairs (also before categories so "build me a kit with vests" doesn't catch on vest) =====
      {
        match: /(build.+(kit|outfit|look)|complete.+outfit|put together|outfit me|kit me|head to toe|whole look|full kit)/i,
        reply: () => "Stitching together a full kit. Hold the throttle...",
        action: { outfit: true },
      },
      {
        match: /(goes with|pair(s)? with|match.+with|what should I wear|complete the look)/i,
        reply: () => "Let me show you what runs with that piece. Here's what other riders pair it with:",
        action: { pairs: true },
      },
      // Browse / category navigation
      {
        match: /(vest|leather vest|denim vest)/i,
        reply: () => "We've got vests on lock — leather, denim, custom. Here's what we're rolling with:",
        action: { search: 'vest', limit: 4 },
      },
      {
        match: /(jacket|moto jacket|leather jacket)/i,
        reply: () => "Jackets are the soul of the line. Check these out:",
        action: { search: 'jacket', limit: 4 },
      },
      {
        match: /(t-?shirt|tee|tees)/i,
        reply: () => "Tees, comin' up:",
        action: { search: 't-shirt', limit: 4 },
      },
      {
        match: /(flannel)/i,
        reply: () => "Flannels — built warm, built loud:",
        action: { search: 'flannel', limit: 4 },
      },
      {
        match: /(glove|moto glove)/i,
        reply: () => "Moto gloves — palms reinforced, knuckles armored:",
        action: { search: 'glove', limit: 4 },
      },
      {
        match: /(hat|snapback|trucker|cap)/i,
        reply: () => "Lids, snapbacks, truckers — pick your poison:",
        action: { search: 'hat', limit: 4 },
      },
      {
        match: /(sunglass|shades|eyewear)/i,
        reply: () => "Shades for the open road:",
        action: { search: 'sunglass', limit: 4 },
      },
      {
        match: /(women|womens|ladies)/i,
        reply: () => "Womens collection right here:",
        action: { search: 'women', limit: 4 },
      },
      {
        match: /(pant|short|chino)/i,
        reply: () => "Pants and shorts — clean cuts, real waist sizing:",
        action: { search: 'chino', limit: 4 },
      },
      // ===== OUTFIT BUILDER (The Killer Feature) =====
      {
        match: /(build.+(kit|outfit|look)|complete.+outfit|put together|outfit me|kit me|head to toe|whole look|full kit)/i,
        reply: () => "Stitching together a full kit. Hold the throttle...",
        action: { outfit: true },
      },
      // ===== WHAT GOES WITH THIS =====
      {
        match: /(goes with|pair(s)? with|match.+with|what should I wear|complete the look)/i,
        reply: () => "Let me show you what runs with that piece. Here's what other riders pair it with:",
        action: { pairs: true },
      },
      // ===== COMPARE =====
      {
        match: /\bcompare\b|\bvs\.?\b|difference between|which is better/i,
        reply: () => "Aight, picking between two pieces? Tell me both — like \"compare aftershock gloves vs barbed wire gloves\" — and I'll put 'em side by side.",
        action: { compare_prompt: true },
      },
      // ===== SURPRISE ME =====
      {
        match: /(surprise me|random|something wild|pick.+for me|chaos|gimme anything)/i,
        reply: () => "Bold move. Here's something stupid you'll love:",
        action: { surprise: true },
      },
      // Recommendations
      {
        match: /(recommend|suggest|what should I|best seller|popular|hot)/i,
        reply: () => "Here's what's been crossing the bridge fast:",
        action: { popular: true, limit: 4 },
      },
      {
        match: /(gift|present|for my)/i,
        reply: () => "Gifting? A tee, a hat, or a digital gift card never miss. Quick mix:",
        action: { mix: true, limit: 4 },
      },
      // ===== USE-CASE ADVICE (lifestyle) =====
      {
        match: /(long ride|day trip|road trip|cross.?country|200 mile|500 mile)/i,
        reply: () => "Long days need real gear. Here's a kit that won't quit:",
        action: { use_case: 'long_ride' },
      },
      {
        match: /(daily|commute|every day|errand|around town)/i,
        reply: () => "Daily wear — keep it simple but loud. Here's the rotation:",
        action: { use_case: 'daily' },
      },
      {
        match: /(track|race|fast|aggressive|sport)/i,
        reply: () => "Track-ready gear, gloves first. Here's what holds:",
        action: { use_case: 'track' },
      },
      // Greetings / vibe
      {
        match: /^(hey|hi|hello|yo|sup|what.?s up|howdy|aye)\b/i,
        reply: () => "Yo. The Reaper here. ⚰️<br>Here to help you find gear, sort sizing, or settle which jacket beats which. What're we doing today?",
      },
      {
        match: /(thank|thanks|appreciate|cheers|nice|cool|awesome)/i,
        reply: () => "Any time. Ride safe out there. ⚡",
      },
      {
        match: /(who are you|what are you|your name|are you AI|are you a bot|are you human)/i,
        reply: () => "I'm <strong>The Reaper</strong> — Rebel Reaper's gear guide from beyond. Sickle in one hand, catalog in the other. Not full AI — clever shortcuts trained on the brand, the gear, and the road. But I usually know what you need.",
      },
      {
        match: /(joke|funny|lol)/i,
        reply: () => "I'm the Grim Reaper but I work in retail — that's the joke.",
      },
    ],
    fallbacks: [
      "Not sure I caught that. Try \"show me leather vests\", \"what's on sale\", \"what's your return policy\", or \"recommend something\".",
      "Hmm, didn't connect. Want me to show you what's new? Or you can ask about shipping, sizing, or specific gear.",
      "Let's try that again — I'm best at: finding gear by category, answering shipping/returns/sizing, or recommending something.",
    ],
    suggestions: [
      "What's on sale?",
      "Show me leather vests",
      "Recommend a tee",
      "Sizing help",
      "Shipping & returns",
      "Track my order",
    ],
  };

  // Synonym/alias map so customers can speak naturally
  const SYNONYMS = {
    'jacket': ['coat', 'outerwear', 'leather'],
    'shirt': ['tee', 't-shirt', 'top'],
    'flannel': ['plaid', 'button-up'],
    'gloves': ['mitts', 'mittens', 'hand'],
    'hat': ['cap', 'snapback', 'trucker', 'lid', 'beanie'],
    'sunglasses': ['shades', 'glasses', 'eyewear', 'sunnies'],
    'vest': ['cut', 'kutte'],
    'pants': ['chinos', 'trousers', 'slacks'],
    'shorts': ['boardshorts', 'trunks'],
    'socks': ['hosiery'],
    'patch': ['patches'],
  };
  const STOPWORDS = new Set(['the','a','an','i','my','me','for','of','to','in','on','any','some','want','need','show','find','look','looking','give','gimme','can','you','please','thanks','thank']);

  function tokenize(s) {
    return s.toLowerCase().match(/[a-z0-9]+/g) || [];
  }
  function expandTokens(tokens) {
    const expanded = new Set(tokens);
    for (const t of tokens) {
      for (const [canon, aliases] of Object.entries(SYNONYMS)) {
        if (canon === t || aliases.includes(t)) {
          expanded.add(canon);
          for (const a of aliases) expanded.add(a);
        }
      }
    }
    return Array.from(expanded);
  }
  function searchProducts(text, limit = 4) {
    if (!window.RR_PRODUCTS) return [];
    const rawTokens = tokenize(text).filter(t => t.length > 1 && !STOPWORDS.has(t));
    if (!rawTokens.length) return [];
    const tokens = expandTokens(rawTokens);
    // Score each product by how many tokens hit name + category
    const scored = window.RR_PRODUCTS.map(p => {
      const hay = (p.name + ' ' + (p.category||'')).toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += 1;
        if (p.name.toLowerCase().split(/\W+/).includes(t)) score += 2;
      }
      return [p, score];
    }).filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([p]) => p);
    return scored;
  }

  function chatRespond(text) {
    if (!text || !text.trim()) return null;
    const t = text.trim();
    for (const intent of Chat.intents) {
      if (intent.match.test(t)) {
        return { reply: intent.reply(), action: intent.action || null };
      }
    }
    // Smart fallback: find products by token + synonym matching
    const matches = searchProducts(t, 4);
    if (matches.length) {
      const lines = [
        `Pulled up <strong>${matches.length}</strong> piece${matches.length===1?'':'s'} that match "${escapeHtml(t)}". Take a look:`,
        `Here's what I found for "${escapeHtml(t)}":`,
        `Got some hits on "${escapeHtml(t)}":`,
        `These match what you're after:`,
      ];
      return {
        reply: lines[Math.floor(Math.random()*lines.length)],
        action: { products: matches },
      };
    }
    // Even smarter fallback: try to give them options
    const helpful = [
      `I didn't lock onto anything specific. I can help with:<br>• Finding gear (\"<em>show me leather jackets</em>\")<br>• Building a kit (\"<em>build me a $200 kit</em>\")<br>• Comparing two pieces (\"<em>compare aftershock vs barbed wire gloves</em>\")<br>• Sizing, shipping, returns<br>• Or hit \"Surprise me\" if you're feeling lucky.`,
      `Hmm, want me to try harder? Tell me a vibe (\"<em>moto cruiser</em>\", \"<em>tattoo flash</em>\", \"<em>anything black</em>\") or I can just <strong>surprise you</strong>.`,
      `Not seeing it. Try a category (vests, gloves, sunglasses, hats, t-shirts) or ask me to <strong>recommend something</strong>.`,
    ];
    return { reply: helpful[Math.floor(Math.random()*helpful.length)] };
  }

  function chatProductsHTML(prods) {
    if (!prods || !prods.length) return '';
    return `<div class="chat-products">${prods.map(p => `
      <a class="chat-product" href="${root}${p.url}">
        <div class="chat-product__thumb">${p.image ? `<img src="${root}${p.image}" alt="">` : ''}</div>
        <div class="chat-product__name">${escapeHtml(p.name)}</div>
        <div class="chat-product__price">${p.on_sale ? `<span style="text-decoration:line-through;color:var(--ash-2)">${escapeHtml(p.sale_original||'')}</span> <span style="color:var(--blood);font-weight:700">${escapeHtml(p.sale_current||p.price)}</span>` : escapeHtml(p.price)}</div>
      </a>`).join('')}</div>`;
  }

  function pickByCategoryKeyword(all, keyword) {
    const k = keyword.toLowerCase();
    return all.find(p =>
      (p.category||'').toLowerCase().includes(k) ||
      p.name.toLowerCase().includes(k)
    );
  }
  function pickByName(all, keyword) {
    const k = keyword.toLowerCase();
    return all.find(p => p.name.toLowerCase().includes(k));
  }

  function chatBundleHTML(prods, label) {
    if (!prods || !prods.length) return '';
    const ids = prods.map(p => p.id).join(',');
    const total = prods.reduce((n, p) => {
      const v = p.on_sale && p.sale_current
        ? Number(String(p.sale_current).replace(/[^0-9.]/g, '')) || p.price_value
        : Number(p.price_value || 0);
      return n + v;
    }, 0);
    const totalLabel = '$' + total.toFixed(2);
    return `
      <div class="chat-bundle-label">${escapeHtml(label||'Bundle')} · <strong>${totalLabel}</strong></div>
      ${chatProductsHTML(prods)}
      <button class="chat-add-bundle" type="button" onclick="window.RR.chat.addBundle('${ids}')">⚡ Add Whole Kit to Bag — ${totalLabel}</button>
    `;
  }

  function chatComparisonHTML(a, b) {
    if (!a || !b) return '';
    const cell = (p) => `
      <div class="chat-compare__col">
        <a href="${root}${p.url}" class="chat-compare__thumb">
          ${p.image ? `<img src="${root}${p.image}" alt="">` : ''}
        </a>
        <div class="chat-compare__name">${escapeHtml(p.name)}</div>
        <div class="chat-compare__cat">${escapeHtml(p.category||'')}</div>
        <div class="chat-compare__price">
          ${p.on_sale ? `<span style="text-decoration:line-through;color:var(--ash-2)">${escapeHtml(p.sale_original||'')}</span> <span style="color:var(--blood);font-weight:700">${escapeHtml(p.sale_current||p.price)}</span>` : escapeHtml(p.price)}
        </div>
        <ul class="chat-compare__bullets">
          ${(p.sizes && p.sizes.length) ? `<li><strong>Sizes:</strong> ${p.sizes.slice(0,4).join(', ')}${p.sizes.length>4?'…':''}</li>` : ''}
          ${p.on_sale ? `<li><strong>Sale:</strong> Save ${p.sale_percent_off}%</li>` : '<li><strong>Status:</strong> Full price</li>'}
        </ul>
      </div>`;
    return `
      <div class="chat-compare">
        ${cell(a)}
        <div class="chat-compare__vs">VS</div>
        ${cell(b)}
      </div>`;
  }

  async function resolveChatAction(action, context) {
    if (!action) return '';
    const all = window.RR_PRODUCTS || (await products());
    const limit = action.limit || 4;
    if (action.search) {
      const term = action.search.toLowerCase();
      const matches = all.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.category||'').toLowerCase().includes(term)
      ).slice(0, limit);
      return chatProductsHTML(matches);
    }
    if (action === 'show_sale') {
      const matches = all.filter(p => p.on_sale).slice(0, 4);
      return chatProductsHTML(matches);
    }
    if (action.popular) {
      return chatProductsHTML(all.slice(0, limit));
    }
    if (action.mix) {
      const cats = ['t-shirts','hats','sunglasses','vests'];
      const picks = [];
      for (const c of cats) {
        const found = pickByCategoryKeyword(all, c);
        if (found && !picks.includes(found)) picks.push(found);
      }
      return chatProductsHTML(picks);
    }
    if (action.products) {
      return chatProductsHTML(action.products);
    }
    // ===== Outfit Builder =====
    if (action.outfit) {
      const recipe = ['vest','t-shirt','hat','glove'];
      const picks = [];
      for (const c of recipe) {
        const p = pickByCategoryKeyword(all, c);
        if (p && !picks.includes(p)) picks.push(p);
      }
      while (picks.length < 4) {
        const extra = all[Math.floor(Math.random()*all.length)];
        if (!picks.includes(extra)) picks.push(extra);
      }
      return chatBundleHTML(picks.slice(0,4), 'Full Reaper Kit');
    }
    // ===== What pairs with this =====
    if (action.pairs) {
      // Use last viewed product as anchor; otherwise pick a popular one
      const anchorId = Chat.context.lastViewed;
      const anchor = anchorId ? all.find(p => p.id === anchorId) : all[0];
      const anchorCat = (anchor && anchor.category) || '';
      // Pair with complementary categories
      const complements = ['vest','jacket','glove','hat','sunglass','t-shirt'].filter(c => !anchorCat.toLowerCase().includes(c));
      const picks = [];
      for (const c of complements) {
        const p = pickByCategoryKeyword(all, c);
        if (p && !picks.includes(p) && p.id !== (anchor && anchor.id)) picks.push(p);
        if (picks.length >= 3) break;
      }
      const intro = anchor ? `<div class="chat-bundle-label">Pairs with <strong>${escapeHtml(anchor.name)}</strong></div>` : '';
      return intro + chatProductsHTML(picks);
    }
    // ===== Compare =====
    if (action.compare_prompt) {
      // If user already provided "X vs Y" in their text, pick both products
      const text = (context && context.userText) || '';
      const m = text.match(/(?:compare\s+)?(.+?)\s+(?:vs\.?|or)\s+(.+)/i);
      if (m) {
        const a = pickByName(all, m[1].trim()) || pickByCategoryKeyword(all, m[1].trim());
        const b = pickByName(all, m[2].trim()) || pickByCategoryKeyword(all, m[2].trim());
        if (a && b) return chatComparisonHTML(a, b);
      }
      return '<div class="chat-compare__hint">Try: <em>compare aftershock gloves vs barbed wire gloves</em></div>';
    }
    // ===== Surprise me =====
    if (action.surprise) {
      const p = all[Math.floor(Math.random() * all.length)];
      return chatProductsHTML([p]);
    }
    // ===== Use-case kits =====
    if (action.use_case) {
      let recipe;
      let label;
      if (action.use_case === 'long_ride') {
        recipe = ['leather vest','glove','sunglass','flannel'];
        label = 'Long-Haul Kit';
      } else if (action.use_case === 'track') {
        recipe = ['glove','jersey','jacket','sunglass'];
        label = 'Track-Day Kit';
      } else {
        recipe = ['t-shirt','hat','sunglass','chino'];
        label = 'Daily Driver Kit';
      }
      const picks = [];
      for (const c of recipe) {
        const p = pickByCategoryKeyword(all, c);
        if (p && !picks.includes(p)) picks.push(p);
      }
      while (picks.length < 4) {
        const extra = all[Math.floor(Math.random()*all.length)];
        if (!picks.includes(extra)) picks.push(extra);
      }
      return chatBundleHTML(picks.slice(0,4), label);
    }
    return '';
  }

  function chatAppendBot(html) {
    const stream = $('#chat-stream');
    if (!stream) return;
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--bot';
    div.innerHTML = `<div class="chat-msg__bubble">${html}</div>`;
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
  }
  function chatAppendUser(text) {
    const stream = $('#chat-stream');
    if (!stream) return;
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg--user';
    div.innerHTML = `<div class="chat-msg__bubble">${escapeHtml(text)}</div>`;
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
  }
  function chatTypingOn() {
    const stream = $('#chat-stream');
    if (!stream) return;
    const div = document.createElement('div');
    div.className = 'chat-typing';
    div.id = 'chat-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
  }
  function chatTypingOff() {
    document.getElementById('chat-typing')?.remove();
  }

  async function chatHandleSend(text) {
    if (!text || !text.trim()) return;
    chatAppendUser(text);
    chatTypingOn();
    // Snappy reply — 200–350ms is enough to feel natural without dragging
    await new Promise(r => setTimeout(r, 200 + Math.random() * 150));
    chatTypingOff();
    const resp = chatRespond(text);
    if (!resp) return;
    let html = resp.reply || '';
    const productHTML = await resolveChatAction(resp.action, { userText: text });
    if (productHTML) html += productHTML;
    chatAppendBot(html);
  }

  // Add bundle to bag from chat
  Chat.addBundle = async function(idsCsv) {
    const ids = idsCsv.split(',');
    const all = await products();
    let added = 0;
    for (const id of ids) {
      const p = all.find(x => x.id === id);
      if (p) {
        // Try first size if available
        const size = (p.sizes && p.sizes.length) ? p.sizes[Math.floor(p.sizes.length/2)] : null;
        Cart.add(p, 1, size);
        added++;
      }
    }
    chatAppendBot(`Added <strong>${added} pieces</strong> to your bag. ⚰️ Don't make me come collect.`);
  };

  function bindChat() {
    const fab = $('#chat-fab');
    const panel = $('#chat-panel');
    if (!fab || !panel) return;
    const toggle = (open) => {
      panel.classList.toggle('is-open', open);
      if (open) {
        $('#chat-input')?.focus();
        // First-time greeting
        const stream = $('#chat-stream');
        if (stream && stream.children.length === 0) {
          chatAppendBot("Yo. <strong>The Reaper</strong> here. ⚰️<br>Here to find gear, sort sizing, build kits, settle which jacket beats which. What're we doing today?");
        }
      }
    };
    fab.addEventListener('click', () => toggle(!panel.classList.contains('is-open')));
    $('#chat-close')?.addEventListener('click', () => toggle(false));
    $('#chat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#chat-input');
      const text = input.value;
      input.value = '';
      chatHandleSend(text);
    });
    document.querySelectorAll('.chat-chip').forEach(c => {
      c.addEventListener('click', () => chatHandleSend(c.textContent.trim()));
    });
    // Track last viewed product for context
    const pdpId = document.body.dataset.productId;
    if (pdpId) Chat.context.lastViewed = pdpId;
  }

  // ---------- Quick View ----------
  async function openQuickView(productId) {
    const all = await products();
    const p = all.find(x => x.id === productId);
    const modal = $('#qv-modal');
    const body = $('#qv-body');
    if (!p || !modal || !body) return;
    const sizes = Array.isArray(p.sizes) ? p.sizes : (p.sizes ? String(p.sizes).split(',').map(s=>s.trim()) : []);
    const inWishlist = Wishlist.has(p.id);

    // Build size grid HTML
    const sizeHTML = sizes.length ? `
      <div class="qv-group">
        <div class="qv-group-title">Select size</div>
        <div class="size-grid qv-sizes">
          ${sizes.map(s => `<button type="button" class="size-btn">${escapeHtml(s)}</button>`).join('')}
        </div>
        <div id="qv-size-required" style="display:none;font-family:var(--f-mono);font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--blood);margin-top:.4rem">Please select a size</div>
      </div>` : '';

    // Build price block (sale-aware)
    const priceHTML = p.on_sale && p.sale_current && p.sale_original ? `
      <div class="qv-sale-label">Sale</div>
      <div class="qv-price-row">
        <span class="qv-price-was">${escapeHtml(p.sale_original)}</span>
        <span class="qv-price-now">${escapeHtml(p.sale_current)}</span>
      </div>` : `
      <div class="qv-price-row">
        <span class="qv-price">${escapeHtml(p.price || '')}</span>
      </div>`;

    body.innerHTML = `
      <div class="qv-grid">
        <div class="qv-image">
          ${p.image ? `<img src="${root}${p.image}" alt="${escapeHtml(p.name)}">` : '<div class="card__placeholder" style="height:100%">No image</div>'}
        </div>
        <div class="qv-info">
          <div class="qv-cat">${escapeHtml(p.category || '')}</div>
          <h2 class="qv-name">${escapeHtml(p.name)}</h2>
          ${priceHTML}
          ${sizeHTML}
          <div class="qv-group">
            <div class="qty-row">
              <div class="stepper">
                <button type="button" data-qv-qty-dec aria-label="Decrease">−</button>
                <input type="text" id="qv-qty" value="1" aria-label="Quantity">
                <button type="button" data-qv-qty-inc aria-label="Increase">+</button>
              </div>
              <button id="qv-add" class="btn btn--lg" style="flex:1">Add to bag</button>
            </div>
          </div>
          <div class="qv-actions">
            <button class="qv-wish ${inWishlist ? 'is-active' : ''}" type="button" data-id="${p.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${inWishlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.35-9.5-9C.78 8.36 3.4 5 7 5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3.6 0 6.22 3.36 4.5 7-2.5 4.65-9.5 9-9.5 9z"/></svg>
              ${inWishlist ? 'Saved' : 'Save for later'}
            </button>
            <a class="qv-fulldetails" href="${root}${p.url}">View full details →</a>
          </div>
        </div>
      </div>`;

    // Open modal
    modal.classList.add('is-open');
    document.body.classList.add('drawer-open');

    // Wire size selection
    body.querySelectorAll('.size-btn').forEach(b => {
      b.addEventListener('click', () => {
        body.querySelectorAll('.size-btn').forEach(x => x.classList.remove('is-selected'));
        b.classList.add('is-selected');
        const e2 = body.querySelector('#qv-size-required');
        if (e2) e2.style.display = 'none';
      });
    });

    // Stepper
    body.querySelector('[data-qv-qty-dec]')?.addEventListener('click', () => {
      const i = body.querySelector('#qv-qty');
      i.value = Math.max(1, (parseInt(i.value, 10) || 1) - 1);
    });
    body.querySelector('[data-qv-qty-inc]')?.addEventListener('click', () => {
      const i = body.querySelector('#qv-qty');
      i.value = (parseInt(i.value, 10) || 1) + 1;
    });

    // Add to bag
    body.querySelector('#qv-add').addEventListener('click', () => {
      const sizeBtn = body.querySelector('.size-btn.is-selected');
      const needsSize = sizes.length > 0;
      if (needsSize && !sizeBtn) {
        const grid = body.querySelector('.qv-sizes');
        if (grid) {
          grid.classList.add('shake');
          setTimeout(() => grid.classList.remove('shake'), 400);
        }
        const e2 = body.querySelector('#qv-size-required');
        if (e2) e2.style.display = 'block';
        return;
      }
      const qty = Math.max(1, parseInt(body.querySelector('#qv-qty').value, 10) || 1);
      Cart.add(p, qty, sizeBtn ? sizeBtn.textContent.trim() : null);
      // Close quick view after a brief beat (cart drawer slides in)
      setTimeout(() => closeQuickView(), 250);
    });

    // Wishlist toggle inside modal
    body.querySelector('.qv-wish').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      Wishlist.toggle(btn.dataset.id);
      const isOn = Wishlist.has(btn.dataset.id);
      btn.classList.toggle('is-active', isOn);
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isOn ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.35-9.5-9C.78 8.36 3.4 5 7 5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3.6 0 6.22 3.36 4.5 7-2.5 4.65-9.5 9-9.5 9z"/></svg>
        ${isOn ? 'Saved' : 'Save for later'}`;
    });
  }

  function closeQuickView() {
    const modal = $('#qv-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    if (!document.querySelector('.drawer.is-open, .mobile-nav.is-open, .size-modal.is-open')) {
      document.body.classList.remove('drawer-open');
    }
  }

  function bindQuickView() {
    document.addEventListener('click', (e) => {
      const qv = e.target.closest('[data-action="quick-view"]');
      if (qv) {
        e.preventDefault();
        e.stopPropagation();
        openQuickView(qv.dataset.id);
        return;
      }
      const close = e.target.closest('[data-qv-close]');
      if (close) closeQuickView();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQuickView(); });
  }

  // ---------- Wishlist heart wiring ----------
  function bindWishlistHearts() {
    $$('.wishlist-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        Wishlist.toggle(btn.dataset.id);
      });
    });
  }

  // ---------- Add-to-bag wiring (PDP) ----------
  function bindAddToBag() {
    const ad = $('#add-to-bag');
    if (!ad) return;
    ad.addEventListener('click', e => {
      e.preventDefault();
      const sizeBtn = $('.size-btn.is-selected');
      const sizeBtns = $$('.size-btn');
      const needsSize = sizeBtns.length > 0;
      if (needsSize && !sizeBtn) {
        const grid = $('.size-grid');
        if (grid) {
          grid.classList.add('shake');
          setTimeout(() => grid.classList.remove('shake'), 400);
          const e2 = $('#size-required');
          if (e2) e2.style.display = 'block';
        }
        return;
      }
      const qtyEl = $('#qty-input');
      const qty = qtyEl ? Math.max(1, parseInt(qtyEl.value, 10) || 1) : 1;
      const data = JSON.parse(ad.dataset.product || '{}');
      Cart.add(data, qty, sizeBtn ? sizeBtn.textContent.trim() : null);
    });
    // Size selection
    $$('.size-btn').forEach(b => {
      b.addEventListener('click', () => {
        $$('.size-btn').forEach(x => x.classList.remove('is-selected'));
        b.classList.add('is-selected');
        const e2 = $('#size-required');
        if (e2) e2.style.display = 'none';
      });
    });
    // Stepper
    $('[data-qty-dec]')?.addEventListener('click', () => {
      const i = $('#qty-input'); if (!i) return;
      i.value = Math.max(1, (parseInt(i.value, 10) || 1) - 1);
    });
    $('[data-qty-inc]')?.addEventListener('click', () => {
      const i = $('#qty-input'); if (!i) return;
      i.value = (parseInt(i.value, 10) || 1) + 1;
    });
  }

  // ---------- Page-specific renderers ----------
  async function renderCartPage() {
    const wrap = $('#cart-page');
    if (!wrap) return;
    const items = Cart.items();
    if (!items.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <h1 class="t-display" style="font-size:clamp(2.5rem,5vw,4rem)">Your bag is empty</h1>
          <p>Looks like nothing's caught your eye yet. The road's calling.</p>
          <a class="btn btn--lg" href="${root}shop.html">Shop The Collection &nbsp;→</a>
        </div>`;
      return;
    }
    const lines = items.map(i => {
      const lineTotal = i.price * i.qty;
      const lineOrig = (i.original_price || i.price) * i.qty;
      const showSale = i.on_sale && lineOrig > lineTotal;
      return `
      <div class="cart-row">
        <a class="cart-row__thumb" href="${root}${i.url}">
          ${i.image ? `<img src="${root}${i.image}" alt="">` : ''}
        </a>
        <div class="cart-row__body">
          <a class="cart-row__name" href="${root}${i.url}">${escapeHtml(i.name)}</a>
          ${i.size ? `<div class="cart-row__opt">Size: ${i.size}</div>` : ''}
          ${showSale ? `<div class="cart-row__opt" style="color:var(--blood);font-weight:600">On Sale · You save ${fmt(lineOrig - lineTotal)}</div>` : ''}
          <div class="cart-row__actions">
            <div class="qty-mini">
              <button onclick="window.RR.cart.setQty('${i.key}', ${i.qty - 1})" aria-label="Decrease">−</button>
              <span>${i.qty}</span>
              <button onclick="window.RR.cart.setQty('${i.key}', ${i.qty + 1})" aria-label="Increase">+</button>
            </div>
            <button class="link-rm" onclick="window.RR.cart.remove('${i.key}')">Remove</button>
            <button class="link-rm" onclick="window.RR.cart.moveToWishlist('${i.key}')">Save for later</button>
          </div>
        </div>
        <div class="cart-row__price">
          ${showSale ? `<div class="cart-row__price-was">${fmt(lineOrig)}</div>` : ''}
          <div class="${showSale ? 'cart-row__price-now' : ''}">${fmt(lineTotal)}</div>
        </div>
      </div>`;
    }).join('');
    const sub = Cart.subtotal();
    const savings = Cart.savings();
    const ship = sub > 100 || sub === 0 ? 0 : 9.95;
    const tax = sub * 0.0875;
    const total = sub + ship + tax;
    wrap.innerHTML = `
      <div class="cart-grid">
        <div class="cart-lines">
          <div class="cart-lines__head">
            <h1 class="t-display" style="font-size:clamp(2rem,4vw,3rem)">Your Bag <span style="color:var(--ash-2);font-size:.6em">(${Cart.count()})</span></h1>
            <button class="link-rm" onclick="if(confirm('Empty bag?'))window.RR.cart.clear()">Empty bag</button>
          </div>
          ${lines}
        </div>
        <aside class="order-summary">
          <h3>Order summary</h3>
          <dl>
            <div><dt>Subtotal</dt><dd>${fmt(sub)}</dd></div>
            ${savings > 0 ? `<div class="savings-row"><dt>You're saving</dt><dd>−${fmt(savings)}</dd></div>` : ''}
            <div><dt>Shipping</dt><dd>${ship === 0 ? 'FREE' : fmt(ship)}</dd></div>
            <div><dt>Tax (est.)</dt><dd>${fmt(tax)}</dd></div>
            <div class="tot"><dt>Total</dt><dd>${fmt(total)}</dd></div>
          </dl>
          ${savings > 0 ? `<div class="savings-callout">⚡ You're saving <strong>${fmt(savings)}</strong> on this order</div>` : ''}
          <a class="btn btn--lg" style="width:100%" href="${root}checkout.html">Checkout &nbsp;→</a>
          <a class="btn btn--ghost" style="width:100%;margin-top:.5rem" href="${root}shop.html">Continue shopping</a>
          <div class="ship-note">${sub > 100 ? '✓ You qualify for free shipping' : `Add ${fmt(100 - sub)} for free shipping`}</div>
        </aside>
      </div>`;
  }
  Cart.moveToWishlist = function (key) {
    const it = Cart.items().find(x => x.key === key);
    if (!it) return;
    if (!Wishlist.has(it.id)) { const ids = Wishlist.ids(); ids.push(it.id); Wishlist.save(ids); }
    Cart.remove(key);
    renderCartPage();
  };
  // Re-render cart page after any cart save
  const origSave = Cart.save;
  Cart.save = function (items) { origSave.call(Cart, items); if ($('#cart-page')) renderCartPage(); };

  async function renderCheckoutPage() {
    const wrap = $('#checkout-page');
    if (!wrap) return;
    const items = Cart.items();
    if (!items.length) {
      location.href = root + 'cart.html';
      return;
    }
    const sub = Cart.subtotal();
    const savings = Cart.savings();
    const ship = sub > 100 ? 0 : 9.95;
    const tax = sub * 0.0875;
    const total = sub + ship + tax;
    const u = Auth.user();
    const linesHtml = items.map(i => `
      <div class="co-line">
        <div class="co-line__thumb">
          ${i.image ? `<img src="${root}${i.image}" alt="">` : ''}
          <span class="co-line__qty">${i.qty}</span>
        </div>
        <div class="co-line__body">
          <div class="name">${escapeHtml(i.name)}</div>
          ${i.size ? `<div class="opt">Size: ${i.size}</div>` : ''}
        </div>
        <div class="co-line__price">${fmt(i.price * i.qty)}</div>
      </div>`).join('');

    wrap.innerHTML = `
      <div class="checkout-grid">
        <form id="checkout-form" class="checkout-form">
          <h2 class="co-step">1 · Contact</h2>
          <div class="form-grid">
            <label class="field"><span>Email</span><input required type="email" name="email" value="${u ? escapeHtml(u.email) : ''}" placeholder="you@example.com"></label>
            <label class="field"><span>Phone</span><input type="tel" name="phone" placeholder="(555) 555-1212"></label>
          </div>
          <label class="check"><input type="checkbox" checked> Email me about exclusive drops & offers</label>

          <h2 class="co-step">2 · Shipping</h2>
          <div class="form-grid">
            <label class="field"><span>First name</span><input required name="fname" value="${u ? escapeHtml((u.name||'').split(' ')[0]||'') : ''}"></label>
            <label class="field"><span>Last name</span><input required name="lname" value="${u ? escapeHtml((u.name||'').split(' ').slice(1).join(' ')||'') : ''}"></label>
            <label class="field span-2"><span>Address</span><input required name="addr" placeholder="123 Asphalt Ave"></label>
            <label class="field span-2"><span>Apt / Unit (optional)</span><input name="addr2"></label>
            <label class="field"><span>City</span><input required name="city"></label>
            <label class="field"><span>State</span>
              <select required name="state">
                <option value="">Select…</option>
                ${'AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.split(',').map(s => `<option>${s}</option>`).join('')}
              </select>
            </label>
            <label class="field"><span>ZIP</span><input required name="zip" pattern="[0-9]{5}" placeholder="90210"></label>
            <label class="field"><span>Country</span><input value="United States" name="country" readonly></label>
          </div>
          <div class="ship-options">
            <label class="ship-opt">
              <input type="radio" name="ship" value="std" checked>
              <div><strong>Standard</strong><div class="muted">5–7 business days</div></div>
              <span>${ship === 0 ? 'FREE' : fmt(ship)}</span>
            </label>
            <label class="ship-opt">
              <input type="radio" name="ship" value="exp">
              <div><strong>Express</strong><div class="muted">2–3 business days</div></div>
              <span>$19.95</span>
            </label>
          </div>

          <h2 class="co-step">3 · Payment</h2>
          <div class="form-grid">
            <label class="field span-2"><span>Card number</span><input required inputmode="numeric" name="card" placeholder="4242 4242 4242 4242" maxlength="19"></label>
            <label class="field"><span>Expires</span><input required name="exp" placeholder="MM/YY" maxlength="5"></label>
            <label class="field"><span>CVC</span><input required inputmode="numeric" name="cvc" placeholder="123" maxlength="4"></label>
            <label class="field span-2"><span>Name on card</span><input required name="cname"></label>
          </div>
          <div class="cards-row" aria-hidden="true">
            <span>VISA</span><span>MC</span><span>AMEX</span><span>DISC</span>
          </div>

          <button class="btn btn--lg" type="submit" style="width:100%;margin-top:2rem">Place Order &nbsp;·&nbsp; ${fmt(total)}</button>
          <p class="muted" style="text-align:center;margin-top:.75rem;font-size:.78rem">Demo store — no real charges. Your order will be saved locally.</p>
        </form>

        <aside class="order-summary order-summary--sticky">
          <h3>Order summary</h3>
          <div class="co-lines">${linesHtml}</div>
          <dl>
            <div><dt>Subtotal</dt><dd>${fmt(sub)}</dd></div>
            ${savings > 0 ? `<div class="savings-row"><dt>You're saving</dt><dd>−${fmt(savings)}</dd></div>` : ''}
            <div><dt>Shipping</dt><dd>${ship === 0 ? 'FREE' : fmt(ship)}</dd></div>
            <div><dt>Tax (est.)</dt><dd>${fmt(tax)}</dd></div>
            <div class="tot"><dt>Total</dt><dd>${fmt(total)}</dd></div>
          </dl>
          ${savings > 0 ? `<div class="savings-callout">⚡ You're saving <strong>${fmt(savings)}</strong> on this order</div>` : ''}
          <details class="promo">
            <summary>Have a promo code?</summary>
            <div class="form-grid" style="grid-template-columns:1fr auto;margin-top:.5rem">
              <input placeholder="Code">
              <button type="button" class="btn btn--ghost">Apply</button>
            </div>
          </details>
        </aside>
      </div>
    `;

    $('#checkout-form').addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const order = {
        number: 'RR' + Date.now().toString().slice(-7),
        date: new Date().toISOString(),
        items: Cart.items(),
        subtotal: sub, shipping: ship, tax, total,
        ship: { name: data.fname + ' ' + data.lname, addr: data.addr, addr2: data.addr2, city: data.city, state: data.state, zip: data.zip },
        email: data.email,
      };
      Orders.create(order);
      sessionStorage.setItem('rr.lastOrder', JSON.stringify(order));
      Cart.clear();
      location.href = root + 'checkout-success.html';
    });
  }

  function renderCheckoutSuccess() {
    const wrap = $('#checkout-success');
    if (!wrap) return;
    const order = JSON.parse(sessionStorage.getItem('rr.lastOrder') || 'null') || (Orders.list()[0]);
    if (!order) { location.href = root + 'index.html'; return; }
    const lines = order.items.map(i => `
      <div class="co-line">
        <div class="co-line__thumb">${i.image ? `<img src="${root}${i.image}" alt="">` : ''}<span class="co-line__qty">${i.qty}</span></div>
        <div class="co-line__body"><div class="name">${escapeHtml(i.name)}</div>${i.size ? `<div class="opt">Size: ${i.size}</div>` : ''}</div>
        <div class="co-line__price">${fmt(i.price * i.qty)}</div>
      </div>`).join('');
    wrap.innerHTML = `
      <div class="success">
        <div class="success__mark">✓</div>
        <span class="eyebrow">Order confirmed</span>
        <h1 class="t-display" style="font-size:clamp(2.5rem,5vw,4.5rem);margin-top:.5rem">Welcome to the gang.</h1>
        <p class="lede">Thanks for ordering — your gear is being prepped. A confirmation has been sent to <strong>${escapeHtml(order.email)}</strong>.</p>

        <div class="success__card">
          <div class="success__row">
            <div><span class="muted">Order number</span><div class="t-mono" style="font-weight:600">#${order.number}</div></div>
            <div><span class="muted">Total</span><div class="t-mono" style="font-weight:600">${fmt(order.total)}</div></div>
            <div><span class="muted">Shipping to</span><div>${escapeHtml(order.ship.name)} · ${escapeHtml(order.ship.city)}, ${escapeHtml(order.ship.state)} ${escapeHtml(order.ship.zip)}</div></div>
          </div>
          <div class="co-lines" style="margin-top:1.5rem">${lines}</div>
        </div>

        <div class="success__cta">
          <a class="btn btn--lg" href="${root}shop.html">Keep Shopping &nbsp;→</a>
          <a class="btn btn--ghost btn--lg" href="${root}account.html">View Order History</a>
        </div>
      </div>`;
  }

  async function renderWishlistPage() {
    const wrap = $('#wishlist-page');
    if (!wrap) return;
    const ids = Wishlist.ids();
    const all = await products();
    const items = ids.map(id => all.find(p => p.id === id)).filter(Boolean);
    if (!items.length) {
      wrap.innerHTML = `<div class="empty-state">
        <h1 class="t-display" style="font-size:clamp(2.5rem,5vw,4rem)">Wishlist is empty</h1>
        <p>Tap the ♡ on any product to save it for the road ahead.</p>
        <a class="btn btn--lg" href="${root}shop.html">Browse The Collection &nbsp;→</a>
      </div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="container">
        <div class="section-head">
          <div class="section-head__left">
            <span class="eyebrow">Saved</span>
            <h2>Wishlist <span style="color:var(--ash-2);font-size:.6em">${items.length}</span></h2>
          </div>
        </div>
        <div class="products">
          ${items.map(p => `
            <div class="card-wrap">
              <a class="card" href="${root}${p.url}">
                <div class="card__thumb">
                  <button class="wishlist-btn is-active" data-id="${p.id}" aria-label="Remove from wishlist" aria-pressed="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-9.5-9C.78 8.36 3.4 5 7 5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3.6 0 6.22 3.36 4.5 7-2.5 4.65-9.5 9-9.5 9z"/></svg>
                  </button>
                  <img src="${root}${p.image}" alt="">
                </div>
                <div class="card__body">
                  <span class="card__cat">${escapeHtml(p.category||'')}</span>
                  <span class="card__name">${escapeHtml(p.name)}</span>
                  <span class="card__price">${escapeHtml(p.price)}</span>
                </div>
              </a>
              <button class="btn" style="width:100%;margin-top:.5rem" onclick='window.RR.cart.add(${JSON.stringify(p).replace(/'/g, "&#39;")}, 1, null)'>Add to bag</button>
            </div>`).join('')}
        </div>
      </div>`;
    bindWishlistHearts();
  }

  async function renderSearchPage() {
    const wrap = $('#search-page');
    if (!wrap) return;
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    const results = q ? await Search.run(q) : [];
    const filterInput = `
      <div class="container">
        <div class="search-page__head">
          <span class="eyebrow">Search</span>
          <form class="search-page__form" onsubmit="event.preventDefault(); const q=this.q.value.trim(); if(q) location.search='?q='+encodeURIComponent(q);">
            <input name="q" autofocus value="${escapeHtml(q)}" placeholder="What are you looking for?">
            <button class="btn">Search</button>
          </form>
          <p class="muted" style="margin-top:.75rem">${q ? `${results.length} result${results.length === 1 ? '' : 's'} for "${escapeHtml(q)}"` : 'Try "vest", "moto gloves", "flannel"…'}</p>
        </div>
        <div class="products">${results.map(p => `
          <a class="card" href="${root}${p.url}">
            <div class="card__thumb"><img src="${root}${p.image}" alt=""></div>
            <div class="card__body">
              <span class="card__cat">${escapeHtml(p.category||'')}</span>
              <span class="card__name">${escapeHtml(p.name)}</span>
              <span class="card__price">${escapeHtml(p.price)}</span>
            </div>
          </a>`).join('')}</div>
      </div>`;
    wrap.innerHTML = filterInput;
  }

  // Shared account nav sidebar
  function accountNav(active) {
    const u = Auth.user();
    if (!u) return '';
    const item = (key, href, label, extra='') => {
      const a = active === key ? 'active' : '';
      return `<li class="${a}"><a href="${root}${href}">${label}${extra}</a></li>`;
    };
    return `<aside class="account-nav">
      <div class="account-nav__user">
        <div class="avatar">${(u.name||u.email).slice(0,1).toUpperCase()}</div>
        <div>
          <div style="font-weight:600">${escapeHtml(u.name)}</div>
          <div class="muted t-mono" style="font-size:.78rem">${escapeHtml(u.email)}</div>
        </div>
      </div>
      <ul>
        ${item('overview', 'account.html', 'Overview')}
        ${item('orders', 'account-orders.html', 'Orders <span class="muted">('+Orders.list().length+')</span>')}
        ${item('addresses', 'account-addresses.html', 'Addresses')}
        ${item('payment', 'account-payment.html', 'Payment Methods')}
        ${item('wishlist', 'wishlist.html', 'Wishlist <span class="muted">(<span data-wish-count>0</span>)</span>')}
        ${item('settings', 'account-settings.html', 'Settings')}
      </ul>
      <div style="margin:1rem 0;padding-top:1rem;border-top:1px solid var(--rule-soft)">
        <a href="${root}admin.html" style="display:flex;align-items:center;justify-content:space-between;padding:.7rem 1rem;background:var(--ink);color:var(--paper);font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase">
          <span>⚡ Admin Console</span><span>→</span>
        </a>
      </div>
      <ul>
        <li><a href="#" onclick="event.preventDefault(); window.RR.auth.signOut(); location.href='${root}index.html'">Sign out →</a></li>
      </ul>
    </aside>`;
  }

  // Shared sale price block helper for JS-rendered cards
  function priceBlockHTML(p) {
    if (p.on_sale && p.sale_current && p.sale_original) {
      return `<span class="card__price card__price--sale">
        <span class="card__price-now">${escapeHtml(p.sale_current)}</span>
        <span class="card__price-was">${escapeHtml(p.sale_original)}</span>
      </span>`;
    }
    return `<span class="card__price">${escapeHtml(p.price || '')}</span>`;
  }
  function saleBadgeHTML(p) {
    if (p.on_sale && p.sale_percent_off) {
      return `<span class="card__badge card__badge--sale">Sale · −${p.sale_percent_off}%</span>`;
    }
    return '';
  }

  function ensureAuth() {
    if (!Auth.user()) { location.href = root + 'signin.html?return=' + encodeURIComponent(location.pathname); return false; }
    return true;
  }

  function renderAccountPage() {
    const wrap = $('#account-page');
    if (!wrap) return;
    if (!ensureAuth()) return;
    const u = Auth.user();
    const orders = Orders.list();
    const recentOrders = orders.slice(0, 3);
    const ordersBlock = recentOrders.length ? recentOrders.map(o => `
      <a class="order-row" href="${root}account-order.html?id=${encodeURIComponent(o.number)}" style="text-decoration:none">
        <div><span class="muted">Order</span><div class="t-mono" style="font-weight:600">#${o.number}</div></div>
        <div><span class="muted">Date</span><div>${new Date(o.date).toLocaleDateString()}</div></div>
        <div><span class="muted">Total</span><div class="t-mono" style="font-weight:600">${fmt(o.total)}</div></div>
        <div><span class="muted">Items</span><div>${o.items.reduce((n,i)=>n+i.qty,0)}</div></div>
        <div><span class="badge">Processing</span></div>
      </a>`).join('') : `<p class="muted">No orders yet. <a href="${root}shop.html" style="border-bottom:1px solid">Start shopping →</a></p>`;
    const stats = [
      { label: 'Lifetime spend', value: fmt(orders.reduce((n,o)=>n+(o.total||0),0)) },
      { label: 'Total orders', value: String(orders.length) },
      { label: 'Wishlist', value: String(Wishlist.ids().length) },
      { label: 'Member since', value: u.joined ? new Date(u.joined).toLocaleDateString() : '—' },
    ];
    wrap.innerHTML = `
      <div class="container account-grid">
        ${accountNav('overview')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Account</span><h2>Welcome back, ${escapeHtml((u.name||'').split(' ')[0])}</h2></div></div>
          <div class="stat-grid">
            ${stats.map(s => `<div class="stat-card"><div class="stat-card__label">${s.label}</div><div class="stat-card__value">${s.value}</div></div>`).join('')}
          </div>
          <h3 class="account-section-title">Recent orders <a href="${root}account-orders.html" class="link-rt">View all →</a></h3>
          <div class="orders">${ordersBlock}</div>
          <h3 class="account-section-title">Quick links</h3>
          <div class="quick-links">
            <a class="quick-link" href="${root}account-addresses.html"><strong>Addresses</strong><span>Manage shipping & billing</span></a>
            <a class="quick-link" href="${root}account-payment.html"><strong>Payment</strong><span>Saved cards & wallets</span></a>
            <a class="quick-link" href="${root}wishlist.html"><strong>Wishlist</strong><span>Items you've saved</span></a>
            <a class="quick-link" href="${root}account-settings.html"><strong>Settings</strong><span>Notifications, password, privacy</span></a>
          </div>
        </section>
      </div>`;
  }

  function renderAccountOrders() {
    const wrap = $('#account-orders-page');
    if (!wrap) return;
    if (!ensureAuth()) return;
    const orders = Orders.list();
    const list = orders.length ? orders.map(o => `
      <a class="order-row" href="${root}account-order.html?id=${encodeURIComponent(o.number)}" style="text-decoration:none">
        <div><span class="muted">Order</span><div class="t-mono" style="font-weight:600">#${o.number}</div></div>
        <div><span class="muted">Date</span><div>${new Date(o.date).toLocaleDateString()}</div></div>
        <div><span class="muted">Total</span><div class="t-mono" style="font-weight:600">${fmt(o.total)}</div></div>
        <div><span class="muted">Items</span><div>${o.items.reduce((n,i)=>n+i.qty,0)}</div></div>
        <div><span class="badge">Processing</span></div>
      </a>`).join('') : `<p class="muted">No orders yet.</p>`;
    wrap.innerHTML = `
      <div class="container account-grid">
        ${accountNav('orders')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Orders</span><h2>Order History</h2></div></div>
          <div class="orders">${list}</div>
        </section>
      </div>`;
  }

  function renderAccountOrderDetail() {
    const wrap = $('#account-order-page');
    if (!wrap) return;
    if (!ensureAuth()) return;
    const id = new URLSearchParams(location.search).get('id');
    const order = Orders.list().find(o => o.number === id);
    if (!order) {
      wrap.innerHTML = `<div class="container"><p class="muted">Order not found. <a href="${root}account-orders.html" style="border-bottom:1px solid">Back to orders →</a></p></div>`;
      return;
    }
    const lines = order.items.map(i => `
      <div class="cart-row">
        <div class="cart-row__thumb">${i.image ? `<img src="${root}${i.image}" alt="">` : ''}</div>
        <div class="cart-row__body">
          <div class="cart-row__name">${escapeHtml(i.name)}</div>
          ${i.size ? `<div class="cart-row__opt">Size: ${i.size}</div>` : ''}
          <div class="cart-row__opt">Qty: ${i.qty}</div>
        </div>
        <div class="cart-row__price">${fmt(i.price * i.qty)}</div>
      </div>`).join('');
    wrap.innerHTML = `
      <div class="container account-grid">
        ${accountNav('orders')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Order #${order.number}</span><h2>Order Detail</h2></div></div>
          <div class="order-detail-meta">
            <div><span class="muted">Placed</span><div>${new Date(order.date).toLocaleString()}</div></div>
            <div><span class="muted">Status</span><div><span class="badge">Processing</span></div></div>
            <div><span class="muted">Shipping to</span><div>${escapeHtml(order.ship.name)}<br>${escapeHtml(order.ship.addr)}<br>${escapeHtml(order.ship.city)}, ${escapeHtml(order.ship.state)} ${escapeHtml(order.ship.zip)}</div></div>
          </div>
          <h3 class="account-section-title">Items</h3>
          ${lines}
          <div class="order-totals">
            <div><dt>Subtotal</dt><dd>${fmt(order.subtotal)}</dd></div>
            <div><dt>Shipping</dt><dd>${order.shipping === 0 ? 'FREE' : fmt(order.shipping)}</dd></div>
            <div><dt>Tax</dt><dd>${fmt(order.tax)}</dd></div>
            <div class="tot"><dt>Total</dt><dd>${fmt(order.total)}</dd></div>
          </div>
          <div style="margin-top:1.5rem"><a class="btn btn--ghost" href="${root}account-orders.html">← Back to orders</a></div>
        </section>
      </div>`;
  }

  function renderAccountAddresses() {
    const wrap = $('#account-addresses-page');
    if (!wrap) return;
    if (!ensureAuth()) return;
    const u = Auth.user();
    const addrs = u.addresses || [
      { id:1, label:'Home', name: u.name, addr:'123 Asphalt Ave', city:'Long Beach', state:'CA', zip:'90802', isDefault: true },
    ];
    if (!u.addresses) { u.addresses = addrs; set(KEYS.user, u); }
    wrap.innerHTML = `
      <div class="container account-grid">
        ${accountNav('addresses')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Addresses</span><h2>Saved Addresses</h2></div><button class="btn" onclick="window.RR.account.addAddress()">Add address +</button></div>
          <div class="address-grid">
            ${addrs.map(a => `
              <div class="address-card ${a.isDefault ? 'is-default' : ''}">
                ${a.isDefault ? '<span class="badge">Default</span>' : ''}
                <div class="address-card__label">${escapeHtml(a.label)}</div>
                <div>${escapeHtml(a.name)}</div>
                <div>${escapeHtml(a.addr)}</div>
                <div>${escapeHtml(a.city)}, ${escapeHtml(a.state)} ${escapeHtml(a.zip)}</div>
                <div class="address-card__actions">
                  <a href="#">Edit</a>
                  ${a.isDefault ? '' : '<a href="#">Make default</a>'}
                  <a href="#">Delete</a>
                </div>
              </div>`).join('')}
          </div>
        </section>
      </div>`;
  }

  function renderAccountPayment() {
    const wrap = $('#account-payment-page');
    if (!wrap) return;
    if (!ensureAuth()) return;
    const u = Auth.user();
    const cards = u.cards || [
      { id:1, brand:'VISA', last4:'4242', exp:'12/29', isDefault: true },
    ];
    if (!u.cards) { u.cards = cards; set(KEYS.user, u); }
    wrap.innerHTML = `
      <div class="container account-grid">
        ${accountNav('payment')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Payment</span><h2>Payment Methods</h2></div><button class="btn" onclick="window.RR.account.addCard()">Add card +</button></div>
          <div class="cards-grid">
            ${cards.map(c => `
              <div class="payment-card ${c.isDefault ? 'is-default' : ''}">
                ${c.isDefault ? '<span class="badge">Default</span>' : ''}
                <div class="payment-card__brand">${c.brand}</div>
                <div class="payment-card__num">•••• •••• •••• ${c.last4}</div>
                <div class="payment-card__exp">Exp ${c.exp}</div>
                <div class="payment-card__actions">
                  <a href="#">Edit</a>
                  ${c.isDefault ? '' : '<a href="#">Make default</a>'}
                  <a href="#">Remove</a>
                </div>
              </div>`).join('')}
          </div>
        </section>
      </div>`;
  }

  function renderAccountSettings() {
    const wrap = $('#account-settings-page');
    if (!wrap) return;
    if (!ensureAuth()) return;
    const u = Auth.user();
    wrap.innerHTML = `
      <div class="container account-grid">
        ${accountNav('settings')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Settings</span><h2>Profile & Preferences</h2></div></div>

          <h3 class="account-section-title">Profile</h3>
          <form id="profile-form" class="form-grid" style="max-width:640px">
            <label class="field"><span>First name</span><input name="fname" value="${escapeHtml((u.name||'').split(' ')[0]||'')}"></label>
            <label class="field"><span>Last name</span><input name="lname" value="${escapeHtml((u.name||'').split(' ').slice(1).join(' ')||'')}"></label>
            <label class="field span-2"><span>Email</span><input type="email" name="email" value="${escapeHtml(u.email)}"></label>
            <label class="field span-2"><span>Phone</span><input type="tel" name="phone" value="${escapeHtml(u.phone||'')}"></label>
            <button class="btn" type="submit" style="grid-column:1/-1;justify-self:start">Save changes</button>
          </form>

          <h3 class="account-section-title">Email preferences</h3>
          <div class="pref-list">
            <label class="pref"><input type="checkbox" checked> <div><strong>New drops</strong><span>Get an email the moment a new collection lands</span></div></label>
            <label class="pref"><input type="checkbox" checked> <div><strong>Order updates</strong><span>Shipping confirmations & delivery alerts</span></div></label>
            <label class="pref"><input type="checkbox"> <div><strong>Restock alerts</strong><span>When wishlisted items come back in stock</span></div></label>
            <label class="pref"><input type="checkbox"> <div><strong>Insider</strong><span>Behind-the-scenes content, riders we love, build features</span></div></label>
          </div>

          <h3 class="account-section-title">Password</h3>
          <form class="form-grid" style="max-width:640px" onsubmit="event.preventDefault(); this.querySelector('button').textContent='UPDATED ✓'">
            <label class="field span-2"><span>Current password</span><input type="password"></label>
            <label class="field"><span>New password</span><input type="password"></label>
            <label class="field"><span>Confirm</span><input type="password"></label>
            <button class="btn" type="submit" style="grid-column:1/-1;justify-self:start">Update password</button>
          </form>

          <h3 class="account-section-title danger">Danger zone</h3>
          <div class="danger-row">
            <div><strong>Delete account</strong><div class="muted">Removes your profile and order history from this device.</div></div>
            <button class="btn btn--ghost" onclick="if(confirm('Delete account?')){window.RR.auth.signOut();localStorage.clear();location.href='${root}index.html';}">Delete</button>
          </div>
        </section>
      </div>`;
    $('#profile-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const cur = Auth.user() || {};
      cur.name = (data.fname + ' ' + data.lname).trim();
      cur.email = data.email;
      cur.phone = data.phone;
      set(KEYS.user, cur);
      const btn = e.target.querySelector('button');
      btn.textContent = 'SAVED ✓';
      setTimeout(() => { btn.textContent = 'Save changes'; }, 1800);
      render();
    });
  }

  function renderSignIn() {
    const wrap = $('#signin-page');
    if (!wrap) return;
    const ret = new URLSearchParams(location.search).get('return') || '';
    wrap.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <h1 class="t-display" style="font-size:clamp(2rem,4vw,3rem);text-align:center">Welcome back</h1>
          <p class="muted" style="text-align:center;margin-bottom:1.5rem">Sign in to your Rebel Reaper account</p>
          <form id="signin-form" class="form-grid" style="grid-template-columns:1fr">
            <label class="field"><span>Email</span><input required type="email" name="email" autocomplete="email" placeholder="rider@rebelreaper.com"></label>
            <label class="field"><span>Password</span><input required type="password" name="pw" autocomplete="current-password" placeholder="••••••••"></label>
            <label class="check"><input type="checkbox" checked> Remember me</label>
            <button class="btn btn--lg" type="submit" style="width:100%">Sign in</button>
          </form>
          <div style="display:flex;align-items:center;gap:.75rem;margin:1.25rem 0;color:var(--ash-2);font-size:.78rem;text-transform:uppercase;letter-spacing:.16em">
            <div style="flex:1;border-top:1px solid var(--rule-soft)"></div>or<div style="flex:1;border-top:1px solid var(--rule-soft)"></div>
          </div>
          <button class="btn btn--ghost btn--lg" id="demo-signin" style="width:100%">⚡ Quick demo sign-in</button>
          <p style="text-align:center;margin-top:1.5rem;font-size:.9rem">No account? <a href="${root}signup.html" style="border-bottom:1px solid">Create one →</a></p>
          <p class="muted" style="text-align:center;margin-top:1.5rem;font-size:.78rem">Demo store — any email + password works. Your session lives on this device only.</p>
        </div>
      </div>`;
    const dest = ret ? (root + ret.replace(/^\//, '')) : (root + 'account.html');
    $('#signin-form').addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      Auth.signIn(data.email);
      location.href = dest;
    });
    $('#demo-signin').addEventListener('click', () => {
      const u = Auth.signIn('rider@rebelreaper.com', 'Sonny Barger');
      // Seed a demo order so account UI has data
      if (!Orders.list().length) {
        Orders.create({
          number: 'RR' + (Date.now()-86400000).toString().slice(-7),
          date: new Date(Date.now()-86400000).toISOString(),
          items: [
            { id:'demo1', name:'Aftershock Moto Gloves', price: 37.99, image: 'images/UNYDRUIYU4P3FANZVR6SDH4O.jpg', size: 'M', qty: 1 },
          ],
          subtotal: 37.99, shipping: 9.95, tax: 3.32, total: 51.26,
          ship: { name:'Sonny Barger', addr:'666 Asphalt Ave', city:'Oakland', state:'CA', zip:'94601' },
          email: 'rider@rebelreaper.com',
        });
      }
      location.href = dest;
    });
  }

  function renderSignUp() {
    const wrap = $('#signup-page');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <h1 class="t-display" style="font-size:clamp(2rem,4vw,3rem);text-align:center">Join the gang</h1>
          <p class="muted" style="text-align:center;margin-bottom:1.5rem">Create your Rebel Reaper account</p>
          <form id="signup-form" class="form-grid">
            <label class="field"><span>First name</span><input required name="fname"></label>
            <label class="field"><span>Last name</span><input required name="lname"></label>
            <label class="field span-2"><span>Email</span><input required type="email" name="email" autocomplete="email"></label>
            <label class="field span-2"><span>Password</span><input required type="password" name="pw" autocomplete="new-password" minlength="6"></label>
            <label class="check span-2"><input type="checkbox" checked> Sign me up for early drops & exclusive offers</label>
            <button class="btn btn--lg" type="submit" style="grid-column:1/-1;width:100%">Create account</button>
          </form>
          <p style="text-align:center;margin-top:1.5rem;font-size:.9rem">Already have one? <a href="${root}signin.html" style="border-bottom:1px solid">Sign in →</a></p>
        </div>
      </div>`;
    $('#signup-form').addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      Auth.signIn(data.email, data.fname + ' ' + data.lname);
      location.href = root + 'account.html';
    });
  }

  // ---------- Boot ----------
  function init() {
    bindSearchOverlay();
    bindCartDrawer();
    bindWishlistHearts();
    bindAddToBag();
    bindQuickView();
    bindChat();

    // Page-specific
    renderCartPage();
    renderCheckoutPage();
    renderCheckoutSuccess();
    renderWishlistPage();
    renderSearchPage();
    renderAccountPage();
    renderAccountOrders();
    renderAccountOrderDetail();
    renderAccountAddresses();
    renderAccountPayment();
    renderAccountSettings();
    renderSignIn();
    renderSignUp();
    renderAdminDashboard();
    renderAdminProducts();
    renderAdminProductEdit();
    renderAdminContent();
    renderAdminOrders();
    renderAdminCustomers();
    renderPreviewProduct();
    applyContentOverrides();

    // Track recently-viewed on PDP
    const pdpId = document.body.dataset.productId;
    if (pdpId) Recent.add(pdpId);

    render();
  }

  // ---------- Admin / CMS ----------
  const Admin = {
    catalog() { return get(KEYS.catalog, { edits: {}, deleted: [], created: [] }); },
    saveCatalog(c) { set(KEYS.catalog, c); _products = null; },
    isAdmin() { return !!Auth.user(); }, // demo: any signed-in user is admin
    requireAdmin() {
      if (!this.isAdmin()) { location.href = root + 'signin.html?return=' + encodeURIComponent(location.pathname); return false; }
      return true;
    },
    async allProducts() { return await products(); },
    update(id, patch) {
      const c = this.catalog();
      c.edits[id] = Object.assign(c.edits[id] || {}, patch);
      this.saveCatalog(c);
    },
    delete(id) {
      const c = this.catalog();
      // If id was a created product, remove from created; else mark as deleted
      const idx = c.created.findIndex(p => p.id === id);
      if (idx >= 0) c.created.splice(idx, 1);
      else if (!c.deleted.includes(id)) c.deleted.push(id);
      delete c.edits[id];
      this.saveCatalog(c);
    },
    create(prod) {
      const c = this.catalog();
      const id = 'NEW-' + Date.now().toString(36).toUpperCase();
      const slug = (prod.name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const newProd = {
        id,
        name: prod.name,
        slug,
        filename: `${slug}-${id.slice(0, 8)}.html`,
        url: `preview-product.html?id=${id}`,
        image: prod.image || null,
        price: '$' + Number(prod.price_value || 0).toFixed(2),
        price_value: Number(prod.price_value || 0),
        price_high: '',
        category: prod.category || '',
        category_id: prod.category_id || '',
        category_url: prod.category_url || '',
        description: prod.description || '',
        sizes: prod.sizes || '',
        _isNew: true,
      };
      c.created.push(newProd);
      this.saveCatalog(c);
      return newProd;
    },
    reset() {
      localStorage.removeItem(KEYS.catalog);
      _products = null;
    },
    exportJSON() {
      return JSON.stringify({ catalog: this.catalog(), content: get(KEYS.content, {}) }, null, 2);
    },
    importJSON(text) {
      try {
        const data = JSON.parse(text);
        if (data.catalog) set(KEYS.catalog, data.catalog);
        if (data.content) set(KEYS.content, data.content);
        _products = null;
        return true;
      } catch { return false; }
    },
    siteContent() {
      return get(KEYS.content, {
        announce: ['FREE SHIPPING ON ORDERS $100+', 'RIDE FAST · LIVE LOUD', 'PREMIUM APPAREL SINCE 2016', 'REBEL AGAINST THE NORM', 'NEW COLLECTION DROPPING'],
        hero_eyebrow: 'Spring · Summer 26 — Now Live',
        hero_title: 'Premium apparel built for the asphalt',
        hero_cta_primary: 'Shop The Collection',
        hero_cta_secondary: 'The Manifesto',
        footer_blurb: 'Premium apparel for riders, lifers, and the loud. Designed in California, made for the asphalt.',
      });
    },
    saveSiteContent(c) { set(KEYS.content, c); },
  };

  // Apply content overrides to live page chrome (announce bar, hero, footer)
  function applyContentOverrides() {
    const c = Admin.siteContent();
    // Announce bar
    const track = document.querySelector('.announce__track');
    if (track && Array.isArray(c.announce) && c.announce.length) {
      track.innerHTML = c.announce.concat(c.announce).map(s => `<span class="announce__item">${escapeHtml(s)}</span>`).join('');
    }
    // Hero copy
    const heroEy = document.querySelector('.brand-hero__eyebrow');
    if (heroEy && c.hero_eyebrow) heroEy.textContent = c.hero_eyebrow;
    const heroT = document.querySelector('.brand-hero__title');
    if (heroT && c.hero_title) heroT.textContent = c.hero_title;
    // Footer blurb
    const fb = document.querySelector('.site-footer__brand p');
    if (fb && c.footer_blurb) fb.textContent = c.footer_blurb;
  }

  // ---------- Admin page renderers ----------
  function adminNav(active) {
    const u = Auth.user();
    if (!u) return '';
    const item = (key, href, label) => `<li class="${active===key?'active':''}"><a href="${root}${href}">${label}</a></li>`;
    return `<aside class="account-nav">
      <div class="account-nav__user">
        <div class="avatar" style="background:var(--blood)">A</div>
        <div>
          <div style="font-weight:600">Admin</div>
          <div class="muted t-mono" style="font-size:.78rem">${escapeHtml(u.email)}</div>
        </div>
      </div>
      <ul>
        ${item('overview','admin.html','Dashboard')}
        ${item('products','admin-products.html','Products')}
        ${item('content','admin-content.html','Site Content')}
        ${item('orders','admin-orders.html','Orders')}
        ${item('customers','admin-customers.html','Customers')}
        <li><a href="${root}account.html">← Storefront Account</a></li>
        <li><a href="#" onclick="event.preventDefault(); window.RR.auth.signOut(); location.href='${root}index.html'">Sign out</a></li>
      </ul>
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--rule-soft);font-size:.72rem;text-transform:uppercase;letter-spacing:.14em;color:var(--ash)">
        Demo Mode · localStorage
      </div>
    </aside>`;
  }

  async function renderAdminDashboard() {
    const wrap = $('#admin-page');
    if (!wrap) return;
    if (!Admin.requireAdmin()) return;
    const all = await Admin.allProducts();
    const cat = Admin.catalog();
    const orders = Orders.list();
    const created = cat.created.length;
    const edited = Object.keys(cat.edits).length;
    const deleted = cat.deleted.length;
    wrap.innerHTML = `
      <div class="container account-grid">
        ${adminNav('overview')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Admin</span><h2>Dashboard</h2></div></div>
          <div class="stat-grid">
            <div class="stat-card"><div class="stat-card__label">Total products</div><div class="stat-card__value">${all.length}</div></div>
            <div class="stat-card"><div class="stat-card__label">New (created)</div><div class="stat-card__value">${created}</div></div>
            <div class="stat-card"><div class="stat-card__label">Edited</div><div class="stat-card__value">${edited}</div></div>
            <div class="stat-card"><div class="stat-card__label">Hidden</div><div class="stat-card__value">${deleted}</div></div>
          </div>
          <h3 class="account-section-title">Quick actions</h3>
          <div class="quick-links">
            <a class="quick-link" href="${root}admin-product-edit.html?new=1"><strong>Add product</strong><span>Create a new piece in the catalog</span></a>
            <a class="quick-link" href="${root}admin-products.html"><strong>Manage products</strong><span>Edit, hide, or delete existing items</span></a>
            <a class="quick-link" href="${root}admin-content.html"><strong>Site content</strong><span>Banner, hero copy, footer text</span></a>
            <a class="quick-link" href="${root}admin-orders.html"><strong>Orders (${orders.length})</strong><span>View incoming orders</span></a>
          </div>
          <h3 class="account-section-title">Backup & restore</h3>
          <div class="backup-row">
            <button class="btn btn--ghost" onclick="window.RR.admin.downloadBackup()">⬇ Download backup</button>
            <button class="btn btn--ghost" onclick="document.getElementById('import-input').click()">⬆ Import backup</button>
            <input type="file" id="import-input" hidden accept=".json" onchange="window.RR.admin.handleImport(event)">
            <button class="btn btn--ghost" onclick="if(confirm('Reset all admin changes?')){window.RR.admin.reset();location.reload();}">↻ Reset to defaults</button>
          </div>
        </section>
      </div>`;
  }

  async function renderAdminProducts() {
    const wrap = $('#admin-products-page');
    if (!wrap) return;
    if (!Admin.requireAdmin()) return;
    const all = await Admin.allProducts();
    const rows = all.map(p => `
      <div class="admin-row">
        <div class="admin-row__thumb">${p.image ? `<img src="${root}${p.image}" alt="">` : '<div class="card__placeholder" style="width:100%;height:100%">No img</div>'}</div>
        <div class="admin-row__name">
          <a href="${root}${p.url}" target="_blank">${escapeHtml(p.name)}</a>
          ${p._isNew ? '<span class="badge" style="background:var(--blood);margin-left:.5rem">New</span>' : ''}
          <div class="muted t-mono" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;margin-top:.2rem">${escapeHtml(p.category||'')}</div>
        </div>
        <div class="admin-row__price">${escapeHtml(p.price)}</div>
        <div class="admin-row__id muted t-mono">${escapeHtml(p.id.slice(0,10))}…</div>
        <div class="admin-row__actions">
          <a class="btn btn--ghost" href="${root}admin-product-edit.html?id=${encodeURIComponent(p.id)}">Edit</a>
          <button class="btn btn--ghost" onclick="if(confirm('Hide \\'${escapeHtml(p.name).replace(/'/g, "\\\\'")}\\' from the catalog?')){window.RR.admin.delete('${p.id}');location.reload();}">Delete</button>
        </div>
      </div>`).join('');
    wrap.innerHTML = `
      <div class="container account-grid">
        ${adminNav('products')}
        <section class="account-main">
          <div class="section-head">
            <div class="section-head__left"><span class="eyebrow">Catalog</span><h2>Products <span style="color:var(--ash-2);font-size:.6em">${all.length}</span></h2></div>
            <a class="btn" href="${root}admin-product-edit.html?new=1">+ Add product</a>
          </div>
          <div class="admin-search">
            <input id="admin-search-input" placeholder="Search by name…" oninput="window.RR.admin.filterProducts(this.value)">
          </div>
          <div class="admin-table">
            <div class="admin-row admin-row--head">
              <div></div>
              <div>Product</div>
              <div>Price</div>
              <div>ID</div>
              <div></div>
            </div>
            <div id="admin-rows">${rows}</div>
          </div>
        </section>
      </div>`;
  }

  async function renderAdminProductEdit() {
    const wrap = $('#admin-product-edit-page');
    if (!wrap) return;
    if (!Admin.requireAdmin()) return;
    const params = new URLSearchParams(location.search);
    const isNew = params.get('new') === '1';
    const id = params.get('id');
    const all = await Admin.allProducts();
    const p = isNew ? {
      id: '', name: '', price: '$0.00', price_value: 0, image: '', category: '', category_id: '', description: '',
    } : all.find(x => x.id === id);
    if (!p) {
      wrap.innerHTML = `<div class="container"><p class="muted">Product not found. <a href="${root}admin-products.html">Back →</a></p></div>`;
      return;
    }
    const cats = Array.from(new Set(all.map(x => x.category).filter(Boolean))).sort();
    wrap.innerHTML = `
      <div class="container account-grid">
        ${adminNav('products')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">${isNew ? 'New product' : 'Edit product'}</span><h2>${isNew ? 'Add Product' : escapeHtml(p.name)}</h2></div>
            <a class="btn btn--ghost" href="${root}admin-products.html">← Back to products</a>
          </div>
          <form id="admin-prod-form" class="admin-form">
            <div class="admin-form__grid">
              <div class="admin-form__main">
                <label class="field"><span>Name</span><input required name="name" value="${escapeHtml(p.name)}"></label>
                <label class="field"><span>Description (HTML allowed)</span><textarea name="description" rows="10">${escapeHtml(p.description || '')}</textarea></label>
              </div>
              <div class="admin-form__side">
                <label class="field"><span>Price ($)</span><input required type="number" step="0.01" name="price_value" value="${Number(p.price_value || 0).toFixed(2)}"></label>
                <label class="field"><span>Category</span>
                  <select name="category">
                    <option value="">— Select —</option>
                    ${cats.map(c => `<option ${c===p.category?'selected':''} value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
                  </select>
                </label>
                <label class="field"><span>Sizes (comma-separated)</span><input name="sizes" value="${escapeHtml(p.sizes || 'S, M, L, XL')}"></label>
                <label class="field"><span>Image URL or path</span><input name="image" placeholder="images/abc123.jpg" value="${escapeHtml(p.image || '')}"></label>
                ${p.image ? `<div style="margin-top:.5rem"><img src="${root}${p.image}" style="width:100%;max-height:200px;object-fit:cover;border:1px solid var(--rule-soft)"></div>` : ''}
                <div style="margin-top:1rem;font-family:var(--f-mono);font-size:.72rem;color:var(--ash);text-transform:uppercase;letter-spacing:.1em">
                  ID: ${escapeHtml(p.id || '(auto-assigned)')}
                </div>
              </div>
            </div>
            <div class="admin-form__actions">
              <button class="btn btn--lg" type="submit">${isNew ? 'Create product' : 'Save changes'}</button>
              ${isNew ? '' : `<a class="btn btn--ghost btn--lg" href="${root}${p.url}" target="_blank">Preview →</a>`}
              ${isNew ? '' : `<button class="btn btn--ghost btn--lg" type="button" onclick="if(confirm('Hide this product?')){window.RR.admin.delete('${p.id}');location.href='${root}admin-products.html';}" style="margin-left:auto;color:#b91c1c">Delete</button>`}
            </div>
          </form>
        </section>
      </div>`;
    $('#admin-prod-form').addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const patch = {
        name: data.name,
        price: '$' + Number(data.price_value).toFixed(2),
        price_value: Number(data.price_value),
        category: data.category,
        sizes: data.sizes,
        image: data.image || p.image,
        description: data.description,
      };
      if (isNew) {
        Admin.create(patch);
      } else {
        Admin.update(p.id, patch);
      }
      location.href = root + 'admin-products.html';
    });
  }

  async function renderAdminContent() {
    const wrap = $('#admin-content-page');
    if (!wrap) return;
    if (!Admin.requireAdmin()) return;
    const c = Admin.siteContent();
    wrap.innerHTML = `
      <div class="container account-grid">
        ${adminNav('content')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">CMS</span><h2>Site Content</h2></div></div>
          <p class="muted">Edit live site copy. Changes apply immediately on the storefront.</p>

          <form id="admin-content-form" class="admin-form" style="max-width:760px">
            <h3 class="account-section-title">Announcement bar (one per line)</h3>
            <label class="field"><textarea name="announce" rows="6">${escapeHtml((c.announce || []).join('\n'))}</textarea></label>

            <h3 class="account-section-title">Hero section</h3>
            <label class="field"><span>Eyebrow text</span><input name="hero_eyebrow" value="${escapeHtml(c.hero_eyebrow || '')}"></label>
            <label class="field"><span>Hero headline</span><input name="hero_title" value="${escapeHtml(c.hero_title || '')}"></label>
            <div class="form-grid">
              <label class="field"><span>Primary CTA</span><input name="hero_cta_primary" value="${escapeHtml(c.hero_cta_primary || '')}"></label>
              <label class="field"><span>Secondary CTA</span><input name="hero_cta_secondary" value="${escapeHtml(c.hero_cta_secondary || '')}"></label>
            </div>

            <h3 class="account-section-title">Footer</h3>
            <label class="field"><span>Brand blurb</span><textarea name="footer_blurb" rows="3">${escapeHtml(c.footer_blurb || '')}</textarea></label>

            <div class="admin-form__actions" style="margin-top:1.5rem">
              <button class="btn btn--lg" type="submit">Save & publish</button>
              <a class="btn btn--ghost btn--lg" href="${root}index.html" target="_blank">View live site →</a>
            </div>
          </form>
        </section>
      </div>`;
    $('#admin-content-form').addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      Admin.saveSiteContent({
        announce: (data.announce || '').split('\n').map(s => s.trim()).filter(Boolean),
        hero_eyebrow: data.hero_eyebrow,
        hero_title: data.hero_title,
        hero_cta_primary: data.hero_cta_primary,
        hero_cta_secondary: data.hero_cta_secondary,
        footer_blurb: data.footer_blurb,
      });
      const btn = e.target.querySelector('button[type=submit]');
      btn.textContent = '✓ SAVED';
      setTimeout(() => btn.textContent = 'Save & publish', 1800);
    });
  }

  async function renderAdminOrders() {
    const wrap = $('#admin-orders-page');
    if (!wrap) return;
    if (!Admin.requireAdmin()) return;
    const orders = Orders.list();
    const rows = orders.length ? orders.map(o => `
      <a class="order-row" href="${root}account-order.html?id=${encodeURIComponent(o.number)}">
        <div><span class="muted">Order</span><div class="t-mono" style="font-weight:600">#${o.number}</div></div>
        <div><span class="muted">Customer</span><div>${escapeHtml(o.email||'—')}</div></div>
        <div><span class="muted">Date</span><div>${new Date(o.date).toLocaleDateString()}</div></div>
        <div><span class="muted">Total</span><div class="t-mono" style="font-weight:600">${fmt(o.total)}</div></div>
        <div><span class="badge">Processing</span></div>
      </a>`).join('') : `<p class="muted">No orders yet. Place a test order from the storefront.</p>`;
    wrap.innerHTML = `
      <div class="container account-grid">
        ${adminNav('orders')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Orders</span><h2>All Orders <span style="color:var(--ash-2);font-size:.6em">${orders.length}</span></h2></div></div>
          <div class="orders">${rows}</div>
        </section>
      </div>`;
  }

  async function renderAdminCustomers() {
    const wrap = $('#admin-customers-page');
    if (!wrap) return;
    if (!Admin.requireAdmin()) return;
    const u = Auth.user();
    const orders = Orders.list();
    // In demo, the only "customer" is the signed-in user
    wrap.innerHTML = `
      <div class="container account-grid">
        ${adminNav('customers')}
        <section class="account-main">
          <div class="section-head"><div class="section-head__left"><span class="eyebrow">Customers</span><h2>Customer List</h2></div></div>
          <div class="orders">
            <div class="order-row">
              <div><span class="muted">Name</span><div style="font-weight:600">${escapeHtml(u.name)}</div></div>
              <div><span class="muted">Email</span><div>${escapeHtml(u.email)}</div></div>
              <div><span class="muted">Orders</span><div class="t-mono">${orders.length}</div></div>
              <div><span class="muted">Total spend</span><div class="t-mono">${fmt(orders.reduce((n,o)=>n+(o.total||0),0))}</div></div>
              <div><span class="badge">Active</span></div>
            </div>
          </div>
          <p class="muted" style="margin-top:1rem">Demo mode: the only customer record is the signed-in user. In production, this would list all customer accounts with filtering, segmentation, and bulk actions.</p>
        </section>
      </div>`;
  }

  async function renderPreviewProduct() {
    const wrap = $('#preview-product-page');
    if (!wrap) return;
    const id = new URLSearchParams(location.search).get('id');
    const all = await Admin.allProducts();
    const p = all.find(x => x.id === id);
    if (!p) {
      wrap.innerHTML = `<div class="container"><p class="muted">Product not found. <a href="${root}shop.html">Back to shop →</a></p></div>`;
      return;
    }
    const sizes = (p.sizes || 'S,M,L,XL').split(',').map(s => s.trim()).filter(Boolean);
    wrap.innerHTML = `
      <div class="container">
        <div class="crumbs">
          <a href="${root}index.html">Home</a><span class="sep">/</span>
          <a href="${root}shop.html">Shop</a><span class="sep">/</span>
          ${escapeHtml(p.category||'')}<span class="sep">/</span>
          ${escapeHtml(p.name)}
        </div>
      </div>
      <div class="container">
        <article class="pdp">
          <div class="gallery">
            <div class="gallery__main">${p.image ? `<img src="${root}${p.image}" alt="${escapeHtml(p.name)}">` : '<div class="card__placeholder" style="height:100%;padding:2rem">No image</div>'}</div>
          </div>
          <div class="pdp__detail">
            <div class="pdp__cat">${escapeHtml(p.category||'')}</div>
            <h1 class="pdp__name">${escapeHtml(p.name)}</h1>
            <div class="pdp__price-row"><span class="pdp__price">${escapeHtml(p.price)}</span></div>
            ${sizes.length ? `<div class="pdp__group"><div class="pdp__group-title">Select size</div><div class="size-grid">${sizes.map(s => `<button type="button" class="size-btn">${escapeHtml(s)}</button>`).join('')}</div></div>` : ''}
            <div class="pdp__group">
              <div class="qty-row">
                <div class="stepper"><button>−</button><input type="text" value="1"><button>+</button></div>
                <button class="btn btn--lg" style="flex:1" onclick="window.RR.cart.add(${JSON.stringify(p).replace(/"/g, '&quot;')}, 1, null)">Add to bag</button>
              </div>
            </div>
            <div class="pdp__divider"></div>
            <div class="pdp__desc">${p.description || '<p>No description yet.</p>'}</div>
          </div>
        </article>
      </div>`;
  }

  Admin.filterProducts = function(q) {
    q = (q || '').toLowerCase();
    const rows = document.querySelectorAll('#admin-rows .admin-row');
    rows.forEach(r => {
      const name = (r.querySelector('.admin-row__name')?.textContent || '').toLowerCase();
      r.style.display = !q || name.includes(q) ? '' : 'none';
    });
  };
  Admin.downloadBackup = function() {
    const blob = new Blob([this.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rebel-reaper-backup-' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  Admin.handleImport = function(event) {
    const f = event.target.files && event.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const ok = this.importJSON(e.target.result);
      if (ok) { alert('Backup imported. Reloading.'); location.reload(); }
      else alert('Invalid backup file.');
    };
    reader.readAsText(f);
  };

  // Account helpers exposed (for inline onclick handlers in renderers)
  const Account = {
    addAddress() {
      const u = Auth.user(); if (!u) return;
      const label = prompt('Label this address (e.g. Home, Work):');
      if (!label) return;
      const addr = prompt('Street address:');
      const city = prompt('City:');
      const state = prompt('State (2 letters):');
      const zip = prompt('ZIP:');
      if (!addr) return;
      u.addresses = u.addresses || [];
      u.addresses.push({ id: Date.now(), label, name: u.name, addr, city, state, zip, isDefault: !u.addresses.length });
      set(KEYS.user, u);
      location.reload();
    },
    addCard() {
      const u = Auth.user(); if (!u) return;
      const num = prompt('Card number:');
      if (!num) return;
      const exp = prompt('Expiry (MM/YY):') || '';
      const last4 = num.replace(/\D/g,'').slice(-4);
      const brand = num.startsWith('4') ? 'VISA' : num.startsWith('5') ? 'MC' : num.startsWith('3') ? 'AMEX' : 'CARD';
      u.cards = u.cards || [];
      u.cards.push({ id: Date.now(), brand, last4, exp, isDefault: !u.cards.length });
      set(KEYS.user, u);
      location.reload();
    },
  };

  // Expose
  window.RR = { cart: Cart, wishlist: Wishlist, auth: Auth, orders: Orders, search: Search, recent: Recent, account: Account, admin: Admin, chat: Chat, render };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
