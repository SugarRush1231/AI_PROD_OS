const UI = {
  log: document.getElementById('terminal-log'),
  intentInput: document.getElementById('intent-input'),
  engineerBtn: document.getElementById('engineer-btn'),
  optimizedOutput: document.getElementById('optimized-output'),
  copyBtn: document.getElementById('copy-btn'),
  layers: [
    document.getElementById('layer-1'),
    document.getElementById('layer-2'),
    document.getElementById('layer-3')
  ],
  paramType: document.getElementById('param-type'),
  paramStyle: document.getElementById('param-style'),
  paramAngle: document.getElementById('param-angle'),
  paramBgHuman: document.getElementById('param-bg-human'),
  paramBgAnimal: document.getElementById('param-bg-animal'),
  paramBgScene: document.getElementById('param-bg-scene'),
  bgHumanContainer: document.getElementById('bg-human-container'),
  bgAnimalContainer: document.getElementById('bg-animal-container'),
  bgSceneContainer: document.getElementById('bg-scene-container'),
  paramPose: document.getElementById('param-pose'),
  paramPov: document.getElementById('param-pov'),
  paramFace: document.getElementById('param-face'),
  paramOutfit: document.getElementById('param-outfit'),
  paramHumanRef: document.getElementById('param-human-ref'),
  paramDogBreed: document.getElementById('param-dog-breed'),
  paramCatBreed: document.getElementById('param-cat-breed'),
  paramAnimalPose: document.getElementById('param-animal-pose'),
  paramAnimalPov: document.getElementById('param-animal-pov'),
  paramCustom: document.getElementById('param-custom'),
  paramSubFormat: document.getElementById('param-sub-format'),
  paramSubIntent: document.getElementById('param-sub-intent'), // 추가
  paramSubTempo: document.getElementById('param-sub-tempo'),
  paramSubContext: document.getElementById('param-sub-context'),
  paramSubDuration: document.getElementById('param-sub-duration'),
  subGenBtn: document.getElementById('sub-gen-btn'),
  subtitleOutput: document.getElementById('subtitle-output'),
  copySubBtn: document.getElementById('copy-sub-btn'),
  downloadSrtBtn: document.getElementById('download-srt-btn'),
  // 🎙️ 오디오/STT 관련 추가
  btnSourceText: document.getElementById('btn-source-text'),
  btnSourceAudio: document.getElementById('btn-source-audio'),
  audioUploadContainer: document.getElementById('audio-upload-container'),
  audioDropzone: document.getElementById('audio-dropzone'),
  audioFileInput: document.getElementById('audio-file-input'),
  fileNameDisplay: document.getElementById('file-name-display'),
  subtitleParamsContainer: document.getElementById('subtitle-params-container'),
  subtitleContextContainer: document.getElementById('subtitle-context-container'),
  subtitleIntentContainer: document.getElementById('subtitle-intent-container'),
  humanParamsGroup: document.getElementById('human-params-group'),
  animalParamsGroup: document.getElementById('animal-params-group'),
  sceneParamsGroup: document.getElementById('scene-params-group'),
  paramSceneEffect: document.getElementById('param-scene-effect'),
  paramSceneLight: document.getElementById('param-scene-light'),
  paramSceneRef: document.getElementById('param-scene-ref'),
  paramHumanShot: document.getElementById('param-human-shot'),
  paramHumanComp: document.getElementById('param-human-comp'),
  paramAnimalShot: document.getElementById('param-animal-shot'),
  paramAnimalComp: document.getElementById('param-animal-comp'),
  paramSceneShot: document.getElementById('param-scene-shot'),
  paramSceneComp: document.getElementById('param-scene-comp'),
  angleInput: document.getElementById('angle-input'),
  chipContainer: document.getElementById('directive-chips'),
  systemStatusSection: document.getElementById('system-status'),
  statLatency: document.getElementById('stat-latency'),
  statUptime: document.getElementById('stat-uptime'),
  statBootTime: document.getElementById('stat-boot-time'),
  statClusterStatus: document.getElementById('stat-cluster-status'),
  statEngineBar: document.getElementById('stat-engine-bar'),
  presetList: document.getElementById('preset-list'),
  savePresetBtn: document.getElementById('save-preset-btn'),
  modal: document.getElementById('custom-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalMessage: document.getElementById('modal-message'),
  modalConfirmBtn: document.getElementById('modal-confirm-btn'),
  modalCancelBtn: document.getElementById('modal-cancel-btn'),
  modalInput: document.getElementById('modal-input'),
  modalInputContainer: document.getElementById('modal-input-container'),
  themeSlider: document.getElementById('theme-slider'),
  themeLabel: document.getElementById('theme-current-label')
};

let USER_LOGGED_IN = false;

/**
 * 전역 테마 관리 시스템 (하이브리드 모드)
 */
function applyTheme(value) {
  const root = document.documentElement;
  const label = UI.themeLabel;
  localStorage.setItem('theme-choice', value);

  if (value === "0") { // DARK
    root.classList.remove('light-mode');
    if (label) label.innerText = "DARK";
  } else if (value === "2") { // LIGHT
    root.classList.add('light-mode');
    if (label) label.innerText = "LIGHT";
  } else { // AUTO (브라우저 테마 설정 실시간 감지)
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (label) label.innerText = `AUTO ${prefersLight ? 'LIGHT' : 'DARK'}`;

    if (prefersLight) root.classList.add('light-mode');
    else root.classList.remove('light-mode');
  }
}

// 테마 초기화 및 이벤트 리스너
if (UI.themeSlider) {
  const savedVal = localStorage.getItem('theme-choice') || "1";
  UI.themeSlider.value = savedVal;
  UI.themeSlider.addEventListener('input', (e) => applyTheme(e.target.value));
  applyTheme(savedVal);
}

// 브라우저 테마 변경 실시간 감지
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
  if (UI.themeSlider && UI.themeSlider.value === "1") {
    applyTheme("1");
  }
});

/**
 * 전역 커스텀 모달 (비동기 처리)
 * @param {string} title 제목
 * @param {string} message 본문
 * @param {string} type 'info' | 'danger' | 'success'
 * @param {boolean} showInput 입력 필드 표시 여부
 */
function showSystemConfirm(title, message, type = 'info', showInput = false) {
  return new Promise((resolve) => {
    if (!UI.modal) return resolve(false);

    UI.modalTitle.innerText = title;
    UI.modalMessage.innerText = message;

    // 테마 클래스 초기화 및 할당
    UI.modal.className = 'modal-backdrop active';
    UI.modal.classList.add(`theme-${type}`);

    // 버튼 클래스 초기화 및 할당
    UI.modalConfirmBtn.className = `modal-btn primary ${type}`;

    // 입력 필드 제어
    UI.modalInputContainer.style.display = showInput ? 'block' : 'none';
    UI.modalInput.value = '';
    if (showInput) setTimeout(() => UI.modalInput.focus(), 50);

    const onConfirm = () => {
      const value = showInput ? UI.modalInput.value.trim() : true;
      if (showInput && !value) {
        UI.modalInput.focus(); // 빈 값 방지
        return;
      }
      cleanup();
      resolve(value);
    };

    const onCancel = () => { cleanup(); resolve(false); };

    const onEnter = (e) => { if (e.key === 'Enter') onConfirm(); };

    const cleanup = () => {
      UI.modal.classList.remove('active');
      UI.modalConfirmBtn.removeEventListener('click', onConfirm);
      UI.modalCancelBtn.removeEventListener('click', onCancel);
      UI.modalInput.removeEventListener('keydown', onEnter);
    };

    UI.modalConfirmBtn.addEventListener('click', onConfirm);
    UI.modalCancelBtn.addEventListener('click', onCancel);
    UI.modalInput.addEventListener('keydown', onEnter);
  });
}

// --- CUSTOM PRESET SYSTEM (SERVER SYNC) ---
const MyPresets = {
  data: [],
  activeId: null, // 현재 활성화된 프리셋 추적

  async fetchFromServer() {
    try {
      const res = await fetch('/api/presets');
      // 🛡️ 인증 실패 시 데이터 비우기
      if (res.status === 401) {
        this.data = [];
        this.render();
        return;
      }
      this.data = await res.json();
      this.render();
    } catch (err) {
      console.error('Failed to load presets or unauthorized');
      this.data = [];
      this.render();
    }
  },

  resetForm() {
    this.activeId = null;
    
    // 1. 셀렉트 박스류 초기화
    const defaults = {
      paramType: 'human',
      paramStyle: 'cinematic',
      paramAngle: '0',
      angleInput: '0',
      paramBgHuman: 'none',
      paramBgAnimal: 'none',
      paramBgScene: 'none',
      paramPose: 'dynamic',
      paramPov: 'standard',
      paramHumanRef: 'strict',
      paramFace: 'natural',
      paramOutfit: 'reference',
      paramHumanShot: 'none',
      paramHumanComp: 'none',
      paramDogBreed: 'none',
      paramCatBreed: 'none',
      paramAnimalPose: 'sitting',
      paramAnimalPov: 'eye-level',
      paramAnimalShot: 'none',
      paramAnimalComp: 'none',
      paramSceneEffect: 'none',
      paramSceneLight: 'commercial',
      paramSceneRef: 'strict',
      paramSceneShot: 'none',
      paramSceneComp: 'none'
    };

    Object.entries(defaults).forEach(([key, val]) => {
      const el = UI[key];
      if (el) {
        el.value = val;
        if (key === 'paramType') el.dispatchEvent(new Event('change'));
      }
    });

    // 2. 인풋 및 칩 초기화
    if (UI.paramCustom) UI.paramCustom.value = '';
    if (UI.intentInput) UI.intentInput.value = '';
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    
    // 3. UI 정리
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    addLog('✓ 설정이 초기화되었습니다.', 'info');
  },

  async save() {
    // 🛡️ 로그인 체크: 로그인 레이어 적용
    if (!USER_LOGGED_IN) {
      const confirmLogin = await showSystemConfirm(
        '로그인 필요',
        '프리셋 저장 기능은 로그인이 필요합니다. 로그인 페이지로 이동할까요?',
        'info'
      );
      if (confirmLogin) {
        window.location.href = '/auth/google';
      }
      return;
    }

    const name = await showSystemConfirm('프리셋 저장', '새로운 프리셋의 이름을 입력하세요.', 'info', true);
    if (!name) return;

    // 현재 활성화된 칩 데이터 추출
    const activeChips = Array.from(document.querySelectorAll('.chip.active'))
      .map(c => c.getAttribute('data-value'));

    const config = {
      id: Date.now(),
      name: name,
      params: {
        paramType: UI.paramType?.value,
        paramStyle: UI.paramStyle?.value,
        paramAngle: UI.paramAngle?.value,
        paramBgHuman: UI.paramBgHuman?.value,
        paramBgAnimal: UI.paramBgAnimal?.value,
        paramBgScene: UI.paramBgScene?.value,
        paramPose: UI.paramPose?.value,
        paramPov: UI.paramPov?.value,
        paramFace: UI.paramFace?.value,
        paramOutfit: UI.paramOutfit?.value,
        paramHumanRef: UI.paramHumanRef?.value,
        paramDogBreed: UI.paramDogBreed?.value,
        paramCatBreed: UI.paramCatBreed?.value,
        paramAnimalPose: UI.paramAnimalPose?.value,
        paramAnimalPov: UI.paramAnimalPov?.value,
        paramCustom: UI.paramCustom?.value,
        paramSceneEffect: UI.paramSceneEffect?.value,
        paramSceneLight: UI.paramSceneLight?.value,
        paramSceneRef: UI.paramSceneRef?.value,
        paramHumanShot: UI.paramHumanShot?.value,
        paramHumanComp: UI.paramHumanComp?.value,
        paramAnimalShot: UI.paramAnimalShot?.value,
        paramAnimalComp: UI.paramAnimalComp?.value,
        paramSceneShot: UI.paramSceneShot?.value,
        paramSceneComp: UI.paramSceneComp?.value,
        angleInput: UI.angleInput?.value,
        intentInput: UI.intentInput?.value,
        activeChips: activeChips // 칩 정보 추가
      }
    };

    try {
      await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      addLog(`✓ 프리셋 [${name}] 서버 저장 완료`, 'success');
      this.fetchFromServer();
    } catch (err) {
      addLog('! 프리셋 저장 실패', 'error');
    }
  },

  async delete(id, e) {
    if (e) e.stopPropagation();

    const preset = this.data.find(p => p.id === id);
    if (!preset) return;

    const confirmed = await showSystemConfirm('프리셋 삭제', `정말로 [${preset.name}] 프리셋을 삭제하시겠습니까?`, 'danger');
    if (!confirmed) return;

    try {
      await fetch(`/api/presets/${id}`, { method: 'DELETE' });
      if (this.activeId === id) this.resetForm();
      this.fetchFromServer();
      addLog('✓ 프리셋이 삭제되었습니다.', 'info');
    } catch (err) {
      addLog('! 삭제 실패', 'error');
    }
  },

  load(id) {
    // 토글 기능: 이미 불러온 프리셋을 다시 누르면 초기화
    if (this.activeId === id) {
      this.resetForm();
      return;
    }

    const p = this.data.find(x => x.id === id);
    if (!p) return;

    this.activeId = id;

    // 1. 기본적인 파라미터 복구
    Object.entries(p.params).forEach(([key, val]) => {
      const el = UI[key];
      if (key !== 'activeChips' && el && val !== undefined) {
        el.value = val;
        if (key === 'paramType' || key.startsWith('paramBg')) {
          el.dispatchEvent(new Event('change'));
        }
      }
    });

    // 2. 칩 상태 복구
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (p.params.activeChips && Array.isArray(p.params.activeChips)) {
      p.params.activeChips.forEach(val => {
        const chip = document.querySelector(`.chip[data-value="${val}"]`);
        if (chip) chip.classList.add('active');
      });
    }

    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-id="${id}"]`)?.classList.add('active');
    addLog(`✓ [${p.name}] 설정 로드됨`, 'info');
  },

  render() {
    if (!UI.presetList) return;
    UI.presetList.innerHTML = '';
    this.data.forEach(p => {
      const chip = document.createElement('button');
      chip.className = 'preset-chip';
      if (this.activeId === p.id) chip.classList.add('active');
      chip.dataset.id = p.id;

      const nameSpan = document.createElement('span');
      nameSpan.innerText = p.name;

      const delBtn = document.createElement('span');
      delBtn.className = 'delete-x';
      delBtn.innerHTML = '×';
      delBtn.title = '삭제';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.delete(p.id, e);
      });

      chip.appendChild(nameSpan);
      chip.appendChild(delBtn);

      chip.addEventListener('click', () => this.load(p.id));
      UI.presetList.appendChild(chip);
    });
  }
};

// 초기화 시 서버 데이터 호출
MyPresets.fetchFromServer();

// 프리셋 버튼 리스너
if (UI.savePresetBtn) {
  UI.savePresetBtn.onclick = () => MyPresets.save();
}

// 초기 로드
MyPresets.render();

// --- CORE SYSTEM HEALTH CHECK ---
async function fetchServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // 1. 서버 부팅 시간 연동 (정직한 지표)
    if (data.startTime) {
      serverActualStartTime = data.startTime;
      const bootDate = new Date(serverActualStartTime);
      if (UI.statBootTime) {
        const timeStr = bootDate.toLocaleTimeString('ko-KR', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        UI.statBootTime.innerText = `Booted: ${timeStr}`;
      }
    }

    // 2. 실제 AI 연산 서버(Engine) 상태 연동
    if (UI.statClusterStatus) {
      UI.statClusterStatus.innerText = data.aiNodeStatus || 'UNKNOWN';
      const statusColors = {
        'ONLINE': '#10b981',    // 정상 (녹색)
        'DEGRADED': '#f59e0b',  // 불안정 (주황색)
        'OFFLINE': '#555'       // 전원 꺼짐 (짙은 회색/검정 느낌)
      };
      UI.statClusterStatus.style.color = statusColors[data.aiNodeStatus] || '#888';
    }

    // 3. 엔진 가동 바 (Progress Bar) 업데이트
    if (UI.statEngineBar) {
      if (data.aiNodeStatus === 'ONLINE') {
        UI.statEngineBar.style.width = '100%';
        UI.statEngineBar.style.background = '#10b981';
      } else if (data.aiNodeStatus === 'DEGRADED') {
        UI.statEngineBar.style.width = '50%';
        UI.statEngineBar.style.background = '#f59e0b';
      } else {
        UI.statEngineBar.style.width = '0%';
        UI.statEngineBar.style.background = '#333'; // 완전히 꺼졌을 때의 어두운 상태
      }
    }

    console.log(`[SYSTEM] Heartbeat received. AI_ENGINE: ${data.aiNodeStatus}`);
  } catch (err) {
    console.warn('[SYSTEM] Check failed. AI Server Offline.');
    if (UI.statClusterStatus) UI.statClusterStatus.innerText = 'OFFLINE';
    if (UI.statEngineBar) UI.statEngineBar.style.width = '0%';
  }
}

// 30초마다 실시간 시스템 상태 자동 갱신
setInterval(fetchServerStatus, 30000);

function updateUptimeTimer() {
  if (!UI.statUptime) return;
  const totalElapsed = Math.floor((Date.now() - serverActualStartTime) / 1000);

  const hrs = Math.floor(totalElapsed / 3600);
  const mins = Math.floor((totalElapsed % 3600) / 60);
  const secs = totalElapsed % 60;

  // 3자리 시간 대응 (예: 124:45:00)
  const hrsStr = String(hrs).padStart(2, '0');
  const minsStr = String(mins).padStart(2, '0');
  const secsStr = String(secs).padStart(2, '0');

  UI.statUptime.innerText = `${hrsStr}:${minsStr}:${secsStr}`;
}

// 초기화: 서버 시간 먼저 가져온 뒤 타이머 시작
fetchServerStatus().then(() => {
  setInterval(updateUptimeTimer, 1000);
  updateUptimeTimer();
});

// --- LOGGING ENGINE ---
function addLog(msg, type = 'default') {
  if (!UI.log) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const colors = {
    'primary': 'var(--skills-cyan)',
    'secondary': 'var(--skills-purple)',
    'error': '#ff5555',
    'success': '#10b981',
    'dim': 'var(--fg-dim)',
    'default': 'var(--fg)'
  };

  entry.style.color = colors[type] || colors['default'];
  entry.innerText = msg;
  UI.log.appendChild(entry);
  UI.log.scrollTop = UI.log.scrollHeight;
}

// Global Error Catching
window.addEventListener('error', (e) => {
  addLog(`> [SYSTEM_CRITICAL] ${e.message}`, true);
});

// --- INTEGRITY CHECK ---
console.log('UI_PROD_OS: Verifying Registry Integration...');
Object.entries(UI).forEach(([key, element]) => {
  if (!element && key !== 'layers') {
    console.warn(`[WARNING] UI Component "${key}" not found in DOM.`);
    // addLog(`> [WARN] Missing Element: ${key}`);
  }
});
if (UI.layers.some(l => !l)) console.warn('[WARNING] Some Visualizer Layers are missing.');

// Conditional UI Logic
if (UI.paramType) {
  UI.paramType.addEventListener('change', (e) => {
    const val = e.target.value;
    if (UI.humanParamsGroup) UI.humanParamsGroup.style.display = 'none';
    if (UI.animalParamsGroup) UI.animalParamsGroup.style.display = 'none';
    if (UI.sceneParamsGroup) UI.sceneParamsGroup.style.display = 'none';
    if (UI.bgHumanContainer) UI.bgHumanContainer.style.display = 'none';
    if (UI.bgAnimalContainer) UI.bgAnimalContainer.style.display = 'none';
    if (UI.bgSceneContainer) UI.bgSceneContainer.style.display = 'none';

    if (val === 'human') {
      if (UI.humanParamsGroup) UI.humanParamsGroup.style.display = 'block';
      if (UI.bgHumanContainer) UI.bgHumanContainer.style.display = 'flex';
    } else if (val === 'animal') {
      if (UI.animalParamsGroup) UI.animalParamsGroup.style.display = 'block';
      if (UI.bgAnimalContainer) UI.bgAnimalContainer.style.display = 'flex';
    } else {
      if (UI.sceneParamsGroup) UI.sceneParamsGroup.style.display = 'block';
      if (UI.bgSceneContainer) UI.bgSceneContainer.style.display = 'flex';
    }
  });
}

// Copy Logic (Consolidated at the end for consistency)

// Toggle Chips Logic
if (UI.chipContainer) {
  UI.chipContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip')) {
      e.target.classList.toggle('active');
    }
  });
}

if (UI.paramAngle && UI.angleInput) {
  // 슬라이더 -> 숫자 입력창
  UI.paramAngle.addEventListener('input', (e) => {
    UI.angleInput.value = e.target.value;
  });

  // 숫자 입력창 -> 슬라이더
  UI.angleInput.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) val = 0;
    if (val > 360) val = 360;
    if (val < 0) val = 0;
    UI.paramAngle.value = val;
  });

  // 포커스 시 전체 선택 (Premium interaction)
  UI.angleInput.addEventListener('focus', (e) => {
    e.target.select();
  });

  // 🖱️ 스크러버(Scrubber) 드래그 조절 기능
  let isDragging = false;
  let startX = 0;
  let startVal = 0;

  const handleScrubbing = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    // 움직임 폭에 따른 감도 조절 (1px당 1도)
    let newVal = startVal + dx;
    newVal = Math.max(0, Math.min(360, newVal));

    UI.angleInput.value = newVal;
    UI.paramAngle.value = newVal;

    // 드래그 중 텍스트 선택 방지
    window.getSelection().removeAllRanges();
  };

  const stopScrubbing = () => {
    if (isDragging) {
      setTimeout(() => { isDragging = false; }, 50); // 클릭 이벤트와 충돌 방지
    }
    document.removeEventListener('mousemove', handleScrubbing);
    document.removeEventListener('mouseup', stopScrubbing);
    document.body.style.cursor = 'default';
  };

  UI.angleInput.parentElement.addEventListener('mousedown', (e) => {
    // 이미 포커스된 상태에서 텍스트를 드래그하려는 경우는 무시
    if (document.activeElement === UI.angleInput) return;

    isDragging = true;
    startX = e.clientX;
    startVal = parseInt(UI.angleInput.value) || 0;

    document.addEventListener('mousemove', handleScrubbing);
    document.addEventListener('mouseup', stopScrubbing);
    document.body.style.cursor = 'ew-resize';
  });

  // 드래그 중일 때는 클릭(포커스) 발생 차단
  UI.angleInput.addEventListener('click', (e) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

const BACKGROUND_REGISTRY = {
  'life4cut': (poses) => `A 2x2 grid collage (4-split photo booth style). Background: A clean, minimalist studio with a solid, soft pastel-colored background (e.g., muted pink, blue, or lavender) to keep the focus on the subject. Each of the four panels MUST show a different unique pose: Panel 1: ${poses[0]}; Panel 2: ${poses[1]}; Panel 3: ${poses[2]}; Panel 4: ${poses[3]}. Upper-body centric. High-quality Photo Booth aesthetic.`,
  'living-room': 'A cozy, modern indoor living room or room with natural soft lighting and elegant interior details.',
  'mountain-stars': 'A breathtaking vast mountain range at night under a brilliant galaxy of stars, with soft celestial glow and deep cinematic depth.',
  'empty-beach': 'A serene and empty tropical beach with gentle waves, soft white sand, and a clear horizontal view, evoking solitude and peace.',
  'vast-nature': 'A broad, expansive natural landscape with rolling hills, distant forests, and epic lighting, capturing the scale of the wilderness.',
  'cosmetic-studio': 'A high-end, luxury cosmetic advertising studio. Focus on the subject placed on a clean marble or glass pedestal, surrounded by soft ripples of water, elegant refractive lighting, and a minimalist pastel silk backdrop. Professional product photography.'
};

let loadingInterval = null;

// 모듈형 데이터 보관 객체
const PromptContext = {
  core: {},      // 핵심 설계 (인물, 포즈, 정체성 등)
  visual: {}     // 비주얼 스타일 (배경, 조명, 각도 등)
};

function stopLoadingAnimation(el) {
  if (el && el._loadingInterval) {
    clearInterval(el._loadingInterval);
    el._loadingInterval = null;
  }
}

function startLoadingAnimation(el, baseText) {
  if (!el) return;
  stopLoadingAnimation(el); // 이전 애니메이션 중지
  let dots = 0;
  el.innerText = baseText;
  el._loadingInterval = setInterval(() => {
    dots = (dots + 1) % 4;
    el.innerText = baseText + '.'.repeat(dots);
  }, 400);
}

async function applyEngineering() {
  console.log('--- APPLY_ENGINEERING_STARTED ---');
  let originalBtnText = UI.engineerBtn ? UI.engineerBtn.innerText : '적용 후 프롬프트 생성';

  try {
    // 1단계: 초기화 및 의도 분석
    addLog(`$ AI_PROD_ENGINEER_SERVICE --init`, 'primary');
    addLog(`> Initiating Engineering Pipeline...`, 'dim');

    if (!UI.intentInput || !UI.intentInput.value.trim()) {
      showSystemConfirm('알림', '프롬프트 작성 후 진행해 주세요.', 'info');
      addLog('!! ERR: EMPTY_CORE_INTENT_DETECTED', 'error');
      return;
    }
    const intent = UI.intentInput.value.trim();

    // 1단계: 모든 파라미터 수집 (Config Aggregation)
    const activeChips = Array.from(document.querySelectorAll('.chip.active'))
      .map(c => c.getAttribute('data-value'));

    const subjectType = UI.paramType ? UI.paramType.value : 'human';
    let selectedBg = 'none';
    if (subjectType === 'human' && UI.paramBgHuman) selectedBg = UI.paramBgHuman.value;
    else if (subjectType === 'animal' && UI.paramBgAnimal) selectedBg = UI.paramBgAnimal.value;
    else if (UI.paramBgScene) selectedBg = UI.paramBgScene.value;

    const config = {
      type: subjectType,
      style: UI.paramStyle ? UI.paramStyle.value : 'cinematic',
      angle: UI.paramAngle ? UI.paramAngle.value : '0',
      bg: selectedBg,
      pose: UI.paramPose ? UI.paramPose.value : 'dynamic',
      pov: UI.paramPov ? UI.paramPov.value : 'standard',
      face: UI.paramFace ? UI.paramFace.value : 'natural',
      outfit: UI.paramOutfit ? UI.paramOutfit.value : 'reference',
      humanRef: UI.paramHumanRef ? UI.paramHumanRef.value : 'strict',
      dogBreed: UI.paramDogBreed ? UI.paramDogBreed.value : 'none',
      catBreed: UI.paramCatBreed ? UI.paramCatBreed.value : 'none',
      animalPose: UI.paramAnimalPose ? UI.paramAnimalPose.value : 'none',
      animalPov: UI.paramAnimalPov ? UI.paramAnimalPov.value : 'none',
      sceneEffect: UI.paramSceneEffect ? UI.paramSceneEffect.value : 'none',
      sceneLight: UI.paramSceneLight ? UI.paramSceneLight.value : 'commercial',
      sceneRef: UI.paramSceneRef ? UI.paramSceneRef.value : 'strict',
      humanShot: UI.paramHumanShot ? UI.paramHumanShot.value : 'none',
      humanComp: UI.paramHumanComp ? UI.paramHumanComp.value : 'none',
      animalShot: UI.paramAnimalShot ? UI.paramAnimalShot.value : 'none',
      animalComp: UI.paramAnimalComp ? UI.paramAnimalComp.value : 'none',
      sceneShot: UI.paramSceneShot ? UI.paramSceneShot.value : 'none',
      sceneComp: UI.paramSceneComp ? UI.paramSceneComp.value : 'none',
      custom: UI.paramCustom ? UI.paramCustom.value.trim() : '',
      subFormat: UI.paramSubFormat ? UI.paramSubFormat.value : 'none',
      subTempo: UI.paramSubTempo ? UI.paramSubTempo.value : 'standard',
      subContext: UI.paramSubContext ? UI.paramSubContext.value.trim() : '',
      chips: activeChips.join(', ')
    };

    // 2단계: 엔지니어링 로그 출력 (System Diagnostics)
    addLog(`$ AI_PROD_ENGINEER_SERVICE --init --type=${config.type}`, 'primary');
    addLog(`> Initiating Engineering Pipeline...`, 'dim');
    addLog(`> Fetching Design Specifications...`, 'default');
    addLog(`  - Category: ${config.type.toUpperCase()}`, 'secondary');
    addLog(`  - Style: ${config.style}`, 'secondary');
    addLog(`  - Angle: ${config.angle}°`, 'secondary');
    addLog(`  - Background: ${config.bg}`, 'secondary');

    // 3단계: 시각적 레이어 처리 (Process Layers)
    UI.layers.forEach(l => { 
      if (l) {
        l.classList.remove('active'); 
        l.style.borderColor = '';
        const status = l.querySelector('.layer-status');
        if (status) {
          status.innerHTML = '대기 중';
          status.style.color = '';
        }
      }
    });

    for (let i = 0; i < UI.layers.length; i++) {
      const layer = UI.layers[i];
      if (layer) {
        layer.classList.add('active');
        layer.style.borderColor = ''; // reset border from previous run
        const status = layer.querySelector('.layer-status');
        if (status) status.innerHTML = '<span class="spinner-icon"></span> 최적화 중...';
        
        const logs = [
          '> [L1] Context & Alignment Processing...',
          '> [L2] Style Consistency Refinement...',
          '> [L3] Semantic Expansion & Details...'
        ];
        addLog(logs[i] || `> [L${i+1}] Processing...`, 'success');
        await new Promise(r => setTimeout(r, 300));
      }
    }

    if (UI.engineerBtn) {
      UI.engineerBtn.disabled = true;
      UI.engineerBtn.innerText = '아키텍처 설계 중…';
    }

    if (UI.optimizedOutput) {
      startLoadingAnimation(UI.optimizedOutput, '엔진 설계 중');
    }

    addLog(`$ prod --engineer --type=${config.type} --style=${config.style}`, true);
    const startTime = Date.now();

    // Construct Context-Aware Intent
    const povDescription = (config.pov === 'arm-extended' || config.pov === 'selfie')
      ? 'Mode: Selfie. It looks like a photo taken with an outstretched arm. Intimate connection.'
      : `Mode: Fixed Camera. Perspective: ${config.pov}. STRICTLY FORBID any mention of selfies, arms reaching out, or handheld cameras. This is a tripod or professional camera shot.`;

    let poseDescription = config.pose || 'none';
    let outfitText = config.outfit || 'none';

    const boothPoses = [
      'making a cute V-sign with fingers',
      'a bright warm smile',
      'playfully sticking out the tongue',
      'winking at the camera',
      'making a small finger heart',
      'puffing out cheeks cutely',
      'poking one cheek with a finger',
      'looking surprised with hands on cheeks',
      'a shy and candid laugh',
      'blowing a heart-shaped kiss',
      'pouting with a grumpy yet cute face',
      'looking upwards dreamily'
    ];

    // Randomly pick 4 unique poses
    const selectedBoothPoses = [...boothPoses]
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);

    let bgDescription = config.bg;
    const registryEntry = BACKGROUND_REGISTRY[config.bg];
    if (typeof registryEntry === 'function') {
      bgDescription = registryEntry(selectedBoothPoses);
    } else if (typeof registryEntry === 'string') {
      bgDescription = registryEntry;
    }

    let enrichedIntent = `
        ### CORE DATA ###
        Subject Identity: ${intent}
        Subject Category: ${config.type}
        
        ### VISUAL ARCHITECTURE ###
        Mandatory Visual Style: ${config.style}
        Mandatory Background: ${bgDescription}
        Mandatory Camera Angle: ${config.angle} degrees
        Mandatory Perspective: ${povDescription}
    `;

    if (config.type === 'human') {
      outfitText = config.outfit;
      if (config.outfit === 'reference') {
        outfitText = 'STRICT OUTFIT TRANSFERS: Perfectly replicate the garment from the reference image. Maintain identical color, fabric texture, cut, and specific clothing patterns. Do not add or subtract any clothing elements.';
      } else if (config.outfit === 'none') {
        outfitText = 'Random trendy creative outfit';
      }

      poseDescription = config.pose;
      if (config.pose === 't-pose') {
        poseDescription = 'STRICT TECHNICAL T-POSE: Arms fully extended horizontally to the sides at 90 degrees from the torso, palms down or forward, standing perfectly upright, legs straight together, facing front, symmetrical, character sheet orthographic style.';
      } else if (config.pose === 'a-pose') {
        poseDescription = 'STRICT TECHNICAL A-POSE: Standing with a significant gap between the legs, feet spread wide to shoulder-width apart to form a literal "A" shape with the entire body. Legs must NOT touch. Arms extended downwards at a 45-degree angle away from the body, standing perfectly upright, facing front, symmetrical, character sheet orthographic reference style.';
      }

      enrichedIntent += `
        Character Pose: ${poseDescription}
        Facial Style: ${config.face}
        ${config.humanShot !== 'none' ? `Camera Shot: ${config.humanShot}` : ''}
        ${config.humanComp !== 'none' ? `Composition: ${config.humanComp}` : ''}
        
        ### IDENTITY CONTROL ###
        Identity Strategy: ${config.humanRef === 'strict' ? 'STRICTLY MAINTAIN the face and unique identity of the reference human.' : config.humanRef === 'selective' ? 'Focus on key facial features and vibe from reference, but allow minor variations.' : 'Generate a completely new and independent character identity.'}

        ### OUTFIT & STYLING CONTROL ###
        Outfit Instruction: ${outfitText}
        `;
    } else if (config.type === 'animal') {
      if (config.dogBreed !== 'none') enrichedIntent += `Dog Breed: ${config.dogBreed}\n`;
      if (config.catBreed !== 'none') enrichedIntent += `Cat Breed: ${config.catBreed}\n`;
      enrichedIntent += `Animal Pose: ${config.animalPose}\n`;
      if (config.animalShot !== 'none') enrichedIntent += `Camera Shot: ${config.animalShot}\n`;
      if (config.animalComp !== 'none') enrichedIntent += `Composition: ${config.animalComp}\n`;
    } else if (config.type === 'scene') {
      enrichedIntent += `
        Commercial Effect: ${config.sceneEffect}
        Marketing Lighting: ${config.sceneLight}
        ${config.sceneShot !== 'none' ? `Camera Shot: ${config.sceneShot}` : ''}
        ${config.sceneComp !== 'none' ? `Composition: ${config.sceneComp}` : ''}
        
        ### FORM & REFERENCE CONTROL ###
        Reference Integrity Strategy: ${config.sceneRef === 'strict'
          ? 'STRICTLY PRESERVE the exact geometry, branding, and structural details of the reference object. Do not allow any structural hallucinations or modifications.'
          : 'Allow for artistic reinterpretation and creative structural/stylistic changes to the reference object.'}
        `;
    }

    // --- 1. SET PromptContext OBJECTS ---
    PromptContext.core = {
      subject: intent,
      type: config.type,
      pose: poseDescription,
      facial: config.face,
      identity: config.humanRef,
      outfit: outfitText
    };

    PromptContext.visual = {
      style: config.style,
      background: bgDescription,
      camera: {
        angle: config.angle,
        perspective: povDescription,
        shot: config.humanShot || config.animalShot || config.sceneShot,
        composition: config.humanComp || config.animalComp || config.sceneComp
      }
    };

    // --- 2. ASSEMBLE FINAL PROMPT INTENT (Natural Language Format) ---
    enrichedIntent = `
[CORE DESIGN SPECIFICATIONS]
- Subject Identity: ${PromptContext.core.subject}
- Character Category: ${PromptContext.core.type}
- Required Pose: ${PromptContext.core.pose}
- Face Identity Strategy: ${PromptContext.core.identity}
- Outfit Strategy: ${PromptContext.core.outfit}

[VISUAL ENVIRONMENT]
- Visual Style: ${PromptContext.visual.style}
- Background: ${PromptContext.visual.background}
- Shot/Angle: ${PromptContext.visual.camera.angle} degrees, ${PromptContext.visual.camera.shot}
- Composition: ${PromptContext.visual.camera.composition}
- Perspective: ${PromptContext.visual.camera.perspective}
    `;

    enrichedIntent += `\n[FINAL DIRECTIVES]\n${config.chips}, ${config.custom || ''}`;

    const systemPrompt = `You are a High-End AI Prompt Architect.
    TASK: Convert the [DESIGN SPECIFICATIONS] into a structured 4-paragraph English prompt for professional image generation.
    
    STRUCTURE RULES:
    1. Paragraph 1: **Identity & Style**. Focus on the subject and the ${PromptContext.visual.style} aesthetic.
    2. Paragraph 2: **Physical Attributes**. Describe facial features, skin texture, and identity with extreme cinematic detail.
    3. Paragraph 3: **Pose & Context**. Detail the ${PromptContext.core.pose} and the ${PromptContext.visual.background} with perfect spatial awareness.
    4. Paragraph 4: **Technical Architecture**. Detail pro-lighting (rim, volumetric), high-end camera specs, and 8k ray-tracing rendering.
    5. Footer: Add a "# Negative Prompts" section for professional-grade exclusion.

    STRICT RULES:
    - DO NOT explain anything. Start the prompt immediately.
    - DO NOT add titles like "Paragraph 1:". Use the bold headers directly.
    - PRIORITY: Follow the ${PromptContext.core.pose} instructions with 100% fidelity.`;

    const apiPromise = fetch('/api/engineer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: enrichedIntent, systemPrompt })
    }).then(async res => {
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || `BACKEND_SRV_FAULT (Status: ${res.status})`);
      }
      return result;
    });

    const data = await apiPromise; // Wait purely for the true API response
    const endTime = Date.now();
    const duration = endTime - startTime;

    // API 도착 후 즉시 모든 레이어를 성공("완료") 상태로 변경 (시간차 없이 자연스럽게)
    UI.layers.forEach(layer => {
      if (layer) {
        const status = layer.querySelector('.layer-status');
        if (status) status.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" stroke="#10b981" stroke-width="3" fill="none" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"></polyline></svg> 완료';
        layer.style.borderColor = 'var(--skills-cyan)';
      }
    });

    stopLoadingAnimation(UI.optimizedOutput);
    if (UI.optimizedOutput) {
      UI.optimizedOutput.innerText = data.result;
      UI.optimizedOutput.style.color = 'var(--fg)';
    }
    addLog(`✓ 프롬프트 추론 성공. [유형: ${config.type.toUpperCase()}]`, true);

    // Update global metrics for view
    window.currentMetrics = {
      latency: `${duration}ms`,
      tokens: `~${Math.ceil(data.result.length / 4)} tokens`,
      status: 'SUCCESS',
      subject: config.type
    };

    // 실시간 대시보드 업데이트 (1초 이상이면 초 단위로 표시)
    if (UI.statLatency) {
      if (duration >= 1000) {
        UI.statLatency.innerText = `${(duration / 1000).toFixed(2)}s`;
      } else {
        UI.statLatency.innerText = `${duration}ms`;
      }
    }

  } catch (error) {
    console.error('APPLY_ERROR:', error);
    stopLoadingAnimation(UI.optimizedOutput);
    addLog(`!! CRITICAL_FAULT: ${error.message}`, 'error');
    if (UI.optimizedOutput) UI.optimizedOutput.innerText = "오류 발생: " + error.message;

    // 🚨 에러 시 스피너가 무한정 도는 현상 방지: 실패 상태 시각화
    UI.layers.forEach(layer => {
      if (layer) {
        const status = layer.querySelector('.layer-status');
        if (status) {
          status.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" stroke="#ff5555" stroke-width="3" fill="none" style="flex-shrink:0"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> 실패';
          status.style.color = '#ff5555';
        }
        layer.style.borderColor = '#ff5555';
      }
    });
  } finally {
    if (UI.engineerBtn) {
      UI.engineerBtn.disabled = false;
      UI.engineerBtn.innerText = originalBtnText;
    }
  }
}

/**
 * 전용 유틸리티: 영상 자막 및 타임라인 생성 엔진
 */
async function generateSubtitles() {
  const isAudioMode = UI.btnSourceAudio.classList.contains('active');
  const format = UI.paramSubFormat.value;
  const tempo = UI.paramSubTempo.value;
  const context = UI.paramSubContext ? UI.paramSubContext.value.trim() : '';
  
  // 🎯 비디오 전용 입력창(paramSubIntent)을 최우선으로, 없으면 상단 공통 입력창(intentInput) 사용
  let vIntent = UI.paramSubIntent && UI.paramSubIntent.value.trim();
  if (!vIntent) vIntent = UI.intentInput.value.trim();

  // 오디오 모드 검증
  if (isAudioMode) {
    if (!UI.audioFileInput.files[0]) {
      addLog('!! ERR: 분석할 오디오 파일을 업로드해주세요.', 'error');
      return;
    }
  } else if (!vIntent) {
    addLog('!! ERR: 영상 주제를 입력해주세요. (예: 야구 경기 하이라이트)', 'error');
    if (UI.paramSubIntent) UI.paramSubIntent.focus();
    return;
  }

  const intent = vIntent; // 기존 로직 호환용

  try {
    if (UI.subGenBtn) UI.subGenBtn.disabled = true;
    if (UI.subtitleOutput) startLoadingAnimation(UI.subtitleOutput, isAudioMode ? 'Whisper AI 음성 분석 중' : '자막 타임라인 연산 중');
    
    addLog(`$ VIDEO_SUB_ENGINE --mode=${isAudioMode ? 'WHISPER_STT' : 'AI_GEN'} --format=${format}`, 'secondary');

    if (isAudioMode) {
      // 🎙️ Whisper STT 실시간 연동 로직
      const formData = new FormData();
      formData.append('audio', UI.audioFileInput.files[0]);

      addLog('>> [SYSTEM] Sending audio to Whisper AI...', 'primary');
      
      const whisperRes = await fetch('/api/whisper', {
        method: 'POST',
        body: formData
      });

      if (!whisperRes.ok) {
        const errData = await whisperRes.json();
        throw new Error(errData.error || 'Whisper extraction failed');
      }

      const whisperData = await whisperRes.json();
      stopLoadingAnimation(UI.subtitleOutput);
      
      if (UI.subtitleOutput) {
        UI.subtitleOutput.innerText = whisperData.result;
        UI.subtitleOutput.style.color = 'var(--fg)';
      }
      addLog('✓ 음성 분석 및 자막 추출 성공.', 'success');
      return;
    }

    const tempoMap = { 'slow': 'Slow & Epic (5-7s per line)', 'fast': 'Fast & Energetic (2-3s per line)', 'standard': 'Standard Narration (4-5s per line)' };
    const duration = UI.paramSubDuration ? UI.paramSubDuration.value : '15';
    
    const tempoStyle = tempoMap[tempo] || tempoMap['standard'];
    const durationNum = parseInt(duration) || 15;
    const blockCount = Math.floor(durationNum / 5);

    const systemPrompt = `You are a Top-Tier Professional Content Creator & Scriptwriter.
    TASK: Generate a ${durationNum}-second high-quality Korean video script in SRT format.
    
    [STRICT OUTPUT FORMAT]
    (Index)
    (Start Time) --> (End Time)
    (Subtitle Text)
    [Blank Line]

    Example:
    1
    00:00:00,000 --> 00:00:05,000
    안녕! 오늘 하루는 어땠어?

    [EXECUTION RULES - ABSOLUTE]
    1. NO PREAMBLE: Start immediately with the number '1'. No "Sure", "Okay", or "Here is your script".
    2. NO DRAFTING: Do not write your reasoning, thinking process, or draft lines.
    3. NO ENGLISH: All subtitle text must be pure Korean. 
    4. NO SINGLE-LINE: Index, Time, and Text MUST be on separate lines as shown in the example.
    5. BLOCK COUNT: Exactly ${blockCount} blocks.
    6. TONE: Adapt to topic "${intent}" with vibe "${context || 'Natural'}".
    7. ONLY output the final SRT string. I will lose my job if you include any other text.`;

    const res = await fetch('/api/engineer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, systemPrompt })
    });
    
    const data = await res.json();
    stopLoadingAnimation(UI.subtitleOutput);

    if (!res.ok) {
        throw new Error(data.error || 'AI 엔진 응답 실패');
    }

    if (UI.subtitleOutput) {
      UI.subtitleOutput.innerText = data.result;
      UI.subtitleOutput.style.color = 'var(--fg)';
    }
    addLog('✓ 영상 자막 데이터 생성 완료.', 'success');

  } catch (err) {
    stopLoadingAnimation(UI.subtitleOutput);
    addLog(`!! SUB_GEN_FAULT: ${err.message}`, 'error');
  } finally {
    if (UI.subGenBtn) UI.subGenBtn.disabled = false;
  }
}

// 영상 전용 리스너 연결
if (UI.subGenBtn) UI.subGenBtn.onclick = generateSubtitles;
// 프롬프트 복사 리스너
if (UI.copyBtn) {
  UI.copyBtn.addEventListener('click', () => {
    const el = UI.optimizedOutput;
    const text = el ? el.innerText : '';
    // 🛡️ 애니메이션 엔진의 상태를 직접 체크하여 더 완벽하게 방어
    const isLoading = el && el._loadingInterval;
    
    if (text && !isLoading && !text.includes('대기 중') && !text.includes('설계 중')) {
      navigator.clipboard.writeText(text);
      const originalText = UI.copyBtn.innerText;
      UI.copyBtn.innerText = '완료!';
      setTimeout(() => UI.copyBtn.innerText = originalText, 2000);
      addLog('✓ 최적화 프롬프트가 복사되었습니다.');
    }
  });
}

// 자막 데이터 복사 리스너
if (UI.copySubBtn) {
  UI.copySubBtn.addEventListener('click', () => {
    const el = UI.subtitleOutput;
    const text = el ? el.innerText : '';
    const isLoading = el && el._loadingInterval;

    if (text && !isLoading && !text.includes('대기 중') && !text.includes('설계 중')) {
      navigator.clipboard.writeText(text);
      const originalText = UI.copySubBtn.innerText;
      UI.copySubBtn.innerText = '완료!';
      setTimeout(() => UI.copySubBtn.innerText = originalText, 2000);
      addLog('✓ 자막 데이터가 복사되었습니다.');
    }
  });
}

// SRT 파일 다운로드 리스너
if (UI.downloadSrtBtn) {
  UI.downloadSrtBtn.addEventListener('click', () => {
    const el = UI.subtitleOutput;
    const text = el ? el.innerText : '';
    const isLoading = el && el._loadingInterval;

    if (text && !isLoading && !text.includes('대기 중')) {
      // 💾 Blob 생성 및 다운로드 트리거
      const blob = new Blob([text], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      // 파일명 생성 로직 (원본 파일명 활용)
      let fileName = 'subtitles.srt';
      if (UI.fileNameDisplay && UI.fileNameDisplay.innerText !== 'None') {
        const baseName = UI.fileNameDisplay.innerText.substring(0, UI.fileNameDisplay.innerText.lastIndexOf('.')) || 'subtitles';
        fileName = `${baseName}.srt`;
      } else {
        fileName = `subtitles_${new Date().getTime()}.srt`;
      }

      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      // 정리
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      addLog(`✓ 자막 파일 다운로드 시작: ${fileName}`, 'success');
      
      const originalText = UI.downloadSrtBtn.innerText;
      UI.downloadSrtBtn.innerText = '저장 완료!';
      setTimeout(() => UI.downloadSrtBtn.innerText = originalText, 2000);
    }
  });
}

if (UI.engineerBtn) {
  UI.engineerBtn.addEventListener('click', () => {
    applyEngineering().catch(err => {
      addLog(`> [FATAL] ${err.message}`, true);
    });
  });
}

// Initial Animation for Output
if (UI.optimizedOutput) {
  startLoadingAnimation(UI.optimizedOutput, '대기 중');
}
if (UI.subtitleOutput) {
  startLoadingAnimation(UI.subtitleOutput, '대기 중');
}

// --- [WHISPER STT & AUDIO INTERFACE LOGIC] ---
if (UI.btnSourceText && UI.btnSourceAudio) {
  const switchSource = (source) => {
    const isAudioMode = (source !== 'text');
    if (!isAudioMode) {
      UI.btnSourceText.classList.add('active');
      UI.btnSourceAudio.classList.remove('active');
      UI.audioUploadContainer.style.display = 'none';
      UI.subtitleParamsContainer.style.display = 'grid';
      UI.subtitleIntentContainer.style.display = 'block';
      UI.subtitleContextContainer.style.display = 'block';
      
      // 텍스트 모드는 항상 활성화
      UI.subGenBtn.disabled = false;
      UI.subGenBtn.innerText = 'AI 영상 자막 생성 (Timeline)';
      if (UI.paramSubIntent) {
        UI.paramSubIntent.disabled = false;
        UI.paramSubIntent.placeholder = "예) 야구 결승전 역전 홈런 상황, 강아지 브이로그";
      }
      const alertVideo = document.getElementById('auth-alert-video');
      if (alertVideo) alertVideo.style.display = 'none';
    } else {
      UI.btnSourceAudio.classList.add('active');
      UI.btnSourceText.classList.remove('active');
      UI.audioUploadContainer.style.display = 'block';
      UI.subtitleParamsContainer.style.display = 'none';
      UI.subtitleIntentContainer.style.display = 'none';
      UI.subtitleContextContainer.style.display = 'none';
      
      // 오디오 모드는 로그인이 필요함
      UI.subGenBtn.disabled = !USER_LOGGED_IN;
      UI.subGenBtn.innerText = !USER_LOGGED_IN ? '🔒 로그인 필요' : 'STT 자막 추출 시작';
      
      const alertVideo = document.getElementById('auth-alert-video');
      if (alertVideo) alertVideo.style.display = USER_LOGGED_IN ? 'none' : 'flex';
    }
  };

  UI.btnSourceText.onclick = () => switchSource('text');
  UI.btnSourceAudio.onclick = async () => {
    if (!USER_LOGGED_IN) {
      const confirmLogin = await showSystemConfirm(
        '로그인 필요',
        'STT 오디오 변환 기능은 로그인이 필요합니다. 로그인 페이지로 이동할까요?',
        'info'
      );
      if (confirmLogin) {
        window.location.href = '/auth/google';
      }
      return;
    }
    switchSource('audio');
  };
}

// Audio Upload Handling (Drag & Drop)
if (UI.audioDropzone && UI.audioFileInput) {
  UI.audioDropzone.onclick = () => UI.audioFileInput.click();

  UI.audioFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) handleAudioFile(file);
  };

  UI.audioDropzone.ondragover = (e) => {
    e.preventDefault();
    UI.audioDropzone.classList.add('dragover');
  };

  UI.audioDropzone.ondragleave = () => {
    UI.audioDropzone.classList.remove('dragover');
  };

  UI.audioDropzone.ondrop = (e) => {
    e.preventDefault();
    UI.audioDropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      UI.audioFileInput.files = e.dataTransfer.files;
      handleAudioFile(file);
    } else {
      addLog('!! ERR: 오디오 파일만 업로드 가능합니다.', 'error');
    }
  };
}

function handleAudioFile(file) {
  if (UI.fileNameDisplay) {
    UI.fileNameDisplay.innerText = file.name;
    UI.fileNameDisplay.parentElement.style.display = 'block';
  }
  addLog(`✓ 오디오 로드 완료: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`, 'success');
}

// --- [AUTHENTICATION UI SYNC] ---
async function checkAuthStatus() {
  const loginBtn = document.getElementById('login-btn');
  const profileArea = document.getElementById('user-profile');
  const avatarImg = document.getElementById('user-avatar');

  const updateAuthUIInputs = (isLoggedIn) => {
    if (UI.intentInput) {
      UI.intentInput.disabled = !isLoggedIn;
      UI.intentInput.placeholder = isLoggedIn ? "아이디어를 입력하세요... (e.g. : 한국인 여자, 고양이, 향수, ... )" : "🔒 기능을 사용하려면 먼저 로그인이 필요합니다.";
    }
    if (UI.paramSubIntent) {
      const isAudioMode = UI.btnSourceAudio && UI.btnSourceAudio.classList.contains('active');
      UI.paramSubIntent.disabled = isAudioMode && !isLoggedIn;
      UI.paramSubIntent.placeholder = (isAudioMode && !isLoggedIn) ? "🔒 로그인이 필요합니다." : "예) 야구 결승전 역전 홈런 상황, 강아지 브이로그";
    }
    if (UI.engineerBtn) {
      UI.engineerBtn.disabled = !isLoggedIn;
      UI.engineerBtn.innerText = isLoggedIn ? "적용 후 프롬프트 생성" : "🔒 로그인 필요";
    }
      if (UI.subGenBtn) {
        const isAudioMode = UI.btnSourceAudio && UI.btnSourceAudio.classList.contains('active');
        UI.subGenBtn.disabled = isAudioMode && !isLoggedIn;
        UI.subGenBtn.innerText = (isAudioMode && !isLoggedIn) ? '🔒 로그인 필요' : (isAudioMode ? 'STT 자막 추출 시작' : 'AI 영상 자막 생성 (Timeline)');
      }
      
      const alertPrompt = document.getElementById('auth-alert-prompt');
      const alertVideo = document.getElementById('auth-alert-video');
      if (alertPrompt) alertPrompt.style.display = isLoggedIn ? 'none' : 'flex';
      
      const isAudioMode = UI.btnSourceAudio && UI.btnSourceAudio.classList.contains('active');
      if (alertVideo) alertVideo.style.display = (isLoggedIn || !isAudioMode) ? 'none' : 'flex';
    };

  // 1. 로그인 버튼 이벤트 바인딩 (인라인 onclick 대신)
  if (loginBtn) {
    loginBtn.onclick = () => {
      addLog('>> [AUTH] Redirecting to Google Login...', 'primary');
      window.location.href = '/auth/google';
    };
  }

  // 2. 서버에서 로그인 상태 가져오기
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('Auth fetch failed');
    const data = await res.json();
    
    if (data.user) {
      USER_LOGGED_IN = true;
      if (loginBtn) loginBtn.style.display = 'none';
      if (profileArea) {
        profileArea.style.display = 'flex';
        if (avatarImg && data.user.photos && data.user.photos[0]) {
          avatarImg.src = data.user.photos[0].value;
        }
        const nameDisplay = document.getElementById('user-name-display');
        if (nameDisplay) nameDisplay.innerText = data.user.displayName || 'USER';
      }
      addLog(`✓ 로그인 확인: ${data.user.displayName}`, 'success');
      // 로그인 성공 시 프리셋 새로고침
      MyPresets.fetchFromServer();
      updateAuthUIInputs(true);
    } else {
      USER_LOGGED_IN = false;
      if (loginBtn) loginBtn.style.display = 'block';
      if (profileArea) profileArea.style.display = 'none';
      
      // 🛡️ 로그아웃 시 UI 전역 정화 (Factory Reset)
      MyPresets.data = [];
      MyPresets.render();
      if (UI.log) UI.log.innerHTML = ''; // 터미널 로그 삭제
      addLog('>> [AUTH] Logout detected. System state secured.', 'dim');
      updateAuthUIInputs(false);
    }
  } catch (err) {
    USER_LOGGED_IN = false;
    console.warn('Auth system offline or guest mode:', err.message);
    if (loginBtn) loginBtn.style.display = 'block';
    updateAuthUIInputs(false);
  }
}

// ---------------------------------------------------------------------------------------------------
// System Status Toggle Logic
document.querySelectorAll('a[href="#system-status"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    if (UI.systemStatusSection) {
      const isCurrentlyActive = UI.systemStatusSection.classList.contains('active');
      if (isCurrentlyActive) {
        UI.systemStatusSection.classList.remove('active');
        anchor.scrollIntoView({ behavior: 'smooth' });
      } else {
        UI.systemStatusSection.classList.add('active');
        UI.systemStatusSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
});

// 초기 실행
checkAuthStatus();

// ✅ 히어로 "시작하기" 버튼 → Prompt Lab으로 스크롤
const heroStartBtn = document.getElementById('hero-start-btn');
if (heroStartBtn) {
  heroStartBtn.addEventListener('click', () => {
    document.getElementById('prompt-lab').scrollIntoView({ behavior: 'smooth' });
  });
}
