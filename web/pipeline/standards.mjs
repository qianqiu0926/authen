// 鉴伪标准 v2 的代码化底座。
// 依据：AUTHEN 鉴伪标准纲要 v1.4（第01–08步）。
// 铁律：不输出概率/星级/置信度；不推断动机与身份；不鉴定商品真伪；
// 局部问题不外推全篇；缺失(EI/NA/EF)不等于低风险。

// 证据状态七值。有序部分 O0<O1<O2<O3；EI/NA/EF 各自独立，不参与大小比较。
export const E = Object.freeze({
  E0: 'E0', E1: 'E1', E2: 'E2', E3: 'E3', EI: 'EI', NA: 'NA', EF: 'EF',
});

// 维度规范。official 仅内部用；plain 是唯一允许出现在用户端的主名称。
export const DIMS = Object.freeze({
  D1: { official: '核心主张的事实与证据支持度', plain: '文字依据', order: 1 },
  D2: { official: '视觉素材真实性与关键篡改', plain: '画面真实性', order: 2 },
  D3: { official: '跨模态信息一致性', plain: '图文一致性', order: 3 },
  D4: { official: '评论区异常与互动真实性线索', plain: '评论区真实性', order: 4 },
  D5: { official: '上下文完整性与误导影响', plain: '上下文完整性', order: 5 },
  D6: { official: '商品身份与商品信息一致性', plain: '商品真实性', order: 6 },
});
export const DIM_KEYS = Object.keys(DIMS);

// 维度状态的中文白话结果。用户端只显示这些，不显示 E0–EF。
export const DIM_RESULT_TEXT = Object.freeze({
  E0: '未发现异常',
  E1: '有一处需要留意',
  E2: '有多处指向同一问题',
  E3: '发现可直接对照的差异',
  EI: '材料不足，暂时判断不了',
  NA: '这次没涉及',
  EF: '这项检查没做完',
});

// 总判定五值。
export const TOTAL = Object.freeze({
  CLEAR: '有明确问题',
  CLUE: '线索级（待核验）',
  OK: '暂未发现问题',
  THIN: '资料不足',
  FAIL: '无法判定',
});

// 呈现五档：标题必须逐字使用，不得改写。
export const PRESENT = Object.freeze({
  'P-01': { title: '发现需要关注的问题', family: '风险发现', tier: '已确认' },
  'P-02': { title: '发现需要进一步核实的线索', family: '风险发现', tier: '线索（尚未确认）' },
  'P-03': { title: '在已检查范围内未发现明显异常', family: '未发现明显异常', tier: '—' },
  'P-04': { title: '材料不足，暂时无法判断', family: '证据不足', tier: '—' },
  'P-05': { title: '本次检查未能完成', family: '系统失败', tier: '—' },
});

// 总判定 → 呈现档，确定性查表（R-06-01：禁止人工指定）。
export function presentOf(total) {
  return total === TOTAL.CLEAR ? 'P-01'
    : total === TOTAL.CLUE ? 'P-02'
      : total === TOTAL.OK ? 'P-03'
        : total === TOTAL.THIN ? 'P-04' : 'P-05';
}

// 有序比较：只有 E0–E3 参与；EI/NA/EF 返回 null 表示不可比。
export function rank(state) {
  return state === E.E0 ? 0 : state === E.E1 ? 1 : state === E.E2 ? 2 : state === E.E3 ? 3 : null;
}
export function maxState(states) {
  let best = null;
  for (const s of states) { const r = rank(s); if (r === null) continue; if (best === null || r > rank(best)) best = s; }
  return best || E.EI;
}

// 内容适用矩阵。返回 { D1:'required'|'optional'|'skip' }。
// 必选=缺少即材料不足；可选=缺少只写进限制；不评分=这次不涉及。
// 原则：只有材料真的存在，才评对应维度。音频没有画面就不评画面，评论少也照样评。
export function applicability({ kind, hasImages, hasComments, contentType, mentionsProduct = false, hasText = true }) {
  const map = Object.fromEntries(DIM_KEYS.map((d) => [d, 'skip']));
  const text = hasText || String(contentType || '').length > 0;

  // 评论区：看评论本身，涉及事实说法时一并核对。
  if (kind === 'comments' && !hasImages) {
    if (hasComments) { map.D4 = 'required'; map.D5 = 'required'; map.D1 = 'optional'; }
    return map;
  }
  // 音频：没有画面，只核口播说法与上下文。
  if (kind === 'audio') {
    if (hasText) { map.D1 = 'required'; map.D5 = 'required'; }
    if (mentionsProduct) map.D6 = 'optional';
    return map;
  }
  // 视频：画面、字幕与口播都要看。
  if (kind === 'video') {
    map.D1 = 'required'; map.D3 = 'required'; map.D5 = 'required';
    map.D2 = hasImages ? 'required' : 'optional';
    if (hasComments) map.D4 = 'required';
    if (mentionsProduct) map.D6 = 'optional';
    return map;
  }
  // 图片：画面必看；有文字才评文字与一致性。
  if (kind === 'image' && !hasComments) {
    map.D2 = 'required'; map.D5 = 'required';
    if (hasText) { map.D1 = 'required'; map.D3 = 'optional'; }
    if (mentionsProduct) map.D6 = 'optional';
    return map;
  }
  // 文字/链接/图文：说法与上下文是主线，有图再加画面。
  if (text || hasComments || hasImages) {
    map.D1 = 'required'; map.D5 = 'required';
    if (hasImages) { map.D2 = 'required'; map.D3 = 'optional'; }
    if (hasComments) map.D4 = 'required';
    if (mentionsProduct) map.D6 = 'optional';
  }
  return map;
}

export const STATE_ORDER_NOTE = 'E0<E1<E2<E3；EI/NA/EF 单列，不与 E0 比较。';

// 禁用表述（用户端一律不得出现）。命中即退回重写。
export const BANNED = Object.freeze([
  '假的', '造假', '假货', '水军', '机器人', '刷单', '刷评', '买评论',
  '付费推广', '组织化协同', '故意造假', '恶意误导', '整篇皆假', '整组虚假',
  '概率', '置信度', '置信', '准确率', '风险指数', '星级', '进度条',
  'AI生成', 'AI 生成', '合成的图', '换脸', '声音克隆',
  '已证实真实', '绝对安全', '零风险', '已认证', '正品鉴定', '官方认证',
  '系统认为', '模型判定', '模型认为', '算法判定',
  '来源可信度', '特征向量', '跨模态', '证据链', '溯源',
]);

// 概率/分数类数值：结论字段里出现即不合格。
// 允许「」内逐字引用的商品数字（如笔记里的 10%），不允许结论自造比例。
export const PROBABILITY_PATTERNS = Object.freeze([
  /\d+(?:\.\d+)?\s*%/,
  /\d+(?:\.\d+)?\s*(?:分|星)\s*(?:的)?\s*(?:概率|风险|可信)/,
  /(?:概率|可能性|置信度|得分|评分)\s*[:：]?\s*\d/i,
]);

// 判断一个字符串是否含禁用表述或概率数值。
export function findViolations(text) {
  if (typeof text !== 'string' || !text) return [];
  const hits = [];
  for (const word of BANNED) if (text.includes(word)) hits.push(word);
  for (const re of PROBABILITY_PATTERNS) if (re.test(text)) hits.push(re.source);
  return [...new Set(hits)];
}

// 用户端可用措辞替换表（第06步 06 表摘要）。
export const REWRITE = Object.freeze([
  [/这是假的|造假|假货/g, '发现与对照来源存在可复核的冲突（未作真伪定性）'],
  [/水军|机器人|刷单|刷评/g, '观察到重复或时间接近的互动（未确认真实性）'],
  [/付费推广|组织化协同|买评论/g, '这组评论存在模式性重复，需结合账号历史进一步核实'],
  [/故意造假|恶意误导/g, '不单独证明发布者主观故意'],
  [/整篇|整组评论虚假|皆假/g, '本结论仅适用于已说明的范围'],
  [/AI生成|AI 生成|合成的图/g, '未获得相机原片或完整拍摄链，仅确认局部存在可对比的差异'],
  [/绝对安全|零风险|已证实真实/g, '在本次已检查范围内未发现支持异常的证据，这不等于绝对真实'],
  [/正品|官方认证/g, '在已核验的关键字段范围内与参考资料相符，不构成正品鉴定'],
]);

export function rewrite(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const [re, to] of REWRITE) out = out.replace(re, to);
  return out;
}
