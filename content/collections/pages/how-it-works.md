---
id: c4e1b7a9-2f3d-4a6b-8c5e-1d9f7a2b3e46
blueprint: how_it_works
template: how_it_works
title: 'A Shopify store, built with Statamic'
intro: 'This demo pairs Shopify, for products and checkout, with Statamic, for everything else. The Shopify addon by Thought Collective connects the two, so the catalogue stays current without anyone copying data across.'
steps:
  -
    title: 'Import'
    text: 'One command (or a button in the control panel) imports every product, variant, image, collection and metafield from Shopify as Statamic entries and terms.'
  -
    title: 'Sync'
    text: 'Webhooks tell the site when anything changes in Shopify: products, collections, stock, orders, refunds and cancellations. Each update is queued and applied in seconds.'
  -
    title: 'Build'
    text: 'Templates use normal Antlers tags plus a few from the addon for prices, stock and variants. Add your own fields to products; imports never overwrite them.'
  -
    title: 'Sell'
    text: 'The bag is a real Shopify cart, created with the Storefront API, so checkout, payments and orders all stay in Shopify.'
content:
  -
    type: heading
    attrs: { level: 2 }
    content: [{ type: text, text: 'What lives where' }]
  -
    type: paragraph
    content:
      - { type: text, text: 'Shopify is the source of truth for anything you sell: titles, descriptions, options, prices, stock and images. Statamic holds the site itself: this page, the home page, navigation, and extra fields on products such as the ' }
      - { type: text, marks: [{ type: italic }], text: 'Why we love it' }
      - { type: text, text: ' notes on product pages.' }
  -
    type: heading
    attrs: { level: 2 }
    content: [{ type: text, text: 'Prices in every market' }]
  -
    type: paragraph
    content:
      - { type: text, text: "Use the country switcher in the header to see prices in pounds, euros or dollars. The addon imports each market's prices from Shopify Markets, and switching country moves your bag to that market, so the prices you see are the prices you pay at checkout." }
  -
    type: heading
    attrs: { level: 2 }
    content: [{ type: text, text: 'Look behind the scenes' }]
  -
    type: paragraph
    content:
      - { type: text, text: 'Look out for the ' }
      - { type: text, marks: [{ type: italic }], text: 'Under the hood' }
      - { type: text, text: ' notes around the site: each one shows the Antlers that builds that part of the page. The full source of this demo is on ' }
      - { type: text, marks: [{ type: link, attrs: { href: 'https://github.com/thoughtco/shopify-demo' } }], text: 'GitHub' }
      - { type: text, text: '.' }
features:
  -
    title: 'Real-time sync'
    text: 'Product, collection, inventory, order, refund and cancellation webhooks keep products and stock current.'
  -
    title: 'Variants and options'
    text: 'Products with several options, variant images, sale prices and per-variant stock.'
    link: /shop
  -
    title: 'Shopify Markets'
    text: 'Contextual pricing per country, with a cart that follows the market you choose.'
  -
    title: 'Collections, types, vendors and tags'
    text: 'Imported as Statamic taxonomies, each with its own page.'
    link: /shop
  -
    title: 'Metafields'
    text: 'Materials and care instructions come from Shopify metafields.'
  -
    title: 'Price and stock summary'
    text: 'Fast sorting by price, sale badges and an in-stock filter, without loading variants.'
    link: /shop?in_stock=1&sort=price_min:asc
  -
    title: 'Storefront API cart'
    text: 'A slide-out bag, a gift note saved on the cart, and Shopify checkout.'
    link: /cart
---
