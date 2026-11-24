/*
 * AI_PROD_OS · Supertonic 3 브라우저 TTS 엔진
 * - 사용자의 브라우저에서 직접 음성을 만든다 (서버·API 비용 0원)
 * - 모델(약 400MB)은 처음 한 번만 받고 Cache API에 저장해 재사용
 * - WebGPU가 되면 WebGPU, 아니면 WebAssembly(CPU)로 실행
 */
import { loadTextToSpeech, loadVoiceStyle, writeWavFile } from './helper.js';

const MODEL_BASE = globalThis.SUPERTONIC_BASE ||
  'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46';
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const CACHE_NAME = 'supertonic3-v1';

const state = { tts: null, loading: null, styles: {}, backend: null, listeners: new Set() };

function emit(msg, pct) { state.listeners.forEach(fn => { try { fn(msg, pct); } catch (e) { } }); }

// 진행률 표시 + Cache API 저장
async function cachedFetch(url) {
  let cache = null;
  try { cache = await caches.open(CACHE_NAME); } catch (e) { }
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`모델 다운로드 실패 (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const name = url.split('/').pop();
  let buf;
  if (res.body && total > 5e6) {
    const reader = res.body.getReader();
    const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      emit(`음성 모델 받는 중 · ${name} ${Math.round(got / 1e6)}/${Math.round(total / 1e6)}MB`, got / total);
    }
    const out = new Uint8Array(got); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    buf = out.buffer;
  } else {
    buf = await res.arrayBuffer();
  }
  if (cache) { try { await cache.put(url, new Response(buf.slice(0))); } catch (e) { } }
  return buf;
}
globalThis.__stFetch = cachedFetch;

async function load() {
  if (state.tts) return state.tts;
  if (state.loading) return state.loading;
  state.loading = (async () => {
    if (!globalThis.ort) throw new Error('ONNX Runtime을 불러오지 못했습니다.');
    globalThis.ort.env.wasm.wasmPaths = globalThis.SUPERTONIC_ORT_BASE || ORT_BASE;
    const onnxDir = `${MODEL_BASE}/onnx`;
    const progress = (name, i, n) => emit(`음성 엔진 준비 중 (${i}/${n}) · ${name}`, i / n);
    const providers = ('gpu' in navigator) ? [['webgpu'], ['wasm']] : [['wasm']];
    let lastErr = null;
    for (const ep of providers) {
      try {
        const { textToSpeech } = await loadTextToSpeech(onnxDir, { executionProviders: ep, graphOptimizationLevel: 'all' }, progress);
        state.tts = textToSpeech; state.backend = ep[0];
        emit(`음성 엔진 준비 완료 (${ep[0] === 'webgpu' ? 'GPU' : 'CPU'})`, 1);
        return textToSpeech;
      } catch (e) { lastErr = e; console.warn('[Supertonic] backend failed:', ep[0], e); }
    }
    throw lastErr || new Error('음성 엔진을 시작하지 못했습니다.');
  })();
  try { return await state.loading; } finally { if (!state.tts) state.loading = null; }
}

async function getStyle(voice) {
  const v = /^[FM][1-5]$/.test(voice) ? voice : 'F1';
  if (!state.styles[v]) state.styles[v] = await loadVoiceStyle([`${MODEL_BASE}/voice_styles/${v}.json`]);
  return state.styles[v];
}

// 앞뒤 무음 제거
function trimSilence(wav, sr, threshold = 0.01, padSec = 0.05) {
  let s = 0, e = wav.length - 1;
  while (s < e && Math.abs(wav[s]) < threshold) s++;
  while (e > s && Math.abs(wav[e]) < threshold) e--;
  const pad = Math.floor(padSec * sr);
  return wav.slice(Math.max(0, s - pad), Math.min(wav.length, e + pad));
}

let queue = Promise.resolve(); // 같은 모델 세션을 동시에 돌리지 않도록 순차 처리

async function speak(text, { voice = 'F1', speed = 1.15, steps = 8, lang = 'ko' } = {}) {
  const job = queue.then(async () => {
    const tts = await load();
    const style = await getStyle(voice);
    const { wav } = await tts.call(String(text).trim(), lang, style, steps, speed, 0.1);
    const trimmed = trimSilence(Float32Array.from(wav), tts.sampleRate);
    const blob = new Blob([writeWavFile(trimmed, tts.sampleRate)], { type: 'audio/wav' });
    return { url: URL.createObjectURL(blob), duration: trimmed.length / tts.sampleRate, blob };
  });
  queue = job.catch(() => { });
  return job;
}

globalThis.SupertonicTTS = {
  load, speak,
  isReady: () => !!state.tts,
  backend: () => state.backend,
  onProgress: (fn) => { state.listeners.add(fn); return () => state.listeners.delete(fn); }
};
window.dispatchEvent(new Event('supertonic-ready'));
