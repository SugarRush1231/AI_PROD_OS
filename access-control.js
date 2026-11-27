const session = require('express-session');
const { createHmac, timingSafeEqual } = require('node:crypto');

const SESSION_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'ai-prod.sid';

class PostgresSessionStore extends session.Store {
    constructor(pool) {
        super();
        this.pool = pool;
    }

    get(id, callback) {
        this.pool.query('SELECT data FROM app_sessions WHERE id = $1 AND expires_at > NOW()', [id])
            .then(({ rows }) => callback(null, rows[0]?.data ?? null), callback);
    }

    set(id, data, callback) {
        this.pool.query(`INSERT INTO app_sessions (id, data, expires_at) VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
        [id, data, data.cookie.expires || new Date(Date.now() + SESSION_MS)])
            .then(() => callback?.(), callback);
    }

    touch(id, data, callback) {
        this.pool.query('UPDATE app_sessions SET expires_at = $2 WHERE id = $1',
            [id, data.cookie.expires || new Date(Date.now() + SESSION_MS)])
            .then(() => callback?.(), callback);
    }

    destroy(id, callback) {
        this.pool.query('DELETE FROM app_sessions WHERE id = $1', [id])
            .then(() => callback?.(), callback);
    }
}

function minimalGoogleProfile(profile) {
    return {
        id: profile.id,
        provider: 'google',
        displayName: profile.displayName,
        photos: profile.photos?.slice(0, 1).map(({ value }) => ({ value })),
        verifiedEmail: profile._json?.email_verified === true ? profile._json.email?.toLowerCase() : undefined
    };
}

function publicProfile(user) {
    if (!user) return null;
    const { id, displayName, photos } = user;
    return { id, displayName, photos };
}

function isGoogleOwner(req) {
    const owner = process.env.SPICY_OWNER_GOOGLE_ID?.trim();
    return Boolean(owner && req.isAuthenticated() && req.user?.provider === 'google' && req.user.id === owner);
}

function csrfToken(req) {
    return createHmac('sha256', process.env.SESSION_SECRET).update('csrf:').update(req.sessionID).digest('hex');
}

function requireCsrf(req, res, next) {
    const expected = csrfToken(req);
    const supplied = req.get('X-CSRF-Token');
    if (!expected || typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) {
        return res.status(403).json({ error: '요청을 확인할 수 없습니다. 페이지를 새로고침해 주세요.' });
    }
    next();
}

function quota(pool, bucket, minutes, max) {
    return async (req, res, next) => {
        try {
            const { rows } = await pool.query(`
                INSERT INTO api_usage (user_id, bucket, window_id, count)
                VALUES ($1, $2, floor(extract(epoch FROM now()) / $3)::bigint * $3, 1)
                ON CONFLICT (user_id, bucket, window_id) DO UPDATE SET count = api_usage.count + 1
                WHERE api_usage.count < $4
                RETURNING count
            `, [req.user.id, bucket, minutes * 60, max]);
            if (!rows.length) return res.status(429).json({ error: '계정의 API 사용량 한도에 도달했습니다.' });
            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = {
    SESSION_MS, SESSION_COOKIE, PostgresSessionStore, minimalGoogleProfile, publicProfile, isGoogleOwner, csrfToken, requireCsrf, quota
};
