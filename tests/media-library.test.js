const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { archiveSource, initMediaDb, mediaLibrary } = require('../media-library');

let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch {}

test('archive copies once, enforces account ownership and quota, and releases storage on delete', {
    skip: !PGlite && 'Optional PostgreSQL integration runtime: @electric-sql/pglite'
}, async t => {
    process.env.SESSION_SECRET = 'test-secret-with-more-than-32-characters';
    const db = new PGlite();
    const pool = {
        async query(sql, args) {
            const result = await db.query(sql, args);
            return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
        },
        async connect() { return { query: pool.query, release() {} }; }
    };
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
        req.user = { id };
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
