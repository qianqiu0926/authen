// 证据融合与总判定。全部是规则，不调用模型。
// 对应鉴伪标准第05步 A1–A10：去重、聚合、E2 细分、升级门槛、冲突消解、五值映射、拒判登记。
import { DIM_KEYS, E, TOTAL, maxState } from './standards.mjs';

const norm = (s) => (typeof s === 'string' ? s.replace(/[\s，。！？、,.!?“”"'「」《》()（）]/g, '').slice(0, 90) : '');

// A2/A3：同一句话只计一次；同源线索不重复累加为独立证据。
function dedupe(dims) {
  const seen = new Set();
  let merged = 0;
  const out = dims.map((d) => {
    const evidence = d.evidence.filter((e) => {
      const key = `${e.dim}|${norm(e.quote) || e.observation?.slice(0, 40)}`;
      if (!norm(e.quote) && !e.observation) return false;
      if (seen.has(key)) { merged += 1; return false; }
      seen.add(key);
      return true;
    });
    return { ...d, evidence };
  });
  return { dims: out, merged };
}

// A5：E2 到底是「可指认的具体冲突」还是「发布行为模式」。
// 能指到一句话、一个数字、一个时间点、一处位置的，算确证型；
// 只有风格、模板、行为习惯这类没有落点的，算模式型。
const CONFIRMED_KINDS = new Set(['conflict', 'number', 'timeline', 'authority', 'medical', 'absolute', 'copy_move']);
function e2Subtype(dims) {
  const e2 = dims.flatMap((d) => d.evidence.filter((e) => e.direction === 'support' && e.strength === E.E2));
  if (!e2.length) return '—';
  const confirmed = e2.some((e) => CONFIRMED_KINDS.has(e.kind) || (Array.isArray(e.box) && e.box.length === 4));
  return confirmed ? 'E2-确证型' : 'E2-模式型';
}

export function fuse(dims, applicability) {
  const { dims: deduped, merged } = dedupe(dims);
  const byDim = Object.fromEntries(deduped.map((d) => [d.dim, d]));

  // A1：适用但没产出的维度记 EF，而不是当作 E0。
  const dimState = {};
  for (const key of DIM_KEYS) {
    const appl = applicability[key];
    const d = byDim[key];
    dimState[key] = appl === 'skip' ? E.NA : d?.state || E.EF;
  }
  const covered = DIM_KEYS.filter((k) => applicability[k] !== 'skip');
  const considered = covered.map((k) => dimState[k]);
  const aggregate = maxState(considered.filter((s) => [E.E0, E.E1, E.E2, E.E3].includes(s)));
  // 只有「必选维度」材料不足才否决；可选维度没材料只写进限制，不阻断结论。
  const blocking = covered.filter((k) => applicability[k] === 'required' && dimState[k] === E.EI);
  const failed = covered.filter((k) => applicability[k] !== 'skip' && dimState[k] === E.EF);
  const subtype = aggregate === E.E2 ? e2Subtype(deduped) : '—';
  const upgrade = aggregate === E.E2 ? false : false;

  // A7：冲突消解优先级 D1 > D2/D3 > D4（由聚合最大值与 subtype 共同体现）。
  let total;
  if (aggregate === E.E3) total = TOTAL.CLEAR;
  else if (aggregate === E.E2 && subtype === 'E2-确证型') total = TOTAL.CLEAR;
  else if (aggregate === E.E2) total = TOTAL.CLUE;
  else if (aggregate === E.E1) total = TOTAL.CLUE;
  else if (aggregate === E.E0) total = blocking.length ? TOTAL.THIN : TOTAL.OK;
  else total = failed.length ? TOTAL.FAIL : TOTAL.THIN;

  // 有明确问题时，若关键维度也只是材料不足，仍需在限制里说清。
  const evidenceIds = deduped.flatMap((d) => d.evidence.filter((e) => e.direction === 'support').map((e) => e.evidence_id));

  // A10 拒判登记。
  let rejection;
  if (total === TOTAL.THIN) rejection = blocking.length ? 'J-01' : 'J-02';
  else if (total === TOTAL.FAIL) rejection = 'J-04';
  else rejection = '—';

  const altExplanations = [...new Set(deduped.flatMap((d) => d.evidence.flatMap((e) => e.alt_explanation || [])))].slice(0, 8);
  const cannotInfer = [...new Set(deduped.flatMap((d) => d.evidence.flatMap((e) => e.cannot_infer || [])))];

  return {
    dim_state_vector: dimState,
    covered_dims: covered,
    applicability,
    aggregate_state: aggregate,
    e2_subtype: subtype,
    upgrade_eligible: upgrade,
    total_decision: total,
    rejection_reason_code: rejection,
    evidence_ids: [...new Set(evidenceIds)],
    alt_explanations: altExplanations,
    cannot_infer: cannotInfer,
    merged_evidence: merged,
    dims: deduped,
  };
}
