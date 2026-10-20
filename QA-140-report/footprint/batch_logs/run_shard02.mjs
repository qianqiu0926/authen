// shard_02 实跑 harness：调用本机 AUTHEN web 服务 POST /api/review（同源源码 web/server.mjs）。
// 预处理复刻消费者前端 web/src/media.ts：图片本地 OCR(chi_sim+eng)、视频抽帧+可选口播转写、音频转写。
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as ef } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(ef);

const WS = '/Users/sugeladi/Library/Application Support/DoubaoWork/Default/.doubaowork/agent_mode/workspace/.sessions/38448061071007746/agents/s_000EAvdwdbc';
const PKG = path.join(WS, 'work/pkg/AUTHEN_多模态测试数据包_v2_140条');
const ART = path.join(WS, 'artifacts');
const RAW = path.join(ART, 'raw');
const ENDPOINT = 'http://127.0.0.1:4192/api/review';
const TRANSCRIBE = 'http://127.0.0.1:4192/api/transcribe';

const ids = JSON.parse(await readFile(path.join(WS, 'work/shard02_ids.json'), 'utf8'));

// labels
const labels = {};
for (const line of (await readFile(path.join(PKG, 'manifest_labels.jsonl'), 'utf8')).split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  labels[r.id] = r;
}

function b64(buf, mime) { return `data:${mime};base64,${buf.toString('base64')}`; }
async function fileBuf(rel) { return readFile(path.join(PKG, rel)); }

// ---- OCR via tesseract CLI (chi_sim+eng), plain text; boxes are not required by the API
async function ocrImage(buf, imageIndex, mime) {
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
  const tmpIn = path.join(WS, `work/ocr_in_${process.pid}_${imageIndex}_${Date.now()}.${ext}`);
  await writeFile(tmpIn, buf);
  try {
    const tessDir = path.join(WS, 'work/tessdata');
    const { stdout } = await execFile('tesseract', [tmpIn, 'stdout', '-l', 'chi_sim+eng', '--psm', '3'], { maxBuffer: 8 * 1024 * 1024, env: { ...process.env, TESSDATA_PREFIX: tessDir } });
    return { text: stdout.replace(/\s+\n/g, '\n').trim() };
  } catch (e) {
    console.warn('OCR skip:', imageIndex, String(e.message).slice(0, 120));
    return { text: '' };
  } finally {
    const { unlink } = await import('node:fs/promises');
    await unlink(tmpIn).catch(() => {});
  }
}

// ---- video: extract frames
async function probeDuration(videoRel) {
  const buf = await fileBuf(videoRel);
  const tmp = path.join(WS, 'work/probe.mp4');
  await writeFile(tmp, buf);
  const { stdout } = await execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]);
  return Number(stdout.trim());
}

async function grabFrame(videoPath, sec, idx) {
  const out = path.join(WS, `work/_frame_${idx}.jpg`);
  await execFile('ffmpeg', ['-y', '-ss', String(sec), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=1200:-2', '-q:v', '4', out], { maxBuffer: 8 * 1024 * 1024 });
  return readFile(out);
}

async function extractAudioWav(videoPath, id) {
  const out = path.join(WS, `work/_audio_${id}.wav`);
  await execFile('ffmpeg', ['-y', '-i', videoPath, '-ac', '1', '-ar', '16000', '-f', 'wav', out], { maxBuffer: 16 * 1024 * 1024 });
  return readFile(out);
}

async function transcribe(wavBuf) {
  const resp = await fetch(TRANSCRIBE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioBase64: wavBuf.toString('base64') }) });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `transcribe ${resp.status}`);
  return data;
}

// ---- build payload per sample
async function buildPayload(id) {
  const lab = labels[id];
  const mod = lab.modality;
  const inputDir = path.join(PKG, 'inputs', id);
  const body = { audience: 'consumer', comments: [], lines: [], images: [], shareOnly: false };
  const meta = { inputFiles: [], preprocessNotes: [] };

  if (mod === '文章') {
    body.kind = 'text';
    body.text = await readFile(path.join(inputDir, 'content.txt'), 'utf8');
    body.scope = '已检查提交的文字；还需要商品资料才能核对具体功效。';
    meta.inputFiles.push(`inputs/${id}/content.txt`);
  } else if (mod === '图文帖') {
    body.kind = 'image';
    body.text = await readFile(path.join(inputDir, 'post.txt'), 'utf8');
    meta.inputFiles.push(`inputs/${id}/post.txt`);
    for (const f of ['post.png', 'image.png']) {
      const p = path.join(inputDir, f);
      try {
        const buf = await readFile(p);
        body.images.push(b64(buf, 'image/png'));
        meta.inputFiles.push(`inputs/${id}/${f}`);
        const ocr = await ocrImage(buf, body.images.length - 1, 'image/png');
        if (ocr.text) body.text += '\n' + ocr.text;
      } catch (e) { meta.preprocessNotes.push(`${f} 读取/ OCR 失败: ${e.message}`); }
    }
    body.scope = '已读取图片文字并检查其中的说法；是否经过AI修改，还需要进一步证据。';
  } else if (mod === '图片') {
    body.kind = 'image';
    const buf = await readFile(path.join(inputDir, 'image.png'));
    body.images.push(b64(buf, 'image/png'));
    meta.inputFiles.push(`inputs/${id}/image.png`);
    const ocr = await ocrImage(buf, 0, 'image/png');
    body.text = ocr.text;
    body.scope = '已读取图片文字并检查其中的说法；是否经过AI修改，还需要进一步证据。';
  } else if (mod === '视频' || (mod === '转发变体' && await hasVideo(id))) {
    body.kind = 'video';
    const videoRel = `inputs/${id}/video.mp4`;
    meta.inputFiles.push(videoRel);
    const videoPath = path.join(WS, 'work', `_tmp_${id}.mp4`);
    await writeFile(videoPath, await fileBuf(videoRel));
    const dur = await probeDuration(videoRel);
    const count = Math.min(8, Math.max(2, Math.floor(dur / 5) + 1));
    body.text = '';
    for (let i = 0; i < count; i++) {
      const sec = Math.min(dur - 0.05, Math.max(0.01, (i * dur) / count));
      const frame = await grabFrame(videoPath, sec, i);
      body.images.push(b64(frame, 'image/jpeg'));
      const ocr = await ocrImage(frame, body.images.length - 1, 'image/jpeg');
      if (ocr.text) body.text += (body.text ? '\n' : '') + ocr.text;
      if (ocr.text) body.lines.push({ text: ocr.text.slice(0, 200), imageIndex: body.images.length - 1, seconds: Number(sec.toFixed(2)) });
    }
    // audio transcription (default speech:true)
    let trNote = '未读取声音，也未检查每一帧。';
    try {
      const wav = await extractAudioWav(videoPath, id);
      const tr = await transcribe(wav);
      body.text += (body.text ? '\n' : '') + tr.text;
      for (const s of (tr.segments || [])) body.lines.push({ text: s.text, seconds: Number(s.start) });
      trNote = '已把音频转成文字，核对其中的说法；尚未判断声音是否合成。';
    } catch (e) {
      meta.preprocessNotes.push(`口播转写失败: ${e.message}`);
      trNote = '这次没能读到口播，可单独上传音频。';
    }
    body.scope = `已查看${count}个关键画面和可读字幕；未读取声音，也未检查每一帧。 ${trNote}`;
    const { unlink } = await import('node:fs/promises');
    await unlink(videoPath).catch(() => {});
  } else if (id === 'X008') {
    // 音频噪声变体：先转写，再以 kind=audio 送鉴真
    body.kind = 'audio';
    const wav = await readFile(path.join(inputDir, 'audio.wav'));
    meta.inputFiles.push(`inputs/${id}/audio.wav`);
    const tr = await transcribe(wav);
    body.text = tr.text;
    for (const s of (tr.segments || [])) body.lines.push({ text: s.text, seconds: Number(s.start) });
    body.scope = '已把音频转成文字，核对其中的说法；尚未判断声音是否合成。';
  } else if (mod === '转发变体') {
    // image.jpg variants
    const jpg = await readFile(path.join(inputDir, 'image.jpg'));
    body.images.push(b64(jpg, 'image/jpeg'));
    meta.inputFiles.push(`inputs/${id}/image.jpg`);
    const ocr = await ocrImage(jpg, 0, 'image/jpeg');
    body.text = ocr.text;
    body.kind = 'image';
    body.scope = '已读取图片文字并检查其中的说法；是否经过AI修改，还需要进一步证据。';
  } else if (mod === '音频') {
    body.kind = 'audio';
    const wav = await readFile(path.join(inputDir, id === 'X008' ? 'audio.wav' : 'audio.wav'));
    meta.inputFiles.push(`inputs/${id}/audio.wav`);
    const tr = await transcribe(wav);
    body.text = tr.text;
    for (const s of (tr.segments || [])) body.lines.push({ text: s.text, seconds: Number(s.start) });
    body.scope = '已把音频转成文字，核对其中的说法；尚未判断声音是否合成。';
  }
  return { body, meta };
}

async function hasVideo(id) {
  try { await readFile(path.join(PKG, 'inputs', id, 'video.mp4')); return true; } catch { return false; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- POST with backoff on 429/5xx (server window: 12/min, 2 concurrent)
async function postReview(body) {
  const t0 = Date.now();
  let last = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    last = { status: resp.status, data, elapsed_ms: Date.now() - t0, attempts: attempt + 1 };
    if (resp.status === 200) return last;
    if (resp.status === 429 || resp.status >= 500) {
      await sleep(6000 * (attempt + 1));
      continue;
    }
    return last; // 4xx non-retryable
  }
  return last;
}

// ---- run all
const FILTER = (process.env.SHARD02_FILTER || '').split(',').map(s => s.trim()).filter(Boolean);
const records = [];
for (const id of (FILTER.length ? ids.filter(x => FILTER.includes(x)) : ids)) {
  const started = new Date().toISOString();
  const rec = { sample_id: id, run_entry: `POST ${ENDPOINT} (web/server.mjs 同源 pipeline inspect, multi-agent-6dim-v2)`, endpoint: ENDPOINT };
  let rawDir = path.join(RAW, id);
  await mkdir(rawDir, { recursive: true });
  try {
    const { body, meta } = await buildPayload(id);
    rec.request_summary = `kind=${body.kind}; text_chars=${(body.text || '').length}; images=${body.images.length}; lines=${body.lines.length}`;
    rec.input_files = meta.inputFiles;
    rec.preprocess_notes = meta.preprocessNotes;
    await writeFile(path.join(rawDir, 'request.json'), JSON.stringify(body, null, 2));
    const out = await postReview(body);
    await writeFile(path.join(rawDir, 'response.json'), JSON.stringify(out.data, null, 2));
    rec.http_status = out.status;
    rec.elapsed_ms = out.elapsed_ms;
    rec.retries = out.attempts || 1;
    if (out.status !== 200) {
      rec.actual_judgment = '无法判定';
      rec.error_type = 'http_error';
      rec.error_detail = `${out.status} ${out.data.error || JSON.stringify(out.data).slice(0, 200)}`;
    } else {
      const audit = out.data.audit || {};
      const pres = out.data.presentation || {};
      rec.actual_judgment = audit.total_decision || '无法判定';
      rec.presentation_state = pres.presentation_state;
      rec.app_summary = out.data.summary || '';
      rec.app_next = out.data.next || '';
      rec.app_evidence = (pres.evidence_cards || []).map(c => ({ card: c.card_id, dim: c.dim, title: c.title, observation: c.observation, explanation: c.explanation, location_quality: c.location_quality, image_index: c.image_index, seconds: c.seconds }));
      rec.dim_state_vector = audit.dim_state_vector;
      rec.content_type = audit.content_type;
      rec.provider = audit.provider;
      rec.model = audit.model;
      if (rec.actual_judgment === '无法判定') {
        rec.error_type = 'pipeline_failed';
        rec.error_detail = '流水线返回 P-05/无法判定（存在 EF 中断或拒判）';
      }
    }
  } catch (e) {
    rec.http_status = 0;
    rec.actual_judgment = '无法判定';
    rec.error_type = 'transport_error';
    rec.error_detail = String(e?.message || e).slice(0, 500);
  }
  rec.expected_judgment = labels[id].decision;
  rec.passed = rec.actual_judgment === rec.expected_judgment;
  if (!rec.error_type) rec.error_type = rec.passed ? 'none' : 'verdict_mismatch';
  // mismatch kind
  if (!rec.passed && rec.error_type === 'verdict_mismatch') {
    if (rec.expected_judgment === '有明确问题' && rec.actual_judgment !== '有明确问题') rec.mismatch_kind = 'missed_conflict';
    else if (rec.actual_judgment === '有明确问题' || rec.actual_judgment === '线索级（待核验）') rec.mismatch_kind = 'false_alarm_or_clue';
    else rec.mismatch_kind = 'other';
  }
  rec.modality = labels[id].modality;
  rec.scenario = labels[id].split;
  rec.mechanism = labels[id].mechanism;
  rec.evidence_request_path = `raw/${id}/request.json`;
  rec.evidence_response_path = `raw/${id}/response.json`;
  rec.evidence_log_path = `raw/${id}/run.log`;
  await writeFile(path.join(rawDir, 'run.log'), [
    `sample_id=${id}`, `started_at=${started}`, `endpoint=${ENDPOINT}`,
    `http_status=${rec.http_status}`, `elapsed_ms=${rec.elapsed_ms ?? ''}`,
    `input_files=${(rec.input_files || []).join(', ')}`,
    `preprocess_notes=${(rec.preprocess_notes || []).join(' | ')}`,
    `expected=${rec.expected_judgment}`, `actual=${rec.actual_judgment}`, `passed=${rec.passed}`, `error_type=${rec.error_type}`,
    `error_detail=${rec.error_detail || ''}`,
  ].join('\n'));
  records.push(rec);
  console.log(`${id} ${rec.http_status} expected=${rec.expected_judgment} actual=${rec.actual_judgment} passed=${rec.passed} ${rec.error_type}`);
  await sleep(1200);
}

await writeFile(path.join(ART, 'shard_02_results.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log('DONE', records.length);
