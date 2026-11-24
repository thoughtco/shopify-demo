<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Statamic\Facades\CP\Toast;

/**
 * Lets anyone with the public demo login look around the control panel without
 * changing anything: every write is refused, and so are pages that would reveal
 * the server's configuration.
 */
class ReadOnlyControlPanel
{
    public const MESSAGE = 'This is a read-only demo, so changes aren\'t saved.';

    /**
     * Pages that are off limits even to look at (relative to the CP route).
     */
    protected array $hidden = [
        'utilities/php-info',
    ];

    public function handle(Request $request, Closure $next)
    {
        if (! config('demo.read_only')) {
            return $next($request);
        }

        $path = trim(substr($request->path(), strlen(trim(config('statamic.cp.route'), '/'))), '/');

        if (in_array($path, $this->hidden)) {
            abort(403, self::MESSAGE);
        }

        if ($request->isMethodSafe() || $path === 'auth/logout') {
            return $next($request);
        }

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['message' => self::MESSAGE], 403);
        }

        Toast::error(self::MESSAGE);

        return back(303);
    }
}
