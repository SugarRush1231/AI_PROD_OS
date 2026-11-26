const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const express = require('express');
const { spicyImageRouter } = require('../spicy-image');

test('owner-only upload, live schema, balance, quote, idempotent creation and polling', async (t) => {
    process.env.SPICY_API_KEY = 'mock-spicy-key';
    process.env.SPICY_OWNER_GOOGLE_ID = 'owner';
    process.env.SESSION_SECRET = 'mock-session-secret-32-characters';
    let rejection;
    let state = 'succeeded';
    const calls = [];
    const model = 'bytedance/seedream-5.5/edit';
    const mockFetch = async (url, options) => {
        const path = new URL(url).pathname;
        calls.push({ path, options });
        const ok = (data) => ({ ok: true, json: async () => ({ code: 200, data }) });
        if (path === '/upload') {
            assert.equal(options.method, 'PUT');
            assert.equal(options.headers.Authorization, undefined);
            assert.deepEqual(options.body, Buffer.from('image'));
            return { ok: true };
        }
        assert.equal(options.headers.Authorization, 'Bearer mock-spicy-key');
        if (path.includes('/models/')) return ok({
            model, enabled: true, available: true,
            inputSchema: { properties: {
                prompt: { maxLength: 48 }, image_urls: { type: 'array', items: { type: 'string' } },
                aspect_ratio: { enum: ['1:1'] }
            } }
        });
        if (path.endsWith('/credit')) return ok({ available: '1.20', funding: { prepaidAvailableUsd: '1.10' } });
        if (path.endsWith('/upload-url')) return ok({ uploadUrl: 'https://mock.invalid/upload',
            fileId: 'fil_mock', maxBytes: 100, headers: { 'Content-Length': '5' } });
        if (path.endsWith('/commit')) return ok({ status: 'ready', uri: 'spicy://f/fil_mock' });
        if (path.endsWith('/quote')) {
            assert.deepEqual(JSON.parse(options.body), {
                model, input: { prompt: 'Edit', image_urls: ['spicy://f/fil_mock'], aspect_ratio: '1:1' }
            });
            return ok({ quoteId: 'quote_mock', estimatedCost: '0.035', currency: 'USD',
                expiresAt: new Date(Date.now() + 300000).toISOString() });
        }
        if (path.endsWith('/createTask')) {
            if (rejection) return { ok: false, status: 402, json: async () => ({ code: rejection }) };
            return ok({ taskId: 'job_mock' });
        }
        if (path.endsWith('/recordInfo')) return ok({
            model, state, errorCode: state === 'failed' ? 'content_rejected' : undefined,
            output: state === 'succeeded' ? { assets: [{ mime: 'image/png', url: 'https://mock.invalid/result' }] } : undefined
        });
        assert.fail(path);
    };
    const app = express();
    app.use(express.json(), (req, res, next) => {
        const id = req.get('Test-User');
        req.isAuthenticated = () => Boolean(id);
        req.user = { provider: 'google', id };
        next();
    }, spicyImageRouter(mockFetch));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => server.close());
    const call = (path, { body, user = 'owner', headers } = {}) => fetch(
        `http://127.0.0.1:${server.address().port}/${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', 'Test-User': user, ...headers },
            body: JSON.stringify(body)
        }
    );
    for (const user of ['', 'other']) {
        for (const path of ['balance', 'task/job_mock', 'quote', 'create']) {
            const body = ['quote', 'create'].includes(path) ? {} : undefined;
            assert.equal((await call(path, { user, body })).status, 403);
        }
    }
    assert.equal((await call('create', { body: {}, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal(calls.length, 0);
    assert.deepEqual(await (await call('balance')).json(), { available: '1.20', prepaid: '1.10' });
    assert.equal((await call('quote', { body: { prompt: 'Edit' } })).status, 400);
    const quote = await (await call('quote', { body: {
        prompt: 'Edit', ratio: '1:1', image: 'data:image/png;base64,aW1hZ2U='
    } })).json();
    assert.equal(quote.cost, '0.035');
    assert.equal(calls.filter(x => x.path.includes('/models/')).length, 1);
    assert.equal(calls.filter(x => x.path.endsWith('/createTask')).length, 0);
    assert.equal((await call('create', { body: { token: 'A' + quote.token } })).status, 400);
    const submit = () => call('create', { body: { token: quote.token } });
    const results = await Promise.all([submit(), submit()]);
    for (const result of results) assert.deepEqual(await result.json(), { taskId: 'job_mock' });
    const creates = calls.filter(x => x.path.endsWith('/createTask'));
    assert.equal(creates.length, 2);
    assert.ok(creates[0].options.headers['Idempotency-Key']);
    assert.deepEqual(creates[0].options, creates[1].options);
    assert.equal(JSON.parse(creates[0].options.body).expectedCost, '0.035');
    for (rejection of [40201, 40202]) {
        const before = calls.length;
        const result = await submit();
        assert.equal(result.status, 402);
        assert.equal((await result.json()).code, String(rejection));
        assert.equal(calls.length, before + 1);
    }
    assert.equal((await (await call('task/job_mock')).json()).url, 'https://mock.invalid/result');
    state = 'failed';
    assert.equal((await (await call('task/job_mock')).json()).code, 'content_rejected');
});

test('editor requires price confirmation and does not auto-resubmit rejected content', async () => {
    const source = readFileSync(require.resolve('../script.js'), 'utf8');
    const snippet = source.slice(source.indexOf('async function runSpicyEdit('), source.indexOf('async function generateImage()'));
    const values = new Map();
    let confirmed = false;
    const calls = [];
    const context = vm.createContext({
        spicyImageStorageKey: 'owner-pending',
        localStorage: {
            getItem: key => values.get(key),
            setItem: (key, value) => values.set(key, value),
            removeItem: key => values.delete(key)
        },
        setTimeout: callback => callback(),
        showSystemConfirm: async () => confirmed,
        spicyImageRequest: async (path) => {
            calls.push(path);
            if (path === 'pending') return null;
            if (path === 'quote') return { token: 'token', cost: '0.035', expiresAt: new Date().toISOString() };
            if (path === 'create') return { taskId: 'job_mock' };
            return { state: 'failed', code: 'content_rejected', settled: true, cost: '0' };
        }
    });
    vm.runInContext(snippet, context);
    assert.equal(await context.runSpicyEdit('Edit', 'image', '1:1'), null);
    assert.deepEqual(calls.splice(0), ['pending', 'quote']);
    confirmed = true;
    await assert.rejects(context.runSpicyEdit('Edit', 'image', '1:1'), /콘텐츠가 거절/);
    assert.deepEqual(calls, ['pending', 'quote', 'create', 'task/job_mock']);
    assert.equal(values.size, 0);
});
