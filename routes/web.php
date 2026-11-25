<?php

use Illuminate\Support\Facades\Route;

// Route::statamic('example', 'example-view', [
//    'title' => 'Example'
// ]);

// One of the logged in customer's orders: {{ shopify:customer:order }} checks it's theirs
Route::statamic('account/orders/{order}', 'account/order', ['title' => 'Order'])
    ->where('order', '[0-9]+');
