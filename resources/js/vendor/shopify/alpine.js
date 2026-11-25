import { addLines, getOrCreateCart, removeLine, setCartAttributes, setCartNote, updateBuyerCountry, updateLineQuantity } from './cart.js';
import { cartStorageKey, formatMoney } from './money.js';
import { sellingPlanLabel, sellingPlanPrice, sellingPlansForVariant } from './selling-plans.js';

const createStore = (Alpine) => {
    Alpine.store('statamic.shopify.cart', {
        cartId: null,
        checkoutUrl: '',
        currencyCode: null,
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

        formatCurrency(amount, currencyCode = null) {
            return formatMoney(amount, currencyCode ?? this.currencyCode);
        },

        getItems() {
            return this.lineItems;
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
            let mappedLineItems = [];
            for (let line of checkout.lines.edges) {
                line = line.node;

                let attrs = {};
                line.attributes.forEach((attr) => attrs[attr.key] = attr.value);

                let qty = line.quantity;
                let amount = parseFloat(line.cost.amountPerQuantity.amount);

                mappedLineItems.push({
                    id: line.id,
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

            localStorage.setItem(cartStorageKey(), this.cartId);
        }
    });
}

const createData = (Alpine) => {
    Alpine.data('shopifyProduct', (options, variants, sellingPlans = null) => ({
        added: false,
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

            // products that require a selling plan can't be bought without one
            if (! this.sellingPlanSatisfied()) {
                return;
            }

            const sellingPlanId = this.currentSellingPlan()?.id;

            let cart = await getOrCreateCart(Alpine.store('statamic.shopify.cart').cartId);

            // the error has been reported with a shopify.cart.error event
            if (! cart) {
                return;
            }

            let line = {
                attributes: attributes,
                merchandiseId: "gid://shopify/ProductVariant/" + variantId,
                quantity: qty,
            };

            if (sellingPlanId) {
                line.sellingPlanId = sellingPlanId;
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
