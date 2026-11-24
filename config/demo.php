<?php

return [

    /*
     * The public demo login for the control panel. In read-only mode, the control
     * panel can be browsed but nothing can be saved (see ReadOnlyControlPanel).
     * Turn it off with DEMO_READ_ONLY=false when you need to change something.
     */
    'read_only' => env('DEMO_READ_ONLY', true),

    'cp_email' => env('DEMO_CP_EMAIL', 'demo@thoughtcollective.com'),

    'cp_password' => env('DEMO_CP_PASSWORD', 'shopify-demo'),

];
