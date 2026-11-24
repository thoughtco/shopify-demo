<?php

namespace App\Providers;

use App\Http\Middleware\ReadOnlyControlPanel;
use Illuminate\Support\ServiceProvider;
use Statamic\Statamic;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Statamic::booted(function () {
            $this->app['router']->pushMiddlewareToGroup('statamic.cp.authenticated', ReadOnlyControlPanel::class);
        });

        // Show the public demo login on the control panel's login page
        if (config('demo.read_only')) {
            Statamic::inlineScript(view('demo.cp-login', [
                'email' => config('demo.cp_email'),
                'password' => config('demo.cp_password'),
            ])->render());
        }
    }
}
