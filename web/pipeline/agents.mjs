// 五个专职 Agent。每个 Agent 只对自己那一类证据负责，只产出「可观察事实 + 定位 + 替代解释 + 证据强度」，
// 不产出真假结论。真假由 fuse.mjs 用规则算，present.mjs 只做映射。
import { commentContext } from '../comment-signals.mjs';
import { matchProducts, productEntry } from '../products.mjs';
import { inspectImages } from './forensics.mjs';
import { DIMS, E, maxState } from './standards.mjs';
import {
  authorityClaims, captionText, numericConflicts, textImageConflicts,
  unsupportedAbsolutes,
} from './extract.mjs';
import { ground } from './grounding.mjs';

const CANNOT = {
  D1: ['发布者主观故意', '商品真伪'],
  D2: ['发布者主观故意', '整条内容为假', '商品真伪'],
  D3: ['发布者主观故意', '整条内容为假'],
  D4: ['发布者主观故意', '账号身份', '组织化行为'],
  D5: ['发布者主观故意'],
  D6: ['商品真伪', '官方认证'],
};

const has = (s) => typeof s === 'string' && s.trim().length > 0;

function bag(dim) {
  let n = 0;
  const items = [];
  return {
    // strength: E3 直接冲突 | E2 两项指向同一问题 | E1 单条线索 | E0 反向核对
    add(strength, o) {
      if (!o || (!o.quote && !o.observation)) return;
      n += 1;
      items.push({
        evidence_id: `EVD-${dim}-${String(n).padStart(2, '0')}`,
        dim,
        dim_plain: DIMS[dim].plain,
        direction: 'support',
        independent: true,
        alt_explanation: [],
        cannot_infer: CANNOT[dim],
        location_quality: o.image_index !== undefined || o.seconds !== undefined ? '精确' : '仅线索',
        strength,
        ...o,
      });
    },
    items,
    strongest() {
      const support = items.filter((e) => e.direction === 'support');
      if (!support.length) return items.some((e) => e.direction === 'counter') ? E.E0 : null;
      return maxState(support.map((e) => e.strength));
    },
  };
}

/* ---------------- D1 文字依据 ---------------- */
export async function claimAgent({ text, lines, references = [], llm }) {
  const b = bag('D1');
  let failed = false;
  let checked = 0;
  const body = captionText(text, lines);
  // 图文对照由 D3 负责；这里只把「被图片证实过的数字对」排除，避免同一件事算两遍。
  const covered = new Set(textImageConflicts(body, lines).map((c) => `${c.typed.value}|${c.image.value}`));

  // 1) 同一段文字里两个数字互相打架：两处都出自材料，指向同一个问题。
  for (const c of numericConflicts(body)) {
    if (covered.has(`${c.a.value}|${c.b.value}`) || covered.has(`${c.b.value}|${c.a.value}`)) continue;
    b.add(E.E2, {
      quote: `${c.a.quote}…${c.b.quote}`,
      observation: `同一份内容里「${c.a.value}」和「${c.b.value}」同时出现，单位都是${c.unit === '%' ? '百分号' : c.unit}。`,
      explanation: '两处至少有一处不准，需要找到原始说明。',
      alt_explanation: ['说的不是同一项指标', '一处是笔误并已更正'],
    });
  }

  // 2) 资料对照（确定性）：数字、权威、绝对化、医疗功效，逐句比对。
  //    只有资料明确写出相反结论才算冲突；资料没写到一律算沉默，不当作编造。
  const grounded = new Set();
  if (references.length && has(text)) {
    const g = ground(text, references);
    for (const it of g.items) {
      grounded.add(it.quote.slice(0, 40));
      if (it.verdict === 'conflict') {
        b.add(E.E3, {
          quote: it.quote,
          kind: 'conflict',
          observation: it.kind === 'number'
            ? `这句写「${it.quote.slice(0, 40)}」，资料里同一项是「${it.refQuote.slice(0, 40)}」，两个数字对不上。`
            : `这句和资料对不上：资料原文是「${String(it.refQuote || '').slice(0, 50) || '给出了相反说明'}」。`,
          explanation: '先确认说的是不是同一款、同一版本，再决定信哪个。',
          alt_explanation: ['版本或批次不同', '说的是另一项指标'],
          location_quality: '精确',
        });
      } else if (it.verdict === 'support') {
        b.add(E.E0, {
          quote: it.quote,
          kind: 'support',
          direction: 'counter',
          observation: it.kind === 'disclosure'
            ? '这句主动说明了素材的做法和适用范围，属于已经交代清楚的部分。'
            : `这句和资料一致：「${String(it.refQuote || '').slice(0, 40)}」。`,
          explanation: '这处说法能和资料对上，先保留。',
          location_quality: '精确',
        });
      }
    }
  }

  // 3) 有模型时，只补「语义级」对照：确定性规则覆盖不到的表述。
  if (llm && references.length && has(text)) {
    try {
      const out = await llm.chatJSON(
        '你是资料核对员，只做一件事：判断材料里的具体主张与给定参考资料的关系。' +
        'support 只能取「支持」「沉默」「否定」「不适用」。参考资料没写到的，一律写「沉默」，不能因为没写就说人家编造。' +
        '只有参考资料明确写出相反结论时，才写「否定」，并把参考资料原句放进 ref_quote。' +
        '禁止概率、分数、置信度。禁止推断发布者动机。只输出 JSON：' +
        '{"judgements":[{"quote":"材料原句","support":"支持|沉默|否定|不适用","ref_quote":"参考资料原句，没有就空","note":"一句话说明"}]}',
        JSON.stringify({
          material: body.slice(0, 6000),
          references: references.map((r) => ({ id: r.id, title: r.title, excerpt: r.excerpt.slice(0, 900) })),
        }),
        { maxTokens: 1200 },
      );
      const list = Array.isArray(out?.judgements) ? out.judgements.slice(0, 8) : [];
      for (const j of list) {
        if (!has(j?.quote) || !text.includes(j.quote.trim())) continue;
        checked += 1;
        if (j.support === '否定' && has(j.ref_quote)) {
          b.add(E.E3, {
            quote: j.quote.trim(),
            observation: `这句话和查到的资料对不上：资料原文是「${j.ref_quote.slice(0, 60)}」。`,
            explanation: has(j.note) ? j.note.slice(0, 90) : '需要确认引用的资料是不是同一款、同一版本。',
            alt_explanation: ['引用了另一款产品的数据', '资料版本不同'],
            location_quality: '精确',
          });
        } else if (j.support === '支持' && has(j.ref_quote)) {
          b.add(E.E0, {
            quote: j.quote.trim(),
            direction: 'counter',
            observation: `这句和查到的资料一致：「${j.ref_quote.slice(0, 50)}」。`,
            explanation: '这处说法有资料能对上，先保留。',
            location_quality: '精确',
          });
        }
      }
    } catch {
      failed = true;
    }
  }

  const strongest = b.strongest();
  const state = failed && !strongest ? E.EF : strongest || E.EI;
  return {
    dim: 'D1', state,
    coverage: checked ? 'partial' : references.length ? 'partial' : 'none',
    evidence: b.items,
    notes: b.items.length ? '' : references.length ? '这条内容里没找到能和资料直接对上的具体说法。' : '这次没有可对照的公开资料。',
  };
}

/* ---------------- D5 上下文完整性 ---------------- */
// 只报「边界问题」：绝对化承诺、医疗级功效、说不清出处的权威背书。
// 普通功效说法本身不是问题——有资料能对上的交给 D1，没资料也不该由 D5 判死。
export async function contextAgent({ text, lines = [], references = [] }) {
  const b = bag('D5');
  const body = captionText(text, lines) || (typeof text === 'string' ? text : '');
  const askLike = (q) => /[？?]\s*$/.test(q) || /(在哪|是什么|为什么|怎么|如何|能不能|是否|吗|呢|什么|哪些|我想知道|请问|有没有依据)/.test(q);
  const abs = unsupportedAbsolutes(body).filter((c) => !askLike(c.quote));
  const refText = references.map((r) => r.excerpt || '').join('\n');
  const refLimits = refText.split(/[。；\n]/).filter((x) => /(不能|仅|不超过|没有|未做|需|建议).{0,12}/.test(x));
  const shareTopic = (x, q) => {
    const big = (v) => { const t = String(v).replace(/[\s，。；]/g, ''); const s2 = new Set(); for (let i = 0; i + 1 < t.length; i++) s2.add(t.slice(i, i + 2)); return s2; };
    const A = big(x), B = big(q);
    if (!A.size || !B.size) return false;
    let n = 0; for (const v of B) if (A.has(v)) n += 1;
    return n / Math.min(A.size, B.size) >= 0.28;
  };
  const seen = new Set();
  for (const c of abs) {
    if (seen.has(c.quote)) continue;
    seen.add(c.quote);
    const sameTopic = refLimits.find((l) => shareTopic(l, c.quote));
    const hasLimit = !!sameTopic && !refText.includes(c.quote.slice(0, 12));
    b.add(hasLimit ? E.E3 : E.E1, {
      quote: c.quote.slice(0, 120),
      kind: 'absolute',
      ref_quote: hasLimit ? sameTopic.slice(0, 60) : undefined,
      observation: `这句把话说满了：「${c.quote.slice(0, 50)}」。`,
      explanation: '效果一般都有条件，说满了就容易让读者以为人人都能这样。',
      alt_explanation: ['作者在别处写了条件，只是这段没带', '这只是个人感受，不是对所有人的承诺'],
    });
  }
  for (const c of authorityClaims(body)) {
    if (seen.has(c.quote) || askLike(c.quote)) continue;
    seen.add(c.quote);
    b.add(E.E1, {
      quote: c.quote.slice(0, 120),
      kind: 'authority',
      observation: `提到了「${c.quote.slice(0, 40)}」，但没给出本人或机构的原始出处。`,
      explanation: '说是谁推荐的，得能对上原视频、原声明或原论文。',
      alt_explanation: ['出处写在主页或评论区', '只是转述，不是本人背书'],
    });
  }
  const support = b.items.filter((e) => e.direction === 'support').length;
  const state = support === 0 ? E.E0 : support >= 2 ? E.E2 : E.E1;
  return { dim: 'D5', state, coverage: support ? 'partial' : 'full', evidence: b.items, notes: '' };
}

/* ---------------- D2 / D3 画面与图文 ---------------- */
export async function visualAgent({ text, lines, images = [], kind, llm }) {
  const d2 = bag('D2');
  const d3 = bag('D3');
  let d2Failed = false;
  let visualCues = 0;
  const body = captionText(text, lines);

  // 图文数字冲突归 D3。
  for (const c of textImageConflicts(body, lines)) {
    d3.add(E.E3, {
      quote: c.image.quote,
      image_index: c.image.imageIndex,
      box: c.image.box,
      observation: `图上的文字是「${c.image.value}」，和正文的「${c.typed.value}」对不上。`,
      explanation: '图上标的和文案写的不一致，先确认是不是同一件。',
      location_quality: c.image.box ? '精确' : '近似',
      alt_explanation: ['版本不同', '图上文字不是这款的标注'],
    });
  }

  if (llm && images.length) {
    try {
      const content = [{ type: 'text', text: JSON.stringify({ caption: body.slice(0, 4000), imageCount: images.length }) }];
      images.slice(0, 6).forEach((src, i) => content.push({ type: 'text', text: `图片索引 ${i}` }, { type: 'image_url', image_url: { url: src } }));
      const out = await llm.chatJSON(
        '你是画面观察员。只描述你实际看到的东西，不下真假结论。' +
        '严禁说图片是 AI 生成、换脸、拼接或被篡改——你没有检测工具，不能这么说。' +
        '只找两类东西：① 画面文字和文案明显对不上（色号、容量、成分、前后对比方向）；② 光影、边缘、重复纹理这类「可能被修过」的可见线索，但必须同时给一个普通解释。' +
        '禁止概率和分数。只输出 JSON：' +
        '{"conflicts":[{"caption_quote":"文案原句","image_index":0,"note":"哪里对不上"}],"cues":[{"image_index":0,"observation":"看到了什么","normal_explanation":"普通解释可能是什么"}]}',
        content,
        { maxTokens: 1200 },
      );
      for (const c of Array.isArray(out?.conflicts) ? out.conflicts.slice(0, 4) : []) {
        if (!has(c?.note)) continue;
        d3.add(E.E1, {
          quote: has(c.caption_quote) && text.includes(c.caption_quote) ? c.caption_quote : '',
          image_index: Number.isInteger(c.image_index) ? c.image_index : 0,
          observation: c.note.slice(0, 110),
          explanation: '文案和画面说法对不上，值得先核对。',
          location_quality: '近似',
          alt_explanation: ['拍摄角度或光线不同', '说的是不同步骤'],
        });
      }
      for (const c of Array.isArray(out?.cues) ? out.cues.slice(0, 3) : []) {
        if (!has(c?.observation)) continue;
        visualCues += 1;
        d2.add(E.E1, {
          image_index: Number.isInteger(c.image_index) ? c.image_index : 0,
          observation: c.observation.slice(0, 110),
          explanation: has(c.normal_explanation) ? c.normal_explanation.slice(0, 90) : '也可能只是光线或压缩造成的。',
          location_quality: '仅线索',
          alt_explanation: ['光线与阴影', '压缩或滤镜', '拍摄角度'],
        });
      }
    } catch {
      d2Failed = true;
    }
  }

  // 真算法取证：复制粘贴、频域、噪声、编辑软件记录。只给信号和坐标，不下结论。
  let fxRan = 0;
  const fxNotes = [];
  if (images.length) {
    let results = [];
    try { results = await inspectImages(images); } catch { results = []; }
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r || !r.ok) continue;
      fxRan += 1;
      for (const f of forensicFindings(r, i, { hasText: has(text) })) {
        d2.add(f.strength, f.fields);
        if (f.note) fxNotes.push(f.note);
      }
    }
  }

  // 没有原片、没有拍摄链、也没有可用信号：不能说「修没修」。如实标材料不足。
  if (!d2.items.length) {
    if (d2Failed) {
      d2.add(E.EF, {
        observation: '这次没能看图判断画面，检查中断了。',
        explanation: '重试一次，或换一张清晰的原图。',
        location_quality: '无法定位',
        alt_explanation: [],
      });
    } else if (fxRan && has(text)) {
      d2.add(E.E0, {
        direction: 'counter',
        kind: 'no_signal',
        observation: '这张图做了压缩、频域、噪声和重复区域检查，没有发现被改动过的痕迹。',
        explanation: '这只说明在现有检查里没找到痕迹；没有原片时，不能当成绝对没修过。',
        location_quality: '无法定位',
        alt_explanation: [],
      });
    } else {
      d2.add(E.EI, {
        observation: '这张图修没修、是不是原图，现在还看不出来：没有原片，也没有拍摄记录。',
        explanation: '要判断这个，需要作者的原片、拍摄时间，或同一场景的连续画面。',
        location_quality: '无法定位',
        alt_explanation: ['画面本身可能没问题，只是缺对照'],
      });
    }
  }

  const s2 = d2.strongest() || E.EI;
  const s3 = d3.strongest() || (has(body) ? E.E0 : E.NA);
  return {
    d2: { dim: 'D2', state: s2, coverage: visualCues || fxRan ? 'partial' : 'none', evidence: d2.items, notes: fxNotes.join('、') },
    d3: { dim: 'D3', state: s3, coverage: d3.items.length ? 'partial' : 'full', evidence: d3.items, notes: '' },
  };
}

// 把一份取证结果翻译成证据条目。纯函数，便于单测。
export function forensicFindings(r, index = 0, opts = {}) {
  const out = [];
  if (!r || !r.ok) return out;
  const d = r.detectors || {};
  const cm = d.copy_move || {};
  const ufd = d.ufd || {};
  const md = d.metadata || {};
  const soft = ['ela', 'spectral', 'noise'].filter((k) => ['strong', 'medium'].includes(d[k]?.level));

  // 排版图、截图里的重复块多半是版式元素，不能当成复制粘贴；有可读文字时一律降级。
  if (['strong', 'medium'].includes(cm.level) && !opts.hasText) {
    const pair = cm.pairs?.[0];
    out.push({
      strength: cm.level === 'strong' ? E.E2 : E.E1,
      note: '复制粘贴',
      fields: {
        image_index: index,
        box: pair?.a,
        observation: pair
          ? `同一张图里有两块内容高度吻合：一块在${where(pair.a)}，另一块在${where(pair.b)}。`
          : '同一张图里有两块内容高度吻合。',
        explanation: '这可能是复制粘贴，也可能是平铺纹理或重复图案，需要原图对照。',
        location_quality: pair?.a ? '精确' : '近似',
        alt_explanation: ['平铺纹理或重复图案', '同一张贴纸的多个角度', '背景本身重复'],
      },
    });
  } else if (['strong', 'medium'].includes(ufd.level)) {
    out.push({
      strength: ufd.level === 'strong' ? E.E2 : E.E1,
      note: '生成图检测',
      fields: {
        image_index: index,
        observation: '生成图专用检测器在这张图上给出了生成痕迹。',
        explanation: '生成图不等于内容骗人，但需要确认它是不是被当成实拍使用。',
        location_quality: '无法定位',
        alt_explanation: ['后期合成或重绘', '多次压缩', '截图重存'],
      },
    });
  } else if (soft.length) {
    const parts = soft.map((k) => ({ ela: '局部压缩差异', spectral: '频域周期峰', noise: '噪声不一致' }[k]));
    out.push({
      strength: E.E1,
      note: parts.join('、'),
      fields: {
        image_index: index,
        observation: `画面有${parts.join('、')}，可能来自修图，也可能只是压缩或纹理。`,
        explanation: '这些是间接信号，单独看不能说明画面被改过。',
        location_quality: '仅线索',
        alt_explanation: ['二次压缩', '滤镜', '织物或平铺纹理'],
      },
    });
  }

  if (md.level === 'weak' && md.software) {
    out.push({
      strength: E.E1,
      note: '编辑软件记录',
      fields: {
        image_index: index,
        observation: `这张图的元数据里留了编辑软件记录：${String(md.software).slice(0, 30)}。`,
        explanation: '用软件处理过是正常的；要看处理有没有改变产品效果。',
        location_quality: '无法定位',
        alt_explanation: ['正常调色或裁剪', '导出时带上的软件标记'],
      },
    });
  }

  if (r.provenance) {
    out.push({
      strength: E.E0,
      note: '',
      fields: {
        image_index: index,
        direction: 'counter',
        observation: '这张图带相机信息或来源记录，来源链相对完整。',
        explanation: '有来源记录是个好信号，但它只说明文件来源，不证明画面内容没被安排。',
        location_quality: '无法定位',
        alt_explanation: [],
      },
    });
  }
  return out;
}

// 把归一化坐标说成「画面左上方」这种普通人能懂的位置。
function where(box) {
  if (!Array.isArray(box) || box.length !== 4) return '画面某处';
  const [x, y, w, h] = box;
  const cx = Math.min(0.999, Math.max(0, x + w / 2));
  const cy = Math.min(0.999, Math.max(0, y + h / 2));
  const col = cx < 0.38 ? 0 : cx < 0.62 ? 1 : 2;
  const row = cy < 0.38 ? 0 : cy < 0.62 ? 1 : 2;
  const names = [
    ['左上角', '正上方', '右上角'],
    ['左侧', '正中间', '右侧'],
    ['左下角', '正下方', '右下角'],
  ];
  return '画面' + names[row][col];
}

/* ---------------- D4 评论区真实性 ---------------- */
// 评论看三件事：时间线是否自相矛盾、文本是否成组重复、是否有采集层重复。
// 样本少不等于材料不足：少也能看，只是不下比例结论。
export function commentAgent({ comments = [], hasComments }) {
  const b = bag('D4');
  if (!hasComments) return { dim: 'D4', state: E.NA, coverage: 'none', evidence: [], notes: '这次没有评论可看。' };

  // 采集层重复：同一 comment_id 出现两次，是抓取重试，不是刷评。
  const seenId = new Set();
  const deduped = [];
  let collapsed = 0;
  for (const c of comments) {
    const id = c.id || `${c.authorKey}|${c.text}`;
    if (c.id && seenId.has(c.id)) { collapsed += 1; continue; }
    seenId.add(id);
    deduped.push(c);
  }

  const times = deduped
    .map((c) => (c.at ? Date.parse(c.at) : NaN))
    .filter((t) => Number.isFinite(t));
  const spanDays = times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / 86400000 : null;

  // 1) 时间线矛盾：说「连续用了 N 天」，但首末评论间隔明显不够。
  let timeline = null;
  for (const c of deduped) {
    const m = /(?:连续|坚持|用了|使用|回购)[^0-9]{0,4}(\d{2,3})\s*天/.exec(c.text || '');
    if (!m) continue;
    const claimed = Number(m[1]);
    if (!(claimed >= 7) || spanDays === null) continue;
    if (spanDays + 0.5 < claimed * 0.5) { timeline = { comment: c, claimed }; break; }
  }
  if (timeline) {
    b.add(E.E3, {
      quote: (timeline.comment.text || '').slice(0, 80),
      kind: 'timeline',
      observation: `这条说连续用了 ${timeline.claimed} 天，但最早和最晚一条评论只隔了约 ${Math.max(1, Math.round(spanDays))} 天。`,
      explanation: '时间对不上，要么这条不是同一次使用的记录，要么日期有问题。',
      alt_explanation: ['时间是补写的', '说的是之前的使用经历'],
      location_quality: '精确',
    });
    return { dim: 'D4', state: E.E3, coverage: 'partial', evidence: b.items, notes: '时间线矛盾',
      sample: { total: deduped.length, collapsed } };
  }

  // 2) 全文完全相同：只能提示重复，不足以说明账号行为。
  const byText = new Map();
  for (const c of deduped) {
    const k = (c.text || '').replace(/\s/g, '');
    if (k.length < 6) continue;
    byText.set(k, [...(byText.get(k) || []), c]);
  }
  const exact = [...byText.values()].filter((g) => g.length >= 3);

  // 3) 结构相似但不完全相同：成组话术线索。
  const ctx = commentContext(deduped);
  if (exact.length) {
    b.add(E.EI, {
      quote: (exact[0][0].text || '').slice(0, 60),
      kind: 'exact-repeat',
      observation: `有 ${exact[0].length} 条评论文字完全一样，集中在同一段时间。`,
      explanation: '可能是同一段话被反复贴，也可能只是复制粘贴了别人的评价；这一点还不能说明账号是谁。',
      location_quality: '近似',
      alt_explanation: ['复制别人的评价', '活动统一话术', '采集重复'],
    });
    return { dim: 'D4', state: E.EI, coverage: 'partial', evidence: b.items, notes: '存在完全重复文本',
      sample: { total: deduped.length, collapsed } };
  }
  if (ctx.groups.length) {
    const g = ctx.groups[0];
    b.add(E.E2, {
      quote: (g.comments[0]?.text || '').slice(0, 80),
      kind: 'template',
      observation: `${ctx.groups.length} 组评论写法高度接近，共 ${ctx.suspicious} 条，比如「${(g.comments[0]?.text || '').slice(0, 34)}」。`,
      explanation: '可能是同一套话术，也可能是活动统一要求或大家看到同一个卖点，还不能确定。',
      location_quality: '近似',
      alt_explanation: ['活动统一话术', '真实用户看到同一卖点'],
      independent: false,
    });
    return { dim: 'D4', state: E.E2, coverage: 'partial', evidence: b.items, notes: '成组相似',
      sample: { total: deduped.length, collapsed } };
  }

  // 4) 有相似但没有时间字段：时间聚集判断做不了，只能算无法判定。
  if (ctx.duplicates > 0 && times.length === 0) {
    b.add(E.EF, {
      observation: '评论里有相似表达，但这批评论没有发布时间，没法判断是不是集中发布。',
      explanation: '需要发布时间或后台记录，才能继续。',
      location_quality: '无法定位',
      alt_explanation: [],
    });
    return { dim: 'D4', state: E.EF, coverage: 'partial', evidence: b.items, notes: '缺时间字段',
      sample: { total: deduped.length, collapsed } };
  }

  b.add(E.E0, {
    observation: `看了 ${deduped.length} 条评论，没发现成组重复或时间线矛盾${collapsed ? `（另有 ${collapsed} 条是抓取重复，已去重）` : ''}。`,
    explanation: '这只说明已读的这批里没有，不代表整条帖子都正常。',
    direction: 'counter',
    location_quality: '精确',
    alt_explanation: [],
  });
  return { dim: 'D4', state: E.E0, coverage: 'partial', evidence: b.items, notes: ctx.summary || '',
    sample: { total: deduped.length, collapsed } };
}

/* ---------------- D6 商品真实性 ---------------- */
export function productAgent({ text }) {
  const b = bag('D6');
  const matches = matchProducts(text).filter((m) => m.kind === 'product').slice(0, 3);
  if (!matches.length) {
    return { dim: 'D6', state: E.EI, coverage: 'none', evidence: [], notes: '没认出手上资料里的具体商品。' };
  }
  for (const m of matches) {
    const entry = productEntry(m.id);
    if (!entry?.product) continue;
    b.add(m.needsConfirm ? E.E1 : E.E0, {
      quote: m.quote,
      direction: m.needsConfirm ? 'support' : 'counter',
      observation: m.needsConfirm
        ? `认出了「${entry.product.name}」，但没写清版本或规格，没法逐项核对。`
        : `名称、品牌对上了「${entry.product.name}」，和官网说明的一致。`,
      explanation: m.needsConfirm ? '同系列常有几个版本，版本不同成分也不一样。' : '字段对得上，但这只是名称和品牌，不是正品鉴定。',
      location_quality: '近似',
      alt_explanation: ['版本或地区不同', '包装改版'],
    });
  }
  const state = b.strongest() || E.EI;
  return { dim: 'D6', state, coverage: 'partial', evidence: b.items, notes: '' };
}

/* ---------------- 音视频：字幕与口播对齐 ---------------- */
export function audioAgent({ lines = [] }) {
  const b = bag('D3');
  const timed = lines.filter((l) => Number.isFinite(l.seconds));
  if (timed.length < 2) return null;
  let cues = 0;
  for (let i = 0; i + 1 < timed.length; i++) {
    const negA = /(?:不|没|别|无需|不能)/.test(timed[i].text);
    const negC = /(?:不|没|别|无需|不能)/.test(timed[i + 1].text);
    const close = Math.abs((timed[i].seconds || 0) - (timed[i + 1].seconds || 0)) < 3;
    if (negA !== negC && close) cues += 1;
  }
  if (cues) {
    b.add(E.E1, {
      quote: '',
      seconds: timed[0].seconds,
      observation: `字幕和口播有 ${cues} 处对不齐，其中一处一半有「不 / 没」这类词，另一半没有。`,
      explanation: '可能是转写听错，也可能是剪辑时删掉了否定词。',
      location_quality: '近似',
      alt_explanation: ['转写听错', '口音或背景音乐'],
    });
  }
  return { dim: 'D3', state: b.strongest() || E.E0, coverage: 'partial', evidence: b.items, notes: '' };
}


/* ---------------- 字幕与口播对齐 ---------------- */
// 同一时间点的字幕和口播应当说的是同一件事。对不上就是可直接指认的冲突。
export function captionAgent({ captions = [], lines = [] }) {
  const b = bag('D3');
  if (!captions.length) return null;
  const speak = lines.filter((l) => Number.isFinite(l.seconds));
  const numset = (s) => new Set((String(s).match(/\d+(?:\.\d+)?%?/g) || []));
  const bigrams = (s) => {
    const t = String(s).replace(/[\s，。！？、,.!?]/g, '');
    const out = new Set();
    for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2));
    return out;
  };
  const sim = (a, c) => {
    const A = bigrams(a), C = bigrams(c);
    if (!A.size || !C.size) return 0;
    let inter = 0;
    for (const x of A) if (C.has(x)) inter += 1;
    return inter / Math.min(A.size, C.size);
  };
  let mismatches = 0;
  let first = null;
  for (const c of captions) {
    const near = speak.filter((l) => Math.abs((l.seconds || 0) - (c.start || 0)) <= 2.5);
    if (!near.length) continue;
    const s = near.map((l) => l.text).join('');
    const nc = numset(c.text), ns = numset(s);
    const numDiff = [...nc].some((x) => !ns.has(x)) || [...ns].some((x) => !nc.has(x));
    const lowSim = sim(c.text, s) < 0.55;
    if (numDiff || lowSim) {
      mismatches += 1;
      if (!first) first = { caption: c.text, speech: s, start: c.start };
    }
  }
  if (!first) {
    b.add(E.E0, {
      direction: 'counter',
      kind: 'caption_align',
      observation: `逐句对过 ${captions.length} 段字幕，和口播说的是同一件事。`,
      explanation: '字幕和口播能对上，这一处先保留。',
      location_quality: '精确',
      alt_explanation: [],
    });
    return { dim: 'D3', state: E.E0, coverage: 'full', evidence: b.items, notes: '字幕口播一致' };
  }
  b.add(E.E3, {
    quote: String(first.caption).slice(0, 60),
    kind: 'caption',
    seconds: first.start,
    observation: `同一时间点，口播说的是「${String(first.speech).slice(0, 34)}」，字幕写的是「${String(first.caption).slice(0, 34)}」。`,
    explanation: '字幕和口播不是一回事，读者看到的是字幕，听到的是另一句。',
    location_quality: '精确',
    alt_explanation: ['字幕是概括而非逐字稿', '转写听错'],
  });
  return { dim: 'D3', state: E.E3, coverage: 'partial', evidence: b.items, notes: `${mismatches} 处不一致` };
}

/* ---------------- 并行跑全部 Agent ---------------- */
export async function runAgents(input, { references, llm }) {
  const hasComments = (input.comments || []).length > 0;
  const needVisual = (input.images?.length || 0) > 0 || input.kind === 'video';
  const [claim, context, visualRes, audio] = await Promise.all([
    claimAgent({ text: input.text, lines: input.lines, references, llm }),
    contextAgent({ text: input.text, lines: input.lines, references }),
    needVisual
      ? visualAgent({ text: input.text, lines: input.lines, images: input.images || [], kind: input.kind, llm })
      : Promise.resolve({
        d2: { dim: 'D2', state: E.NA, coverage: 'none', evidence: [], notes: '' },
        d3: { dim: 'D3', state: E.NA, coverage: 'none', evidence: [], notes: '' },
      }),
    (input.kind === 'audio' || input.kind === 'video') ? Promise.resolve(audioAgent(input)) : Promise.resolve(null),
  ]);

  const d3 = visualRes.d3;
  // 字幕与口播逐句对齐，优先级高于泛化的音画线索。
  const capt = input.captions?.length ? captionAgent({ captions: input.captions, lines: input.lines || [] }) : null;
  if (capt?.evidence?.length) {
    d3.evidence = [...capt.evidence, ...d3.evidence];
    d3.state = maxState([d3.state, capt.state]);
    d3.coverage = 'partial';
  }
  // 音视频的字幕/口播线索并入 D3。
  if (audio?.evidence?.length) {
    d3.evidence = [...d3.evidence, ...audio.evidence];
    d3.state = maxState([d3.state, audio.state]);
    d3.coverage = 'partial';
  }
  return [
    claim, context, visualRes.d2, d3,
    commentAgent({ comments: input.comments || [], hasComments }),
    productAgent({ text: input.text }),
  ];
}
