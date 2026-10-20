import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {extractPage} from '../page-extract.mjs';
import {readPage,fetchPublic,pageHeaders,decodePage} from '../public-page.mjs';
import {shareRedirect,readableURL} from '../share-platforms.mjs';
import {sharePreview,sharedLink,platformName} from '../src/intake.ts';
import {normalizeResult,validateInput} from '../deepseek.mjs';

const share='【淘宝】7天价保 https://e.tb.cn/h.jYiEfYeqgyLtQGS?tk=MnxuTthGltC MF937 「【自营】【下拉淘金币优惠】YSL/圣罗兰粉皮革气垫持妆部分礼袋」 点击链接直接打开 或者 淘宝搜索直接打开';
test('the user Taobao message preserves its URL and identifies a product, not a read page',()=>{
 assert.equal(sharedLink(share),'https://e.tb.cn/h.jYiEfYeqgyLtQGS?tk=MnxuTthGltC');
 const p=sharePreview(share);assert.equal(p.contentType,'product');assert.match(p.title,/YSL\/圣罗兰/);assert.equal(p.platform,'淘宝 / 天猫');assert.ok(!p.text.includes('MF937'));assert.ok(!p.text.includes('609'));
});
test('the user Douyin message separates its actual caption and author from share commands and codes',()=>{
 const text='3.84 复制打开抖音，看看【来杯冷尹的作品】听我一句劝！别再盲目跟风乱买护肤品了！ # 护肤 ... https://v.douyin.com/Jz5Zj3ELoOA/ trR:/ S@y.Gi 04/21 :4pm';
 const p=sharePreview(text);assert.equal(p.author,'来杯冷尹');assert.equal(p.title,'听我一句劝！别再盲目跟风乱买护肤品了！ # 护肤 ...');assert.equal(p.contentType,'video');assert.equal(p.url,'https://v.douyin.com/Jz5Zj3ELoOA/');assert.ok(!p.text.includes('trR'));
});
test('plain links and invitation boilerplate cannot become content; real English brand names survive',()=>{
 for(const input of ['https://v.douyin.com/abc/','复制此链接 https://v.douyin.com/abc/ 打开抖音搜索','https://xhslink.cn/o/abc 来【小红书】一探究竟吧！'])assert.equal(sharePreview(input),undefined);
 assert.match(sharePreview('Lancôme 精华的真实试用感受 https://beauty.example/post').text,/Lancôme/);
 assert.equal(sharePreview('薄涂不容易卡粉，但持妆要看肤质 https://v.douyin.com/abc/ 复制此链接，打开抖音搜索').contentType,'video');
});
test('common platforms and unknown public sites are identified without matching lookalike hosts',()=>{
 for(const [host,label] of [['v.douyin.com','抖音'],['e.tb.cn','淘宝 / 天猫'],['b23.tv','哔哩哔哩'],['v.kuaishou.com','快手'],['mobile.yangkeduo.com','拼多多'],['mp.weixin.qq.com','微信公众号'],['beauty.example','beauty.example']])assert.equal(platformName('https://'+host+'/abc'),label);
 assert.equal(platformName('https://douyin.com.evil.example/'),'douyin.com.evil.example');
});
test('Taobao literal short-link redirects are decoded without running any JavaScript',()=>{
 globalThis.__shareExecuted=false;
 const html=`<script>globalThis.__shareExecuted=true;var url='https://item.taobao.com/item.htm?id=123&x=hello\\u0026share=true';window.location.replace(url)</script>`;
 assert.equal(shareRedirect(html,'https://e.tb.cn/h.abc'),'https://item.taobao.com/item.htm?id=123&x=hello&share=true');
 assert.equal(globalThis.__shareExecuted,false);delete globalThis.__shareExecuted;
 assert.equal(shareRedirect(`<script>var url='https://evil.example/';</script>`,'https://e.tb.cn/h.abc'),undefined);
 assert.equal(shareRedirect(`<script>var url='https://item.taobao.com/item.htm?id=123';</script>`,'https://unrelated.example/'),undefined);
});
test('public HTML redirects support refresh and literal location, never app schemes or expressions',()=>{
 assert.equal(shareRedirect('<meta http-equiv="refresh" content="0;url=/post?id=2&amp;share=1">','https://beauty.example/start'),'https://beauty.example/post?id=2&share=1');
 assert.equal(shareRedirect(`<script>window.location.replace('https://beauty.example/post');</script>`,'https://beauty.example/start'),'https://beauty.example/post');
 assert.equal(shareRedirect(`<script>window.location.replace(compute());</script>`,'https://beauty.example/start'),undefined);
 assert.equal(shareRedirect('<meta http-equiv="refresh" content="0;url=snssdk1128://video/123">','https://beauty.example/start'),undefined);
});
test('Douyin uses the public mobile share page, preserving parameters and exact post ID',()=>{
 assert.equal(readableURL('https://www.douyin.com/video/123?foo=a%2Bb'),'https://www.iesdouyin.com/share/video/123/?foo=a%2Bb');
 assert.equal(readableURL('https://www.douyin.com/note/123'),'https://www.iesdouyin.com/share/note/123/');
 assert.equal(readableURL('https://www.douyin.com/?modal_id=123'),'https://www.iesdouyin.com/share/video/123/?modal_id=123');
 assert.equal(readableURL('https://v.douyin.com/abc/'),'https://v.douyin.com/abc/');
 assert.equal(readableURL('https://douyin.com.evil.example/video/123'),'https://douyin.com.evil.example/video/123');
 for(const h of ['e.tb.cn','item.taobao.com','www.iesdouyin.com']){assert.match(pageHeaders(new URL('https://'+h))['User-Agent'],/iPhone/);assert.equal(pageHeaders(new URL('https://'+h)).Cookie,undefined)}
});
const post={aweme_id:'123',desc:'自然光试色，薄涂一层',author:{nickname:'试色同学'},video:{cover:{url_list:['https://images.example/cover.jpg']}}};
const router=p=>`<script>window._ROUTER_DATA=${JSON.stringify({loaderData:{'video_(id)/page':{videoInfoRes:{item_list:[p]}}}})}</script>`;
test('Douyin mobile data reads exact video description, author and cover, not view counts or soundtrack',()=>{
 const r=extractPage(router({...post,statistics:{comment_count:999},music:{title:'不是口播'},comments:[{cid:'c1',aweme_id:'123',text:'薄涂的效果更自然',user:{nickname:'甲'}},{cid:'c2',aweme_id:'456',text:'这是其他作品的评论'}]}),'https://www.iesdouyin.com/share/video/123/');
 assert.equal(r.title,post.desc);assert.equal(r.author,'试色同学');assert.equal(r.contentType,'video');assert.equal(r.reviews.length,1);assert.deepEqual(r.imageURLs,['https://images.example/cover.jpg']);assert.ok(!r.text.includes('999'));assert.ok(!r.text.includes('不是口播'));assert.match(r.limitations.join(''),/没有读取视频与声音/);
});
test('Douyin albums keep all embedded pictures and are not labelled as watched video',()=>{
 const r=extractPage(router({...post,images:[{url_list:['https://images.example/a.jpg']},{url_list:['https://images.example/b.jpg']}]}),'https://www.iesdouyin.com/share/note/123/');
 assert.equal(r.contentType,'social');assert.equal(r.imageURLs.length,2);assert.ok(!r.limitations.join('').includes('没有读取视频'));
});
test('Douyin desktop URI-encoded data is supported but unrelated/recommended posts are excluded',()=>{
 const html=`<script id="RENDER_DATA" type="application/json">${encodeURIComponent(JSON.stringify({aweme:{detail:post}}))}</script>`;
 assert.equal(extractPage(html,'https://www.douyin.com/video/123').title,post.desc);
 assert.throws(()=>extractPage(router({...post,aweme_id:'456'}),'https://www.douyin.com/video/123'));
 assert.throws(()=>extractPage(`<script>window._ROUTER_DATA=${JSON.stringify({recommendations:[post]})}</script>`,'https://www.douyin.com/video/123'));
});
test('public Taobao item data must match the item ID; brief fields remain explicitly partial',()=>{
 const h=`<script>window.__INIT_DATA__=${JSON.stringify({item:{itemId:'123',title:'粉皮革气垫',images:['https://images.example/ysl.jpg']}})}</script>`;
 const r=extractPage(h,'https://item.taobao.com/item.htm?id=123');assert.equal(r.contentType,'product');assert.equal(r.coverage.excerptOnly,true);assert.equal(r.coverage.reviews,0);
 assert.throws(()=>extractPage(h,'https://item.taobao.com/item.htm?id=456'));
});
test('login script, product app shell and unavailable Douyin content never become successful reads',()=>{
 assert.throws(()=>extractPage(`<script>window._config_={action:'login',url:'https://login.taobao.com/login'}</script>`,'https://item.taobao.com/item.htm?id=123'),e=>e.code==='LOGIN_REQUIRED');
 assert.throws(()=>extractPage('<title>天貓淘寶海外，花更少，買到寶！</title><meta name="description" content="覆盖全球的购物平台，这是一段长的通用介绍，不是商品详情。">','https://m.intl.taobao.com/detail/detail.html?id=123'),e=>e.code==='APP_REQUIRED');
 assert.throws(()=>extractPage('<title>商品详情页</title><body>店铺客服收藏加入购物车立即购买</body>','https://h5.m.taobao.com/awp/core/detail.htm?id=123'),e=>e.code==='APP_REQUIRED');
 assert.throws(()=>extractPage('<title>在抖音记录美好生活20261016 - 抖音</title><body>抱歉出错了请尝试在抖音内观看</body>','https://www.iesdouyin.com/share/video/123/'),e=>e.code==='CONTENT_UNAVAILABLE');
 assert.throws(()=>extractPage('<body></body><script>window._$jsvmprt=function(){}</script>','https://www.douyin.com/video/123'),e=>e.code==='VERIFICATION_REQUIRED');
});
test('the reader follows a Taobao short page then returns genuine product data',async()=>{
 const calls=[];
 const r=await readPage(share,{fetchImpl:async(url,opts)=>{calls.push(url);if(opts.image)throw Error('no image');return {url,data:Buffer.from(url.includes('e.tb.cn')?`<script>var url='https://item.taobao.com/item.htm?id=123';</script>`:`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'测试气垫',description:'用于日常底妆的一款气垫，妆效与肤质和上妆手法有关。'})}</script>`)}}});
 assert.equal(calls.length,2);assert.equal(r.title,'测试气垫');assert.equal(r.contentType,'product');
});
test('HTML redirects still use validated public requests, and redirect loops are bounded',async()=>{
 let opened=0;
 const fetchImpl=(url,opts)=>fetchPublic(url,{...opts,resolveImpl:async value=>{if(value.includes('127.0.0.1'))throw Error('private address');return {url:new URL(value),address:{address:'8.8.8.8',family:4}}},requestImpl:async()=>{opened++;const r=Readable.from([Buffer.from('<meta http-equiv="refresh" content="0;url=http://127.0.0.1/private">')]);r.statusCode=200;r.headers={'content-type':'text/html'};return r}});
 await assert.rejects(readPage('https://beauty.example/start',{fetchImpl}),/private address/);assert.equal(opened,1);
 await assert.rejects(readPage('https://beauty.example/a',{fetchImpl:async url=>({url,data:Buffer.from(`<meta http-equiv="refresh" content="0;url=${url.endsWith('/a')?'/b':'/a'}">`)})}),e=>e.code==='REDIRECT_LOOP');
});
test('ordinary public article sites still work without a named platform adapter',()=>{
 const r=extractPage('<title>防晒怎么补涂</title><article><p>户外活动出汗后需要重新涂抹防晒，日常使用时也要按产品说明涂够用量。</p></article>','https://beauty.example/sunscreen');assert.equal(r.platform,'beauty.example');assert.match(r.text,/重新涂抹/);
});
test('older Chinese shopping page encodings preserve Chinese text',()=>{
 const bytes=Buffer.concat([Buffer.from('<meta charset="gbk"><title>'),Buffer.from([0xc6,0xa4,0xb7,0xf4]),Buffer.from('</title>')]);
 assert.match(decodePage(bytes),/<title>皮肤<\/title>/);
 assert.equal(decodePage(Buffer.from('美妆'), 'text/html;charset=UTF-8'),'美妆');
});
test('a title-only recovery cannot turn missing page data into a suspicious finding',()=>{
 const input=validateInput({kind:'text',text:'别再盲目跟风乱买护肤品',scope:'仅分享文案，原网页未读取',shareOnly:true,images:[],lines:[]});
 const r=normalizeResult({contentType:'video',answerKind:'check',tips:[],summary:'只收到分享文案，原视频尚未读到。',next:'补一段视频。',findings:[{status:'needs_evidence',quote:input.text,finding:'没有浓度',why:'没有测试时长'}]},input,'test');
 assert.equal(r.verdict,'unclear');assert.deepEqual(r.evidence,[]);
});
