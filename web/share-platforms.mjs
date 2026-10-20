import { load } from "cheerio";
import JSON5 from "json5";

export const hostIs = (host, domain) => host === domain || host.endsWith("." + domain);
export const mobileDomains = ["xiaohongshu.com", "xhslink.com", "xhslink.cn", "tb.cn", "taobao.com", "tmall.com", "douyin.com", "iesdouyin.com"];

// The public mobile share page contains the post data, unlike the desktop shell.
export function readableURL(value) {
  const url = new URL(value);
  if (hostIs(url.hostname, "douyin.com") && url.hostname !== "v.douyin.com") {
    const match = url.pathname.match(/^\/(?:share\/)?(video|note)\/(\d+)\/?$/);
    const modal = url.searchParams.get("modal_id");
    if (match || (modal && /^\d+$/.test(modal))) {
      url.hostname = "www.iesdouyin.com";
      url.pathname = `/share/${match?.[1] || "video"}/${match?.[2] || modal}/`;
    }
  }
  return url.href;
}

// Read a literal destination, never execute scripts from a shared page.
export function shareRedirect(html, value) {
  const url = new URL(value), $ = load(html);
  let target;
  const refresh = $('meta[http-equiv]').filter((_, el) => ($(el).attr('http-equiv') || '').toLowerCase() === 'refresh').first().attr('content');
  if (refresh) target = refresh.match(/^\s*\d+(?:\.\d+)?\s*;\s*url\s*=\s*["']?([^"']+)["']?\s*$/i)?.[1]?.trim();
  if (!target) {
    const taobao = hostIs(url.hostname, "tb.cn");
    $("script:not([src])").each((_, el) => {
      if (target) return;
      const script = $(el).text();
      const pattern = taobao
        ? /\b(?:var|let|const)\s+url\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*;/
        : /(?:window\.)?location(?:\.href\s*=\s*|\.(?:replace|assign)\(\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*[;)]/;
      const literal = script.match(pattern)?.[1];
      if (!literal) return;
      try {
        const next = new URL(JSON5.parse(literal), url);
        if (taobao && !["taobao.com", "tmall.com", "tb.cn"].some(d => hostIs(next.hostname, d))) return;
        target = next.href;
      } catch {}
    });
  }
  if (!target) return;
  try {
    const next = new URL(target, url);
    if (!["https:", "http:"].includes(next.protocol) || next.href === url.href) return;
    return next.href;
  } catch {}
}

// Walk bounded, explicitly embedded data. Ignore recommendation lists entirely.
export function dataObjects(value) {
  const result = [], queue = [[value, 0]];
  while (queue.length && result.length < 1200) {
    const [node, depth] = queue.shift();
    if (!node || typeof node !== "object" || depth > 12) continue;
    result.push(node);
    for (const [key, child] of Object.entries(node)) {
      if (/recommend|related|suggest|feed|guess/i.test(key)) continue;
      if (child && typeof child === "object" && queue.length < 2400) queue.push([child, depth + 1]);
    }
  }
  return result;
}

export function embeddedStates($, initialData, variables) {
  const states = [];
  $("script:not([src])").each((_, el) => {
    const script = $(el).text();
    for (const variable of variables) {
      const data = initialData(script, variable);
      if (data) states.push(data);
    }
    if (["RENDER_DATA", "__NEXT_DATA__"].includes($(el).attr("id"))) {
      try { states.push(JSON.parse($(el).attr("id") === "RENDER_DATA" ? decodeURIComponent(script) : script)); } catch {}
    }
  });
  return states;
}

export function platformContent($, value, initialData) {
  const url = new URL(value), host = url.hostname;
  const douyin = ["douyin.com", "iesdouyin.com"].some(d => hostIs(host, d));
  const taobao = ["taobao.com", "tmall.com"].some(d => hostIs(host, d));
  if (!douyin && !taobao) return;
  const states = embeddedStates($, initialData, douyin
    ? ["_ROUTER_DATA", "__INITIAL_STATE__", "_SSR_DATA"]
    : ["__INITIAL_STATE__", "__INIT_DATA__", "__ICE_APP_CONTEXT__", "__GLOBAL_DATA__", "g_config"]);
  const nodes = states.flatMap(dataObjects);
  if (douyin) {
    const id = url.pathname.match(/\/(?:video|note)\/(\d+)/)?.[1] || url.searchParams.get("modal_id");
    if (!id) return;
    const post = nodes.find(n => String(n.aweme_id || n.awemeId || n.item_id || "") === id && typeof n.desc === "string");
    if (!post) return;
    const pictures = post.images || post.image_post_info?.images || post.imagePostInfo?.images || [];
    const firstURL = im => typeof im === "string" ? im : im?.url_list?.[0] || im?.urlList?.[0] || im?.display_image?.url_list?.[0] || im?.displayImage?.urlList?.[0];
    const imageURLs = pictures.length ? pictures.map(firstURL) : [firstURL(post.video?.origin_cover || post.video?.originCover || post.video?.cover)];
    const comments = nodes.filter(n => (n.aweme_id || n.awemeId) && String(n.aweme_id || n.awemeId) === id && (n.cid || n.comment_id) && typeof n.text === "string");
    const seen = new Set();
    return {
      title: post.desc.slice(0, 200), body: post.desc, author: post.author?.nickname || post.author?.nickName,
      contentType: pictures.length ? "social" : "video", imageURLs,
      reviews: comments.filter(c => { const key = c.cid || c.comment_id; if (seen.has(key)) return false; seen.add(key); return true; }).map(c => ({id:String(c.cid||c.comment_id),text:c.text, author:c.user?.nickname,authorKey:String(c.user?.uid||c.user?.sec_uid||''),isAuthor:!!c.user?.uid&&String(c.user.uid)===String(post.author?.uid),isReply:!!c.reply_id&&String(c.reply_id)!=='0'})),
    };
  }
  const id = url.searchParams.get("id") || url.searchParams.get("itemId");
  if (!id) return;
  const item = nodes.find(n => String(n.itemId || n.item_id || n.itemNumId || n.itemNumID || n.id || "") === id && typeof n.title === "string" && (n.images || n.pics || n.title));
  if (!item) return;
  return {
    title: item.title, body: [item.title, typeof item.subtitle === "string" ? item.subtitle : "", typeof item.description === "string" ? item.description : ""].filter(Boolean).join("\n"),
    contentType: "product", imageURLs: item.images || item.pics || [], reviews: [], excerptOnly: true,
  };
}
