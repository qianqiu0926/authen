import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedLink,routeMaterial,platformName} from '../src/intake.ts';
import {growthProgress,initialRoom,earn} from '../src/consumer/model.ts';

test('links in ordinary text and sharing messages are routed without losing the question',()=>{
 const text='这款真的好用吗？https://www.xiaohongshu.com/explore/abc?xsec_token=a%2Bb，复制后打开';
 const routed=routeMaterial({kind:'text',text,images:[]});
 assert.equal(routed.kind,'link');assert.equal(routed.url,'https://www.xiaohongshu.com/explore/abc?xsec_token=a%2Bb');assert.equal(routed.text,text);
 assert.equal(platformName(routed.url),'小红书');
 assert.equal(platformName('https://xiaohongshu.com.evil.example/x'),'xiaohongshu.com.evil.example');
 assert.equal(sharedLink('（https://item.jd.com/123.html）'),'https://item.jd.com/123.html');
 assert.equal(sharedLink('www.example.com/test'),'https://www.example.com/test');
 assert.equal(routeMaterial({...routed,skipLink:true}).url,undefined);
 assert.equal(routeMaterial({kind:'text',text:'评论：用了会卡粉。',images:['image']}).kind,'image');
});
test('growth reflects real activity, ignores sample cards and remembers completed leaves',()=>{
 const state={reports:[],social:{posts:[],leaves:0,ledger:[],rewards:[],roomItems:[],room:initialRoom()},settings:{}};
 assert.deepEqual(growthProgress({...state,reports:[{sample:true,saved:true,analysisLabel:'DeepSeek'}]}),[]);
 const full={...state,reports:[{sample:false,saved:true,analysisLabel:'DeepSeek 内容分析'}],social:{...state.social,rewards:['matching-v1']}};
 assert.deepEqual(growthProgress(full),['check','save','learn']);
 assert.deepEqual(growthProgress({...state,growth:growthProgress(full)}),['check','save','learn']);
 const paid=earn(state.social,'growth-v1','成长树开花',5);assert.equal(earn(paid,'growth-v1','成长树开花',5).leaves,5);
});

test('the exact new-domain sharing format preserves the URL and surrounding question',()=>{
 const text='皮肤好的人都要用很贵的精华吗 我现在25+之后护肤真的... https://xhslink.cn/o/6WU23kNz6Mv 来【小红书】一探究竟吧！';
 const routed=routeMaterial({kind:'text',text,images:[]});assert.equal(routed.url,'https://xhslink.cn/o/6WU23kNz6Mv');assert.equal(routed.text,text);assert.equal(platformName(routed.url),'小红书');assert.equal(platformName('https://xhslink.cn.evil.example/o/test'),'xhslink.cn.evil.example');
});
test('link failures retain a recoverable URL and readable reason, including HTML proxy errors',async()=>{
 const {readSharedPage,LinkReadError}=await import('../src/intake.ts');const url='https://xhslink.cn/o/demo';const signal=new AbortController().signal;
 await assert.rejects(readSharedPage(url,signal,async()=>Response.json({code:'LOGIN_REQUIRED',error:'这页需要登录，补张截图吧。'},{status:422})),e=>e instanceof LinkReadError&&e.url===url&&e.code==='LOGIN_REQUIRED');
 await assert.rejects(readSharedPage(url,signal,async()=>new Response('<html>Bad Gateway</html>',{status:502})),e=>e instanceof LinkReadError&&e.code==='READ_FAILED'&&!e.message.includes('Unexpected'));
 await assert.rejects(readSharedPage(url,signal,async()=>{throw Error('offline')}),e=>e.code==='NETWORK_ERROR');
 const data={text:'实际笔记正文',coverage:{text:true,reviews:0,images:0},images:[],limitations:[]};assert.deepEqual(await readSharedPage(url,signal,async()=>Response.json(data)),data);
});
