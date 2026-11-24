<?php

use Illuminate\Support\Facades\Artisan;
use Statamic\Facades\Entry;

/*
 * The demo's Statamic-only product content. Products are imported from Shopify (and
 * not kept in git), so after the first import this adds the "Why we love it" notes
 * the import never touches.
 */
Artisan::command('demo:editors-notes', function () {
    $notes = [
        'gemstone-pendant' => 'Every stone is cut by hand, so the one you get is genuinely one of a kind. Our favourite is the purple: it looks different in every light.',
        'origami-crane-necklace' => 'Folded paper cranes are given for luck. This one is a little reminder to be brave, and our most-gifted piece.',
        'gold-bird-necklace' => 'Solid gold and tiny enough to wear every day. The two-chain setting keeps the bird facing forwards, which sounds small until you have tried the alternative.',
        'leather-anchor-bracelet' => 'The anchor clasp is solid and satisfying to close. It looks smart with a suit and better with a T-shirt.',
        'silver-threader-necklace' => 'The easiest thing in the shop to layer. Pair the 16" with a longer pendant chain.',
        'turquoise-drop-earrings' => 'Just enough colour and just enough movement. They catch the light when you laugh.',
        'moon-charm-bracelet' => 'A friendship bracelet that grew up. The adjustable chain means it fits most wrists, so it is an easy present.',
    ];

    foreach ($notes as $slug => $note) {
        $entry = Entry::query()->where('collection', 'products')->where('slug', $slug)->first();

        if (! $entry) {
            $this->warn("No product [{$slug}]: run the Shopify import first.");

            continue;
        }

        $entry->set('editors_note', $note)->saveQuietly();
        $this->line("✓ {$entry->get('title')}");
    }
})->purpose("Add the demo's Statamic-only notes to imported products");

/*
 * The public control panel login (config/demo.php). Statamic Solo allows one user,
 * and the control panel is read-only while DEMO_READ_ONLY is on.
 */
Artisan::command('demo:cp-user', function () {
    $email = config('demo.cp_email');

    $user = \Statamic\Facades\User::findByEmail($email) ?? \Statamic\Facades\User::make()->email($email);

    $user->data(['name' => 'Demo visitor'])->password(config('demo.cp_password'))->makeSuper()->save();

    $this->info("Control panel login: {$email}");
})->purpose('Create or reset the public control panel login');
