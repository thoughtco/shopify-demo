/**
 * Selling plan (subscription) helpers for the data the addon imports: a product's
 * `selling_plan_groups` and each variant's `selling_plan_ids`. Mirrors
 * Thoughtco\Shopify\Support\SellingPlans.
 *
 * A plan looks like:
 * { id, name, description, options, recurring_deliveries,
 *   pricing_policies: [{ adjustment_type, adjustment_value, after_cycle }] }
 */

/**
 * Every plan in the groups, with its group's name and app on each.
 */
const allSellingPlans = (groups = []) => (groups ?? []).flatMap(group => (group.selling_plans ?? []).map(plan => ({
    ...plan,
    group_name: group.name,
    app_id: group.app_id ?? null,
})));

/**
 * The plans that can be used with a variant. Variants imported before selling plans
 * (without `selling_plan_ids`) can use all of the product's plans.
 */
const sellingPlansForVariant = (groups = [], variant = null) => {
    const plans = allSellingPlans(groups);
    const ids = variant?.selling_plan_ids;

    if (! Array.isArray(ids)) {
        return plans;
    }

    return plans.filter(plan => ids.includes(plan.id));
};

/**
 * The pricing policy for the first delivery: the one with no after_cycle (or 0).
 * Later cycles (e.g. "10% off after the 3rd order") don't change the price shown.
 */
/**
 * A plan's label for a storefront: its option values (e.g. "Deliver every 2 months"),
 * falling back to its name. Apps such as Shopify Subscriptions put the discount in the
 * name in the shop's currency ("Deliver every 2 months, £3.00 off"), which is wrong in
 * other markets. Takes imported plans (options as strings) and Storefront API plans
 * (options as { name, value }). Mirrors SellingPlans::label().
 */
const sellingPlanLabel = (plan) => {
    const options = (plan?.options ?? [])
        .map(option => (typeof option === 'object' && option !== null ? option.value : option))
        .filter(value => value !== null && value !== undefined && String(value) !== '');

    return options.length ? options.join(', ') : (plan?.name ?? null);
};

const initialPricingPolicy = (plan) => (plan?.pricing_policies ?? []).find(policy => ! policy.after_cycle) ?? null;

/**
 * A variant's exact price on a plan in a market, imported from the Storefront API
 * (variant.market_data[market].selling_plans[planId].price), as a number or null.
 */
const marketSellingPlanPrice = (variant, market, planId) => {
    const price = parseFloat(variant?.market_data?.[market]?.selling_plans?.[planId]?.price);

    return Number.isNaN(price) ? null : price;
};

/**
 * The price of a variant on a plan, as a number, or null when it can't be worked out.
 *
 * Pass `variant` and `market` (markets mode) to use the exact market price imported
 * for the plan, which matches checkout. Without one, a fixed amount or price
 * adjustment is in the shop's currency, so isn't applied to a market's price (pass
 * `inShopCurrency: false`); the cart's sellingPlanAllocation has the exact price once added.
 */
const sellingPlanPrice = (plan, price, { inShopCurrency = true, variant = null, market = null } = {}) => {
    if (market && variant) {
        const marketPrice = marketSellingPlanPrice(variant, market, plan?.id);

        if (marketPrice !== null) {
            return marketPrice;
        }
    }

    const amount = parseFloat(price);

    if (Number.isNaN(amount)) {
        return null;
    }

    const policy = initialPricingPolicy(plan);

    if (! policy) {
        return amount;
    }

    const value = parseFloat(policy.adjustment_value);

    if (Number.isNaN(value)) {
        return amount;
    }

    switch (policy.adjustment_type) {
        case 'PERCENTAGE':
            return Math.max(0, Math.round(amount * (100 - value)) / 100);
        case 'FIXED_AMOUNT':
            return inShopCurrency ? Math.max(0, Math.round((amount - value) * 100) / 100) : null;
        case 'PRICE':
            return inShopCurrency ? value : null;
        default:
            return amount;
    }
};

export {
    sellingPlanLabel,
    allSellingPlans,
    initialPricingPolicy,
    marketSellingPlanPrice,
    sellingPlanPrice,
    sellingPlansForVariant,
};
