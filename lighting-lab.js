/* ============================================================================
 * Lighting & Optics Lab (Prompt Architecture Lab · 03 / 04)
 * - 하나의 상태(LightingState + OpticsState)를 SVG 컨트롤러 · 슬라이더 · Three.js 프리뷰가 공유
 * - 결정적(deterministic) 영어 직렬화 → L1~L3 / 최종 프롬프트 / JSON / 프리셋에 반영
 * - Three.js는 패널이 처음 열리고 화면에 보일 때 지연 로드 (jsDelivr, MIT)
 * - 3D 흉상은 자체 절차적(procedural) 모델 — 외부 에셋 없음(라이선스 이슈 없음)
 * ==========================================================================*/
(function () {
  'use strict';

  // ── 1. 상수 · 프리셋 ──────────────────────────────────────────────────────
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
  // 3D 프리뷰 머리: "Infinite, 3D Head Scan" by Lee Perry-Smith, CC BY 3.0 (assets/models/LICENSE-lee-perry-smith-head.txt)
  const HEAD_URL = 'assets/models/lee-perry-smith-head.glb';
  const HEAD_Y = -0.06;

  const {
    LIGHT_PRESETS, PRESET_FIELDS, SOURCE_TEXT, TONAL_TEXT, FILL_TEXT, VOL_TYPE_TEXT, CAMERA_TYPES, CAMERA_TEXT,
    FOCALS, APERTURES, LENS_PRESETS, DEFAULT_LIGHTING, DEFAULT_OPTICS
  } = globalThis.PromptRules.optics;

  // ── 2. 유효성 검사 · 마이그레이션 ──────────────────────────────────────────
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const norm360 = (a) => ((Math.round(num(a, 0)) % 360) + 360) % 360;
  const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);
  const kelvin = (v) => (v === 'auto' || v == null || v === '') ? 'auto' : clamp(Math.round(num(v, 5600) / 100) * 100, 2000, 10000);

  function sanitizeLighting(raw) {
    const d = DEFAULT_LIGHTING();
    const r = (raw && typeof raw === 'object') ? raw : {};
    const v = (r.volumetric && typeof r.volumetric === 'object') ? r.volumetric : {};
    return {
      enabled: r.enabled === undefined ? d.enabled : !!r.enabled,
      preset: pick(r.preset, Object.keys(LIGHT_PRESETS), d.preset),
      originPreset: (r.originPreset && LIGHT_PRESETS[r.originPreset]) ? r.originPreset : null,
      azimuth: norm360(r.azimuth ?? d.azimuth),
      elevation: clamp(Math.round(num(r.elevation, d.elevation)), -90, 90),
      intensity: clamp(Math.round(num(r.intensity, d.intensity)), 0, 100),
      distance: clamp(Math.round(num(r.distance, d.distance) * 10) / 10, 0.5, 10),
      source: pick(r.source, ['auto', 'sunlight', 'led', 'fluorescent', 'tungsten', 'strobe'], d.source),
      quality: pick(r.quality, ['auto', 'soft', 'hard', 'custom'], d.quality),
      shadowHardness: clamp(Math.round(num(r.shadowHardness, d.shadowHardness)), 0, 100),
      tonalStyle: pick(r.tonalStyle, ['auto', 'balanced', 'high-key', 'low-key', 'high-contrast', 'low-contrast'], d.tonalStyle),
      fillLight: pick(r.fillLight, ['auto', 'off', 'low', 'medium', 'high'], d.fillLight),
      colorTemperatureK: kelvin(r.colorTemperatureK ?? d.colorTemperatureK),
      volumetric: {
        enabled: !!v.enabled,
        type: pick(v.type, ['haze', 'fog', 'dust', 'smoke'], d.volumetric.type),
        density: clamp(Math.round(num(v.density, d.volumetric.density)), 0, 100),
        visibility: pick(v.visibility, ['subtle', 'moderate', 'strong'], d.volumetric.visibility)
      }
    };
  }
  function sanitizeOptics(raw) {
    const d = DEFAULT_OPTICS();
    const r = (raw && typeof raw === 'object') ? raw : {};
    return {
      lensPreset: pick(r.lensPreset, Object.keys(LENS_PRESETS), d.lensPreset),
      originPreset: (r.originPreset && LENS_PRESETS[r.originPreset]) ? r.originPreset : null,
      cameraType: pick(r.cameraType, Object.keys(CAMERA_TYPES), d.cameraType),
      focal: pick(String(r.focal ?? 'auto'), ['auto', ...FOCALS], d.focal),
      aperture: pick(String(r.aperture ?? 'auto'), ['auto', ...APERTURES], d.aperture),
      whiteBalanceK: kelvin(r.whiteBalanceK ?? d.whiteBalanceK)
    };
  }

  // ── 3. 공유 상태 (단일 진실 공급원) ────────────────────────────────────────
  // panels: 03·04 패널이 펼쳐져 있을 때만 프롬프트에 반영 (기본: 접힘 = 반영 안 함, 값은 보존)
  const DEFAULT_PANELS = () => ({ lighting: false, optics: false });
  const state = { lighting: DEFAULT_LIGHTING(), optics: DEFAULT_OPTICS(), panels: DEFAULT_PANELS() };
  const lightingOn = (s) => s.lighting.enabled && (!s.panels || s.panels.lighting);
  const opticsOn = (s) => !s.panels || s.panels.optics;
  const listeners = new Set();
  const emit = (origin) => listeners.forEach(fn => { try { fn(state, origin); } catch (e) { console.error(e); } });

  function applyLightPreset(id) {
    const p = LIGHT_PRESETS[id];
    if (!p) return;
    const next = { ...state.lighting, preset: id, originPreset: null };
    if (id !== 'auto' && id !== 'custom') PRESET_FIELDS.forEach(k => { if (p[k] !== undefined) next[k] = p[k]; });
    if (id === 'custom') next.originPreset = state.lighting.originPreset;
    state.lighting = sanitizeLighting(next); // 원자적 교체
    emit('preset');
  }
  function editLighting(patch, origin) {
    const cur = state.lighting;
    const next = { ...cur, ...patch, volumetric: { ...cur.volumetric, ...(patch.volumetric || {}) } };
    // 직접 조작한 값(방향·세기·광원 성격)이 바뀌면 Custom 으로 전환, 출발 프리셋 기록
    const touchesPreset = Object.keys(patch).some(k => PRESET_FIELDS.includes(k) || k === 'shadowHardness');
    if (touchesPreset && cur.preset !== 'custom') { next.originPreset = cur.preset; next.preset = 'custom'; }
    state.lighting = sanitizeLighting(next);
    emit(origin || 'edit');
  }
  function applyLensPreset(id) {
    const p = LENS_PRESETS[id];
    if (!p) return;
    const next = { ...state.optics, lensPreset: id, originPreset: null };
    if (p.cameraType) Object.assign(next, { cameraType: p.cameraType, focal: p.focal, aperture: p.aperture });
    if (id === 'auto') Object.assign(next, { cameraType: 'auto', focal: 'auto', aperture: 'auto' });
    if (id === 'custom') next.originPreset = state.optics.originPreset;
    state.optics = sanitizeOptics(next);
    emit('optics-preset');
  }
  function editOptics(patch) {
    const cur = state.optics;
    const next = { ...cur, ...patch };
    const touches = ['cameraType', 'focal', 'aperture'].some(k => k in patch);
    if (touches && cur.lensPreset !== 'custom' && cur.lensPreset !== 'auto') { next.originPreset = cur.lensPreset; next.lensPreset = 'custom'; }
    state.optics = sanitizeOptics(next);
    emit('optics');
  }

  // ── 4. 직렬화 (결정적 영어 텍스트) ─────────────────────────────────────────
  function directionWords(az) {
    const a = norm360(az);
    const dirs = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left'];
    const d = dirs[Math.round(a / 45) % 8];
    if (d === 'front') return 'from the front (camera side)';
    if (d === 'back') return 'from directly behind the subject (backlight)';
    if (d === 'right' || d === 'left') return `from the ${d} side of the frame`;
    return `from the ${d} of the frame`;
  }
  function elevationWords(e) {
    if (e >= 75) return 'from directly overhead';
    if (e >= 45) return 'from high above';
    if (e >= 15) return 'from slightly above';
    if (e > -15) return 'at eye level';
    if (e > -45) return 'from slightly below';
    if (e > -75) return 'from low below';
    return 'from directly below';
  }
  function intensityWord(i) {
    if (i <= 0) return 'off';
    if (i < 25) return 'subtle';
    if (i < 50) return 'gentle';
    if (i < 75) return 'moderate';
    if (i < 90) return 'strong';
    return 'intense';
  }
  function kelvinWords(k) {
    const tone = k <= 3500 ? 'warm' : k <= 4800 ? 'neutral-warm' : k <= 6200 ? 'neutral daylight' : 'cool';
    return `${k}K ${tone}`;
  }
  function qualityWords(l) {
    if (l.quality === 'soft') return 'soft diffused light with gentle shadow edges';
    if (l.quality === 'hard') return 'hard light with crisp, defined shadows';
    if (l.quality === 'custom') {
      const h = l.shadowHardness;
      return h < 34 ? 'soft diffused light with gentle shadow edges' : h < 67 ? 'medium-soft light with moderately defined shadows' : 'hard light with crisp, defined shadows';
    }
    return '';
  }

  /** @returns {{lightingText:string, opticsText:string, text:string, keys:string[]}} */
  function serialize(s = state) {
    const l = s.lighting, o = s.optics;
    const lp = [], keys = [];
    if (lightingOn(s)) {
      const manual = l.preset !== 'auto';
      if (manual) {
        const name = l.preset === 'custom'
          ? (l.originPreset && l.originPreset !== 'auto' ? `custom lighting adapted from ${LIGHT_PRESETS[l.originPreset].label}` : 'custom lighting')
          : `${LIGHT_PRESETS[l.preset].label} lighting`;
        if (l.intensity <= 0) {
          lp.push(`${name}, key light off (ambient light only)`);
        } else {
          const dir = directionWords(l.azimuth);
          lp.push(`${name}: ${intensityWord(l.intensity)} key light ${dir}, ${elevationWords(l.elevation)}, about ${l.distance} m from the subject`);
          keys.push(dir.replace(/^from (the )?/, '').split(' (')[0]);
        }
      }
      if (l.source !== 'auto') lp.push(`${SOURCE_TEXT[l.source]} source`);
      const q = qualityWords(l); if (q) lp.push(q);
      if (l.colorTemperatureK !== 'auto') { lp.push(`color temperature ${kelvinWords(l.colorTemperatureK)}`); keys.push(`${l.colorTemperatureK}K`); }
      if (l.fillLight !== 'auto') lp.push(FILL_TEXT[l.fillLight]);
      if (l.tonalStyle !== 'auto') lp.push(TONAL_TEXT[l.tonalStyle]);
      if (l.volumetric.enabled && l.volumetric.density > 0) {
        const v = l.volumetric;
        const dens = v.density < 34 ? 'light' : v.density < 67 ? 'medium' : 'dense';
        lp.push(`${v.visibility} volumetric ${VOL_TYPE_TEXT[v.type]} (${dens} density) catching the light beams`);
        keys.push(VOL_TYPE_TEXT[v.type].split(' ').pop());
      }
    }
    const op = [];
    const lens = opticsOn(s) ? LENS_PRESETS[o.lensPreset] : null;
    if (lens && lens.text) { op.push(`shot on ${lens.text}`); keys.push(lens.text.split(' with ')[0].split(' (')[0]); }
    else if (opticsOn(s) && o.cameraType !== 'auto') op.push(`shot on ${CAMERA_TEXT[o.cameraType]}`);
    if (opticsOn(s) && o.focal !== 'auto') {
      const f = Number(o.focal);
      const feel = f <= 24 ? 'wide-angle perspective' : f <= 35 ? 'natural wide-normal perspective' : f <= 50 ? 'natural perspective' : f <= 105 ? 'flattering portrait compression' : 'strong telephoto compression';
      op.push(`${o.focal}mm (full-frame equivalent) focal length, ${feel}`); keys.push(`${o.focal}mm`);
    }
    if (opticsOn(s) && o.aperture !== 'auto') {
      const a = Number(o.aperture);
      const dof = a <= 2 ? 'shallow depth of field with creamy background blur' : a <= 4 ? 'moderate depth of field' : a <= 8 ? 'deep depth of field' : 'very deep focus, everything sharp';
      op.push(`f/${o.aperture} aperture, ${dof}`); keys.push(`f/${o.aperture}`);
    }
    if (opticsOn(s) && o.whiteBalanceK !== 'auto') op.push(`white balance set to ${o.whiteBalanceK}K`);

    const lightingText = lp.length ? `Lighting: ${lp.join('; ')}.` : '';
    const opticsText = op.length ? `Camera & optics: ${op.join(', ')}.` : '';
    return { lightingText, opticsText, text: [lightingText, opticsText].filter(Boolean).join(' '), keys: [...new Set(keys.filter(Boolean))] };
  }

  /** LLM 응답에 핵심 제약이 빠졌으면 결정적으로 보강 */
  function enforce(result, mode) {
    const s = serialize();
    if (!s.text || !result) return { text: result, appended: false, missing: [] };
    const low = result.toLowerCase();
    const missing = s.keys.filter(k => !low.includes(k.toLowerCase()));
    if (!missing.length) return { text: result, appended: false, missing };
    if (mode === 'zimage') return { text: `${result.trim()} ${s.text}`, appended: true, missing };
    // 4문단: Technical Architecture/Specification 문단 끝에 삽입, 없으면 Negative 앞
    const lines = result.split('\n');
    let hdr = lines.findIndex(x => /^\*\*.*(technical|architecture|specification).*\*\*/i.test(x.trim()));
    if (hdr !== -1) {
      let end = hdr + 1;
      while (end < lines.length && !/^\s*(\*\*|#)/.test(lines[end])) end++;
      let last = end - 1; while (last > hdr && !lines[last].trim()) last--;
      if (last === hdr) lines.splice(hdr + 1, 0, s.text); else lines[last] = `${lines[last].trimEnd()} ${s.text}`;
      return { text: lines.join('\n'), appended: true, missing };
    }
    const neg = lines.findIndex(x => /^#\s*negative/i.test(x.trim()));
    if (neg !== -1) { lines.splice(neg, 0, `**Lighting & Optics**`, s.text, ''); return { text: lines.join('\n'), appended: true, missing }; }
    return { text: `${result.trim()}\n\n**Lighting & Optics**\n${s.text}`, appended: true, missing };
  }

  function warnings(s = state) {
    const l = s.lighting, o = s.optics, w = [];
    const rear = l.azimuth > 100 && l.azimuth < 260;
    if (lightingOn(s)) {
      if (l.preset === 'direct-flash' || (l.preset === 'custom' && l.originPreset === 'direct-flash')) {
        if (rear) w.push('Direct Flash는 카메라 쪽 광원인데 광원이 피사체 뒤에 있습니다.');
      }
      if (l.volumetric.enabled && l.intensity === 0) w.push('볼류메트릭 효과는 빛줄기가 필요합니다 — 키 라이트 세기가 0입니다.');
      if (l.tonalStyle === 'high-key' && l.fillLight === 'off') w.push('High Key 톤에 보조광 Off는 서로 충돌할 수 있습니다.');
      if (l.tonalStyle === 'low-key' && l.fillLight === 'high') w.push('Low Key 톤에 강한 보조광은 서로 충돌할 수 있습니다.');
      if (l.source === 'sunlight' && l.distance < 3) w.push('태양광은 거리 개념이 약합니다 — 거리 값은 무시되거나 어색할 수 있습니다.');
      if (l.colorTemperatureK !== 'auto' && l.source === 'tungsten' && l.colorTemperatureK > 4000) w.push('텅스텐 광원은 보통 2700–3400K입니다.');
      if (l.colorTemperatureK !== 'auto' && (l.preset === 'golden-hour' || l.originPreset === 'golden-hour') && l.colorTemperatureK > 5000) w.push('골든아워는 보통 4000K 이하의 따뜻한 빛입니다.');
      if (l.elevation <= -60 && l.source === 'sunlight') w.push('태양광이 피사체 아래에서 올라오는 것은 물리적으로 어색합니다.');
    }
    if (!opticsOn(s)) return w;
    const lens = LENS_PRESETS[o.lensPreset === 'custom' ? o.originPreset : o.lensPreset];
    if (o.aperture !== 'auto') {
      const a = Number(o.aperture);
      if (lens && lens.maxAperture && a < lens.maxAperture) w.push(`${lens.label}의 최대 개방은 f/${lens.maxAperture}입니다 — f/${o.aperture}는 불가능합니다.`);
      if (o.cameraType === 'smartphone' && (a < 1.4 || a > 2.8)) w.push('스마트폰 카메라는 조리개가 고정(약 f/1.5–f/2.8)이라 이 값은 비현실적입니다.');
      if (o.cameraType === 'ccd-compact' && a < 2) w.push('CCD 컴팩트 카메라는 보통 f/2.8 이상입니다.');
    }
    if (lens && lens.fixedFocal && o.focal !== 'auto' && o.focal !== lens.fixedFocal) w.push(`${lens.label}은(는) 단렌즈 ${lens.fixedFocal}mm(환산)입니다 — ${o.focal}mm와 맞지 않습니다.`);
    if (o.cameraType === 'smartphone' && Number(o.focal) >= 200) w.push('스마트폰 메인 카메라로 200mm 환산은 불가능합니다.');
    return w;
  }

  function toJSON() {
    const s = serialize();
    return {
      lighting: lightingOn(state) ? JSON.parse(JSON.stringify(state.lighting)) : null,
      optics: opticsOn(state) ? JSON.parse(JSON.stringify(state.optics)) : null,
      text: s.text
    };
  }

  // Kelvin → RGB (Tanner Helland 근사)
  function kelvinToRGB(k) {
    const t = clamp(k, 1000, 40000) / 100;
    let r, g, b;
    if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
    else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
  }

  // ── 5. DOM 바인딩 ──────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const SVG_C = 100, SVG_R = 78;
  let generatedSnapshot = null;

  // 펼침 = 프롬프트에 반영, 접힘 = 반영 안 함 (값은 그대로 보존)
  function bindPanel(btnId, bodyId, key, onOpen) {
    const btn = $(btnId), body = $(bodyId);
    if (!btn || !body) return;
    btn.addEventListener('click', () => {
      state.panels = { ...state.panels, [key]: !state.panels[key] };
      emit('panel');
      if (state.panels[key] && onOpen) onOpen();
    });
  }
  function syncPanel(btnId, bodyId, key) {
    const btn = $(btnId), body = $(bodyId), open = !!state.panels[key];
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (body) body.hidden = !open;
    const panel = btn && btn.closest('.lab-panel');
    if (panel) panel.classList.toggle('is-collapsed', !open);
  }

  function syncPair(rangeId, numId, getter, setter) {
    const r = $(rangeId), n = $(numId);
    const handler = (el) => () => { if (el.value === '' || !Number.isFinite(Number(el.value))) return; setter(Number(el.value)); };
    if (r) r.addEventListener('input', handler(r));
    if (n) n.addEventListener('change', handler(n));
    return () => { const v = getter(); if (r && document.activeElement !== r) r.value = v; if (n && document.activeElement !== n) n.value = v; if (r) r.setAttribute('aria-valuetext', String(v)); };
  }

  function initUI() {
    const root = $('lighting-panel');
    if (!root) return;
    const L = () => state.lighting, O = () => state.optics;
    const updaters = [];

    // 프리셋 · 토글 · 셀렉트
    $('lt-enabled')?.addEventListener('change', e => editLighting({ enabled: e.target.checked }, 'toggle'));
    $('lt-preset')?.addEventListener('change', e => applyLightPreset(e.target.value));
    const selects = { 'lt-source': 'source', 'lt-quality': 'quality', 'lt-tonal': 'tonalStyle', 'lt-fill': 'fillLight' };
    Object.entries(selects).forEach(([id, key]) => $(id)?.addEventListener('change', e => editLighting({ [key]: e.target.value })));

    updaters.push(syncPair('lt-azimuth', 'lt-azimuth-num', () => L().azimuth, v => editLighting({ azimuth: v }, 'slider')));
    updaters.push(syncPair('lt-elevation', 'lt-elevation-num', () => L().elevation, v => editLighting({ elevation: v }, 'slider')));
    updaters.push(syncPair('lt-intensity', 'lt-intensity-num', () => L().intensity, v => editLighting({ intensity: v }, 'slider')));
    updaters.push(syncPair('lt-distance', 'lt-distance-num', () => L().distance, v => editLighting({ distance: v }, 'slider')));
    updaters.push(syncPair('lt-hardness', 'lt-hardness-num', () => L().shadowHardness, v => editLighting({ shadowHardness: v, quality: 'custom' }, 'slider')));

    // 색온도 (Auto 체크 + 2000–10000K)
    const ktAuto = $('lt-kelvin-auto');
    ktAuto?.addEventListener('change', e => editLighting({ colorTemperatureK: e.target.checked ? 'auto' : 5600 }));
    updaters.push(syncPair('lt-kelvin', 'lt-kelvin-num', () => L().colorTemperatureK === 'auto' ? 5600 : L().colorTemperatureK, v => editLighting({ colorTemperatureK: v }, 'slider')));

    // 볼류메트릭
    $('lt-vol-enabled')?.addEventListener('change', e => editLighting({ volumetric: { enabled: e.target.checked } }));
    $('lt-vol-type')?.addEventListener('change', e => editLighting({ volumetric: { type: e.target.value } }));
    $('lt-vol-visibility')?.addEventListener('change', e => editLighting({ volumetric: { visibility: e.target.value } }));
    updaters.push(syncPair('lt-vol-density', 'lt-vol-density-num', () => L().volumetric.density, v => editLighting({ volumetric: { density: v } }, 'slider')));

    // 광학
    $('op-lens')?.addEventListener('change', e => applyLensPreset(e.target.value));
    $('op-camera')?.addEventListener('change', e => editOptics({ cameraType: e.target.value }));
    $('op-focal')?.addEventListener('change', e => editOptics({ focal: e.target.value }));
    $('op-aperture')?.addEventListener('change', e => editOptics({ aperture: e.target.value }));
    $('op-wb-auto')?.addEventListener('change', e => editOptics({ whiteBalanceK: e.target.checked ? 'auto' : 5600 }));
    updaters.push(syncPair('op-wb', 'op-wb-num', () => O().whiteBalanceK === 'auto' ? 5600 : O().whiteBalanceK, v => editOptics({ whiteBalanceK: v })));

    initSvgController(updaters);

    bindPanel('lt-toggle', 'lt-body', 'lighting', () => Preview.maybeStart());
    bindPanel('op-toggle', 'op-body', 'optics');

    // 상태 → UI 반영
    const render = () => {
      const l = L(), o = O();
      syncPanel('lt-toggle', 'lt-body', 'lighting'); syncPanel('op-toggle', 'op-body', 'optics');
      const setVal = (id, v) => { const el = $(id); if (el && el.value !== String(v)) el.value = String(v); };
      if ($('lt-enabled')) $('lt-enabled').checked = l.enabled;
      root.classList.toggle('is-disabled', !l.enabled);
      setVal('lt-preset', l.preset);
      Object.entries(selects).forEach(([id, key]) => setVal(id, l[key]));
      if (ktAuto) ktAuto.checked = l.colorTemperatureK === 'auto';
      ['lt-kelvin', 'lt-kelvin-num'].forEach(id => { const el = $(id); if (el) el.disabled = l.colorTemperatureK === 'auto'; });
      if ($('lt-vol-enabled')) $('lt-vol-enabled').checked = l.volumetric.enabled;
      setVal('lt-vol-type', l.volumetric.type); setVal('lt-vol-visibility', l.volumetric.visibility);
      ['lt-vol-type', 'lt-vol-visibility', 'lt-vol-density', 'lt-vol-density-num'].forEach(id => { const el = $(id); if (el) el.disabled = !l.volumetric.enabled; });
      const origin = $('lt-origin');
      if (origin) origin.textContent = (l.preset === 'custom' && l.originPreset) ? `(${LIGHT_PRESETS[l.originPreset].label} 기반)` : '';
      setVal('op-lens', o.lensPreset); setVal('op-camera', o.cameraType); setVal('op-focal', o.focal); setVal('op-aperture', o.aperture);
      if ($('op-wb-auto')) $('op-wb-auto').checked = o.whiteBalanceK === 'auto';
      ['op-wb', 'op-wb-num'].forEach(id => { const el = $(id); if (el) el.disabled = o.whiteBalanceK === 'auto'; });
      const oo = $('op-origin');
      if (oo) oo.textContent = (o.lensPreset === 'custom' && o.originPreset && o.originPreset !== 'auto') ? `(${LENS_PRESETS[o.originPreset].label} 기반)` : '';
      updaters.forEach(fn => fn && fn());
      // 경고
      const w = warnings();
      const box = $('lo-warnings');
      if (box) { box.innerHTML = ''; w.forEach(t => { const li = document.createElement('li'); li.textContent = t; box.appendChild(li); }); box.hidden = !w.length; }
      // 직렬화 미리보기
      const pv = $('lo-serialized');
      if (pv) pv.textContent = serialize().text || 'Auto — 조명·카메라 지정 없음 (모델이 장면에 맞게 선택)';
      renderExamples();
      // 재생성 필요 배지
      const badge = $('regen-badge');
      if (badge) badge.hidden = !(generatedSnapshot && generatedSnapshot !== snapshot());
    };
    listeners.add(render);
    render();
  }

  // ── 5-b. 예시 사진 (img/presets/*.webp, 같은 석고 흉상으로 촬영한 참고용) ───────────
  const EX_BASE = 'img/presets/';
  const TONAL_LABEL = { balanced: 'Balanced', 'high-key': 'High Key', 'low-key': 'Low Key', 'high-contrast': 'High Contrast', 'low-contrast': 'Low Contrast' };
  const VOL_LABEL = { haze: 'Haze · 연무', fog: 'Fog · 안개', dust: 'Dust · 먼지', smoke: 'Smoke · 연기' };
  function exampleCards() {
    const l = state.lighting, o = state.optics, cards = [];
    if (lightingOn(state)) {
      if (l.preset === 'auto') cards.push({ kind: '조명', src: 'base', label: 'Auto (장면에 맞게)', approx: false });
      else if (l.preset === 'custom') {
        const org = l.originPreset && l.originPreset !== 'auto' ? l.originPreset : null;
        cards.push(org ? { kind: '조명', src: `lighting/${org}`, label: `Custom · ${LIGHT_PRESETS[org].label} 기반`, approx: true }
                       : { kind: '조명', src: 'base', label: 'Custom', approx: true });
      } else cards.push({ kind: '조명', src: `lighting/${l.preset}`, label: LIGHT_PRESETS[l.preset].label, approx: false });
      if (l.tonalStyle !== 'auto') cards.push({ kind: '톤', src: `tonal/${l.tonalStyle}`, label: TONAL_LABEL[l.tonalStyle], approx: false });
      if (l.volumetric.enabled && l.volumetric.density > 0) cards.push({ kind: '대기', src: `volumetric/${l.volumetric.type}`, label: VOL_LABEL[l.volumetric.type], approx: false });
    }
    if (opticsOn(state) && o.lensPreset !== 'auto') {
      const id = o.lensPreset === 'custom' ? (o.originPreset && o.originPreset !== 'auto' ? o.originPreset : null) : o.lensPreset;
      if (id) cards.push({ kind: '렌즈', src: `lens/${id}`, label: (o.lensPreset === 'custom' ? 'Custom · ' : '') + LENS_PRESETS[id].label.split(' (')[0] + (o.lensPreset === 'custom' ? ' 기반' : ''), approx: o.lensPreset === 'custom' });
    }
    return cards;
  }
  let lastExKey = '';
  function renderExamples() {
    const box = $('lo-examples'); if (!box) return;
    const cards = exampleCards();
    const key = JSON.stringify(cards);
    if (key === lastExKey) return; // 같은 내용이면 다시 그리지 않음 (드래그 중 깜빡임 방지)
    lastExKey = key;
    box.innerHTML = '';
    cards.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lo-ex' + (c.approx ? ' is-approx' : '');
      b.title = `${c.kind}: ${c.label} — 클릭하면 크게 보기`;
      const img = document.createElement('img');
      img.src = `${EX_BASE}${c.src}.webp`; img.alt = `${c.kind} 예시: ${c.label}`; img.loading = 'lazy'; img.decoding = 'async';
      img.onerror = () => { b.classList.add('is-missing'); img.remove(); };
      const cap = document.createElement('span'); cap.className = 'lo-ex-cap';
      cap.innerHTML = `<em>${c.kind}</em> ${c.label.replace(/</g, '&lt;')}`;
      b.append(img, cap);
      b.addEventListener('click', () => {
        const dlg = $('lo-zoom'); if (!dlg || !dlg.showModal) return;
        $('lo-zoom-img').src = img.src; $('lo-zoom-img').alt = img.alt;
        $('lo-zoom-cap').textContent = `${c.kind} · ${c.label}${c.approx ? ' (직접 조정한 값과 다를 수 있음)' : ''} — 예시 사진 · 실제 결과는 프롬프트·장면에 따라 달라집니다`;
        dlg.showModal();
      });
      box.appendChild(b);
    });
    if (!cards.length) box.innerHTML = '<span class="lo-ex-empty">03·04가 접혀 있어 조명·카메라는 프롬프트에 넣지 않습니다. 펼치면 반영됩니다.</span>';
  }

  // ── 6. SVG 광원 위치 컨트롤러 ──────────────────────────────────────────────
  // 위에서 본 반지름 ↔ 거리 (로그 눈금: 0.5m = 안쪽 원, 10m = 바깥 원 → 가까운 거리를 세밀하게)
  const R_MIN = 22, D_MIN = 0.5, D_MAX = 10;
  const distToR = (d) => R_MIN + (SVG_R - R_MIN) * Math.log(clamp(d, D_MIN, D_MAX) / D_MIN) / Math.log(D_MAX / D_MIN);
  const rToDist = (r) => Math.round(D_MIN * Math.pow(D_MAX / D_MIN, clamp((r - R_MIN) / (SVG_R - R_MIN), 0, 1)) * 10) / 10;

  function initSvgController(updaters) {
    const svg = $('lt-svg');
    if (!svg) return;
    const handle = $('lt-handle'), beam = $('lt-beam'), label = $('lt-angle-label'), dist = $('lt-dist-label');
    let dragging = false, raf = 0, pending = null;

    const toLocal = (evt) => {
      const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
      const m = svg.getScreenCTM(); if (!m) return null;
      return pt.matrixTransform(m.inverse());
    };
    // 방향 = 각도, 거리 = 중심에서 떨어진 정도
    const fromPoint = (p) => ({
      azimuth: norm360(Math.atan2(p.x - SVG_C, p.y - SVG_C) * 180 / Math.PI),
      distance: rToDist(Math.hypot(p.x - SVG_C, p.y - SVG_C))
    });
    const commit = () => { raf = 0; if (pending) { editLighting(pending, 'svg'); pending = null; } };
    const queue = (patch) => { pending = patch; if (!raf) raf = requestAnimationFrame(commit); };

    svg.addEventListener('pointerdown', (e) => {
      const p = toLocal(e); if (!p) return;
      if (Math.hypot(p.x - SVG_C, p.y - SVG_C) < 12) return; // 피사체(중심) 클릭은 무시
      dragging = true; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging');
      queue(fromPoint(p)); e.preventDefault();
      handle?.focus({ preventScroll: true });
    });
    svg.addEventListener('pointermove', (e) => { if (!dragging) return; const p = toLocal(e); if (p) queue(fromPoint(p)); });
    const end = (e) => { if (!dragging) return; dragging = false; svg.classList.remove('dragging'); try { svg.releasePointerCapture(e.pointerId); } catch (_) { } };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);

    // 휠: 세기 ±5 · Shift+휠: 고도 ±5 (Shift+휠은 브라우저에 따라 deltaX로 옴)
    svg.addEventListener('wheel', (e) => {
      const delta = e.deltaY || e.deltaX; if (!delta) return;
      e.preventDefault();
      const l = state.lighting, dir = delta < 0 ? 1 : -1;
      editLighting(e.shiftKey ? { elevation: l.elevation + dir * 5 } : { intensity: l.intensity + dir * 5 }, 'wheel');
    }, { passive: false });

    handle?.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 15 : 1, l = state.lighting;
      const map = {
        ArrowRight: { azimuth: l.azimuth + step }, ArrowLeft: { azimuth: l.azimuth - step },
        ArrowUp: { elevation: l.elevation + step }, ArrowDown: { elevation: l.elevation - step },
        PageUp: { distance: l.distance + 0.5 }, PageDown: { distance: l.distance - 0.5 },
        '+': { intensity: l.intensity + 5 }, '=': { intensity: l.intensity + 5 }, '-': { intensity: l.intensity - 5 },
        Home: { azimuth: 0 }, End: { azimuth: 180 }
      };
      if (map[e.key]) { e.preventDefault(); editLighting(map[e.key], 'keyboard'); }
    });

    updaters.push(() => {
      const l = state.lighting, a = l.azimuth * Math.PI / 180;
      const r = distToR(l.distance); // 점 위치 = 방향 + 거리만 표현 (고도는 숫자·3D로)
      const x = SVG_C + r * Math.sin(a), y = SVG_C + r * Math.cos(a);
      if (handle) {
        handle.setAttribute('cx', x.toFixed(2)); handle.setAttribute('cy', y.toFixed(2));
        handle.setAttribute('r', (6 + l.intensity / 100 * 5).toFixed(1));
        handle.setAttribute('aria-valuenow', String(l.azimuth));
        handle.setAttribute('aria-valuetext', `방위각 ${l.azimuth}도 (${directionWords(l.azimuth)}), 거리 ${l.distance}미터, 세기 ${l.intensity}, 고도 ${l.elevation}도`);
        const [kr, kg, kb] = kelvinToRGB(l.colorTemperatureK === 'auto' ? 5600 : l.colorTemperatureK);
        handle.style.fill = `rgb(${Math.round(kr * 255)},${Math.round(kg * 255)},${Math.round(kb * 255)})`;
        handle.style.opacity = l.intensity === 0 ? 0.35 : 1;
      }
      if (beam) { beam.setAttribute('x2', x.toFixed(2)); beam.setAttribute('y2', y.toFixed(2)); }
      if (dist) {
        // 거리 글자는 점 바깥쪽(중심 반대편)에, 원 밖으로 안 나가게
        const lr = Math.min(r + 15, SVG_R + 14);
        dist.setAttribute('x', (SVG_C + lr * Math.sin(a)).toFixed(1));
        dist.setAttribute('y', (SVG_C + lr * Math.cos(a) + 2.5).toFixed(1));
        dist.textContent = `${l.distance}m`;
      }
      if (label) label.textContent = `${l.azimuth}° · 고도 ${l.elevation >= 0 ? '+' : ''}${l.elevation}° · 세기 ${l.intensity}%`;
    });
  }

  // ── 7. Three.js 개념 프리뷰 (지연 로드 · 온디맨드 렌더) ────────────────────
  const Preview = {
    started: false, THREE: null, renderer: null, scene: null, camera: null, key: null, fill: null, gizmo: null, ro: null, io: null,
    orbit: { theta: 0.35, phi: 1.35, radius: 1.1, target: [0, 0.07, 0] },
    maybeStart() {
      if (this.started) { this.request(); return; }
      const wrap = $('lt-3d');
      const body = $('lt-body');
      if (!wrap || !body || body.hidden) return;
      // 화면에 보일 때만 로드
      if (!this.io && 'IntersectionObserver' in window) {
        this.io = new IntersectionObserver((ents) => { if (ents.some(e => e.isIntersecting) && !$('lt-body').hidden) { this.io.disconnect(); this.io = null; this.start(); } }, { rootMargin: '200px' });
        this.io.observe(wrap);
      } else if (!this.io) this.start();
    },
    status(msg, retry) {
      const s = $('lt-3d-status'); if (!s) return;
      s.hidden = !msg; s.querySelector('span').textContent = msg || '';
      const b = s.querySelector('button'); if (b) b.hidden = !retry;
    },
    async start() {
      if (this.started) return;
      this.started = true;
      this.status('3D 프리뷰 불러오는 중…', false);
      try {
        this.THREE = window.__THREE_OVERRIDE__ || await import(/* webpackIgnore: true */ THREE_URL);
        this.build();
        if (!this._headPending) this.status('', false);
      } catch (err) {
        console.warn('[LightingLab] 3D preview unavailable:', err);
        this.teardown();
        this.started = false;
        this.status('3D 프리뷰를 불러오지 못했습니다 (WebGL 미지원 또는 네트워크). 조명 설정·프롬프트 반영은 정상 동작합니다.', true);
      }
    },
    build() {
      const T = this.THREE, wrap = $('lt-3d'), canvas = $('lt-canvas');
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL not supported');
      const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer = renderer;
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.teardown(); this.started = false; this.status('WebGL 컨텍스트가 끊어졌습니다.', true); }, { once: true });

      const scene = new T.Scene(); this.scene = scene;
      const camera = new T.PerspectiveCamera(35, 1, 0.05, 50); this.camera = camera;

      // 절차적 흉상(머리·목·어깨) — 회색 무광 재질
      const mat = new T.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.92, metalness: 0 }); // 석고 느낌의 무광 오프화이트
      const bust = new T.Group();
      const add = (geo, pos, scale) => { const m = new T.Mesh(geo, mat); m.position.set(...pos); if (scale) m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; bust.add(m); return m; };
      add(new T.SphereGeometry(0.1, 48, 32), [0, 0.13, 0], [0.86, 1.12, 0.95]);           // 머리
      add(new T.SphereGeometry(0.04, 24, 16), [0, 0.07, 0.045], [1.6, 0.9, 1]);           // 턱·광대 볼륨
      add(new T.ConeGeometry(0.014, 0.04, 16), [0, 0.125, 0.098], null).rotation.x = Math.PI / 2; // 코(정면 +Z)
      add(new T.SphereGeometry(0.018, 16, 12), [0.087, 0.125, -0.005], [0.5, 1, 0.8]);   // 귀 R
      add(new T.SphereGeometry(0.018, 16, 12), [-0.087, 0.125, -0.005], [0.5, 1, 0.8]);  // 귀 L
      add(new T.CylinderGeometry(0.045, 0.055, 0.1, 32), [0, -0.0, -0.01]);               // 목
      add(new T.SphereGeometry(0.2, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), [0, -0.1, -0.01], [1.1, 0.42, 0.55]); // 어깨
      bust.position.y = -0.02;
      scene.add(bust);
      this.bust = bust; this.plaster = mat;
      // 석고 머리 모델을 받을 때까지 '불러오는 중'만 표시 → 도착하면 바로 석고상.
      // 실패하거나 5초가 넘으면 그때만 절차적 흉상으로 대체
      const proc = bust.children.slice(0, 7);
      proc.forEach(m => { m.visible = false; });
      this._headPending = true;
      this.status('3D 모델 불러오는 중…', false);
      const fallback = () => {
        if (!this._headPending || !this.scene) return;
        this._headPending = false;
        proc.forEach(m => { m.visible = true; });
        this.status('', false); this.request();
      };
      const timer = setTimeout(fallback, 5000);
      this.loadHead(T, mat).then(head => {
        if (!head || !this.scene) return;
        clearTimeout(timer);
        this._headPending = false;
        proc.forEach(m => { m.visible = false; });
        const ped = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 0.045, 48), mat);
        ped.position.set(0, -0.0825, 0); ped.castShadow = true; ped.receiveShadow = true;
        bust.add(ped, head);
        this.status('', false); this.request();
      }).catch(err => { console.warn('[LightingLab] head scan not loaded, using procedural bust:', err); clearTimeout(timer); fallback(); });

      const floor = new T.Mesh(new T.CircleGeometry(0.6, 48), new T.ShadowMaterial({ opacity: 0.25 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.125; floor.receiveShadow = true; scene.add(floor);

      this.fill = new T.HemisphereLight(0xdfe6f0, 0x2a2d33, 0.3); scene.add(this.fill);
      const key = new T.SpotLight(0xffffff, 3, 0, Math.PI / 5, 0.5, 0);
      key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.camera.near = 0.05; key.shadow.camera.far = 15;
      key.target.position.set(0, 0.12, 0); scene.add(key); scene.add(key.target); this.key = key;
      this.gizmo = new T.Mesh(new T.SphereGeometry(0.02, 16, 12), new T.MeshBasicMaterial({ color: 0xffffff }));
      scene.add(this.gizmo);
      this.axis = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 }));
      scene.add(this.axis);

      this.bindOrbit(canvas);
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(wrap);
      this.onState = () => this.request();
      listeners.add(this.onState);
      document.addEventListener('visibilitychange', this.onVis = () => { if (!document.hidden) this.request(); });
      this.resize();
    },
    // 최소 GLB 파서: 메시 1개(position·normal·index)만 읽어 BufferGeometry 생성 (추가 로더 불필요)
    async loadHead(T, mat) {
      const res = await fetch(HEAD_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer(), dv = new DataView(buf);
      if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB');
      const jsonLen = dv.getUint32(12, true);
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
      const binStart = 20 + jsonLen + 8;
      const prim = json.meshes[0].primitives[0];
      const read = (accIdx) => {
        const a = json.accessors[accIdx], v = json.bufferViews[a.bufferView];
        const off = binStart + (v.byteOffset || 0) + (a.byteOffset || 0);
        const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
        const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
        return new Ctor(buf.slice(off, off + a.count * comps * Ctor.BYTES_PER_ELEMENT));
      };
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(read(prim.attributes.POSITION), 3));
      if (prim.attributes.NORMAL !== undefined) geo.setAttribute('normal', new T.BufferAttribute(read(prim.attributes.NORMAL), 3));
      else geo.computeVertexNormals();
      if (prim.indices !== undefined) geo.setIndex(new T.BufferAttribute(read(prim.indices), 1));
      // 크기·위치 맞춤: 목까지 높이 약 0.34, 목 아래가 어깨 받침에 묻히도록
      geo.computeBoundingBox();
      const bb = geo.boundingBox, h = bb.max.y - bb.min.y, k = 0.34 / h;
      geo.translate(-(bb.max.x + bb.min.x) / 2, -bb.min.y, -(bb.max.z + bb.min.z) / 2);
      geo.scale(k, k, k);
      const head = new T.Mesh(geo, mat);
      head.position.set(0, HEAD_Y, 0.005);
      head.castShadow = true; head.receiveShadow = true;
      return head;
    },
    bindOrbit(canvas) {
      let drag = null;
      canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging'); });
      canvas.addEventListener('pointermove', (e) => {
        if (!drag) return; const o = this.orbit;
        o.theta -= (e.clientX - drag.x) * 0.01; o.phi = clamp(o.phi - (e.clientY - drag.y) * 0.01, 0.25, 2.6);
        drag = { x: e.clientX, y: e.clientY }; this.request(); // 카메라만 이동 — 조명 상태는 변경하지 않음
      });
      const up = (e) => { drag = null; canvas.classList.remove('dragging'); try { canvas.releasePointerCapture(e.pointerId); } catch (_) { } };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.orbit.radius = clamp(this.orbit.radius * (e.deltaY > 0 ? 1.08 : 0.93), 0.5, 3); this.request(); }, { passive: false });
    },
    resetView() { this.orbit = { theta: 0.35, phi: 1.35, radius: 1.1, target: [0, 0.07, 0] }; this.request(); },
    resize() {
      if (!this.renderer) return;
      const wrap = $('lt-3d'); const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
      this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.request();
    },
    _raf: 0,
    request() { if (!this.renderer || this._raf || document.hidden) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); }); },
    draw() {
      const T = this.THREE, l = state.lighting, o = this.orbit;
      if (!T || !this.renderer) return;
      // 카메라(오빗)
      const [tx, ty, tz] = o.target;
      this.camera.position.set(tx + o.radius * Math.sin(o.phi) * Math.sin(o.theta), ty + o.radius * Math.cos(o.phi), tz + o.radius * Math.sin(o.phi) * Math.cos(o.theta));
      this.camera.lookAt(tx, ty, tz);
      // 광원: x=d·cos e·sin a, y=d·sin e, z=d·cos e·cos a (+Z 정면, +X 오른쪽). 시각용 거리는 0.35~1.0 으로 압축
      const a = l.azimuth * Math.PI / 180, e = l.elevation * Math.PI / 180;
      const d = 0.35 + (l.distance - 0.5) / 9.5 * 0.65;
      const pos = [d * Math.cos(e) * Math.sin(a), 0.12 + d * Math.sin(e), d * Math.cos(e) * Math.cos(a)];
      this.key.position.set(...pos); this.gizmo.position.set(...pos);
      this.axis.geometry.setFromPoints([new T.Vector3(0, 0.12, 0), new T.Vector3(...pos)]);
      const on = l.enabled && l.intensity > 0;
      const [r, g, b] = kelvinToRGB(l.colorTemperatureK === 'auto' ? 5600 : l.colorTemperatureK);
      this.key.color.setRGB(r, g, b); this.gizmo.material.color.setRGB(r, g, b);
      this.key.intensity = on ? (l.intensity / 100) * 6 : 0;
      this.gizmo.visible = l.enabled;
      const hard = l.quality === 'hard' ? 1 : l.quality === 'soft' ? 0 : l.quality === 'custom' ? l.shadowHardness / 100 : 0.5;
      this.key.penumbra = 1 - hard * 0.9; this.key.shadow.radius = 1 + (1 - hard) * 10;
      const fillMap = { off: 0.04, low: 0.18, medium: 0.38, high: 0.75, auto: 0.3 };
      this.fill.intensity = l.enabled ? fillMap[l.fillLight] : 0.6;
      const expo = { 'high-key': 1.45, 'low-key': 0.7, 'high-contrast': 1.1, 'low-contrast': 0.9, balanced: 1, auto: 1 };
      this.renderer.toneMappingExposure = l.enabled ? expo[l.tonalStyle] : 1;
      if (l.enabled && l.volumetric.enabled && l.volumetric.density > 0) {
        const vis = { subtle: 0.6, moderate: 1, strong: 1.6 }[l.volumetric.visibility];
        const col = l.volumetric.type === 'smoke' ? 0x777a80 : l.volumetric.type === 'dust' ? 0xa59a85 : 0xb9c0c9;
        this.scene.fog = new T.FogExp2(col, l.volumetric.density / 100 * 1.2 * vis);
      } else this.scene.fog = null;
      this.renderer.render(this.scene, this.camera);
    },
    teardown() {
      try {
        if (this.onState) listeners.delete(this.onState);
        if (this.onVis) document.removeEventListener('visibilitychange', this.onVis);
        this.ro?.disconnect(); this.ro = null;
        this.scene?.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => m.dispose?.()); });
        this.renderer?.dispose(); this.renderer = null; this.scene = null;
      } catch (_) { }
    }
  };
  window.addEventListener('pagehide', () => Preview.teardown());

  // ── 8. 재생성 필요 추적 ────────────────────────────────────────────────────
  const snapshot = () => JSON.stringify(state);
  function markGenerated() { generatedSnapshot = snapshot(); emit('generated'); }
  /** 조명/광학 외 다른 파라미터가 바뀌었을 때 (생성 이후에만 의미 있음) */
  function markDirty() { if (generatedSnapshot) { generatedSnapshot = '__dirty__'; emit('dirty'); } }

  // ── 9. 공개 API ───────────────────────────────────────────────────────────
  window.LightingLab = {
    getState: () => JSON.parse(JSON.stringify(state)),
    serialize, enforce, warnings, toJSON, kelvinToRGB, directionWords, intensityWord,
    applyLightPreset, applyLensPreset,
    setLighting: (patch) => editLighting(patch, 'api'),
    setOptics: (patch) => editOptics(patch),
    /** 프리셋 로드 (구버전 프리셋은 기본값으로 마이그레이션) */
    load(lighting, optics, panels) {
      state.lighting = sanitizeLighting(lighting); state.optics = sanitizeOptics(optics);
      // 펼침 정보가 없는 예전 프리셋: 직접 고른 값이 있으면 펼친 상태로
      const o = state.optics;
      state.panels = (panels && typeof panels === 'object')
        ? { lighting: !!panels.lighting, optics: !!panels.optics }
        : { lighting: state.lighting.preset !== 'auto', optics: [o.lensPreset, o.cameraType, o.focal, o.aperture].some(v => v !== 'auto') };
      // '사용' 체크는 없어지고 접힘이 그 역할 → 예전에 꺼 둔 조명은 접힌 상태로 옮김
      if (!state.lighting.enabled) { state.panels.lighting = false; state.lighting.enabled = true; }
      emit('load');
      if (state.panels.lighting) Preview.maybeStart();
    },
    reset() { state.lighting = DEFAULT_LIGHTING(); state.optics = DEFAULT_OPTICS(); state.panels = DEFAULT_PANELS(); emit('reset'); },
    applied: () => ({ lighting: lightingOn(state), optics: opticsOn(state) }),
    setPanel(key, open) { state.panels = { ...state.panels, [key]: !!open }; emit('panel'); if (key === 'lighting' && open) Preview.maybeStart(); },
    markGenerated, markDirty,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    preview: Preview,
    PRESETS: LIGHT_PRESETS, LENSES: LENS_PRESETS
  };

  const boot = () => {
    initUI();
    $('lt-3d-retry')?.addEventListener('click', () => { Preview.status('', false); Preview.start(); });
    $('lt-3d-reset')?.addEventListener('click', () => Preview.resetView());
    $('lo-zoom')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    Preview.maybeStart();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
