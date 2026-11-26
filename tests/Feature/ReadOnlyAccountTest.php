<?php

namespace Tests\Feature;

use App\Http\Middleware\ReadOnlyAccount;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Statamic\Facades\User;
use Tests\TestCase;

class ReadOnlyAccountTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['demo.read_only' => true]);

        // never saved: the shared demo customer stand-in
        $this->actingAs(User::make()->email('customer@example.com')->set('name', 'Demo visitor'));
    }

    public static function accountChanges(): array
    {
        return [
            'profile' => ['post', '/!/auth/profile'],
            'password' => ['post', '/!/auth/password'],
            'two-factor' => ['post', '/!/auth/two-factor/enable'],
            'passkeys' => ['post', '/!/auth/passkeys'],
            'register' => ['post', '/!/auth/register'],
            'new address' => ['post', '/!/shopify/address'],
            'edit address' => ['post', '/!/shopify/address/123'],
            'delete address' => ['delete', '/!/shopify/address/123'],
            'marketing consent' => ['post', '/!/shopify/marketing'],
        ];
    }

    #[Test]
    #[DataProvider('accountChanges')]
    public function account_changes_are_refused_with_a_message(string $method, string $url)
    {
        $this->from('/account')
            ->{$method}($url, ['name' => 'Someone else'])
            ->assertRedirect('/account')
            ->assertSessionHas('demo_read_only', ReadOnlyAccount::MESSAGE)
            ->assertSessionMissing('_old_input');
    }

    #[Test]
    public function json_requests_get_a_403()
    {
        $this->deleteJson('/!/shopify/address/123')
            ->assertForbidden()
            ->assertJson(['message' => ReadOnlyAccount::MESSAGE]);
    }

    #[Test]
    public function logging_in_still_works()
    {
        $this->from('/account')
            ->post('/!/auth/login', ['email' => 'nobody@example.com', 'password' => 'wrong'])
            ->assertSessionMissing('demo_read_only');
    }

    #[Test]
    public function changes_are_allowed_when_the_demo_is_not_read_only()
    {
        config(['demo.read_only' => false]);

        $this->from('/account')
            ->deleteJson('/!/shopify/address/123')
            ->assertSessionMissing('demo_read_only')
            ->assertStatus(422); // reached the addon: this user has no Shopify customer
    }
}
