// shard_01 真实 APP 实跑脚本。
// 入口：本地启动的 AUTHEN web 服务 /api/review（音频先走 /api/transcribe）。
// 本脚本只按样本素材构造与浏览器一致的请求，不读取 annotations 答案进入模型。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const BASE = process.env.AUTHEN_BASE || 'http://127.0.0.1:4191';
const PACKAGE = '/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN_多模态测试数据包_v2_unzipped/AUTHEN_多模态测试数据包_v2_140条';
const ART = '/Users/sugeladi/Library/Application Support/DoubaoWork/Default/.doubaowork/agent_mode/workspace/.sessions/38448061071007746/agents/s_000EAvdwoiw/artifacts';

const IDS = `A001 A002 A003 A004 A005 A006 A007 A008 A009 A010
C001 C002 C003 C004 C005 C006 C007 C008 C009 C010 C011 C012
E101 E102 E103 E104 E105 E106 E107 E108 E109 E110 E111 E112
E113 E114 E115 E116 E117 E118 E119 E120 E121 E122 E123 E124
E125 E126 E127 E128 E129 E130 E131 E132 E133 E134 E135 E136
E137 E138 E139 E140
I001 I002 I003 I004 I005 I006 I007 I008`.split(/\s+/);

// ---------- 工具 ----------
function pngSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  return null;
}
async function ocrImage(file) {
  // 复刻浏览器 tesseract OCR：产出带归一化 box 的行，供 D3 图文对照。
  const buf = await readFile(file);
  const size = pngSize(buf) || { w: 1, h: 1 };
  let tsv = '';
  try {
    const { stdout } = await run('tesseract', [file, 'stdout', '-l', 'chi_sim+eng', '--psm', '6', 'tsv'], { maxBuffer: 8 * 1024 * 1024, timeout: 60000 });
    tsv = stdout;
  } catch { return { text: '', lines: [] }; }
  const rows = tsv.split('\n').slice(1).map((l) => l.split('\t'));
  const groups = new Map();
  for (const c of rows) {
    if (c.length < 12) continue;
    const conf = Number(c[10]);
    if (!c[11] || conf < 30) continue;
    const key = `${c[2]}|${c[3]}|${c[4]}`;
    if (!groups.has(key)) groups.set(key, { words: [], x0: +c[6], y0: +c[7], x1: +c[6] + +c[8], y1: +c[7] + +c[9] });
    const g = groups.get(key);
    g.words.push(c[11]);
    g.x0 = Math.min(g.x0, +c[6]); g.y0 = Math.min(g.y0, +c[7]);
    g.x1 = Math.max(g.x1, +c[6] + +c[8]); g.y1 = Math.max(g.y1, +c[7] + +c[9]);
  }
  const lines = [];
  let text = '';
  for (const g of groups.values()) {
    const t = g.words.join(' ').trim();
    if (!t || t.length > 2000) continue;
    text += (text ? '\n' : '') + t;
    lines.push({
      text: t,
      imageIndex: 0,
      box: [g.x0 / size.w, g.y0 / size.h, Math.max(0, g.x1 - g.x0) / size.w, Math.max(0, g.y1 - g.y0) / size.h],
    });
  }
  return { text, lines };
}
function dataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const b64 = Buffer.from('').toString();
  return { mime, file };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { execFile as execFileCb } from 'node:child_process';
const execFileP = promisify(execFileCb);
// 复刻浏览器 normalize：超 2.7M 的图先压成 JPEG q0.85，避开服务端 2.8M dataURL 上限。
async function encodeImage(file) {
  const buf = await readFile(file);
  const pngB64 = buf.toString('base64');
  if (pngB64.length <= 2_700_000) return `data:image/png;base64,${pngB64}`;
  const tmp = `/tmp/authen_${Date.now()}.jpg`;
  await execFileP('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', file, '--out', tmp]);
  const jpg = await readFile(tmp);
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}
async function postJSONRetry(url, payload, timeoutMs = 180000, retries = 6) {
  let last;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await postJSON(url, payload, timeoutMs);
    if (res.status !== 429 && res.status !== 0) return res;
    last = res;
    const wait = res.status === 429 ? 10000 + attempt * 3000 : 5000 * attempt;
    await sleep(wait); // 429 退避；传输错误也退避重试
  }
  return last;
}
async function postJSON(url, payload, timeoutMs = 180000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error('timeout')), timeoutMs);
  const started = Date.now();
  let status = 0, body = null, rawText = '';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
    status = r.status;
    rawText = await r.text();
    try { body = JSON.parse(rawText); } catch { body = { raw: rawText }; }
    return { status, body, elapsed_ms: Date.now() - started };
  } catch (e) {
    return { status: 0, body: { error: e.message }, elapsed_ms: Date.now() - started, transport_error: e.message };
  } finally { clearTimeout(t); }
}

// ---------- 构造请求 ----------
async function buildPayload(sid, label) {
  const dir = path.join(PACKAGE, 'inputs', sid);
  const files = await readDir(dir);
  const payload = { audience: 'consumer' };
  const plan = { kind: '', notes: '' };

  if (files.includes('audio.wav')) {
    const b64 = (await readFile(path.join(dir, 'audio.wav'))).toString('base64');
    const tr = await postJSON(`${BASE}/api/transcribe`, { audioBase64: b64 }, 210000);
    if (tr.status !== 200) return { error: 'transcribe_failed', detail: tr.body, transport: tr.transport_error, transcribeResult: tr.body };
    const text = tr.body.text || '';
    payload.kind = 'audio';
    payload.text = text;
    payload.lines = (tr.body.segments || []).map((s) => ({ text: s.text, seconds: s.start }));
    payload.scope = '已把音频转成文字，核对其中的说法；尚未判断声音是否合成。';
    plan.kind = 'audio';
    return { payload, plan, transcribe: tr.body };
  }

  if (files.includes('comments.json')) {
    const comments = JSON.parse(await readFile(path.join(dir, 'comments.json'), 'utf8'));
    payload.kind = 'comments';
    payload.text = comments.map((c) => c.text).join('\n');
    payload.comments = comments.map((c) => ({ id: c.comment_id, author: c.account, authorKey: c.account, text: c.text }));
    payload.scope = '仅检查本次读取到的评论，未读取原帖正文与商品详情。';
    plan.kind = 'comments';
    return { payload, plan };
  }

  if (files.includes('content.txt')) {
    payload.kind = 'text';
    payload.text = await readFile(path.join(dir, 'content.txt'), 'utf8');
    payload.scope = '已检查提交的文字；还需要商品资料才能核对具体功效。';
    plan.kind = 'article';
    return { payload, plan };
  }

  if (files.includes('post.txt') && files.includes('image.png')) {
    const post = (await readFile(path.join(dir, 'post.txt'), 'utf8')).trim();
    const img = path.join(dir, 'image.png');
    const buf = await readFile(img);
    payload.kind = 'image';
    payload.images = [await encodeImage(img)];
    const ocr = await ocrImage(img);
    payload.text = post + (ocr.text ? '\n' + ocr.text : '');
    payload.lines = ocr.lines;
    payload.scope = '已读取图片文字并检查其中的说法；是否经过AI修改，还需要进一步证据。';
    plan.kind = 'image_post';
    return { payload, plan, ocr };
  }

  if (files.includes('image.png')) {
    const img = path.join(dir, 'image.png');
    const buf = await readFile(img);
    payload.kind = 'image';
    payload.images = [await encodeImage(img)];
    const ocr = await ocrImage(img);
    payload.text = ocr.text;
    payload.lines = ocr.lines;
    payload.scope = '已读取图片文字并检查其中的说法；是否经过AI修改，还需要进一步证据。';
    plan.kind = 'image';
    return { payload, plan, ocr };
  }

  if (files.includes('post.txt') && files.includes('evidence.json')) {
    payload.kind = 'text';
    payload.text = (await readFile(path.join(dir, 'post.txt'), 'utf8')).trim();
    payload.scope = '已检查提交的文字；APP 无 evidence.json 结构化血缘输入入口，该文件未进入分析。';
    plan.kind = 'text_evidence_unavailable';
    plan.notes = 'evidence.json 无对应 API 入口，仅以 post.txt 文本实跑。';
    return { payload, plan };
  }

  return { error: 'unmatched_layout', detail: files };
}

async function readDir(dir) {
  try { return (await import('node:fs/promises')).readdir(dir); } catch { return []; }
}

// ---------- 主流程 ----------
const labelLines = (await readFile(path.join(PACKAGE, 'manifest_labels.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
const labels = Object.fromEntries(labelLines.map((l) => [l.id, l]));

const only = process.argv[2];
const runIds = only ? [only] : IDS;

await mkdir(path.join(ART, 'raw_requests'), { recursive: true });
await mkdir(path.join(ART, 'raw_responses'), { recursive: true });
await mkdir(path.join(ART, 'logs'), { recursive: true });

const records = [];
for (const sid of runIds) {
  const label = labels[sid] || {};
  const rec = {
    sample_id: sid,
    expected_decision: label.decision,
    expected_modality: label.modality,
    split: label.split,
    mechanism: label.mechanism,
    evidence_group: label.evidence,
    reference_files: label.reference_files || [],
    input_files: label.files || [],
    entry_point: `${BASE}/api/review`,
    started_at: new Date().toISOString(),
  };
  // 断点续跑：已有成功响应的样本直接复用，不重复调用 API
  const cachedResp = path.join(ART, 'raw_responses', `${sid}.response.json`);
  if (existsSync(cachedResp)) {
    const cached = JSON.parse(await readFile(cachedResp, 'utf8'));
    if (cached.http_status === 200) {
      rec.status = 'ok';
      rec.cached = true;
      finalizeRecord(rec, cached.body, 200, 0);
      records.push(rec);
      continue;
    }
  }

  let built;
  try { built = await buildPayload(sid, label); } catch (e) { built = { error: 'payload_build_error', detail: e.message }; }

  // 留存原始请求（图片 dataURL 体积大，单独存元信息，原始图片路径记录在案）
  const reqForLog = built?.payload ? stripImages(built.payload) : built;
  await writeFile(path.join(ART, 'raw_requests', `${sid}.request.json`), JSON.stringify({ sample_id: sid, built: built?.plan, request: reqForLog }, null, 2));

  if (built.error) {
    rec.status = 'error';
    rec.error_type = built.error;
    rec.error_detail = JSON.stringify(built.detail || built.transcribe || built).slice(0, 500);
    records.push(rec);
    continue;
  }

  const res = await postJSONRetry(`${BASE}/api/review`, built.payload, 180000);
  await writeFile(path.join(ART, 'raw_responses', `${sid}.response.json`), JSON.stringify({ sample_id: sid, http_status: res.status, body: res.body }, null, 2));
  rec.http_status = res.status;
  rec.app_elapsed_ms = res.elapsed_ms;

  if (res.status !== 200) {
    rec.status = 'error';
    rec.error_type = res.status === 429 ? 'rate_limited' : (res.status >= 500 ? 'server_5xx' : `http_${res.status}`);
    rec.error_detail = JSON.stringify(res.body).slice(0, 500);
    records.push(rec);
    continue;
  }

  finalizeRecord(rec, res.body, res.status, res.elapsed_ms, built);
  records.push(rec);
  await sleep(800); // 礼貌间隔；429 由退避重试兜底
}

// 从成功响应提取 APP 实际判定与输出
function finalizeRecord(rec, body, status, elapsedMs, built) {
  const presentation = body.presentation || {};
  rec.http_status = status;
  rec.app_elapsed_ms = elapsedMs;
  rec.actual_decision = presentation.total_decision || (body.audit && body.audit.total_decision) || '';
  rec.presentation_state = presentation.presentation_state || '';
  rec.summary = presentation.state_reason || body.summary || '';
  rec.next_action = presentation.next_action || body.next || '';
  rec.evidence_cards = (presentation.evidence_cards || []).map((c) => ({ card: c.card_id, dim: c.dim, title: c.title, location: c.location_quality, seconds: c.seconds, box: c.box }));
  rec.dim_state_vector = body.audit?.dim_state_vector || presentation.dims || {};
  rec.aggregate_state = body.audit?.aggregate_state;
  rec.e2_subtype = body.audit?.e2_subtype;
  rec.rejection_reason_code = body.audit?.rejection_reason_code;
  rec.provider = body.audit?.provider || body.provider;
  rec.model = body.audit?.model || body.model;
  rec.verdict_legacy = body.verdict;
  if (built?.payload) rec.request_summary = summarizeRequest(built.payload);
  if (built?.transcribe) rec.transcribe = { engine: built.transcribe.engine, text: built.transcribe.text, segments: built.transcribe.segments };
  rec.ocr_lines = built?.ocr ? built.ocr.lines.length : 0;
  rec.status = 'ok';
  rec.error_type = '';
  rec.pass = rec.actual_decision === rec.expected_decision;
}

// 落盘汇总
await writeFile(path.join(ART, 'shard_01.records.json'), JSON.stringify(records, null, 2));
console.log(`done ${records.length}`);
function stripImages(p) {
  const c = { ...p };
  if (c.images) c.images = [`<${c.images.length} image(s), dataURL 未内联留存，原始图片见 input_files>`];
  return c;
}
function summarizeRequest(p) {
  const parts = [];
  parts.push(`kind=${p.kind}`);
  if (p.text) parts.push(`text=${p.text.length}字`);
  if (p.images?.length) parts.push(`images=${p.images.length}`);
  if (p.lines?.length) parts.push(`lines=${p.lines.length}`);
  if (p.comments?.length) parts.push(`comments=${p.comments.length}`);
  return parts.join(', ');
}
