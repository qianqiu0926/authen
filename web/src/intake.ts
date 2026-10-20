import type { Kind, Material } from "./types";

export function sharedLink(text: string): string | undefined {
  const found = text
    .match(/(?:https?:\/\/|www\.)[^\s<>"「」『』，。；、！？（）【】]+/i)?.[0]
    ?.replace(/[，。；、！!？?）)】\]}>]+$/g, "");
  if (!found) return;
  try {
    const url = new URL(/^www\./i.test(found) ? "https://" + found : found);
    if (["http:", "https:"].includes(url.protocol)) return url.href;
  } catch {}
}
export function platformName(url?: string) {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const [domains, name] of [
      [["xiaohongshu.com", "xhslink.com", "xhslink.cn"], "小红书"],
      [["taobao.com", "tmall.com", "tb.cn"], "淘宝 / 天猫"],
      [["jd.com", "3.cn"], "京东"],
      [["douyin.com", "iesdouyin.com"], "抖音"],
      [["youtube.com", "youtu.be"], "YouTube"],
      [["weibo.com", "weibo.cn"], "微博"],
      [["bilibili.com", "b23.tv"], "哔哩哔哩"],
      [["kuaishou.com", "gifshow.com", "chenzhongtech.com"], "快手"],
      [["yangkeduo.com", "pinduoduo.com"], "拼多多"],
      [["mp.weixin.qq.com"], "微信公众号"],
      [["zhihu.com", "zhihu.link"], "知乎"],
      [["tiktok.com"], "TikTok"],
    ] as const)
      if (domains.some((d) => host === d || host.endsWith("." + d)))
        return name;
    return host.replace(/^www\./, "");
  } catch {
    return "分享链接";
  }
}
// Sharing text is supplied by the user; it is never labelled as fetched page content.
export function sharePreview(text: string) {
  const url = sharedLink(text);
  if (!url) return;
  const platform = platformName(url);
  const product = ["淘宝 / 天猫", "京东", "拼多多"].includes(platform);
  const quoted = product ? text.match(/[「『]([^」』]{6,400})[」』]/)?.[1]?.trim() : undefined;
  const shareAuthor = platform === "抖音" ? text.match(/看看【([^】]+)的作品】/)?.[1] : undefined;
  const content = shareAuthor ? text.slice(0, text.indexOf(url)).replace(/^[\s\S]*?看看【[^】]+的作品】/, "") : text;
  let excerpt = content
    .replace(/(?:https?:\/\/|www\.)[^\s<>"「」『』，。；、！？（）【】]+/gi, " ")
    .replace(/点击链接直接打开[\s\S]*$/g, "")
    .replace(/(?:复制此链接|复制链接|打开抖音搜索|打开Dou音搜索|来【小红书】)[\s\S]*$/g, "")
    .replace(/(?:抖音|快手|淘宝|天猫|京东|拼多多|小红书)\s*[：:]?\s*(?:分享|链接)/g, "")
    .replace(/【(?:淘宝|天猫|京东|拼多多)】/g, "")
    .replace(/\b(?:tk=[A-Za-z0-9]+|MF\d{3,})\b/g, " ")
    .replace(/^\s*\d+(?:\.\d+)?\s+/, "")
    .replace(/\b[A-Za-z]+[.:/]+\s*\d{1,2}\/\d{1,2}\b/g, "")
    .replace(/\s+/g, " ").trim();
  if (excerpt.length < 10 || !/[\p{L}]{2}/u.test(excerpt) || /^(?:复制|打开|分享|点击|查看|搜索|链接|短链接|去看看|一探究竟|https|www|淘宝|天猫|抖音|快手|小红书|\s|[!！。.:：/])+$/i.test(excerpt)) return;
  return {url, platform, author:shareAuthor, title:(quoted || excerpt).slice(0,120), text:excerpt.slice(0,2000), contentType:product ? "product" : ["抖音","快手","哔哩哔哩","TikTok","YouTube"].includes(platform) ? "video" : "social"};
}
export function routeMaterial(m: Material): Material {
  if (m.sample) return m;
  const url = m.skipLink ? undefined : m.url || sharedLink(m.text);
  const kind: Kind = m.video
    ? "video"
    : m.audio
      ? "audio"
      : url
        ? "link"
        : m.images.length
          ? "image"
          : m.kind === "comments"
            ? "comments"
            : "text";
  return { ...m, kind, url };
}
export const contentLabels: Record<string, string> = {
  social: "种草笔记",
  reviews: "商品 / 社区评价",
  product: "商品与功效宣传",
  tutorial: "美妆教程",
  image: "图片素材",
  video: "视频内容",
  audio: "口播内容",
  mixed: "图文一起看",
  other: "美妆内容",
};
export const contentFocus: Record<string, string> = {
  social: "看体验有没有被说成人人有效",
  reviews: "看重复话术、体验细节和前后说法",
  product: "看功效承诺、数字和使用条件",
  tutorial: "看步骤与效果，分清技巧和宣传",
  image: "看画面、包装文字和配文是否对得上",
  video: "对照抽查画面、字幕和已读到的口播",
  audio: "看口播里的数字与功效承诺",
  mixed: "对照文字、配图和其中的说法",
  other: "看说法、数字和参考资料",
};

export class LinkReadError extends Error {
  code: string;
  url: string;
  constructor(message: string, code: string, url: string) {
    super(message); this.name = "LinkReadError"; this.code = code; this.url = url;
  }
}

export async function readSharedPage(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetcher("/authen/api/page", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url}),signal});
  } catch (e) {
    if (signal.aborted) throw e;
    throw new LinkReadError("网络没连上，稍后重试，或补上正文和截图。", "NETWORK_ERROR", url);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new LinkReadError("链接读取暂时没完成，稍后重试，或补张截图。", "READ_FAILED", url); }
  if (!response.ok) throw new LinkReadError(data.error || "链接暂时读不到，补上正文或截图吧。", data.code || "READ_FAILED", url);
  if (typeof data.text !== "string" || !data.coverage || !Array.isArray(data.images) || !Array.isArray(data.limitations))
    throw new LinkReadError("这页内容没读完整，补上正文或截图吧。", "INCOMPLETE_PAGE", url);
  return data;
}
