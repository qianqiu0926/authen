import {useState} from 'react';
import {ArrowUpRight, ChevronDown, ShoppingBag, X} from 'lucide-react';
import {catalog, reportProducts} from '../../products.mjs';
import type {Report} from '../types';
import {useApp} from './store';
import {art} from './ui';
import './products.css';

function ProductPhoto({src,name,icon}:{src?:string;name:string;icon:string}) {
  const [failed,setFailed]=useState(false);
  return <div className="product-photo">{src&&!failed ? <img src={src} alt={name+' · 官网图片'} referrerPolicy="no-referrer" loading="lazy" onError={()=>setFailed(true)}/> : <img className="product-placeholder" src={art(icon)} alt=""/>}</div>;
}

export default function ProductCard({report}:{report:Report}) {
  const {setState,open,setSupplement}=useApp();
  const [editing,setEditing]=useState(false),[selection,setSelection]=useState('');
  const items=reportProducts(report);
  const save=(ids:string[])=>setState(s=>({...s,reports:s.reports.map(r=>r.id===report.id?{...r,productChoices:ids}:r)}));
  const confirm=(id:string)=>setState(s=>({...s,reports:s.reports.map(r=>r.id===report.id?{...r,productConfirmed:[...new Set([...(r.productConfirmed||[]),id])]}:r)}));
  if(report.sample) return null;
  if(!items.length) return report.productChoices !== undefined ? <button className="product-restore" onClick={()=>setState(s=>({...s,reports:s.reports.map(r=>r.id===report.id?{...r,productChoices:undefined}:r)}))}>已隐藏产品 · 重新识别</button> : null;
  return <section id={'products-'+report.id} className="product-section" aria-label="这次提到的产品">
    <div className="product-heading"><div><span>BEAUTY NOTES</span><h3>这次提到的产品</h3></div><ShoppingBag size={23}/></div>
    {items.map(item=>{
      const p=item.product,b=item.brand;
      return <article className={'product-note '+(p?.tone||'rose')} key={item.id}>
        <div className="product-topline"><span>欧莱雅旗下品牌</span><button aria-label={'隐藏'+(p?.name||b.name)} onClick={()=>save(items.filter(i=>i.id!==item.id).map(i=>i.id))}><X size={15}/></button></div>
        <div className="product-identity">
          <ProductPhoto key={item.id} src={p?.image} name={p?.name||b.name} icon={p?.icon||'icon-box'}/>
          <div><small>{b.english}</small><h4>{p?.name||b.name}</h4><p>{p ? p.edition+' · '+(item.needsConfirm?'先确认是不是这款':'产品资料') : '品牌已认出 · 具体款式还没确认'}</p></div>
        </div>
        {item.needsConfirm ? <div className="product-confirm"><p>你说的“{item.quote}”，是这款吗？</p><button onClick={()=>confirm(item.id)}>是这款，看看资料</button></div> : <>
          {p ? <>
            <p className="product-short">{p.facts[0].text}</p>
            <details className="product-facts"><summary>买前做点功课 <ChevronDown size={15}/></summary>
              <p className="product-fullname">{p.officialName}</p>
              {p.facts.slice(1).map(f=><div key={f.label}><b>{f.label}</b><p>{f.text}</p></div>)}
              <div><b>这点别误会</b><p>{p.check}</p></div>
              <a href={p.url} target="_blank" rel="noopener noreferrer">查看官网原文 <ArrowUpRight size={14}/></a>
              <small>官网资料整理于 {catalog.checkedAt} · 实际效果因人而异</small>
            </details>
          </> : <>{item.quote!=='你选择的产品'&&<p className="product-short">内容里提到：{item.quote}</p>}<p className="product-short">{b.hint}</p></>}
          <div className="product-links">
            <a className="product-buy" href={p?.buyURL||p?.url||b.url} target="_blank" rel="noopener noreferrer">{p?.buyLabel||(b.id==='ysl'?'去官网找这款':'查看品牌官网')} <ArrowUpRight size={16}/></a>
            {b.channels&&<a className="product-channel" href={b.channels} target="_blank" rel="noopener noreferrer">查官方渠道 ↗</a>}
          </div>
          <small className="product-link-note">{p?.buyNote||'在品牌页面确认款式；价格、库存和售后以商家页面为准。'}</small>
          {p?.buyURL&&<a className="product-source" href={p.buySource} target="_blank" rel="noopener noreferrer">购买链接来源：品牌官网 ↗</a>}
        </>}
      </article>;
    })}
    <div className="product-tools"><button onClick={()=>setEditing(!editing)}>{editing?'收起修改':'不是这款？改一下'}</button><button onClick={()=>{setSupplement(report);open('smart');}}>补产品名 / 包装图</button></div>
    {editing&&<div className="product-edit">
      <label htmlFor={'product-choice-'+report.id}>换成你提到的产品</label>
      <select id={'product-choice-'+report.id} value={selection} onChange={e=>setSelection(e.target.value)}><option value="">选择产品或品牌</option>{catalog.products.map(p=><option key={p.id} value={p.id}>{catalog.brands.find(b=>b.id===p.brand)?.name} · {p.name} · {p.edition}</option>)}{catalog.brands.map(b=><option key={b.id} value={'brand:'+b.id}>{b.name} · 只看品牌</option>)}</select>
      <div><button disabled={!selection} onClick={()=>{save([selection]);confirm(selection);setEditing(false);}}>确认修改</button><button onClick={()=>{save([]);setEditing(false);}}>都不是，隐藏</button></div>
    </div>}
    <p className="product-boundary">这里方便你查产品、找渠道；不代表原帖商品或店铺已验真。</p>
  </section>;
}
