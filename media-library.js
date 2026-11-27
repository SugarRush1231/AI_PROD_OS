const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');
const dns = require('node:dns');
const { Agent } = require('node:https');
const { BlockList, isIP } = require('node:net');
const { createHash, createHmac, randomUUID, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { isGoogleOwner } = require('./access-control');

const MIB = 1024 * 1024;
const MAX_FILE = { image: 10 * MIB, video: 50 * MIB };
const MAX_ITEMS = 200;
const TOTAL_ITEMS = 20000;
const ACCOUNT_BYTES = 250 * MIB;
const TOTAL_BYTES = 5120 * MIB;
const DATABASE_MEDIA_BYTES = 250 * MIB;
const DATABASE_CHUNK_BYTES = 2 * MIB;
const TOKEN_LIFETIME = 60 * 60 * 1000;
const upload = multer({ dest: os.tmpdir(), limits: { files: 1, parts: 2, fileSize: MAX_FILE.video } });

function signature(payload) {
    return createHmac('sha256', process.env.SESSION_SECRET).update('media-library/v1:').update(payload).digest();
}

function archiveSource(user, kind, url) {
    if (!user?.id || !MAX_FILE[kind] || typeof url !== 'string' || url.length > 12000 || !url.startsWith('https://')) return;
    const payload = Buffer.from(JSON.stringify({ owner: user.id, kind, url, expires: Date.now() + TOKEN_LIFETIME })).toString('base64url');
    return payload + '.' + signature(payload).toString('base64url');
}

function fail(status, message) {
    throw Object.assign(new Error(message), { status });
}

function readSource(token, owner) {
    if (typeof token !== 'string' || token.length > 16500 || !/^[\w-]+\.[\w-]{43}$/.test(token)) {
        fail(400, '보관할 생성 결과를 다시 열어 주세요.');
    }
    const [payload, mac] = token.split('.');
    if (!timingSafeEqual(signature(payload), Buffer.from(mac, 'base64url'))) fail(403, '보관 권한이 없습니다.');
    const data = JSON.parse(Buffer.from(payload, 'base64url'));
    if (data.owner !== owner) fail(403, '보관 권한이 없습니다.');
    if (data.expires < Date.now()) fail(410, '결과 링크가 만료되었습니다.');
    return data;
}

const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blocked.addSubnet(ip, prefix, 'ipv4');
const publicIPv6 = new BlockList();
publicIPv6.addSubnet('2000::', 3, 'ipv6');
for (const [ip, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
    blocked.addSubnet(ip, prefix, 'ipv6');
}
const publicAgent = new Agent({
    lookup(host, options, callback) {
        dns.lookup(host, { all: true, family: options.family || 0 }, (error, records) => {
            if (error) return callback(error);
            const allowed = records.filter(({ address, family }) =>
                family === 4 ? !blocked.check(address, 'ipv4')
                    : publicIPv6.check(address, 'ipv6') && !blocked.check(address, 'ipv6'));
            if (!allowed.length) return callback(new Error('Non-public media origin'));
            if (options.all) return callback(null, allowed);
            callback(null, allowed[0].address, allowed[0].family);
        });
    }
});

function inspectMedia(bytes, kind) {
    const text = (a, b) => bytes.subarray(a, b).toString('ascii');
    if (kind === 'image') {
        if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
        if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
        if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return 'image/gif';
        if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
    }
    if (kind === 'video') {
        if (text(4, 8) === 'ftyp') return 'video/mp4';
        if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return 'video/webm';
    }
    fail(415, '지원하는 이미지 또는 영상 파일이 아닙니다.');
}

async function downloadSource(source) {
    let url = new URL(source.url);
    const signal = AbortSignal.timeout(35000);
    for (let redirects = 0; redirects <= 3; redirects++) {
        if (url.protocol !== 'https:' || url.port || url.username || url.password || isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
            fail(400, '허용되지 않은 결과 주소입니다.');
        }
        const response = await fetch(url, { agent: publicAgent, redirect: 'manual', signal, size: MAX_FILE[source.kind] });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            response.body?.destroy();
            if (!location) break;
            url = new URL(location, url);
            continue;
        }
        if (!response.ok || Number(response.headers.get('content-length')) > MAX_FILE[source.kind]) {
            response.body?.destroy();
            if (response.ok) fail(413, '파일이 보관 가능한 크기를 초과했습니다.');
            fail(410, '공급자의 결과 파일을 가져올 수 없습니다.');
        }
        try {
            const bytes = await response.buffer();
            return { body: bytes, size: bytes.length, mime: inspectMedia(bytes, source.kind) };
        } catch (error) {
            if (error.type === 'max-size') fail(413, '파일이 보관 가능한 크기를 초과했습니다.');
            throw error;
        }
    }
    fail(502, '결과 파일을 가져올 수 없습니다.');
}

function storageFromEnv() {
    const { MEDIA_BUCKET, MEDIA_S3_ENDPOINT, MEDIA_S3_REGION, MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY } = process.env;
    if (!MEDIA_BUCKET || !MEDIA_S3_ACCESS_KEY_ID || !MEDIA_S3_SECRET_ACCESS_KEY) return null;
    if (MEDIA_S3_ENDPOINT && new URL(MEDIA_S3_ENDPOINT).protocol !== 'https:') throw new Error('MEDIA_S3_ENDPOINT must use HTTPS');
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const client = new S3Client({
        endpoint: MEDIA_S3_ENDPOINT || undefined, region: MEDIA_S3_REGION || (MEDIA_S3_ENDPOINT ? 'auto' : 'us-east-1'),
        forcePathStyle: Boolean(MEDIA_S3_ENDPOINT),
        requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: { accessKeyId: MEDIA_S3_ACCESS_KEY_ID, secretAccessKey: MEDIA_S3_SECRET_ACCESS_KEY }
    });
    return {
        put: (key, file) => client.send(new PutObjectCommand({
            Bucket: MEDIA_BUCKET, Key: key, Body: file.body, ContentLength: file.size, ContentType: file.mime,
            CacheControl: 'private, no-store'
        }), { abortSignal: AbortSignal.timeout(90000) }),
        remove: key => client.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }),
            { abortSignal: AbortSignal.timeout(15000) }),
        url: key => getSignedUrl(client, new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }), { expiresIn: 300 })
    };
}

async function initMediaDb(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS media_archive (
        id UUID PRIMARY KEY, owner_id TEXT NOT NULL, source_hash TEXT NOT NULL, kind TEXT NOT NULL,
        mime TEXT NOT NULL, bytes BIGINT NOT NULL CHECK (bytes > 0), state TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(owner_id, source_hash)
    )`);
    await pool.query("ALTER TABLE media_archive ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'bucket'");
    await pool.query(`CREATE TABLE IF NOT EXISTS media_archive_files (
        id UUID PRIMARY KEY REFERENCES media_archive(id) ON DELETE CASCADE,
        body BYTEA NOT NULL
    )`);
}

function mediaLibrary(pool, storage = storageFromEnv(), fetchMedia = downloadSource) {
    const router = express.Router();
    const storageBackend = storage ? 'bucket' : 'postgres';
    let saving = 0;
    const key = id => 'media/' + id;
    const route = handle => async (req, res) => {
        try { await handle(req, res); }
        catch (error) {
            if (res.destroyed || res.headersSent) return res.destroy();
            if (!error.status) console.error('[MEDIA_ARCHIVE]', error.name, error.code || '');
            res.status(error.status || 502).json({ error: error.status ? error.message : '보관함 요청에 실패했습니다.' });
        }
    };
    async function reserve(owner, sourceHash, kind, file) {
        const db = await pool.connect();
        try {
            await db.query('BEGIN');
            await db.query('SELECT pg_advisory_xact_lock(41650779)');
            const previous = (await db.query('SELECT id, state, storage_backend FROM media_archive WHERE owner_id = $1 AND source_hash = $2',
                [owner, sourceHash])).rows[0];
            if (previous && previous.state !== 'ready') fail(409, '같은 파일을 처리 중입니다.');
            if (previous) {
                if (!storage && previous.storage_backend === 'bucket') fail(503, '기존 보관 파일의 버킷 연결을 확인해 주세요.');
                await db.query('COMMIT');
                return { id: previous.id, existing: true };
            }
            const { rows: [usage] } = await db.query(`SELECT
                COALESCE(SUM(bytes), 0) AS total, COUNT(*) AS total_items,
                COALESCE(SUM(bytes) FILTER (WHERE storage_backend = 'postgres'), 0) AS database_bytes,
                COALESCE(SUM(bytes) FILTER (WHERE owner_id = $1), 0) AS own,
                COUNT(*) FILTER (WHERE owner_id = $1) AS items FROM media_archive`, [owner]);
            if (Number(usage.own) + file.size > ACCOUNT_BYTES || Number(usage.items) >= MAX_ITEMS) {
                fail(409, '계정 보관 한도에 도달했습니다. 보관함에서 파일을 삭제해 주세요.');
            }
            if (Number(usage.total) + file.size > TOTAL_BYTES || Number(usage.total_items) >= TOTAL_ITEMS) {
                fail(507, '서비스 보관 공간이 가득 찼습니다.');
            }
            if (!storage && Number(usage.database_bytes) + file.size > DATABASE_MEDIA_BYTES) {
                fail(507, '데이터베이스 보관 한도에 도달했습니다. 보관함에서 파일을 삭제해 주세요.');
            }
            const id = randomUUID();
            await db.query(`INSERT INTO media_archive (id, owner_id, source_hash, kind, mime, bytes, state, storage_backend)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, owner, sourceHash, kind, file.mime, file.size, storage ? 'pending' : 'ready', storageBackend]);
            if (!storage) await db.query('INSERT INTO media_archive_files (id, body) VALUES ($1, $2)', [id, file.body]);
            await db.query('COMMIT');
            return { id };
        } catch (error) {
            await db.query('ROLLBACK').catch(() => {});
            throw error;
        } finally { db.release(); }
    }

    async function save(owner, kind, file, sourceHash) {
        const { id, existing } = await reserve(owner, sourceHash, kind, file);
        if (!storage || existing) return id;
        try {
            await storage.put(key(id), file);
        } catch (error) {
            await storage.remove(key(id)).then(() => pool.query("DELETE FROM media_archive WHERE id = $1 AND state = 'pending'", [id]))
                .catch(() => {});
            throw error;
        }
        await pool.query("UPDATE media_archive SET state = 'ready' WHERE id = $1", [id]);
        return id;
    }

    async function sendDatabaseFile(req, res, item) {
        const size = Number(item.bytes);
        const ranges = req.range(size);
        if (ranges === -1) return res.status(416).set('Content-Range', `bytes */${size}`).end();
        const range = ranges?.type === 'bytes' && ranges.length === 1 ? ranges[0] : null;
        const { start, end } = range || { start: 0, end: size - 1 };
        async function readChunk(offset) {
            const length = Math.min(DATABASE_CHUNK_BYTES, end - offset + 1);
            const { rows: [file] } = await pool.query('SELECT substring(body FROM $2::int FOR $3::int) AS part FROM media_archive_files WHERE id = $1',
                [req.params.id, offset + 1, length]);
            if (file?.part?.length !== length) fail(404, '보관 파일을 찾을 수 없습니다.');
            return Buffer.from(file.part);
        }
        const first = req.method === 'HEAD' ? null : await readChunk(start);
        res.status(range ? 206 : 200).set({ 'Content-Type': item.mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) });
        if (range) res.set('Content-Range', `bytes ${start}-${end}/${size}`);
        if (!first) return res.end();
        async function* chunks() {
            yield first;
            for (let offset = start + first.length; offset <= end && !res.destroyed; offset += DATABASE_CHUNK_BYTES) {
                yield await readChunk(offset);
            }
        }
        await pipeline(Readable.from(chunks()), res);
    }

    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (!req.isAuthenticated()) return res.status(401).json({ error: '로그인 후 보관함을 사용할 수 있습니다.' });
        if (req.method === 'POST' && !isGoogleOwner(req)) {
            return res.status(403).json({ error: '관리자 계정에서만 파일을 보관할 수 있습니다.' });
        }
        next();
    });
    router.get('/', route(async (req, res) => {
        const { rows } = await pool.query(`SELECT id, kind, bytes, created_at FROM media_archive
            WHERE owner_id = $1 AND state = 'ready' ORDER BY created_at DESC`, [req.user.id]);
        res.json({ items: rows, limit: ACCOUNT_BYTES, maxItems: MAX_ITEMS, storage: storageBackend });
    }));
    router.post('/', route(async (req, res) => {
        if (saving >= 2) fail(429, '보관 중인 파일이 많습니다. 잠시 후 다시 시도해 주세요.');
        const source = readSource(req.body?.token, req.user.id);
        saving++;
        try {
            const file = await fetchMedia(source);
            const sourceHash = createHash('sha256').update(file.body).digest('hex');
            res.json({ id: await save(req.user.id, source.kind, file, sourceHash) });
        } finally { saving--; }
    }));
    router.post('/upload-video', (req, res, next) => {
        if (saving >= 2) return res.status(429).json({ error: '보관 중인 파일이 많습니다.' });
        saving++;
        let finished = false;
        const release = () => { if (!finished) { saving--; finished = true; } };
        res.once('finish', release);
        res.once('close', release);
        next();
    }, upload.single('video'), route(async (req, res) => {
        if (!req.file) fail(400, '보관할 영상이 없습니다.');
        try {
            const bytes = await fs.readFile(req.file.path);
            const mime = inspectMedia(bytes, 'video');
            const sourceHash = createHash('sha256').update(bytes).digest('hex');
            res.json({ id: await save(req.user.id, 'video', { body: bytes, size: bytes.length, mime }, sourceHash) });
        } finally { await fs.unlink(req.file.path).catch(() => {}); }
    }));
    router.param('id', (req, res, next, id) => {
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) return res.sendStatus(404);
        next();
    });
    router.get('/:id/file', route(async (req, res) => {
        const { rows: [item] } = await pool.query("SELECT storage_backend, mime, bytes FROM media_archive WHERE id = $1 AND owner_id = $2 AND state = 'ready'",
            [req.params.id, req.user.id]);
        if (!item) fail(404, '보관 파일을 찾을 수 없습니다.');
        if (item.storage_backend === 'postgres') return sendDatabaseFile(req, res, item);
        if (!storage) fail(503, '기존 보관 파일의 버킷 연결을 확인해 주세요.');
        res.redirect(await storage.url(key(req.params.id)));
    }));
    router.delete('/:id', route(async (req, res) => {
        const { rows: [item] } = await pool.query("SELECT storage_backend FROM media_archive WHERE id = $1 AND owner_id = $2 AND state IN ('ready', 'deleting')",
            [req.params.id, req.user.id]);
        if (!item) fail(404, '보관 파일을 찾을 수 없습니다.');
        if (item.storage_backend === 'postgres') {
            await pool.query('DELETE FROM media_archive WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
            return res.sendStatus(204);
        }
        if (!storage) fail(503, '기존 보관 파일의 버킷 연결을 확인해 주세요.');
        const { rowCount } = await pool.query(`UPDATE media_archive SET state = 'deleting', updated_at = NOW()
            WHERE id = $1 AND owner_id = $2 AND state IN ('ready', 'deleting')`, [req.params.id, req.user.id]);
        if (!rowCount) fail(404, '보관 파일을 찾을 수 없습니다.');
        await storage.remove(key(req.params.id));
        await pool.query('DELETE FROM media_archive WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
        res.sendStatus(204);
    }));
    return {
        router, enabled: true,
        async prune() {
            if (!storage) return;
            const { rows } = await pool.query(`SELECT id FROM media_archive
                WHERE state IN ('pending', 'deleting') AND updated_at < NOW() - INTERVAL '1 hour' LIMIT 100`);
            for (const { id } of rows) {
                await storage.remove(key(id)).then(() => pool.query("DELETE FROM media_archive WHERE id = $1 AND state != 'ready'", [id]))
                    .catch(() => {});
            }
        }
    };
}

module.exports = { archiveSource, initMediaDb, mediaLibrary };
