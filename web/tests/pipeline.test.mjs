import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from '../pipeline/index.mjs';
import { fuse } from '../pipeline/fuse.mjs';
import { sanitizeAll, scan } from '../pipeline/compliance.mjs';
import { applicability, E, TOTAL } from '../pipeline/standards.mjs';

const base = (over = {}) => ({ kind: 'text', text: '', lines: [], images: [], comments: [], ...over });

test('图文数字对不上：给出可对照的冲突和位置，结论为有明确问题', async () => {
  const input = base({
    text: '笔记里写烟酰胺10%，我看了瓶身写的是2%。',
    lines: [{ text: '烟酰胺 2%', imageIndex: 0, box: [0.1, 0.2, 0.3, 0.08] }],
    images: ['x'],
  });
  const r = await inspect({}, { input, config: null });
  assert.equal(r.presentation.presentation_state, 'P-01');
  assert.equal(r.presentation.confidence_tier, '已确认');
  assert.match(r.presentation.state_reason, /2%/);
  assert.match(r.presentation.state_reason, /10%/);
  const card = r.presentation.evidence_cards.find((c) => c.dim === '图文一致性');
  assert.ok(card, '应有图文一致性的证据卡');
  assert.deepEqual(card.box, [0.1, 0.2, 0.3, 0.08]);
  assert.equal(r.audit.dim_state_vector.D3, E.E3);
});

test('只有绝对化承诺：只能到线索级，不能说到手就假', async () => {
  const input = base({ text: '这款面霜三天永久白两度，敏感肌都能用。' });
  const r = await inspect({}, { input, config: null });
  assert.equal(r.presentation.presentation_state, 'P-02');
  assert.equal(r.presentation.confidence_tier, '线索（尚未确认）');
  assert.doesNotMatch(r.presentation.state_reason, /假的|造假|水军|概率|置信/);
});

test('评论完全重复：给材料不足，不升级为线索，也不说水军', async () => {
  const input = base({
    kind: 'comments',
    text: '评价1：好\n',
    comments: Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, text: '保湿不黏，很好用，已经回购三次了。', author: '用户' + i, authorKey: 'u' + i })),
  });
  const r = await inspect({}, { input, config: null });
  assert.equal(r.presentation.presentation_state, 'P-04');
  assert.equal(r.audit.total_decision, TOTAL.THIN);
  const all = JSON.stringify(r.presentation);
  assert.doesNotMatch(all, /水军|刷单|机器人|概率|置信度/);
  assert.equal(r.audit.dim_state_vector.D4, E.EI);
});

test('评论样本少但自然：可以给暂未发现，不硬判材料不足', async () => {
  const input = base({
    kind: 'comments',
    text: '评价1：好\n评价2：不错',
    comments: [{ id: 'a', text: '好', author: '甲', authorKey: 'a' }, { id: 'b', text: '不错', author: '乙', authorKey: 'b' }],
  });
  const r = await inspect({}, { input, config: null });
  assert.equal(r.presentation.presentation_state, 'P-03');
  assert.match(r.presentation.state_subtitle, /未发现|没发现|暂未/);
});

test('只有一张图、没有原片：如实说看不出是否修过', async () => {
  const input = base({ kind: 'image', text: '', images: ['x'] });
  const r = await inspect({}, { input, config: null });
  assert.equal(r.presentation.presentation_state, 'P-04');
  assert.equal(r.audit.dim_state_vector.D2, E.EI);
  const d2 = r.presentation.dimension_summary.find((d) => d.dim === '画面真实性');
  assert.match(d2.result, /缺原片/);
});

test('资料明确否定：升级为可直接对照的冲突', async () => {
  const input = base({ text: '这瓶精华能替代防晒，白天不用涂防晒。' });
  const fetchImpl = async () => ({
    ok: true,
    body: { cancel: async () => {} },
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ judgements: [{ quote: '这瓶精华能替代防晒', support: '否定', ref_quote: '防晒需要每两小时补涂，修护产品不能替代防晒。', note: '资料明确说不能替代。' }] }) } }],
    }),
  });
  const r = await inspect({}, { input, config: { key: 'k' }, fetchImpl });
  assert.equal(r.audit.dim_state_vector.D1, E.E3);
  assert.equal(r.presentation.presentation_state, 'P-01');
});

test('资料没写不等于编造：沉默只能落到材料不足或线索', async () => {
  const input = base({ text: '这瓶精华用了两周，脸摸起来更滑了。' });
  const fetchImpl = async () => ({
    ok: true,
    body: { cancel: async () => {} },
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ judgements: [{ quote: '这瓶精华用了两周，脸摸起来更滑了。', support: '沉默', ref_quote: '', note: '资料没提。' }] }) } }],
    }),
  });
  const r = await inspect({}, { input, config: { key: 'k' }, fetchImpl });
  assert.notEqual(r.audit.dim_state_vector.D1, E.E3);
});

test('合规校验：禁用词与概率数值会被改写', () => {
  const out = sanitizeAll({
    presentation_state: 'P-01',
    state_reason: '这有 87% 概率是水军刷单，是假的。',
    reason_detail: 'AI生成的图片，置信度 0.9。',
    next_action: '不用管。',
    reason_steps: ['模型判定为假货'],
    limitations: [],
  });
  assert.ok(out.compliance_log.length > 0);
  for (const f of ['state_reason', 'reason_detail']) assert.doesNotMatch(out[f], /水军|刷单|假的|概率|置信度/);
});

test('引用里的商品数字不算概率数值', () => {
  assert.deepEqual(scan('正文写「10%」，图上标「2%」。'), []);
});

test('适用矩阵：评论区只查 D4，纯文字不查画面', () => {
  const c = applicability({ kind: 'comments', hasImages: false, hasComments: true });
  assert.equal(c.D4, 'required');
  assert.equal(c.D2, 'skip');
  const t = applicability({ kind: 'text', hasImages: false, hasComments: false });
  assert.equal(t.D1, 'required');
  assert.equal(t.D2, 'skip');
  const v = applicability({ kind: 'video', hasImages: true, hasComments: false });
  assert.equal(v.D2, 'required');
  assert.equal(v.D3, 'required');
});

test('融合：E2 模式型只能到线索级，不因条数多升级', () => {
  const dims = [
    { dim: 'D1', state: E.NA, evidence: [] },
    { dim: 'D2', state: E.NA, evidence: [] },
    { dim: 'D3', state: E.NA, evidence: [] },
    { dim: 'D4', state: E.E2, evidence: [{ dim: 'D4', direction: 'support', strength: E.E2, quote: 'a', alt_explanation: ['活动统一话术'] }] },
    { dim: 'D5', state: E.NA, evidence: [] },
    { dim: 'D6', state: E.NA, evidence: [] },
  ];
  const appl = { D1: 'skip', D2: 'skip', D3: 'skip', D4: 'required', D5: 'skip', D6: 'skip' };
  const f = fuse(dims, appl);
  assert.equal(f.e2_subtype, 'E2-模式型');
  assert.equal(f.upgrade_eligible, false);
  assert.equal(f.total_decision, TOTAL.CLUE);
});

/* ---------- 图像取证映射 ---------- */
import { forensicFindings } from '../pipeline/agents.mjs';

const fxBase = (over = {}) => ({
  ok: true, photo_like: true, provenance: false,
  detectors: {
    ela: { level: 'none' }, spectral: { level: 'none' }, noise: { level: 'none' },
    npr: { level: 'none' }, metadata: { level: 'none' }, ufd: { level: 'none' },
    copy_move: { level: 'none', pairs: [] },
    ...over,
  },
});

test('复制粘贴强信号：给出两处位置和图片框，只到 E2', () => {
  const r = fxBase({
    copy_move: {
      level: 'strong',
      pairs: [{ a: [0.57, 0.27, 0.19, 0.08], b: [0.10, 0.71, 0.19, 0.08], shift: [-0.47, 0.44], inliers: 58 }],
    },
  });
  const out = forensicFindings(r, 0);
  assert.equal(out.length, 1);
  assert.equal(out[0].strength, E.E2);
  assert.deepEqual(out[0].fields.box, [0.57, 0.27, 0.19, 0.08]);
  assert.match(out[0].fields.observation, /两块内容高度吻合/);
  assert.match(out[0].fields.observation, /右上角|右侧|正中间/);
});

test('复制粘贴中等信号：降到 E1，不直接说改过', () => {
  const r = fxBase({ copy_move: { level: 'medium', pairs: [{ a: [0.1, 0.1, 0.2, 0.2], b: [0.6, 0.6, 0.2, 0.2] }] } });
  const out = forensicFindings(r, 0);
  assert.equal(out[0].strength, E.E1);
});

test('只有一个软信号：仍是 E1，且说明可能只是压缩', () => {
  const r = fxBase({ ela: { level: 'medium' } });
  const out = forensicFindings(r, 0);
  assert.equal(out[0].strength, E.E1);
  assert.match(out[0].fields.observation, /局部压缩差异/);
  assert.ok(out[0].fields.alt_explanation.some((x) => /压缩/.test(x)));
});

test('编辑软件记录与来源记录都被记录，来源记录是反向证据', () => {
  const r = fxBase({ metadata: { level: 'weak', software: 'Adobe Photoshop 25.0' } });
  r.provenance = true;
  const out = forensicFindings(r, 0);
  assert.ok(out.some((f) => /Photoshop/.test(f.fields.observation)));
  const counter = out.find((f) => f.fields.direction === 'counter');
  assert.ok(counter);
  assert.equal(counter.strength, E.E0);
});

test('取证不可用时不产出任何结论，交给上层记材料不足', () => {
  assert.deepEqual(forensicFindings({ ok: false }, 0), []);
});
