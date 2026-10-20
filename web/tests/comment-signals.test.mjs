import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeComments} from '../comment-signals.mjs';
import {extractPage} from '../page-extract.mjs';
import {validateInput,reviewWithDeepSeek} from '../deepseek.mjs';
const repeated='这瓶精华用了三天皮肤就白了两个度，姐妹们赶紧闭眼冲';
const unique=['我干皮用了两周，鼻翼还是有点卡粉，但脸颊比较滋润。','有什么优惠吗','包装真好看','我的肤质可能不合适','有没有用过的朋友','在哪里购买','和另一款有什么不同'];
const reviews=[...Array.from({length:3},(_,i)=>({id:'r'+i,author:'分享者'+i,text:repeated})),...unique.map((text,i)=>({id:'u'+i,author:'用户'+i,text}))];
test('ratios use only inspected comments, separate useful details from unverified comments',()=>{
 const r=analyzeComments(reviews);assert.equal(r.total,10);assert.equal(r.suspicious,3);assert.equal(r.percent,30);assert.equal(r.detailed,1);assert.equal(r.unknown,6);assert.equal(r.groups[0].count,3);assert.equal(r.partial,true);
 assert.equal(r.suspicious+r.detailed+r.unknown,r.total);assert.equal('real' in r,false);assert.equal('truePercent' in r,false);
});
test('no comments and small samples never display a false zero or a shaky percentage',()=>{
 assert.equal(analyzeComments([]).status,'unavailable');assert.equal(analyzeComments([]).percent,null);
 const small=analyzeComments(reviews.slice(0,3));assert.equal(small.suspicious,3);assert.equal(small.percent,null);assert.equal(small.status,'small_sample');
});
test('known duplicated records and author replies are excluded; distinct readers with identical wording remain',()=>{
 const r=analyzeComments([...reviews,reviews[0],{id:'author',text:repeated,author:'原作者',isAuthor:true}]);
 assert.equal(r.readCount,12);assert.equal(r.total,10);assert.equal(r.duplicates,1);assert.equal(r.authorReplies,1);assert.equal(r.suspicious,3);assert.equal(r.percent,30);
});
test('short praise, emoji and one person posting repeatedly do not imply coordinated comments',()=>{
 assert.equal(analyzeComments(Array.from({length:12},(_,i)=>({id:String(i),author:String(i),text:'真的很好用！'}))).suspicious,0);
 assert.equal(analyzeComments(Array.from({length:4},(_,i)=>({id:String(i),author:'同一位',text:repeated}))).suspicious,0);
 assert.equal(analyzeComments(Array.from({length:4},(_,i)=>({id:String(i),text:repeated}))).suspicious,0);
});
test('changed punctuation and tiny wording changes can be grouped without treating sentiment as truth',()=>{
 const r=analyzeComments([{author:'甲',text:repeated},{author:'乙',text:repeated+'！'},{author:'丙',text:repeated.replace('姐妹们','姐妹')}]);assert.equal(r.suspicious,3);
 const ordinary=analyzeComments([{author:'甲',text:'我干皮用了三天感觉刺痛，可能不适合我，先停用。'},{author:'乙',text:'用了两周觉得滋润，秋天我会继续用，夏天不一定。'}]);assert.equal(ordinary.suspicious,0);assert.equal(ordinary.detailed,2);
});
test('HTML comments preserve matching wording from different authors and deduplicate mirrored copies',()=>{
 const product={'@type':'Product',name:'示例精华',description:'这是一瓶用于日常保湿的精华，具体效果与肤质和使用条件有关。',review:reviews.map(r=>({'@id':r.id,reviewBody:r.text,author:{name:r.author}}))};
 const html=`<script type="application/ld+json">${JSON.stringify(product)}</script>`+reviews.map(r=>`<div class="review-item" data-review-id="${r.id}"><span class="author">${r.author}</span><p class="review-content">${r.text}</p></div>`).join('');
 const page=extractPage(html,'https://beauty.example/item');assert.equal(page.contentType,'product');assert.equal(page.reviews.length,10);assert.equal(page.commentAnalysis.percent,30);assert.equal(page.coverage.reviews,10);
 const noDomIds=html.replace(/data-review-id="[^"]+"/g,'');assert.equal(extractPage(noDomIds,'https://beauty.example/item').reviews.length,10);
});
test('reader does not cap the sample at 20 or confuse the total rating count with inspected comments',()=>{
 const page=extractPage(`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'示例面霜',description:'这款保湿面霜的真实使用效果与肤质有关，请按说明使用。',aggregateRating:{reviewCount:9000},review:Array.from({length:30},(_,i)=>({reviewBody:'第'+i+'条：挺滋润的，先用一段时间再看看',author:{name:'读者'+i}}))})}</script>`,'https://beauty.example/item');
 assert.equal(page.coverage.reviews,30);assert.equal(page.commentAnalysis.total,30);assert.equal(page.commentAnalysis.readCount,30);
});
test('XHS author IDs and reply ownership survive extraction without counting the author as a buyer',()=>{
 const data={noteData:{data:{noteData:{noteId:'post',title:'精华使用感',desc:'记录这瓶精华使用两周的感受，我是干皮，脸颊感觉滋润一些。',user:{userId:'owner',nickname:'博主'}},commentData:{comments:[{id:'a',content:'我干皮用了两周，感觉比较滋润。',user:{userId:'reader',nickname:'读者'},subComments:[{id:'b',content:'谢谢分享感受呀',user:{userId:'owner',nickname:'博主'}}]}]}}}};
 const page=extractPage(`<script>window.__INITIAL_STATE__=${JSON.stringify(data)}</script>`,'https://www.xiaohongshu.com/explore/post');assert.equal(page.reviews.length,2);assert.equal(page.commentAnalysis.authorReplies,1);assert.equal(page.commentAnalysis.total,1);assert.equal(page.reviews[1].isReply,true);
});
test('AI input rejects fabricated comments and recomputes counts rather than trusting a supplied ratio',async()=>{
 const body={kind:'link',text:reviews.map(r=>r.text).join('\n'),scope:'读取了公开评论，不代表全部。',images:[],lines:[],comments:reviews,commentSignals:{percent:100,total:9999}};
 assert.throws(()=>validateInput({...body,comments:[{text:'不存在的评价'}]}));
 assert.equal(validateInput(body).commentSignals.percent,30);
 assert.equal(validateInput({...body,shareOnly:true}).commentSignals,null);
 await reviewWithDeepSeek(body,{config:{key:'unit-test-not-real',model:'deepseek-flash'},fetchImpl:async(url,options)=>{
  const input=JSON.parse(JSON.parse(options.body).messages[1].content[0].text);assert.equal(input.commentSignals.percent,30);assert.equal(input.commentSignals.total,10);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'部分评论重复了同一句话，可以再看具体体验。',next:'',findings:[]})}}]});
 }});
});
