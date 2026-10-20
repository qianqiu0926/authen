// 首页与浮窗共用的场景定义。六个入口对应赛题三大场景与数据包的 140 条样本。
// 文案全部用消费者能看懂的话，不出现内部编码。
export type ScenarioId = 'post' | 'expert' | 'comments' | 'image' | 'video' | 'product';

export interface Scenario {
  id: ScenarioId;
  /** 按钮上的名字 */
  name: string;
  /** 一句话说明，菜单里用 */
  short: string;
  /** 进入输入页后的提示 */
  hint: string;
  /** 输入页大标题 */
  title: string;
  /** 输入页副标题 */
  sub: string;
  /** 图标文件名（不含前缀） */
  icon: string;
  /** 归类，对应赛题三大场景 + 商品信息 */
  group: string;
  /** 能接受的文件类型 */
  accept: string;
  /** 输入框占位 */
  placeholder: string;
  /** 预选的重点 */
  focus?: string;
  /** “想重点看看”这一排可选项 */
  asks: string[];
  /** 是否需要音视频 */
  needsMedia?: boolean;
  /** 提交按钮文案 */
  cta: string;
  /** 可一键填入的示例，全部为教学用虚构内容 */
  example?: { label: string; text: string };
}

export const scenarios: Scenario[] = [
  {
    id: 'post',
    name: '种草帖',
    short: '正文、功效、数字',
    hint: '整段复制正文就行，不用截图。',
    title: '这份心动，值得相信吗？',
    sub: '文案里的功效、数字和承诺，一条条对着看',
    icon: 'notebook',
    group: '文案与背书',
    accept: 'image/*,video/*,audio/*',
    placeholder: '把笔记正文粘在这里…\n有链接也可以直接贴。',
    focus: '功效靠谱吗？',
    asks: ['功效靠谱吗？', '数字对得上吗？', '像广告吗？'],
    cta: '看看这份种草',
    example: {
      label: '三天变白，真有这么快？',
      text: '岑予美白精华，三天白两度，敏感肌也能放心用，专家推荐，绝对安全。',
    },
  },
  {
    id: 'expert',
    name: '专家背书',
    short: '谁说的、有没有原话',
    hint: '把推荐原话、视频简介或链接粘进来。',
    title: '这句话，真是他说的吗？',
    sub: '核对是谁、在哪说的、有没有被剪过',
    icon: 'social',
    group: '文案与背书',
    accept: 'image/*,video/*,audio/*',
    placeholder: '把专家推荐的原话、视频简介或链接粘在这里…',
    focus: '真是本人说的吗？',
    asks: ['真是本人说的吗？', '有没有原话？', '产品对得上吗？'],
    cta: '核对这段背书',
    example: {
      label: '专家推荐某款美白霜',
      text: '一位皮肤科专家在视频里推荐岑予美白霜，说用两周就能白一个色号，敏感肌也能用。',
    },
  },
  {
    id: 'comments',
    name: '评论区',
    short: '一组评论、刷评、追评',
    hint: '把整段评论粘进来，一行一条，比截图快。',
    title: '这些好评，是真的吗？',
    sub: '看有没有成套话术、追评对不上时间',
    icon: 'social',
    group: '评论区',
    accept: 'image/*,video/*,audio/*',
    placeholder: '把评论整段粘进来，一行一条…\n截图也可以。',
    focus: '像刷的吗？',
    asks: ['像刷的吗？', '追评对得上吗？', '有没有用过的细节？'],
    cta: '看看这些评论',
    example: {
      label: '一排很像的好评',
      text: '保湿不黏，很好用，已经回购三次了。\n保湿不黏，很好用，已经回购三次了。\n保湿不黏，很好用，已经回购三次了。\n保湿不黏，很好用，已经回购三次了。',
    },
  },
  {
    id: 'image',
    name: '图片鉴真',
    short: '修图、前后对比、AI图',
    hint: '发一张图，有原图对照会更准。',
    title: '这张图，修过吗？',
    sub: '看局部改动、重复粘贴、来源记录',
    icon: 'image',
    group: '视觉素材',
    accept: 'image/*',
    placeholder: '想补充说明可以写在这里，不填也行…',
    asks: ['修过吗？', '前后对比可信吗？', '是AI图吗？'],
    needsMedia: true,
    cta: '看看这张图',
  },
  {
    id: 'video',
    name: '视频 / 口播',
    short: '字幕、口播、拼接',
    hint: '贴视频链接，或上传一段，别只发截图。',
    title: '口播和字幕，对得上吗？',
    sub: '听完整原话，找被剪掉的否定词',
    icon: 'video',
    group: '视觉素材',
    accept: 'video/*,audio/*',
    placeholder: '贴视频链接，或写下你想核对的那句话…',
    asks: ['口播被剪过吗？', '字幕对得上吗？', '声音像本人吗？'],
    needsMedia: true,
    cta: '看看这段视频',
  },
  {
    id: 'product',
    name: '产品信息',
    short: '品牌、规格、版本',
    hint: '贴商品页链接，或写下包装上的信息。',
    title: '这瓶，和官网写的一样吗？',
    sub: '核对品牌、名称、规格和版本',
    icon: 'box',
    group: '商品信息',
    accept: 'image/*',
    placeholder: '贴商品链接，或写下品牌、名称、规格…',
    asks: ['版本对吗？', '规格对得上吗？', '成分写错了吗？'],
    cta: '核对商品信息',
    example: {
      label: '笔记和瓶身信息对不上',
      text: '笔记里写岑予烟酰胺精华是 10%，我手上的瓶身标的是 2%，两个数字对不上。',
    },
  },
];

export const scenarioMap: Record<ScenarioId, Scenario> = Object.fromEntries(
  scenarios.map((s) => [s.id, s]),
) as Record<ScenarioId, Scenario>;

export function scenarioOf(id?: string | null): Scenario | null {
  return id && id in scenarioMap ? scenarioMap[id as ScenarioId] : null;
}
