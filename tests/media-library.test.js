const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { archiveSource, initMediaDb, mediaLibrary } = require('../media-library');

let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch {}

function testPool(db) {
    const pool = {
        async query(sql, args) {
            const result = await db.query(sql, args);
            return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
        },
        async connect() { return { query: pool.query, release() {} }; }
    };
    return pool;
}

test('only the configured Google owner can save results or upload videos', async t => {
    process.env.SPICY_OWNER_GOOGLE_ID = 'owner';
    process.env.SESSION_SECRET = 'test-secret-with-more-than-32-characters';
    const archive = mediaLibrary({ query: async () => ({ rows: [] }) }, {}, async () => {
        assert.fail('An unauthorized request reached the media downloader');
    });
    const app = express();
    app.use(express.json(), (req, res, next) => {
        const id = req.get('Test-User');
        req.isAuthenticated = () => Boolean(id);
        req.user = id ? { id, provider: req.get('Test-Provider') || 'google' } : undefined;
        next();
    }, archive.router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = archiveSource({ id: 'member' }, 'image', 'https://images.example.test/result.png');
    for (const path of ['/', '/upload-video']) {
        const save = (id, provider = 'google') => fetch(base + path, {
            method: 'POST', headers: { 'Test-User': id, 'Test-Provider': provider, 'Content-Type': 'application/json' },
            body: JSON.stringify(id === 'member' ? { token } : {})
        });
        assert.equal((await save('')).status, 401);
        assert.equal((await save('member')).status, 403);
        assert.equal((await save('owner', 'other')).status, 403);
        assert.equal((await save('owner')).status, 400);
    }
    const list = await fetch(base + '/', { headers: { 'Test-User': 'member' } });
    assert.equal(list.status, 200);
    assert.deepEqual((await list.json()).items, []);
});

test('archive copies once, enforces account ownership and quota, and releases storage on delete', {
    skip: !PGlite && 'Optional PostgreSQL integration runtime: @electric-sql/pglite'
}, async t => {
    process.env.SPICY_OWNER_GOOGLE_ID = 'one';
    process.env.SESSION_SECRET = 'test-secret-with-more-than-32-characters';
    const db = new PGlite();
    const pool = testPool(db);
    await initMediaDb(pool);
    const objects = new Map();
    let uploads = 0;
    const storage = {
        async put(key, file) { uploads++; objects.set(key, file); },
        async remove(key) { objects.delete(key); },
        async url(key) { return `https://storage.example.test/${key}?signed=mock`; }
    };
    const archive = mediaLibrary(pool, storage, async () => ({
        body: Buffer.from('test-image'), size: 10, mime: 'image/png'
    }));
    const app = express();
    app.use(express.json(), (req, res, next) => {
        const id = req.get('Test-User');
        req.isAuthenticated = () => Boolean(id);
        req.user = { id, provider: 'google' };
        next();
    }, archive.router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await db.close();
    });
    const call = (path, user, { method = 'GET', body } = {}) => fetch(
        `http://127.0.0.1:${server.address().port}${path}`, {
            method, body: JSON.stringify(body), redirect: 'manual',
            headers: { 'Test-User': user, 'Content-Type': 'application/json' }
        }
    );
    const token = archiveSource({ id: 'one' }, 'image', 'https://images.example.test/result.png');
    const save = user => call('/', user, { method: 'POST', body: { token } });
    assert.equal((await call('/', '')).status, 401);
    assert.equal((await save('two')).status, 403);
    const created = await save('one');
    assert.equal(created.status, 200, await created.clone().text());
    const { id } = await created.json();
    assert.deepEqual(await (await save('one')).json(), { id });
    assert.equal(uploads, 1);
    assert.equal((await (await call('/', 'two')).json()).items.length, 0);
    assert.equal((await call(`/${id}/file`, 'two')).status, 404);
    assert.match((await call(`/${id}/file`, 'one')).headers.get('location'), /signed=mock/);
    assert.equal((await call(`/${id}`, 'two', { method: 'DELETE' })).status, 404);
    assert.equal((await call(`/${id}`, 'one', { method: 'DELETE' })).status, 204);
    assert.equal(objects.size, 0);
    assert.equal((await (await call('/', 'one')).json()).items.length, 0);
    await db.query(`INSERT INTO media_archive (id, owner_id, source_hash, kind, mime, bytes, state)
        VALUES ('00000000-0000-4000-8000-000000000001', 'one', 'quota-fixture', 'video', 'video/mp4', 262144000, 'ready')`);
    assert.equal((await save('one')).status, 409);
    assert.equal(uploads, 1);
});

test('the existing PostgreSQL database stores private files and serves video byte ranges without a bucket', {
    skip: !PGlite && 'Optional PostgreSQL integration runtime: @electric-sql/pglite'
}, async t => {
    process.env.SPICY_OWNER_GOOGLE_ID = 'owner';
    process.env.SESSION_SECRET = 'test-secret-with-more-than-32-characters';
    const db = new PGlite();
    const pool = testPool(db);
    await initMediaDb(pool);
    await initMediaDb(pool);
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 42]);
    const video = Buffer.alloc(2 * 1024 * 1024 + 16, 42);
    Buffer.from([26, 69, 223, 163]).copy(video);
    const archive = mediaLibrary(pool, null, async () => ({ body: image, size: image.length, mime: 'image/png' }));
    const app = express();
    app.use(express.json(), (req, res, next) => {
        const id = req.get('Test-User');
        req.isAuthenticated = () => Boolean(id);
        req.user = { id, provider: 'google' };
        next();
    }, archive.router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await db.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (path, { user = 'owner', headers, ...rest } = {}) => fetch(base + path, {
        ...rest, headers: { 'Test-User': user, ...headers }
    });
    const token = archiveSource({ id: 'owner' }, 'image', 'https://images.example.test/result.png');
    const save = () => call('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    const imageSave = await save();
    assert.equal(imageSave.status, 200, await imageSave.clone().text());
    const imagePath = `/${(await imageSave.json()).id}/file`;
    assert.deepEqual(Buffer.from(await (await call(imagePath)).arrayBuffer()), image);
    assert.equal((await call(imagePath, { user: 'other' })).status, 404);
    assert.equal((await call(imagePath, { user: '' })).status, 401);

    const form = new FormData();
    form.append('video', new Blob([video], { type: 'video/webm' }), 'generated-video.webm');
    const videoSave = await call('/upload-video', { method: 'POST', body: form });
    assert.equal(videoSave.status, 200, await videoSave.clone().text());
    const { id: videoId } = await videoSave.json();
    const videoPath = `/${videoId}/file`;
    const part = await call(videoPath, { headers: { Range: 'bytes=2-7' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 2-7/${video.length}`);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), video.subarray(2, 8));
    assert.equal((await call(videoPath, { method: 'HEAD' })).headers.get('content-length'), String(video.length));
    assert.equal((await call(videoPath, { headers: { Range: `bytes=${video.length}-` } })).status, 416);
    assert.deepEqual(Buffer.from(await (await call(videoPath)).arrayBuffer()), video);
    const list = await (await call('/')).json();
    assert.equal(list.storage, 'postgres');
    assert.equal(list.items.length, 2);
    assert.equal((await call(`/${videoId}`, { method: 'DELETE' })).status, 204);
    assert.equal((await db.query('SELECT 1 FROM media_archive_files WHERE id = $1', [videoId])).rows.length, 0);
    assert.equal((await call(imagePath.replace('/file', ''), { method: 'DELETE' })).status, 204);

    await db.query(`INSERT INTO media_archive (id, owner_id, source_hash, kind, mime, bytes, state, storage_backend)
        VALUES ('00000000-0000-4000-8000-000000000001', 'previous-owner', 'full', 'video', 'video/webm', 262144000, 'ready', 'postgres')`);
    assert.equal((await save()).status, 507);
    await db.query('DELETE FROM media_archive');
    await db.query(`INSERT INTO media_archive (id, owner_id, source_hash, kind, mime, bytes, state, storage_backend)
        SELECT md5('quota-' || n)::uuid, 'owner', 'quota-' || n, 'image', 'image/png', 1, 'ready', 'postgres'
        FROM generate_series(1, 200) AS n`);
    assert.equal((await save()).status, 409);
});
