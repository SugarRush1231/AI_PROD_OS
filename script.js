const promptCatalog = globalThis.PromptCatalog;
const promptRules = globalThis.PromptRules;
promptCatalog.mount(document, promptRules.opticsFields);

let csrfHeaderToken;
let currentAccountId;
let mediaStorageEnabled = false;
let mediaTab = 'recent';
let savedMedia = [];
let mediaQuota;
const recentMedia = [];
const CURRENT_MEDIA_LIMIT = 30;

function apiFetch(url, options = {}) {
  if (!options.method || ['GET', 'HEAD'].includes(options.method)) return fetch(url, options);
  const headers = new Headers(options.headers);
  if (csrfHeaderToken) headers.set('X-CSRF-Token', csrfHeaderToken);
  return fetch(url, { ...options, headers });
}

function initMediaLibrary() {
  document.getElementById('media-library').hidden = false;
  document.getElementById('media-library-link').hidden = false;
  renderMediaLibrary();
}

function recordGeneratedMedia(kind, url, token, blob) {
  if (!currentAccountId || !url || recentMedia.some(entry => entry.url === url)) return;
  recentMedia.unshift({ kind, url, token, blob, created_at: new Date().toISOString() });
  if (recentMedia.length > CURRENT_MEDIA_LIMIT) recentMedia.pop();
  if (mediaTab === 'recent') renderMediaLibrary();
}

function clearMediaView() {
  document.getElementById('media-library-grid').replaceChildren();
  recentMedia.length = 0;
  savedMedia = [];
  mediaQuota = undefined;
  mediaTab = 'recent';
}

function mediaSize(bytes) {
  return `${(Number(bytes) / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;
}

async function archiveRequest(path, options) {
  const res = await apiFetch(`/api/media-archive${path}`, options);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '보관함 요청에 실패했습니다.');
  return data;
}

function mediaAction(label, handler) {
  const button = document.createElement('button');
  button.className = 'btn-skills secondary';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => handler(button));
  return button;
}

function renderMediaLibrary(message) {
  const list = mediaTab === 'recent' ? recentMedia : savedMedia;
  const grid = document.getElementById('media-library-grid');
  const status = document.getElementById('media-library-status');
  document.getElementById('media-recent-tab').setAttribute('aria-pressed', String(mediaTab === 'recent'));
  document.getElementById('media-saved-tab').setAttribute('aria-pressed', String(mediaTab === 'saved'));
  document.getElementById('media-library-quota').textContent = mediaTab === 'saved' && mediaQuota
    ? `${mediaSize(savedMedia.reduce((total, item) => total + Number(item.bytes), 0))} / ${mediaSize(mediaQuota.limit)} · ${savedMedia.length}/${mediaQuota.maxItems}개` : '';
  status.textContent = message || (mediaTab === 'recent'
    ? list.length ? '페이지를 닫거나 로그아웃하면 이 기록이 사라집니다.' : '이번 세션에 생성한 이미지와 영상이 여기에 표시됩니다.'
    : !mediaStorageEnabled ? '보관용 스토리지가 아직 연결되지 않았습니다.' : list.length ? '' : '아직 보관한 파일이 없습니다.');
  grid.replaceChildren();
  for (const entry of list) {
    const card = document.createElement('article');
    card.className = 'media-library-card';
    const isVideo = entry.kind === 'video';
    const title = isVideo ? '생성 영상' : '생성 이미지';
    const media = document.createElement(isVideo ? 'video' : 'img');
    media.src = entry.id ? `/api/media-archive/${entry.id}/file` : entry.url;
    if (isVideo) {
      media.controls = true;
      media.playsInline = true;
      media.preload = 'none';
    } else {
      media.loading = 'lazy';
      media.alt = title;
      media.tabIndex = 0;
      const open = () => openImageViewer(media.src);
      media.addEventListener('click', open);
      media.addEventListener('keydown', event => { if (event.key === 'Enter') open(); });
    }
    const content = document.createElement('div');
    content.className = 'media-library-entry';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const time = document.createElement('time');
    time.dateTime = entry.created_at;
    time.textContent = new Date(entry.created_at).toLocaleString() + (entry.id ? ` · ${mediaSize(entry.bytes)}` : '');
    const actions = document.createElement('div');
    actions.className = 'media-library-actions';
    if (entry.id) {
      actions.append(mediaAction('삭제', async button => {
        if (!await showSystemConfirm('파일 삭제', '보관함에서 이 파일을 삭제할까요?', 'danger')) return;
        button.disabled = true;
        try {
          await archiveRequest(`/${entry.id}`, { method: 'DELETE' });
          savedMedia = savedMedia.filter(item => item.id !== entry.id);
          for (const recent of recentMedia) if (recent.savedId === entry.id) recent.savedId = undefined;
          renderMediaLibrary('보관 파일을 삭제했습니다.');
        } catch (error) { status.textContent = error.message; button.disabled = false; }
      }));
    } else if (mediaStorageEnabled && (entry.token || entry.blob)) {
      const save = mediaAction(entry.savedId ? '보관됨' : '보관', async button => {
        button.disabled = true;
        button.textContent = '보관 중…';
        try {
          if (entry.blob && entry.blob.size > 50 * 1024 * 1024) throw new Error('영상은 50 MiB까지 보관할 수 있습니다.');
          const data = entry.blob ? new FormData() : JSON.stringify({ token: entry.token });
          if (entry.blob) data.append('video', entry.blob, 'generated-video');
          const item = await archiveRequest(entry.blob ? '/upload-video' : '', {
            method: 'POST', body: data, headers: entry.blob ? undefined : { 'Content-Type': 'application/json' }
          });
          entry.savedId = item.id;
          if (mediaTab === 'saved') await showSavedMedia();
          else renderMediaLibrary('보관한 파일에 저장했습니다.');
        } catch (error) {
          status.textContent = error.message;
          button.disabled = false;
          button.textContent = '보관';
        }
      });
      save.disabled = Boolean(entry.savedId);
      actions.append(save);
    }
    content.append(heading, time, actions);
    card.append(media, content);
    grid.append(card);
  }
}

async function showSavedMedia() {
  mediaTab = 'saved';
  renderMediaLibrary(mediaStorageEnabled ? '보관 파일을 불러오는 중…' : undefined);
  if (!mediaStorageEnabled) return;
  try {
    mediaQuota = await archiveRequest('');
    savedMedia = mediaQuota.items;
    if (mediaTab === 'saved') renderMediaLibrary();
  } catch (error) { if (mediaTab === 'saved') renderMediaLibrary(error.message); }
}

document.getElementById('media-recent-tab').addEventListener('click', () => {
  mediaTab = 'recent';
  renderMediaLibrary();
});
document.getElementById('media-saved-tab').addEventListener('click', showSavedMedia);
window.addEventListener('pagehide', clearMediaView);
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

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
  paramMood: document.getElementById('param-mood'),
  paramPalette: document.getElementById('param-palette'),
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
function renderPalettePreview() {
  const preview = document.getElementById('param-palette-preview');
  const colors = promptCatalog.paletteColors(UI.paramPalette.value);
  const swatches = colors.map(color => {
    const swatch = document.createElement('span');
    swatch.style.backgroundColor = color;
    swatch.title = color;
    return swatch;
  });
  preview.replaceChildren(...swatches);
  preview.hidden = swatches.length === 0;
}

UI.paramPalette.addEventListener('change', renderPalettePreview);

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
      if (!res.ok) throw new Error('프리셋 조회 실패');
      this.data = await res.json();
      this.render();
    } catch (err) {
      addLog('! 서버 프리셋을 불러오지 못했습니다.', 'error');
    }
  },

  resetForm() {
    this.activeId = null;

    // 1. 셀렉트 박스류 초기화
    const defaults = {
      paramType: 'human',
      paramStyle: 'none',
      paramMood: 'none',
      paramPalette: 'none',
      paramAngle: '0',
      angleInput: '0',
      paramHumanCamAngle: 'none',
      paramAnimalCamAngle: 'none',
      paramSceneCamAngle: 'none',
      paramBgHuman: 'none',
      paramBgAnimal: 'none',
      paramBgScene: 'none',
      paramPose: 'relaxed',
      paramPov: 'standard',
      paramHumanRef: 'creative',
      paramFace: 'natural',
      paramOutfit: 'none',
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
    renderPalettePreview();

    // 2. 인풋 및 칩 초기화
    if (UI.paramCustom) UI.paramCustom.value = '';
    if (UI.intentInput) UI.intentInput.value = '';
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    if (window.LightingLab) window.LightingLab.reset();

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
        paramMood: UI.paramMood?.value,
        paramPalette: UI.paramPalette?.value,
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
        activeChips: activeChips, // 칩 정보 추가
        // 03 조명 · 04 카메라/광학 (구조화 상태)
        ...(window.LightingLab ? (({ lighting, optics, panels }) => ({ lighting, optics, lightingPanels: panels }))(window.LightingLab.getState()) : {})
      }
    };

    try {
      const response = await apiFetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('프리셋 저장 실패');
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
      const response = await apiFetch(`/api/presets/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('프리셋 삭제 실패');
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

    UI.paramMood.value = 'none';
    UI.paramPalette.value = 'none';
    // 1. 기본적인 파라미터 복구
    Object.entries(p.params).forEach(([key, val]) => {
      const el = UI[key];
      if (key !== 'activeChips' && key !== 'lighting' && key !== 'optics' && key !== 'lightingPanels' && el && val !== undefined) {
        el.value = val;
        if (key === 'paramType' || key.startsWith('paramBg')) {
          el.dispatchEvent(new Event('change'));
        }
      }
    });
    renderPalettePreview();

    // 1-b. 조명/광학 복구 (없는 구버전 프리셋은 기본값으로 마이그레이션)
    if (window.LightingLab) window.LightingLab.load(p.params.lighting, p.params.optics, p.params.lightingPanels);

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

// 생성 이후 다른 파라미터가 바뀌면 '재생성 필요' 표시
document.querySelectorAll('.lab-params-area, .lab-header-area').forEach(area => {
  ['change', 'input'].forEach(ev => area.addEventListener(ev, () => window.LightingLab && window.LightingLab.markDirty()));
});
document.querySelector('.lab-params-area')?.addEventListener('click', (e) => { if (e.target.closest('.chip')) window.LightingLab && window.LightingLab.markDirty(); });

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
        'ONLINE': 'var(--ok-fg)',    // 정상 (녹색)
        'DEGRADED': 'var(--warn-fg)',  // 불안정 (주황색)
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
    text.style.color = 'var(--ok-fg)';
  } else if (status === 'error') {
    dot.classList.add('error');
    text.innerText = message || 'System Error';
    text.style.color = 'var(--err-fg)';
  } else if (status === 'warning') {
    dot.classList.add('warning');
    text.innerText = message || 'Warning';
    text.style.color = 'var(--warn-fg)';
  } else {
    dot.classList.add('idle');
    text.innerText = message || 'System Ready';
    text.style.color = 'var(--ok-fg)';
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
      let userInput = inputEl.value.trim();

      // 🔗 파이프라인 연결: 입력이 비어 있으면 컨셉 주제를 가져오고,
      //    컨셉 기획서가 이미 있으면 다음 단계(스토리보드/숏리스트/BGM/SEO)에 맥락으로 함께 전달해 톤·내용 일관성 유지
      const conceptInput = document.getElementById('vps-concept-input')?.value.trim() || '';
      const conceptOut = document.getElementById('vps-concept-output')?.dataset.rawResult || '';
      if (!userInput && tool !== 'concept' && conceptInput) {
        userInput = conceptInput;
        inputEl.value = conceptInput;
      }

      if (!userInput) {
        inputEl.style.borderColor = '#ff6b6b';
        setTimeout(() => inputEl.style.borderColor = '', 2000);
        return;
      }

      btn.disabled = true;
      startLoadingAnimation(outputEl, '생성 중');
      updateStatusUI('vps', 'processing', `${tool.toUpperCase()} 생성 중...`);

      try {
        const res = await apiFetch('/api/engineer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: (tool !== 'concept' && conceptOut)
              ? `${userInput}\n\n[참고: 앞 단계 컨셉 기획서 요약 — 톤·타깃·핵심 메시지를 일관되게 유지]\n${conceptOut.slice(0, 1500)}`
              : userInput,
            systemPrompt
          })
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


// ===== 드롭다운 확장 선택지의 영문 설명 (AI에게 구체적으로 전달) =====
// L1~L3 상태 표시 (실제 요청 이벤트 기반)
function setLabLayer(i, st, text) {
  const layer = UI.layers && UI.layers[i];
  if (!layer) return;
  layer.dataset.st = st;
  const status = layer.querySelector('.layer-status');
  layer.classList.toggle('active', st === 'run' || st === 'done');
  layer.style.borderColor = st === 'done' ? 'var(--skills-cyan)' : st === 'fail' ? '#ff5555' : '';
  if (!status) return;
  status.style.color = st === 'fail' ? '#ff5555' : '';
  status.innerHTML = st === 'run' ? '<span class="spinner-icon"></span>'
    : st === 'done' ? '<svg viewBox="0 0 24 24" width="12" height="12" stroke="#10b981" stroke-width="3" fill="none" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    : '';
  status.append(document.createTextNode(text ? ` ${text}` : ''));
}


// ===== 수평 회전 각도 → 8방향 (이미지 모델은 숫자 각도를 못 알아들어서 말로 변환) =====
function angleToDirection(val) {
  const n = ((parseInt(val, 10) || 0) % 360 + 360) % 360;
  const dirs = [
    { ko: '정면', en: 'front view, facing the camera directly' },
    { ko: '앞 3/4 (왼쪽)', en: 'three-quarter front view, body turned toward the left of the frame' },
    { ko: '옆모습 (왼쪽)', en: 'side profile view, facing the left edge of the frame' },
    { ko: '뒤 3/4 (왼쪽)', en: 'three-quarter back view, turned away toward the left, face partly hidden' },
    { ko: '뒷모습', en: 'back view, facing away from the camera, back of the head visible' },
    { ko: '뒤 3/4 (오른쪽)', en: 'three-quarter back view, turned away toward the right, face partly hidden' },
    { ko: '옆모습 (오른쪽)', en: 'side profile view, facing the right edge of the frame' },
    { ko: '앞 3/4 (오른쪽)', en: 'three-quarter front view, body turned toward the right of the frame' }
  ];
  return dirs[Math.round(n / 45) % 8];
}

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
      outputMode: document.getElementById('param-output-mode')?.value || 'zimage',
      style: promptCatalog.describe('param-style', UI.paramStyle?.value || 'none'),
      angle: UI.paramAngle ? UI.paramAngle.value : '0',
      camAngle: selectedCamAngle,
      bg: selectedBg,
      pose: promptCatalog.describe('param-pose', UI.paramPose ? UI.paramPose.value : 'dynamic'),
      pov: UI.paramPov ? UI.paramPov.value : 'standard',
      face: promptCatalog.describe('param-face', UI.paramFace ? UI.paramFace.value : 'natural'),
      outfit: promptCatalog.describe('param-outfit', UI.paramOutfit ? UI.paramOutfit.value : 'reference'),
      humanRef: UI.paramHumanRef ? UI.paramHumanRef.value : 'strict',
      dogBreed: UI.paramDogBreed ? UI.paramDogBreed.value : 'none',
      catBreed: UI.paramCatBreed ? UI.paramCatBreed.value : 'none',
      animalPose: promptCatalog.describe('param-animal-pose', UI.paramAnimalPose ? UI.paramAnimalPose.value : 'none'),
      animalPov: UI.paramAnimalPov ? UI.paramAnimalPov.value : 'none',
      sceneEffect: promptCatalog.describe('param-scene-effect', UI.paramSceneEffect ? UI.paramSceneEffect.value : 'none'),
      sceneLight: promptCatalog.describe('param-scene-light', UI.paramSceneLight ? UI.paramSceneLight.value : 'commercial'),
      sceneRef: UI.paramSceneRef ? UI.paramSceneRef.value : 'strict',
      humanShot: promptCatalog.describe('param-human-shot', UI.paramHumanShot ? UI.paramHumanShot.value : 'none'),
      humanComp: promptCatalog.describe('param-human-comp', UI.paramHumanComp ? UI.paramHumanComp.value : 'none'),
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
        delete l.dataset.st;
        l.classList.remove('active');
        l.style.borderColor = '';
        const status = l.querySelector('.layer-status');
        if (status) {
          status.innerHTML = '대기 중';
          status.style.color = '';
        }
      }
    });

    // L1~L3 상태는 실제 요청 이벤트에 맞춰 갱신: L1 설계 사양 조립 → L2 LLM 요청 → L3 제약 검증
    setLabLayer(0, 'run', '사양 조립 중…');
    addLog('> [L1] Context & Alignment Processing...', 'success');

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
    const povDescription = promptRules.perspective(config.pov, promptCatalog.describe('param-pov', config.pov));

    const poseDescription = config.type === 'human' ? promptRules.pose(config.pose) : config.pose || 'none';
    const outfitText = config.type === 'human' ? promptRules.outfit(config.outfit) : config.outfit || 'none';

    // Randomly pick 4 unique poses
    const selectedBoothPoses = [...promptRules.boothPoses]
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);

    const bgDescription = promptRules.background(config.bg, selectedBoothPoses);

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
      enrichedIntent += `
        Character Pose: ${poseDescription}
        Facial Style: ${config.face}
        ${config.humanShot !== 'none' ? `Camera Shot: ${config.humanShot}` : ''}
        ${config.humanComp !== 'none' ? `Composition: ${config.humanComp}` : ''}
        
        ### IDENTITY CONTROL ###
        Identity Strategy: ${promptRules.humanIdentity(config.humanRef)}

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
        Reference Integrity Strategy: ${promptRules.objectIntegrity(config.sceneRef)}
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
      const identityDescription = promptRules.humanIdentity(config.humanRef);

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
      const d = angleToDirection(angleStr);
      return `${d.en} (${d.ko})`;
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
- Camera Angle (Horizontal Orbit): ${getAngleText(PromptContext.visual.camera.angle)}
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

    if (config.type !== 'none') {
      const mood = promptCatalog.describe('param-mood', UI.paramMood.value);
      const palette = promptCatalog.describe('param-palette', UI.paramPalette.value);
      enrichedIntent += promptRules.artDirection(mood, palette);
    }
    const finalDirectives = [config.chips, config.custom].map(x => (x || '').trim()).filter(Boolean).join(', ');
    if (finalDirectives) enrichedIntent += `\n[FINAL DIRECTIVES]\n${finalDirectives}`;
    // 03 조명 · 04 카메라/광학 → 구조화 제약 (L1~L3 및 최종 프롬프트에 반영)
    const loSer = window.LightingLab ? window.LightingLab.serialize() : { text: '', keys: [] };
    if (loSer.text) {
      enrichedIntent += `\n[LIGHTING & OPTICS CONSTRAINTS]\n${loSer.lightingText ? '- ' + loSer.lightingText + '\n' : ''}${loSer.opticsText ? '- ' + loSer.opticsText + '\n' : ''}- Must keep exactly: ${loSer.keys.join(', ') || '(as written above)'}\n`;
      addLog(`  - Lighting/Optics: ${loSer.keys.join(', ') || 'custom'}`, 'secondary');
    }
    enrichedIntent = enrichedIntent.replace(/\n\s*\n\s*\n+/g, '\n\n');
    setLabLayer(0, 'done', '완료');

    let systemPrompt = promptRules.systemPrompt(config.type, config.outputMode, PromptContext);
    if (config.outputMode === 'zimage') enrichedIntent += `\n[CONSTRAINTS]\n${promptRules.imageConstraints(config.pov)}`;

    if (loSer.text) {
      systemPrompt += promptRules.opticsInstruction(loSer.keys, config.outputMode);
    }
    setLabLayer(1, 'run', 'LLM 요청 중…');
    addLog('> [L2] Style Consistency Refinement (LLM request)...', 'success');
    const apiPromise = apiFetch('/api/engineer', {
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
    if (typeof data.result !== 'string' || !data.result.trim()) {
      throw new Error('프롬프트 응답이 비어 있습니다.');
    }
    const endTime = Date.now();
    setLabLayer(1, 'done', '응답 수신');
    setLabLayer(2, 'run', '제약 검증 중…');
    addLog('> [L3] Semantic Expansion & Constraint Check...', 'success');

    const selfieNegatives = promptRules.negativePrompt(config.pov, config.outputMode);
    if (selfieNegatives) {
      if (data.result.includes('# Negative Prompts') || data.result.includes('# Negative Prompts:')) {
        data.result += `\n${selfieNegatives}`;
      } else {
        data.result += `\n\n# Negative Prompts\n${selfieNegatives}`;
      }
    }
    const duration = endTime - startTime;

    // L3: 핵심 조명/광학 제약이 응답에 빠졌으면 결정적으로 보강
    if (window.LightingLab) {
      const chk = window.LightingLab.enforce(data.result, config.outputMode);
      data.result = chk.text;
      setLabLayer(2, 'done', chk.appended ? `보강 적용 (${chk.missing.length})` : '검증 완료');
      if (chk.appended) addLog(`  ! 누락된 제약 보강: ${chk.missing.join(', ')}`, 'secondary');
    } else {
      setLabLayer(2, 'done', '완료');
    }

    stopLoadingAnimation(UI.optimizedOutput);
    if (UI.optimizedOutput) {
      UI.optimizedOutput.innerText = data.result;
      UI.optimizedOutput.style.color = 'var(--fg)';
    }
    addLog(`✓ 프롬프트 추론 성공. [유형: ${config.type.toUpperCase()}]`, true);
    if (window.LightingLab) window.LightingLab.markGenerated();
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
      if (layer && layer.dataset.st !== 'done') {
        layer.dataset.st = 'fail';
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

      const whisperRes = await apiFetch('/api/whisper', {
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

    const res = await apiFetch('/api/engineer', {
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

      if (window.LightingLab) {
        const lo = window.LightingLab.toJSON();
        if (lo.lighting) mappedJson.lighting = lo.lighting;
        if (lo.optics) mappedJson.camera_optics = lo.optics;
        if (lo.text) mappedJson.constraints["lighting_and_optics"] = lo.text;
      }

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

    // 🎨 AI Image Studio (Kie z-image) - 로그인 상태 연동
    const imageInput = document.getElementById('imagePromptInput');
    const imageBtn = document.getElementById('image-generate-btn');
    const ratioInput = document.getElementById('imageRatioInput');
    const imageUploadBtn = document.getElementById('image-upload-btn'); // 첨부 버튼
    if (imageInput) {
      imageInput.disabled = !isLoggedIn;
      seedreamEditor.element.contentEditable = String(isLoggedIn && !seedreamEditor.element.hidden);
      imageInput.placeholder = isLoggedIn ? "그릴 내용을 상세하게 묘사해주세요 (예: 네온 사인이 빛나는 사이버펑크 도시...)" : "🔒 이미지 생성 기능을 사용하려면 로그인이 필요합니다.";
    }
    if (imageBtn) {
      imageBtn.disabled = !isLoggedIn;
      imageBtn.innerText = isLoggedIn
        ? (document.getElementById('image-provider').value === 'spicy' ? '편집 견적 확인' : '이미지 생성')
        : '로그인 필요';
    }
    if (ratioInput) ratioInput.disabled = !isLoggedIn;

    // 🎬 영상 생성·원클릭: 로그인 + 승인 계정만
    const paidOk = isLoggedIn && window.CAN_USE_PAID !== false;
    const videoBtn = document.getElementById('generate-video-btn');
    if (videoBtn) {
      videoBtn.disabled = !paidOk;
      videoBtn.innerText = !isLoggedIn ? '🔒 로그인 필요' : (paidOk ? '🎬 AI 비디오 생성하기' : '🔒 승인된 계정 전용');
    }
    const videoPrompt = document.getElementById('videoPromptInput');
    if (videoPrompt) videoPrompt.disabled = !paidOk;
    videoReferenceEditor.element.contentEditable = String(paidOk && videoRefImages.length > 0);
    const apBtn = document.getElementById('ap-run-btn');
    if (apBtn) {
      apBtn.disabled = !isLoggedIn;
      apBtn.innerText = isLoggedIn ? '▶ 전체 자동 제작' : '🔒 로그인 필요';
    }
    const apVideo = document.getElementById('ap-make-video');
    if (apVideo) {
      apVideo.disabled = !paidOk;
      if (!paidOk) apVideo.checked = false;
      if (apVideo.parentElement) apVideo.parentElement.title = paidOk ? '' : '영상 생성은 승인된 계정만 사용할 수 있습니다.';
    }
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

    window.CAN_USE_PAID = data.canUsePaid !== false;
    csrfHeaderToken = data.csrfToken;
    currentAccountId = data.user?.id;
    mediaStorageEnabled = data.mediaLibraryEnabled === true;
    if (data.canUseSpicy) initSpicyImageControls(data.user.id);
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
      initMediaLibrary();
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

// 이미지 생성 통신 함수 (서버 /api/generate-image → Kie z-image, 실패 시 Pollinations)


// ---------------------------------------------------------------------------------------------------
// System Status Toggle Logic
document.querySelectorAll('a[href="#system-status"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    if (UI.systemStatusSection) {
      const isCurrentlyActive = UI.systemStatusSection.classList.contains('active');
      if (isCurrentlyActive) {
        UI.systemStatusSection.classList.remove('active');
        anchor.scrollIntoView({ behavior: (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth' });
      } else {
        UI.systemStatusSection.classList.add('active');
        UI.systemStatusSection.scrollIntoView({ behavior: (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth' });
      }
    }
  });
});

// 초기 실행
checkAuthStatus();
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  try {
    const response = await apiFetch('/logout', { method: 'POST' });
    if (!response.ok) throw new Error('로그아웃 실패');
    clearMediaView();
    csrfHeaderToken = undefined;
    location.assign('/');
  } catch {
    alert('로그아웃 요청을 완료하지 못했습니다. 페이지를 새로고침해 주세요.');
  }
});

// ✅ 히어로 "시작하기" 버튼 → Prompt Lab으로 스크롤
const heroStartBtn = document.getElementById('hero-start-btn');
if (heroStartBtn) {
  heroStartBtn.addEventListener('click', () => {
    document.getElementById('prompt-lab').scrollIntoView({ behavior: (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth' });
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
        const response = await apiFetch('/api/vps-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        if (!response.ok) throw new Error('서버 설정 저장 실패');
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
    } else addLog('! 서버 설정을 불러오지 못했습니다.', 'error');
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

  const title = angleToDirection(num).ko;

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
const spicyReferenceImages = [];
const SPICY_REF_MAX = 10;
const SPICY_REF_BYTES = 10 * 1024 * 1024;

function createReferenceEditor(inputId, format, pattern) {
  const input = document.getElementById(inputId);
  const editor = document.createElement('div');
  editor.className = 'lab-textarea reference-editor';
  editor.hidden = true;
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('aria-label', input.placeholder);
  editor.dataset.placeholder = input.placeholder;
  input.after(editor);
  let refs = [];
  let caret;

  function makeToken(src, index) {
    const pill = document.createElement('span');
    pill.className = 'reference-chip inline-reference';
    pill.contentEditable = 'false';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    pill.append(img, format(index + 1));
    return pill;
  }

  function render() {
    editor.replaceChildren();
    let offset = 0;
    for (const match of input.value.matchAll(pattern)) {
      editor.append(input.value.slice(offset, match.index));
      const index = Number(match[1]) - 1;
      editor.append(refs[index] ? makeToken(refs[index], index) : match[0]);
      offset = match.index + match[0].length;
    }
    editor.append(input.value.slice(offset));
    caret = null;
  }

  function rememberCaret() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
      caret = selection.getRangeAt(0).cloneRange();
    }
  }

  function syncPrompt() {
    function read(node) {
      if (node.nodeType === Node.TEXT_NODE || node.classList?.contains('inline-reference')) return node.textContent;
      if (node.nodeName === 'BR') return node.nextSibling ? '\n' : '';
      const text = Array.from(node.childNodes, read).join('');
      return ['DIV', 'P'].includes(node.nodeName) && node !== editor && node.previousSibling ? '\n' + text : text;
    }
    input.value = read(editor);
  }

  function insert(node, isReference = false) {
    if (input.disabled) return;
    const range = caret?.cloneRange() || document.createRange();
    if (!caret || !editor.contains(range.commonAncestorContainer)) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    if (isReference) {
      const leading = range.cloneRange();
      leading.setStart(editor, 0);
      const spacer = document.createTextNode(' ');
      const fragment = document.createDocumentFragment();
      if (/\S$/.test(leading.toString())) fragment.append(' ');
      fragment.append(node, spacer);
      range.insertNode(fragment);
      range.setStartAfter(spacer);
    } else {
      range.insertNode(node);
      range.setStartAfter(node);
    }
    range.collapse(true);
    editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    rememberCaret();
    syncPrompt();
  }

  document.addEventListener('selectionchange', rememberCaret);
  editor.addEventListener('input', syncPrompt);
  editor.addEventListener('paste', event => {
    event.preventDefault();
    if (!event.clipboardData) return;
    rememberCaret();
    insert(document.createTextNode(event.clipboardData.getData('text/plain')));
  });
  editor.addEventListener('dragover', event => event.preventDefault());
  editor.addEventListener('drop', event => event.preventDefault());
  input.addEventListener('input', () => { if (!editor.hidden) render(); });
  return {
    update(nextRefs, active) {
      refs = [...nextRefs];
      input.hidden = active;
      editor.hidden = !active;
      editor.contentEditable = String(active && !input.disabled);
      if (active) render();
    },
    insertReference(index) {
      if (!refs[index]) return;
      insert(makeToken(refs[index], index), true);
    },
    remap(nextRefs) {
      input.value = input.value.replace(pattern, (token, number) => {
        const old = refs[Number(number) - 1];
        if (!old) return token;
        const index = nextRefs.indexOf(old);
        return index < 0 ? '' : format(index + 1);
      });
    },
    element: editor
  };
}

const seedreamEditor = createReferenceEditor('imagePromptInput', number => `@image ${number}`,
  /(?:@image\s*|\bImage\s+)(\d+)\b/gi);

function renderSeedreamRefs(active) {
  seedreamEditor.update(spicyReferenceImages.map(ref => ref.src), active);
  const chips = document.getElementById('image-ref-chips');
  document.getElementById('spicy-reference-count').textContent = `${spicyReferenceImages.length}/${SPICY_REF_MAX}`;
  chips.hidden = !active || !spicyReferenceImages.length;
  chips.replaceChildren();
  if (!active) return;
  spicyReferenceImages.forEach(({ src }, index) => {
    const chip = document.createElement('span');
    chip.className = 'reference-chip';
    const insert = document.createElement('button');
    insert.type = 'button';
    insert.title = '프롬프트에 참고 이미지 삽입';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    insert.append(img, `@image ${index + 1}`);
    insert.addEventListener('click', () => seedreamEditor.insertReference(index));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `참고 이미지 ${index + 1} 제거`);
    remove.addEventListener('click', () => {
      spicyReferenceImages.splice(index, 1);
      seedreamEditor.remap(spicyReferenceImages.map(ref => ref.src));
      renderSeedreamRefs(true);
    });
    chip.append(insert, remove);
    chips.append(chip);
  });
}

let spicyFileBatch = Promise.resolve();
function addSeedreamFiles(files) {
  const selected = Array.from(files);
  spicyFileBatch = spicyFileBatch.then(async () => {
    let total = spicyReferenceImages.reduce((sum, ref) => sum + ref.size, 0);
    let skipped = 0;
    for (const file of selected) {
      if (!/^image\/(?:jpeg|png|webp|gif)$/.test(file.type) || !file.size ||
          spicyReferenceImages.length >= SPICY_REF_MAX || total + file.size > SPICY_REF_BYTES) {
        skipped++;
        continue;
      }
      const src = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onerror = () => resolve(null);
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      if (!src || spicyReferenceImages.some(ref => ref.src === src)) { skipped++; continue; }
      spicyReferenceImages.push({ src, size: file.size });
      total += file.size;
    }
    if (skipped) alert(`${skipped}개 파일을 추가하지 못했습니다. JPG·PNG·WebP·GIF, 최대 10장, 전체 10 MiB까지 첨부할 수 있습니다.`);
    renderSeedreamRefs(document.getElementById('image-provider').value === 'spicy');
  });
}

seedreamEditor.element.addEventListener('drop', event => addSeedreamFiles(event.dataTransfer.files));

(() => {
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
        if (document.getElementById('image-provider').value === 'spicy') addSeedreamFiles(e.target.files);
        else handleImageSelection(e.target.files[0]);
        e.target.value = '';
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
})();

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

// 이미지 생성 통신 함수 (서버 /api/generate-image → Kie z-image, 실패 시 Pollinations)
let spicyImageStorageKey;

function initSpicyImageControls(ownerId) {
  const controls = document.getElementById('spicy-image-controls');
  const provider = document.getElementById('image-provider');
  if (!controls || !provider) return;
  spicyImageStorageKey = `spicy-image-pending:${ownerId}`;
  controls.hidden = false;
  provider.addEventListener('change', () => {
    const isSpicy = provider.value === 'spicy';
    document.getElementById('spicy-output-settings').hidden = !isSpicy;
    document.getElementById('spicy-image-wallet').hidden = !isSpicy;
    document.getElementById('spicy-reference-count').hidden = !isSpicy;
    document.getElementById('image-reference-panel').classList.toggle('is-seedream', isSpicy);
    document.getElementById('image-generate-btn').textContent = isSpicy ? '편집 견적 확인' : '이미지 생성';
    document.getElementById('image-engine-status').textContent = isSpicy ? 'Seedream 5.5 Edit' : 'API Active';
    seedreamEditor.element.dataset.placeholder = '바꿀 내용을 입력하세요. 아래 참고 이미지 번호를 눌러 프롬프트에 넣을 수 있어요.';
    seedreamEditor.element.setAttribute('aria-labelledby', 'image-prompt-label');
    document.getElementById('image-file-input').multiple = isSpicy;
    document.getElementById('image-preview-container').style.display = !isSpicy && currentImageBase64 ? 'block' : 'none';
    renderSeedreamRefs(isSpicy);
    document.getElementById('image-reference-hint').textContent = isSpicy
      ? '최대 10장 · 전체 10 MiB'
      : '기본 모델은 텍스트 프롬프트로 생성합니다.';
    if (isSpicy) refreshSpicyBalance();
  });
  provider.value = 'spicy';
  provider.dispatchEvent(new Event('change'));
}

async function spicyImageRequest(path, body) {
  const options = body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  };
  const response = await apiFetch(`/api/spicy-image/${path}`, {
    ...options, signal: AbortSignal.timeout(path === 'quote' ? 120000 : 25000)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'SpicyAPI 요청에 실패했습니다.'), {
    status: response.status, code: data.code
  });
  return data;
}

async function refreshSpicyBalance() {
  const balance = document.getElementById('spicy-image-balance');
  const prepaidBalance = document.getElementById('spicy-prepaid-balance');
  try {
    const { available, prepaid } = await spicyImageRequest('balance');
    balance.textContent = `USD ${available}`;
    prepaidBalance.hidden = prepaid == null || Number(prepaid) === Number(available);
    if (!prepaidBalance.hidden) prepaidBalance.textContent = `충전 잔액 USD ${prepaid}`;
  } catch {
    balance.textContent = '조회 실패';
    prepaidBalance.hidden = true;
  }
}

async function runSpicyEdit(prompt, images, ratio, status) {
  let pending = await spicyImageRequest('pending');
  pending ||= JSON.parse(localStorage.getItem(spicyImageStorageKey) || 'null');
  if (!pending) {
    if (!prompt) throw new Error('편집 프롬프트와 참고 이미지를 입력해 주세요.');
    if (status) status.textContent = '참고 이미지 업로드 및 견적 조회 중...';
    const quote = await spicyImageRequest('quote', { prompt, images, ratio });
    const expires = new Date(quote.expiresAt).toLocaleTimeString();
    const ratioNote = ratio !== 'auto' && quote.ratio !== ratio ? ' 모델의 기본 화면 비율을 적용합니다.' : '';
    const confirmed = await showSystemConfirm('Seedream 5.5 Edit',
      `예상 비용 USD ${quote.cost} · 견적 만료 ${expires}.${ratioNote} 이 이미지 편집을 제출할까요?`, 'info');
    if (!confirmed) return null;
    pending = { token: quote.token };
    localStorage.setItem(spicyImageStorageKey, JSON.stringify(pending));
  } else if (!pending.taskId) {
    const confirmed = await showSystemConfirm('기존 Seedream 요청 확인',
      '이전에 확인한 견적의 접수 상태를 같은 요청으로 확인할까요?', 'info');
    if (!confirmed) return null;
  }

  try {
    if (!pending.taskId) {
      pending = await spicyImageRequest('create', pending);
      localStorage.setItem(spicyImageStorageKey, JSON.stringify(pending));
    }
  } catch (error) {
    if ([400, 402, 422].includes(error.status) || error.code === '40901') {
      localStorage.removeItem(spicyImageStorageKey);
    }
    if (error.code === 'replay_expired') {
      const resolved = await showSystemConfirm('이전 Seedream 요청 확인',
        'SpicyAPI 콘솔에서 이전 요청의 접수 여부와 비용을 확인했다면 복구 기록을 정리할까요?', 'danger');
      if (resolved) {
        await spicyImageRequest('clear-expired', { token: pending.token });
        localStorage.removeItem(spicyImageStorageKey);
        return null;
      }
    }
    throw error;
  }

  if (status) status.textContent = 'Seedream 이미지 편집 중...';
  const until = Date.now() + 120000;
  for (let delay = 2000; Date.now() < until; delay = Math.min(delay * 1.5, 10000)) {
    await new Promise(resolve => setTimeout(resolve, delay));
    const task = await spicyImageRequest(`task/${encodeURIComponent(pending.taskId)}`);
    if (task.state === 'queued' || task.state === 'running' || task.pending) continue;
    localStorage.removeItem(spicyImageStorageKey);
    if (task.state === 'succeeded' && task.url) return { data: {
      url: task.url, provider: 'spicy:seedream-5.5-edit', archiveToken: task.archiveToken
    } };
    const reason = task.code === 'content_rejected' ? '콘텐츠가 거절되었습니다.' : '이미지 편집에 실패했습니다.';
    const cost = task.settled && task.cost != null ? ` · 최종 비용 USD ${task.cost}` : '';
    throw new Error(`${reason}${task.error ? ' ' + task.error : ''}${cost}`);
  }
  throw new Error('편집이 진행 중입니다. 생성 버튼을 다시 누르면 기존 작업의 결과를 조회합니다.');
}

async function generateImage() {
  if (!USER_LOGGED_IN) {
    const confirmLogin = await showSystemConfirm('🔒 권한 확인', '이미지 생성 서비스는 로그인이 필요합니다. 로그인 페이지로 이동할까요?', 'info');
    if (confirmLogin) window.location.href = '/auth/google';
    return;
  }

  const promptValue = document.getElementById('imagePromptInput').value;
  let ratioValue = document.getElementById('imageRatioInput')?.value || "3:4";
  const resultImage = document.getElementById('generatedImage');
  const placeholder = document.getElementById('image-placeholder');
  const btn = document.getElementById('image-generate-btn');
  if (btn.disabled) return;
  const useSpicy = Boolean(spicyImageStorageKey && document.getElementById('image-provider')?.value === 'spicy');
  const resumeSpicy = useSpicy && localStorage.getItem(spicyImageStorageKey);
  const choicePanel = document.getElementById('post-gen-choices');

  // UI 초기화: 이전 결과물(이미지 및 선택지)을 모두 숨기고 로딩상태 준비
  if (resultImage) {
    resultImage.style.display = "none";
    resultImage.src = ""; 
  }
  if (choicePanel) choicePanel.style.display = "none";
  if (placeholder) placeholder.style.display = "block";

  if (!promptValue && !resumeSpicy && !useSpicy) { alert("그릴 내용을 입력해주세요!"); return; }

  // 자동 비율 계산
  if (!useSpicy && ratioValue === 'auto' && currentImageBase64) {
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

      if (!useSpicy) console.log("🛡️ [Prompt Final Cleaned]:", cleanPrompt.substring(0, 100) + "...");
    } catch (e) {
      console.warn("[Prompt Clean] JSON parse failed, using raw text.");
    }
  }

  // UI 초기화 (프로그레스 바 시작)
  const orgBtnText = btn.innerHTML;
  const providerSelect = document.getElementById('image-provider');
  providerSelect.disabled = true;
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
      if (!useSpicy && statusTxt) {
        if (progress > 30) statusTxt.innerText = "🤖 AI 이미지 모델 호출 중...";
        if (progress > 60) statusTxt.innerText = "🎨 AI 모델 연산 중... 거의 다 되었습니다!";
        if (progress > 85) statusTxt.innerText = "📦 결과 이미지 수신 대기 중...";
      }
    }
  }, 1500);

  // 📏 비율 정제 로직 (서버에서 모델별 지원 비율로 다시 매핑)
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 180초 타임아웃

  try {
    const editWithReferences = async () => {
      await spicyFileBatch;
      return runSpicyEdit(cleanPrompt, spicyReferenceImages.map(ref => ref.src), ratioValue, statusTxt);
    };
    const response = useSpicy ? null : await apiFetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });
    clearTimeout(timeoutId);

    clearInterval(progressInterval);
    const responseData = useSpicy
      ? await (navigator.locks
        ? navigator.locks.request(spicyImageStorageKey, { ifAvailable: true }, lock => {
          if (!lock) throw new Error('다른 탭에서 Seedream 요청을 처리 중입니다.');
          return editWithReferences();
        })
        : editWithReferences())
      : await response.json();
    if (!responseData) { if (statusTxt) statusTxt.textContent = '편집 제출을 취소했습니다.'; return; }

    if (response && !response.ok) {
      console.error("이미지 생성 에러:", responseData);
      alert(`[생성 실패] ${responseData.error || '통신 오류'}`);
      throw new Error(responseData.error);
    }

    if (bar) bar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = "✨ 생성 완료! 이미지를 표시합니다.";

    const findImageInObject = (obj) => {
      if (!obj) return null;
      if (typeof obj === 'string' && (obj.startsWith('http://') || obj.startsWith('https://'))) {
        if (obj.match(/\.(jpeg|jpg|gif|png|webp)/i) || obj.includes('kie.ai/') || obj.includes('redpandaai.co') || obj.includes('pollinations.ai/')) return obj;
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

    // 서버가 data.url로 직접 주는 경우 우선 사용 (Kie / Pollinations)
    const finalImageUrl = (responseData.data && typeof responseData.data.url === 'string' && responseData.data.url.startsWith('http'))
      ? responseData.data.url
      : findImageInObject(responseData.data);

    if (!finalImageUrl) {
      console.error("최종 이미지 추출 실패. 응답 원본:", responseData);
      throw new Error("서버 응답에서 이미지 URL을 찾지 못했습니다.");
    }
    recordGeneratedMedia('image', finalImageUrl, responseData.data?.archiveToken);

    // 실제 사용된 엔진 표시 (Kie 실패 시 폴백 사유도 노출)
    const engineEl = document.getElementById('image-engine-status');
    const provider = responseData.data && responseData.data.provider;
    if (engineEl) engineEl.innerText = useSpicy ? 'SpicyAPI · Seedream 5.5 Edit' : 'API Active';
    if (responseData.data && responseData.data.fallbackReason) {
      console.warn('[IMAGE] 폴백 사유:', responseData.data.fallbackReason);
      if (typeof addLog === 'function') addLog(`!! 이미지 폴백: ${responseData.data.fallbackReason}`, 'error');
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
          document.getElementById('video-studio').scrollIntoView({ behavior: (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth' });
          setVideoImageRef(finalImageUrl);
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
    console.error("이미지 생성 통신 에러:", error);
    const message = document.createElement('div');
    message.style.cssText = 'color: var(--status-error); padding: 20px;';
    message.textContent = `❌ 생성 중 오류가 발생했습니다. ${error.message}`;
    placeholder.replaceChildren(message);
  } finally {
    clearTimeout(timeoutId);
    if (useSpicy) refreshSpicyBalance();
    providerSelect.disabled = false;
    btn.innerHTML = orgBtnText;
    btn.disabled = false;
  }
}

// 이미지 생성 버튼 이벤트 리스너 (CSP 준수: inline onclick 대신 JS에서 연결)
const imageGenBtn = document.getElementById('image-generate-btn');
if (imageGenBtn) {
  imageGenBtn.addEventListener('click', generateImage);
}

/* ==========================================================================
   AI VIDEO STUDIO LOGIC (Kie Grok Imagine)
   ========================================================================== */

// 🎬 영상 참고 이미지 (Grok Imagine: 최대 7장, 프롬프트에서 @image1… 로 지칭 가능)
const VIDEO_REF_MAX = 7;
let videoRefImages = [];
const videoReferenceEditor = createReferenceEditor('videoPromptInput', number => `@image${number}`, /@image\s*(\d+)\b/gi);
function renderVideoRefs() {
  const grid = document.getElementById('video-ref-grid');
  if (!grid) return;
  videoReferenceEditor.update(videoRefImages, videoRefImages.length > 0);
  grid.innerHTML = '';
  videoRefImages.forEach((src, i) => {
    const tile = document.createElement('div');
    tile.className = 'vref-tile';
    const img = document.createElement('img'); img.src = src; img.alt = `참고 이미지 ${i + 1}`;
    img.addEventListener('click', () => openImageViewer(src));
    const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'vref-tag reference-insert'; tag.textContent = `@image${i + 1}`;
    tag.title = '프롬프트에 참고 이미지 삽입';
    tag.addEventListener('click', () => videoReferenceEditor.insertReference(i));
    const del = document.createElement('button'); del.type = 'button'; del.className = 'vref-del'; del.setAttribute('aria-label', `참고 이미지 ${i + 1} 빼기`); del.textContent = '×';
    del.addEventListener('click', () => {
      videoRefImages.splice(i, 1);
      videoReferenceEditor.remap(videoRefImages);
      renderVideoRefs();
    });
    tile.append(img, tag, del);
    grid.appendChild(tile);
  });
  if (videoRefImages.length < VIDEO_REF_MAX) {
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'vref-add';
    add.innerHTML = `<span>＋</span><small>${videoRefImages.length ? '추가' : '클릭 또는 드래그'}<br>${videoRefImages.length}/${VIDEO_REF_MAX}</small>`;
    add.addEventListener('click', () => document.getElementById('video-ref-file')?.click());
    grid.appendChild(add);
  }
}
function addVideoRefs(srcs) {
  const room = VIDEO_REF_MAX - videoRefImages.length;
  if (room <= 0) { alert(`참고 이미지는 최대 ${VIDEO_REF_MAX}장입니다.`); return; }
  srcs.slice(0, room).forEach(s => { if (s && !videoRefImages.includes(s)) videoRefImages.push(s); });
  if (srcs.length > room) alert(`최대 ${VIDEO_REF_MAX}장까지라 ${srcs.length - room}장은 넣지 않았습니다.`);
  renderVideoRefs();
}
// 이미지 스튜디오 → 영상으로 보내기: 첫 번째 참고 이미지로 넣음
function setVideoImageRef(url) {
  if (!url) return;
  videoRefImages = [url, ...videoRefImages.filter(s => s !== url)].slice(0, VIDEO_REF_MAX);
  videoReferenceEditor.remap(videoRefImages);
  renderVideoRefs();
}
// 휴대폰 사진(수 MB·수천 px)은 그대로 보내면 영상 모델이 Internal error를 내기 쉬워서
// 긴 변 1280px JPEG로 줄여서 넣음 (사진 방향 정보도 이때 반영됨)
function shrinkImageFile(file, max = 1280) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
    const url = reader.result; // data: URL (CSP가 blob: 이미지를 막아서 data:로 읽음)
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(null);
    img.src = url;
    };
    reader.readAsDataURL(file);
  });
}
function readVideoRefFiles(files) {
  const list = Array.from(files || []).filter(f => /^image\//.test(f.type));
  Promise.all(list.map(f => shrinkImageFile(f))).then(srcs => {
    const ok = srcs.filter(Boolean);
    if (ok.length < list.length) alert(`${list.length - ok.length}개 파일은 이 브라우저에서 열 수 없어 제외했습니다. (JPG·PNG·WEBP 권장)`);
    addVideoRefs(ok);
  });
}
(() => {
  const input = document.getElementById('video-ref-file');
  const grid = document.getElementById('video-ref-grid');
  if (input) input.addEventListener('change', (e) => { readVideoRefFiles(e.target.files); e.target.value = ''; });
  if (grid) {
    ['dragenter', 'dragover'].forEach(ev => grid.addEventListener(ev, (e) => { e.preventDefault(); grid.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach(ev => grid.addEventListener(ev, (e) => { e.preventDefault(); grid.classList.remove('is-drag'); }));
    grid.addEventListener('drop', (e) => readVideoRefFiles(e.dataTransfer && e.dataTransfer.files));
  }
  renderVideoRefs();
})();

// AI 비디오 생성 함수 (Kie Grok Imagine · 작업 생성 → 상태 폴링)
async function generateVideo() {
  const btn = document.getElementById('generate-video-btn');
  if (btn.disabled) return;
  const promptInput = document.getElementById('videoPromptInput');
  const durationInput = document.getElementById('videoDurationInput');
  const modeInput = document.getElementById('videoModeInput');
  const placeholder = document.getElementById('video-placeholder');
  const videoElement = document.getElementById('generatedVideo');
  
  const pendingKey = `kie-video-pending:${currentAccountId}`;
  let taskId = localStorage.getItem(pendingKey);
  if (!taskId && !promptInput.value.trim()) {
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
      <div style="font-size: 0.7rem; margin-top: 12px; color: var(--fg-muted);">영상 렌더링을 시작했습니다 (보통 1~3분)</div>
    </div>
  `;
  videoElement.style.display = "none";
  placeholder.style.display = "block";

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

  try {
    if (!taskId) {
      const createRes = await apiFetch('/api/video/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptInput.value.trim(), images: videoRefImages.slice(0, VIDEO_REF_MAX),
          duration: durationInput.value, resolution: modeInput.value })
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || '영상 작업 접수 여부를 확인할 수 없습니다.');
      taskId = created.taskId;
      localStorage.setItem(pendingKey, taskId);
    }
    const videoUrl = await AP.pollTask(taskId, 10 * 60 * 1000);
    localStorage.removeItem(pendingKey);
    clearInterval(progressInterval);

    if (bar) bar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = "✨ 생성 완료!";

    videoElement.src = videoUrl;
    videoElement.style.display = "block";
    placeholder.style.display = "none";

  } catch (error) {
    clearInterval(progressInterval);
    console.error("Video Gen Error:", error);
    if (error.terminal) localStorage.removeItem(pendingKey);
    placeholder.textContent = `❌ ${error.message}${taskId && !error.terminal ? ' 생성 버튼을 다시 누르면 기존 작업을 조회합니다.' : ''}`;
  } finally {
    btn.innerHTML = orgBtnText;
    btn.disabled = false;
  }
}

// 이벤트 리스너 연결
const genVideoBtn = document.getElementById('generate-video-btn');
if (genVideoBtn) {
  genVideoBtn.addEventListener('click', generateVideo);
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

// ===== Prompt Lab → AI Image Studio 연결 (최적화 프롬프트를 이미지 스튜디오로 전달) =====
function toImagePrompt(raw) {
  if (!raw) return '';
  let text = raw.split(/#+\s*Negative Prompts?/i)[0];     // 네거티브 섹션 제거 (Z-Image는 미지원)
  text = text.replace(/\*\*(.*?)\*\*\.?/g, '').replace(/[#*_`>]/g, ''); // 마크다운/헤더 제거
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 1000 ? text.slice(0, 1000).replace(/[^.]*$/, '').trim() || text.slice(0, 1000) : text;
}

const sendToStudioBtn = document.getElementById('send-to-studio-btn');
if (sendToStudioBtn) {
  sendToStudioBtn.addEventListener('click', () => {
    const out = document.getElementById('optimized-output');
    const raw = out ? out.innerText.trim() : '';
    if (!raw || raw.startsWith('대기 중') || raw.startsWith('오류')) {
      alert('먼저 "적용 후 프롬프트 생성"으로 프롬프트를 만들어 주세요.');
      return;
    }
    const input = document.getElementById('imagePromptInput');
    if (!input) return;
    input.value = toImagePrompt(raw);
    input.dispatchEvent(new Event('input'));
    // 비율 자동: 세로형 기본 (숏폼)
    const ratioSel = document.getElementById('imageRatioInput');
    if (ratioSel && [...ratioSel.options].some(o => o.value === '9:16') && ratioSel.value === '1:1') ratioSel.value = '9:16';
    const studio = document.getElementById('image-studio');
    if (studio) studio.scrollIntoView({ behavior: (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth', block: 'start' });
    input.style.transition = 'box-shadow 0.3s';
    input.style.boxShadow = '0 0 0 3px var(--skills-cyan)';
    setTimeout(() => { input.style.boxShadow = ''; }, 1500);
    if (typeof addLog === 'function') addLog('→ 최적화 프롬프트로 이미지 생성 시작', 'success');
    const genBtn = document.getElementById('image-generate-btn');
    if (genBtn && !genBtn.disabled) setTimeout(() => genBtn.click(), 600);
  });
}


/* =====================================================================
   🎯 ONE-CLICK PIPELINE
   목표 1회 입력 → 컨셉 → 스토리보드 → 숏리스트 → 장면 설계(캐릭터 일관성)
   → 장면 이미지(Kie z-image) → 장면 영상(Kie Grok Imagine, 병렬) → BGM·SEO → 타이포·자막 합성
   n8n 없이 브라우저가 단계를 오케스트레이션하고, 서버는 각 API를 대행한다.
   ===================================================================== */
const AP = {
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),

  setStep(step, state) {
    const el = document.querySelector(`.ap-step[data-step="${step}"]`);
    if (!el) return;
    el.classList.remove('running', 'done', 'failed', 'skipped');
    if (state) el.classList.add(state);
    AP.updateProgress();
  },

  // 전체 진행 바 + 경과 시간
  updateProgress() {
    const steps = [...document.querySelectorAll('.ap-step')];
    const bar = document.getElementById('ap-progress-bar');
    const txt = document.getElementById('ap-progress-text');
    if (!steps.length || !bar) return;
    const finished = steps.filter(s => s.classList.contains('done') || s.classList.contains('skipped') || s.classList.contains('failed')).length;
    const running = steps.filter(s => s.classList.contains('running')).map(s => s.innerText.replace(/^[①-⑳]\s*/, '').replace(' ✓', ''));
    const pct = Math.round((finished / steps.length) * 100);
    bar.style.width = `${pct}%`;
    if (txt) {
      const sec = AP.startedAt ? Math.floor((Date.now() - AP.startedAt) / 1000) : 0;
      const t = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      txt.innerText = `${pct}% · 경과 ${t}${running.length ? ` · 진행 중: ${running.join(', ')}` : ''}`;
    }
  },

  // 장면 카드 상태에 경과 시간 표시
  startSceneTimer(i, label) {
    const t0 = Date.now();
    const id = setInterval(() => {
      const st = document.getElementById(`ap-state-${i}`);
      if (!st || !st.dataset.timing) return clearInterval(id);
      const s = Math.floor((Date.now() - t0) / 1000);
      st.innerText = `${st.dataset.timing} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
    const st = document.getElementById(`ap-state-${i}`);
    if (st) { st.dataset.timing = label; st.innerText = label; }
  },

  async engineer(intent, systemPrompt) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await apiFetch('/api/engineer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, systemPrompt })
      });
      if (res.status === 429) { await AP.sleep(20000); continue; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 응답 실패');
      return data.result;
    }
    throw new Error('요청 한도 초과 — 1분 후 다시 시도해 주세요.');
  },

  // 기존 탭(컨셉/스토리보드/숏리스트/BGM/SEO)의 설정을 그대로 사용해 생성하고 결과를 탭에도 채운다
  async runTool(tool, goal, context) {
    const config = getVpsToolConfig(tool);
    if (!config) throw new Error(`알 수 없는 단계: ${tool}`);
    const { inputEl, outputEl, systemPrompt } = config;
    if (inputEl) inputEl.value = goal;
    if (outputEl) startLoadingAnimation(outputEl, '생성 중');
    const intent = context
      ? `${goal}\n\n[참고: 앞 단계 결과 — 톤·타깃·핵심 메시지를 일관되게 유지]\n${context.slice(0, 1800)}`
      : goal;
    try {
      const text = (await AP.engineer(intent, systemPrompt)).replace(/\n\n\n+/g, '\n\n').trim();
      if (outputEl) {
        stopLoadingAnimation(outputEl);
        outputEl.innerText = text;
        outputEl.dataset.rawResult = text;
        outputEl.style.color = 'var(--fg)';
      }
      return text;
    } catch (e) {
      if (outputEl) { stopLoadingAnimation(outputEl); outputEl.innerText = `[생성 실패: ${e.message}]`; }
      throw e;
    }
  },

  async designScenes(goal, platform, count, storyboard, shotlist, linkMode = 'cut') {
    const systemPrompt = `You are a short-form video director. Turn the plan into exactly ${count} vertical (9:16) scenes for ${platform}.
Return ONLY valid JSON, no markdown fences, in this shape:
{"character":"one-sentence visual description of the main person/animal, or empty string if none","product":"one-sentence exact visual description of the hero product (shape, material, color, cap, label), or empty string if none","scenes":[{"title":"short Korean title","image_prompt":"English, one paragraph, max 600 characters","motion_prompt":"English, max 200 characters","narration":"Korean voice-over line","caption":"Korean on-screen text"}]}
RULES:
- CHARACTER CONSISTENCY: copy the exact "character" sentence verbatim into every image_prompt so the same person appears in all scenes.
- PRODUCT LOCK: if there is a product, copy the exact "product" sentence verbatim into EVERY image_prompt and motion_prompt that shows it. The product must look identical in every scene (same bottle shape, cap, color, label). Never swap it for a generic container.
- HOOK (scene 1, first second): open with ONE of these — an extreme close-up of the product/subject with striking light, an unexpected motion, or a bold question/number. No slow establishing shots, no subject idly sitting or reading.
- Scene 1 caption must itself be a hook: a short question, bold claim or number (e.g. "이 향, 맡아봤어?", "단 1번으로 충분"). Never a soft description.
- caption and narration must say DIFFERENT things: caption = short punchy copy, narration = the spoken line. Never repeat the same words.
- image_prompt: photorealistic still frame, subject + action, setting, lighting, camera shot, vertical composition. Plain text, no negative prompts, no buzzwords like 8k or masterpiece.
- NO TEXT IN IMAGES: text overlays, captions, buttons, "swipe up"/link icons, logos and brand names from the plan are added later in editing — never describe them in image_prompt or motion_prompt.
- PHYSICAL ACCURACY: describe exactly what touches what and in which direction (e.g. "sprays the perfume onto her inner wrist, mist drifting away from her face"). Products must be used the way they are really used.
- motion_prompt: what moves in 5 seconds (subject action + camera movement), simple and physically plausible.
- caption: punchy Korean on-screen typography for that scene, max 12 characters, no emoji. The LAST scene's caption is the call-to-action (e.g. "지금 바로 만나보세요").
- motion_prompt must not contain spoken dialogue or quoted speech (the video model would voice it).
- narration: natural spoken Korean (구어체) voice-over for that scene, readable in about 4 seconds (max 30 Korean characters). The lines must flow as one story across scenes; the last line delivers the call-to-action.
- Scene 1 must be a strong visual hook; the last scene should support the call-to-action. If there is only one scene, it must deliver both the hook and the call-to-action.${linkMode === 'extend' ? `
- CONTINUOUS ONE-SHOT MODE: all scenes are consecutive moments of ONE unbroken camera shot in the SAME location. Each motion_prompt must start exactly where the previous one ended (same framing, lighting and outfit) and describe only what happens next. Only scene 1's image_prompt will be rendered as a still.` : ''}`;
    const intent = `[GOAL]\n${goal}\n\n[STORYBOARD]\n${(storyboard || '').slice(0, 1500)}\n\n[SHOT LIST]\n${(shotlist || '').slice(0, 1000)}`;
    const raw = await AP.engineer(intent, systemPrompt);
    const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) throw new Error('장면 설계 결과가 비어 있습니다.');
    // 🔒 일관성 강제: AI가 규칙을 빠뜨려도 제품·인물 묘사를 모든 장면 프롬프트에 넣는다
    const lock = (text, phrase) => (phrase && text && !text.includes(phrase.slice(0, 40))) ? `${phrase} ${text}` : text;
    const scenes = parsed.scenes.slice(0, count).map(sc => ({
      ...sc,
      image_prompt: lock(lock(sc.image_prompt, parsed.product), parsed.character),
      motion_prompt: lock(sc.motion_prompt, parsed.product)
    }));
    if (parsed.product) addLog(`🔒 제품 고정: ${parsed.product}`, 'secondary');
    return scenes;
  },

  renderScenes(scenes) {
    const grid = document.getElementById('ap-scene-grid');
    grid.innerHTML = '';
    scenes.forEach((sc, i) => {
      const card = document.createElement('div');
      card.className = 'ap-scene';
      card.innerHTML = `<div class="ap-media" id="ap-media-${i}">대기 중</div>
        <div style="font-weight:600; color: var(--fg);">#${i + 1} ${sc.title || ''}</div>
        ${sc.caption ? `<div style="margin-top:4px; color: var(--skills-cyan); font-weight:700;">✍️ ${sc.caption}</div>` : ''}
        ${sc.narration ? `<div style="margin-top:4px; color: var(--fg);">🎙 ${sc.narration}</div>` : ''}
        <div id="ap-voice-${i}" style="margin-top:4px;"></div>
        <div id="ap-state-${i}" style="margin-top:4px;">준비</div>`;
      grid.appendChild(card);
    });
  },

  setScene(i, content, state) {
    const media = document.getElementById(`ap-media-${i}`);
    const st = document.getElementById(`ap-state-${i}`);
    if (content !== null && media) media.replaceChildren(content);
    if (state && st) {
      if (/렌더링 중|재시도 중/.test(state)) { AP.startSceneTimer(i, state.replace(/\s*\(1~3분\)/, '')); }
      else { delete st.dataset.timing; st.innerText = state; }
    }
  },

  sceneMedia(tag, url) {
    const element = document.createElement(tag);
    element.src = url;
    if (tag === 'video') Object.assign(element, { muted: true, loop: true, autoplay: true, playsInline: true });
    else element.alt = '장면 이미지';
    return element;
  },

  async makeImage(prompt) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await apiFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspect_ratio: '9:16' })
      });
      if (res.status === 429) { await AP.sleep(20000); continue; }
      const data = await res.json();
      if (!res.ok || !data.data?.url) throw new Error(data.error || '이미지 생성 실패');
      recordGeneratedMedia('image', data.data.url, data.data.archiveToken);
      return data.data;
    }
    throw new Error('이미지 요청 한도 초과');
  },

  async pollTask(taskId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await AP.sleep(6000);
      const stRes = await fetch(`/api/task/status?taskId=${encodeURIComponent(taskId)}`);
      if (stRes.status === 429) continue;
      const st = await stRes.json();
      if (!stRes.ok) throw new Error(st.error || '영상 상태를 조회할 수 없습니다.');
      if (st.state === 'success' && st.url) {
        recordGeneratedMedia('video', st.url, st.archiveToken);
        return st.url;
      }
      if (st.state === 'fail') throw Object.assign(new Error(st.failMsg || '작업 실패'), { terminal: true });
    }
    throw new Error('시간 초과');
  },

  showVideoResume(scene, taskId, message) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-skills secondary';
    button.textContent = '기존 영상 결과 조회';
    button.onclick = async () => {
      button.disabled = true;
      AP.setScene(scene, null, '기존 영상 작업 조회 중');
      try {
        const url = await AP.pollTask(taskId, 6 * 60 * 1000);
        AP.setScene(scene, AP.sceneMedia('video', url), '영상 완료');
      } catch (error) {
        AP.setScene(scene, error.terminal ? '영상 생성 실패' : null, error.message);
      } finally {
        button.disabled = false;
      }
    };
    AP.setScene(scene, button, message);
  },

  // 🎙 Supertonic 3 (브라우저 실행, 무료). 모델은 첫 사용 때 한 번 받고 캐시
  async makeVoice(text, voice) {
    if (!globalThis.SupertonicTTS) {
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('음성 엔진 스크립트를 불러오지 못했습니다.')), 15000);
        window.addEventListener('supertonic-ready', () => { clearTimeout(t); res(); }, { once: true });
      });
    }
    const { url } = await globalThis.SupertonicTTS.speak(text, { voice, speed: 1.15 });
    return url;
  },

  // 실패 시 자동 재시도: 이미지→영상 → 텍스트→영상 (시도당 최대 6분)
  async makeVideo(motionPrompt, imageUrl, onRetry, fallbackPrompt) {
    // Grok Imagine 480p(최저가): 이미지→영상 실패 시 텍스트→영상
    const attempts = [
      { resolution: '480p', image: imageUrl, prompt: motionPrompt },
      { resolution: '480p', image: null, prompt: `${fallbackPrompt || ''} ${motionPrompt}`.trim() }
    ];
    let lastErr = null;
    for (let a = 0; a < attempts.length; a++) {
      const at = attempts[a];
      if (a > 0 && onRetry) onRetry(a, lastErr);
      let taskId;
      try {
        const res = await apiFetch('/api/video/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: at.prompt, image: at.image, duration: '6', resolution: at.resolution, aspect_ratio: '9:16' })
        });
        const created = await res.json();
        if (!res.ok) throw new Error(created.error || '영상 작업 생성 실패');
        taskId = created.taskId;
        return await AP.pollTask(taskId, 6 * 60 * 1000);
      } catch (e) {
        lastErr = e;
        addLog(`!! 영상 시도 ${a + 1} 실패 (${at.image ? '이미지→영상' : '텍스트→영상'} ${at.resolution}): ${e.message}`, 'error');
        if (!e.terminal) throw Object.assign(e, { taskId });
      }
    }
    throw lastErr || new Error('영상 생성 실패');
  },

  // 외부(Kie) 영상은 canvas로 읽을 수 없어 같은 주소의 중계 경로로 연다
  proxied(url) {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
    try { if (new URL(url, location.href).origin === location.origin) return url; } catch (e) { return url; }
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  },

  loadVideo(url) {
    return new Promise((res, rej) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
      const t = setTimeout(() => rej(new Error('클립 로드 시간 초과')), 60000);
      v.oncanplaythrough = () => { clearTimeout(t); res(v); };
      v.onerror = () => { clearTimeout(t); rej(new Error('클립을 불러오지 못했습니다')); };
      v.src = AP.proxied(url);
      v.load();
    });
  },

  // 영상의 마지막 프레임을 이미지(data URL)로 캡처 → 다음 클립의 시작 이미지
  async lastFrame(url) {
    const v = await AP.loadVideo(url);
    await new Promise((res) => { v.onseeked = res; v.currentTime = Math.max(0, (v.duration || 5) - 0.05); });
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  },

  // 클립을 순서대로 재생하며 화면+내레이션을 녹화해 파일 하나로 만든다 (브라우저 내장 MediaRecorder)
  async mergeClips(clips, voices = [], overlays = []) {
    if (typeof MediaRecorder === 'undefined') throw new Error('이 브라우저는 녹화를 지원하지 않습니다.');
    const vids = [];
    for (const u of clips) vids.push(await AP.loadVideo(u));
    const W = vids[0].videoWidth || 720, H = vids[0].videoHeight || 1280;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ac.createMediaStreamDestination();
    const buffers = await Promise.all(clips.map(async (_, i) => {
      if (!voices[i]) return null;
      try { return await ac.decodeAudioData(await (await fetch(voices[i])).arrayBuffer()); } catch (e) { return null; }
    }));
    const drawFrame = (v) => {
      const vw = v.videoWidth || W, vh = v.videoHeight || H;
      const sc = Math.max(W / vw, H / vh), dw = vw * sc, dh = vh * sc;
      ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    };
    // ✍️ 타이포 모션 + 하단 자막 (글꼴로 직접 그려서 글자 깨짐 없음)
    const FONT = '"Pretendard Variable", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    // 캔버스는 글꼴이 로드되기 전 글자를 기본 글꼴로 그리므로, 실제 쓰일 글자에 맞춰 Pretendard를 먼저 불러온다
    try {
      const sample = overlays.map(o => `${o.caption || ''}${o.subtitle || ''}`).join('') || '가';
      await Promise.race([
        Promise.all([
          document.fonts.load('900 64px "Pretendard Variable"', sample),
          document.fonts.load('700 32px "Pretendard Variable"', sample)
        ]),
        AP.sleep(5000)
      ]);
    } catch (e) { }
    const S = W / 720;
    const clamp = (x) => Math.max(0, Math.min(1, x));
    const easeOutBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
    const wrapLines = (text, maxW) => {
      const words = String(text).split(' '); const lines = []; let line = '';
      words.forEach(w => { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
      if (line) lines.push(line);
      return lines.slice(0, 2);
    };
    const drawOverlay = (i, t, dur) => {
      const o = overlays[i];
      if (!o) return;
      const out = clamp(((dur || 6) - t) / 0.35);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (o.caption) {
        const chars = [...String(o.caption)];
        let size = Math.round(68 * S);
        ctx.font = `900 ${size}px ${FONT}`;
        let widths = chars.map(c => ctx.measureText(c).width);
        let total = widths.reduce((a, b) => a + b, 0);
        if (total > W * 0.86) { size = Math.floor(size * (W * 0.86) / total); ctx.font = `900 ${size}px ${FONT}`; widths = chars.map(c => ctx.measureText(c).width); total = widths.reduce((a, b) => a + b, 0); }
        const y = o.isLast ? H * 0.68 : H * 0.2;
        if (o.isLast) {                                   // CTA: 금색 박스
          const a = clamp((t - 0.2) / 0.4) * out;
          ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(214, 178, 94, 0.95)';
          const bw = total + 60 * S, bh = size + 36 * S;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(W / 2 - bw / 2, y - bh / 2, bw, bh, bh / 2); else ctx.rect(W / 2 - bw / 2, y - bh / 2, bw, bh);
          ctx.fill();
        }
        let x = W / 2 - total / 2;
        chars.forEach((c, k) => {
          const p = i === 0
            ? clamp((t - k * 0.035) / 0.22)                 // 첫 장면(훅): 0초부터 빠르게
            : clamp((t - (0.25 + k * 0.06)) / 0.35);        // 한 글자씩 톡톡
          const e = easeOutBack(p);
          ctx.save();
          ctx.globalAlpha = p * out;
          ctx.translate(x + widths[k] / 2, y + (1 - e) * 28 * S);
          ctx.scale(0.6 + 0.4 * e, 0.6 + 0.4 * e);
          if (!o.isLast) { ctx.lineWidth = 9 * S; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineJoin = 'round'; ctx.strokeText(c, 0, 0); }
          ctx.fillStyle = o.isLast ? '#1d1608' : '#ffffff';
          ctx.fillText(c, 0, 0);
          ctx.restore();
          x += widths[k];
        });
      }
      if (o.subtitle) {                                      // 하단 자막
        const fs = Math.round(34 * S);
        ctx.font = `700 ${fs}px ${FONT}`;
        const lines = wrapLines(o.subtitle, W * 0.84);
        ctx.globalAlpha = clamp((t - 0.1) / 0.3) * out;
        lines.forEach((ln, k) => {
          const ly = H * 0.86 + (k - (lines.length - 1) / 2) * fs * 1.3;
          ctx.lineWidth = 7 * S; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round';
          ctx.strokeText(ln, W / 2, ly);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(ln, W / 2, ly);
        });
      }
      ctx.restore();
    };

    drawFrame(vids[0]);
    drawOverlay(0, 0, vids[0].duration);
    const canvasStream = canvas.captureStream(0);           // 프레임을 직접 밀어 넣는 방식 (끊김 방지)
    const vTrack = canvasStream.getVideoTracks()[0];
    const push = () => { if (vTrack.requestFrame) vTrack.requestFrame(); };
    const stream = new MediaStream([vTrack, ...dest.stream.getAudioTracks()]);
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
      .find(m => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5e6 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    if (ac.state === 'suspended') { try { await ac.resume(); } catch (e) { } }
    rec.start(500);
    for (let i = 0; i < vids.length; i++) {
      const v = vids[i];
      v.currentTime = 0;
      if (buffers[i]) { const src = ac.createBufferSource(); src.buffer = buffers[i]; src.connect(dest); src.start(); }
      await v.play();
      await new Promise((res) => {
        let done = false;
        const finish = () => { if (!done) { done = true; drawFrame(v); drawOverlay(i, v.duration, v.duration); push(); res(); } };
        v.onended = finish;
        const tick = () => { if (done) return; drawFrame(v); drawOverlay(i, v.currentTime, v.duration); push(); if (v.ended) return finish(); schedule(); };
        const schedule = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick));
        tick();
        setTimeout(finish, ((v.duration || 5) + 3) * 1000); // 안전장치
      });
    }
    await AP.sleep(300);
    rec.stop();
    await stopped;
    try { ac.close(); } catch (e) { }
    const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('녹화 결과가 비어 있습니다.');
    return { url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'mp4' : 'webm', blob };
  },

  showMerged(merged, n) {
    const wrap = document.getElementById('ap-final');
    const player = document.getElementById('ap-final-player');
    const voiceEl = document.getElementById('ap-final-voice');
    const note = document.getElementById('ap-final-note');
    const dl = document.getElementById('ap-download');
    if (voiceEl) { voiceEl.pause(); voiceEl.removeAttribute('src'); }
    player.onended = null; player.onpause = null; player.onplay = null;
    player.muted = false;
    player.src = merged.url;
    recordGeneratedMedia('video', merged.url, undefined, merged.blob);
    wrap.style.display = 'block';
    if (note) note.innerText = `완성본 · 장면 ${n}개 · ${merged.ext.toUpperCase()} · ${(merged.blob.size / 1e6).toFixed(1)}MB`;
    if (dl) {
      dl.href = merged.url;
      dl.download = `ai-prod-shortform-${new Date().toISOString().slice(0, 10)}.${merged.ext}`;
      dl.style.display = 'inline-flex';
    }
  },

  // 장면 클립 + 장면별 내레이션을 맞춰 연속 재생 (voices[k]가 없으면 영상만)
  playSequence(urls, voices = []) {
    const wrap = document.getElementById('ap-final');
    const player = document.getElementById('ap-final-player');
    const voiceEl = document.getElementById('ap-final-voice');
    const note = document.getElementById('ap-final-note');
    if (!urls.length) return;
    wrap.style.display = 'block';
    let idx = 0;
    const playAt = (k) => {
      idx = k;
      player.src = urls[k];
      if (voiceEl) {
        voiceEl.pause();
        if (voices[k]) { voiceEl.src = voices[k]; voiceEl.currentTime = 0; }
        else voiceEl.removeAttribute('src');
      }
      note.innerText = `장면 ${k + 1} / ${urls.length} 재생 중${voices.some(Boolean) ? ' · 내레이션 포함' : ''}`;
      player.play().then(() => { if (voiceEl && voices[k]) voiceEl.play().catch(() => {}); }).catch(() => {});
    };
    player.onended = () => { if (idx + 1 < urls.length) playAt(idx + 1); else if (voiceEl) voiceEl.pause(); };
    player.onpause = () => { if (voiceEl && !player.ended) voiceEl.pause(); };
    player.onplay = () => { if (voiceEl && voices[idx] && voiceEl.paused && voiceEl.currentTime > 0 && !voiceEl.ended) voiceEl.play().catch(() => {}); };
    playAt(0);
  },

  async run() {
    const btn = document.getElementById('ap-run-btn');
    const goal = document.getElementById('ap-goal').value.trim();
    const platformSel = document.getElementById('ap-platform');
    const platform = platformSel.options[platformSel.selectedIndex].text;
    const count = parseInt(document.getElementById('ap-scenes').value, 10) || 1;
    const makeVideo = document.getElementById('ap-make-video').checked;
    const voiceOpt = document.getElementById('ap-voice')?.value || 'F1';
    const linkMode = document.getElementById('ap-link')?.value || 'cut';

    if (typeof USER_LOGGED_IN !== 'undefined' && !USER_LOGGED_IN) { alert('로그인 후 사용할 수 있습니다.'); return; }
    if (!goal) { alert('목표(만들고 싶은 영상)를 한 줄 이상 입력해 주세요.'); return; }

    btn.disabled = true;
    const orgText = btn.innerText;
    btn.innerText = '⏳ 자동 제작 중...';
    const steps = document.getElementById('ap-steps');
    steps.style.display = 'grid';
    AP.startedAt = Date.now();
    const pw = document.getElementById('ap-progress'); if (pw) pw.style.display = 'block';
    clearInterval(AP._tick); AP._tick = setInterval(() => AP.updateProgress(), 1000);
    ['concept', 'storyboard', 'shotlist', 'scenes', 'images', 'voice', 'videos', 'merge', 'release'].forEach(k => AP.setStep(k, null));
    const dl = document.getElementById('ap-download'); if (dl) dl.style.display = 'none';
    document.getElementById('ap-final').style.display = 'none';
    document.getElementById('ap-scene-grid').innerHTML = '';
    updateStatusUI('vps', 'processing', '원클릭 파이프라인 실행 중...');
    addLog(`▶ 원클릭 파이프라인 시작 (${platform}, ${count}장면)`, 'success');
    const goalWithPlatform = `${goal}\n(플랫폼: ${platform}, 세로 9:16, 장면 ${count}개 · 장면당 6초)`;
    // 기존 탭의 플랫폼/스타일 설정을 파이프라인 목표에 맞춰 자동 정렬
    const pv = platformSel.value;
    const setSel = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setSel('vps-concept-platform', pv === 'youtube-shorts' ? 'youtube-shorts' : pv === 'tiktok' ? 'tiktok' : 'instagram');
    setSel('vps-seo-platform', pv === 'youtube-shorts' ? 'shorts' : pv === 'tiktok' ? 'tiktok' : 'instagram');
    setSel('vps-storyboard-style', 'shortform');
    let current = 'concept';

    try {
      // ①~③ 기획 단계 (앞 단계 결과를 다음 단계 맥락으로 전달)
      AP.setStep('concept', 'running');
      const concept = await AP.runTool('concept', goalWithPlatform);
      AP.setStep('concept', 'done');

      current = 'storyboard'; AP.setStep('storyboard', 'running');
      const storyboard = await AP.runTool('storyboard', goalWithPlatform, concept);
      AP.setStep('storyboard', 'done');

      current = 'shotlist'; AP.setStep('shotlist', 'running');
      const shotlist = await AP.runTool('shotlist', goalWithPlatform, storyboard);
      AP.setStep('shotlist', 'done');

      // ④ 장면 설계 (캐릭터 묘사 고정)
      current = 'scenes'; AP.setStep('scenes', 'running');
      const scenes = await AP.designScenes(goal, platform, count, storyboard, shotlist, linkMode);
      AP.renderScenes(scenes);
      AP.setStep('scenes', 'done');

      // ⑥ 내레이션(TTS): 장면별 음성을 이미지/영상과 병렬 생성
      let voicePromise = Promise.resolve([]);
      if (voiceOpt !== 'none') {
        AP.setStep('voice', 'running');
        const vStatus = document.getElementById('ap-voice-status');
        let unsub = null;
        if (vStatus) {
          vStatus.style.display = 'block';
          vStatus.innerText = '🎙 음성 엔진 준비 중... (처음 한 번은 모델을 받느라 1~2분 걸릴 수 있어요)';
          if (globalThis.SupertonicTTS) unsub = globalThis.SupertonicTTS.onProgress((m) => { vStatus.innerText = `🎙 ${m}`; });
        }
        voicePromise = (async () => {
          const rs = [];
          for (let i = 0; i < scenes.length; i++) {   // 같은 모델을 쓰므로 순차 생성
            const sc = scenes[i];
            try {
              if (!sc.narration) { rs.push({ status: 'fulfilled', value: null }); continue; }
              const slot = document.getElementById(`ap-voice-${i}`);
              if (slot) slot.innerText = '🎙 음성 생성 중...';
              const url = await AP.makeVoice(sc.narration, voiceOpt);
              if (slot) {
                const audio = new Audio(url);
                audio.controls = true;
                audio.style.cssText = 'width: 100%; height: 28px;';
                slot.replaceChildren(audio);
              }
              rs.push({ status: 'fulfilled', value: url });
            } catch (e) {
              rs.push({ status: 'rejected', reason: e });
              const slot = document.getElementById(`ap-voice-${i}`);
              if (slot) slot.innerText = `🎙 음성 실패: ${e.message}`;
            }
          }
          if (unsub) unsub();
          if (vStatus) vStatus.innerText = '🎙 내레이션 완료 · AI 음성';
          return rs;
        })().then(rs => {
          const urls = rs.map(r => (r.status === 'fulfilled' ? r.value : null));
          rs.forEach((r, i) => { if (r.status === 'rejected') addLog(`!! 내레이션 ${i + 1} 실패: ${r.reason.message}`, 'error'); });
          AP.setStep('voice', urls.some(Boolean) ? 'done' : 'failed');
          return urls;
        });
      } else {
        AP.setStep('voice', 'skipped');
      }

      // ⑧ BGM·SEO는 텍스트라 이미지/영상과 병렬 진행
      AP.setStep('release', 'running');
      const releasePromise = (async () => {
        await AP.runTool('bgm', goalWithPlatform, concept);
        await AP.runTool('seo', goalWithPlatform, concept);
      })().then(() => AP.setStep('release', 'done')).catch(e => { AP.setStep('release', 'failed'); addLog(`!! BGM/SEO 실패: ${e.message}`, 'error'); });

      // ⑤ 장면 이미지 (순차: 한도 보호)
      current = 'images'; AP.setStep('images', 'running');
      const images = [];
      for (let i = 0; i < scenes.length; i++) {
        if (linkMode === 'extend' && makeVideo && i > 0) {   // 연장 모드: 2번째부터는 앞 영상의 마지막 프레임을 사용
          images.push(null);
          AP.setScene(i, '⤵ 앞 장면에서 이어짐', '연장 대기');
          continue;
        }
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        AP.setScene(i, spinner, '이미지 생성 중');
        const img = await AP.makeImage(`${scenes[i].image_prompt} Clean photographic frame with no text, letters, logos or graphic overlays.`);
        images.push(img.url);
        AP.setScene(i, AP.sceneMedia('img', img.url), '이미지 완료');
      }
      AP.setStep('images', 'done');

      // ⑥ 장면 영상 (병렬 렌더링)
      let clips = [];
      if (makeVideo) {
        current = 'videos'; AP.setStep('videos', 'running');
        let results;
        if (linkMode === 'extend') {
          // 연장 모드: 순차 생성, 앞 클립의 마지막 프레임 → 다음 클립의 시작 이미지
          results = [];
          let prevUrl = null;
          for (let i = 0; i < scenes.length; i++) {
            const sc = scenes[i];
            try {
              let startImage = images[i];
              if (i > 0) {
                if (!prevUrl) throw new Error('앞 장면 영상이 없어 이어 붙일 수 없습니다.');
                AP.setScene(i, null, '앞 영상의 마지막 장면 캡처 중');
                startImage = await AP.lastFrame(prevUrl);
                AP.setScene(i, AP.sceneMedia('img', startImage), '영상 렌더링 중 (1~3분)');
              } else {
                AP.setScene(i, null, '영상 렌더링 중 (1~3분)');
              }
              const url = await AP.makeVideo(sc.motion_prompt || sc.image_prompt, startImage,
                (n) => AP.setScene(i, null, `영상 재시도 중 (텍스트→영상)...`), sc.image_prompt);
              AP.setScene(i, AP.sceneMedia('video', url), '영상 완료');
              prevUrl = url;
              results.push({ status: 'fulfilled', value: url });
            } catch (e) {
              prevUrl = null;
              results.push({ status: 'rejected', reason: e });
            }
          }
        } else {
          results = await Promise.allSettled(scenes.map(async (sc, i) => {
            await AP.sleep(i * 1500); // 동시 생성 요청 분산
            AP.setScene(i, null, '영상 렌더링 중 (1~3분)');
            const url = await AP.makeVideo(sc.motion_prompt || sc.image_prompt, images[i],
              (n) => AP.setScene(i, null, `영상 재시도 중 (텍스트→영상)...`), sc.image_prompt);
            AP.setScene(i, AP.sceneMedia('video', url), '영상 완료');
            return url;
          }));
        }
        results.forEach((r, i) => {
          if (r.status !== 'rejected') return;
          if (r.reason.taskId) AP.showVideoResume(i, r.reason.taskId, '영상 결과 확인 필요');
          else AP.setScene(i, null, `영상 실패: ${r.reason.message}`);
        });
        clips = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        AP.setStep('videos', clips.length === scenes.length ? 'done' : (clips.length ? 'done' : 'failed'));
        const voiceUrls = await voicePromise;
        const okIdx = results.map((r, i) => (r.status === 'fulfilled' ? i : -1)).filter(i => i >= 0);
        const clipVoices = okIdx.map(i => voiceUrls[i] || null);
        // 🎬 완성본: 클립 + 내레이션을 파일 하나로 합치기 (실패 시 연속 재생 미리보기)
        if (clips.length) {
          AP.setStep('merge', 'running');
          const note = document.getElementById('ap-final-note');
          document.getElementById('ap-final').style.display = 'block';
          if (note) note.innerText = '🎬 완성본 만드는 중... 영상 길이만큼 걸려요. 이 탭을 띄워 둔 채로 기다려 주세요.';
          try {
            const typoOn = document.getElementById('ap-typo')?.checked !== false;
            const overlays = typoOn ? okIdx.map(i => ({
              caption: scenes[i].caption || '',
              subtitle: voiceOpt !== 'none' ? (scenes[i].narration || '') : '',
              isLast: i === scenes.length - 1
            })) : [];
            const merged = await AP.mergeClips(clips, clipVoices, overlays);
            AP.showMerged(merged, clips.length);
            AP.setStep('merge', 'done');
          } catch (e) {
            addLog(`!! 완성본 합치기 실패: ${e.message} — 연속 재생으로 대체`, 'error');
            AP.setStep('merge', 'failed');
            AP.playSequence(clips, clipVoices);
          }
        }
      } else {
        AP.setStep('videos', 'skipped');
        AP.setStep('merge', 'skipped');
      }

      await voicePromise;
      await releasePromise;
      // AI 음성 고지 (Supertonic OpenRAIL-M 사용 조건: 기계 생성 콘텐츠임을 밝힐 것)
      if (voiceOpt !== 'none') {
        const seoOut = document.getElementById('vps-seo-output');
        if (seoOut && seoOut.dataset.rawResult && !seoOut.dataset.rawResult.includes('AI 음성')) {
          seoOut.dataset.rawResult += '\n\n목소리: AI 음성';
          seoOut.innerText = seoOut.dataset.rawResult;
        }
      }
      updateStatusUI('vps', 'idle', '원클릭 파이프라인 완료');
      addLog(`✓ 원클릭 파이프라인 완료 — 장면 ${scenes.length}개, 영상 ${clips.length}개`, 'success');
    } catch (err) {
      AP.setStep(current, 'failed');
      updateStatusUI('vps', 'error', `파이프라인 오류: ${err.message}`);
      addLog(`!! PIPELINE_FAULT [${current}]: ${err.message}`, 'error');
      alert(`파이프라인이 "${current}" 단계에서 멈췄습니다.\n${err.message}`);
    } finally {
      clearInterval(AP._tick); AP.updateProgress();
      btn.disabled = false;
      btn.innerText = orgText;
    }
  }
};

const apRunBtn = document.getElementById('ap-run-btn');
if (apRunBtn) apRunBtn.addEventListener('click', () => AP.run());


// ===== Prompt Lab: 적용된 설정 요약 칩 (프롬프트에 무엇이 반영됐는지 한눈에) =====
function renderLabParamSummary() {
  const box = document.getElementById('lab-param-summary');
  const lab = document.getElementById('prompt-lab');
  if (!box || !lab) return;
  const chips = [];
  lab.querySelectorAll('select.lab-select').forEach(sel => {
    if (sel.id === 'param-output-mode' || sel.offsetParent === null || sel.closest('.lab-center')) return;
    const opt = sel.options[sel.selectedIndex];
    if (!opt || ['none', ''].includes(sel.value)) return;
    const label = (opt.text || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    if (label) chips.push(label);
  });
  const angle = document.getElementById('param-angle');
  if (angle && angle.offsetParent !== null && angle.value !== '0') chips.push(`회전 ${angle.value}°`);
  // 03 조명 · 04 광학: 실제 프롬프트에 반영되는 핵심 항목만
  if (window.LightingLab) {
    const ls = window.LightingLab.getState();
    if (window.LightingLab.applied().lighting && ls.lighting.preset !== 'auto') chips.push(`💡 ${ls.lighting.preset === 'custom' ? 'Custom' : window.LightingLab.PRESETS[ls.lighting.preset].label} ${ls.lighting.azimuth}°`);
    window.LightingLab.serialize().keys.filter(k => /mm$|^f\//.test(k)).forEach(k => chips.push(`📷 ${k}`));
  }
  box.innerHTML = chips.map(c => `<span class="lab-chip">${c}</span>`).join('');
  box.style.display = chips.length ? 'flex' : 'none';
}
if (UI.engineerBtn) UI.engineerBtn.addEventListener('click', renderLabParamSummary);


// ===== 🎙 내레이션 목소리 미리듣기 (미리 만들어 둔 Supertonic 샘플, 모델 다운로드 없이 즉시 재생) =====
(() => {
  const btn = document.getElementById('ap-voice-preview');
  const sel = document.getElementById('ap-voice');
  if (!btn || !sel) return;
  const audio = new Audio();
  const sync = () => { btn.disabled = sel.value === 'none'; btn.style.opacity = btn.disabled ? '0.4' : '1'; };
  audio.onended = () => { btn.innerText = '▶'; };
  btn.addEventListener('click', () => {
    if (sel.value === 'none') return;
    if (!audio.paused) { audio.pause(); btn.innerText = '▶'; return; }
    audio.src = `supertonic/samples/${sel.value}.mp3`;
    audio.play().then(() => { btn.innerText = '■'; }).catch(() => { btn.innerText = '▶'; });
  });
  sel.addEventListener('change', () => { audio.pause(); btn.innerText = '▶'; sync(); });
  sync();
})();


// ===== 🎙️ VPS · TTS 탭 (Supertonic 3, 브라우저 실행 · 비용 0원) =====
(() => {
  const $ = (id) => document.getElementById(id);
  const btn = $('vps-tts-btn'), input = $('vps-tts-input');
  if (!btn || !input) return;
  const status = $('vps-tts-status'), bar = $('vps-tts-progress-bar'), prog = $('vps-tts-progress');
  const audio = $('vps-tts-audio'), dl = $('vps-tts-download'), meta = $('vps-tts-meta');
  const speed = $('vps-tts-speed'), speedVal = $('vps-tts-speed-val'), count = $('vps-tts-count');
  let lastUrl = null;
  const setStatus = (msg, color) => { status.textContent = msg; status.style.color = color || 'var(--skills-cyan)'; };
  input.addEventListener('input', () => { count.textContent = `${input.value.length} / 2000`; });
  speed.addEventListener('input', () => { speedVal.textContent = `${Number(speed.value).toFixed(2)}×`; });

  const ready = () => globalThis.SupertonicTTS ? Promise.resolve() : new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('음성 엔진 스크립트를 불러오지 못했습니다.')), 15000);
    window.addEventListener('supertonic-ready', () => { clearTimeout(t); res(); }, { once: true });
  });

  btn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) { setStatus('읽을 문장을 입력해 주세요.', '#f59e0b'); input.focus(); return; }
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '음성 생성 중…';
    prog.style.display = 'block'; bar.style.width = '5%';
    setStatus('음성 엔진 준비 중…');
    let unsub = null;
    const t0 = performance.now();
    try {
      await ready();
      unsub = globalThis.SupertonicTTS.onProgress((m, pct) => { setStatus(`🎙 ${m}`); if (typeof pct === 'number') bar.style.width = `${Math.max(5, Math.min(100, pct <= 1 ? pct * 100 : pct))}%`; });
      const { url, duration } = await globalThis.SupertonicTTS.speak(text, {
        voice: $('vps-tts-voice').value, lang: $('vps-tts-lang').value,
        speed: Number(speed.value), steps: Number($('vps-tts-steps').value)
      });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = url;
      audio.src = url; audio.style.display = 'block';
      dl.href = url; dl.download = `ai-voice-${$('vps-tts-voice').value}-${Date.now()}.wav`; dl.style.display = 'inline-flex';
      bar.style.width = '100%';
      const backend = globalThis.SupertonicTTS.backend && globalThis.SupertonicTTS.backend();
      meta.textContent = `길이 ${duration.toFixed(1)}초 · 생성 ${((performance.now() - t0) / 1000).toFixed(1)}초 · 실행 ${backend === 'webgpu' ? 'WebGPU' : 'WebAssembly(CPU)'} · 모델 ${(globalThis.SupertonicTTS.source && globalThis.SupertonicTTS.source()) || '브라우저 캐시'}`;
      setStatus('✓ 완료 — 재생하거나 WAV로 내려받으세요.', '#10b981');
      audio.play().catch(() => { });
    } catch (err) {
      console.error('[TTS tab]', err);
      setStatus(`음성 생성 실패: ${err.message}`, '#ff5555');
    } finally {
      if (unsub) unsub();
      btn.disabled = false; btn.textContent = label;
      setTimeout(() => { prog.style.display = 'none'; bar.style.width = '0%'; }, 800);
    }
  });
})();
