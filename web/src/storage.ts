import {reportProducts} from "../products.mjs";
import {openDB} from 'idb';
import type {Report} from './types';
const db=openDB('authen',1,{upgrade(db){db.createObjectStore('reports',{keyPath:'id'})}});
export async function allReports():Promise<Report[]>{return (await(await db).getAll('reports')).sort((a,b)=>b.date.localeCompare(a.date));}
export async function saveReport(report:Report){await(await db).put('reports',report);const records=await allReports();for(const old of records.slice(30))await removeReport(old.id);}
export async function removeReport(id:string){await(await db).delete('reports',id);}
export async function clearReports(){await(await db).clear('reports');}
export function reportFile(r:Report){
 const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const comments=r.page?.commentAnalysis;
 const pres=r.presentation;
 const leadHTML=pres?`<p>${escape(pres.state_reason)}</p>`:'';
 const title=escape(pres?pres.state_subtitle:r.summary);
 const dimHTML=pres?`<article><h2>从六个方面看</h2><ul>${pres.dimension_summary.map(d=>`<li><b>${escape(d.dim)}</b>：${escape(d.result)}${d.note?`<br><small>${escape(d.note)}</small>`:''}</li>`).join('')}</ul></article>`:'';
 const stepHTML=pres?`<article><h2>这个结论怎么来的</h2><ol>${pres.reason_steps.map(s=>`<li>${escape(s)}</li>`).join('')}</ol></article>`:'';
 const limitHTML=pres?`<article><h2>这次没看到什么</h2>${pres.limitations.map(l=>`<p><small>${escape(l)}</small></p>`).join('')}</article>`:'';
 const commentHTML=r.page?`<article><h2>评论区一起看</h2>${comments?.total?`<p>本次读到 ${comments.readCount} 条，纳入 ${comments.total} 条用户评论。可疑话术占比：${comments.percent===null?'样本不足，暂不计算':comments.percent+'%'}。</p><p>话术可疑 ${comments.suspicious} 条 / 有使用细节 ${comments.detailed} 条 / 暂难判断 ${comments.unknown} 条</p><p>${escape(comments.summary)}</p>${comments.groups.map(g=>`<b>${escape(g.reason)} · ${g.count} 条</b>${g.comments.map(c=>`<p>${escape(c.author||'用户')}：${escape(c.text)}</p>`).join('')}`).join('')}<small>仅比较已读取评论的重复话术，不代表全部评论，也不认定水军或真实比例。</small>`:'<p>这次没读到可比较的用户评论，还不能判断好评是否可信。</p>'}</article>`:'';
 const productHTML=reportProducts(r).map(item=>{const p=item.product,b=item.brand;return `<article><h2>${escape(p?.name||b.name)}</h2><p>欧莱雅旗下品牌 · ${escape(p?.edition||'具体款式待确认')}</p>${item.needsConfirm?'<p>名称或版本还需确认，未提供购买链接。</p>':`${p?`<p>${escape(p.officialName)}</p>${p.facts.map(f=>`<p><b>${escape(f.label)}</b>：${escape(f.text)}</p>`).join('')}<p>${escape(p.check)}</p>`:`<p>${escape(b.hint)}</p>`}<p><a href="${escape(p?.url||b.url)}">查看品牌官网说明</a></p>${p?.buyURL?`<p><a href="${escape(p.buyURL)}">去品牌推荐渠道选购</a> · <a href="${escape(p.buySource)}">链接来源</a></p>`:''}`}<small>产品资料不代表原帖商品或店铺已验真。价格、库存以商家页面为准。</small></article>`}).join('');
 const html=`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>AUTHEN 报告</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;background:#f7f2eb;color:#191817;font:16px/1.8 sans-serif}h1,h2{color:#b52b32}article{background:#fffcf7;padding:24px;margin:20px 0}img{max-height:300px;max-width:100%}small{color:#766d66}a{color:#b52b32}@media print{body{margin:0}article{break-inside:avoid}}</style><h1>AUTHEN</h1><small>${r.sample?'示例报告':escape(r.analysisLabel||'本机初查')} · ${escape(r.date.slice(0,10))}</small><h2>${title}</h2>${leadHTML}${r.images[0]?`<img src="${r.images[0]}">`:''}<p>${escape(r.original).replace(/\n/g,'<br>')}</p>${dimHTML}${stepHTML}${limitHTML}${r.evidence.map(e=>`<article><h2>“${escape(e.text)}”</h2><b>${escape(e.finding)}</b><p>${escape(e.why)}</p><small>${escape(e.source)}</small><p>${escape(e.excerpt)}</p>${e.sourceURL&&/^https?:/.test(e.sourceURL)?`<a href="${escape(e.sourceURL)}">查看原网页</a>`:''}</article>`).join('')}${commentHTML}${productHTML}<h2>接下来</h2><p>${escape(r.next)}</p><small>${escape(r.scope)}</small></html>`;
 return new Blob([html],{type:'text/html;charset=utf-8'});
}
