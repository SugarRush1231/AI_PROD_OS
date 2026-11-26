const express = require('express');
const fetch = require('node-fetch');
const { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');

const MODEL = 'bytedance/seedream-5.5/edit';
const BASE = 'https://api.spicyapi.ai/api/v1';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const REPLAY_WINDOW = 20 * 60 * 60 * 1000;

function canUseSpicy(req) {
    const owner = process.env.SPICY_OWNER_GOOGLE_ID?.trim();
    return Boolean(owner && process.env.SPICY_API_KEY && process.env.SESSION_SECRET?.length >= 32 &&
        req.isAuthenticated() && req.user.provider === 'google' && req.user.id === owner);
}

function fail(status, message, code) {
    throw Object.assign(new Error(message), { status, code });
}

function signature(value) {
    return createHmac('sha256', process.env.SPICY_API_KEY)
        .update('ai-prod-os/seedream/quote:').update(value).digest();
}

function sealQuote(quote) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', signature('quote-encryption-key'), iv);
    return Buffer.concat([iv, cipher.update(JSON.stringify(quote)), cipher.final(), cipher.getAuthTag()]).toString('base64url');
}

function openQuote(token) {
    if (typeof token !== 'string' || token.length > 100000 || !/^[\w-]{39,}$/.test(token)) {
        fail(400, '유효한 견적이 필요합니다.');
    }
    try {
        const raw = Buffer.from(token, 'base64url');
        if (raw.toString('base64url') !== token) throw new Error('Invalid quote encoding');
        const cipher = createDecipheriv('aes-256-gcm', signature('quote-encryption-key'), raw.subarray(0, 12));
        cipher.setAuthTag(raw.subarray(-16));
        return JSON.parse(Buffer.concat([cipher.update(raw.subarray(12, -16)), cipher.final()]));
    } catch {
        fail(400, '유효한 견적이 필요합니다.');
    }
}

function spicyImageRouter(request = fetch, { pool, generationQuota } = {}) {
    const router = express.Router();
    let catalog;
    let catalogUntil = 0;

    async function api(path, body, key) {
        const headers = { Authorization: `Bearer ${process.env.SPICY_API_KEY}` };
        if (body) headers['Content-Type'] = 'application/json';
        if (key) headers['Idempotency-Key'] = key;
        const response = await request(BASE + path, {
            headers, method: body === undefined ? 'GET' : 'POST',
            body: body === null ? undefined : JSON.stringify(body),
            redirect: 'error', timeout: 20000
        });
        const envelope = await response.json();
        if (response.ok && envelope.code === 200 && envelope.data) return envelope.data;
        const code = String(envelope.code);
        if (code === '40201') fail(402, 'SpicyAPI 사용 가능 잔액이 부족합니다.', code);
        if (code === '40202') fail(402, 'SpicyAPI 지출 한도에 도달했습니다. 월간 예산과 키 한도를 확인해 주세요.', code);
        if (code === 'content_rejected') fail(422, '콘텐츠가 거절되었습니다.', code);
        if (code === '40901') fail(409, '견적이 만료되었거나 변경되었습니다. 새 견적을 확인해 주세요.', code);
        if (response.status === 400) fail(400, 'SpicyAPI가 입력을 거절했습니다. 프롬프트와 참고 이미지를 확인해 주세요.', code);
        if (response.status === 404 && path.startsWith('/jobs/recordInfo')) fail(404, 'SpicyAPI 작업을 찾을 수 없습니다.', code);
        if (response.status === 409 || response.status === 429) {
            fail(response.status, 'SpicyAPI가 요청을 처리 중이거나 호출 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.', code);
        }
        fail(502, 'SpicyAPI 응답을 확인할 수 없습니다.', code);
    }

    async function model() {
        if (Date.now() >= catalogUntil) {
            const data = await api(`/models/${MODEL}`);
            if (data.model !== MODEL || data.enabled !== true || data.available !== true ||
                !data.inputSchema?.properties?.prompt) {
                fail(503, '현재 키에서 Seedream 5.5 Edit 스키마 또는 모델을 사용할 수 없습니다.');
            }
            catalog = data;
            catalogUntil = Date.now() + 5 * 60 * 1000;
        }
        return catalog;
    }

    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (!canUseSpicy(req)) return res.status(403).json({ error: '소유자 계정에서만 사용할 수 있습니다.' });
        if (req.method === 'POST' && (!req.is('application/json') || req.get('Sec-Fetch-Site') === 'cross-site')) {
            return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
        }
        next();
    });
    const route = (handle) => async (req, res) => {
        try {
            res.json(await handle(req));
        } catch (error) {
            res.status(error.status || 502).json({
                error: error.status ? error.message : 'SpicyAPI 연결 상태를 확인해 주세요.',
                code: error.status ? error.code : undefined
            });
        }
    };

    router.get('/balance', route(async () => {
        const data = await api('/chat/credit');
        return { available: data.available, prepaid: data.funding?.prepaidAvailableUsd };
    }));

    router.get('/pending', route(async (req) => {
        if (!pool) return null;
        const { rows } = await pool.query(`SELECT task_id, token FROM spicy_operations
            WHERE user_id = $1 AND finished_at IS NULL ORDER BY created_at DESC LIMIT 1`, [req.user.id]);
        return rows[0]?.task_id ? { taskId: rows[0].task_id } : rows[0]?.token ? { token: rows[0].token } : null;
    }));

    router.post('/clear-expired', route(async (req) => {
        const token = req.body?.token;
        const quote = openQuote(token);
        if (quote.owner !== req.user.id || Date.now() - quote.issued < REPLAY_WINDOW) {
            fail(409, '아직 접수 상태를 확인할 수 있는 요청입니다.');
        }
        if (pool) await pool.query(`DELETE FROM spicy_operations
            WHERE user_id = $1 AND fingerprint = $2 AND submission_key = $3 AND task_id IS NULL`,
        [quote.owner, quote.fingerprint, signature(token).toString('hex')]);
        return { cleared: true };
    }));

    router.post('/quote', route(async (req) => {
        const { inputSchema: schema } = await model();
        const props = schema.properties;
        const imageField = ['image_urls', 'image_url', 'reference_image_urls'].find(name =>
            props[name]?.type === 'string' || (props[name]?.type === 'array' && props[name].items?.type === 'string'));
        if (!imageField || props[imageField].minItems > 1) fail(503, '현재 스키마의 참고 이미지 형식을 지원할 수 없습니다.');
        const { prompt, image, ratio } = req.body || {};
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > (props.prompt.maxLength ?? 10000)) {
            fail(400, '모델의 길이 제한에 맞는 편집 프롬프트를 입력해 주세요.');
        }
        const maxBytes = Math.min(MAX_IMAGE_BYTES, (props[imageField]['x-ui']?.max_size_mb || 10) * 1024 * 1024);
        const match = typeof image === 'string' && image.length <= Math.ceil(maxBytes / 3) * 4 + 40 &&
            /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
        const bytes = match && Buffer.from(match[2], 'base64');
        if (!bytes?.length || bytes.length > maxBytes) {
            fail(400, `참고 이미지가 필요합니다. JPEG, PNG, WebP, GIF (${maxBytes / 1048576} MiB 이하).`);
        }
        const ticket = await api('/common/upload-url', { contentType: match[1], bytes: bytes.length });
        if (!/^https:\/\//.test(ticket.uploadUrl) || !/^fil_[\w-]+$/.test(ticket.fileId) || bytes.length > ticket.maxBytes) {
            fail(502, 'SpicyAPI 업로드 정보를 확인할 수 없습니다.');
        }
        const uploaded = await request(ticket.uploadUrl, {
            method: 'PUT', headers: ticket.headers, body: bytes, redirect: 'error', timeout: 30000
        });
        if (!uploaded.ok) fail(502, '참고 이미지 업로드에 실패했습니다.');
        const asset = await api(`/files/${ticket.fileId}/commit`, null);
        if (asset.status !== 'ready' || asset.uri !== `spicy://f/${ticket.fileId}`) fail(502, '참고 이미지 준비에 실패했습니다.');

        const input = { prompt, [imageField]: props[imageField].type === 'array' ? [asset.uri] : asset.uri };
        for (const name of schema.required || []) {
            if (!Object.hasOwn(input, name) && props[name]?.default !== undefined) input[name] = props[name].default;
        }
        if (props.aspect_ratio?.enum?.includes(ratio)) input.aspect_ratio = ratio;
        if (props.num_images?.enum?.includes(1) || props.num_images?.minimum === 1) input.num_images = 1;
        const quote = await api('/jobs/quote', { model: MODEL, input });
        if (typeof quote.quoteId !== 'string' || !/^\d+(?:\.\d+)?$/.test(quote.estimatedCost) ||
            quote.currency !== 'USD' || !Number.isFinite(Date.parse(quote.expiresAt))) {
            fail(502, 'SpicyAPI 견적을 확인할 수 없습니다.');
        }
        const fingerprint = createHash('sha256')
            .update(JSON.stringify([prompt, input.aspect_ratio ?? null, match[1]])).update(bytes).digest('hex');
        const token = sealQuote({
            input, quoteId: quote.quoteId, expectedCost: quote.estimatedCost,
            owner: req.user.id, issued: Date.now(), fingerprint
        });
        return { token, cost: quote.estimatedCost, expiresAt: quote.expiresAt, ratio: input.aspect_ratio };
    }));

    router.post('/create', ...(generationQuota ? [generationQuota] : []), route(async (req) => {
        const token = req.body?.token;
        const { input, quoteId, expectedCost, owner, issued, fingerprint } = openQuote(token);
        if (owner !== req.user.id || Date.now() - issued >= REPLAY_WINDOW) {
            fail(409, 'SpicyAPI 콘솔에서 기존 요청의 접수 여부를 확인해 주세요.', 'replay_expired');
        }
        const key = signature(token).toString('hex');
        if (pool) {
            const reserved = await pool.query(`
                INSERT INTO spicy_operations (user_id, fingerprint, submission_key, token) VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, fingerprint) DO UPDATE
                SET submission_key = EXCLUDED.submission_key, token = EXCLUDED.token, task_id = NULL,
                    created_at = NOW(), finished_at = NULL
                WHERE spicy_operations.finished_at < NOW() - INTERVAL '1 minute'
                RETURNING submission_key
            `, [owner, fingerprint, key, token]);
            const existing = reserved.rows[0] || (await pool.query(`
                SELECT submission_key, task_id FROM spicy_operations WHERE user_id = $1 AND fingerprint = $2
            `, [owner, fingerprint])).rows[0];
            if (existing?.task_id) return { taskId: existing.task_id };
            if (existing?.submission_key !== key) {
                fail(409, '동일한 편집 요청의 접수 확인이 진행 중입니다. 이전 요청을 먼저 확인해 주세요.', 'duplicate_pending');
            }
        }
        let task;
        try {
            task = await api('/jobs/createTask', { model: MODEL, input, quoteId, expectedCost }, key);
        } catch (error) {
            if (pool && ([400, 402, 422].includes(error.status) || error.code === '40901')) {
                await pool.query(`
                    DELETE FROM spicy_operations WHERE user_id = $1 AND fingerprint = $2
                    AND submission_key = $3 AND task_id IS NULL
                `, [owner, fingerprint, key]);
            }
            throw error;
        }
        if (!/^job_[\w-]+$/.test(task.taskId)) fail(502, '작업 접수 상태를 확인할 수 없습니다.');
        if (pool) await pool.query(`
            UPDATE spicy_operations SET task_id = $4, token = NULL
            WHERE user_id = $1 AND fingerprint = $2 AND submission_key = $3
        `, [owner, fingerprint, key, task.taskId]);
        return { taskId: task.taskId };
    }));

    router.get('/task/:id', route(async (req) => {
        if (!/^job_[\w-]+$/.test(req.params.id)) fail(400, '유효한 작업 ID가 필요합니다.');
        const task = await api(`/jobs/recordInfo?taskId=${encodeURIComponent(req.params.id)}`);
        if (task.model !== MODEL) fail(404, 'Seedream 편집 작업을 찾을 수 없습니다.');
        const assets = task.output?.assets || [];
        const pending = assets.some(asset => asset.pending);
        if (pool && !pending && !['queued', 'running'].includes(task.state)) {
            await pool.query('UPDATE spicy_operations SET finished_at = NOW() WHERE user_id = $1 AND task_id = $2 AND finished_at IS NULL',
                [req.user.id, req.params.id]);
        }
        return {
            state: task.state, settled: task.settled, cost: task.cost, code: task.errorCode,
            pending,
            url: assets.find(asset => /^https:\/\//.test(asset.url) &&
                (!asset.mime || asset.mime.startsWith('image/')))?.url,
            error: task.errorMessage
        };
    }));
    return router;
}

module.exports = { canUseSpicy, spicyImageRouter };
