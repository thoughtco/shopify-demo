import { addGiftCardCodes, addLines, buyNow, getBuyerIdentity, getOrCreateCart, removeGiftCardCodes, removeLine, setCartAttributes, setCartNote, setDeliveryAddress, updateBuyerCountry, updateBuyerIdentity, updateDiscountCodes, updateLineQuantity } from './cart.js';
import { cartStorageKey, formatMoney } from './money.js';
import { sellingPlanLabel, sellingPlanPrice, sellingPlansForVariant } from './selling-plans.js';

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
        itemsTotal: null,
        itemsTotalAmount: null,
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

        // shopifyConfig.buyerIdentityUrl: pre-fill checkout for a logged in customer, once per
        // cart (and per market, in markets mode: the address must be in the market's country)
        async applyBuyerIdentity() {
            const key = cartStorageKey() + ':buyer';
            const country = window.shopifyConfig?.country || null;
            const marker = this.cartId + (country ? `|${country}` : '');

            if (! window.shopifyConfig?.buyerIdentityUrl || ! this.cartId || this.buyerIdentityCartId === marker) {
                return;
            }

            const cartId = this.cartId;
            this.buyerIdentityCartId = marker;

            try {
                if (localStorage.getItem(key) === marker) {
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

            // in markets mode, with no address in this market's country, remove one from another
            // market: it would move checkout to that market's currency
            if (deliveryAddress || country) {
                response = await setDeliveryAddress(cartId, deliveryAddress ?? null) ?? response;
            }

            if (response) {
                try {
                    localStorage.setItem(key, marker);
                } catch (error) {}

                this.updateFromResponse(response);
            }
        },

        /**
         * Add several lines to the cart (creating it if needed), e.g. to buy an order again.
         * Each line takes a `merchandiseId` or `variantId` (or a `variant` with an `id`, like
         * an order's line items), numeric or a GID; `quantity` (default 1); a `sellingPlanId`
         * (or `sellingPlan.sellingPlanId`); and `attributes` (or `customAttributes`).
         * Returns the cart, or undefined if the lines couldn't be added.
         */
        async addItems(lines) {
            const gid = (type, id) => id && ! String(id).startsWith('gid://') ? `gid://shopify/${type}/${id}` : id;

            lines = (lines ?? []).map((line) => {
                const merchandiseId = gid('ProductVariant', line.merchandiseId ?? line.variantId ?? line.variant?.id);
                const sellingPlanId = gid('SellingPlan', line.sellingPlanId ?? line.sellingPlan?.sellingPlanId);
                const attributes = (line.attributes ?? line.customAttributes ?? []).map(({ key, value }) => ({ key, value: value + '' }));

                return {
                    merchandiseId,
                    quantity: parseInt(line.quantity ?? 1) || 1,
                    ...(sellingPlanId ? { sellingPlanId } : {}),
                    ...(attributes.length ? { attributes } : {}),
                };
            }).filter(line => line.merchandiseId);

            if (! lines.length || ! await this.ensureCart()) {
                return;
            }

            const cart = await addLines(this.cartId, lines);
            this.updateFromResponse(cart);

            return cart;
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
                    // subscriptions: the line's selling plan ({ id, name, label }), or null for one-off purchases.
                    // Show `label` (its options, e.g. "Deliver every 2 months"): the name can include the
                    // discount in the shop's currency.
                    sellingPlan: line.sellingPlanAllocation?.sellingPlan ? {
                        id: line.sellingPlanAllocation.sellingPlan.id,
                        name: line.sellingPlanAllocation.sellingPlan.name,
                        label: sellingPlanLabel(line.sellingPlanAllocation.sellingPlan),
                    } : null,
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

            // the lines less their discounts: what to show as the bag's subtotal. `subtotal`
            // is Shopify's total, which includes shipping once the cart has a delivery address
            this.itemsTotalAmount = Math.round((mappedLineItems.reduce((total, line) => total + line.subtotalAmount, 0) - discountAmount) * 100) / 100;
            this.itemsTotal = this.formatCurrency(this.itemsTotalAmount, currencyCode);
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
    Alpine.data('shopifyProduct', (options, variants, sellingPlans = null) => ({
        added: false,
        buyingNow: false,
        customAttributes: {},
        options: options,
        selected: {},
        selectedVariant: false,
        variants: variants,
        variantEl: null,

        // subscriptions, from {{ shopify:selling_plans }}: { requires_selling_plan, groups }
        sellingPlanGroups: sellingPlans?.groups ?? [],
        requiresSellingPlan: Boolean(sellingPlans?.requires_selling_plan),
        purchaseType: sellingPlans?.requires_selling_plan ? 'subscription' : 'one_time',
        sellingPlanId: null,

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

            if (this.purchaseType === 'subscription') {
                this.sellingPlanId = this.availableSellingPlans()[0]?.id ?? null;
            }

            this.$watch?.('selectedVariant', () => this.syncPurchaseType());
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

        /**
         * Buy the selected variant straight away: a cart just for it, then its checkout
         * (with the store's express checkout buttons). The customer's cart isn't touched.
         * `options` are passed to buyNow() in cart.js (discountCodes, attributes, note).
         */
        async buyNow(options = {}) {
            const line = this.cartLine();

            if (! line || this.buyingNow) {
                return;
            }

            this.buyingNow = true;

            const cart = await buyNow([line], options);

            // stays true while the browser goes to checkout
            if (! cart) {
                this.buyingNow = false;
            }

            return cart;
        },

        /**
         * The CartLineInput for the selected variant, quantity, custom attributes and
         * selling plan, or null when there's no variant or a required plan is missing.
         */
        cartLine() {
            let variantId = this.variantEl?.value;

            if (! variantId) {
                return null;
            }

            // products that require a selling plan can't be bought without one
            if (! this.sellingPlanSatisfied()) {
                return null;
            }

            let attributes = [];
            for (const key in this.customAttributes) {
                attributes.push({key: key, value: this.customAttributes[key] + '' });
            }

            let line = {
                attributes: attributes,
                merchandiseId: "gid://shopify/ProductVariant/" + variantId,
                quantity: parseInt(this.$refs.qty?.value ?? 1) || 1,
            };

            const sellingPlanId = this.currentSellingPlan()?.id;

            if (sellingPlanId) {
                line.sellingPlanId = sellingPlanId;
            }

            return line;
        },

        async handleSubmit(target) {
            const line = this.cartLine();

            if (! line) {
                return;
            }

            let cart = await getOrCreateCart(Alpine.store('statamic.shopify.cart').cartId);

            // the error has been reported with a shopify.cart.error event
            if (! cart) {
                return;
            }

            let response = await addLines(cart.id, [line]);

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

        /**
         * The selling plans the selected variant can be bought on.
         */
        availableSellingPlans(variant = null) {
            return sellingPlansForVariant(this.sellingPlanGroups, variant ?? this.selectedVariant);
        },

        hasSellingPlans(variant = null) {
            return this.availableSellingPlans(variant).length > 0;
        },

        /**
         * Switch between 'one_time' and 'subscription'. Products that require a
         * selling plan stay on 'subscription'.
         */
        setPurchaseType(type) {
            this.purchaseType = this.requiresSellingPlan ? 'subscription' : type;

            if (this.purchaseType === 'subscription' && ! this.currentSellingPlan()) {
                this.sellingPlanId = this.availableSellingPlans()[0]?.id ?? null;
            }
        },

        /**
         * Back to a one-off purchase when the selected variant has no plans (and the
         * product doesn't require one), so it isn't added one-off while 'subscription'
         * is still selected. Runs when the selected variant changes.
         */
        syncPurchaseType() {
            if (this.purchaseType === 'subscription' && ! this.requiresSellingPlan && ! this.hasSellingPlans()) {
                this.purchaseType = 'one_time';
                this.sellingPlanId = null;
            }
        },

        selectSellingPlan(id) {
            this.sellingPlanId = id || null;

            if (this.sellingPlanId) {
                this.purchaseType = 'subscription';
            }
        },

        /**
         * The plan that will be added to the cart: the chosen one if the selected
         * variant can use it, else the variant's first plan. Null for one-off purchases.
         */
        currentSellingPlan() {
            if (this.purchaseType !== 'subscription') {
                return null;
            }

            const plans = this.availableSellingPlans();

            return plans.find(plan => plan.id === this.sellingPlanId) ?? plans[0] ?? null;
        },

        /**
         * False when the product requires a selling plan but the variant has none to use.
         */
        sellingPlanSatisfied() {
            return ! this.requiresSellingPlan || Boolean(this.currentSellingPlan());
        },

        /**
         * A variant's price on a plan (defaults to the selected variant and plan), as a
         * number. In markets mode this is the exact market price imported for the plan;
         * without one, fixed amount adjustments are in the shop's currency, so a market's
         * price only has percentage discounts applied (null otherwise).
         */
        getSellingPlanPrice(plan = null, variant = null) {
            plan = plan ?? this.currentSellingPlan();
            variant = variant ?? this.selectedVariant;

            if (! plan || ! variant) {
                return null;
            }

            const inMarket = Boolean(this.getMarketData(variant)?.price);

            return sellingPlanPrice(plan, this.getVariantPrice(variant), {
                inShopCurrency: ! inMarket,
                variant,
                market: this.market,
            });
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
