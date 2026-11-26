<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Everyone shares the demo customer account, so on the frontend they can log in
 * and look around, but every change to the account is refused with a message:
 * the profile, password, addresses, two-factor and passkeys. Logging in (and its
 * two-factor challenge) and the bag still work.
 */
class ReadOnlyAccount
{
    public const MESSAGE = 'This is a shared demo account, so changes aren\'t saved.';

    /**
     * Writes that are refused (relative to the action route, e.g. auth/profile).
     */
    protected array $readOnly = [
        'auth/*',
        'shopify/address',
        'shopify/address/*',
        'shopify/marketing',
    ];

    /**
     * Writes under those paths that still work.
     */
    protected array $allowed = [
        'auth/login',
        'auth/two-factor-challenge',
    ];

    public function handle(Request $request, Closure $next)
    {
        if (! config('demo.read_only') || $request->isMethodSafe()) {
            return $next($request);
        }

        $path = trim(substr($request->path(), strlen(trim(config('statamic.routes.action'), '/'))), '/');

        if (! $request->is(trim(config('statamic.routes.action'), '/').'/*')
            || ! $this->matches($path, $this->readOnly)
            || $this->matches($path, $this->allowed)) {
            return $next($request);
        }

        if ($request->expectsJson()) {
            return response()->json(['message' => self::MESSAGE], 403);
        }

        // without the input, so the form shows what's actually saved
        return back(303)->with('demo_read_only', self::MESSAGE);
    }

    protected function matches(string $path, array $patterns): bool
    {
        foreach ($patterns as $pattern) {
            if (fnmatch($pattern, $path)) {
                return true;
            }
        }

        return false;
    }
}
