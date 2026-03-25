const UI = {
  intentInput: document.getElementById('intent-input'),
  engineerBtn: document.getElementById('engineer-btn'),
  optimizedOutput: document.getElementById('optimized-output'),
  copyBtn: document.getElementById('copy-btn'),
  jsonBtn: document.getElementById('json-btn'),
  layers: [
    document.getElementById('layer-1'),
    document.getElementById('layer-2'),
    document.getElementById('layer-3')
  ],
  paramType: document.getElementById('param-type'),
  paramStyle: document.getElementById('param-style'),
  paramAngle: document.getElementById('param-angle'),
  paramHumanCamAngle: document.getElementById('param-human-cam-angle'),
  paramAnimalCamAngle: document.getElementById('param-animal-cam-angle'),
  paramSceneCamAngle: document.getElementById('param-scene-cam-angle'),
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
  paramSubFormat: document.getElementById('param-sub-format'),
  paramSubIntent: document.getElementById('param-sub-intent'), // 추가
  paramSubTempo: document.getElementById('param-sub-tempo'),
  paramSubContext: document.getElementById('param-sub-context'),
  paramSubDuration: document.getElementById('param-sub-duration'),
  paramSubDurationSlider: document.getElementById('param-sub-duration-slider'),
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
  systemStatusSection: document.getElementById('system-status'),
  statLatency: document.getElementById('stat-latency'),
  statLatencyTrend: document.getElementById('stat-latency-trend'),
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
  themeLabel: document.getElementById('theme-current-label'),
  allParamsContainer: document.getElementById('all-params-container')
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
      paramHumanCamAngle: 'none',
      paramAnimalCamAngle: 'none',
      paramSceneCamAngle: 'none',
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
        paramHumanCamAngle: UI.paramHumanCamAngle?.value,
        paramAnimalCamAngle: UI.paramAnimalCamAngle?.value,
        paramSceneCamAngle: UI.paramSceneCamAngle?.value,
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

// 초기화 시 서버 데이터 호출 막음 (비로그인 401 에러 로그 방지. checkAuthStatus()에서 호출됨)

// 프리셋 버튼 리스너
if (UI.savePresetBtn) {
  UI.savePresetBtn.onclick = () => MyPresets.save();
}

// 초기 로드
MyPresets.render();

// --- CORE SYSTEM HEALTH CHECK ---
async function fetchServerStatus() {
  try {
    const startTime = performance.now();
    const res = await fetch('/api/status');
    const data = await res.json();
    const endTime = performance.now();

    // API 레이턴시 실시간 반영 (ms) + 상태별 색상
    const latency = Math.round(endTime - startTime);
    if (UI.statLatency) {
      UI.statLatency.innerText = `${latency}ms`;
      const trend = UI.statLatencyTrend;

      if (latency < 300) {
        UI.statLatency.style.color = '#10b981';
        if (trend) { trend.innerText = 'Stable'; trend.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'; trend.style.color = '#10b981'; }
      } else if (latency < 800) {
        UI.statLatency.style.color = '#f59e0b';
        if (trend) { trend.innerText = 'Moderate'; trend.style.backgroundColor = 'rgba(245, 158, 11, 0.1)'; trend.style.color = '#f59e0b'; }
      } else {
        UI.statLatency.style.color = '#ff5555';
        if (trend) { trend.innerText = 'Unstable'; trend.style.backgroundColor = 'rgba(255, 85, 85, 0.1)'; trend.style.color = '#ff5555'; }
      }
    }

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

    // 4. 상단 섹션별 서버 상태 실시간 반영
    const isLabProcessing = document.getElementById('status-text-lab')?.innerText.includes('중');
    const isVpsProcessing = document.getElementById('status-text-vps')?.innerText.includes('중');

    const statusMap = { 'ONLINE': 'idle', 'DEGRADED': 'warning', 'OFFLINE': 'error' };
    const statusType = statusMap[data.aiNodeStatus] || 'error';
    const statusMsg = `Server Status: ${data.aiNodeStatus === 'ONLINE' ? 'Online' : data.aiNodeStatus}`;

    if (!isLabProcessing) updateStatusUI('lab', statusType, statusMsg);
    if (!isVpsProcessing) updateStatusUI('vps', statusType, statusMsg);

    console.log(`[SYSTEM] Heartbeat received. AI_ENGINE: ${data.aiNodeStatus}`);
  } catch (err) {
    console.warn('[SYSTEM] Check failed. AI Server Offline.');
    updateStatusUI('lab', 'error', 'Server Status: Offline');
    updateStatusUI('vps', 'error', 'Server Status: Offline');
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
// --- STATUS UI ENGINE ---
function updateStatusUI(section, status, message) {
  const dot = document.getElementById(`status-dot-${section}`);
  const text = document.getElementById(`status-text-${section}`);
  if (!dot || !text) return;

  // Reset classes
  dot.classList.remove('idle', 'processing', 'warning', 'error');
  dot.style.background = ''; // inline style remove to use CSS classes

  if (status === 'processing') {
    dot.classList.add('idle'); // Change processing to use green (idle) dot
    text.innerText = message || 'Processing...';
    text.style.color = '#10b981';
  } else if (status === 'error') {
    dot.classList.add('error');
    text.innerText = message || 'System Error';
    text.style.color = '#ff5555';
  } else if (status === 'warning') {
    dot.classList.add('warning');
    text.innerText = message || 'Warning';
    text.style.color = '#f59e0b';
  } else {
    dot.classList.add('idle');
    text.innerText = message || 'System Ready';
    text.style.color = '#10b981';
  }
}

// 초기 에러 핸들러
window.onerror = (msg, url, line) => {
  addLog(`> [SYSTEM_CRITICAL] ${msg}`, 'error');
  updateStatusUI('lab', 'error', 'Runtime Error');
  updateStatusUI('vps', 'error', 'Runtime Error');
};

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
    if (UI.allParamsContainer) UI.allParamsContainer.style.display = 'none';

    if (val === 'human') {
      if (UI.allParamsContainer) UI.allParamsContainer.style.display = 'block';
      if (UI.humanParamsGroup) UI.humanParamsGroup.style.display = 'block';
      if (UI.bgHumanContainer) UI.bgHumanContainer.style.display = 'flex';
    } else if (val === 'animal') {
      if (UI.allParamsContainer) UI.allParamsContainer.style.display = 'block';
      if (UI.animalParamsGroup) UI.animalParamsGroup.style.display = 'block';
      if (UI.bgAnimalContainer) UI.bgAnimalContainer.style.display = 'flex';
    } else if (val === 'scene') {
      if (UI.allParamsContainer) UI.allParamsContainer.style.display = 'block';
      if (UI.sceneParamsGroup) UI.sceneParamsGroup.style.display = 'block';
      if (UI.bgSceneContainer) UI.bgSceneContainer.style.display = 'flex';
    } else {
      // none (do nothing, stay hidden)
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

  // 영상 길이 슬라이더 동기화 로직 추가
  if (UI.paramSubDurationSlider && UI.paramSubDuration) {
    // 슬라이더 바 컨트롤 -> 숫자칸 반영
    UI.paramSubDurationSlider.addEventListener('input', (e) => {
      UI.paramSubDuration.value = e.target.value;
    });

    // 숫자 타이핑 제어 -> 슬라이더 바 반영
    UI.paramSubDuration.addEventListener('input', (e) => {
      let val = parseInt(e.target.value);
      if (isNaN(val)) val = 5;
      if (val > 60) val = 60;
      if (val < 5) val = 5;
      UI.paramSubDurationSlider.value = val;
    });

    // 포커스 시 한번에 숫자를 지우기 편하도록 전체 선택 지원
    UI.paramSubDuration.addEventListener('focus', (e) => {
      e.target.select();
    });
  }

  // ===== Video Production Suite 탭 전환 =====
  document.querySelectorAll('.vps-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.vps-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.vps-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(`vps-panel-${tab.dataset.vpsTab}`);
      if (panel) panel.classList.add('active');
    });
  });

  // ===== VPS 통합 생성 버튼 핸들러 (스토리보드/숏리스트/SEO/BGM/컨셉) =====
  document.querySelectorAll('.vps-gen-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tool = btn.dataset.tool;
      const config = getVpsToolConfig(tool);
      if (!config) return;

      const { inputEl, outputEl, systemPrompt } = config;
      const userInput = inputEl.value.trim();

      if (!userInput) {
        inputEl.style.borderColor = '#ff6b6b';
        setTimeout(() => inputEl.style.borderColor = '', 2000);
        return;
      }

      btn.disabled = true;
      startLoadingAnimation(outputEl, '생성 중');
      updateStatusUI('vps', 'processing', `${tool.toUpperCase()} 생성 중...`);

      try {
        const res = await fetch('/api/engineer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent: userInput, systemPrompt })
        });
        const data = await res.json();
        stopLoadingAnimation(outputEl);

        if (!res.ok) throw new Error(data.error || 'AI 응답 실패');

        // 모델이 줄바꿈을 생략하는 경우를 방지, 이모지 및 구분선 단위로 강제 줄바꿈
        let formattedText = data.result
          .replace(/(🎬|📷|📐|🎥|💡|📌|🎵|📝|💬|⏱️|🔍|📢|🏷️|#️⃣|🎯|---|═══)/g, '\n$1')
          .replace(/^\n+/g, '')       // 시작 부분의 불필요한 공백 제거
          .replace(/\n\n\n+/g, '\n\n') // 3줄 이상의 연속 줄바꿈 방지
          .trim();

        if (tool === 'shotlist' && formattedText.includes('|')) {
          // 간혹 표 형식으로 출력됐을 경우 표 기호(|) 앞뒤로 줄바꿈 시도 (안전망)
          formattedText = formattedText.replace(/\|/g, '\n|');
        }

        outputEl.innerText = formattedText;
        outputEl.dataset.rawResult = formattedText; // PDF 내보내기를 위한 원본 데이터 
        outputEl.style.color = 'var(--fg)';
        addLog(`✓ ${tool.toUpperCase()} 생성 완료.`, 'success');
        updateStatusUI('vps', 'idle', `${tool.toUpperCase()} 생성 완료`);
      } catch (err) {
        stopLoadingAnimation(outputEl);
        outputEl.innerText = `[생성 실패: ${err.message}]\n다시 시도해주세요.`;
        outputEl.style.color = '#ff6b6b';
        addLog(`!! VPS_${tool.toUpperCase()}_FAULT: ${err.message}`, 'error');
        updateStatusUI('vps', 'error', `에러: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ===== VPS 복사 버튼 핸들러 =====
  document.querySelectorAll('.vps-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const el = document.getElementById(targetId);
      if (el && el.innerText) {
        navigator.clipboard.writeText(el.innerText);
        const original = btn.innerText;
        btn.innerText = '완료!';
        setTimeout(() => btn.innerText = original, 1500);
      }
    });
  });

  // ===== 통합 기획서 내보내기 로직 =====
  function getMasterplanContent(format) {
    const sections = [
      { id: 'vps-concept-output', title: '🎨 1. 컨셉 기획서 (Concept Brief)' },
      { id: 'vps-storyboard-output', title: '📋 2. 스토리보드 (Storyboard)' },
      { id: 'vps-shotlist-output', title: '🎥 3. 촬영 숏 리스트 (Shot List)' },
      { id: 'vps-bgm-output', title: '🎵 4. BGM 추천 (Audio & SFX)' },
      { id: 'subtitle-output', title: '🎬 5. AI 대본/자막 (Script/Timeline)' },
      { id: 'vps-seo-output', title: '🏷️ 6. 제목 및 태그 (SEO & Release)' }
    ];

    let txtContent = '====================================\n';
    txtContent += '     VIDEO PRODUCTION MASTERPLAN    \n';
    txtContent += '====================================\n\n';

    let htmlContent = `
      <html>
      <head>
        <title>Video Production Masterplan</title>
        <style>
          body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; line-height: 1.6; color: #111; padding: 40px; }
          h1 { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 40px; }
          h2 { color: #5b21b6; background: #f3e8ff; padding: 10px 15px; border-radius: 8px; margin-top: 40px; font-size: 1.2rem; }
          pre { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: 0.95rem; }
          @media print {
            body { padding: 0; }
            h1 { font-size: 18pt; margin-bottom: 20px; }
            h2 { font-size: 14pt; color: #000; background: #eee; border: 1px solid #ddd; margin-top: 20px; page-break-after: avoid; }
            h2:not(:first-of-type) { page-break-before: always; }
            pre { border: 1px solid #ccc; font-size: 11pt; background: transparent; white-space: pre-wrap; word-wrap: break-word; }
            @page { margin: 15mm; }
          }
        </style>
      </head>
      <body>
        <h1>VIDEO PRODUCTION MASTERPLAN</h1>
    `;

    sections.forEach(sec => {
      const el = document.getElementById(sec.id);
      let content = '(아직 생성되지 않았습니다)';

      if (el) {
        // 화면 숨김(display:none) 상태에 의한 줄바꿈 삭제를 방지하기 위해 생성 시 저장된 원본 데이터(rawResult) 우선 사용
        const rawText = el.dataset.rawResult || el.innerText;
        if (rawText.trim() !== '' && !rawText.includes('대기 중')) {
          content = rawText.trim();
        }
      }

      // TXT Append
      txtContent += `[ ${sec.title} ]\n`;
      txtContent += `${content}\n\n`;
      txtContent += '------------------------------------\n\n';

      // HTML Append
      htmlContent += `<h2>${sec.title}</h2><pre>${content}</pre>`;
    });

    htmlContent += '</body></html>';
    return format === 'html' ? htmlContent : txtContent;
  }

  const btnExportTxt = document.getElementById('btn-export-txt');
  if (btnExportTxt) {
    btnExportTxt.addEventListener('click', () => {
      const text = getMasterplanContent('txt');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Video_Masterplan.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) {
    btnExportPdf.addEventListener('click', () => {
      const html = getMasterplanContent('html');
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();

        // 인쇄창 호출 (약간의 딜레이 후 렌더링 보장)
        setTimeout(() => {
          win.focus();
          win.print();
        }, 500);
      } else {
        alert('팝업 차단이 설정되어 있습니다. 팝업 차단을 해제해주세요.');
      }
    });
  }

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

/**
 * VPS 도구별 설정을 반환하는 함수
 * 각 도구에 최적화된 시스템 프롬프트와 I/O DOM 요소를 매핑
 */
function getVpsToolConfig(tool) {
  const configs = {
    storyboard: {
      inputEl: document.getElementById('vps-storyboard-input'),
      outputEl: document.getElementById('vps-storyboard-output'),
      systemPrompt: (() => {
        const style = document.getElementById('vps-storyboard-style')?.value || 'vlog';
        return `당신은 전문 영상 스토리보드 작가입니다. 사용자가 제공한 대본/주제를 기반으로 장면별 스토리보드를 생성하세요.

[영상 스타일] ${style}

[출력 형식 - 반드시 이 형식으로]
각 장면마다:
---
🎬 씬 (번호): (장면 제목)
📷 카메라: (샷 타입 - 와이드샷/미디엄샷/클로즈업/오버숄더 등)
🎥 카메라 무빙: (고정/팬/틸트/트래킹/줌인/줌아웃 등)
📝 장면 설명: (이 장면에서 화면에 보이는 것들 묘사)
💬 대사/나레이션: (이 장면의 대사 또는 나레이션)
⏱️ 예상 길이: (초 단위)
---

[규칙]
- 100% 한글 작성
- 장면 수는 5~10개 사이
- 각 장면은 구체적이고 촬영 가능하게 작성`;
      })()
    },
    shotlist: {
      inputEl: document.getElementById('vps-shotlist-input'),
      outputEl: document.getElementById('vps-shotlist-output'),
      systemPrompt: (() => {
        const gear = document.getElementById('vps-shotlist-gear')?.value || 'smartphone';
        return `당신은 20년 경력의 수석 촬영 감독입니다.
제공된 대본/시나리오를 분석하여, 실제 촬영 현장에서 바로 쓸 수 있는 직관적이고 실용적인 숏 리스트(Shot List)를 작성하세요.

[촬영 장비] ${gear}

[출력 형식 - 불필요한 서론/인사말, 촬영 스태프 목록 등은 절대 빼고 아래 형식만 반복하세요]
---
🎬 샷 (번호): (장면의 핵심 설명, 예: 주인공 스마트폰 확인)
📷 렌즈/프레임: (예: 와이드 샷, 익스트림 클로즈업 등)
📐 카메라 앵글: (예: 하이 앵글, 아이 레벨 등)
🎥 카메라 무빙: (예: 피사체 따라 트래킹, 핸드헬드, 고정 등)
💡 조명 및 톤: (예: 창가 자연광, 역광 활용 등)
📌 디렉팅 포인트: (구도나 연출 시 가장 주의할 핵심 팁 1줄)
---

[규칙]
- 마크다운 표(| |)를 절대 사용하지 마세요. 모바일/웹에서 읽기 힘들기 때문입니다.
- 무조건 위에서 제시한 블록(---) 형식으로만 출력하세요.
- 불필요한 전체 요약, 장소 정리, 스태프 목록은 절대 출력하지 마세요.
- 장비(${gear})의 물리적 특성을 고려한 현실적인 촬영법을 제안하세요.
- 총 8~12개의 숏으로 분할하여 상세하게 작성하세요.`;
      })()
    },
    seo: {
      inputEl: document.getElementById('vps-seo-input'),
      outputEl: document.getElementById('vps-seo-output'),
      systemPrompt: (() => {
        const platform = document.getElementById('vps-seo-platform')?.value || 'youtube';
        return `당신은 ${platform} SEO 전문가입니다. 주어진 영상 주제를 분석하여 최적화된 SEO 패키지를 생성하세요.

[타겟 플랫폼] ${platform}

[출력 형식]
📌 추천 제목 (5개):
1. (클릭을 유도하는 매력적인 제목)
2. ...

📝 영상 설명문:
(${platform}에 최적화된 설명문, 200자 이상)

🏷️ 태그 (20개):
(쉼표로 구분된 관련 태그)

#️⃣ 해시태그 (10개):
(#으로 시작하는 해시태그)

🎯 타겟 키워드:
- 메인 키워드: 
- 서브 키워드: 

[규칙]
- 100% 한글 작성 (영어 키워드는 검색 최적화용으로 병기 가능)
- ${platform} 알고리즘에 최적화된 키워드 선정
- 클릭률(CTR)을 높이는 제목 작성`;
      })()
    },
    bgm: {
      inputEl: document.getElementById('vps-bgm-input'),
      outputEl: document.getElementById('vps-bgm-output'),
      systemPrompt: (() => {
        const mood = document.getElementById('vps-bgm-mood')?.value || 'auto';
        const musicType = document.getElementById('vps-bgm-type')?.value || 'auto';

        let typeInstruction = '';
        let keywordSuffix = '';
        if (musicType === 'inst') {
          typeInstruction = `\n[음악 유형] 인스트루멘탈 전용 (Instrumental Only)\n- 반드시 보컬이 없는 인스트루멘탈(inst) 버전만 추천하세요.\n- 원곡이 보컬 곡이라면 반드시 "(Inst)" 또는 "(Instrumental)" 버전을 명시하세요.`;
          keywordSuffix = ' + "inst" 또는 "instrumental" 키워드를 반드시 포함';
        } else if (musicType === 'vocal') {
          typeInstruction = `\n[음악 유형] 보컬 포함 (With Vocals)\n- 보컬이 포함된 곡 위주로 추천하세요. 가사가 영상 분위기와 어울리는 곡을 선정하세요.`;
          keywordSuffix = '';
        }

        return `당신은 10년 경력의 영상 음악 감독이자 음악 큐레이터입니다. 주어진 영상 내용을 분석하여 장면별 BGM과 효과음을 추천하세요.

[원하는 분위기] ${mood === 'auto' ? '내용에 맞게 자동 판단' : mood}${typeInstruction}

[출력 형식]
🎵 전체 분위기 요약:
(이 영상에 어울리는 전반적인 음악 방향${musicType === 'inst' ? ' — 인스트루멘탈 기반' : ''})

📋 장면별 BGM 추천:
각 장면마다:
---
🎬 장면: (장면 설명)
🎵 추천곡: (실제 존재하는 곡 제목) - (실제 아티스트/작곡가 이름)${musicType === 'inst' ? ' (Inst Ver.)' : ''}
🎵 대안곡: (다른 실제 곡 제목) - (아티스트)${musicType === 'inst' ? ' (Inst)' : ''}
🔍 유튜브 검색어: (이 곡을 유튜브에서 찾기 위한 정확한 검색어${keywordSuffix})
📢 추천 효과음: (이 장면에 필요한 SFX)
---

[핵심 규칙]
- ★★★ 가장 중요: 반드시 실제로 존재하는 곡명과 아티스트를 추천하세요. 가상의 곡이나 존재하지 않는 곡을 지어내지 마세요.
- 추천곡 카테고리:
  1. 로열티 프리 곡: YouTube Audio Library, Epidemic Sound, Artlist 등에서 실제로 제공하는 곡
  2. 유명곡 레퍼런스: 분위기 참고용으로 실제 유명한 곡 (저작권 유의 표시)
- 100% 한글 작성 (곡명/아티스트는 원어 표기)
- 장면 전환 시 음악 전환 포인트도 제안
- 3~8개 장면으로 구분${musicType === 'inst' ? '\n- ★ 모든 추천곡은 반드시 인스트루멘탈(inst) 버전이어야 합니다. 보컬이 포함된 원곡을 추천할 경우 반드시 "(Inst Ver.)" 을 명시하세요.' : ''}`;
      })()
    },
    concept: {
      inputEl: document.getElementById('vps-concept-input'),
      outputEl: document.getElementById('vps-concept-output'),
      systemPrompt: (() => {
        const platform = document.getElementById('vps-concept-platform')?.value || 'youtube-long';
        return `당신은 영상 기획 전문가입니다. 주어진 아이디어를 기반으로 완성도 높은 영상 컨셉 기획서를 작성하세요.

[타겟 플랫폼] ${platform}

[출력 형식]
═══ 영상 컨셉 기획서 ═══

📌 영상 제목 (안):
(3개의 제목 후보)

🎯 타겟 시청자:
- 연령대:
- 관심사:
- 이 영상을 클릭할 이유:

🎨 컨셉 & 톤앤매너:
- 전체 분위기:
- 색감/비주얼:
- 말투/화법:

📋 영상 구성 (흐름):
(도입 → 전개 → 클라이맥스 → 마무리 순서로)

📐 벤치마킹 콘텐츠 가이드:
(특정 채널명을 추천하지 말고, 아래 형식으로 벤치마킹할 콘텐츠 유형을 안내)
- 벤치마킹 유형 1:
  콘텐츠 스타일: (예: "감성 일상 브이로그", "빠른 편집의 숏폼 꿀팁" 등)
  유튜브 검색어: (이런 스타일의 채널을 찾기 위한 검색 키워드)
  참고할 포인트: (이 스타일에서 벤치마킹할 구체적인 요소 — 편집, 구성, 썸네일 등)
- 벤치마킹 유형 2:
  콘텐츠 스타일: (다른 참고 스타일)
  유튜브 검색어: (검색 키워드)
  참고할 포인트: (벤치마킹 요소)

💡 차별화 포인트:
(경쟁 영상 대비 이 영상만의 강점)

⏱️ 추천 영상 길이:

[규칙]
- 100% 한글 작성
- ${platform} 사용자 특성에 맞게 최적화
- 현실적이고 실행 가능한 기획
- ★★★ 절대 특정 유튜브 채널명이나 URL을 언급하지 마세요. AI는 실제 채널을 알 수 없으므로, 존재하지 않는 채널을 지어낼 수 있습니다. 대신 "유튜브 검색어"를 제공하여 사용자가 직접 찾도록 안내하세요.`;
      })()
    }
  };
  return configs[tool] || null;
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
    else if (subjectType === 'scene' && UI.paramBgScene) selectedBg = UI.paramBgScene.value;

    let selectedCamAngle = 'none';
    if (subjectType === 'human' && UI.paramHumanCamAngle) selectedCamAngle = UI.paramHumanCamAngle.value;
    else if (subjectType === 'animal' && UI.paramAnimalCamAngle) selectedCamAngle = UI.paramAnimalCamAngle.value;
    else if (subjectType === 'scene' && UI.paramSceneCamAngle) selectedCamAngle = UI.paramSceneCamAngle.value;

    const config = {
      type: subjectType,
      style: UI.paramStyle ? UI.paramStyle.value : 'cinematic',
      angle: UI.paramAngle ? UI.paramAngle.value : '0',
      camAngle: selectedCamAngle,
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
        addLog(logs[i] || `> [L${i + 1}] Processing...`, 'success');
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

    updateStatusUI('lab', 'processing', '아키텍처 설계 중...');
    addLog(`$ prod --engineer --type=${config.type} --style=${config.style}`, true);
    const startTime = Date.now();

    // Construct Context-Aware Intent
    const povDescription = config.pov === 'arm-extended'
      ? 'Mode: First-Person Selfie. It looks like a photo taken with an outstretched arm. Intimate connection.'
      : config.pov === 'selfie'
        ? 'Mode: Mirror Selfie or Handheld Selfie. The subject is holding a smartphone or camera visibly in the frame, taking a picture (e.g., looking into a mirror).'
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
      } else if (config.pose === 'arm-extended') {
        poseDescription = 'SELFIE PERSPECTIVE: POV selfie style, the subject is holding the camera with one arm visibly extended out of the frame towards the lens, forearm reaching towards the camera, wide angle lens effect, perspective from a handheld camera in hand, close-up intimacy.';
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

    // --- 1. SET PromptContext OBJECTS (TYPE-AWARE) ---
    if (config.type === 'animal') {
      PromptContext.core = {
        subject: intent,
        type: config.type,
        pose: config.animalPose,
        dogBreed: config.dogBreed,
        catBreed: config.catBreed,
        animalPov: config.animalPov
      };
      PromptContext.visual = {
        style: config.style,
        background: bgDescription,
        camera: {
          angle: config.angle,
          camAngle: config.camAngle,
          perspective: povDescription,
          shot: config.animalShot,
          composition: config.animalComp
        }
      };
    } else if (config.type === 'scene') {
      PromptContext.core = {
        subject: intent,
        type: config.type,
        sceneEffect: config.sceneEffect,
        sceneLight: config.sceneLight,
        sceneRef: config.sceneRef
      };
      PromptContext.visual = {
        style: config.style,
        background: bgDescription,
        camera: {
          angle: config.angle,
          camAngle: config.camAngle,
          perspective: povDescription,
          shot: config.sceneShot,
          composition: config.sceneComp
        }
      };
    } else {
      // Human (default)
      const identityDescription = config.humanRef === 'strict'
        ? 'STRICTLY MAINTAIN the face and unique identity of the reference human.'
        : config.humanRef === 'selective'
          ? 'Focus on key facial features and vibe from reference, but allow minor variations.'
          : 'Generate a completely new and independent character identity.';

      PromptContext.core = {
        subject: intent,
        type: config.type,
        pose: poseDescription,
        facial: config.face,
        identity: identityDescription,
        outfit: outfitText
      };
      PromptContext.visual = {
        style: config.style,
        background: bgDescription,
        camera: {
          angle: config.angle,
          camAngle: config.camAngle,
          perspective: povDescription,
          shot: config.humanShot,
          composition: config.humanComp
        }
      };
    }

    // --- 2. ASSEMBLE FINAL PROMPT INTENT (TYPE-AWARE Natural Language Format) ---
    const getAngleText = (angleStr) => {
      const num = parseInt(angleStr, 10);
      if (num >= 0 && num <= 15) return `${num} degrees (Front View, straight on)`;
      if (num >= 16 && num <= 60) return `${num} degrees (Three-Quarter View)`;
      if (num >= 61 && num <= 120) return `${num} degrees (Side Profile)`;
      if (num >= 121 && num <= 240) return `${num} degrees (Back View, from behind)`;
      if (num >= 241 && num <= 344) return `${num} degrees (Reverse Side Profile, moving around the subject)`;
      if (num >= 345 && num <= 360) return `${num} degrees (Front View, straight on)`;
      return `${num} degrees`;
    };
    if (config.type === 'animal') {
      enrichedIntent = `
[CORE DESIGN SPECIFICATIONS]
- Subject Identity: ${PromptContext.core.subject}
- Subject Category: Animal
${PromptContext.core.dogBreed !== 'none' ? `- Dog Breed: ${PromptContext.core.dogBreed}` : ''}
${PromptContext.core.catBreed !== 'none' ? `- Cat Breed: ${PromptContext.core.catBreed}` : ''}
- Required Animal Pose: ${PromptContext.core.pose}
- Animal POV/Perspective: ${PromptContext.core.animalPov}

[VISUAL ENVIRONMENT]
- Visual Style: ${PromptContext.visual.style}
- Background: ${PromptContext.visual.background}
- Camera Angle (Horizontal Orbit): ${getAngleText(PromptContext.visual.camera.angle)}
${PromptContext.visual.camera.camAngle !== 'none' ? `- Cinematic Camera Angle: ${PromptContext.visual.camera.camAngle}` : ''}
${PromptContext.visual.camera.shot !== 'none' ? `- Camera Shot: ${PromptContext.visual.camera.shot}` : ''}
${PromptContext.visual.camera.composition !== 'none' ? `- Composition: ${PromptContext.visual.camera.composition}` : ''}
- Perspective: ${PromptContext.visual.camera.perspective}
      `;
    } else if (config.type === 'scene') {
      enrichedIntent = `
[CORE DESIGN SPECIFICATIONS]
- Subject Identity: ${PromptContext.core.subject}
- Subject Category: Scene/Object
- Commercial Effect: ${PromptContext.core.sceneEffect}
- Marketing Lighting: ${PromptContext.core.sceneLight}
- Reference Integrity: ${PromptContext.core.sceneRef === 'strict' ? 'STRICTLY PRESERVE the exact geometry, branding, and structural details.' : 'Allow artistic reinterpretation and creative changes.'}

[VISUAL ENVIRONMENT]
- Visual Style: ${PromptContext.visual.style}
- Background: ${PromptContext.visual.background}
- Camera Angle (Horizontal Orbit): ${getAngleText(PromptContext.visual.camera.angle)}
${PromptContext.visual.camera.camAngle !== 'none' ? `- Cinematic Camera Angle: ${PromptContext.visual.camera.camAngle}` : ''}
${PromptContext.visual.camera.shot !== 'none' ? `- Camera Shot: ${PromptContext.visual.camera.shot}` : ''}
${PromptContext.visual.camera.composition !== 'none' ? `- Composition: ${PromptContext.visual.camera.composition}` : ''}
- Perspective: ${PromptContext.visual.camera.perspective}
      `;
    } else if (config.type === 'human') {
      enrichedIntent = `
[CORE DESIGN SPECIFICATIONS]
- Subject Identity: ${PromptContext.core.subject}
- Character Category: ${PromptContext.core.type}
- Required Pose: ${PromptContext.core.pose}
- Facial Aesthetic: ${PromptContext.core.facial}
- Identity Strategy: ${PromptContext.core.identity}
- Outfit Strategy: ${PromptContext.core.outfit}

[VISUAL ENVIRONMENT]
- Visual Style: ${PromptContext.visual.style}
- Background: ${PromptContext.visual.background}
- Camera Angle (Horizontal 0-360): ${PromptContext.visual.camera.angle} degrees
${PromptContext.visual.camera.camAngle !== 'none' ? `- Vertical Camera Angle: ${PromptContext.visual.camera.camAngle}` : ''}
${PromptContext.visual.camera.shot !== 'none' ? `- Camera Shot: ${PromptContext.visual.camera.shot}` : ''}
${PromptContext.visual.camera.composition !== 'none' ? `- Composition: ${PromptContext.visual.camera.composition}` : ''}
- Perspective: ${PromptContext.visual.camera.perspective}
      `;
    } else if (config.type === 'none') {
      enrichedIntent = `
[CORE DESIGN SPECIFICATIONS]
- Overall Intent: ${intent}
- Subject/Category: Infer from the core intent description
- Requirement: Optimize purely based on the user's raw input, maintaining the core essence while adding professional image engineering details, depth, and cinematic quality.
      `;
    }

    enrichedIntent += `\n[FINAL DIRECTIVES]\n${config.chips}, ${config.custom || ''}`;

    let systemPrompt;
    if (config.type === 'animal') {
      systemPrompt = `You are a High-End AI Prompt Architect specialized in animal photography and illustration.
      TASK: Convert the [DESIGN SPECIFICATIONS] into a structured 4-paragraph English prompt for professional animal image generation.
      
      STRUCTURE RULES:
      1. Paragraph 1: **Subject & Style**. Describe the animal species/breed and the ${PromptContext.visual.style} aesthetic.
      2. Paragraph 2: **Physical Features**. Detail the animal's fur texture, markings, eye color, build, and breed-specific characteristics with extreme photographic detail.
      3. Paragraph 3: **Pose & Environment**. CRITICAL: The animal MUST be in a "${PromptContext.core.pose}" pose. Describe the pose with specific body positioning (legs, tail, head direction, ear position). Place the animal in the ${PromptContext.visual.background} with perfect spatial awareness.
      4. Paragraph 4: **Technical Architecture**. Detail pro-lighting (rim, volumetric), high-end camera specs, and 8k ray-tracing rendering.
      5. Footer: Add a "# Negative Prompts" section for professional-grade exclusion.

      STRICT RULES:
      - DO NOT explain anything. Start the prompt immediately.
      - DO NOT add titles like "Paragraph 1:". Use the bold headers directly.
      - HIGHEST PRIORITY: The animal MUST be "${PromptContext.core.pose}". This pose instruction must be followed with 100% fidelity and described in vivid detail.`;
    } else if (config.type === 'scene') {
      systemPrompt = `You are a High-End AI Prompt Architect specialized in product photography, commercial advertising, and cinematic landscape composition.
      TASK: Convert the [DESIGN SPECIFICATIONS] into a structured 4-paragraph English prompt for professional scene/object image generation.
      
      STRUCTURE RULES:
      1. Paragraph 1: **Subject & Style**. Describe the object/scene and the ${PromptContext.visual.style} aesthetic with commercial-grade precision.
      2. Paragraph 2: **Material & Surface Detail**. Detail textures, materials, reflections, surface quality, branding elements, and color accuracy with extreme photographic detail.
      3. Paragraph 3: **Environment & Composition**. Place the subject in ${PromptContext.visual.background}. Apply "${PromptContext.core.sceneEffect}" effects and "${PromptContext.core.sceneLight}" lighting concept with perfect spatial awareness.
      4. Paragraph 4: **Technical Architecture**. Detail pro-lighting (rim, volumetric, ${PromptContext.core.sceneLight}), high-end camera specs, and 8k ray-tracing rendering.
      5. Footer: Add a "# Negative Prompts" section for professional-grade exclusion.

      STRICT RULES:
      - DO NOT explain anything. Start the prompt immediately.
      - DO NOT add titles like "Paragraph 1:". Use the bold headers directly.
      - PRIORITY: Follow the lighting ("${PromptContext.core.sceneLight}") and effect ("${PromptContext.core.sceneEffect}") instructions with 100% fidelity.`;
    } else if (config.type === 'human') {
      systemPrompt = `You are a High-End AI Prompt Architect.
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
    } else if (config.type === 'none') {
      systemPrompt = `You are a Universal Prompt Engineer.
      TASK: Convert the [DESIGN SPECIFICATIONS] into an English structured prompt for high-fidelity image generation.
      
      Since no specific category was selected, you must strictly preserve the literal intent of the user's input. Avoid adding abstract "luxury," "futuristic," or "sophisticated" flowery prose unless specifically requested by the user. 
      
      STRUCTURE RULES:
      1. Paragraph 1: **Subject Formulation**. State the primary subject clearly based on the user's literal keywords. Define the core aesthetic (e.g., Flat, 3D, Minimalist, Sketch) derived ONLY from the intent.
      2. Paragraph 2: **Structural Features**. Describe the physical or graphic properties—shapes, line weights, color palette, and textures from the user's intent. Do not add complex lighting effects to simple 2D icons.
      3. Paragraph 3: **Contextual Layout**. Describe the positioning, background, and spatial arrangement. If the intent is an icon, keep the background clean (white/isolated) as typically expected for icons.
      4. Paragraph 4: **Technical Specification**. ADAPT based on the subject:
         - IF ICON/GUI: Use terms like "Vector quality," "Ultra-crisp edges," "Digital illustration," "Uniform line weight," "SVG style."
         - IF PHOTO/SCENE: Use "8k resolution," "Ray-tracing," "Photorealistic textures," "Cinema-grade lighting."
      5. Footer: Add a "# Negative Prompts" section.
      
      STRICT RULES:
      - DO NOT add abstract marketing fluff (Elegance, Innovation, High-tech) unless mentioned in the intent.
      - DO NOT explain anything. Start the prompt immediately.
      - PRIORITY: Maximum fidelity to the user's literal prompt while providing professional engineering depth.`;
    } else {
      // General Fallback
      systemPrompt = `You are a High-End AI Prompt Architect. Provide a professional 4-paragraph prompt based on [DESIGN SPECIFICATIONS].`;
    }

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

    // [하드코딩] 셀카 POV별 기형 / 기기 노출 분기 처리
    let selfieNegatives = "";
    if (config.pov === 'arm-extended') {
      // 1인칭 순수 시점 (스마트폰/기기 노출 금지 + 신체 기형 방지)
      selfieNegatives = "- Smartphone, Camera, Hand holding device, Mobile phone, Selfie stick, monopod, extra hands, multiple arms, floating limbs, disconnected arms, weird fingers, deformed arm, long arm, deformed phone, holding two phones";
    } else if (config.pov === 'selfie') {
      // 거울 셀카 등 (뷰어 상 기기 노출 허용, 신체 기형만 엄격 방지)
      selfieNegatives = "- extra hands, multiple arms, floating limbs, disconnected arms, weird fingers, deformed arm, long arm, holding two phones";
    }

    if (selfieNegatives) {
      if (data.result.includes('# Negative Prompts') || data.result.includes('# Negative Prompts:')) {
        data.result += `\n${selfieNegatives}`;
      } else {
        data.result += `\n\n# Negative Prompts\n${selfieNegatives}`;
      }
    }
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
    updateStatusUI('lab', 'idle', '아키텍처 설계 완료');

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
    updateStatusUI('lab', 'error', `치명적 오류: ${error.message}`);
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
        UI.subtitleOutput.dataset.rawResult = whisperData.result;
        UI.subtitleOutput.style.color = 'var(--fg)';
      }
      addLog('✓ 음성 분석 및 자막 추출 성공.', 'success');
      return;
    }

    const duration = UI.paramSubDuration ? UI.paramSubDuration.value : '15';
    const durationNum = parseInt(duration) || 15;

    // 템포(Tempo)에 따른 동적 블록 길이 계산 및 분위기 설정
    let secondsPerBlock = 5;
    let tempoDesc = "보통 속도 (한 블록당 약 5초)";
    if (tempo === 'slow') {
      secondsPerBlock = 7;
      tempoDesc = "느리고 감성적인 속도 (한 블록당 약 7~8초 배정, 대사를 길게 풀어서)";
    } else if (tempo === 'fast') {
      secondsPerBlock = 3;
      tempoDesc = "빠르고 경쾌한 속도 (한 블록당 2~3초 배정, 틱톡/릴스 숏폼처럼 짧고 타격감 있게)";
    }

    let blockCount = Math.max(1, Math.floor(durationNum / secondsPerBlock));

    // LLM 컨텍스트 한계 및 넘버링 무한 구조 붕괴(Loop) 방지를 위해 최대 블록 수를 10개로 제한
    if (blockCount > 10) {
      blockCount = 10;
      secondsPerBlock = Math.floor(durationNum / 10);
      tempoDesc = `긴 호흡의 스토리텔링 (한 블록당 약 ${secondsPerBlock}초씩, 총 ${blockCount}블록)`;
    }

    let timeJumpWarning = "";
    if (secondsPerBlock >= 10) {
      timeJumpWarning = `\n    (★타임코드 간격: 블록 하나의 시작~종료 시간 간격을 반드시 ${secondsPerBlock}초 이상으로 넓게 잡으세요.)`;
    }

    let formatInstruction = "";
    if (format === 'srt') {
      formatInstruction = `[출력 형식: SRT]${timeJumpWarning}
    (순번)
    (시작) --> (종료)
    (이 블록 안에서 ${secondsPerBlock}초 분량의 긴 대사를 작성)
    [빈 줄]`;
    } else if (format === 'script') {
      formatInstruction = `[출력 형식: 나레이션 대본]${timeJumpWarning}
    [시작 ~ 종료]
    (이 블록 안에서 ${secondsPerBlock}초 분량의 긴 대사를 작성)
    [빈 줄]`;
    } else {
      formatInstruction = `[출력 형식: 순수 텍스트]
    타임코드나 번호 없이, 단락으로 구분된 대본만 작성하세요.`;
    }

    // 초를 00:00:00 포맷으로 변환하여 AI에게 가장 명확한 한계선을 제시
    const targetMin = Math.floor(durationNum / 60).toString().padStart(2, '0');
    const targetSec = (durationNum % 60).toString().padStart(2, '0');
    const timeTargetStr = `00:${targetMin}:${targetSec}`;

    const systemPrompt = `당신은 ${context ? `'${context}' 말투의 ` : ''}한국인 유튜브 대본 작가입니다.

[임무] "${intent}" 주제로 ${durationNum}초(${timeTargetStr}까지) 분량의 한국어 영상 대본을 ${blockCount}블록으로 작성하세요.
${context ? `[말투] ${context}` : ''}

[핵심 규칙]
1. 100% 한글만 사용. 한자(漢字), 일본어, 러시아어 등 외국어 혼용 절대 금지.
2. 마지막 블록 종료 시간이 ${timeTargetStr}을 넘지 않도록 하세요.
3. ★가장 중요★ 절대 같은 내용을 반복하지 마세요! 매 블록마다 새로운 장면, 새로운 사건, 새로운 감정을 전개하세요.
   - 나쁜 예: 매 블록마다 "친구와의 대화는 재미있었어요" 같은 비슷한 말 반복
   - 좋은 예: 매 블록마다 시간 순서에 따라 다른 장면과 사건을 전개 (장면1 → 장면2 → 장면3... 절대 같은 장면 반복 금지)
4. 첫 블록은 "OOO은 좋은 주제입니다" 같은 식상한 서론 대신, 바로 장면 속으로 뛰어드세요.

${formatInstruction}`;

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
      UI.subtitleOutput.dataset.rawResult = data.result;
      UI.subtitleOutput.style.color = 'var(--fg)';
    }
    addLog('✓ 영상 자막 데이터 생성 완료.', 'success');

  } catch (err) {
    stopLoadingAnimation(UI.subtitleOutput);
    if (UI.subtitleOutput) {
      UI.subtitleOutput.innerText = `[자막 생성 실패: ${err.message}]\n서버의 일시적 오류이거나 타임아웃이 발생했습니다.\n다시 버튼을 눌러 재시도해주세요.`;
      UI.subtitleOutput.style.color = '#ff6b6b';
    }
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

// 프롬프트 JSON 복사 리스너
if (UI.jsonBtn) {
  UI.jsonBtn.addEventListener('click', () => {
    const el = UI.optimizedOutput;
    const text = el ? el.innerText : '';
    const isLoading = el && el._loadingInterval;

    if (text && !isLoading && !text.includes('대기 중') && !text.includes('설계 중')) {
      const parsedPrompt = {};
      const lines = text.split('\n');
      let currentKey = "general";

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Headers like **Heading**
        const headerMatch = trimmed.match(/^\*\*(.*?)\*\*$/);
        if (headerMatch) {
          currentKey = headerMatch[1].trim();
          parsedPrompt[currentKey] = "";
        }
        // Headers like # Negative Prompts or # Negative Prompts:
        else if (trimmed.startsWith('#')) {
          const colonIndex = trimmed.indexOf(':');
          if (colonIndex !== -1) {
            currentKey = trimmed.substring(1, colonIndex).trim();
            const val = trimmed.substring(colonIndex + 1).trim();
            parsedPrompt[currentKey] = val;
          } else {
            currentKey = trimmed.substring(1).trim();
            parsedPrompt[currentKey] = "";
          }
        }
        else {
          if (!parsedPrompt[currentKey]) parsedPrompt[currentKey] = "";
          parsedPrompt[currentKey] += (parsedPrompt[currentKey] ? " " : "") + trimmed;
        }
      });

      // 공백 정리
      Object.keys(parsedPrompt).forEach(key => {
        parsedPrompt[key] = parsedPrompt[key].trim();
      });

      // 기사 레퍼런스(aisparkup) 스타일 구조화 (Nested JSON Schema)
      const mappedJson = {
        "task": "Generate a professional high-fidelity image",
        "description": {},
        "constraints": {}
      };

      Object.keys(parsedPrompt).forEach(key => {
        const lKey = key.toLowerCase();

        if (lKey.includes('technical') || lKey.includes('architecture')) {
          mappedJson.constraints["technical_architecture"] = parsedPrompt[key];
        } else if (lKey.includes('negative')) {
          mappedJson.constraints["negative_prompts"] = parsedPrompt[key];
        } else if (lKey.includes('identity') || lKey.includes('style') || lKey.includes('subject')) {
          mappedJson.description["subject_and_style"] = parsedPrompt[key];
        } else if (lKey.includes('physical') || lKey.includes('material') || lKey.includes('detail')) {
          mappedJson.description["physical_attributes"] = parsedPrompt[key];
        } else if (lKey.includes('pose') || lKey.includes('context') || lKey.includes('environment') || lKey.includes('composition')) {
          mappedJson.description["scene_and_context"] = parsedPrompt[key];
        } else {
          // 기타 키워드 방어 로직
          mappedJson.description[key.replace(/ /g, '_').toLowerCase()] = parsedPrompt[key];
        }
      });

      navigator.clipboard.writeText(JSON.stringify(mappedJson, null, 2));

      const originalText = UI.jsonBtn.innerText;
      UI.jsonBtn.innerText = '완료!';
      setTimeout(() => UI.jsonBtn.innerText = originalText, 2000);
      addLog('✓ 프롬프트 세부 내용 파싱 후 JSON 형식으로 복사되었습니다.', 'success');
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


      // 파일명 및 확장자 동적 지정
      const currentFormat = UI.paramSubFormat ? UI.paramSubFormat.value : 'srt';
      const ext = currentFormat === 'srt' ? 'srt' : 'txt';
      let fileName = `subtitles.${ext}`;

      if (UI.fileNameDisplay && UI.fileNameDisplay.innerText !== 'None') {
        const baseName = UI.fileNameDisplay.innerText.substring(0, UI.fileNameDisplay.innerText.lastIndexOf('.')) || 'subtitles';
        fileName = `${baseName}.${ext}`;
      } else {
        fileName = `subtitles_${new Date().getTime()}.${ext}`;
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

// 자막 형식 변경 시 다운로드 버튼 UI 텍스트 실시간 반영
if (UI.paramSubFormat && UI.downloadSrtBtn) {
  UI.paramSubFormat.addEventListener('change', (e) => {
    const format = e.target.value;
    if (format === 'srt') {
      UI.downloadSrtBtn.innerText = '저장 (.srt)';
    } else {
      UI.downloadSrtBtn.innerText = '저장 (.txt)';
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

    // 🎨 AI Image Studio (Nano Banana 2) - 로그인 상태 연동
    const imageInput = document.getElementById('imagePromptInput');
    const imageBtn = document.getElementById('n8n-generate-btn');
    const ratioInput = document.getElementById('imageRatioInput');
    const imageUploadBtn = document.getElementById('image-upload-btn'); // 첨부 버튼
    if (imageInput) {
      imageInput.disabled = !isLoggedIn;
      imageInput.placeholder = isLoggedIn ? "그릴 내용을 상세하게 묘사해주세요 (예: 네온 사인이 빛나는 사이버펑크 도시...)" : "🔒 이미지 생성 기능을 사용하려면 로그인이 필요합니다.";
    }
    if (imageBtn) {
      imageBtn.disabled = !isLoggedIn;
      imageBtn.innerText = isLoggedIn ? "✨ 이미지 생성하기" : "🔒 로그인 필요";
    }
    if (ratioInput) ratioInput.disabled = !isLoggedIn;
    if (imageUploadBtn) {
      imageUploadBtn.disabled = !isLoggedIn;
      imageUploadBtn.style.opacity = isLoggedIn ? '1' : '0.5';
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
      if (typeof syncVpsSettingsFromServer === 'function') {
        syncVpsSettingsFromServer();
      }
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

// --------------------------------------------------------// 🖼️ 이미지 압축 유틸리티 (서버 과부하 방지를 위해 1MB 이하로 강제 압축)
async function compressImage(base64Str) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_WIDTH = 1024;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // 0.7 퀄리티로 압축 (용량을 획기적으로 줄임)
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = base64Str;
  });
}

// n8n 이미지 생성 통신 함수


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

// --- VPS 설정 자동 저장/복원 시스템 (로그인: 서버 DB / 비로그인: localStorage) ---
const VPS_SETTINGS_KEY = 'vps-settings';
const VPS_SETTING_IDS = [
  'vps-storyboard-style',
  'vps-shotlist-gear',
  'vps-seo-platform',
  'vps-bgm-mood',
  'vps-bgm-type',
  'vps-concept-platform',
  'param-sub-format',
  'param-sub-tempo',
  'param-sub-duration',
  'param-sub-duration-slider'
];

function collectVpsSettings() {
  const settings = {};
  VPS_SETTING_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) settings[id] = el.value;
  });
  return settings;
}

function applyVpsSettings(saved) {
  if (!saved) return;
  VPS_SETTING_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && saved[id] !== undefined) {
      if (el.tagName === 'SELECT') {
        const optionExists = Array.from(el.options).some(o => o.value === saved[id]);
        if (optionExists) el.value = saved[id];
      } else {
        el.value = saved[id];
      }
    }
  });
  // 슬라이더 ↔ 숫자 입력 동기화
  const durationSlider = document.getElementById('param-sub-duration-slider');
  const durationInput = document.getElementById('param-sub-duration');
  if (durationSlider && durationInput) {
    durationInput.value = durationSlider.value;
  }
}

// 디바운스: 설정 변경 시 0.5초 후 저장 (과도한 API 호출 방지)
let vpsSaveTimer = null;
function saveVpsSettings() {
  const settings = collectVpsSettings();

  // localStorage에도 항상 저장 (즉시 반영용)
  localStorage.setItem(VPS_SETTINGS_KEY, JSON.stringify(settings));

  // 로그인 상태면 서버에도 저장 (디바운스)
  if (USER_LOGGED_IN) {
    clearTimeout(vpsSaveTimer);
    vpsSaveTimer = setTimeout(async () => {
      try {
        await fetch('/api/vps-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        console.log('[VPS] Settings saved to server.');
      } catch (e) {
        console.warn('[VPS] Server save failed:', e.message);
      }
    }, 500);
  }
}

function restoreLocalVpsSettings() {
  try {
    const local = JSON.parse(localStorage.getItem(VPS_SETTINGS_KEY));
    if (local) {
      applyVpsSettings(local);
      console.log('[VPS] Settings restored from localStorage (Instant).');
    }
  } catch (e) {
    console.warn('[VPS] Failed to restore local settings:', e);
  }
}

async function syncVpsSettingsFromServer() {
  if (!USER_LOGGED_IN) return;
  try {
    const res = await fetch('/api/vps-settings');
    if (res.ok) {
      const serverSettings = await res.json();
      if (serverSettings) {
        applyVpsSettings(serverSettings);
        // 서버 동기화 후 localStorage 업데이트
        localStorage.setItem(VPS_SETTINGS_KEY, JSON.stringify(serverSettings));
        console.log('[VPS] Settings synced from server DB.');
      }
    }
  } catch (e) {
    console.warn('[VPS] Failed to sync settings from server:', e);
  }
}

// 각 VPS 셀렉트/입력에 자동 저장 리스너 등록
VPS_SETTING_IDS.forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', saveVpsSettings);
    el.addEventListener('input', saveVpsSettings);
  }
});

// 1. 페이지 로드 시 즉각 복원 (시각적으로 옵션이 나중에 바뀌는 깜빡임 완전 방지)
restoreLocalVpsSettings();

// --- 0-360도 수평 회전 자동 라벨링 부착 ---
window.updateAngleDescription = function (val) {
  const descEl = document.getElementById('angle-description');
  if (!descEl) return;
  const num = parseInt(val, 10);

  let title = "Front View (정면)";
  if (num >= 0 && num <= 15) title = "Front View (정면)";
  else if (num >= 16 && num <= 60) title = "Three-Quarter View (쿼터)";
  else if (num >= 61 && num <= 120) title = "Side Profile (측면)";
  else if (num >= 121 && num <= 240) title = "Back View (후면)";
  else if (num >= 241 && num <= 344) title = "Reverse Side (반대측면)";
  else if (num >= 345 && num <= 360) title = "Front View (정면)";

  const htmlContent = title;

  if (descEl.innerHTML !== htmlContent) {
    descEl.innerHTML = htmlContent;
  }
};

setTimeout(() => {
  const angleSlider = document.getElementById('param-angle');
  const angleInput = document.getElementById('angle-input');
  if (angleSlider) {
    angleSlider.addEventListener('input', (e) => window.updateAngleDescription(e.target.value));
  }
  if (angleInput) {
    angleInput.addEventListener('input', (e) => {
      if (angleSlider) angleSlider.value = e.target.value;
      window.updateAngleDescription(e.target.value);
    });
  }
}, 500);

let currentImageBase64 = null;

setTimeout(() => {
  const imageFileInput = document.getElementById('image-file-input');
  const imageRemoveBtn = document.getElementById('image-file-remove');
  const imagePreview = document.getElementById('image-upload-preview');
  const imagePreviewContainer = document.getElementById('image-preview-container');
  const promptTextarea = document.getElementById('imagePromptInput');

  if (imageFileInput) {
    // 📎 이미지 첨부 버튼 클릭 → 파일 선택 대화상자 연결 (CSP 준수)
    const imageUploadBtn = document.getElementById('image-upload-btn');
    if (imageUploadBtn) {
      imageUploadBtn.addEventListener('click', () => imageFileInput.click());
    }

    imageFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageSelection(e.target.files[0]);
      }
    });
  }

  if (promptTextarea) {
    promptTextarea.addEventListener('dragover', (e) => {
      e.preventDefault();
      promptTextarea.style.borderColor = 'var(--skills-cyan)';
      promptTextarea.style.background = 'rgba(0, 240, 255, 0.05)';
    });

    promptTextarea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      promptTextarea.style.borderColor = '';
      promptTextarea.style.background = '';
    });

    promptTextarea.addEventListener('drop', (e) => {
      e.preventDefault();
      promptTextarea.style.borderColor = '';
      promptTextarea.style.background = '';

      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        handleImageSelection(file);
      }
    });
  }

  function handleImageSelection(file) {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    // 📏 용량 체크 (10MB 제한)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`파일 용량이 너무 큽니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB / 최대: 10MB)\n더 작은 이미지를 선택해주세요.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      currentImageBase64 = e.target.result;
      if (imagePreview) {
        imagePreview.src = currentImageBase64;
      }
      if (imagePreviewContainer) {
        imagePreviewContainer.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }

  if (imageRemoveBtn) {
    imageRemoveBtn.addEventListener('click', () => {
      currentImageBase64 = null;
      if (imageFileInput) imageFileInput.value = '';
      if (imagePreview) {
        imagePreview.src = '';
      }
      if (imagePreviewContainer) {
        imagePreviewContainer.style.display = 'none';
      }
    });
  }
}, 500);

function calculateAspectRatio(base64Str) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.width / img.height;
      const supported = [
        { name: '1:1', val: 1 },
        { name: '3:4', val: 3 / 4 },
        { name: '4:3', val: 4 / 3 },
        { name: '9:16', val: 9 / 16 },
        { name: '16:9', val: 16 / 9 },
        { name: '21:9', val: 21 / 9 }
      ];
      let closest = supported[0];
      let minDiff = Math.abs(aspect - closest.val);
      for (const option of supported) {
        const diff = Math.abs(aspect - option.val);
        if (diff < minDiff) {
          minDiff = diff;
          closest = option;
        }
      }
      resolve(closest.name);
    };
    img.onerror = reject;
    img.src = base64Str;
  });
}

// n8n 이미지 생성 통신 함수
async function generateN8NImage() {
  if (!USER_LOGGED_IN) {
    const confirmLogin = await showSystemConfirm('🔒 권한 확인', '이미지 생성 서비스는 로그인이 필요합니다. 로그인 페이지로 이동할까요?', 'info');
    if (confirmLogin) window.location.href = '/auth/google';
    return;
  }

  const promptValue = document.getElementById('imagePromptInput').value;
  let ratioValue = document.getElementById('imageRatioInput')?.value || "3:4";
  const resultImage = document.getElementById('generatedImage');
  const placeholder = document.getElementById('image-placeholder');
  const btn = document.getElementById('n8n-generate-btn');
  const choicePanel = document.getElementById('post-gen-choices');

  // UI 초기화: 이전 결과물(이미지 및 선택지)을 모두 숨기고 로딩상태 준비
  if (resultImage) {
    resultImage.style.display = "none";
    resultImage.src = ""; 
  }
  if (choicePanel) choicePanel.style.display = "none";
  if (placeholder) placeholder.style.display = "block";

  if (!promptValue) { alert("그릴 내용을 입력해주세요!"); return; }

  // 자동 비율 계산
  if (ratioValue === 'auto' && currentImageBase64) {
    try { ratioValue = await calculateAspectRatio(currentImageBase64); } catch (e) { ratioValue = "3:4"; }
  }

  // [초강력 정제 로직] 데이터 뭉치 속에서 진짜 프롬프트만 찾아냅니다. (JSON 및 객체 형태 완벽 대응)
  const promptValueFinal = document.getElementById('imagePromptInput')?.value
    || document.getElementById('promptInput')?.value
    || promptValue;

  let cleanPrompt = (promptValueFinal || "").trim();

  // 🛡️ [마크다운 태그 제거] ```json 형태가 복사되어 들어오는 경우 대비
  cleanPrompt = cleanPrompt.replace(/```(json|srt|vtt)?\n?/gi, '').replace(/```/g, '').trim();

  if (cleanPrompt.startsWith('{')) {
    try {
      const p = JSON.parse(cleanPrompt);

      // 🎯 [전략] 기획서(description/constraints) 내용이 있으면 제목(task/prompt)은 무조건 무시
      let bestContent = "";
      if (p.description) {
        if (typeof p.description === 'object') {
          bestContent += Object.values(p.description).filter(v => typeof v === 'string').join('\n\n');
        } else {
          bestContent += p.description;
        }
      }
      if (p.constraints) {
        if (typeof p.constraints === 'object') {
          bestContent += '\n\n' + Object.values(p.constraints).filter(v => typeof v === 'string').join('\n\n');
        } else {
          bestContent += '\n\n' + p.constraints;
        }
      }

      // 추출된 묘사 글이 넉넉하면 그것을 사용하고, 없다면 차선책 필드 사용
      if (bestContent.trim().length > 20) {
        cleanPrompt = bestContent.trim();
      } else {
        cleanPrompt = p.prompt || p.task || p.instruction || cleanPrompt;
      }

      console.log("🛡️ [Prompt Final Cleaned]:", cleanPrompt.substring(0, 100) + "...");
    } catch (e) {
      console.warn("[Prompt Clean] JSON parse failed, using raw text.");
    }
  }

  // 0. 이미지 처리 (압축 제거 - 원본 전송)
  let processedBase64 = currentImageBase64;

  // UI 초기화 (프로그레스 바 시작)
  const orgBtnText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> AI 이미지 생성 중...';
  btn.disabled = true;

  // 프로그레스 바 영역 생성/업데이트
  let progressContainer = document.getElementById('image-progress-container');
  if (!progressContainer) {
    placeholder.innerHTML = `
      <div id="image-progress-container" style="width: 80%; margin: 0 auto; text-align: center;">
        <div id="image-progress-text" style="font-size: 0.85rem; margin-bottom: 8px; color: var(--skills-cyan);">🚀 서버로 요청을 보내는 중...</div>
        <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; position: relative;">
          <div id="image-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #0cebeb, #20e3b2, #29ffc6); transition: width 0.3s ease; box-shadow: 0 0 10px var(--skills-cyan);"></div>
        </div>
        <div id="image-progress-tip" style="font-size: 0.7rem; margin-top: 10px; color: var(--fg-dim); opacity: 0.6;">예상 소요 시간: 약 45초~60초 (중간에 멈춘 것처럼 보여도 서버는 작동 중입니다)</div>
      </div>
    `;
    progressContainer = document.getElementById('image-progress-container');
  }

  const bar = document.getElementById('image-progress-bar');
  const statusTxt = document.getElementById('image-progress-text');

  // 가짜 프로그레스 애니메이션 (실제 응답 올 때까지 서서히 상승)
  let progress = 0;
  const progressInterval = setInterval(() => {
    if (progress < 90) {
      progress += (90 - progress) * 0.05; // 로그 곡선으로 부드럽게 상승
      if (bar) bar.style.width = `${progress}%`;
      if (progress > 30 && statusTxt) statusTxt.innerText = "🤖 n8n 워크플로우 가동 (Cloud AI 호출 중)...";
      if (progress > 60 && statusTxt) statusTxt.innerText = "🎨 AI 모델 연산 중... 거의 다 되었습니다!";
      if (progress > 85 && statusTxt) statusTxt.innerText = "📦 결과 이미지 수신 대기 중...";
    }
  }, 1500);

  // 📏 비율 정제 로직 (Kie.ai 500 에러 방지)
  const getCleanAspectRatio = (raw) => {
    const validMap = {
      '1:1': '1:1', '16:9': '16:9', '9:16': '9:16',
      '3:4': '3:4', '4:3': '4:3', '21:9': '21:9'
    };
    return validMap[raw] || 'auto';
  };

  const finalizedRatio = getCleanAspectRatio(ratioValue);

  const requestBody = {
    prompt: cleanPrompt,
    aspect_ratio: finalizedRatio
  };

  // 이미지 헤더가 있을 때만 image 필드 추가
  if (processedBase64 && processedBase64.startsWith("data:image")) {
    const base64Raw = processedBase64.split(',')[1];
    requestBody.image = base64Raw;
    requestBody.imageBase64 = base64Raw;
  }

  console.log("[Final Payload]:", { ...requestBody, image: requestBody.image ? "(Image Data)" : null });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 180초 타임아웃

  try {
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });
    clearTimeout(timeoutId);

    clearInterval(progressInterval);
    const responseData = await response.json();

    if (!response.ok) {
      console.error("n8n 에러:", responseData);
      alert(`[생성 실패] ${responseData.error || '통신 오류'}`);
      throw new Error(responseData.error);
    }

    if (bar) bar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = "✨ 생성 완료! 이미지를 표시합니다.";

    const findImageInObject = (obj) => {
      if (!obj) return null;
      if (typeof obj === 'string' && (obj.startsWith('http://') || obj.startsWith('https://'))) {
        if (obj.match(/\.(jpeg|jpg|gif|png|webp)/i) || obj.includes('kie.ai/') || obj.includes('redpandaai.co')) return obj;
      }
      if (typeof obj === 'object') {
        const specialKeys = ['param', 'resultJson', 'data'];
        for (let key of specialKeys) {
          if (obj[key] && typeof obj[key] === 'string' && obj[key].trim().startsWith('{')) {
            try {
              const found = findImageInObject(JSON.parse(obj[key]));
              if (found) return found;
            } catch (e) { }
          }
        }
        if (Array.isArray(obj)) {
          for (let item of obj) {
            const found = findImageInObject(item);
            if (found) return found;
          }
        } else {
          for (let key in obj) {
            const found = findImageInObject(obj[key]);
            if (found) return found;
          }
        }
      }
      return null;
    };

    const finalImageUrl = findImageInObject(responseData.data);

    if (!finalImageUrl) {
      console.error("최종 이미지 추출 실패. 응답 원본:", responseData);
      throw new Error("n8n 응답에서 이미지 URL을 찾지 못했습니다.");
    }

    resultImage.src = finalImageUrl;
    resultImage.onload = () => {
      resultImage.style.display = "block";
      const ph = document.getElementById('image-placeholder');
      if (ph) ph.style.display = "none";
      
      // 🎬 [이미지 생성 후 선택지] 영상 제작 여부 확인 패널 노출
      const choicePanel = document.getElementById('post-gen-choices');
      const btnVideo = document.getElementById('btn-choice-video');
      const btnImage = document.getElementById('btn-choice-image');

      if (choicePanel && btnVideo && btnImage) {
        // choicePanel.style.display = "flex"; // 요청에 의한 비활성화
        
        // 영상 만들기 선택 시
        btnVideo.onclick = () => {
          document.getElementById('kling-video-studio').scrollIntoView({ behavior: 'smooth' });
          setVideoImageRef(finalImageUrl, 'start');
          choicePanel.style.display = "none"; // 이동 후 숨김
        };

        // 이미지만 사용 선택 시
        btnImage.onclick = () => {
          choicePanel.style.display = "none";
        };
      }
    };

  } catch (error) {
    clearInterval(progressInterval);
    console.error("n8n 통신 에러:", error);
    placeholder.innerHTML = `<div style="color: var(--status-error); padding: 20px;">❌ 생성 중 오류가 발생했습니다.<br><small>${error.message}</small></div>`;
  } finally {
    btn.innerHTML = orgBtnText;
    btn.disabled = false;
  }
}

// n8n 이미지 생성 버튼 이벤트 리스너 (CSP 준수: inline onclick 대신 JS에서 연결)
const n8nBtn = document.getElementById('n8n-generate-btn');
if (n8nBtn) {
  n8nBtn.addEventListener('click', generateN8NImage);
}

/* ==========================================================================
   KLING 3.0 VIDEO STUDIO LOGIC
   ========================================================================== */

let videoRefStartImage = null;
let videoRefEndImage = null;

// 비디오 생성을 위한 이미지 참조 설정 (type: 'start' or 'end')
function setVideoImageRef(url, type = 'start') {
  const previewImg = document.getElementById(`video-${type}-preview`);
  const placeholder = document.getElementById(`${type}-placeholder`);
  const clearBtn = document.getElementById(`clear-${type}-ref`);
  
  if (type === 'start') videoRefStartImage = url;
  else videoRefEndImage = url;

  if (previewImg && placeholder && clearBtn) {
    previewImg.src = url;
    previewImg.style.display = "block";
    placeholder.style.display = "none";
    clearBtn.style.display = "flex";
  }
}

// 이미지 참조 해제 함수
function clearVideoFrame(type) {
  if (type === 'start') videoRefStartImage = null;
  else videoRefEndImage = null;

  const previewImg = document.getElementById(`video-${type}-preview`);
  const placeholder = document.getElementById(`${type}-placeholder`);
  const clearBtn = document.getElementById(`clear-${type}-ref`);

  if (previewImg && placeholder && clearBtn) {
    previewImg.src = "";
    previewImg.style.display = "none";
    placeholder.style.display = "block";
    clearBtn.style.display = "none";
  }
}

// 해제 버튼 리스너 연결
const clearStartBtn = document.getElementById('clear-start-ref');
if (clearStartBtn) clearStartBtn.addEventListener('click', (e) => { e.stopPropagation(); clearVideoFrame('start'); });
const clearEndBtn = document.getElementById('clear-end-ref');
if (clearEndBtn) clearEndBtn.addEventListener('click', (e) => { e.stopPropagation(); clearVideoFrame('end'); });

// 파일 업로드 처리 함수
function handleVideoFrameUpload(input, type) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    alert("파일 크기는 10MB 이하만 가능합니다.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    setVideoImageRef(e.target.result, type);
  };
  reader.readAsDataURL(file);
}

// 파일 입력 리스너 연결
const startFileInput = document.getElementById('video-start-file');
if (startFileInput) startFileInput.addEventListener('change', (e) => handleVideoFrameUpload(e.target, 'start'));
const endFileInput = document.getElementById('video-end-file');
if (endFileInput) endFileInput.addEventListener('change', (e) => handleVideoFrameUpload(e.target, 'end'));

// 드래그 앤 드롭 기능 추가
function setupVideoDragDrop(boxId, type) {
  const box = document.getElementById(boxId);
  if (!box) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    box.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    box.addEventListener(eventName, () => {
      box.style.borderColor = 'var(--skills-purple)';
      box.style.background = 'rgba(147, 112, 219, 0.05)';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    box.addEventListener(eventName, () => {
      box.style.borderColor = 'var(--border-strong)';
      box.style.background = 'rgba(0,0,0,0.2)';
    }, false);
  });

  box.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files[0]) {
      handleVideoFrameUpload({ files }, type);
    }
  }, false);

  // 클릭 이벤트 추가 (이미지 있으면 확대, 없으면 업로드)
  box.addEventListener('click', () => {
    const currentImg = (type === 'start') ? videoRefStartImage : videoRefEndImage;
    if (currentImg) {
      openImageViewer(currentImg);
    } else {
      const fileInput = document.getElementById(`video-${type}-file`);
      if (fileInput) fileInput.click();
    }
  });
}

setupVideoDragDrop('video-start-box', 'start');
setupVideoDragDrop('video-end-box', 'end');

// Kling 3.0 비디오 생성 함수
async function generateKlingVideo() {
  const btn = document.getElementById('generate-video-btn');
  const promptInput = document.getElementById('videoPromptInput');
  const durationInput = document.getElementById('videoDurationInput');
  const modeInput = document.getElementById('videoModeInput');
  const placeholder = document.getElementById('video-placeholder');
  const videoElement = document.getElementById('generatedVideo');
  
  if (!promptInput.value.trim()) {
    alert("비디오 동작/연출 프롬프트를 입력해주세요.");
    return;
  }

  const orgBtnText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> AI 비디오 생성 중...';
  btn.disabled = true;

  // 비디오 프로그레스 UI
  placeholder.innerHTML = `
    <div id="video-progress-container" style="width: 80%; text-align: center;">
      <div id="video-progress-text" style="font-size: 0.85rem; margin-bottom: 12px; color: #818cf8;">🚀 비디오 생성 요청을 보냈습니다...</div>
      <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden;">
        <div id="video-progress-bar" style="width: 5%; height: 100%; background: linear-gradient(90deg, #6366f1, #c084fc); transition: width 0.4s ease;"></div>
      </div>
      <div style="font-size: 0.7rem; margin-top: 12px; color: var(--fg-muted);">Kling 3.0 모델이 연산을 시작했습니다 (약 5분 소요)</div>
    </div>
  `;
  videoElement.style.display = "none";

  const bar = document.getElementById('video-progress-bar');
  const statusTxt = document.getElementById('video-progress-text');
  
  let progress = 5;
  const progressInterval = setInterval(() => {
    if (progress < 95) {
      progress += (95 - progress) * 0.03;
      if (bar) bar.style.width = `${progress}%`;
      if (progress > 30 && statusTxt) statusTxt.innerText = "🎬 비디오 프레임 렌더링 중...";
      if (progress > 60 && statusTxt) statusTxt.innerText = "✨ 화질 개선 및 AI 업스케일링 중...";
      if (progress > 85 && statusTxt) statusTxt.innerText = "📦 최종 영상 인코딩 중...";
    }
  }, 2000);

  const videoPrompt = promptInput.value.trim();
  if (!videoPrompt) {
    alert("비디오 동작/연출 프롬프트를 입력해 주세요.");
    btn.innerHTML = orgBtnText;
    btn.disabled = false;
    return;
  }

  const imageUrls = [];
  if (videoRefStartImage) imageUrls.push(videoRefStartImage);
  if (videoRefEndImage) imageUrls.push(videoRefEndImage);

  const payload = {
    generate_video: true,         // 불리언 (n8n === true 대응)
    generate_video_str: "true",   // 문자열
    generate_video_num: 1,        // 숫자
    direct_video: true,
    is_video: true,
    video: true,
    is_direct_video: true,
    prompt: videoPrompt,
    video_duration: durationInput.value,
    video_mode: modeInput.value,
    // 단일 이미지(Start Frame) 전용으로 단순화
    image: imageUrls[0] ? (imageUrls[0].startsWith("data:") ? imageUrls[0].split(',')[1] : imageUrls[0]) : null,
    image_url: imageUrls[0] || null,
    start_image: imageUrls[0] || null,
    image_urls: imageUrls[0] ? [imageUrls[0]] : null
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000); // 10분 (600초) 타임아웃으로 확장

  try {
    const response = await fetch('/api/generate-image', { // 이미지 생성과 동일한 엔드포인트 사용 (n8n에서 flag로 분기)
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload)
    });
    clearTimeout(timeoutId);

    clearInterval(progressInterval);
    const result = await response.json();

    if (!response.ok) throw new Error(result.error || "비디오 생성에 실패했습니다.");

    // n8n 응답에서 비디오 URL 추출 (강화된 수색 로직 + 문자열 내 JSON 파싱)
    const findVideoInObject = (obj, keyName = '') => {
      if (!obj) return null;
      
      // 문자열인 경우
      if (typeof obj === 'string') {
        const lowerStr = obj.trim().toLowerCase();
        const lowerKey = keyName.toLowerCase();

        // 1. URL 여부 확인 및 비디오 관련 키워드 확인
        if (lowerStr.startsWith('http://') || lowerStr.startsWith('https://')) {
          if (lowerStr.match(/\.(mp4|mov|webm|mkv|avi|flv)/i) || 
              lowerKey.includes('video') || 
              lowerKey.includes('url') || 
              lowerStr.includes('kling-video') || 
              lowerStr.includes('kie.ai/') ||
              lowerStr.includes('result')) {
            return obj;
          }
        }

        // 2. 문자열 내의 JSON 형태 수색 (escaped JSON 대응)
        if (lowerStr.startsWith('{') || lowerStr.startsWith('[')) {
          try {
            const parsed = JSON.parse(obj);
            const foundInParsed = findVideoInObject(parsed, keyName);
            if (foundInParsed) return foundInParsed;
          } catch (e) { /* ignore parse error */ }
        }
      }
      
      // 객체나 배열인 경우 재귀 탐색
      if (typeof obj === 'object') {
        for (let key in obj) {
          const found = findVideoInObject(obj[key], key);
          if (found) return found;
        }
      }
      return null;
    };

    console.log("n8n Raw Response:", result); // 디버깅을 위한 로그 추가
    const videoUrl = findVideoInObject(result.data || result);

    if (!videoUrl) {
      console.error("비디오 URL 추출 실패:", result);
      throw new Error("응답에서 비디오 URL을 찾을 수 없습니다.");
    }

    if (bar) bar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = "✨ 생성 완료!";

    videoElement.src = videoUrl;
    videoElement.style.display = "block";
    placeholder.style.display = "none";

  } catch (error) {
    clearInterval(progressInterval);
    console.error("Video Gen Error:", error);
    placeholder.innerHTML = `<div style="color: #ff5555; padding: 20px;">❌ 비디오 생성 오류<br><small>${error.message}</small></div>`;
  } finally {
    btn.innerHTML = orgBtnText;
    btn.disabled = false;
  }
}

// 이벤트 리스너 연결
const genVideoBtn = document.getElementById('generate-video-btn');
if (genVideoBtn) {
  genVideoBtn.addEventListener('click', generateKlingVideo);
}

// 🔍 이미지 크게 보기 기능 (CSP 준수 및 강제 표시 로직)
const imageUploadPreview = document.getElementById('image-upload-preview');
const generatedImageResult = document.getElementById('generatedImage');
const viewerModal = document.getElementById('image-viewer-modal');
const viewerImage = document.getElementById('viewer-image-src');

const openImageViewer = (src) => {
  if (!src || src === window.location.href) return;
  if (viewerModal && viewerImage) {
    viewerImage.src = src;
    viewerModal.classList.add('active');
    // 인라인 스타일 강제 부여로 CSS 충돌 방지
    viewerModal.style.display = 'flex';
    viewerModal.style.opacity = '1';
    viewerModal.style.pointerEvents = 'auto';
  }
};

// 모달 닫기 로직 (외부 배경 클릭 시)
if (viewerModal) {
  viewerModal.addEventListener('click', () => {
    viewerModal.classList.remove('active');
    viewerModal.style.display = 'none';
    viewerModal.style.opacity = '0';
    viewerModal.style.pointerEvents = 'none';
  });
}

// 이미지들에 클릭 리스너 연결
if (imageUploadPreview) {
  imageUploadPreview.addEventListener('click', () => openImageViewer(imageUploadPreview.src));
}
if (generatedImageResult) {
  generatedImageResult.addEventListener('click', () => openImageViewer(generatedImageResult.src));
}