const assert = require('node:assert/strict');
const { test } = require('node:test');
const { minimalGoogleProfile, publicProfile, csrfToken, requireCsrf } = require('../access-control');

test('Google profile and CSRF token are scoped to the login session', () => {
    process.env.SESSION_SECRET = 'test-secret-with-more-than-32-characters';
    const profile = minimalGoogleProfile({
        id: 'google-id', displayName: 'Owner', _raw: 'private',
        _json: { email: 'OWNER@example.org', email_verified: true, sub: 'google-id' }
    });
    assert.deepEqual(publicProfile(profile), { id: 'google-id', displayName: 'Owner', photos: undefined });
    assert.equal(profile.verifiedEmail, 'owner@example.org');
    assert.equal(profile._raw, undefined);
    assert.equal(minimalGoogleProfile({ _json: { email: 'owner@example.org' } }).verifiedEmail, undefined);
    const req = { sessionID: 'session-a', get: () => csrfToken({ sessionID: 'session-b' }) };
    const res = { status: status => { assert.equal(status, 403); return { json() {} }; } };
    requireCsrf(req, res, () => assert.fail('Token from another session passed'));
    req.get = () => csrfToken(req);
    let passed = false;
    requireCsrf(req, {}, () => { passed = true; });
    assert.equal(passed, true);
});

let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch {}

test('PostgreSQL-backed HTTP access, OAuth state, video ownership and logout', {
    skip: !PGlite && 'Optional PostgreSQL integration runtime: @electric-sql/pglite'
}, async (t) => {
    const db = new PGlite();
    process.env.DATABASE_URL = 'postgres://unused@localhost/unused';
    process.env.SESSION_SECRET = 'test-secret-with-more-than-32-characters';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
    process.env.CALLBACK_URL = 'https://ai-prod.live/auth/google/callback';
    process.env.TRUST_PROXY_CIDRS = 'loopback';
    process.env.KIE_API_KEY = 'mock-key';
    process.env.SPICY_API_KEY = 'mock-spicy-key';
    process.env.SPICY_OWNER_GOOGLE_ID = 'owner';
    process.env.ALLOWED_EMAILS = 'owner@example.org,second@example.org';
    process.env.NODE_ENV = 'test';
    require('pg').Pool = class {
        on() {}
        async query(sql, args) {
            if (!args && /^\s*CREATE TABLE/.test(sql)) return db.exec(sql);
            const result = await db.query(sql, args);
            return { ...result, rowCount: result.rows.length };
        }
    };
    const upstream = [];
    require('node-fetch');
    require.cache[require.resolve('node-fetch')].exports = async (url, options) => {
        upstream.push(url);
        if (url.includes('spicyapi.ai') || url === 'https://spicy-upload.example.org/object') {
            const model = 'bytedance/seedream-5.5/edit';
            const response = data => ({ ok: true, json: async () => ({ code: 200, data }) });
            if (url.includes('/models/')) return response({
                model, enabled: true, available: true, inputSchema: { properties: {
                    prompt: { type: 'string' }, image_urls: { type: 'array', items: { type: 'string' } },
                    resolution: { enum: ['1k'] }, output_format: { enum: ['png'] }, background: { enum: ['auto'] }
                } }
            });
            if (url.endsWith('/upload-url')) return response({
                uploadUrl: 'https://spicy-upload.example.org/object', fileId: 'fil_mock', maxBytes: 10, headers: {}
            });
            if (url.endsWith('/object')) return { ok: true };
            if (url.endsWith('/commit')) return response({ status: 'ready', uri: 'spicy://f/fil_mock' });
            if (url.endsWith('/quote')) return response({ quoteId: 'quote_mock', estimatedCost: '0.05', currency: 'USD',
                expiresAt: new Date(Date.now() + 300000).toISOString() });
            if (url.endsWith('/createTask')) return response({ taskId: 'job_mock' });
            assert.fail(url);
        }
        if (url.includes('/createTask')) {
            const { input } = JSON.parse(options.body);
            assert.equal(input.prompt, 'Animate @image1 with @image2');
            assert.deepEqual(input.image_urls, ['https://example.org/one.png', 'https://example.org/two.png']);
            return { json: async () => ({ code: 200, data: { taskId: 'test-task' } }) };
        }
        if (url.includes('/recordInfo')) {
            return { json: async () => ({ data: { state: 'success', resultJson: '{"resultUrls":["https://example.org/video.mp4"]}' } }) };
        }
        assert.fail(url);
    };
    const { app, initDb } = require('../server');
    await initDb();
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await db.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/auth/google', { redirect: 'manual' });
    assert.equal(login.status, 302);
    const webOAuth = new URL(login.headers.get('location')).searchParams;
    assert.equal(webOAuth.get('redirect_uri'), process.env.CALLBACK_URL);
    assert.ok(webOAuth.get('state'));
    const oauthCookie = login.headers.getSetCookie()[0].split(';')[0];
    const oauthRows = await db.query('SELECT data FROM app_sessions');
    assert.equal(oauthRows.rows.length, 1);
    const badCallback = await fetch(base + '/auth/google/callback?state=incorrect&code=unused', {
        redirect: 'manual', headers: { Cookie: oauthCookie }
    });
    assert.equal(badCallback.headers.get('location'), '/');

    const webPage = await (await fetch(base + '/')).text();
    const appPage = await (await fetch(base + '/app')).text();
    assert.doesNotMatch(webPage, /<body class="dark app-view">/);
    assert.match(appPage, /<body class="dark app-view">/);
    assert.match(appPage, /rel="manifest" href="\/app.webmanifest"/);
    assert.match(appPage, /src="\/app-view\.js\?v=/);
    assert.equal((await fetch(base + '/app/', { redirect: 'manual' })).headers.get('location'), '/app');
    const manifest = await (await fetch(base + '/app.webmanifest')).json();
    assert.equal(manifest.start_url, '/app');
    assert.equal(manifest.display, 'standalone');
    for (const path of ['/app-view.js', '/app-view.css']) assert.equal((await fetch(base + path)).status, 200);
    const assetLinksResponse = await fetch(base + '/.well-known/assetlinks.json', { redirect: 'manual' });
    assert.equal(assetLinksResponse.status, 200);
    assert.match(assetLinksResponse.headers.get('content-type'), /application\/json/);
    const [appAssociation] = await assetLinksResponse.json();
    assert.equal(appAssociation.target.package_name, 'live.aiprod.studio');
    assert.match(appAssociation.target.sha256_cert_fingerprints[0], /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    assert.equal((await fetch(base + '/android/.signing/preview.keystore')).status, 404);

    const strategy = require('passport')._strategy('google');
    const appHost = 'inherent-abby-kimbs-b8271ab9.koyeb.app';
    const appCallbackUrl = `https://${appHost}/auth/google/callback`;
    const appProxyHeaders = { 'X-Forwarded-Host': appHost };
    strategy._oauth2.getOAuthAccessToken = (code, params, done) => {
        assert.equal(params.redirect_uri, appCallbackUrl);
        done(null, 'mock-access', 'mock-refresh', {});
    };
    strategy.userProfile = (token, done) => done(null, { id: 'app-user', displayName: 'App User' });
    const appLogin = await fetch(base + '/auth/google?view=app', { redirect: 'manual', headers: appProxyHeaders });
    const appOAuth = new URL(appLogin.headers.get('location')).searchParams;
    assert.equal(appOAuth.get('redirect_uri'), appCallbackUrl);
    const appCookie = appLogin.headers.getSetCookie()[0].split(';')[0];
    const appCallback = await fetch(`${base}/auth/google/callback?state=${encodeURIComponent(appOAuth.get('state'))}&code=mock`, {
        redirect: 'manual', headers: { ...appProxyHeaders, Cookie: appCookie }
    });
    assert.equal(appCallback.headers.get('location'), '/app');
    const loggedInCookie = appCallback.headers.getSetCookie()[0].split(';')[0];
    const appProfile = await (await fetch(base + '/api/me', { headers: { Cookie: loggedInCookie } })).json();
    assert.equal(appProfile.user.id, 'app-user');

    async function signedIn(id, email) {
        const sid = `session-${id}`;
        await db.query('INSERT INTO app_sessions (id,data,expires_at) VALUES ($1,$2,NOW() + INTERVAL \'1 day\')',
            [sid, { cookie: { path: '/', originalMaxAge: 86400000, httpOnly: true },
                passport: { user: { id, provider: 'google', displayName: id, verifiedEmail: email } } }]);
        const signature = require('cookie-signature').sign(sid, process.env.SESSION_SECRET);
        const cookie = 'ai-prod.sid=' + encodeURIComponent('s:' + signature);
        const me = await (await fetch(base + '/api/me', { headers: { Cookie: cookie } })).json();
        assert.equal(me.user.id, id);
        assert.equal(me.user.verifiedEmail, undefined);
        assert.equal(me.canSaveMedia, id === 'owner');
        return { Cookie: cookie, 'X-CSRF-Token': me.csrfToken, 'Content-Type': 'application/json' };
    }
    const owner = await signedIn('owner', 'owner@example.org');
    const second = await signedIn('second', 'second@example.org');
    const free = await signedIn('free', 'free@example.org');
    const create = headers => fetch(base + '/api/video/create', {
        method: 'POST', headers, body: JSON.stringify({ prompt: 'Animate @image 1 with @image2',
            images: ['https://example.org/one.png', 'https://example.org/two.png'] })
    });
    assert.equal((await create({ ...owner, 'X-CSRF-Token': second['X-CSRF-Token'] })).status, 403);
    assert.equal((await create(free)).status, 403);
    assert.equal(upstream.length, 0);
    assert.equal((await create(owner)).status, 200);
    const status = headers => fetch(base + '/api/video/status?taskId=test-task', { headers });
    assert.equal((await status(second)).status, 404);
    assert.equal(upstream.length, 1);
    assert.equal((await status(owner)).status, 200);
    await db.query("UPDATE api_usage SET count = 60 WHERE user_id = 'owner' AND bucket = 'generation'");
    assert.equal((await create(owner)).status, 429);
    assert.equal(upstream.length, 2);
    await db.query("DELETE FROM api_usage WHERE user_id = 'owner' AND bucket = 'generation'");
    const spicy = (path, data, headers = owner) => fetch(base + '/api/spicy-image/' + path, {
        headers, method: data === undefined ? 'GET' : 'POST', body: JSON.stringify(data)
    });
    assert.equal((await spicy('pending', undefined, second)).status, 403);
    const edit = { prompt: 'Edit the image', image: 'data:image/png;base64,aW1hZ2U=' };
    const firstQuote = await (await spicy('quote', edit)).json();
    const secondQuote = await (await spicy('quote', edit)).json();
    assert.ok(firstQuote.token && secondQuote.token);
    assert.notEqual(firstQuote.token, secondQuote.token);
    assert.deepEqual(await (await spicy('create', { token: firstQuote.token })).json(), { taskId: 'job_mock' });
    assert.deepEqual(await (await spicy('create', { token: secondQuote.token })).json(), { taskId: 'job_mock' });
    assert.deepEqual(await (await spicy('pending')).json(), { taskId: 'job_mock' });
    assert.equal(upstream.filter(url => url === 'https://api.spicyapi.ai/api/v1/jobs/createTask').length, 1);
    for (const path of ['/server.js', '/package-lock.json', '/user_presets/private.json']) {
        assert.equal((await fetch(base + path)).status, 404);
    }
    assert.equal((await fetch(base + '/script.js')).status, 200);
    assert.equal((await fetch(base + '/prompt-catalog.js')).status, 200);
    assert.equal((await fetch(base + '/prompt-rules.js')).status, 200);
    const logout = await fetch(base + '/logout', { method: 'POST', headers: owner });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /ai-prod\.sid=;/);
    assert.equal((await (await fetch(base + '/api/me', { headers: owner })).json()).user, null);
});
