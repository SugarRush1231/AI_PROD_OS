const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const appScript = readFileSync(require.resolve('../script.js'), 'utf8');
const imageClient = appScript.slice(appScript.indexOf('function kieGenerationStatus('), appScript.indexOf('async function generateImage('));

test('Kie image status reports provider states and preserves plain JSON clients', async () => {
    const serverScript = readFileSync(require.resolve('../server.js'), 'utf8');
    const source = serverScript.slice(serverScript.indexOf('async function generateWithKie('), serverScript.indexOf('// --- 🎬 영상 생성 (n8n'));
    let route;
    const nextState = ['waiting', 'waiting', 'generating', 'success'];
    const url = 'https://mock.invalid/kie-result.png';
    const context = vm.createContext({
        app: { post: (_, ...handlers) => { route = handlers.at(-1); } },
        ensureAuthenticated() {}, strictAiLimiter() {}, generationQuota() {},
        canUsePaid: () => true,
        archiveSource: () => 'mock-archive-token',
        process: { env: { KIE_API_KEY: 'mock-key' } },
        setTimeout: resolve => resolve(),
        async fetch(path) {
            if (path.endsWith('/createTask')) return { json: async () => ({ code: 200, data: { taskId: 'task_kie' } }) };
            assert.match(path, /recordInfo\?taskId=task_kie$/);
            const state = nextState.shift();
            return { json: async () => ({ data: { state, resultJson: JSON.stringify({ resultUrls: [url] }) } }) };
        }
    });
    vm.runInContext(source, context);
    const request = accept => ({ get: () => accept, body: { prompt: 'test', aspect_ratio: '1:1' }, user: {} });
    const events = [];
    const response = {
        headersSent: false,
        set(headers) { assert.equal(headers['Content-Type'], 'application/x-ndjson'); },
        write(line) { this.headersSent = true; events.push(line); },
        end(line) { events.push(line); }
    };
    await route(request('application/x-ndjson'), response);
    assert.deepEqual(events.slice(0, -1).map(line => JSON.parse(line).state), ['submitting', 'accepted', 'waiting', 'generating']);

    const labels = [];
    const payload = events.join('');
    const chunks = [payload.slice(0, 25), payload.slice(25, -12), payload.slice(-12)];
    let requested;
    const client = vm.createContext({
        TextDecoder,
        async apiFetch(path, options) {
            requested = { path, options };
            return new Response(new ReadableStream({
                start(controller) {
                    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
                    controller.close();
                }
            }), { headers: { 'Content-Type': 'application/x-ndjson' } });
        }
    });
    vm.runInContext(imageClient, client);
    const result = await client.requestStudioImage({ prompt: 'test' }, label => labels.push(label));
    assert.equal(requested.options.headers.Accept, 'application/x-ndjson');
    assert.equal(result.data.data.url, url);
    assert.deepEqual(labels, ['Kie 이미지 생성 요청 · 접수 응답 대기 중…', 'Kie 이미지 작업 접수 · 상태 확인 중…',
        'Kie 이미지 작업 대기 중…', 'Kie 이미지 생성 중…']);

    nextState.push('success');
    let plain;
    await route(request('*/*'), { status: () => ({ json: body => { plain = body; } }) });
    assert.equal(plain.data.url, url);
    assert.equal(plain.data.provider, 'kie:z-image');
});

test('video uses queried states and failed or skipped Autopilot stages do not inflate completion', async () => {
    const source = appScript.slice(appScript.indexOf('const AP = {'), appScript.indexOf('const apRunBtn =')) + '\nthis.autopilot = AP;';
    const statuses = [];
    const states = ['waiting', 'queuing', 'generating', 'success'];
    const steps = ['done', 'partial', 'failed', 'skipped'].map(state => ({ classList: { contains: value => value === state } }));
    const bar = { style: {} };
    const text = {};
    const context = vm.createContext({
        AbortSignal, canRetryTaskLookup: () => false,
        waitForTaskLookup: async () => {}, recordGeneratedMedia() {},
        document: { querySelectorAll: () => steps, getElementById: id => id === 'ap-progress-bar' ? bar : text },
        async fetch(url) {
            assert.match(url, /taskId=job_video$/);
            const state = states.shift();
            return { ok: true, json: async () => ({ state, url: 'https://mock.invalid/video.mp4' }) };
        }
    });
    vm.runInContext(imageClient + source, context);
    assert.equal(await context.autopilot.pollTask('job_video', 10000, label => statuses.push(label)), 'https://mock.invalid/video.mp4');
    assert.deepEqual(statuses, ['영상 작업 대기 중…', '영상 작업 대기열에 있습니다…', '영상 생성 중…']);
    context.autopilot.updateProgress();
    assert.equal(bar.style.width, '33%');
    assert.match(text.innerText, /1\/3단계 완료 · 실패 또는 일부 완료 2단계/);
});
