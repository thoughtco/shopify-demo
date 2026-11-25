import client from './client.js';

const cartQuery = `
      id
      buyerIdentity {
        countryCode
      }
      checkoutUrl
      cost {
        subtotalAmount {
          amount
          currencyCode
        }
        totalAmount {
          amount
          currencyCode
        }
      }
      lines(first: 250) {
        edges {
          node {
            attributes {
                key
                value
            }
            discountAllocations {
              discountedAmount {
                amount
                currencyCode
              }
            }
            cost {
              amountPerQuantity {
                amount
                currencyCode
              }
            }
            id
            merchandise {
              ... on ProductVariant {
                id
                image {
                  url
                }
                title
                product {
                   title
                }
                sku
              }
            }
            quantity
            sellingPlanAllocation {
              sellingPlan {
                id
                name
                options {
                  name
                  value
                }
              }
              priceAdjustments {
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
      note
      discountAllocations {
        discountedAmount {
          amount
          currencyCode
        }
      }
      discountCodes {
        code
        applicable
      }
      appliedGiftCards {
        id
        lastCharacters
        amountUsed {
          amount
          currencyCode
        }
        balance {
          amount
          currencyCode
        }
      }
`;

/**
 * The market country from {{ shopify:tokens store="GB" }} (markets mode only).
 */
const marketCountry = () => (typeof window !== 'undefined' ? window.shopifyConfig?.country : null) || null;

/**
 * Build an operation, adding Shopify's @inContext(country:) directive when a market
 * country is set, so prices and currency match that market. Without one the
 * operation is the same as before.
 */
const operation = (type, name, params, body) => {
    const country = marketCountry();
    const allParams = country ? [...params, '$country: CountryCode!'] : params;
    const signature = allParams.length ? `(${allParams.join(', ')})` : '';

    return `${type} ${name}${signature}${country ? ' @inContext(country: $country)' : ''} {
      ${body}
    }`;
};

/**
 * Let the page know a cart request failed, e.g. to show a message:
 * window.addEventListener('shopify.cart.error', e => console.log(e.detail.operation, e.detail.errors))
 */
const reportError = (name, errors) => {
    console.warn(errors);

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('shopify.cart.error', { detail: { operation: name, errors } }));
    }
};

/**
 * Run an operation and return data[name], or undefined (after reporting, unless
 * `report` is false) when the request fails, returns GraphQL errors or the mutation
 * returns userErrors.
 */
const run = async (name, query, variables = {}, { report = true } = {}) => {
    const fail = (errors) => {
        if (report) {
            reportError(name, errors);
        }
    };
    const country = marketCountry();

    let response;

    try {
        response = await client.request(query, { variables: country ? { ...variables, country } : variables });
    } catch (error) {
        fail([error]);

        return;
    }

    const { data, errors } = response;

    if (errors) {
        fail(errors);

        return;
    }

    const result = data?.[name];

    if (result?.userErrors?.length) {
        fail(result.userErrors);

        return;
    }

    return result;
};

const userErrors = `userErrors {
        field
        message
      }`;

const addLines = async (cartId, lines) => {
    const query = operation('mutation', 'cartLinesAdd', ['$cartId: ID!', '$lines: [CartLineInput!]!'], `
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartLinesAdd', query, { cartId, lines }))?.cart;
};

/**
 * Create a cart with these lines. `input` takes the rest of a CartInput (buyerIdentity,
 * discountCodes, attributes, note, delivery); in markets mode the market country is
 * added to its buyerIdentity.
 */
const createFreshCart = async (cartLines = [], input = {}, options = {}) => {
    const query = operation('mutation', 'cartCreate', ['$cartInput: CartInput'], `
      cartCreate(input: $cartInput) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    const cartInput = { ...input, lines: cartLines };

    if (marketCountry()) {
        cartInput.buyerIdentity = { ...cartInput.buyerIdentity, countryCode: marketCountry() };
    }

    return (await run('cartCreate', query, { cartInput }, options))?.cart;
};

/**
 * Buy now: create a cart just for these lines and go straight to its checkout, where
 * the store's express checkout buttons (Apple Pay, Google Pay, Shop Pay, PayPal) are.
 * The cart isn't stored, so the customer's own cart is left as it was.
 *
 * options: discountCodes, attributes, note, and `redirect` (default true; false just
 * returns the cart). The logged in customer's buyer identity is added when the site
 * provides one (shopify.cart.buyer_identity). Returns the cart, or undefined if it
 * couldn't be created (reported with the shopify.cart.error event).
 */
const buyNow = async (lines, { redirect = true, ...input } = {}) => {
    let cart;
    const identity = await getBuyerIdentity();

    if (identity) {
        const { deliveryAddress, ...buyerIdentity } = identity;
        const delivery = deliveryAddress ? { addresses: [{ address: { deliveryAddress }, selected: true }] } : undefined;

        cart = await createFreshCart(lines, { ...input, buyerIdentity, ...(delivery ? { delivery } : {}) }, { report: false });
    }

    // without the buyer identity if Shopify rejected it (e.g. an email it considers invalid)
    cart ??= await createFreshCart(lines, input);

    if (cart?.checkoutUrl && redirect && typeof window !== 'undefined') {
        window.location.assign(cart.checkoutUrl);
    }

    return cart;
};

const getExistingCart = async (id) => {
    const query = operation('query', 'cart', ['$id: ID!'], `
      cart(id: $id) {
        ${cartQuery}
      }`);

    return await run('cart', query, { id });
};

const getOrCreateCart = async (cartId = null) => {
    let cart;

    if (cartId) {
        if (cart = await getExistingCart(cartId)) {
            // markets mode: a cart from another market's page (e.g. after switching
            // market by navigating) is moved to this page's market
            const country = marketCountry();

            if (country && cart.buyerIdentity?.countryCode !== country) {
                return (await updateBuyerCountry(cart.id, country)) ?? cart;
            }

            return cart;
        }
    }

    if (cart = await createFreshCart()) {
        return cart;
    }

    return false;
};

const removeLine = async (cartId, lineId) => {
    const query = operation('mutation', 'cartLinesRemove', ['$cartId: ID!', '$lineIds: [ID!]!'], `
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartLinesRemove', query, { cartId, lineIds: [lineId] }))?.cart;
};

const setCartAttributes = async (cartId, attributes) => {
    const query = operation('mutation', 'cartAttributesUpdate', ['$cartId: ID!', '$attributes: [AttributeInput!]!'], `
      cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartAttributesUpdate', query, { cartId, attributes }))?.cart;
};

const setCartNote = async (cartId, note) => {
    const query = operation('mutation', 'cartNoteUpdate', ['$cartId: ID!', '$note: String!'], `
      cartNoteUpdate(cartId: $cartId, note: $note) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartNoteUpdate', query, { cartId, note }))?.cart;
};

const updateLineQuantity = async (cartId, lineId, quantity) => {
    quantity = parseInt(quantity);

    if (quantity < 1) {
        return removeLine(cartId, lineId);
    }

    const query = operation('mutation', 'cartLinesUpdate', ['$cartId: ID!', '$lines: [CartLineUpdateInput!]!'], `
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartLinesUpdate', query, { cartId, lines: [{ id: lineId, quantity }] }))?.cart;
};

/**
 * Move a cart to another market's country (markets mode), so it's priced in that
 * market's currency at checkout.
 */
const updateBuyerCountry = async (cartId, countryCode) => {
    const query = operation('mutation', 'cartBuyerIdentityUpdate', ['$cartId: ID!', '$buyerIdentity: CartBuyerIdentityInput!'], `
      cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartBuyerIdentityUpdate', query, { cartId, buyerIdentity: { countryCode } }))?.cart;
};

/**
 * Set the cart's discount codes, replacing any it already has (pass [] to remove them
 * all). A code that doesn't apply to the cart isn't an error: it's returned in the
 * cart's discountCodes with applicable: false.
 */
const updateDiscountCodes = async (cartId, codes) => {
    const query = operation('mutation', 'cartDiscountCodesUpdate', ['$cartId: ID!', '$discountCodes: [String!]!'], `
      cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartDiscountCodesUpdate', query, { cartId, discountCodes: codes }))?.cart;
};

/**
 * Add gift card codes to the cart, keeping any already applied. Shopify doesn't return
 * a userError for a code that isn't a gift card, it just doesn't apply it, so a code
 * with no applied gift card ending in its last characters is reported as an error.
 */
const addGiftCardCodes = async (cartId, codes) => {
    const query = operation('mutation', 'cartGiftCardCodesAdd', ['$cartId: ID!', '$giftCardCodes: [String!]!'], `
      cartGiftCardCodesAdd(cartId: $cartId, giftCardCodes: $giftCardCodes) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    const cart = (await run('cartGiftCardCodesAdd', query, { cartId, giftCardCodes: codes }))?.cart;

    if (! cart) {
        return;
    }

    const applied = (cart.appliedGiftCards ?? []).map(card => card.lastCharacters.toLowerCase());
    const notApplied = codes.filter(code => ! applied.includes(code.replace(/\s/g, '').slice(-4).toLowerCase()));

    if (notApplied.length) {
        reportError('cartGiftCardCodesAdd', notApplied.map(code => ({
            field: ['giftCardCodes'],
            code: 'GIFT_CARD_NOT_APPLIED',
            message: 'This gift card code isn\'t valid.',
        })));

        return;
    }

    return cart;
};

/**
 * Remove gift cards from the cart, by the ids in the cart's appliedGiftCards.
 */
const removeGiftCardCodes = async (cartId, ids) => {
    const query = operation('mutation', 'cartGiftCardCodesRemove', ['$cartId: ID!', '$appliedGiftCardIds: [ID!]!'], `
      cartGiftCardCodesRemove(cartId: $cartId, appliedGiftCardIds: $appliedGiftCardIds) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartGiftCardCodesRemove', query, { cartId, appliedGiftCardIds: ids }))?.cart;
};

/**
 * Set who's buying (email, phone, countryCode), so Shopify's checkout is pre-filled.
 * In markets mode the cart stays in the page's market country.
 */
const updateBuyerIdentity = async (cartId, buyerIdentity) => {
    const query = operation('mutation', 'cartBuyerIdentityUpdate', ['$cartId: ID!', '$buyerIdentity: CartBuyerIdentityInput!'], `
      cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    const country = marketCountry();

    return (await run('cartBuyerIdentityUpdate', query, {
        cartId,
        buyerIdentity: country ? { ...buyerIdentity, countryCode: country } : buyerIdentity,
    }))?.cart;
};

/**
 * Set the cart's delivery address (a CartDeliveryAddressInput: firstName, lastName,
 * address1, city, provinceCode, countryCode, zip...), replacing any it already has,
 * so Shopify's checkout is pre-filled with it.
 */
const setDeliveryAddress = async (cartId, deliveryAddress) => {
    const query = operation('mutation', 'cartDeliveryAddressesReplace', ['$cartId: ID!', '$addresses: [CartSelectableAddressInput!]!'], `
      cartDeliveryAddressesReplace(cartId: $cartId, addresses: $addresses) {
        cart {
          ${cartQuery}
        }
        ${userErrors}
      }`);

    return (await run('cartDeliveryAddressesReplace', query, {
        cartId,
        addresses: [{ address: { deliveryAddress }, selected: true }],
    }))?.cart;
};

/**
 * The logged in customer's buyer identity from the site (shopify.cart.buyer_identity),
 * or null for guests, users not linked to a Shopify customer, or when it's off.
 */
const getBuyerIdentity = async () => {
    const config = (typeof window !== 'undefined' ? window.shopifyConfig : null) ?? {};

    if (! config.buyerIdentityUrl || typeof fetch !== 'function') {
        return null;
    }

    const params = config.store ? `?store=${encodeURIComponent(config.store)}` : '';

    try {
        const response = await fetch(config.buyerIdentityUrl + params, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        });

        if (! response.ok || response.status === 204) {
            return null;
        }

        const identity = await response.json();

        return identity && Object.keys(identity).length ? identity : null;
    } catch (error) {
        return null;
    }
};

export {
    addGiftCardCodes,
    addLines,
    buyNow,
    createFreshCart,
    getBuyerIdentity,
    getExistingCart,
    getOrCreateCart,
    removeGiftCardCodes,
    removeLine,
    setCartAttributes,
    setCartNote,
    setDeliveryAddress,
    updateBuyerCountry,
    updateBuyerIdentity,
    updateDiscountCodes,
    updateLineQuantity,
};
