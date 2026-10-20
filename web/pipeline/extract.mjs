// 确定性抽取：先从原文和 OCR 行里找出「可核验的主张」和「能摆到台面上的数字冲突」。
// 这一层不调用模型，结论不依赖模型心情。模型只负责补充解释，不负责定罪。

const ABSOLUTE = /(?:永久|彻底|根治|完全|绝对|百分百|100\s*%|零(?:风险|刺激|添加|缺点)|所有(?:人|肤质|肌肤)|任何(?:人|肤质|场景)|人人|都能|一定会|保证(?:有效|见效|变白)?|永不|永久性|立竿见影|一次见效|包治)/g;
const EFFICACY = /(?:美白|变白|祛痘|祛斑|抗老|抗皱|去皱|淡纹|紧致|修复|修护|瘦脸|去黑头|除螨|消炎|控油|补水|保湿|提亮|焕肤)/g;
const AUTHORITY = /(?:专家|医生|医师|院士|教授|主任|临床(?:证明|验证|试验)|认证|检测报告|三甲|皮肤科|研究所|实验室)/g;
// 只有真正交代了测试方法才算「有条件」。「三天」「敏感肌」都只是描述，不是测试设计。
const CONDITION = /(?:测试|试验|试用|样本|受试|人数|双盲|对照|仪器|测量|自评|问卷)/g;
const NUMBER_UNIT = /(\d+(?:\.\d+)?)\s*(%|％|天|周|个月|小时|倍|人|位|名|例|次|ml|毫升|g|克)/g;
const COMPARE_HINT = /(?:写|标|写的是|标注|瓶身|包装|官网|说明|实际|对照|原文|笔记|客服|宣传|广告|页面)/;

// 只分析作者正文，不把评论区的话当成作者的主张。
// 前端会把公开评论拼在正文后面（形如「评价1（作者）：…」），这里切掉。
export function postText(text) {
  if (typeof text !== 'string') return '';
  return text
    .split(/\n(?:评价|评论)\s*\d+\s*[（(：:]/)[0]
    .split(/\n-{2,}\s*评论/)[0]
    .slice(0, 16000);
}

// 作者自己写的正文：切掉评论区，再挖掉 OCR 读出来的图片文字。
// 这样「文案说的」和「图上标的」才能分开比。
export function captionText(text, lines = []) {
  let s = postText(text) || (typeof text === 'string' ? text : '');
  for (const l of lines) {
    const t = typeof l?.text === 'string' ? l.text.trim() : '';
    if (t.length >= 3) s = s.split(t).join(' ');
  }
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

export function splitSentences(text) {  if (typeof text !== 'string') return [];
  const out = [];
  const re = /[^。！？!?\n；;]+[。！？!?\n；;]?/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    if (!raw.trim()) continue;
    out.push({ text: raw.trim(), start: m.index, end: m.index + raw.length });
  }
  return out;
}

function uniqQuotes(text, re) {
  const quotes = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    const quote = m[0];
    if (!quote) continue;
    const idx = text.indexOf(quote, m.index);
    quotes.push({ quote, at: idx >= 0 ? idx : m.index });
  }
  return quotes;
}

export function numbersOf(text) {
  const out = [];
  NUMBER_UNIT.lastIndex = 0;
  let m;
  while ((m = NUMBER_UNIT.exec(text))) {
    out.push({ value: Number(m[1]), raw: m[1] + m[2], unit: m[2].replace('％', '%'), at: m.index, quote: m[0] });
  }
  return out;
}

// 抽取可核验主张。type: absolute | number | authority | efficacy | experience
export function extractClaims(text, { limit = 12 } = {}) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const sentences = splitSentences(text);
  const claims = [];
  const push = (type, quote, at, signals) => {
    if (!quote || quote.length < 4 || quote.length > 220) return;
    if (claims.some((c) => c.quote === quote && c.type === type)) return;
    if (claims.length >= limit) return;
    claims.push({ claim_id: `C${claims.length + 1}`, type, quote, at, has_condition: CONDITION.test(quote), signals });
  };
  for (const s of sentences) {
    const hasAbs = new RegExp(ABSOLUTE.source).test(s.text);
    const hasEff = new RegExp(EFFICACY.source).test(s.text);
    const hasAuth = new RegExp(AUTHORITY.source).test(s.text);
    const nums = numbersOf(s.text);
    if (hasAbs) push('absolute', s.text, s.start, ['绝对化承诺']);
    if (nums.length && (hasEff || hasAbs)) push('number', s.text, s.start, nums.map((n) => n.raw));
    if (hasAuth) push('authority', s.text, s.start, ['专家/机构背书']);
    if (hasEff && !hasAbs) push('efficacy', s.text, s.start, ['功效主张']);
    if (/我(?:用|试|涂|换|坚持)/.test(s.text) && !hasAbs) push('experience', s.text, s.start, ['个人体验']);
  }
  return claims;
}

// 同一单位出现两个不同数值，且上下文有对照语气，视为可直接指出的数字分歧。
export function numericConflicts(text) {
  const nums = numbersOf(text);
  const byUnit = new Map();
  for (const n of nums) {
    if (!byUnit.has(n.unit)) byUnit.set(n.unit, []);
    byUnit.get(n.unit).push(n);
  }
  const out = [];
  for (const [unit, list] of byUnit) {
    const values = [...new Set(list.map((n) => n.raw))];
    if (values.length < 2) continue;
    // 至少两个数值在文本中相隔不远，或附近有对照词，才算同一处对比。
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.raw === b.raw) continue;
        const near = Math.abs(a.at - b.at) <= 120;
        const contextA = text.slice(Math.max(0, a.at - 12), a.at);
        const contextB = text.slice(Math.max(0, b.at - 12), b.at);
        if (!near && !(COMPARE_HINT.test(contextA) || COMPARE_HINT.test(contextB))) continue;
        out.push({
          unit,
          a: { value: a.raw, quote: a.quote, at: a.at },
          b: { value: b.raw, quote: b.quote, at: b.at },
        });
        if (out.length >= 4) return out;
      }
    }
  }
  return out;
}

// 文案里的某单位数值 vs 图片 OCR 行的另一数值：直接的图文冲突。
export function textImageConflicts(text, lines = []) {
  const imageLines = lines.filter((l) => Number.isInteger(l.imageIndex));
  if (!imageLines.length) return [];
  const typed = text;
  const out = [];
  for (const line of imageLines) {
    const imgNums = numbersOf(line.text);
    if (!imgNums.length) continue;
    for (const n of imgNums) {
      // 从整段文字里找同单位、不同值的另一个数字。
      const others = numbersOf(typed).filter((t) => t.unit === n.unit && t.raw !== n.raw);
      for (const other of others) {
        const context = typed.slice(Math.max(0, other.at - 14), other.at);
        // 图片行数字若也出现在正文里（OCR 拼进来的），跳过，避免自比自。
        if (line.text.includes(other.raw)) continue;
        if (!COMPARE_HINT.test(context) && !/(瓶身|包装|图上|图片|截图)/.test(line.text)) continue;
        out.push({
          unit: n.unit,
          typed: { value: other.raw, quote: other.quote, at: other.at },
          image: { value: n.raw, quote: line.text.trim().slice(0, 80), imageIndex: line.imageIndex, box: line.box },
          quote: other.quote,
        });
        if (out.length >= 3) return out;
      }
    }
  }
  return out;
}

// 绝对化承诺但没有测试条件：属于「需要依据」而非已证伪。
export function unsupportedAbsolutes(text) {
  return extractClaims(text)
    .filter((c) => c.type === 'absolute' && !c.has_condition)
    .slice(0, 4);
}

// 功效主张没有给出测试人数/时长/方法。
export function unsupportedEfficacy(text) {
  return extractClaims(text)
    .filter((c) => (c.type === 'efficacy' || c.type === 'number') && !c.has_condition)
    .slice(0, 4);
}

// 专家背书但拿不到本人/机构原始出处：只能算线索。
export function authorityClaims(text) {
  return extractClaims(text).filter((c) => c.type === 'authority').slice(0, 3);
}
