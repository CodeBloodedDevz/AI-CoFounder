import { tr } from '../../i18n/current';
// Browser microphone for Live Voice: getUserMedia (with echo cancellation and
// noise suppression) + an AnalyserNode for loudness + MediaRecorder for audio.
// cut() restarts the recorder so every utterance becomes its own small file.

const POLL_MS = 60;

function pickMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) || '';
}

export function createMicListener() {
  let stream = null;
  let ctx = null;
  let analyser = null;
  let source = null;
  let recorder = null;
  let chunks = [];
  let timer = null;
  let onLevel = null;
  let running = false;
  let startedAt = 0;
  let mime = '';
  const urls = new Set();

  function startRecorder() {
    chunks = [];
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    recorder.start();
    startedAt = Date.now();
  }

  function stopRecorder() {
    return new Promise((resolve) => {
      const rec = recorder;
      recorder = null;
      if (!rec || rec.state === 'inactive') return resolve(null);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        chunks = [];
        resolve(blob.size ? blob : null);
      };
      try {
        rec.stop();
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function swap() {
    const durationMs = Date.now() - startedAt;
    const blob = await stopRecorder();
    if (running) {
      try {
        startRecorder();
      } catch (e) {
        running = false;
      }
    }
    if (!blob) return { uri: null, durationMs };
    const uri = URL.createObjectURL(blob);
    urls.add(uri);
    return { uri, durationMs };
  }

  const revoke = (uri) => {
    if (uri && urls.has(uri)) {
      urls.delete(uri);
      URL.revokeObjectURL(uri);
    }
  };

  return {
    async start(levelCallback) {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(tr('mic.browserCant'));
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
      } catch (e) {
        const err = new Error(tr('mic.browserPermission'));
        err.code = 'permission';
        throw err;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      mime = pickMime();
      onLevel = levelCallback;
      running = true;
      startRecorder();

      const buf = new Float32Array(analyser.fftSize);
      timer = setInterval(() => {
        if (!analyser) return;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        onLevel?.(rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100);
      }, POLL_MS);
    },

    async cut() {
      if (!running) return null;
      const seg = await swap();
      return seg.uri ? seg : null;
    },

    async discard() {
      if (!running) return;
      const seg = await swap();
      revoke(seg.uri);
    },

    release(segment) {
      revoke(segment?.uri);
    },

    async stop() {
      running = false;
      clearInterval(timer);
      timer = null;
      await stopRecorder();
      try {
        source?.disconnect();
        await ctx?.close();
      } catch (e) {
        /* already closed */
      }
      stream?.getTracks().forEach((t) => t.stop());
      stream = ctx = analyser = source = null;
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    },
  };
}
