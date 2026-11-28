require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs').promises; // 파일 시스템 추가
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const os = require('os');
const session = require('express-session');
const { Pool } = require('pg');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { SESSION_MS, SESSION_COOKIE, PostgresSessionStore, minimalGoogleProfile, publicProfile,
    isGoogleOwner, csrfToken, requireCsrf, quota } = require('./access-control');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { canUseSpicy, spicyImageRouter } = require('./spicy-image');
const { archiveSource, initMediaDb, mediaLibrary } = require('./media-library');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs_sync = require('fs');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 25 * 1024 * 1024, files: 1, parts: 2 } });
const production = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.trim().length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const databaseUrl = new URL(process.env.DATABASE_URL);
for (const option of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) databaseUrl.searchParams.delete(option);
const localDatabase = !production && ['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname);
const pool = new Pool({
    connectionString: databaseUrl.toString(),
    ssl: localDatabase ? false : { rejectUnauthorized: true, ca: process.env.PG_CA_CERT?.replace(/\\n/g, '\n') }
});
pool.on('error', error => console.error('[DB_POOL]', error.message));
const archive = mediaLibrary(pool);

// --- [MIDDLEWARE: AUTH CHECK] ---
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: '로그인 후 진행해 주세요.' });
};

// --- [유료 기능 허용 계정] ---
// ALLOWED_EMAILS="a@gmail.com,b@gmail.com" → 이 계정만 유료 API(Kie 이미지·영상) 사용
// 비워 두면 Kie 유료 기능은 모든 계정에서 비활성화됩니다.
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const canUsePaid = (req) => req.isAuthenticated() && ALLOWED_EMAILS.includes(req.user.verifiedEmail);
const ensurePaidAccess = (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: '로그인 후 진행해 주세요.' });
    if (canUsePaid(req)) return next();
    res.status(403).json({ error: '승인된 계정만 사용할 수 있는 기능입니다.' });
};

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY_CIDRS?.split(',').map(x => x.trim()).filter(Boolean) || false);
app.set('query parser', 'simple');
const PORT = process.env.PORT || 3000;
const SERVER_START_TIME = Date.now();

// 🕒 외부 요청 최신 유입 시각 기록용 변수 (cron-job 중단 감지용)
let lastRequestTime = Date.now();

// 모든 접속(cron-job 포함)에 대해 제일 먼저 통과하도록 하여 시간 갱신
app.use((req, res, next) => {
    lastRequestTime = Date.now();
    next();
});

// --- [PASSPORT AUTH CONFIG] ---
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ✅ 배포 환경에서는 CALLBACK_URL 환경변수 사용, 로컬에서는 상대경로 사용
const callbackURL = process.env.CALLBACK_URL || '/auth/google/callback';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'NOT_SET',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'NOT_SET',
    callbackURL: callbackURL,
    scope: ['profile', 'email'],
    state: true
}, (accessToken, refreshToken, profile, done) => {
    return done(null, minimalGoogleProfile(profile));
}));

// 1. 보안 설정: 서버 시그니처 숨기기 및 CSP 보호
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "blob:", "'wasm-unsafe-eval'", "https://cdn.jsdelivr.net"], // Supertonic(onnxruntime-web)
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"], // Pretendard
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https://*", "https://lh3.googleusercontent.com"],
            mediaSrc: ["'self'", "data:", "blob:", "https://*"], // 비디오 재생 허용
            connectSrc: ["'self'", "https://text.pollinations.ai", "https://api.groq.com", "https:", "blob:", "data:"],
            upgradeInsecureRequests: null,
        },
    },
}));

// 2. 세션 및 인증 미들웨어
const cookieOptions = { secure: production, httpOnly: true, sameSite: 'lax', path: '/' };
app.use(session({
    name: SESSION_COOKIE,
    secret: sessionSecret,
    store: new PostgresSessionStore(pool),
    resave: false,
    saveUninitialized: false,
    cookie: { ...cookieOptions, maxAge: SESSION_MS }
}));
app.use(passport.initialize());
app.use(passport.session());

// 3. 로깅: 모든 HTTP 요청 추적
morgan.token('url', req => req.originalUrl.split('?')[0]);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- [AUTH ROUTES] ---
app.get('/auth/google', (req, res, next) => {
    req.session.appLogin = req.query.view === 'app';
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
    const entry = req.session.appLogin ? '/app' : '/';
    delete req.session.appLogin;
    passport.authenticate('google', { successRedirect: entry, failureRedirect: entry })(req, res, next);
});

app.post('/logout', ensureAuthenticated, requireCsrf, (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy((error) => {
            if (error) return next(error);
            res.clearCookie(SESSION_COOKIE, cookieOptions);
            res.clearCookie('connect.sid', cookieOptions);
            res.sendStatus(204);
        });
    });
});

// 4. 속도 제한 및 교차 출처
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    keyGenerator: (req) => req.user?.id || req.ip,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: '시스템 과부하 방지를 위해 요청이 제한되었습니다. 잠시 후 다시 시도해주세요.' }
});

// ✅ AI 전용 빡센 제한 (1분에 3회 허용 = 연타 방지 및 사용자 단위 격리)
const strictAiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 12, // 원클릭 파이프라인(장면별 이미지+영상 연속 호출) 대응
    keyGenerator: (req) => req.user ? req.user.id : req.ip,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: '비정상적인 다중 요청(연타)이 잦습니다. 서버 보호를 위해 1분 뒤에 다시 시도해주세요.' }
});

// ✅ 일반 API 연타 방지 (1분에 10회 허용)
// 텍스트 생성(Groq, 무료 티어)은 기획→스토리보드→숏리스트를 연속 실행하므로 한도를 넉넉하게
const textAiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    keyGenerator: (req) => req.user ? req.user.id : req.ip,
    message: { error: '요청이 너무 많습니다. 1분 후 다시 시도해 주세요.' }
});

const generalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.user ? req.user.id : req.ip,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: '단기간에 너무 많은 조회 요청이 발생했습니다. 잠시 대기해주세요.' }
});

// ✅ DB 및 설정 무한 연타 방지 (1분에 20회 허용 - 버튼 더블 클릭 보호 등)
const dbApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => req.user ? req.user.id : req.ip,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: '데이터 저장 및 삭제 클릭이 너무 잦습니다. 연타를 멈추고 기다려주세요.' }
});

app.get('/api/me', generalApiLimiter, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: publicProfile(req.user), canUsePaid: canUsePaid(req), canUseSpicy: canUseSpicy(req),
        canSaveMedia: isGoogleOwner(req),
        csrfToken: req.user ? csrfToken(req) : null, mediaLibraryEnabled: Boolean(req.user && archive.enabled) });
});

// 4. 교차 출처 및 파싱 제한
const corsOptions = {
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], // DELETE 및 사전 요청용 OPTIONS 누락분 선제적 보충
    credentials: true, // 세션 및 쿠키 기반 인증 정보를 CORS 요청에서도 안전하게 전달
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
const accountApiQuota = quota(pool, 'api', 1, 120);
const generationQuota = quota(pool, 'generation', 1440, 60);
app.use('/api', apiLimiter, (req, res, next) => {
    if (req.user) return accountApiQuota(req, res, next);
    next();
}, (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    ensureAuthenticated(req, res, () => requireCsrf(req, res, next));
});
app.use('/api/spicy-image', (req, res, next) => {
    if (!canUseSpicy(req)) return res.status(403).json({ error: '소유자 계정에서만 사용할 수 있습니다.' });
    next();
}, express.json({ limit: '14mb' }), spicyImageRouter(undefined, { pool, generationQuota }));
app.use('/api/video/create', ensurePaidAccess, express.json({ limit: '32mb' }));
app.use('/api', express.json({ limit: '1mb' }));
app.use('/api/media-archive', archive.router);
// 🔄 캐시 문제 방지: 빌드 환경에서 파일 수정 시각이 1980년으로 고정돼 브라우저가 옛 파일을 재사용하는 일이 있어
//    HTML은 매번 새로 받게 하고(no-store), JS·CSS 주소에는 배포(서버 시작) 시각을 버전으로 붙인다
const ASSET_VERSION = String(SERVER_START_TIME);
let MAIN_HTML = null;
const renderMainHtml = () => {
    if (MAIN_HTML && process.env.NODE_ENV === 'production') return MAIN_HTML;
    const raw = fs_sync.readFileSync(path.join(__dirname, 'workflow_web.html'), 'utf8');
    MAIN_HTML = raw
        .replace(/src="script\.js"/g, `src="script.js?v=${ASSET_VERSION}"`)
        .replace(/src="prompt-rules\.js"/g, `src="prompt-rules.js?v=${ASSET_VERSION}"`)
        .replace(/src="prompt-catalog\.js"/g, `src="prompt-catalog.js?v=${ASSET_VERSION}"`)
        .replace(/href="style\.css(\?v=[^"]*)?"/g, `href="style.css?v=${ASSET_VERSION}"`)
        .replace(/src="supertonic\/tts\.js"/g, `src="supertonic/tts.js?v=${ASSET_VERSION}"`)
        .replace(/src="lighting-lab\.js"/g, `src="lighting-lab.js?v=${ASSET_VERSION}"`);
    return MAIN_HTML;
};
app.get(['/', '/index.html', '/workflow_web.html'], (req, res) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.type('html').send(renderMainHtml());
});
app.get('/app', (req, res) => {
    if (req.path !== '/app') return res.redirect(308, '/app');
    const appHtml = renderMainHtml()
        .replace('initial-scale=1.0', 'initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content')
        .replace('<title>Skill Studio — AI Pipeline Orchestration</title>', '<title>AI_PROD_OS</title>')
        .replace('</head>', `  <meta name="theme-color" content="#101528">\n  <link rel="manifest" href="/app.webmanifest">\n  <link rel="stylesheet" href="/app-view.css?v=${ASSET_VERSION}">\n</head>`)
        .replace('<body class="dark">', '<body class="dark app-view">')
        .replace('</body>', `  <script src="/app-view.js?v=${ASSET_VERSION}"></script>\n</body>`);
    res.set('Cache-Control', 'no-store, max-age=0');
    res.type('html').send(appHtml);
});
app.get('/app.webmanifest', (req, res) => {
    res.type('application/manifest+json').sendFile(path.join(__dirname, 'app.webmanifest'));
});
app.get('/.well-known/assetlinks.json', (req, res) => {
    res.type('application/json').sendFile(path.join(__dirname, 'android', 'assetlinks.json'), { maxAge: 300000 });
});

const staticOptions = {
    index: false,
    etag: false,          // 수정 시각이 1980년 고정이라 크기만으로 비교 → 내용이 바뀌어도 304가 나는 문제 방지
    lastModified: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, max-age=0');
        else if (/\.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');   // 버전 주소 + 항상 재검증
    }
};
for (const dir of ['assets', 'ico', 'img', 'supertonic']) {
    app.use(`/${dir}`, express.static(path.join(__dirname, dir), staticOptions));
}
app.get(['/script.js', '/prompt-rules.js', '/prompt-catalog.js', '/lighting-lab.js', '/style.css', '/app-view.js', '/app-view.css'], (req, res, next) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, path.basename(req.path)), { etag: false, lastModified: false }, error => {
        if (error) next(error);
    });
});

// --- ROUTES ---

// 메인 페이지 서빙


/**
 * Whisper STT API (Audio to Subtitles)
 * Only available for Authenticated Users + Rate Limiting
 */
app.post('/api/whisper', ensureAuthenticated, strictAiLimiter, generationQuota, upload.single('audio'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No audio file' });

        // 🛡️ 멀티 키 도입 (6개 조합) - 50명 동시접속 방어용
        const groqKeys = [
            process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
            process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5, process.env.GROQ_API_KEY_6
        ].filter(k => k && k.length > 10 && !k.includes('your-'));

        if (groqKeys.length === 0) {
            await fs.unlink(req.file.path).catch(() => { });
            return res.status(500).json({ error: 'GROQ_API_KEY is missing in .env' });
        }

        // 🛡️ 한글 파일명 인코딩 수정 (Multer/Windows 특유의 깨짐 방지)
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        addLogServer(`[GROQ_WHISPER] Processing: ${originalName}`);
        const fileExt = path.extname(originalName) || '.mp3';

        let fetchSuccess = false;
        let srtData = "";

        // 여러 개의 키를 순서대로 시도하며 터지면 바로 다음 키로 릴레이 (로드밸런싱 및 폴백)
        for (const key of groqKeys) {
            try {
                const formData = new FormData();
                formData.append('file', fs_sync.createReadStream(req.file.path), {
                    filename: `audio${fileExt}`,
                    contentType: req.file.mimetype
                });
                formData.append('model', 'whisper-large-v3');
                formData.append('response_format', 'verbose_json');

                const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
                    timeout: 45000,
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Bearer ${key}`
                    }
                });

                srtData = convertJsonToSrt(response.data.segments);
                fetchSuccess = true;
                console.log(`[GROQ_WHISPER_SUCCESS] STT Processed properly. Using a valid key.`);
                break; // 에러 안 나고 성공하면 반복문 종료
            } catch (err) {
                console.warn(`[GROQ_WHISPER_FAIL] Key exhausted. Trying next fallback key...`);
            }
        }

        // 사용 후 임시 파일 삭제
        await fs.unlink(req.file.path).catch(() => { });

        if (!fetchSuccess) {
            return res.status(500).json({ error: '모든 AI STT 노드가 혼잡합니다. 잠시 후 재시도하거나 관리자에게 문의하세요.' });
        }

        res.json({ result: srtData });
    } catch (err) {
        if (req.file) await fs.unlink(req.file.path).catch(() => { });
        console.error('[GROQ_ERROR_GLOBAL]', err.message);
        res.status(500).json({ error: 'STT 시스템 오류가 발생했습니다.' });
    }
});

// 🛠️ Helper: JSON을 SRT 자막 파일 형식으로 변환 (정밀 타임라인)
function convertJsonToSrt(segments) {
    if (!segments) return "자막을 추출할 수 없습니다.";
    return segments.map((seg, idx) => {
        const start = formatTime(seg.start);
        const end = formatTime(seg.end);
        return `${idx + 1}\n${start} --> ${end}\n${seg.text.trim()}\n`;
    }).join('\n');
}

function formatTime(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
    return date.toISOString().substr(11, 8) + ',' + ms;
}

// 서버 로그 유틸
function addLogServer(msg) {
    console.log(`> ${new Date().toLocaleTimeString()} | ${msg}`);
}

/**
 * AI 엔지니어링 API
 */
app.post('/api/engineer', ensureAuthenticated, textAiLimiter, generationQuota, async (req, res, next) => {
    try {
        const { intent, systemPrompt } = req.body;

        // 1차 필터링: 타입 및 길이 검증 (한글은 짧아도 의미가 명확하므로 2자로 완화)
        if (!intent || typeof intent !== 'string' || intent.length < 2) {
            return res.status(400).json({ error: 'Valid intent is required (min 2 chars)' });
        }

        if (intent.length > 5000) {
            return res.status(400).json({ error: 'Payload too large' });
        }

        const cleanIntent = intent.trim();
        console.log(`[AI_REQUEST] Input: ${cleanIntent.substring(0, 50)}...`);

        let fetchSuccess = false;
        let lastStatus = 0;
        let rawText = '';

        // 여러 개의 Groq API 키를 수집 (무료 한도 회피 6개 배열)
        const groqKeys = [
            process.env.GROQ_API_KEY,
            process.env.GROQ_API_KEY_2,
            process.env.GROQ_API_KEY_3,
            process.env.GROQ_API_KEY_4,
            process.env.GROQ_API_KEY_5,
            process.env.GROQ_API_KEY_6
        ].filter(k => k && k.length > 10 && !k.includes('your-'));

        let aiNodes = [];
        
        // 등록된 모든 키에 대해 고순도 70B -> 가벼운 8B 순서로 사용 노드 생성
        // 예: 키1의 70B 실패 -> 키1의 8B 실패 -> 키2의 70B 시도 -> 이런 식으로 동작
        groqKeys.forEach(key => {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            };
            // Groq가 2026-08-16에 Llama 3.x를 종료 → 권장 대체 모델(gpt-oss)로 교체
            aiNodes.push({ url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', headers });
            aiNodes.push({ url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-20b', headers });
        });

        for (let i = 0; i < aiNodes.length; i++) {
            const node = aiNodes[i];
            try {

                const requestBody = {
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: cleanIntent }
                    ]
                };
                
                // 캐시 우회를 위해 보이지 않는 임의의 시스템 해시 추가
                const randomHash = Math.random().toString(36).substring(2, 10);
                requestBody.messages[0].content += `\n\n[System Hash: ${randomHash}]`;
                
                if (node.model) requestBody.model = node.model;
                
                // 1. 모델 창의력 상향 (Temperature)
                // 2. 무한 반복/복붙 방지 (Frequency & Presence Penalty) - 앵무새처럼 루프도는 현상 하드웨어적 차단
                if (node.url.includes('groq.com')) {
                    requestBody.temperature = 0.7;
                    requestBody.max_tokens = 8192;          // 추론 토큰 포함 여유 확보
                    requestBody.reasoning_effort = 'low';    // gpt-oss: 짧게 생각하고 빠르게 답변
                    requestBody.include_reasoning = false;   // 응답에 추론 과정 제외 (본문만)
                }
                
                let aiResponse = await fetch(node.url, {
                    method: 'POST',
                    headers: node.headers,
                    body: JSON.stringify(requestBody)
                });

                // 선택 파라미터를 지원하지 않는 경우(400) 기본 파라미터로 한 번 더 시도
                if (aiResponse.status === 400) {
                    delete requestBody.reasoning_effort;
                    delete requestBody.include_reasoning;
                    aiResponse = await fetch(node.url, {
                        method: 'POST',
                        headers: node.headers,
                        body: JSON.stringify(requestBody)
                    });
                }
                
                lastStatus = aiResponse.status;

                // Rate Limit 방어: 429 에러 시 멍청한 모델로 점프하지 않고, 그 다음 줄(70B 형제)로 자연스레 넘어가도록 수정
                if (lastStatus === 429 && node.model === 'openai/gpt-oss-120b') {
                    console.warn(`[AI_RATE_LIMIT] 429 block hit. Automatically routing to the next 70B fallback model in the list...`);
                }

                if (aiResponse.ok) {
                    let tempText = await aiResponse.text();
                    
                    // 🛡️ 최후의 방어선: 오픈소스 모델의 한자/일본어/러시아어 등 외국어 출력 환각이 발생할 경우, 응답을 거름망(Regex)으로 버리고 즉시 재시도 
                    const foreignCharRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\uFAFF\u0400-\u052F\u0E00-\u0E7F\u0600-\u06FF]/;
                    if (foreignCharRegex.test(tempText)) {
                        console.warn(`[AI_NODE_REJECT] Node ${node.model} generated foreign characters (Hanja/Kana/Cyrillic). Retrying...`);
                        lastStatus = 406; // Not Acceptable
                        continue; // 결과를 버리고 다음 폴백 노드(재시도)로 강제 이동
                    }

                    fetchSuccess = true;
                    rawText = tempText;
                    console.log(`[AI_NODE_SUCCESS] ${node.url} (model: ${node.model})`);
                    break;
                }
                
                console.warn(`[AI_NODE_FAIL] Node ${node.model} failed with status ${lastStatus}. Trying next...`);
            } catch (err) {
                console.error(`[AI_FETCH_ERROR] Node ${node.model}: ${err.message}`);
            }
        }

        if (!fetchSuccess) {
            throw new Error(`AI Nodes Exhausted. (Last Status: ${lastStatus})`);
        }
        let extractionTarget = rawText.trim();

        // 🛡️ [무적의 SRT 수색 엔진 V3] - 비표준 형식(Index/Line/번호) 전역 교정
        try {
            const parsed = JSON.parse(extractionTarget);
            extractionTarget = parsed.choices?.[0]?.message?.content || parsed.content || parsed.message?.content || JSON.stringify(parsed);
        } catch (e) { }

        // 1. 비표준 인덱스 캡션 제거 (Index 1:, Line 2. 등을 순수 숫자로)
        extractionTarget = extractionTarget.replace(/^(Index|Line|번호|순번|Subtitle|Step)\s*(\d+)[:.]?\s*/gim, '$2');

        // 2. 시간코드 앞의 불필요한 텍스트 줄들 제거 (첫 자막 시작점 탐색)
        const timecodeRegex = /\d{2}:\d{2}:\d{2}[.,]\d{3}/;
        const firstTimecodeMatch = extractionTarget.match(timecodeRegex);

        if (firstTimecodeMatch) {
            const preText = extractionTarget.substring(0, firstTimecodeMatch.index);
            const indexMatch = preText.match(/(\d+)\s*$/);
            if (indexMatch) {
                // Ensure there is a newline between index and timecode if AI put them on the same line
                const potentialIndex = indexMatch[1];
                extractionTarget = potentialIndex + "\n" + extractionTarget.substring(firstTimecodeMatch.index);
            } else {
                extractionTarget = "1\n" + extractionTarget.substring(firstTimecodeMatch.index);
            }
        }

        // 3. 비표준 인덱스+시간 한 줄 붙어있는 형태 전역 보정 (e.g. "1 00:00:00,000" -> "1\n00:00:00,000")
        extractionTarget = extractionTarget.replace(/^(\d+)\s+(\d{2}:\d{2}:\d{2})/gm, '$1\n$2');

        let finalResult = extractionTarget
            .replace(/```(srt|vtt|script|text|json)?\n?/gi, '')
            .replace(/```/g, '')
            .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '') // 추론 태그 제거
            .replace(/<think>[\s\S]*?<\/think>/gi, '') // 추가적인 think 태그 제거
            .trim();

        // 3. 중간중간 섞인 비표준 인덱스들도 한 번 더 청소
        finalResult = finalResult.replace(/\n(Index|Line|번호|순번|Subtitle|Step)\s*(\d+)[:.]?\s*/gi, '\n$2');

        // 4. Pollinations.AI 광고성 하단 텍스트 전역 제거
        finalResult = finalResult
            .replace(/Support Pollinations\.AI:[\s\S]*/gi, '')
            .replace(/🌸\s*Ad\s*🌸[\s\S]*/gi, '')
            .replace(/Powered by Pollinations\.AI[\s\S]*/gi, '')
            .trim();

        // ==================================================================================
        // 🛡️ [최후의 방어선] 서버사이드 반복 블록 감지 및 자동 절단 필터
        // 프롬프트로는 절대 해결 불가능한 오픈소스 LLM의 근본적인 반복 환각을 프로그래밍으로 강제 차단
        // ==================================================================================
        try {
            // 자막 블록 분리: 번호, 타임코드, 또는 빈 줄 기준 (SRT, Script, 일반 텍스트 모두 대응)
            const blocks = finalResult.split(/\n\s*\n/).filter(b => b.trim().length > 0);
            
            if (blocks.length >= 4) {
                // 각 블록에서 순수 텍스트만 추출 (숫자, 타임코드, 특수기호 제거)
                const extractPureText = (block) => {
                    return block
                        .replace(/^\s*\(?\d+\)?\s*$/gm, '')                    // 순번 제거
                        .replace(/^\s*\*?\*?\(?\d+\)?\*?\*?\s*$/gm, '')        // 볼드 순번 제거
                        .replace(/[\d:,.\-\->()]+/g, '')                        // 타임코드/숫자 제거
                        .replace(/[^\uAC00-\uD7AF\s]/g, '')                     // 한글과 공백만 남김
                        .replace(/\s+/g, ' ')
                        .trim();
                };

                // 두 텍스트의 유사도 계산 (자카드 유사도 기반)
                const similarity = (a, b) => {
                    if (!a || !b || a.length < 10 || b.length < 10) return 0;
                    const wordsA = new Set(a.split(' '));
                    const wordsB = new Set(b.split(' '));
                    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
                    const union = new Set([...wordsA, ...wordsB]).size;
                    return union === 0 ? 0 : intersection / union;
                };

                let cutIndex = -1;
                let repeatCount = 0;
                const pureTexts = blocks.map(extractPureText);

                for (let i = 2; i < pureTexts.length; i++) {
                    // 현재 블록과 이전 블록들 중 하나라도 70% 이상 유사하면 반복으로 판정
                    let isRepeat = false;
                    for (let j = Math.max(0, i - 4); j < i; j++) {
                        if (similarity(pureTexts[i], pureTexts[j]) > 0.7) {
                            isRepeat = true;
                            break;
                        }
                    }
                    
                    if (isRepeat) {
                        repeatCount++;
                        if (repeatCount >= 2 && cutIndex === -1) {
                            cutIndex = i - 1; // 반복이 시작된 바로 전 블록에서 자름
                            console.warn(`[REPETITION_FILTER] Detected repetition loop starting at block ${i}. Truncating after block ${cutIndex}.`);
                        }
                    } else {
                        repeatCount = 0; // 새로운 내용이면 카운터 리셋
                    }
                }

                if (cutIndex > 0 && cutIndex < blocks.length - 1) {
                    const keptBlocks = blocks.slice(0, cutIndex + 1);
                    finalResult = keptBlocks.join('\n\n');
                    console.log(`[REPETITION_FILTER] Trimmed from ${blocks.length} blocks to ${keptBlocks.length} blocks.`);
                }
            }
        } catch (filterErr) {
            console.error(`[REPETITION_FILTER_ERROR] ${filterErr.message}`);
            // 필터 오류 시 원본 결과 그대로 반환 (안전 장치)
        }

        res.json({ result: finalResult || "자막 데이터를 추출하지 못했습니다.", model: 'orchestrated' });

    } catch (error) {
        // 에러를 next()로 넘기면 중앙 집중식 핸들러에서 최종 처리됨
        next(error);
    }
});

/**
 * 이미지 생성 API: Kie.ai z-image(1순위) → Pollinations(무료 폴백)
 * (영상은 /api/video/create · /api/video/status 로 분리)
 */
// --- Kie.ai Market API: 작업 생성 → 상태 폴링 → 결과 URL 반환 ---
async function generateWithKie(apiKey, prompt, aspectRatio, onStatus) {
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    const createRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: 'z-image', input: { prompt, aspect_ratio: aspectRatio } })
    });
    const created = await createRes.json();
    if (created.code !== 200 || !created.data?.taskId) {
        throw new Error(`createTask 실패 (code ${created.code}): ${created.msg}`);
    }
    const taskId = created.data.taskId;
    onStatus?.('accepted');

    const deadline = Date.now() + 120000; // 최대 2분 대기
    let lastState;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        const infoRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers });
        const info = await infoRes.json();
        const state = info.data?.state;
        if (state === 'success') {
            const result = JSON.parse(info.data.resultJson || '{}');
            const url = result.resultUrls?.[0];
            if (!url) throw new Error('결과 URL 없음');
            return url;
        }
        if (state === 'fail') throw new Error(`생성 실패: ${info.data?.failMsg || 'unknown'}`);
        if (state && state !== lastState) onStatus?.(state);
        lastState = state;
    }
    throw new Error('Kie 생성 시간 초과');
}

app.post('/api/generate-image', ensureAuthenticated, strictAiLimiter, generationQuota, async (req, res, next) => {
    // Existing clients receive JSON. The Studio opts into status events on the same request.
    const stream = req.get('Accept') === 'application/x-ndjson';
    const report = (provider, state) => {
        if (!stream || res.destroyed) return;
        if (!res.headersSent) res.set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
        res.write(JSON.stringify({ type: 'status', provider, state }) + '\n');
    };
    const reply = (status, body) => {
        if (res.destroyed) return;
        if (stream && res.headersSent) return res.end(JSON.stringify({ type: 'result', status, ...body }) + '\n');
        return res.status(status).json(body);
    };
    try {
        const { prompt } = req.body;
        let { aspect_ratio } = req.body;
        if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: '프롬프트가 필요합니다.' });

        // 🎬 영상 생성: 렌더링 엔진 종료로 현재 비활성 (비용 절감)
        const isVideo = req.body.generate_video || req.body.is_video || req.body.video;
        if (isVideo) {
            return res.status(503).json({ error: '영상 생성은 현재 일시 중단 상태입니다. (인프라 비용 절감)' });
        }

        // 🖼️ 이미지 생성 1순위: Kie.ai z-image (약 0.8크레딧/장) → 실패/키 없음 시 2순위: Pollinations(무료)
        const kieRatioMap = { '1:1': '1:1', '4:3': '4:3', '3:4': '3:4', '16:9': '16:9', '9:16': '9:16', '21:9': '16:9' };
        // Auto: 프롬프트 내용으로 비율 추정 (풍경→가로, 전신/세로→9:16, 제품·아이콘→정사각, 그 외 인물→3:4)
        if (!aspect_ratio || aspect_ratio === 'auto') {
            const p = String(prompt).toLowerCase();
            if (/(landscape|panoram|wide shot|cityscape|skyline|scenery|가로|풍경|16:9)/.test(p)) aspect_ratio = '16:9';
            else if (/(vertical|9:16|reels?|shorts|tiktok|story|full[- ]body|full-length|standing|세로|전신|릴스|쇼츠)/.test(p)) aspect_ratio = '9:16';
            else if (/(icon|logo|emblem|sticker|product shot|flat lay|top-down|아이콘|로고|정사각)/.test(p)) aspect_ratio = '1:1';
            else aspect_ratio = '3:4';
        }
        const kieKey = process.env.KIE_API_KEY;
        let fallbackReason = !kieKey ? 'KIE_API_KEY 미설정' : (!canUsePaid(req) ? '승인되지 않은 계정 (무료 엔진 사용)' : null);
        if (kieKey && canUsePaid(req)) {
            try {
                report('kie', 'submitting');
                const kieUrl = await generateWithKie(kieKey, String(prompt).slice(0, 1000), kieRatioMap[aspect_ratio] || '1:1', state => report('kie', state));
                return reply(200, { data: { url: kieUrl, provider: 'kie:z-image',
                    archiveToken: archiveSource(req.user, 'image', kieUrl) } });
            } catch (kieErr) {
                console.warn('[KIE_FALLBACK] Kie 실패 → Pollinations로 전환:', kieErr.message);
                fallbackReason = `Kie 실패: ${kieErr.message}`.slice(0, 300);
            }
        }

        const sizeMap = {
            '1:1': [1024, 1024], '16:9': [1344, 768], '9:16': [768, 1344],
            '3:4': [896, 1152], '4:3': [1152, 896], '21:9': [1536, 640]
        };
        const [width, height] = sizeMap[aspect_ratio] || [1024, 1024];
        const seed = Math.floor(Math.random() * 1e9);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).slice(0, 1500))}`
            + `?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`;

        reply(200, { data: { url, provider: 'pollinations', fallbackReason,
            archiveToken: archiveSource(req.user, 'image', url) } });
    } catch (error) {
        console.error('[IMAGE_GEN_ERROR]', error.message);
        reply(500, { error: '이미지 생성 요청에 실패했습니다.' });
    }
});


// --- 🎬 영상 생성 (n8n 없이 직접 비동기 처리): 작업 생성 → 브라우저가 상태 폴링 ---
// 모델: Kie Grok Imagine. 시작 이미지가 있으면 image-to-video, 없으면 text-to-video
const videoStatusLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.user ? req.user.id : req.ip,
    message: { error: '상태 조회가 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }
});

async function uploadImageToKie(apiKey, dataOrBase64) {
    const base64Data = dataOrBase64.startsWith('data:') ? dataOrBase64 : `data:image/png;base64,${dataOrBase64}`;
    const upRes = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ base64Data, uploadPath: 'ai-prod-os/video-refs', fileName: `ref_${Date.now()}.png` })
    });
    const up = await upRes.json();
    const url = up.data?.downloadUrl || up.data?.fileUrl || up.data?.url;
    if (!url) throw new Error(`참고 이미지 업로드 실패: ${up.msg || upRes.status}`);
    return url;
}

app.post('/api/video/create', ensurePaidAccess, strictAiLimiter, generationQuota, async (req, res) => {
    try {
        const apiKey = process.env.KIE_API_KEY;
        if (!apiKey) return res.status(503).json({ error: '영상 생성 키(KIE_API_KEY)가 설정되지 않았습니다.' });

        const { prompt, image, images, duration, resolution, aspect_ratio } = req.body;
        if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: '영상 프롬프트가 필요합니다.' });

        // 🎬 Grok Imagine (Kie): Seedance Lite가 계속 Internal Error라 교체. 480p·6초 기본(최저가)
        let model = 'grok-imagine/text-to-video';
        const input = {
            prompt: prompt.slice(0, 2000),
            mode: 'normal',
            duration: String(duration) === '10' ? '10' : '6',
            resolution: resolution === '720p' ? '720p' : '480p'
        };
        // 참고 이미지: images[] (최대 7장, Grok Imagine 한도) 또는 예전 방식 image 1장
        const refs = (Array.isArray(images) ? images : (image ? [image] : []))
            .filter(x => typeof x === 'string' && x).slice(0, 7);
        for (const [mention, number] of prompt.matchAll(/@image\s*(\d+)\b/gi)) {
            if (+number < 1 || +number > refs.length) {
                return res.status(400).json({ error: `${mention}에 해당하는 첨부 이미지가 없습니다.` });
            }
        }
        input.prompt = prompt.replace(/@image\s*(\d+)\b/gi, '@image$1').slice(0, 2000);
        if (refs.length) {
            input.image_urls = [];
            for (const ref of refs) input.image_urls.push(ref.startsWith('http') ? ref : await uploadImageToKie(apiKey, ref));
            model = 'grok-imagine/image-to-video';   // 영상 비율은 (첫) 이미지 비율을 따름
        } else {
            input.aspect_ratio = ['16:9', '9:16', '1:1', '2:3', '3:2'].includes(aspect_ratio) ? aspect_ratio : '9:16';
        }

        const createRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model, input }),
            timeout: 20000,
            redirect: 'error'
        });
        const created = await createRes.json();
        if (created.code !== 200 || !created.data?.taskId) {
            console.error('[VIDEO_CREATE_FAIL]', created);
            return res.status(502).json({ error: '영상 작업 접수 여부를 확인할 수 없습니다.' });
        }
        await pool.query('INSERT INTO video_tasks (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [created.data.taskId, req.user.id]);
        console.log(`[VIDEO] task ${created.data.taskId} (${model}, ${input.resolution}, ${input.duration}s, refs ${input.image_urls ? input.image_urls.length : 0})`);
        res.json({ taskId: created.data.taskId, model });
    } catch (err) {
        console.error('[VIDEO_CREATE_ERROR]', err.message);
        res.status(502).json({ error: '영상 작업 접수 여부를 확인할 수 없습니다.' });
    }
});

// --- 🎞 생성 결과 중계 (브라우저에서 영상 합치기·마지막 프레임 캡처용) ---
// 다른 도메인 영상은 canvas로 읽을 수 없어서 같은 주소로 중계. Kie 결과 도메인만 허용(SSRF 방지)
const MEDIA_HOST_ALLOW = ['aiquickdraw.com', 'redpandaai.co', 'kie.ai'];
app.get('/api/media-proxy', ensurePaidAccess, async (req, res) => {
    try {
        let target;
        try { target = new URL(String(req.query.url || '')); } catch (e) { return res.status(400).json({ error: '잘못된 주소' }); }
        const okHost = target.protocol === 'https:' && !target.port && !target.username && !target.password &&
            MEDIA_HOST_ALLOW.some(h => target.hostname === h || target.hostname.endsWith('.' + h));
        if (!okHost) return res.status(403).json({ error: '허용되지 않은 주소' });

        const headers = {};
        if (req.headers.range) headers.Range = req.headers.range;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        const disconnect = () => controller.abort();
        res.once('close', disconnect);
        try {
        const upstream = await fetch(target.toString(), { headers, redirect: 'error', signal: controller.signal, compress: false });
        if (!upstream.ok && upstream.status !== 206) return res.status(502).json({ error: `원본 응답 ${upstream.status}` });
        const type = upstream.headers.get('content-type')?.split(';')[0].toLowerCase();
        const maxBytes = 64 * 1024 * 1024;
        if (upstream.headers.get('content-encoding') ||
            !['video/mp4', 'video/webm', 'image/png', 'image/jpeg', 'image/webp'].includes(type) ||
            Number(upstream.headers.get('content-length')) > maxBytes) {
            upstream.body.destroy();
            return res.status(502).json({ error: '허용되지 않은 미디어 응답입니다.' });
        }

        res.status(upstream.status);
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
            const v = upstream.headers.get(h);
            if (v) res.setHeader(h, v);
        });
        res.setHeader('Cache-Control', 'private, max-age=3600');
        let received = 0;
        await pipeline(upstream.body, new Transform({
            transform(chunk, encoding, callback) {
                received += chunk.length;
                if (received > maxBytes) return callback(new Error('Media size limit exceeded'));
                callback(null, chunk);
            }
        }), res);
        } finally {
            clearTimeout(timer);
            res.removeListener('close', disconnect);
        }
    } catch (err) {
        if (!res.headersSent && !res.destroyed) res.status(502).json({ error: '미디어 원본을 가져올 수 없습니다.' });
    }
});

// 🎙 내레이션은 브라우저에서 Supertonic 3로 생성 (서버 비용 0원) — /supertonic/tts.js

// 작업 상태 조회 (영상 작업)
app.get(['/api/video/status', '/api/task/status'], ensurePaidAccess, videoStatusLimiter, async (req, res) => {
    try {
        const apiKey = process.env.KIE_API_KEY;
        const taskId = String(req.query.taskId || '');
        if (!apiKey || !/^[\w-]{4,200}$/.test(taskId)) return res.status(400).json({ error: '잘못된 요청입니다.' });
        const owned = await pool.query('SELECT 1 FROM video_tasks WHERE task_id = $1 AND user_id = $2',
            [taskId, req.user.id]);
        if (!owned.rowCount) return res.status(404).json({ error: '영상 작업을 찾을 수 없습니다.' });

        const infoRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 10000, redirect: 'error'
        });
        const info = await infoRes.json();
        const state = info.data?.state || 'unknown';
        let url = null;
        if (state === 'success') {
            try { url = JSON.parse(info.data.resultJson || '{}').resultUrls?.[0] || null; } catch (e) { }
        }
        res.json({ state, url, failMsg: info.data?.failMsg || null, archiveToken: archiveSource(req.user, 'video', url) });
    } catch (err) {
        res.status(502).json({ error: '영상 상태를 조회할 수 없습니다.' });
    }
});


// 서버 상태 조회 API (서버 시작 시간 + 외부 AI 노드 체크)
app.get('/api/status', generalApiLimiter, async (req, res) => {
    let aiNodeStatus = 'ONLINE';
    try {
        // AI 서버 가용성 체크 (단순 HEAD 대신 실제 접속 확인)
        const check = await fetch('https://text.pollinations.ai/prompt/test', { method: 'GET', timeout: 5000 });
        if (!check.ok) aiNodeStatus = 'DEGRADED';
    } catch (e) {
        aiNodeStatus = 'OFFLINE';
    }

    res.json({
        startTime: SERVER_START_TIME,
        aiNodeStatus: aiNodeStatus,
        host: os.hostname(),
        platform: os.platform()
    });
});

// --- PRESET DATABASE API ---
// --- [PERSISTENT POSTGRES STORAGE ENGINE] ---
// 데이터베이스 테이블 초기화 (최초 1회 실행)
const initDb = async () => {
    await initMediaDb(pool);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_sessions (id TEXT PRIMARY KEY, data JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
      CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions (expires_at);
      CREATE TABLE IF NOT EXISTS api_usage (
        user_id TEXT NOT NULL, bucket TEXT NOT NULL, window_id BIGINT NOT NULL, count INTEGER NOT NULL,
        PRIMARY KEY (user_id, bucket, window_id)
      );
      CREATE INDEX IF NOT EXISTS api_usage_window_idx ON api_usage (window_id);
      CREATE TABLE IF NOT EXISTS video_tasks (task_id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS spicy_operations (
        user_id TEXT NOT NULL, fingerprint TEXT NOT NULL, submission_key TEXT NOT NULL,
        token TEXT, task_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ,
        PRIMARY KEY (user_id, fingerprint)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_presets (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        preset_id BIGINT NOT NULL,
        name TEXT NOT NULL,
        params JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, preset_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_vps_settings (
        user_id TEXT PRIMARY KEY,
        settings JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[DB] user_presets & user_vps_settings tables are ready.');
};

async function pruneExpiredState() {
    await pool.query('DELETE FROM app_sessions WHERE expires_at <= NOW()');
    await pool.query('DELETE FROM api_usage WHERE window_id < extract(epoch FROM now()) - 172800');
    await pool.query("DELETE FROM spicy_operations WHERE finished_at < NOW() - INTERVAL '2 days'");
    await archive.prune();
}

// 프리셋 리스트 가져오기 (DB에서 내 user_id 데이터만)
app.get('/api/presets', ensureAuthenticated, dbApiLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT preset_id as id, name, params FROM user_presets WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    // PostgreSQL의 BIGINT(preset_id)는 문자열로 반환되므로, 
    // 프론트엔드(script.js)와의 호환성을 위해 숫자로 변환합니다.
    const presets = result.rows.map(row => ({
      ...row,
      id: Number(row.id)
    }));

    res.json(presets);
  } catch (e) {
    console.error('[DB_GET_ERROR]', e.message);
    res.status(503).json({ error: '프리셋을 조회할 수 없습니다.' });
  }
});

// 프리셋 저장하기 (DB에 INSERT)
app.post('/api/presets', ensureAuthenticated, dbApiLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: presetId, name, params } = req.body;

    await pool.query(
      'INSERT INTO user_presets (user_id, preset_id, name, params) VALUES ($1, $2, $3, $4)',
      [userId, presetId, name, JSON.stringify(params)]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[DB_SAVE_ERROR]', e.message);
    res.status(500).json({ error: '데이터베이스 저장에 실패했습니다.' });
  }
});

// 프리셋 삭제하기 (DB에서 DELETE)
app.delete('/api/presets/:id', ensureAuthenticated, dbApiLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const presetId = req.params.id;

    await pool.query(
      'DELETE FROM user_presets WHERE user_id = $1 AND preset_id = $2',
      [userId, presetId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[DB_DELETE_ERROR]', e.message);
    res.status(500).json({ error: '데이터베이스 삭제 실패.' });
  }
});

// --- VPS SETTINGS API (로그인 사용자 전용 설정 저장/복원) ---

// VPS 설정 불러오기
app.get('/api/vps-settings', ensureAuthenticated, dbApiLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT settings FROM user_vps_settings WHERE user_id = $1',
      [userId]
    );
    res.json(result.rows[0]?.settings || null);
  } catch (e) {
    console.error('[VPS_SETTINGS_GET_ERROR]', e.message);
    res.status(503).json({ error: '서버 설정을 조회할 수 없습니다.' });
  }
});

// VPS 설정 저장 (UPSERT)
app.put('/api/vps-settings', ensureAuthenticated, dbApiLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = req.body;

    await pool.query(`
      INSERT INTO user_vps_settings (user_id, settings, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id)
      DO UPDATE SET settings = $2, updated_at = CURRENT_TIMESTAMP
    `, [userId, JSON.stringify(settings)]);

    res.json({ success: true });
  } catch (e) {
    console.error('[VPS_SETTINGS_SAVE_ERROR]', e.message);
    res.status(500).json({ error: 'VPS 설정 저장 실패' });
  }
});

// 5. 404 에러 미들웨어
app.use((req, res) => {
    res.status(404).json({ error: 'Requested resource not found or access denied.' });
});

// 6. 중앙 집중식 에러 핸들링 미들웨어 (모든 서버 에러의 종착역)
app.use((err, req, res, next) => {
    // 1️⃣ Multer 파일 업로드 에러 방어
    if (err instanceof multer.MulterError) {
        return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: `파일 업로드 오류: ${err.message}` });
    }
    if (err.status === 413) return res.status(413).json({ error: '요청이 최대 허용 크기를 초과했습니다.' });
    
    // 2️⃣ Body-parser (JSON) 문법 에러 방어 (해킹 시도나 엉뚱한 값 차단)
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.warn('[MALFORMED_JSON] 이상한 형식의 데이터가 유입되어 차단했습니다.');
        return res.status(400).json({ error: '잘못된 형식의 데이터(JSON)입니다.' });
    }

    // 파일이 남아있을 수 있는 경우(Multer 등 처리 직후) 쓰레기 파일 안전 삭제
    if (req.file && req.file.path) {
        fs.unlink(req.file.path).catch(() => {});
    }

    // 에러 로깅
    console.error(`[SERVER_EXCEPTION] 경로: ${req.path} | 에러: ${err.stack || err.message}`);

    // 3️⃣ 외부에 민감한 에러 정보 스택 유출 방지 (배포 환경)
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
        error: process.env.NODE_ENV === 'production'
            ? '내부 시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
            : (err.message || 'Unknown Server Error')
    });
});
async function start() {
    await initDb();
    await pruneExpiredState();
    setInterval(() => pruneExpiredState().catch(error => console.error('[DB_CLEANUP]', error.message)),
        60 * 60 * 1000).unref();
    const server = app.listen(PORT, () => {
    console.log(`
    -------------------------------------------
    🚀 AI_PROD_OS BACKEND SECURED
    📡 URL: http://localhost:${PORT}
    🛡️  Shield Status: ACTIVE
    -------------------------------------------
    `);
    });
    server.on('error', error => {
        console.error('[SERVER_START]', error.message);
        process.exit(1);
    });
}
if (require.main === module) start().catch(error => {
    console.error('[SERVER_START]', error.message);
    process.exit(1);
});
module.exports = { app, initDb };

// --- [KEEP-ALIVE SELF-PING] ---
// 외부 cron-job 서비스가 중단될 경우에만(10분 이상 유입이 없을 때만) 스스로 URL을 호출하여 깨어있는 상태를 유지합니다.
setInterval(() => {
    const idleTime = Date.now() - lastRequestTime;
    
    // 10분(600,000ms) 동안 외부 요청(크론잡 등)이 단 한 건도 없었던 경우에만 자체 핑 가동
    if (idleTime >= 10 * 60 * 1000) {
        const targetUrl = process.env.PUBLIC_URL || 'https://ai-prod.live';
        
        axios.get(targetUrl)
            .then(() => console.log(`[KEEP-ALIVE] cron-job missing for 10m. Emergency self-ping successful.`))
            .catch(err => console.log(`[KEEP-ALIVE] Emergency self-ping failed: ${err.message}`));
    }
}, 1 * 60 * 1000).unref();

// ========================================================
// 🚨 Node.js 치명적 시스템 에러 최후방 방어벽 (무중단 킵얼라이브)
// ========================================================
// 서버 전체를 강제 종료시킬 수 있는 동기식 예외를 캐치하여 프로세스를 살립니다.
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL_SHIELD] Uncaught Exception 차단 성공:', err.stack || err.message);
});

// 처리되지 않은 비동기(Promise) 에러로 인해 서버가 터지는 것을 방지합니다.
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL_SHIELD] Unhandled Rejection 차단 성공:', reason);
});
