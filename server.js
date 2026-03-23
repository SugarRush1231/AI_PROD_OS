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
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs_sync = require('fs');

const upload = multer({ dest: 'uploads/' });

// --- [MIDDLEWARE: AUTH CHECK] ---
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: '로그인 후 진행해 주세요.' });
};

const app = express();
app.set('trust proxy', 1); // ✅ Railway 리버스 프록시 뒤에서 https를 올바르게 인식하도록 설정
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
    scope: ['profile', 'email']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

// 1. 보안 설정: 서버 시그니처 숨기기 및 CSP 보호
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://*", "https://lh3.googleusercontent.com"],
            connectSrc: ["'self'", "https://text.pollinations.ai", "https://api.groq.com"],
        },
    },
}));

// 2. 세션 및 인증 미들웨어
app.use(session({
    secret: process.env.SESSION_SECRET || 'ai-prod-suite-secure-key',
    resave: false,
    saveUninitialized: false,
    proxy: true, // ✅ Railway 리버스 프록시 허용
    cookie: {
        secure: process.env.NODE_ENV === 'production', // ✅ 배포(HTTPS)에서는 true, 로컬은 false
        httpOnly: true,
        sameSite: 'Lax', // ✅ 'Strict' → 'Lax' (구글 로그인 콜백 시 세션 쿠키 유지)
        maxAge: 24 * 60 * 60 * 1000
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// 3. 로깅: 모든 HTTP 요청 추적
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- [AUTH ROUTES] ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => res.redirect('/')
);

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

// 4. 속도 제한 및 교차 출처
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: '시스템 과부하 방지를 위해 요청이 제한되었습니다. 잠시 후 다시 시도해주세요.' }
});

// ✅ AI 전용 빡센 제한 (1분에 3회 허용 = 연타 방지 및 사용자 단위 격리)
const strictAiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => req.user ? req.user.id : req.ip,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: '비정상적인 다중 요청(연타)이 잦습니다. 서버 보호를 위해 1분 뒤에 다시 시도해주세요.' }
});

// ✅ 일반 API 연타 방지 (1분에 10회 허용)
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
    res.json({ user: req.user || null });
});

// 4. 교차 출처 및 파싱 제한
const corsOptions = {
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], // DELETE 및 사전 요청용 OPTIONS 누락분 선제적 보충
    credentials: true, // 세션 및 쿠키 기반 인증 정보를 CORS 요청에서도 안전하게 전달
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname)));

// --- ROUTES ---

// 메인 페이지 서빙
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'workflow_web.html'));
});

/**
 * Whisper STT API (Audio to Subtitles)
 * Only available for Authenticated Users + Rate Limiting
 */
app.post('/api/whisper', ensureAuthenticated, strictAiLimiter, upload.single('audio'), async (req, res, next) => {
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
app.post('/api/engineer', ensureAuthenticated, strictAiLimiter, async (req, res, next) => {
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
            aiNodes.push({ url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', headers });
            aiNodes.push({ url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-70b-versatile', headers });
            aiNodes.push({ url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama3-70b-8192', headers });
            aiNodes.push({ url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant', headers });
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
                    requestBody.max_tokens = 4096;
                    requestBody.frequency_penalty = 0.2; // 1.2는 기형적인 문장을 유발하므로, 0.2 안정값으로 롤백하여 자연스러운 문맥 보장
                    requestBody.presence_penalty = 0.2;  // 마찬가지로 0.2로 안정화하여 강박적인 화제 전환(조현병 현상) 방지
                }
                
                const aiResponse = await fetch(node.url, {
                    method: 'POST',
                    headers: node.headers,
                    body: JSON.stringify(requestBody)
                });
                
                lastStatus = aiResponse.status;

                // Rate Limit 방어: 429 에러 시 멍청한 모델로 점프하지 않고, 그 다음 줄(70B 형제)로 자연스레 넘어가도록 수정
                if (lastStatus === 429 && node.model === 'llama-3.3-70b-versatile') {
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
const { Pool } = require('pg');

// Koyeb Managed Postgres: DATABASE_URL 환경변수를 사용합니다.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // 외부 연결 및 Koyeb 환경용 (Self-signed 인증 허용)
  }
});

// 데이터베이스 테이블 초기화 (최초 1회 실행)
const initDb = async () => {
  try {
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
  } catch (err) {
    console.error('[DB_INIT_ERROR]', err.message);
  }
};

// 서버 시작 시 DB 체크
if (process.env.DATABASE_URL) {
  initDb();
} else {
  console.warn('[DB_WARNING] DATABASE_URL is missing in .env. Persistence will fail.');
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
    res.json([]);
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
    res.json(null);
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
        return res.status(400).json({ error: `파일 업로드 오류: ${err.message}` });
    }
    
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
const server = app.listen(PORT, () => {
    console.log(`
    -------------------------------------------
    🚀 AI_PROD_OS BACKEND SECURED
    📡 URL: http://localhost:${PORT}
    🛡️  Shield Status: ACTIVE
    -------------------------------------------
    `);
});

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
}, 1 * 60 * 1000); // 유휴 상태 여부는 매 1분마다 검사

// 포트 중복 방지
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        process.exit(1);
    }
});

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
