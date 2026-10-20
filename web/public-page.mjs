import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { extractPage, PageReadError } from "./page-extract.mjs";
import { mobileDomains, hostIs, readableURL, shareRedirect } from "./share-platforms.mjs";
export function publicAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224 ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return !(
      v === "::" ||
      v === "::1" ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      /^fe[89ab]/.test(v) ||
      v.startsWith("ff") ||
      v.startsWith("::ffff:")
    );
  }
  return false;
}
const synthetic = (ip) => /^198\.(18|19)\./.test(ip);
export async function resolvePublic(
  value,
  { lookupImpl = lookup, fetchImpl = fetch } = {},
) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw Error("请使用公开网页链接。");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local"))
    throw Error("请使用公开网页链接。");
  let addresses = await lookupImpl(host, { all: true });
  // Some local VPNs return benchmark-range synthetic DNS. Verify through a fixed
  // HTTPS resolver, then pin the verified public address in the actual socket.
  if (
    !net.isIP(host) &&
    addresses.length &&
    addresses.every((a) => synthetic(a.address))
  ) {
    const dns = new URL("https://dns.google/resolve");
    dns.searchParams.set("name", host);
    dns.searchParams.set("type", "A");
    const response = await fetchImpl(dns, {
      signal: AbortSignal.timeout(6000),
      redirect: "error",
    });
    if (!response.ok) throw Error("当前网络无法读取这个链接。");
    const data = await response.json();
    addresses = (data.Status === 0 ? (data.Answer ?? []) : [])
      .filter((a) => a.type === 1 && net.isIPv4(a.data))
      .map((a) => ({ address: a.data, family: 4 }));
  }
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("当前网络无法直接读取这个链接，换成截图也可以。");
  return { url, address: addresses[0] };
}
export function pageHeaders(url) {
  const host = url.hostname.toLowerCase();
  const mobileShare = mobileDomains.some(d => hostIs(host, d));
  return {
    "User-Agent": mobileShare
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (compatible; AUTHEN/3.0)",
    Accept: "text/html,application/xhtml+xml,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
    "Accept-Encoding": "identity",
  };
}
export function requestPinned(url, address, timeout, signal) {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        headers: pageHeaders(url),
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, [address])
            : callback(null, address.address, address.family),
      },
      resolve,
    );
    req.on("error", reject);
    req.setTimeout(timeout, () => req.destroy(Error("页面读取超时。")));
    req.end();
  });
}
export async function fetchPublic(
  value,
  {
    signal,
    timeout = 25000,
    maxBytes = 3_000_000,
    image = false,
    resolveImpl = resolvePublic,
    requestImpl = requestPinned,
  } = {},
) {
  let target = value;
  const deadline = Date.now() + timeout,
    combined = AbortSignal.any([
      AbortSignal.timeout(timeout),
      ...(signal ? [signal] : []),
    ]);
  for (let attempt = 0; attempt < 5; attempt++) {
    combined.throwIfAborted();
    const { url, address } = await resolveImpl(image ? target : readableURL(target));
    combined.throwIfAborted();
    const res = await requestImpl(
      url,
      address,
      Math.min(15000, Math.max(1, deadline - Date.now())),
      combined,
    );
    if (res.statusCode >= 300 && res.statusCode < 400) {
      const location = res.headers.location;
      res.destroy();
      if (!location) throw Error("页面跳转不完整。");
      target = new URL(location, url).href;
      continue;
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.destroy();
      throw new PageReadError(res.statusCode === 404 || res.statusCode === 410 ? "NOT_FOUND" : "ACCESS_LIMITED", res.statusCode === 404 || res.statusCode === 410 ? "这条内容可能已删除或链接已失效，换条分享链接试试。" : "平台暂时不允许读取这页，可以粘贴文字或补截图。");
    }
    const type = res.headers["content-type"] || "";
    if (
      !(
        image
          ? /image\/(jpeg|png|webp)\b/i
          : /text\/(html|plain)|application\/xhtml/i
      ).test(type)
    ) {
      res.destroy();
      throw Error("链接格式暂时读不了，直接上传文件试试。");
    }
    let size = 0,
      chunks = [];
    for await (const chunk of res) {
      combined.throwIfAborted();
      size += chunk.length;
      if (size > maxBytes) {
        res.destroy();
        throw Error("页面或图片较大，请截取重点内容。");
      }
      chunks.push(chunk);
    }
    return { data: Buffer.concat(chunks), url: url.href, type };
  }
  throw Error("页面跳转过多，换成截图也可以。");
}
function imageMime(data) {
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    data.subarray(0, 4).toString() === "RIFF" &&
    data.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
}
export function decodePage(data, type = "") {
  const declared = type.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ||
    data.subarray(0, 4096).toString("ascii").match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i)?.[1];
  try { return new TextDecoder(declared || "utf-8").decode(data); }
  catch { return data.toString("utf8"); }
}
export async function readPage(
  value,
  { signal, fetchImpl = fetchPublic } = {},
) {
  if (typeof value !== "string" || value.length > 3000)
    throw Error("请粘贴完整的分享链接。");
  const match = value
    .match(/https?:\/\/[^\s<>"「」『』，。；、！？（）【】]+/i)?.[0]
    ?.replace(/[，。；、！!？?）)】\]}>]+$/g, "");
  if (!match) throw Error("请粘贴以 https:// 开头的公开链接。");
  // One total deadline for HTTP redirects, HTML redirects and attached images.
  const combined = AbortSignal.any([AbortSignal.timeout(35000), ...(signal ? [signal] : [])]);
  let target = readableURL(match), page;
  const seen = new Set();
  for (let hop = 0; hop < 4; hop++) {
    combined.throwIfAborted();
    if (seen.has(target)) throw new PageReadError("REDIRECT_LOOP", "这条链接一直在跳转，补张截图就能继续。");
    seen.add(target);
    const fetched = await fetchImpl(target, { signal: combined });
    const html = decodePage(fetched.data, fetched.type);
    // Extract genuine content before considering a redirect or an app-open script.
    try { page = extractPage(html, fetched.url); break; }
    catch (error) {
      if (["LOGIN_REQUIRED", "VERIFICATION_REQUIRED", "NOT_FOUND"].includes(error.code)) throw error;
      const next = shareRedirect(html, fetched.url);
      if (!next) throw error;
      target = readableURL(next);
    }
  }
  if (!page) throw new PageReadError("REDIRECT_LIMIT", "这条链接跳转太多，补张截图就能继续。");
  const selected = page.imageURLs.slice(0, 3),
    images = [];
  const reads = await Promise.allSettled(
    selected.map(async (url) => {
      const file = await fetchImpl(url, {
        signal: combined,
        image: true,
        maxBytes: 1_800_000,
        timeout: 7000,
      });
      const mime = imageMime(file.data);
      if (!mime) throw Error("图片格式不支持");
      return {
        url: file.url,
        dataURL: `data:${mime};base64,${file.data.toString("base64")}`,
      };
    }),
  );
  signal?.throwIfAborted();
  for (const result of reads)
    if (result.status === "fulfilled") images.push(result.value);
  if (selected.length > images.length)
    page.limitations.push("部分配图没读到，可以补充原图或截图。");
  if (page.imageURLs.length > 3)
    page.limitations.push("配图较多，这次最多读取前 3 张。");
  if (!images.length && !selected.length)
    page.limitations.push("这页没有可读取的配图。");
  const { imageURLs, ...safe } = page;
  return {
    ...safe,
    images,
    coverage: { ...page.coverage, images: images.length },
  };
}
