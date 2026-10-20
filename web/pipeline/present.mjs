// 呈现层：把判定层五值确定性映射成用户能看懂的结果。只做映射与措辞，不新增判断。
// 对应鉴伪标准第06步：呈现五档 P-01–P-05、理由模板 T-06、限制声明 S-01–S-13。
import { DIM_KEYS, DIMS, DIM_RESULT_TEXT, E, PRESENT, TOTAL, presentOf } from './standards.mjs';

const clip = (s, n) => {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
};

// 每个维度的白话结果，比统一的 E 态文案更具体。
const DIM_RESULT = {
  D1: { E3: '数字或说法和资料对不上', E2: '有两处说法对不上', E1: '有一处要核对', E0: '和资料对得上', EI: '没有资料可对', NA: '这次没涉及', EF: '这项没做完' },
  D2: { E3: '画面有可对照的改动', E2: '画面有需要核对的重复', E1: '画面有一处可疑，也可能只是光线', E0: '画面没发现异常', EI: '缺原片，看不出是否修过', NA: '这次没涉及', EF: '看图这步没做完' },
  D3: { E3: '图和文字对不上', E2: '有多处图文对不上', E1: '有一处图文对不上', E0: '图文没有明显冲突', EI: '缺可比材料', NA: '这次没涉及', EF: '这项没做完' },
  D4: { E3: '有成组重复的写法', E2: '有成组重复的写法', E1: '有少量重复', E0: '没发现成组重复', EI: '评论样本不够', NA: '这次没涉及', EF: '这项没做完' },
  D5: { E3: '把话说满了，还没给依据', E2: '有多处没给条件', E1: '有一处没给条件', E0: '条件写得比较全', EI: '上下文不全', NA: '这次没涉及', EF: '这项没做完' },
  D6: { E3: '商品信息对不上', E2: '多处商品信息对不上', E1: '认出了商品，但版本没写清', E0: '名称品牌对得上', EI: '没认出具体商品', NA: '这次没涉及', EF: '这项没做完' },
};

// 从一条证据里抽出「一句人话」。
function human(e) {
  if (e.observation?.includes('「')) return e.observation;
  if (e.quote) return `${e.quote.slice(0, 46)}${e.quote.length > 46 ? '…' : ''}`;
  return e.observation || '';
}

function topSupport(dims) {
  const all = dims.flatMap((d) => d.evidence.filter((e) => e.direction === 'support'));
  const order = { [E.E3]: 3, [E.E2]: 2, [E.E1]: 1, [E.EF]: 0, [E.EI]: 0 };
  return all.sort((a, b) => (order[b.strength] ?? -1) - (order[a.strength] ?? -1))[0] || null;
}

function dimNote(dim, state, evidence, notes) {
  const e = evidence.find((x) => x.direction === 'support') || evidence[0];
  if (state === E.NA) return '这次没有这类材料';
  if (state === E.EF) return '这项检查中断了';
  if (state === E.EI) return clip(e?.observation || notes || '材料不足', 46);
  return clip(e?.observation || e?.explanation || DIM_RESULT[dim]?.[state] || '', 46);
}

export function present({ fused, input, references = [], meta = {} }) {
  const state = presentOf(fused.total_decision);
  const spec = PRESENT[state];
  const dims = fused.dims;
  const top = topSupport(dims);
  const imageCount = (input.images || []).length;
  const scopeText = imageCount && ['text', 'link', 'comments'].includes(input.kind)
    ? `你发来的 ${imageCount} 张图和配文`
    : imageCount ? `你发来的 ${imageCount} 张图`
      : input.kind === 'video' ? '你发来的视频'
        : input.kind === 'audio' ? '你发来的录音'
          : input.kind === 'comments' ? '你发来的评论'
            : '你发来的文字';
  const coveredPlain = fused.covered_dims.map((k) => DIMS[k].plain);
  const uncoveredPlain = DIM_KEYS.filter((k) => fused.applicability[k] === 'skip').map((k) => DIMS[k].plain);

  // ---- 六维白话总表：6 行全列，不隐藏 ----
  const dimensionSummary = DIM_KEYS.map((k) => ({
    dim: DIMS[k].plain,
    applicable: fused.applicability[k] === 'skip' ? '本次未涉及' : '适用',
    result: DIM_RESULT[k]?.[fused.dim_state_vector[k]] || DIM_RESULT_TEXT[fused.dim_state_vector[k]] || '本次没涉及',
    note: dimNote(k, fused.dim_state_vector[k], dims.find((d) => d.dim === k)?.evidence || [], dims.find((d) => d.dim === k)?.notes),
  }));

  // ---- 证据卡：只放真正找到的线索/冲突，材料不足不占卡片；最多 3 张，反证强制展示 ----
  const strengthRank = { [E.E3]: 3, [E.E2]: 2, [E.E1]: 1 };
  const supportEvidence = dims
    .flatMap((d) => d.evidence.filter((e) => e.direction === 'support' && strengthRank[e.strength]))
    .sort((a, b) => (strengthRank[b.strength] - strengthRank[a.strength]) || (DIMS[a.dim].order - DIMS[b.dim].order));
  const counterEvidence = dims.flatMap((d) => d.evidence.filter((e) => e.direction === 'counter')).slice(0, 1);
  const cards = [...supportEvidence.slice(0, 3), ...counterEvidence].map((e, i) => ({
    card_id: `CARD-${String(i + 1).padStart(2, '0')}`,
    evidence_id: e.evidence_id,
    dim: e.dim_plain,
    title: clip(e.observation, 60),
    quote: e.quote || '',
    observation: e.observation || '',
    explanation: e.explanation || '',
    alt_explanations: e.alt_explanation || [],
    cannot_infer: e.cannot_infer || [],
    location_quality: e.location_quality || '仅线索',
    direction: e.direction,
    image_index: e.image_index,
    seconds: e.seconds,
    box: e.box,
  }));

  // ---- 一句话理由 ----
  const GAP = { D1: '能对照的公开资料', D2: '原片或拍摄记录', D3: '能对上的图片或原文', D4: '够多的评论', D5: '完整的前后文', D6: '商品名称和规格' };
  const gaps = DIM_KEYS.filter((k) => fused.dim_state_vector[k] === E.EI).map((k) => GAP[k]);
  let reason;
  if (state === 'P-01') {
    reason = top ? `${human(top)}` : '找到了能直接对照的冲突。';
  } else if (state === 'P-02') {
    const clue = top ? human(top) : '有一处需要再确认的地方。';
    reason = `${clue} 还没确认，先别急着下结论。`;
  } else if (state === 'P-03') {
    reason = '这次看过的内容里，没发现对不上的地方。';
  } else if (state === 'P-04') {
    reason = gaps.length
      ? `缺${gaps.slice(0, 2).join('、')}，暂时判断不了。`
      : '这次没有能核对的说法，暂时判断不了。';
  } else {
    reason = `${meta.failedStage || '有一项检查'}没做完，这次结果不完整。`;
  }
  reason = clip(reason, 80);

  // ---- 分步理由：证据 → 方面 → 合起来 ----
  const PLAIN_TOTAL = {
    [TOTAL.CLEAR]: '问题比较明确，先停下来核对一下',
    [TOTAL.CLUE]: '有线索，但还不能确认',
    [TOTAL.OK]: '暂时没发现对不上的地方',
    [TOTAL.THIN]: '材料不够，暂时判断不了',
    [TOTAL.FAIL]: '这次没查完，结果不完整',
  };
  const steps = [];
  if (top) {
    const fact = human(top);
    // 一句话理由里已经说过同一句时，不再重复第一步。
    if (!reason.includes(fact.slice(0, 12))) steps.push(clip(fact, 60));
  }
  const active = (d) => fused.applicability[d.dim] !== 'skip';
  const strongDims = dims.filter((d) => active(d) && [E.E2, E.E3].includes(d.state)).map((d) => DIMS[d.dim].plain);
  if (strongDims.length) steps.push(clip(`发现问题的方面：${strongDims.join('、')}。`, 60));
  const weakDims = dims.filter((d) => active(d) && d.state === E.EI).map((d) => DIMS[d.dim].plain);
  if (weakDims.length) steps.push(clip(`材料不够的方面：${weakDims.join('、')}。`, 60));
  steps.push(clip(`合起来看，${PLAIN_TOTAL[fused.total_decision] || '暂时判断不了'}。`, 60));

  // ---- 限制说明（写成人话，不写条款编号） ----
  const coveredText = coveredPlain.length === 1 ? `主要看了${coveredPlain[0]}` : `检查了 ${coveredPlain.length} 个方面`;
  const uncoveredText = !uncoveredPlain.length
    ? ''
    : uncoveredPlain.length > 3 ? '其余方面这次用不上。' : `没有看${uncoveredPlain.join('、')}。`;
  const limitations = [
    `这次看的是${scopeText}，${coveredText}。${uncoveredText}`,
  ];
  if (state === 'P-03') limitations.push('「没发现明显异常」只是说这次看过的范围里没找到对不上的地方，不代表内容一定真实，也不代表通过了认证。');
  if (state === 'P-01' || state === 'P-02') limitations.push('这个结果只说这条内容，不猜作者是不是故意，也不判断账号是谁。');
  if (fused.dim_state_vector.D2 === E.EI) limitations.push('画面有没有修过暂时不判断：缺原片或拍摄记录。');
  if (fused.dim_state_vector.D4 !== E.NA) limitations.push('评论只看读到的这一批，不代表整条帖子的所有评论。');
  if (cards.some((c) => c.location_quality === '仅线索' || c.location_quality === '无法定位')) limitations.push('有些位置只能给个大概，要精确还得对着原图看一眼。');
  limitations.push('结论只说这一条内容，不套到别的帖子上。');

  // ---- 下一步（具体、可执行，按触发维度给） ----
  const NEXT_BY_DIM = {
    D1: '发一张完整包装图，或找到原帖里的原始参数，先确认是不是同一款。',
    D2: '补一张原片或同一场景的连续画面，才能判断画面有没有改过。',
    D3: '补一张能看清标签的原图，先确认图和文案说的是不是同一件。',
    D4: '补上这些评论的发布时间和账号主页，再看一遍。',
    D5: '找到它说的测试人数和时长，或者原作者的原话。',
    D6: '补一张完整包装图，把品牌、名称和规格拍清楚。',
  };
  let next;
  if (state === 'P-01' || state === 'P-02') next = NEXT_BY_DIM[top?.dim] || '把原始出处或完整截图补充上来，再看一次。';
  else if (state === 'P-03') next = uncoveredPlain.length ? `想更稳的话，把${uncoveredPlain.slice(0, 2).join('、')}也发来看看。` : '想更稳的话，补一张原图或购买记录。';
  else if (state === 'P-04') next = gaps.length ? `补上${gaps.slice(0, 2).join('、')}，就能继续看。` : '补一段正文、一张清晰截图或原帖链接。';
  else next = '重试一次，或换一个格式的文件。';

  const a11y = `状态：${spec.family}${spec.tier !== '—' ? `，${spec.tier}` : ''}。${spec.title}。`;

  return {
    presentation_state: state,
    presentation_family: spec.family,
    state_subtitle: spec.title,
    state_reason: reason,
    confidence_tier: spec.tier,
    dimension_summary: dimensionSummary,
    evidence_cards: cards,
    limitations,
    next_action: next,
    reason_steps: steps.slice(0, 6),
    reason_detail: clip(`${reason} ${cards.slice(0, 2).map((c) => c.observation).join(' ')} ${next}`, 240),
    a11y_label: a11y,
    aggregate_state: fused.aggregate_state,
    total_decision: fused.total_decision,
    e2_subtype: fused.e2_subtype,
    rejection_reason_code: fused.rejection_reason_code,
    rule_version: meta.ruleVersion || 'authen-2.0',
    generated_at: new Date().toISOString(),
    dims: fused.dim_state_vector,
    cannot_infer: fused.cannot_infer,
    references,
  };
}

export { TOTAL };
