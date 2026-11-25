import { addGiftCardCodes, addLines, getBuyerIdentity, getOrCreateCart, removeGiftCardCodes, removeLine, setCartAttributes, setCartNote, setDeliveryAddress, updateBuyerCountry, updateBuyerIdentity, updateDiscountCodes, updateLineQuantity } from './cart.js';
import { cartStorageKey, formatMoney } from './money.js';

const createStore = (Alpine) => {
    Alpine.store('statamic.shopify.cart', {
        buyerIdentityCartId: null,
        cartId: null,
        checkoutUrl: '',
        currencyCode: null,
        discount: null,
        discountAmount: 0,
        discountCodes: [],
        giftCards: [],
        itemsSubtotal: null,
        itemsSubtotalAmount: null,
        lineItems: [],
        market: window.shopifyConfig?.market,
        note: '',
        subtotal: null,
        subtotalAmount: null,

        async init() {
            this.cartId = localStorage.getItem(cartStorageKey());

            if (this.cartId) {
                this.updateFromResponse(await getOrCreateCart(this.cartId));
            }

            window.addEventListener('shopify.updateMarket', (event) => {
                this.market = event.detail.market;

                // markets mode: move the cart to the new market so checkout uses its prices and currency
                if (window.shopifyConfig?.country && event.detail.market) {
                    window.shopifyConfig.country = event.detail.market.toUpperCase();

                    if (this.cartId) {
                        updateBuyerCountry(this.cartId, window.shopifyConfig.country).then(response => this.updateFromResponse(response));
                    }
                }
            });
        },

        // shopifyConfig.buyerIdentityUrl: pre-fill checkout for a logged in customer, once per cart
        async applyBuyerIdentity() {
            const key = cartStorageKey() + ':buyer';

            if (! window.shopifyConfig?.buyerIdentityUrl || ! this.cartId || this.buyerIdentityCartId === this.cartId) {
                return;
            }

            const cartId = this.buyerIdentityCartId = this.cartId;

            try {
                if (localStorage.getItem(key) === cartId) {
                    return;
                }
            } catch (error) {}

            const identity = await getBuyerIdentity();

            if (! identity) {
                return;
            }

            // set separately, so one Shopify rejects (reported with shopify.cart.error, e.g.
            // an email it considers invalid) doesn't stop the other
            const { deliveryAddress, ...buyerIdentity } = identity;
            let response = Object.keys(buyerIdentity).length ? await updateBuyerIdentity(cartId, buyerIdentity) : undefined;

            if (deliveryAddress) {
                response = await setDeliveryAddress(cartId, deliveryAddress) ?? response;
            }

            if (response) {
                try {
                    localStorage.setItem(key, cartId);
                } catch (error) {}

                this.updateFromResponse(response);
            }
        },

        /**
         * Add a discount code, keeping the cart's other codes. A code that doesn't
         * apply to the cart is kept with applicable: false (see discountCodes).
         */
        async applyDiscountCode(code) {
            code = (code ?? '').trim();

            if (! code || ! await this.ensureCart()) {
                return;
            }

            const codes = this.discountCodes.map(discount => discount.code)
                .filter(existing => existing.toLowerCase() !== code.toLowerCase());

            return this.updateFromResponse(await updateDiscountCodes(this.cartId, [...codes, code]));
        },

        async applyGiftCardCode(code) {
            code = (code ?? '').trim();

            if (! code || ! await this.ensureCart()) {
                return;
            }

            return this.updateFromResponse(await addGiftCardCodes(this.cartId, [code]));
        },

        /**
         * The cart id, creating a cart first if there isn't one yet.
         */
        async ensureCart() {
            if (! this.cartId) {
                this.updateFromResponse(await getOrCreateCart());
            }

            return this.cartId;
        },

        formatCurrency(amount, currencyCode = null) {
            return formatMoney(amount, currencyCode ?? this.currencyCode);
        },

        getItems() {
            return this.lineItems;
        },

        async removeDiscountCode(code) {
            if (! this.cartId) {
                return;
            }

            const codes = this.discountCodes.map(discount => discount.code)
                .filter(existing => existing.toLowerCase() !== (code ?? '').toLowerCase());

            return this.updateFromResponse(await updateDiscountCodes(this.cartId, codes));
        },

        async removeGiftCard(id) {
            if (! this.cartId) {
                return;
            }

            return this.updateFromResponse(await removeGiftCardCodes(this.cartId, [id]));
        },

        removeLine(id) {
            removeLine(this.cartId, id).then(response => this.updateFromResponse(response));
        },

        setAttributes(attrs) {
            setCartAttributes(this.cartId, attrs).then(response => this.updateFromResponse(response));
        },

        setNote(note) {
            setCartNote(this.cartId, note).then(response => this.updateFromResponse(response));
        },

        updateQuantity(id, quantity) {
            updateLineQuantity(this.cartId, id, quantity).then(response => this.updateFromResponse(response));
        },

        updateFromResponse(checkout) {
            // failed requests resolve to nothing (see the shopify.cart.error event)
            if (! checkout) {
                return;
            }

            const currencyCode = checkout.cost.totalAmount.currencyCode;
            const discountedAmount = (allocations) => (allocations ?? []).reduce((total, allocation) => total + parseFloat(allocation.discountedAmount.amount), 0);
            let discountAmount = 0;
            let mappedLineItems = [];
            for (let line of checkout.lines.edges) {
                line = line.node;

                let attrs = {};
                line.attributes.forEach((attr) => attrs[attr.key] = attr.value);

                let qty = line.quantity;
                let amount = parseFloat(line.cost.amountPerQuantity.amount);
                let lineDiscount = discountedAmount(line.discountAllocations);
                discountAmount += lineDiscount;

                mappedLineItems.push({
                    id: line.id,
                    // the line's discounts (from discount codes and automatic discounts)
                    discount: lineDiscount ? this.formatCurrency(lineDiscount, currencyCode) : null,
                    discountAmount: lineDiscount,
                    title: line.merchandise.product.title,
                    variant: {
                        title: line.merchandise.title,
                        id: line.merchandise.id,
                    },
                    price: this.formatCurrency(amount, currencyCode),
                    qty: qty,
                    subtotal: this.formatCurrency(amount * qty, currencyCode),
                    // unformatted values, for formatting prices yourself
                    amount: amount,
                    subtotalAmount: amount * qty,
                    currencyCode: currencyCode,
                    image: line.merchandise?.image?.url,
                    attributes: attrs,
                });
            }

            this.cartId = checkout.id;
            this.currencyCode = currencyCode;
            this.lineItems = mappedLineItems;
            this.note = checkout.note;
            this.subtotal = this.formatCurrency(checkout.cost.totalAmount.amount, currencyCode);
            this.subtotalAmount = parseFloat(checkout.cost.totalAmount.amount);
            this.checkoutUrl = checkout.checkoutUrl;
            // order-level discounts aren't allocated to the lines, so add the cart's own
            // allocations (deprecated in 2026-01, but the only place these are returned)
            discountAmount += discountedAmount(checkout.discountAllocations);

            this.discount = discountAmount ? this.formatCurrency(discountAmount, currencyCode) : null;
            this.discountAmount = discountAmount;
            this.discountCodes = (checkout.discountCodes ?? []).map(({ code, applicable }) => ({ code, applicable }));
            this.giftCards = (checkout.appliedGiftCards ?? []).map(card => ({
                id: card.id,
                lastCharacters: card.lastCharacters,
                amountUsed: this.formatCurrency(card.amountUsed.amount, card.amountUsed.currencyCode),
                amountUsedAmount: parseFloat(card.amountUsed.amount),
                balance: this.formatCurrency(card.balance.amount, card.balance.currencyCode),
                balanceAmount: parseFloat(card.balance.amount),
                currencyCode: card.amountUsed.currencyCode,
            }));

            if (checkout.cost.subtotalAmount) {
                this.itemsSubtotal = this.formatCurrency(checkout.cost.subtotalAmount.amount, currencyCode);
                this.itemsSubtotalAmount = parseFloat(checkout.cost.subtotalAmount.amount);
            }

            localStorage.setItem(cartStorageKey(), this.cartId);

            this.applyBuyerIdentity();

            return checkout;
        }
    });
}

const createData = (Alpine) => {
    Alpine.data('shopifyProduct', (options, variants) => ({
        added: false,
        customAttributes: {},
        options: options,
        selected: {},
        selectedVariant: false,
        variants: variants,
        variantEl: null,

        // markets mode: the active market, kept by the cart store (it follows shopify.updateMarket)
        get market() {
            return Alpine.store('statamic.shopify.cart')?.market ?? window.shopifyConfig?.market ?? null;
        },

        init() {
            this.variantEl = this.$el.querySelector('[name="ss-product-variant"]');

            if (! variants.length) {
                return;
            }

            if (! options) {
                options = {};
                this.options = options;
            }

            this.selectedVariant = variants[0];
            
            if (this.variantEl) {
                this.variantEl.value = this.selectedVariant.slug;
            }

            for (const [key, value] of Object.entries(options)) {
                this.selected[key] = this.selectedVariant[key];
            }
        },

        allOptionsSelected() {
            let selectedValues = [];

            for (const [key, value] of Object.entries(options)) {
                if (this.selected[key] ?? false) {
                    selectedValues.push(this.selected[key]);
                }
            }

            return selectedValues.length == Object.values(options).length;
        },

        getOptions(index, value) {
            let vals = [];
            Object.values(variants).forEach((opt) => {
                vals.push(opt[index]);
            });

            return [... new Set(vals)];
        },

        async handleSubmit(target) {
            let variantId = this.variantEl.value;

            if (! variantId) {
                return;
            }

            let attributes = [];
            for (const key in this.customAttributes) {
                attributes.push({key: key, value: this.customAttributes[key] + '' });
            }

            let qty = parseInt(this.$refs.qty.value);

            let cart = await getOrCreateCart(Alpine.store('statamic.shopify.cart').cartId);

            // the error has been reported with a shopify.cart.error event
            if (! cart) {
                return;
            }

            let response = await addLines(cart.id, [{
                attributes: attributes,
                merchandiseId: "gid://shopify/ProductVariant/" + variantId,
                quantity: qty,
            }]);

            if (! response) {
                return;
            }

            Alpine.store('statamic.shopify.cart').updateFromResponse(response);

            this.added = true;
            setTimeout(() => this.added = false, 3500);
        },

        optionChange(index, value) {
            this.selected[index] = value;
        },

        getMarketData(variant) {
            if (! this.market || !variant.market_data) return null;
            return variant.market_data[this.market] ?? null;
        },

        getVariantPrice(variant) {
            return this.getMarketData(variant)?.price ?? variant.price;
        },

        outOfStock(variant) {
            const marketData = this.getMarketData(variant);
            const qty = marketData ? marketData.inventory_quantity : variant.inventory_quantity;
            return variant.inventory_policy && (variant.inventory_policy.toLowerCase() == 'deny') && (qty <= 0);
        },

        variantExistsAndIsInStock() {
            let filteredVariants = variants;

            for (const [key, value] of Object.entries(options)) {
                filteredVariants = filteredVariants.filter((variant) => {
                    return variant[key] == this.selected[key] ?? false;
                });
            }

            if (filteredVariants.length == 1) {
                this.variantEl.value = filteredVariants[0].slug;
                this.selectedVariant = filteredVariants[0];

                this.selectedVariant.out_of_stock = this.outOfStock(this.selectedVariant);

                return ! this.selectedVariant.out_of_stock;
            }

            if (this.selectedVariant) {
                this.selectedVariant.out_of_stock = this.outOfStock(this.selectedVariant);
            }

            return this.selectedVariant && ! this.selectedVariant.out_of_stock;
        },
    }));
};

export {
    createData,
    createStore,
};
