// 图像取证适配层：把 data URL 交给本地 Python 检测服务，拿回结构化信号。
// 不输出概率；只给 strong/medium/weak/none 与坐标。失败一律返回 unavailable，由上层记 EF/EI。
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const script = path.join(root, 'services', 'forensics.py');
const venvPython = path.join(root, '.venv-forensics', 'bin', 'python');

function pythonPath() {
  if (process.env.AUTHEN_FORENSICS_PYTHON) return process.env.AUTHEN_FORENSICS_PYTHON;
  if (existsSync(venvPython)) return venvPython;
  return 'python3';
}

const cache = new Map();
const MAX_CACHE = 48;

function parseDataURL(src) {
  const m = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(src || '');
  if (!m) return null;
  return { ext: m[1] === 'png' ? 'png' : 'jpg', buf: Buffer.from(m[2], 'base64') };
}

function run(args, timeout = 26000) {
  return new Promise((resolve) => {
    execFile(pythonPath(), args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: String(err.message || err) });
      try { resolve(JSON.parse(String(stdout).trim())); }
      catch { resolve({ ok: false, error: '取证服务返回格式无法解析' }); }
    });
  });
}

export function forensicsAvailable() {
  return existsSync(script);
}

export async function inspectImage(src, { timeout = 26000 } = {}) {
  const parsed = parseDataURL(src);
  if (!parsed) return { ok: false, error: '不是可识别的图片数据' };
  const hash = createHash('sha1').update(parsed.buf).digest('hex');
  if (cache.has(hash)) return cache.get(hash);
  if (!forensicsAvailable()) return { ok: false, error: '未部署取证服务' };
  let dir;
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'authen-fx-'));
    const file = path.join(dir, `input.${parsed.ext}`);
    await writeFile(file, parsed.buf);
    const out = await run([script, '--json', file, '--limit', '22'], timeout);
    const value = out && typeof out === 'object' ? out : { ok: false, error: '取证失败' };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(hash, value);
    return value;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '取证失败' };
  } finally {
    if (dir) await unlink(path.join(dir, `input.${parsed.ext}`)).catch(() => {});
    if (dir) await unlink(dir).catch(() => {});
  }
}

export async function inspectImages(images = []) {
  const list = images.slice(0, 6);
  const out = new Array(list.length);
  // 服务器只有 2 核、内存上限 1.2G，一次只跑 2 个 Python 进程，避免 6 个一起把内存打满。
  let cursor = 0;
  const workers = Array.from({ length: Math.min(2, list.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= list.length) return;
      out[idx] = await inspectImage(list[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

let statusCache = { at: 0, value: null };
export async function serviceStatus() {
  if (statusCache.value && Date.now() - statusCache.at < 60000) return statusCache.value;
  const out = await run([script, '--self-test'], 8000);
  statusCache = { at: Date.now(), value: out };
  return out;
}
