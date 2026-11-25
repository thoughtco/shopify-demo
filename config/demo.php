<?php

return [

    /*
     * The public demo login for the control panel and the customer account pages.
     * In read-only mode the control panel can be browsed but nothing can be saved
     * (see ReadOnlyControlPanel), and on the frontend the account can't be changed
     * (see ReadOnlyAccount).
     * Turn it off with DEMO_READ_ONLY=false when you need to change something.
     */
    'read_only' => env('DEMO_READ_ONLY', true),

    'cp_email' => env('DEMO_CP_EMAIL', 'demo@thoughtcollective.com'),

    'cp_password' => env('DEMO_CP_PASSWORD', 'shopify-demo'),

    /*
     * Shopify development stores keep the storefront password on, and checkout runs
     * on the storefront, so the bag shows this password next to the checkout button.
     */
    'checkout_password' => env('DEMO_CHECKOUT_PASSWORD'),

];
