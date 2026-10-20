import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {extractPage} from '../page-extract.mjs';
import {readPage,fetchPublic} from '../public-page.mjs';

const social=`<html><title>笔记分享</title><script>window.__INITIAL_STATE__={note:{noteDetailMap:{abc:{note:{title:'自然光口红试色',desc:'同一支口红，在自然光和暖光下拍照；没有承诺人人显白。',user:{nickname:'试色同学'},imageList:[{urlDefault:'https://images.example/lip.jpg'}]},comments:{list:[{content:'薄涂和厚涂差别挺大',userInfo:{nickname:'小周'}}]}}}}};</script></html>`;
test('social page state yields only the requested note, image and available comments',()=>{
 const r=extractPage(social,'https://www.xiaohongshu.com/explore/abc');assert.match(r.text,/自然光和暖光/);assert.equal(r.author,'试色同学');assert.equal(r.coverage.reviews,1);assert.deepEqual(r.imageURLs,['https://images.example/lip.jpg']);assert.equal(r.contentType,'social');
});
test('product reviews keep authors, repeated wording and do not confuse rating counts with comments',()=>{
 const product={'@type':'Product',name:'演示保湿乳',description:'保湿乳用于日常保湿，具体体验因人而异，以下为公开展示的评价。',image:'https://images.example/cream.jpg',aggregateRating:{reviewCount:9999},review:[{reviewBody:'用了觉得很滋润',author:{name:'甲'}},{reviewBody:'用了觉得很滋润',author:{name:'乙'}}]};
 const r=extractPage(`<script type="application/ld+json">${JSON.stringify(product)}</script>`,'https://item.jd.com/demo.html');assert.equal(r.coverage.reviews,2);assert.equal(r.reviews[1].author,'乙');assert.match(r.text,/评价2/);assert.ok(!r.text.includes('9999'));assert.match(r.limitations.join(''),/不代表全部/);
});
test('login and verification walls are not accepted as product content',()=>{
 for(const html of ['<title>安全验证</title><body>请完成验证后访问页面</body>','<title>分享</title><meta name="description" content="请先登录，登录后查看完整内容"><body>登录</body>'])assert.throws(()=>extractPage(html,'https://www.xiaohongshu.com/explore/abc'),/验证|登录|标题/);
});
test('generic platform descriptions are not mistaken for the requested social content',()=>{
 assert.throws(()=>extractPage('<title>- YouTube</title><meta name="description" content="Enjoy the videos and music you love, upload original content, and share it all">','https://www.youtube.com/watch?v=demo'),/平台介绍/);
});
test('lazy product pictures are extracted without executing Vue code, platform logos are excluded',()=>{
 const html=`<title>Moisturizing Cream</title><meta property="og:image" content="https://example.com/default-social-image.png"><main><h1>Moisturizing Cream</h1><p>A moisturizing cream for dry skin, with a gentle, non-greasy texture.</p><button v-srcset="{'0':'/cream.jpg?w=90','1000':'/cream.jpg?w=700'}"><img src="data:image/gif;base64,AA" alt="Moisturizing Cream"></button></main>`;
 assert.deepEqual(extractPage(html,'https://beauty.example/cream').imageURLs,['https://beauty.example/cream.jpg?w=700']);
});
test('image failures preserve text but never claim the image was read',async()=>{
 const r=await readPage('看看这条 https://www.xiaohongshu.com/explore/abc',{fetchImpl:async(url,opts)=>{if(opts.image)throw Error('unavailable');return {data:Buffer.from(social),url,type:'text/html'}}});assert.equal(r.coverage.images,0);assert.equal(r.images.length,0);assert.match(r.limitations.join(''),/配图没读到/);
});
test('every redirect, including image redirects, is validated before opening a socket',async()=>{
 let opened=0;
 await assert.rejects(fetchPublic('https://images.example/start',{image:true,resolveImpl:async value=>{if(value.includes('127.0.0.1'))throw Error('private address');return {url:new URL(value),address:{address:'8.8.8.8',family:4}}},requestImpl:async()=>{opened++;const r=Readable.from([]);r.statusCode=302;r.headers={location:'http://127.0.0.1/private'};return r}}),/private/);assert.equal(opened,1);
});

const mobileNote={noteId:'abc',title:'25+一定要贵价精华吗',desc:'这瓶精华让我感觉比较滋润，但我只试用了两周，肤质不同体验也可能不同。这里的字面字符串 :undefined, 不应改变。',user:{nickName:'美妆分享者'},imageList:[{url:'https://images.example/one.jpg'},{url:'https://images.example/two.webp'}]};
const mobileComments={commentCount:365,comments:[{id:'c1',noteId:'abc',content:'先做好保湿和防晒',user:{nickname:'甲'},subComments:[{id:'c2',content:'同意，按肤质选择',user:{nickname:'乙'}}]},{id:'c3',content:'先做好保湿和防晒',user:{nickname:'丙'}}]};
test('XHS mobile share state yields title, nickName, pictures and actual comments including replies',()=>{
 const state={noteData:{data:{noteData:mobileNote,commentData:mobileComments}}};
 const r=extractPage(`<script>window.__INITIAL_STATE__=${JSON.stringify(state).replace('"noteData":{','"missing":undefined,"noteData":{')};</script>`,'https://www.xiaohongshu.com/discovery/item/abc?xsec_token=public-share');
 assert.equal(r.title,mobileNote.title);assert.equal(r.author,'美妆分享者');assert.equal(r.imageURLs.length,2);assert.equal(r.reviews.length,3);assert.equal(r.reviews[2].author,'丙');assert.equal(r.coverage.excerptOnly,false);assert.match(r.text,/:undefined,/);assert.ok(!r.text.includes('365'));assert.equal(r.text.includes('noteId'),false);
});
test('XHS server setup state works independently; mirrored state never doubles reviews',()=>{
 const data={noteData:mobileNote,commentData:mobileComments};const setup=`<script>window.__SETUP_SERVER_STATE__=${JSON.stringify({LAUNCHER_SSR_STORE_PAGE_DATA:data})}</script>`;
 const initial=`<script>window.__INITIAL_STATE__=${JSON.stringify({noteData:{data}})}</script>`;
 assert.equal(extractPage(setup,'https://www.xiaohongshu.com/discovery/item/abc').reviews.length,3);
 assert.equal(extractPage(initial+setup,'https://www.xiaohongshu.com/discovery/item/abc').reviews.length,3);
});
test('recommended or mismatched notes are not accepted as the requested note',()=>{
 const state={noteData:{data:{noteData:{...mobileNote,noteId:'other'},commentData:mobileComments}}};
 assert.throws(()=>extractPage(`<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`,'https://www.xiaohongshu.com/discovery/item/abc'),/正文|标题/);
});
test('empty script-heavy login and challenge pages receive useful error codes',()=>{
 assert.throws(()=>extractPage('<title>小红书 - 你的生活兴趣社区</title><script>'+ ' '.repeat(5000)+'</script>','https://www.xiaohongshu.com/login?redirectPath=abc'),e=>e.code==='LOGIN_REQUIRED');
 assert.throws(()=>extractPage('<title>分享</title><body>安全验证<script>'+ 'x'.repeat(5000)+'</script></body>','https://www.xiaohongshu.com/explore/abc'),e=>e.code==='VERIFICATION_REQUIRED');
});
test('note HTML is parsed as data without running scripts',()=>{
 globalThis.__xhsParserExecuted=false;
 const html=`<script>globalThis.__xhsParserExecuted=true;window.__INITIAL_STATE__={noteData:{data:{noteData:{noteId:'abc',title:'安全解析',desc:'公开页面里的这段文字足够长，可以作为正常的美妆经验分享内容。'}}}};throw Error('do not run');</script>`;
 assert.equal(extractPage(html,'https://www.xiaohongshu.com/discovery/item/abc').title,'安全解析');assert.equal(globalThis.__xhsParserExecuted,false);delete globalThis.__xhsParserExecuted;
});
