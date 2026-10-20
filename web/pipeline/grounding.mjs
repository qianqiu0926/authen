// 主张与资料对照引擎（确定性，不依赖模型）。
// 只回答一件事：材料里的某句话，与给定资料是「一致」「冲突」还是「资料没写到」。
// 输出带原句与资料原句，供 Agent 转成证据；不做真假裁决。
const INGREDIENTS = ['烟酰胺', '玻色因', '视黄醇', 'A醇', '维C', 'VC', '水杨酸', '果酸', '酒精', '香精', '防腐剂', '神经酰胺', '透明质酸', '玻尿酸', '泛醇', '熊果苷', '胜肽'];

const ABSOLUTE = /(永久|彻底|根治|一次见效|一次就好|百分百|100%|零风险|绝对安全|绝对有效|永不|立竿见影|立刻变白|马上变白|完全消除|包治|绝不会|所有人都)/;
const MEDICAL = /(治疗|治愈|祛斑|祛痘|生发|防脱|消炎|抗菌|修复屏障|医美级|药效|处方)/;
const AUTHORITY = /(专家|院士|教授|医生|主任|机构|协会|认证|权威|官方推荐|临床验证)/;
const DISCLOSURE = /(AI\s*生成|AI\s*合成|合成图|示意图|效果图|概念图|因人而异|非临床|不代表|仅个人|个人感受|教学|脱敏|虚构|模拟|仅供参考|受光线|受唇色|不是广告)/;
const LIMIT = /(需|要|应|建议).{0,6}(补涂|复涂)|40.{0,3}80\s*分钟|不能|仅|不超过|无法|没有|未做|缺|不宜|不适合/;
const DENIAL = /(否认|不属于|并非|未授权|没有授权|查无|虚构|不存在|与该机构无关|未参与|不实)/;

function sentences(text) {
  return String(text || '')
    .split(/[。！？；\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 60);
}

function bigrams(x) {
  const t = String(x).replace(/[\s，。；：、,.!?;:（）()「」“”"']/g, '');
  const out = new Set();
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2));
  return out;
}

function overlap(a, c) {
  const A = bigrams(a), C = bigrams(c);
  if (!A.size || !C.size) return 0;
  let n = 0;
  for (const x of A) if (C.has(x)) n += 1;
  return n / Math.min(A.size, C.size);
}

function attrOf(sentence, index) {
  const before = sentence.slice(Math.max(0, index - 18), index);
  const after = sentence.slice(index, index + 12);
  const ing = INGREDIENTS.find((x) => before.includes(x) || after.includes(x));
  if (ing) return `conc:${ing}`;
  if (/SPF/i.test(before)) return 'spf';
  if (/PA/i.test(before)) return 'pa';
  if (/(名|位|人|例)/.test(after)) return 'people';
  if (/(小时|分钟)/.test(after)) return 'span:min';
  if (/(天)/.test(after)) return 'span:day';
  if (/(周)/.test(after)) return 'span:week';
  if (/(个月)/.test(after)) return 'span:month';
  if (/(g|ml|克|毫升)/i.test(after)) return 'net';
  return 'pct';
}

// 从一段文字里抽「带属性的数字」。
export function numbers(text) {
  const out = [];
  for (const s of sentences(text)) {
    const re = /(\d+(?:\.\d+)?)\s*(%|％|小时|分钟|天|周|个月|g|ml|克|毫升|名|位|人|例)?/g;
    let m;
    while ((m = re.exec(s))) {
      const value = m[1];
      const unit = (m[2] || '').replace('％', '%');
      if (!unit && !/%|SPF|PA/i.test(s)) continue;
      out.push({ key: attrOf(s, m.index), value, unit, quote: s.slice(0, 70) });
    }
  }
  return out;
}

export function parseReferences(refs = []) {
  const raw = refs.map((r) => r.excerpt || '').join('\n');
  // 资料卡开头常写「虚构测试资料｜K07」，这是数据说明，不是对某条内容的否认。
  const text = raw.split('\n').filter((l) => !/虚构测试资料|测试资料｜|教学样本|脱敏合成/.test(l)).join('\n');
  const nums = new Map();
  for (const n of numbers(text)) if (!nums.has(n.key)) nums.set(n.key, n);
  const denialHit = text.match(new RegExp(`[^。；\\n]{0,34}(${DENIAL.source})[^。；\\n]{0,34}`));
  const identityNear = denialHit ? /(授权|认证|身份|机构|本人|专家|推荐|合作|代言|参与)/.test(denialHit[0]) : false;
  return {
    text,
    nums,
    denial: !!denialHit && identityNear,
    denialQuote: denialHit ? denialHit[0] : '',
    limitations: sentences(text).filter((s) => LIMIT.test(s)).slice(0, 6),
    refSentences: sentences(text),
  };
}

const sameNumber = (a, b) => {
  const x = parseFloat(a), y = parseFloat(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-9;
};

const isDisclaimer = (s) => /(没有|未|不能|不含|无法|不支持|未做|缺).{0,10}(试验|测试|记录|依据|数据|结论|证明)/.test(s)
  || /^(我想知道|请问|想问|是不是|能不能|有没有|哪些|如何|为什么)/.test(s)
  || /[？?]\s*$/.test(s);

// 逐句对照。
export function ground(text, refs = []) {
  const items = [];
  if (!refs.length) return { items, summary: { support: 0, conflict: 0, silent: 0 } };
  const parsed = parseReferences(refs);
  const flat = String(text || '').replace(/\s/g, '');
  const selfStated = (q) => {
    const k = String(q || '').replace(/[\s，。；：,;:]/g, '').slice(0, 14);
    return k.length >= 6 && flat.includes(k);
  };

  for (const s of sentences(text)) {
    if (isDisclaimer(s)) continue;

    // 1) 绝对化 / 医疗级承诺，且资料对同一话题有边界说明 → 冲突。
    const limitSameTopic = parsed.limitations.find((l) => overlap(l, s) >= 0.24);
    if (limitSameTopic && !selfStated(limitSameTopic) && (ABSOLUTE.test(s) || MEDICAL.test(s))) {
      items.push({ verdict: 'conflict', quote: s, refQuote: limitSameTopic, kind: ABSOLUTE.test(s) ? 'absolute' : 'medical' });
      continue;
    }

    // 1b) 否定式说法与资料相反：材料说「完全无香精」，资料写「含香精」。
    const neg = s.match(/(?:完全无|不含|没有|无|零)([\u4e00-\u9fa5]{2,4})/);
    if (neg && !selfStated(s)) {
      const term = neg[1];
      const posInRef = new RegExp(`(含|添加|含有)[^。；\\n]{0,6}${term}`).test(parsed.text)
        || (term.length >= 2 && new RegExp(`${term}[^。；\\n]{0,6}(含量|浓度)`).test(parsed.text) && !new RegExp(`(不含|无|没有)[^。；\\n]{0,4}${term}`).test(parsed.text));
      if (posInRef) {
        items.push({ verdict: 'conflict', quote: s, refQuote: (parsed.text.match(new RegExp(`[^。；\\n]{0,26}${term}[^。；\\n]{0,26}`)) || [''])[0], kind: 'negation' });
        continue;
      }
    }

    // 1c) 自称不是广告，但资料写明存在商业合作。
    if (/(不是广告|没有广告|非广告|自费购买|真心自用|纯分享)/.test(s) && /(商业合作|合作推广|赞助|品牌合作|广告合作|投放)/.test(parsed.text)) {
      items.push({ verdict: 'conflict', quote: s, refQuote: (parsed.text.match(/[^。；\n]{0,30}(商业合作|合作推广|赞助|品牌合作|广告合作|投放)[^。；\n]{0,30}/) || [''])[0], kind: 'disclosure' });
      continue;
    }

    // 2) 权威被资料否认。
    if (AUTHORITY.test(s) && parsed.denial && !selfStated(parsed.denialQuote)) {
      items.push({ verdict: 'conflict', quote: s, refQuote: parsed.denialQuote, kind: 'authority' });
      continue;
    }

    // 3) 数字：同属性不同值算冲突，同值算一致。
    const corrected = /(纠正|更正|应为|实际是|实际上是|说成|误写|原来写|旧说法)/.test(s);
    let numHit = null;
    for (const n of numbers(s)) {
      const ref = parsed.nums.get(n.key);
      if (!ref) continue;
      if (corrected || sameNumber(n.value, ref.value)) {
        numHit = { verdict: 'support', quote: s, refQuote: ref.quote, kind: corrected ? 'correction' : 'number' };
        break;
      }
      numHit = { verdict: 'conflict', quote: s, refQuote: ref.quote, kind: 'number' };
      break;
    }
    if (numHit) { items.push(numHit); continue; }

    // 4) 材料自己交代了做法与适用范围，算已披露。
    if (DISCLOSURE.test(s)) {
      items.push({ verdict: 'support', quote: s, refQuote: '', kind: 'disclosure' });
      continue;
    }

    // 5) 词面高度重合：和资料某句说的是同一件事。
    let best = 0, bestSent = '';
    for (const rs of parsed.refSentences) {
      const o = overlap(s, rs);
      if (o > best) { best = o; bestSent = rs; }
    }
    if (best >= 0.5) {
      items.push({ verdict: 'support', quote: s, refQuote: bestSent, kind: 'paraphrase' });
      continue;
    }

    // 6) 资料没写到的边界类说法：留给 D5 作为线索，不在这里升级。
    if (ABSOLUTE.test(s) || MEDICAL.test(s) || AUTHORITY.test(s)) {
      items.push({ verdict: 'silent', quote: s, refQuote: '', kind: ABSOLUTE.test(s) ? 'absolute' : MEDICAL.test(s) ? 'medical' : 'authority' });
    }
  }

  return {
    items,
    summary: {
      support: items.filter((i) => i.verdict === 'support').length,
      conflict: items.filter((i) => i.verdict === 'conflict').length,
      silent: items.filter((i) => i.verdict === 'silent').length,
    },
  };
}
