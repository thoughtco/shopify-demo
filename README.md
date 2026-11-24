# Statamic Shopify demo store

A demo jewellery store built with [Statamic](https://statamic.com) and the [Shopify addon](https://github.com/thoughtco/shopify) by [Thought Collective](https://thoughtcollective.com).

Products, variants, stock and prices live in Shopify. Pages, layout and extra product fields live in Statamic. The addon imports the catalogue and keeps it in sync with webhooks, and the bag is a real Shopify cart, created with the Storefront API.

It shows:

- products with several options, variant images, sale prices and per-variant stock
- Shopify Markets: prices and stock for the UK, Ireland and the US, with a country switcher
- collections, product types, vendors and tags as Statamic taxonomies
- metafields (materials and care) imported onto products, and a Statamic-only field the import never overwrites
- the price and stock summary: sorting by price, sale badges and an in-stock filter
- a slide-out bag and cart page using the addon's Alpine.js store

## Running it locally

```bash
composer install
npm install && npm run build
cp .env.example .env && php artisan key:generate
```

Add your Shopify app's details to `.env` (see the [setup docs](https://www.docs.tc/shopify)):

```
SHOPIFY_APP_URL=your-store.myshopify.com
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_WEBHOOK_SECRET="${SHOPIFY_CLIENT_SECRET}"
SHOPIFY_STOREFRONT_TOKEN=
SHOPIFY_CURRENCY_CODE=GBP
SHOPIFY_MONEY_FORMAT=intl
SHOPIFY_MULTI_STORE_ENABLED=true
SHOPIFY_MULTI_STORE_MODE=markets
```

Then import the catalogue, and add the demo's Statamic-only product notes:

```bash
php artisan shopify:import:collections
php artisan shopify:import:all
php artisan demo:editors-notes
```

Imported content (products, variants, taxonomy terms and Shopify images) isn't kept in git: each environment imports its own, and webhooks keep it up to date. Register them with `php artisan shopify:webhooks:register` on a site Shopify can reach.

## The control panel

The demo has a public control panel login, shown on the login page, and the control panel is read-only: visitors can look at everything but nothing is saved (`app/Http/Middleware/ReadOnlyControlPanel.php`). Create the login with:

```bash
php artisan demo:cp-user
```

The login comes from `config/demo.php` (`DEMO_CP_EMAIL` and `DEMO_CP_PASSWORD`). Set `DEMO_READ_ONLY=false` when you need to make changes.

## The theme

Tailwind CSS 4 and Alpine.js. Templates are in `resources/views`, and the addon's published scripts are in `resources/js/vendor/shopify`. Look for the "Under the hood" notes on the site, which show the Antlers behind each feature.
