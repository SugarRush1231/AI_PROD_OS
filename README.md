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
| `SPICY_API_KEY` | SpicyAPI 서버 전용 키 |
| `SPICY_OWNER_GOOGLE_ID` | Seedream 5.5 Edit를 사용할 단일 Google 계정 ID |
| `DATABASE_URL` | 필수. 프리셋, 세션, 호출량, 작업 소유권을 저장하는 PostgreSQL |
| `PG_CA_CERT` | PostgreSQL이 사설 CA를 사용하는 경우 신뢰할 CA 인증서 PEM |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `CALLBACK_URL` | Google 로그인 |
| `ALLOWED_EMAILS` | Kie 유료 이미지·영상 기능에 허용할 검증된 Google 이메일. 쉼표로 구분하며, 비우면 Kie 유료 기능이 비활성화됩니다. |
| `SESSION_SECRET` | 필수. 무작위로 생성한 32자 이상의 세션 서명 키 |
| `TRUST_PROXY_CIDRS` | HTTPS를 종료하는 배포 프록시의 신뢰 가능한 IP/CIDR 목록. 쉼표로 구분합니다. |
| `ALLOWED_ORIGIN`, `PORT` | 서버 설정 |
| `MEDIA_BUCKET` | 보관함용 비공개 S3 호환 버킷 이름 |
| `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` | 해당 버킷의 읽기·쓰기·삭제 권한만 가진 서버 자격 증명 |
| `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION` | S3 호환 서비스의 HTTPS 엔드포인트와 리전. AWS S3는 엔드포인트 생략 가능 |

배포 전에 실제 프록시 주소를 `TRUST_PROXY_CIDRS`에 설정하고, 프록시가 전달 헤더를 덮어쓰며 앱이 프록시를 통해서만 접근 가능한지 확인합니다. 배포 DB는 인증서 검증이 가능한 TLS 연결과 앱 테이블 생성 권한이 필요합니다. 세션 쿠키 변경 후에는 Google에 다시 로그인합니다. 이 버전에서 생성되는 영상부터 앱에서 사용자별 결과 조회가 가능합니다.

로그인 계정당 API 요청은 분당 120회, 생성·전사 요청은 UTC 기준 하루 60회로 제한합니다. 기존 기능별 분당 제한도 적용됩니다. 스토리지 연결이 실패하면 세션과 할당량을 검사해야 하는 요청을 거절합니다.

### 미디어 보관함

- 이번 세션 목록의 최근 30개 결과는 페이지 메모리에서만 표시됩니다. 새로고침, 페이지 종료, 로그아웃 시 이 목록은 초기화됩니다. 진행 중인 유료 요청의 복구 상태는 별도로 유지됩니다.
- **보관**을 누르면 파일이 버킷에 복사되고 사용자 ID, 파일 종류, 용량, 저장 시각만 PostgreSQL 목록에 기록됩니다. 본인의 보관 목록에서만 5분짜리 재생 링크를 발급받을 수 있습니다.
- 계정당 250 MiB 또는 200개, 서비스 전체 5 GiB로 제한합니다. 파일 한 개는 이미지 10 MiB, 영상 50 MiB까지 저장할 수 있습니다. 보관함에서 삭제하면 공간이 반환됩니다.
- 버킷은 퍼블릭 접근을 차단한 상태로 연결합니다. 위 환경변수가 비어 있으면 이번 세션 목록만 사용할 수 있습니다. 생성 비용과 별도로 스토리지 사용량 및 다운로드 트래픽은 스토리지 서비스에서 청구할 수 있습니다.

### Prompt Architecture Lab 설정

- `prompt-catalog.js`에서 Lab 선택지의 표시명과 프롬프트 설명을 관리합니다. 저장된 프리셋이 사용하는 옵션 ID는 유지합니다.
- `prompt-rules.js`에서 피사체·출력 형식별 생성 지침, 포즈와 참조 제약, 조명·렌즈 프리셋을 관리합니다.
- `lighting-lab.js`는 설정 검증과 직렬화를 담당하며, 생성된 프롬프트에 필수 조명·광학 조건이 빠졌으면 보강합니다.

### Seedream 5.5 Edit 활성화

1. 앱에 본인 Google 계정으로 로그인하고 같은 사이트에서 `/api/me`의 `user.id`를 확인합니다.
2. 서버에 그 값을 `SPICY_OWNER_GOOGLE_ID`로 설정합니다. `SPICY_API_KEY`와 무작위로 생성한 32자 이상의 `SESSION_SECRET`도 필요합니다.
3. 서버 재시작 후 본인 계정으로 다시 로그인합니다. Image Studio에서 Seedream 5.5 Edit를 선택하고 참고 이미지를 첨부합니다. 첨부 번호를 누르면 프롬프트에 `@image 1`처럼 삽입됩니다. 영상은 `@image1`을 사용합니다.

편집에는 JPEG, PNG, WebP, GIF를 최대 10장, 전체 10 MiB까지 첨부할 수 있습니다. 모델 스키마에 더 낮은 제한이 있으면 그 제한이 우선합니다. 화면 비율은 기존 선택을 사용하며 Seedream 결과는 1K, PNG, 배경 자동으로 고정됩니다. 견적 단계에서 서버가 실시간 모델 스키마를 조회해 최대 5분간 캐시하고, 참고 이미지를 SpicyAPI에 업로드합니다. 비용 확인 후 제출할 때 유료 작업이 생성됩니다.

요청 접수나 상태 조회가 끊기면 생성 버튼으로 기존 요청을 확인할 수 있습니다. Seedream은 진행 중 요청을 PostgreSQL에 저장합니다. 접수 여부가 불명확한 상태로 20시간이 지나면 SpicyAPI 콘솔에서 확인해야 합니다.

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

## 조명 · 카메라 설계 (Prompt Lab 03 / 04)
- `lighting-lab.js` — 조명(LightingState)과 카메라·광학(OpticsState)을 **하나의 상태**로 관리. SVG 광원 컨트롤러, 슬라이더/숫자 입력, Three.js 프리뷰가 같은 상태를 공유합니다.
- 각도 기준: 0° = 정면(카메라 쪽, 컨트롤러 아래), 90° = 화면 오른쪽, 180° = 뒤(역광), 270° = 화면 왼쪽. 고도 −90~90°, 세기 0~100(0 = 끔), 거리 0.5~10m.
- 프리셋은 값을 한 번에 적용하고, 직접 조작하면 `Custom`으로 바뀌며 출발 프리셋을 기록합니다.
- 직렬화는 결정적인 영어 문장(방향 단어 + 세기 구간: 1–24 subtle / 25–49 gentle / 50–74 moderate / 75–89 strong / 90–100 intense)이며, Auto·꺼진 항목은 생략합니다.
- L1 사양 조립 → L2 LLM 요청 → L3 제약 검증 순서로 실제 요청 이벤트에 맞춰 상태가 바뀌고, LLM 응답에 핵심 제약(방향·초점거리·조리개·색온도 등)이 빠지면 결정적으로 덧붙입니다.
- 설정은 JSON 복사와 프리셋(`params.lighting`, `params.optics`)에도 포함되며, 옛 프리셋은 기본값으로 마이그레이션됩니다.
- 3D 프리뷰는 **개념적 프리뷰**입니다. 머리는 "Infinite" 3D Head Scan(Lee Perry-Smith, CC BY 3.0, `assets/models/`)을 석고 재질로 그리고, 불러오지 못하면 코드로 만든 절차적 흉상으로 대신합니다. Three.js r170(MIT)은 패널이 처음 화면에 보일 때 jsDelivr에서 불러옵니다. WebGL이 안 되면 안내와 함께 다시 시도 버튼이 나오며, 나머지 기능은 그대로 동작합니다.
