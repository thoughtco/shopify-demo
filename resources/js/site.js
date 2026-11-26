import Alpine from 'alpinejs';
import collapse from '@alpinejs/collapse';
import focus from '@alpinejs/focus';
import { createData, createStore } from './vendor/shopify/alpine';
import { formatMoney } from './vendor/shopify/money';

window.Alpine = Alpine;

Alpine.plugin(collapse);
Alpine.plugin(focus);

const markets = window.demoMarkets ?? {};

// Apply the shopper's saved market before the addon's stores start, so the first
// render (prices, stock and the cart) is already in that market
const applyMarket = (code) => {
    Object.assign(window.shopifyConfig, {
        market: code,
        country: code,
        currency: markets[code].currency,
        currencyCode: markets[code].currency_code,
    });
};

const savedMarket = localStorage.getItem('demo.market');

if (window.shopifyConfig?.market && markets[savedMarket]) {
    applyMarket(savedMarket);
}

// The addon's cart store (statamic.shopify.cart) and product component (shopifyProduct)
createStore(Alpine);
createData(Alpine);

/**
 * The shopper's market. Markets are configured in config/shopify.php and output by the
 * layout as window.demoMarkets; changing market tells the addon (shopify.updateMarket),
 * which reprices the cart in that market's currency.
 */
Alpine.store('market', {
    code: window.shopifyConfig?.market ?? null,
    markets,

    get current() {
        return this.markets[this.code] ?? null;
    },

    set(code) {
        if (! this.markets[code]) {
            return;
        }

        this.code = code;
        localStorage.setItem('demo.market', code);

        applyMarket(code);
        window.dispatchEvent(new CustomEvent('shopify.updateMarket', { detail: { market: code } }));
    },

    format(amount) {
        return formatMoney(amount, this.current?.currency_code ?? null);
    },
});

Alpine.store('drawer', {
    open: false,

    show() {
        this.open = true;
    },

    hide() {
        this.open = false;
    },
});

// The bag's lines before discounts, and its subtotal after them (before shipping and taxes).
// The cart store's `subtotal` is Shopify's total, which includes shipping once the cart has a
// delivery address (for example when checkout is pre-filled for a logged in customer).
const bagItemsAmount = (cart) => cart.lineItems.reduce((total, item) => total + item.subtotalAmount, 0);
window.bagItems = (cart) => cart.formatCurrency(bagItemsAmount(cart), cart.currencyCode);
window.bagSubtotal = (cart) => cart.formatCurrency(bagItemsAmount(cart) - (cart.discountAmount ?? 0), cart.currencyCode);

// Surface cart errors
window.addEventListener('shopify.cart.error', (event) => {
    Alpine.store('toast').show(event.detail?.errors?.[0]?.message ?? 'Something went wrong talking to Shopify.');
});

Alpine.store('toast', {
    message: null,
    timer: null,

    show(message) {
        this.message = message;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.message = null, 5000);
    },
});

// Product page gallery, which follows the selected variant's image
Alpine.data('gallery', (images) => ({
    images,
    active: 0,

    show(url) {
        const index = this.images.findIndex((image) => image === url);

        if (index !== -1) {
            this.active = index;
        }
    },
}));

Alpine.start();
