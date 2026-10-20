import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowUpRight, Droplets } from 'lucide-react';
import { useApp } from './store';
import { growth, syncFarm } from './farm';
const GardenView=lazy(()=>import('./GardenView'));
export default function Growth(){
  const {state,open,sheet}=useApp(),[now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const farm=syncFarm(state.farm,now),ready=farm.plots.filter(p=>p&&growth(p,Math.max(now,farm.lastNow))===1).length;
  return <section className="garden-home"><div className="section-heading"><h2>我的美妆花园</h2><span>第 {Math.floor(farm.harvested/12)+1} 季</span></div>
    <div className="garden-preview-card"><div className="garden-preview-top"><span>BEAUTY IN BLOOM</span><span><Droplets size={13}/> {farm.water}</span></div>
    <button className="garden-open" aria-label="进入美妆花园" onClick={()=>open('farm')}>
      {!sheet&&<Suspense fallback={<div className="garden-loading">花园正在苏醒…</div>}><GardenView compact farm={farm} motion={state.settings.motion}/></Suspense>}
      {sheet&&<div className="garden-loading">美妆花园</div>}
    </button>
    <button className="garden-preview-bottom" onClick={()=>open('farm')}><div><b>{ready?`${ready} 块花圃开花啦`:'种点喜欢，等花开'}</b><small>{ready?'收下小叶子，再种一轮':'查种草、玩小游戏，为花园添水滴'}</small></div><span>{ready?'去收获':'照顾花园'} <ArrowUpRight size={15}/></span></button>
    </div></section>;
}
