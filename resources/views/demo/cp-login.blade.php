{{-- Inline CP script: on the login page, show the public demo login and fill it in --}}
(() => {
    const login = @json(['email' => $email, 'password' => $password]);

    const fill = (input, value) => {
        if (input && ! input.value) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    const apply = () => {
        if (! location.pathname.endsWith('/auth/login')) return false;

        const form = document.querySelector('form');
        if (! form || document.getElementById('demo-login')) return !! form;

        const note = document.createElement('div');
        note.id = 'demo-login';
        note.style.cssText = 'margin:0 0 1rem;padding:.85rem 1rem;border-radius:.75rem;border:1px dashed #a8834f;background:rgba(168,131,79,.08);font-size:.85rem;line-height:1.5';
        note.innerHTML = '<strong>Demo login</strong><br>Email: <code></code><br>Password: <code></code><br><span style="opacity:.7">Look around as much as you like: it\'s read-only, so nothing you change is saved.</span>';
        const codes = note.querySelectorAll('code');
        codes[0].textContent = login.email;
        codes[1].textContent = login.password;
        form.prepend(note);

        fill(form.querySelector('input[type=email], input[name=email]'), login.email);
        fill(form.querySelector('input[type=password]'), login.password);

        return true;
    };

    const start = () => {
        if (apply()) return;
        const observer = new MutationObserver(() => apply() && observer.disconnect());
        observer.observe(document.body, { childList: true, subtree: true });
    };

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})()
