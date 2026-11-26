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
        if (path.startsWith('/upload/')) {
            assert.equal(options.method, 'PUT');
            assert.equal(options.headers.Authorization, undefined);
            assert.deepEqual(options.body, Buffer.from(path.endsWith('/fil_5') ? 'image' : 'second'));
            return { ok: true };
        }
        assert.equal(options.headers.Authorization, 'Bearer mock-spicy-key');
        if (path.includes('/models/')) return ok({
            model, enabled: true, available: true,
            inputSchema: { properties: {
                prompt: { maxLength: 48 }, image_urls: { type: 'array', maxItems: 2, items: { type: 'string' } },
                resolution: { enum: ['1k', '2k'] }, output_format: { enum: ['png', 'jpeg'] },
                background: { enum: ['auto'] },
                aspect_ratio: { enum: ['1:1'] }
            } }
        });
        if (path.endsWith('/credit')) return ok({ available: '1.20', funding: { prepaidAvailableUsd: '1.10' } });
        if (path.endsWith('/upload-url')) {
            const { bytes } = JSON.parse(options.body);
            return ok({ uploadUrl: `https://mock.invalid/upload/fil_${bytes}`,
                fileId: `fil_${bytes}`, maxBytes: 100, headers: { 'Content-Length': String(bytes) } });
        }
        if (path.endsWith('/commit')) return ok({ status: 'ready', uri: `spicy://f/${path.split('/').at(-2)}` });
        if (path.endsWith('/quote')) {
            assert.deepEqual(JSON.parse(options.body), {
                model, input: { prompt: 'Combine Image 1 and Image 2', image_urls: ['spicy://f/fil_5', 'spicy://f/fil_6'],
                    aspect_ratio: '1:1', resolution: '1k', output_format: 'png', background: 'auto' }
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
    const images = ['data:image/png;base64,aW1hZ2U=', 'data:image/png;base64,c2Vjb25k'];
    assert.equal((await call('quote', { body: { prompt: 'Use @image 3', images } })).status, 400);
    assert.equal((await call('quote', { body: { prompt: 'Edit', images: [...images, images[0]] } })).status, 400);
    assert.equal(calls.filter(x => x.path.endsWith('/upload-url')).length, 0);
    const quote = await (await call('quote', { body: {
        prompt: 'Combine @image 1 and @image 2', ratio: '1:1', images
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
    const quoted = JSON.parse(calls.find(x => x.path.endsWith('/quote')).options.body);
    assert.deepEqual(JSON.parse(creates[0].options.body).input, quoted.input);
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
    assert.equal(await context.runSpicyEdit('Edit', ['image'], '1:1'), null);
    assert.deepEqual(calls.splice(0), ['pending', 'quote']);
    confirmed = true;
    await assert.rejects(context.runSpicyEdit('Edit', ['image'], '1:1'), /콘텐츠가 거절/);
    assert.deepEqual(calls, ['pending', 'quote', 'create', 'task/job_mock']);
    assert.equal(values.size, 0);
});
