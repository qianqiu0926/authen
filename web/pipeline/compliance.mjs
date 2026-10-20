// 文案合规校验（第06步 R-06-16 / 铁律5）。命中禁用表述或概率类数值，先改写，改写仍不合格就换成安全句。
import { BANNED, findViolations, rewrite } from './standards.mjs';

// 去掉「」和引号里的逐字引用，再扫百分比：引用商品原话（如「10%」）不算概率。
function stripQuotes(text) {
  return String(text).replace(/「[^」]*」/g, '').replace(/“[^”]*”/g, '').replace(/"[^"]*"/g, '');
}

export function scan(text) {
  const plain = stripQuotes(text);
  const hits = [];
  for (const word of BANNED) if (plain.includes(word)) hits.push(word);
  if (/(?:概率|可能性|置信度|得分|评分|星级|风险指数)/.test(plain)) hits.push('概率类词');
  if (/\d+(?:\.\d+)?\s*%/.test(plain)) hits.push('百分比');
  if (/(?:系统认为|模型判定|算法判定)/.test(plain)) hits.push('机器口吻');
  return [...new Set(hits)];
}

const FALLBACK = {
  P_01: '这条内容里有能直接对照的冲突，具体位置见下方证据卡。',
  P_02: '这条内容里有需要进一步核实的地方，具体线索见下方证据卡。',
  P_03: '这次检查的范围内，没发现对不上的地方。',
  P_04: '材料不够，暂时判断不了。',
  P_05: '这次检查没做完，结果不完整。',
};

export function sanitize(field, text, presentationState) {
  if (typeof text !== 'string' || !text) return { text, violations: [], rewritten: false };
  const before = scan(text);
  if (!before.length) return { text, violations: [], rewritten: false };
  const after = rewrite(text);
  if (!scan(after).length) return { text: after, violations: before, rewritten: true };
  const key = presentationState === 'P-01' ? 'P_01'
    : presentationState === 'P-02' ? 'P_02'
      : presentationState === 'P-03' ? 'P_03'
        : presentationState === 'P-04' ? 'P_04' : 'P_05';
  return { text: FALLBACK[key], violations: before, rewritten: true, fallback: true };
}

// 对呈现层所有用户可见文案做一次统一校验。
export function sanitizeAll(presentation) {
  const log = [];
  const fields = ['state_reason', 'reason_detail', 'next_action'];
  const out = { ...presentation };
  for (const f of fields) {
    const r = sanitize(f, out[f], presentation.presentation_state);
    if (r.violations.length) log.push({ field: f, violations: r.violations, rewritten: r.rewritten });
    out[f] = r.text;
  }
  out.reason_steps = (presentation.reason_steps || []).map((s, i) => {
    const r = sanitize(`reason_steps[${i}]`, s, presentation.presentation_state);
    if (r.violations.length) log.push({ field: `reason_steps[${i}]`, violations: r.violations, rewritten: r.rewritten });
    return r.text;
  });
  out.limitations = (presentation.limitations || []).map((s, i) => {
    const r = sanitize(`limitations[${i}]`, s, presentation.presentation_state);
    if (r.violations.length) log.push({ field: `limitations[${i}]`, violations: r.violations, rewritten: r.rewritten });
    return r.text;
  });
  out.compliance_log = log;
  return out;
}
