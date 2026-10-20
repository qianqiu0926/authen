// QA-140 本地复算 harness：直接调用 pipeline/inspect，不走 HTTP，便于快速迭代。
// 输入按数据包 inputs/ 组装，参考资料取自每条自带 reference_files（模拟检索结果已就位）。
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile as ef } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { inspect } from '../../web/pipeline/index.mjs';

const execFile = promisify(ef);
const PKG = '/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN数据包扩充_v2/AUTHEN_多模态测试数据包_v2_140条';
const OUT = '/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN/QA-140-report/data';
const OCR_CACHE = '/tmp/authen-ocr-cache';
const TESS = '/tmp/tessdata';

const STATE2CLASS = { 'P-01': '有明确问题', 'P-02': '线索级（待核验）', 'P-03': '暂未发现问题', 'P-04': '资料不足', 'P-05': '无法判定' };

async function readText(rel) { try { return await readFile(path.join(PKG, rel), 'utf8'); } catch { return ''; } }

async function ocr(rel) {
  const key = rel.replace(/[^\w.]/g, '_');
  await mkdir(OCR_CACHE, { recursive: true });
  const cache = path.join(OCR_CACHE, key + '.txt');
  if (existsSync(cache)) return readFile(cache, 'utf8');
  let text = '';
  try {
    const { stdout } = await execFile('tesseract', [path.join(PKG, rel), 'stdout', '-l', 'chi_sim+eng', '--psm', '3'],
      { maxBuffer: 8 << 20, env: { ...process.env, TESSDATA_PREFIX: TESS } });
    text = stdout.replace(/[ \t]+\n/g, '\n').trim();
  } catch { text = ''; }
  await writeFile(cache, text);
  return text;
}


function imageRel(lab, preferPng = true) {
  const imgs = (lab.files || []).filter((f) => /\.(png|jpe?g)$/i.test(f));
  if (!imgs.length) return '';
  return preferPng ? (imgs.find((f) => /\.png$/i.test(f)) || imgs[0]) : imgs[0];
}

async function dataUrl(rel) {
  const buf = await readFile(path.join(PKG, rel));
  const mime = /\.png$/i.test(rel) ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function buildInput(lab) {
  const dir = `inputs/${lab.id}`;
  const input = { kind: 'text', text: '', images: [], lines: [], comments: [], scope: '用户发来一份素材' };
  const notes = [];
  if (lab.modality === '文章') {
    input.text = await readText(`${dir}/content.txt`);
  } else if (lab.modality === '图文帖') {
    input.text = await readText(`${dir}/post.txt`);
    const rel = imageRel(lab, true);
    if (rel) {
      input.kind = 'image';
      input.images.push(await dataUrl(rel));
      const t = await ocr(rel);
      if (t) { input.text += '\n' + t; input.lines.push({ text: t.slice(0, 1200), imageIndex: 0 }); }
      else notes.push('OCR空');
    } else {
      input.kind = 'text';
      const ev = await readText(`${dir}/evidence.json`);
      if (ev) input.text += '\n' + ev;
      notes.push('无图，仅文本');
    }
  } else if (lab.modality === '图片') {
    input.kind = 'image';
    const rel = imageRel(lab, true) || `${dir}/image.png`;
    input.images.push(await dataUrl(rel));
    const t = await ocr(rel);
    input.text = t;
    if (t) input.lines.push({ text: t.slice(0, 1200), imageIndex: 0 });
    else notes.push('OCR空');
  } else if (lab.modality === '评论组') {
    input.kind = 'comments';
    input.text = await readText(`${dir}/comments.txt`);
    try { input.comments = JSON.parse(await readText(`${dir}/comments.json`)); } catch { input.comments = []; }
    if (Array.isArray(input.comments) && input.comments[0]?.comments) input.comments = input.comments[0].comments;
    input.comments = (input.comments || []).map((c, i) => ({
      id: c.id ?? c.comment_id ?? `c${i}`,
      text: String(c.text ?? c.content ?? ''),
      author: String(c.author ?? c.user ?? c.authorKey ?? `u${i}`),
      authorKey: String(c.authorKey ?? c.author ?? c.user ?? `u${i}`),
      at: c.at ?? c.time ?? c.created_at ?? undefined,
    })).filter((c) => c.text);
  } else if (lab.modality === '音频' || /\.wav$/.test((lab.files || []).join(''))) {
    input.kind = 'audio';
    const tr = await loadTranscript(lab.id);
    input.text = tr.speech.map((s) => s.text).join('').replace(/。\s*/g, '。');
    input.lines = tr.speech.map((s) => ({ text: s.text, seconds: s.start }));
  } else if (lab.modality === '视频' || /\.mp4$/.test((lab.files || []).join(''))) {
    input.kind = 'video';
    const tr = await loadTranscript(lab.id);
    input.text = [...tr.speech.map((s) => s.text), ...tr.captions.map((s) => s.text)].join('\n');
    input.lines = tr.speech.map((s) => ({ text: s.text, seconds: s.start }));
    input.captions = tr.captions;
  } else if (lab.modality === '转发变体') {
    if (/\.jpg$/.test((lab.files || []).join(''))) {
      input.kind = 'image';
      const rel = imageRel(lab, false) || `${dir}/image.jpg`;
      input.images.push(await dataUrl(rel));
      input.text = await ocr(rel);
    } else {
      input.kind = /\.wav$/.test((lab.files || []).join('')) ? 'audio' : 'video';
      const tr = JSON.parse(await readText(`annotations/transcripts/${lab.id}.json`) || '[]');
      input.text = tr.map((s) => s.text).join('');
      input.lines = tr.map((s) => ({ text: s.text, seconds: s.start }));
    }
  }
  return { input, notes };
}


function normSegs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s, i) => ({
    text: String(s.text ?? s.content ?? s.sentence ?? ''),
    start: Number(s.start ?? s.start_sec ?? s.t0 ?? i * 2),
  })).filter((x) => x.text);
}

async function loadTranscript(id) {
  const raw = await readText(`annotations/transcripts/${id}.json`);
  if (!raw) return { speech: [], captions: [] };
  let d;
  try { d = JSON.parse(raw); } catch { return { speech: [], captions: [] }; }
  if (Array.isArray(d)) return { speech: normSegs(d), captions: [] };
  const speech = normSegs(d.speech || d.segments || d.transcript || d.items || []);
  const captions = normSegs(d.captions || d.subtitles || []);
  return { speech, captions };
}

async function referencesFor(lab) {
  const out = [];
  for (const rel of lab.reference_files || []) {
    const body = await readText(rel);
    if (!body.trim()) continue;
    out.push({ id: path.basename(rel, '.txt'), title: path.basename(rel), url: '', excerpt: body.trim() });
  }
  return out;
}

const only = (process.env.EVAL_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const splitFilter = process.env.EVAL_SPLIT || '';

const labels = [];
for (const line of (await readFile(path.join(PKG, 'manifest_labels.jsonl'), 'utf8')).split('\n')) {
  if (line.trim()) labels.push(JSON.parse(line));
}

const rows = [];
for (const lab of labels) {
  if (only.length && !only.includes(lab.id)) continue;
  if (splitFilter && lab.split !== splitFilter) continue;
  const { input, notes } = await buildInput(lab);
  const refs = await referencesFor(lab);
  let res;
  try {
    res = await inspect({}, { input, config: null, references: refs });
  } catch (e) {
    res = null;
    notes.push('EXC:' + (e?.message || e));
  }
  const state = res?.presentation?.presentation_state || '';
  const pred = STATE2CLASS[state] || '资料不足';
  rows.push({
    id: lab.id, split: lab.split, modality: lab.modality,
    expected: lab.decision, pred, state,
    dims: res?.audit?.dim_state_vector || {},
    agg: res?.audit?.aggregate_state || '',
    reason: res?.presentation?.state_reason || '',
    cards: (res?.presentation?.evidence_cards || []).map((c) => `${c.dim}:${c.title}`).slice(0, 3),
    notes,
  });
}

const ok = rows.filter((r) => r.pred === r.expected).length;
const by = (k) => {
  const m = {};
  for (const r of rows) {
    const key = r[k];
    m[key] ??= { n: 0, ok: 0 };
    m[key].n += 1; if (r.pred === r.expected) m[key].ok += 1;
  }
  return m;
};
const confusion = {};
for (const r of rows) {
  confusion[r.expected] ??= {};
  confusion[r.expected][r.pred] = (confusion[r.expected][r.pred] || 0) + 1;
}
const report = { total: rows.length, passed: ok, rate: +(ok / rows.length).toFixed(4), by_split: by('split'), by_modality: by('modality'), confusion, rows };
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'eval_local.json'), JSON.stringify(report, null, 1));
console.log(`PASS ${ok}/${rows.length} = ${(ok / rows.length * 100).toFixed(1)}%`);
for (const [k, v] of Object.entries(report.by_split)) console.log(`  ${k}: ${v.ok}/${v.n}`);
for (const [k, v] of Object.entries(report.by_modality)) console.log(`  ${k}: ${v.ok}/${v.n}`);
if (process.env.SHOW_FAIL) {
  for (const r of rows.filter((x) => x.pred !== x.expected)) {
    console.log(`- ${r.id} [${r.split}/${r.modality}] 期望 ${r.expected} 实得 ${r.pred} | ${JSON.stringify(r.dims)} | ${r.reason.slice(0, 46)}`);
  }
}
