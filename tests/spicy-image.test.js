const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const express = require('express');
const { spicyImageRouter } = require('../spicy-image');
const script = readFileSync(require.resolve('../script.js'), 'utf8');
const editor = script.slice(script.indexOf('function readSpicyPending('), script.indexOf('async function spicyImageRequest(')) +
    script.slice(script.indexOf('async function runSpicyEdit('), script.indexOf('function showGenerationStatus('));

test('Seedream starts at 9:16 and remembers each provider’s selected ratio', () => {
    const source = script.slice(script.indexOf('function initSpicyImageControls('), script.indexOf('async function resumeSpicyImage('));
    const provider = new EventTarget();
    provider.value = 'default';
    const ratio = { value: 'auto' };
    const doc = new EventTarget();
    doc.getElementById = id => id === 'image-provider' ? provider : id === 'imageRatioInput' ? ratio : {
        classList: { toggle() {} }, style: {}
    };
    const context = vm.createContext({
        document: doc, window: new EventTarget(), Event,
        spicyImageStorageKey: undefined, currentImageBase64: undefined,
        seedreamEditor: { element: { dataset: {}, setAttribute() {} } },
        renderSeedreamRefs() {}, refreshSpicyBalance() {}, resumeSpicyImage() {}
    });
    vm.runInContext(source, context);
    context.initSpicyImageControls('owner');
    assert.equal(provider.value, 'spicy');
    assert.equal(ratio.value, '9:16');
    ratio.value = '4:3';
    const select = value => { provider.value = value; provider.dispatchEvent(new Event('change')); };
    select('default');
    assert.equal(ratio.value, 'auto');
    ratio.value = '1:1';
    select('spicy');
    assert.equal(ratio.value, '4:3');
    select('default');
    assert.equal(ratio.value, '1:1');
});

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

test('editor submits once after pricing and stops safely before or after submission', async () => {
    const values = new Map();
    const status = {};
    let existingTask;
    let abortQuote;
    let createError;
    let taskResult = { state: 'failed', code: 'content_rejected', settled: true, cost: '0' };
    const calls = [];
    const context = vm.createContext({
        spicyImageStorageKey: 'owner-pending',
        localStorage: {
            getItem: key => values.get(key),
            setItem: (key, value) => values.set(key, value),
            removeItem: key => values.delete(key)
        },
        waitForTaskLookup: async () => {},
        showSystemConfirm: async () => assert.fail('Normal generation should skip the confirmation dialog'),
        spicyImageRequest: async (path, body, signal) => {
            calls.push(path);
            if (path === 'pending') return existingTask || null;
            if (path === 'quote') {
                abortQuote?.();
                signal?.throwIfAborted();
                return { token: 'token', cost: '0.035', expiresAt: new Date().toISOString() };
            }
            if (path === 'create') {
                assert.match(status.textContent, /예상 비용 USD 0\.035/);
                assert.equal(body.token, 'token');
                if (createError) {
                    if (!createError.status) existingTask = { taskId: 'job_mock' };
                    throw createError;
                }
                return { taskId: 'job_mock' };
            }
            return taskResult;
        }
    });
    vm.runInContext(editor, context);
    await assert.rejects(context.runSpicyEdit('Edit', ['image'], '1:1', status), /콘텐츠가 거절/);
    assert.deepEqual(calls, ['pending', 'quote', 'create', 'task/job_mock']);
    assert.equal(values.size, 0);

    for (const code of ['40201', '40202', 'content_rejected']) {
        calls.length = 0;
        createError = Object.assign(new Error(code), { status: code === 'content_rejected' ? 422 : 402, code });
        await assert.rejects(context.runSpicyEdit('Edit', ['image'], '1:1', status), new RegExp(code));
        assert.deepEqual(calls, ['pending', 'quote', 'create']);
        assert.equal(values.size, 0);
    }

    calls.length = 0;
    createError = new TypeError('Connection dropped after submission');
    taskResult = { state: 'succeeded', url: 'https://mock.invalid/resumed.png' };
    assert.equal((await context.runSpicyEdit('Edit', ['image'], '1:1', status)).data.url, taskResult.url);
    assert.deepEqual(calls, ['pending', 'quote', 'create', 'pending', 'task/job_mock']);
    assert.equal(values.size, 0);
    existingTask = undefined;
    createError = undefined;

    calls.length = 0;
    const quoteController = new AbortController();
    abortQuote = () => quoteController.abort();
    await assert.rejects(context.runSpicyEdit('Edit', ['image'], '1:1', null, { signal: quoteController.signal }),
        { name: 'AbortError' });
    assert.deepEqual(calls, ['pending', 'quote']);
    assert.equal(values.size, 0);

    calls.length = 0;
    const pollingController = new AbortController();
    existingTask = { taskId: 'job_mock' };
    values.set('owner-pending', JSON.stringify(existingTask));
    await assert.rejects(context.runSpicyEdit('', [], 'auto', null, {
        signal: pollingController.signal, onSubmitted: () => pollingController.abort()
    }), { name: 'AbortError' });
    assert.deepEqual(calls, ['pending']);
    assert.equal(values.get('owner-pending'), JSON.stringify(existingTask));
});

test('editor retrieves the same result after a long background pause and a dropped poll', async () => {
    const calls = [];
    const storage = new Map();
    const states = [];
    const status = { set textContent(value) { states.push(value); } };
    let now = 0;
    let lookups = 0;
    let downloads = 0;
    const context = vm.createContext({
        Date: { now: () => now },
        spicyImageStorageKey: 'owner-pending',
        localStorage: {
            getItem: key => storage.get(key),
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        waitForTaskLookup: async () => { now += 180000; },
        async spicyImageRequest(path) {
            calls.push(path);
            if (path === 'pending') return { taskId: 'job_mobile' };
            assert.equal(path, 'task/job_mobile');
            switch (++lookups) {
                case 1: throw new TypeError('Connection dropped');
                case 2: return { state: 'queued' };
                case 3: return { state: 'running' };
                case 4: return { state: 'succeeded', pending: true };
                default: return { state: 'succeeded', url: `https://mock.invalid/mobile.png?lookup=${lookups}` };
            }
        }
    });
    vm.runInContext(editor, context);
    const result = await context.runSpicyEdit('', [], 'auto', status, {
        async loadResult() {
            assert.equal(JSON.parse(storage.get('owner-pending')).taskId, 'job_mobile');
            if (++downloads === 1) throw new Error('Expired file link');
        }
    });
    assert.equal(result.data.url, 'https://mock.invalid/mobile.png?lookup=6');
    assert.deepEqual(calls, ['pending', ...Array(6).fill('task/job_mobile')]);
    for (const label of ['연결이 끊겼거나', '대기열', '편집 중', '결과 파일 준비 중', '이미지 링크를 다시 확인']) {
        assert.ok(states.some(state => state.includes(label)), label);
    }
    assert.equal(storage.size, 0);
});

test('returning to the page wakes a pending lookup and resumes only a confirmed task', async () => {
    const doc = new EventTarget();
    const win = new EventTarget();
    doc.hidden = true;
    doc.getElementById = id => id === 'image-provider' ? { value: 'spicy' } : { disabled: false };
    const calls = [];
    let paused = false;
    let pending = { token: 'unconfirmed' };
    const context = vm.createContext({
        document: doc, window: win, navigator: {},
        setTimeout, clearTimeout, spicyImageStorageKey: 'owner-pending', checkingSpicyRecovery: false,
        localStorage: { getItem: () => null }, sessionStorage: { getItem: () => paused ? '1' : null },
        async spicyImageRequest(path) { calls.push(path); return pending; },
        async generateImage(taskId) { calls.push(taskId); }
    });
    vm.runInContext(script.slice(script.indexOf('async function resumeSpicyImage('), script.indexOf('async function spicyImageRequest(')) +
        script.slice(script.indexOf('function waitForTaskLookup('), script.indexOf('function loadSpicyResult(')), context);

    let awake = false;
    const lookup = context.waitForTaskLookup(15000).then(() => { awake = true; });
    await context.resumeSpicyImage();
    assert.equal(awake, false);
    assert.deepEqual(calls, []);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    await lookup;
    await context.resumeSpicyImage();
    assert.deepEqual(calls, ['pending']);

    pending = { taskId: 'job_mobile' };
    paused = true;
    await context.resumeSpicyImage();
    assert.deepEqual(calls, ['pending']);
    paused = false;
    await context.resumeSpicyImage();
    assert.deepEqual(calls, ['pending', 'pending', 'job_mobile']);
});
