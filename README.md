# AI_PROD_OS

목표 한 줄로 **기획 → 장면 설계 → 이미지 → 영상 → 게시용 메타데이터**까지 만드는 AI 숏폼 제작 워크스페이스.
라이브: https://ai-prod.live

## 주요 기능

| 영역 | 설명 |
|---|---|
| **One-Click Pipeline** | 목표를 한 번 입력하면 컨셉 → 스토리보드 → 숏리스트 → 장면 설계 → 장면 이미지 → 내레이션(TTS) → 장면 영상 → BGM·제목/태그까지 자동 실행. 앞 단계 결과를 다음 단계 맥락으로 넘겨 톤을 유지하고, 주인공 묘사를 모든 장면에 고정해 캐릭터 일관성을 확보 |
| **Prompt Architecture Lab** | 피사체·포즈·샷·구도·조명 등 구조화된 파라미터로 프롬프트를 설계. 이미지 생성용(단일 문단) / 상세 설계서 출력, 결과를 이미지 스튜디오로 바로 전달 |
| **AI Image Studio** | 텍스트 → 이미지 (9:16 등 비율 지원) |
| **완성본 합치기** | 장면 클립 + 내레이션 + 타이포 모션(장면 문구·CTA)·하단 자막을 브라우저 내장 녹화(MediaRecorder)로 영상 파일 하나로 합쳐 다운로드. 컷 전환 / 이어지는 원테이크(앞 클립의 마지막 프레임 → 다음 클립 시작) 선택 |
| **AI Video Studio** | 이미지 → 영상 / 텍스트 → 영상, 비동기 작업 생성 후 상태 폴링 |
| **Video Production Studio** | 컨셉 기획서·스토리보드·숏리스트·BGM·자막(STT)·SEO 생성, 통합 기획서 내보내기 |

## 아키텍처

```
Browser (workflow_web.html · script.js)
   │  단계 오케스트레이션 · 진행 상태 · 결과 렌더링
   ▼
Supertonic 3 TTS (supertonic/) — 브라우저에서 ONNX Runtime Web으로 내레이션 생성 (서버·API 비용 0)
   │  모델은 첫 사용 시 Hugging Face에서 받아 Cache API에 저장
   ▼
Express API (server.js) ── Google OAuth · Rate limit · Helmet CSP
   ├─ /api/engineer        → LLM (Groq Llama, 다중 노드 폴백)
   ├─ /api/whisper         → STT (Groq Whisper)
   ├─ /api/generate-image  → 이미지 API (1순위) → 무료 엔진 폴백
   ├─ /api/video/create    → 영상 작업 생성 (Grok Imagine, taskId 즉시 반환)
   ├─ /api/task/status     → 영상 작업 상태 조회 (브라우저 폴링)
   └─ /api/presets 등      → PostgreSQL (사용자 프리셋·설정)
```

- 초기에는 n8n으로 생성 워크플로를 오케스트레이션했으나, 비동기 작업 패턴(작업 생성 → 상태 폴링)을 백엔드로 옮겨 **별도 워크플로 서버 없이** 동작하도록 단순화.
- 생성 API는 서버 한 곳에서만 호출해 공급자 교체 시 프론트엔드 변경을 최소화하고, 실패 시 폴백 엔진으로 서비스 연속성 유지.

## 환경 변수

| 이름 | 용도 |
|---|---|
| `GROQ_API_KEY` (… `_6`) | 텍스트 생성 · STT |
| `KIE_API_KEY` | 이미지 · 영상 생성 |
| `DATABASE_URL` | PostgreSQL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `CALLBACK_URL` | Google 로그인 |
| `ALLOWED_EMAILS` | 유료 기능(이미지·영상 API)을 쓸 수 있는 계정, 쉼표 구분. 비우면 로그인한 모든 사용자 허용 |
| `SESSION_SECRET`, `ALLOWED_ORIGIN`, `PORT` | 서버 설정 |

## 로컬 실행

```bash
npm install
npm start   # http://localhost:3000
```

## 내레이션 (TTS)

- [Supertonic 3](https://huggingface.co/supertone-oss-archive/supertonic-3) (Supertone, 한국어 포함 31개 언어)를 브라우저에서 직접 실행 — WebGPU 우선, 미지원 시 WebAssembly(CPU)
- 장면별 대본 → 음성 생성 → 앞뒤 무음 제거 → 영상과 동기 재생
- 모델 출처 이중화: 공식 아카이브 → 자체 미러([kimbs318/supertonic-3](https://huggingface.co/kimbs318/supertonic-3)) → 공개 미러 순으로 자동 전환 (파일 해시 동일 확인)
- 모델 라이선스(BigScience OpenRAIL-M)에 따라 **AI 음성임을 고지**: 파이프라인이 제목/태그 결과 끝에 `목소리: AI 음성`을 자동으로 붙임
