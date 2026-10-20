// 鉴真流水线 v2 编排入口。
// 输入识别 → 质量预检 → 资料检索 → 五个 Agent 并行取证 → 规则融合 → 呈现映射 → 合规校验。
// 模型只负责理解与解释；真假结论由 fuse.mjs 的规则算，不交给模型自由发挥。
import { lookupKnowledge } from '../knowledge.mjs';
import { runAgents } from './agents.mjs';
import { sanitizeAll } from './compliance.mjs';
import { fuse } from './fuse.mjs';
import { present } from './present.mjs';
import { createLLM } from './provider.mjs';
import { DIMS, E, TOTAL, applicability } from './standards.mjs';
import { numericConflicts } from './extract.mjs';

const CONTENT_LABEL = {
  social: '种草笔记', reviews: '评价内容', product: '商品与功效', tutorial: '美妆教程',
  image: '图片素材', video: '视频', audio: '口播', mixed: '混合内容', other: '美妆内容',
};

export function classifyContent(input) {
  const t = (input.text || '').slice(0, 4000);
  if ((input.comments || []).length || input.kind === 'comments') return 'reviews';
  if (input.kind === 'video') return 'video';
  if (input.kind === 'audio') return 'audio';
  if (input.kind === 'image' && !/我|笔记|测评|种草/.test(t)) return 'image';
  if (/(教程|步骤|怎么涂|怎么画|画法|手法|技巧)/.test(t)) return 'tutorial';
  if (/(价格|到手价|购买|下单|链接|规格|成分表|官网|专柜)/.test(t)) return 'product';
  if (/(我|用了|试了|种草|姐妹|亲测|回购|空瓶)/.test(t)) return 'social';
  return input.images?.length ? 'social' : 'other';
}

export function isAdviceQuestion(input) {
  const t = input.text || '';
  return /(怎么涂|怎么画|如何画|怎么用|搭配|适合.*吗|选哪个色|涂法|画法|技巧)/.test(t) && !/(真的|靠谱|是不是|有没有|对不上|夸大)/.test(t);
}

function localNumbers(text) {
  return numericConflicts(text).slice(0, 2).map((c) => ({
    label: c.a.quote.replace(c.a.value, '').trim().slice(0, 8) || '原文里的数字',
    value: c.a.value,
    quote: c.a.quote,
  }));
}

// 把新呈现层映射回前端现有的资料卡字段，避免重做 UI。
function toLegacy(presentation, fused, { input, contentType, label, model, scope }) {
  const flagged = presentation.presentation_state === 'P-01' || presentation.presentation_state === 'P-02';
  const supported = presentation.presentation_state === 'P-03';
  const evidence = presentation.evidence_cards.map((c) => ({
    text: c.quote || c.observation,
    finding: c.title,
    why: c.explanation,
    imageIndex: c.image_index,
    box: c.box,
    seconds: c.seconds,
    source: c.dim,
    excerpt: c.observation,
  }));
  const weak = Object.entries(fused.dim_state_vector).filter(([, s]) => s === E.EI).map(([k]) => DIMS[k].plain);
  return {
    contentType,
    verdict: flagged ? 'flagged' : supported ? 'supported' : 'unclear',
    summary: presentation.state_reason,
    next: presentation.next_action,
    evidence,
    references: presentation.references,
    numbers: localNumbers(input.text),
    answerKind: 'check',
    tips: [],
    analysisLabel: '多个角度核对过',
    provider: 'AUTHEN',
    model,
    scope: scope + ` 这次检查了${presentation.dimension_summary.filter((d) => d.applicable === '适用').map((d) => d.dim).join('、')}这几个方面。${weak.length ? `其中${weak.join('、')}材料不够。` : ''}`,
    checks: {
      content: 'completed',
      knowledge: presentation.references.length ? 'retrieved' : 'not_connected',
      imageForensics: fused.dim_state_vector.D2 === E.NA ? 'not_applicable' : 'partial',
      audioForensics: fused.dim_state_vector.D3 === E.NA ? 'not_applicable' : 'partial',
    },
    presentation,
  };
}

export async function inspect(body, { input, config, fetchImpl = fetch, signal, references: provided } = {}) {
  const started = Date.now();
  const contentType = classifyContent(input);
  const mentionsProduct = /(品牌|产品|精华|口红|唇釉|唇泥|面霜|乳液|爽肤水|防晒|粉底|遮瑕|面膜|眼霜|香水|洗发|身体乳|成分|烟酰胺|玻尿酸|视黄醇|A醇|维C|VC|SPF)/i.test(input.text || '');
  const applicabilityMap = applicability({
    kind: input.kind,
    hasImages: (input.images || []).length > 0,
    hasComments: (input.comments || []).length > 0,
    contentType,
    mentionsProduct,
    hasText: !!(input.text || '').trim(),
  });

  // 资料检索失败不影响取证，只是 D1 会落到材料不足。
  let references = provided;
  if (!references) {
    try { references = (await lookupKnowledge(input.text, { signal })).references; }
    catch { references = []; }
  }

  const llm = config ? createLLM({ key: config.key, fetchImpl, signal }) : null;
  let dims;
  try {
    dims = await runAgents(input, { references, llm });
  } catch {
    // 整条流水线失败：所有适用维度记 EF，结论走「无法判定」，不得伪装成未发现异常。
    dims = Object.keys(DIMS).map((k) => ({ dim: k, state: applicabilityMap[k] === 'skip' ? E.NA : E.EF, coverage: 'none', evidence: [], notes: '检查中断。' }));
  }

  const fused = fuse(dims, applicabilityMap);
  const failedStage = dims.some((d) => d.state === E.EF) ? '取证' : '';
  const raw = present({ fused, input, references, meta: { failedStage, ruleVersion: 'authen-2.0' } });
  const presentation = sanitizeAll(raw);

  const scope = input.scope || '';
  return {
    ...toLegacy(presentation, fused, { input, contentType, label: CONTENT_LABEL[contentType], model: llm ? llm.model : 'rules', scope }),
    presentation,
    audit: {
      modality: input.kind,
      content_type: contentType,
      dim_state_vector: fused.dim_state_vector,
      aggregate_state: fused.aggregate_state,
      e2_subtype: fused.e2_subtype,
      upgrade_eligible: fused.upgrade_eligible,
      total_decision: fused.total_decision,
      rejection_reason_code: fused.rejection_reason_code,
      merged_evidence: fused.merged_evidence,
      cannot_infer: fused.cannot_infer,
      alt_explanations: fused.alt_explanations,
      rule_version: 'authen-2.0',
      model: llm ? llm.model : null,
      provider: llm ? llm.provider : 'rules',
      elapsed_ms: Date.now() - started,
    },
  };
}

export { TOTAL };
