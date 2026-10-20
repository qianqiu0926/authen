import { load } from "cheerio";
import JSON5 from "json5";
import { platformContent } from "./share-platforms.mjs";
import { analyzeComments } from "./comment-signals.mjs";

const clean = (v) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const name = (v) => clean(typeof v === "object" ? v?.name || v?.nickname || v?.nickName : v);
const hostIs = (host, domain) => host === domain || host.endsWith("." + domain);
export function platform(url) {
  const h = new URL(url).hostname;
  for (const [domains, label] of [
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
  ])
    if (domains.some((d) => hostIs(h, d))) return label;
  return h.replace(/^www\./, "");
}

export class PageReadError extends Error {
  constructor(code, message) { super(message); this.name = "PageReadError"; this.code = code; }
}
// Parse only JSON data embedded by the page; never evaluate page JavaScript.
function initialData(script, variable = "__INITIAL_STATE__") {
  const start = script.search(new RegExp("(?:window\\.)?" + variable + "\\s*="));
  if (start < 0) return;
  const offset = script.indexOf("{", start);
  if (offset < 0) return;
  let depth = 0,
    quote = "",
    escape = false;
  for (let i = offset; i < script.length; i++) {
    const c = script[i];
    if (quote) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}" && !--depth) {
      try {
        return JSON5.parse(
          script
            .slice(offset, i + 1)
            .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\bundefined\b/g, (v) => v === "undefined" ? "null" : v),
        );
      } catch {
        return;
      }
    }
  }
}
export function extractPage(html, url) {
  const $ = load(html),
    site = platform(url),
    meta = (key) =>
      $(`meta[property="${key}"],meta[name="${key}"]`)
        .first()
        .attr("content") || "";
  let title = clean(meta("og:title") || $("title").text()),
    author = clean(meta("author") || meta("article:author")) || null,
    body = "",
    contentType = "other";
  const reviews = [],
    images = [];
  const scripts = $("script:not([src])").map((_, el) => $(el).text()).get();
  const config = scripts.map(s => initialData(s, "_config_")).find(Boolean);
  if (config?.action === "login" || /(^|\.)(?:login|passport|signin)\./i.test(new URL(url).hostname) || /\/(?:login|signin)(?:[./]|$)/i.test(new URL(url).pathname))
    throw new PageReadError("LOGIN_REQUIRED", `${site}这页需要登录，商品详情或原帖还没读到。可以先看分享文案，或补张截图。`);
  let product = false,
    structured = false,
    primary = false,
    metadataOnly = false,
    reviewChars = 0,
    reviewsLimited = false;
  const reviewKeys = new Set();
  const addImage = (v) => {
    for (const item of list(v)) {
      const raw =
        typeof item === "string" ? item : item?.url || item?.contentUrl;
      if (
        !raw ||
        /(?:favicon|default-social-image|logo|sprite|tracking-pixel)/i.test(raw)
      )
        continue;
      try {
        const parsed = new URL(raw, url);
        if (!["https:", "http:"].includes(parsed.protocol)) continue;
        const duplicate = images.findIndex((i) => {
          const old = new URL(i);
          return old.origin + old.pathname === parsed.origin + parsed.pathname;
        });
        if (duplicate < 0) images.push(parsed.href);
        else if (
          Number(parsed.searchParams.get("w")) >
          Number(new URL(images[duplicate]).searchParams.get("w"))
        )
          images[duplicate] = parsed.href;
      } catch {}
    }
  };
  const addReview = (text, who = "", extra = {}) => {
    text = clean(text).slice(0, 800);
    const author = name(who).slice(0, 60);
    if (!text) return;
    const id = extra.id == null ? undefined : String(extra.id).slice(0,120);
    const authorKey = clean(extra.authorKey).slice(0,120);
    const keys = [id?`id:${id}`:null,(authorKey || author)?`text:${authorKey || author}:${text}`:null].filter(Boolean);
    if(keys.some(key=>reviewKeys.has(key)))return;
    if(reviews.length>=60||reviewChars+text.length+author.length+20>6000){reviewsLimited=true;return;}
    for(const key of keys)reviewKeys.add(key);
    reviews.push({ text, author, ...(id?{id}:{}), ...(authorKey?{authorKey}:{}), ...(extra.isAuthor?{isAuthor:true}:{}), ...(extra.isReply?{isReply:true}:{}) });
    reviewChars += text.length + author.length + 20;
  };
  const schemas = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const walk = (value, depth = 0) => {
        if (
          !value ||
          typeof value !== "object" ||
          depth > 7 ||
          schemas.length > 200
        )
          return;
        for (const node of list(value)) {
          if (node["@type"]) schemas.push(node);
          for (const key of ["@graph", "mainEntity", "itemListElement", "item"])
            walk(node[key], depth + 1);
        }
      };
      walk(data);
    } catch {}
  });
  for (const node of schemas) {
    const types = list(node["@type"]);
    if (
      types.some((t) =>
        [
          "Article",
          "NewsArticle",
          "BlogPosting",
          "SocialMediaPosting",
          "Product",
          "Review",
          "VideoObject",
        ].includes(t),
      )
    ) {
      if (types.includes("Review")) {
        addReview(node.reviewBody || node.description, node.author, {id:node['@id']});
        continue;
      }
      if (primary) continue;
      primary = true;
      structured = true;
      product = types.includes("Product");
      contentType = product
        ? "product"
        : types.includes("VideoObject")
          ? "video"
          : "social";
      title = clean(node.headline || node.name) || title;
      author = name(node.author) || author;
      body = clean(node.articleBody || node.text || node.description);
      addImage(node.image || node.thumbnailUrl);
      for (const r of list(node.review))
        addReview(r.reviewBody || r.description, r.author, {id:r['@id']});
    }
  }
  const specific = platformContent($, url, initialData);
  if (specific) {
    structured = primary = true;
    title = clean(specific.title) || title;
    body = clean(specific.body);
    author = name(specific.author) || author;
    contentType = specific.contentType;
    metadataOnly = !!specific.excerptOnly;
    addImage(specific.imageURLs);
    for (const r of specific.reviews) addReview(r.text, r.author, r);
  }
  if (site === "小红书") {
    const requestedId = new URL(url).pathname.match(/\/(?:explore|discovery\/item)\/([^/?]+)/)?.[1];
    let found = false;
    $("script").each((_, el) => {
      if (found) return;
      const data = initialData($(el).text()), setup = initialData($(el).text(), "__SETUP_SERVER_STATE__");
      const map = data?.note?.noteDetailMap;
      const desktop = map && (map[requestedId] || (!requestedId && Object.keys(map).length === 1 ? Object.values(map)[0] : null));
      const containers = [
        desktop && {note: desktop.note, comments: desktop.comments?.list || desktop.comments?.comments},
        data?.noteData?.data && {note: data.noteData.data.noteData, comments: data.noteData.data.commentData?.comments},
        setup?.LAUNCHER_SSR_STORE_PAGE_DATA && {note: setup.LAUNCHER_SSR_STORE_PAGE_DATA.noteData, comments: setup.LAUNCHER_SSR_STORE_PAGE_DATA.commentData?.comments},
      ];
      for (const container of containers) {
        const note = container?.note;
        if (!note || typeof note !== "object" || !clean(note.desc)) continue;
        if (requestedId && note.noteId && note.noteId !== requestedId) continue;
        found = structured = primary = true;
        title = clean(note.title) || title;
        body = clean(note.desc).replace(/\[话题\]/g, "");
        author = name(note.user) || author;
        contentType = note.type === "video" ? "video" : "social";
        for (const im of list(note.imageList || note.imagesList))
          addImage(im.urlDefault || im.urlPre || im.url || im.infoList?.find((i) => i.imageScene === "WB_DFT")?.url);
        const seen = new Set();
        const comments = (items, depth = 0) => {
          if (depth > 1) return;
          for (const c of list(items)) {
            if (!c || (c.noteId && requestedId && c.noteId !== requestedId)) continue;
            // IDs deduplicate mirrored data; identical wording by different people remains.
            if (c.id && seen.has(c.id)) continue;
            if (c.id) seen.add(c.id);
            const user = c.userInfo || c.user || {};
            const userId = user.userId || user.user_id || user.id;
            const noteUserId = note.user?.userId || note.user?.user_id || note.user?.id;
            addReview(c.content, user, {id:c.id || c.commentId, authorKey:userId ? String(userId) : '', isAuthor:c.isAuthor===true || (!!userId&&!!noteUserId&&String(userId)===String(noteUserId)),isReply:depth>0});
            comments(c.subComments || c.sub_comments, depth + 1);
          }
        };
        comments(container.comments);
        break;
      }
    });
    if (!found && /\/(?:login|signin)(?:\/|$)/i.test(new URL(url).pathname))
      throw new PageReadError("LOGIN_REQUIRED", "小红书这页需要登录，补上正文或截图就能继续。");
  }
  // Read comments only from explicit review containers, never from counters or recommendations.
  $(
    '[itemprop="review"], [data-testid="review-card"], .review-item, .comment-item',
  )
    .slice(0, 100)
    .each((_, el) => {
      const root = $(el),
        text = root
          .find(
            '[itemprop="reviewBody"],.review-content,.comment-content,.content',
          )
          .first()
          .text();
      addReview(
        text,
        root.find('[itemprop="author"],.author,.nickname').first().text(),
        {id:root.attr('data-comment-id') || root.attr('data-review-id')},
      );
    });
  const description = clean(meta("og:description") || meta("description"));
  const wall =
    /安全验证|访问验证|访问受限|滑块验证|请完成验证|验证码|access denied|captcha|just a moment/i;
  const visibleBody = $("body").clone();
  visibleBody.find("script,style,noscript").remove();
  const rawBody = clean(visibleBody.text());
  if (!structured && !body && site === "抖音" && /抱歉出错了|内容不存在|视频已删除|作品已删除|暂时无法观看/.test(rawBody))
    throw new PageReadError("CONTENT_UNAVAILABLE", "抖音没有返回这条作品的内容，可以先看分享文案，或上传视频、截图。");
  if (!structured && !body && rawBody.length < 120 && scripts.some(s => /_\$jsvmprt|acrawler|ac_nonce/.test(s)))
    throw new PageReadError("VERIFICATION_REQUIRED", "平台这次要求验证，原帖还没读到。可以先看分享文案，或补截图、视频。");
  if (
    !body &&
    (wall.test(title) ||
      (!structured && rawBody.length < 1200 && wall.test(rawBody)))
  )
    throw new PageReadError("VERIFICATION_REQUIRED", "这个页面需要验证，粘贴原文或补张截图就能继续。");
  if (!body) {
    $(
      'script,style,noscript,nav,footer,header,aside,form,[hidden],[aria-hidden="true"],[itemprop="review"],.review-item,.comment-item',
    ).remove();
    const selector = [
      "#detail-desc",
      ".note-content",
      '[itemprop="articleBody"]',
      "article",
      "main",
    ].find((s) => $(s).length);
    const container = selector ? $(selector).first() : $("body");
    container.find("p,div,li,h1,h2,h3,br").append("\n");
    const visible = container
      .text()
      .split("\n")
      .map(clean)
      .filter(Boolean)
      .join("\n");
    const hasBody = visible.length > 40 || (!!selector && visible.length >= 25);
    body = hasBody ? visible : description;
    metadataOnly = !hasBody && !!description;
    if (
      !selector &&
      ["小红书", "淘宝 / 天猫", "京东", "抖音", "微博", "YouTube", "哔哩哔哩", "快手", "拼多多", "TikTok"].includes(
        site,
      )
    ) {
      body = description;
      metadataOnly = true;
    }
  }
  if (!structured && ["淘宝 / 天猫", "抖音", "快手", "拼多多", "哔哩哔哩"].includes(site) &&
      (/^(?:商品详情页|淘宝网|天猫|抖音|快手|拼多多|哔哩哔哩)$/.test(title) || /天貓淘寶海外|花更少.*買到寶|记录美好生活|记录世界记录你|多实惠.*多乐趣/.test(title)))
    throw new PageReadError("APP_REQUIRED", `${site}这次只返回了打开 App 的页面，没读到具体内容。可以先看分享文案，或补截图。`);
  if (
    !structured &&
    /^(?:-\s*)?YouTube$/i.test(title) &&
    /Enjoy the videos and music|在 YouTube 上尽享/.test(body)
  )
    throw Error(
      "这次只读到平台介绍，没有读到这条视频的内容，补上字幕或截图吧。",
    );
  if (
    !structured &&
    site === "小红书" &&
    /标记我的生活|你的生活指南|你的生活兴趣社区/.test(title) &&
    !reviews.length
  )
    throw Error("这次只读到平台首页，没有读到笔记，补上正文或截图吧。");
  if (!images.length) addImage(meta("og:image"));
  const headline = clean($("h1").first().text()).toLowerCase();
  $(
    'article img,[itemprop="image"],.note-content img,.product-gallery img,.product-image img,main img',
  ).each((_, el) => {
    const image = $(el),
      alt = clean(image.attr("alt")).toLowerCase();
    if (/logo|icon|avatar|navigation|banner|二维码|头像/.test(alt)) return;
    const specific =
      image.closest("article,.note-content,.product-gallery,.product-image")
        .length || image.attr("itemprop") === "image";
    if (
      !specific &&
      (!headline || headline.length < 5 || !alt.includes(headline))
    )
      return;
    addImage(
      image.attr("data-src") ||
        image.attr("data-original") ||
        image.attr("src"),
    );
    const srcset =
      image.attr("data-srcset") ||
      image.attr("srcset") ||
      image.closest("picture").find("source").first().attr("srcset");
    if (srcset) addImage(srcset.split(",")[0].trim().split(/\s+/)[0]);
    try {
      const vue = image.attr("v-srcset") || image.parent().attr("v-srcset");
      if (vue) {
        const options = JSON5.parse(vue);
        const sizes = Object.keys(options).sort(
          (a, b) => Number(b) - Number(a),
        );
        addImage(options[sizes[0]]);
      }
    } catch {}
  });
  if (author && /^https?:\/\//.test(author)) author = null;
  if (!body && reviews.length === 0)
    throw Error("这页没读到正文或评价，粘贴文字或补张截图吧。");
  if (body.length < 25 && reviews.length === 0 && !(structured && body.length > 0))
    throw Error("这页只读到标题，粘贴原文或补张截图吧。");
  if (
    /登录后查看|登录后浏览|请先登录|登录即可查看/.test(body) &&
    body.length < 180
  )
    throw new PageReadError("LOGIN_REQUIRED", "这页需要登录，粘贴原文或补张截图吧。");
  if (reviews.length && !body) contentType = "reviews";
  const limits = [];
  if (metadataOnly)
    limits.push("这次只读到页面公开的标题与简介，不是全文；可以补上正文截图。");
  if (!reviews.length) limits.push("没有读到评论区，想查评价可以补评论截图。");
  else
    limits.push(
      `只读到页面公开提供的 ${reviews.length} 条评价，不代表全部评价。`,
    );
  if(reviewsLimited)limits.push('评论较多，这次只比较页面中先读到的一部分。');
  if (
    ["视频", "video"].includes(contentType) ||
    site === "YouTube" ||
    ["哔哩哔哩", "TikTok"].includes(site)
  )
    limits.push("这次只读取页面文字和封面，没有读取视频与声音。");
  const bodyText = body.slice(0, 7000),
    reviewText = reviews
      .map(
        (r, i) =>
          `评价${i + 1}${r.author ? "（" + r.author + "）" : ""}：${r.text}`,
      )
      .join("\n")
      .slice(0, 6000);
  if (body.length > 7000) limits.push("正文较长，只检查前 7000 字。");
  const text = [
    title && `标题：${title}`,
    author && `作者：${author}`,
    bodyText,
    reviewText,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 14000);
  return {
    url,
    title: title.slice(0, 200),
    platform: site,
    author,
    text,
    contentType,
    reviews,
    commentAnalysis: analyzeComments(reviews,{limited:reviewsLimited}),
    imageURLs: images.slice(0, 8),
    coverage: {
      text: !!bodyText,
      reviews: reviews.length,
      images: 0,
      excerptOnly: metadataOnly,
    },
    limitations: limits,
  };
}
