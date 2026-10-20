import { useEffect, useState } from 'react';
import { Droplets, Leaf, ArrowUpRight, Flower2, Check, LockKeyhole } from 'lucide-react';
import { useApp } from './store';
import { Sheet } from './ui';
import GardenView from './GardenView';
import { actFarm, flowers, growth, remaining, syncFarm, type Flower, type FarmAction } from './farm';
export default function Garden(){
  const app=useApp(),[selected,setSelected]=useState(0),[seed,setSeed]=useState<Flower>('rose'),[now,setNow]=useState(Date.now()),[effect,setEffect]=useState<{type:string;plot:number;id:number}>();
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const farm=syncFarm(app.state.farm,now),crop=farm.plots[selected],spec=flowers.find(f=>f.id===(crop?.flower||seed))!,time=Math.max(now,farm.lastNow),ready=!!crop&&growth(crop,time)===1;
  const act=(action:FarmAction)=>{
    app.setState(s=>actFarm(s,action));setEffect({type:action.type,plot:selected,id:Date.now()});app.feedback();
    app.setNotice(action.type==='harvest'?(farm.dailyLeaves<20?`${spec.name}收好啦 · +${Math.min(spec.leaves,20-farm.dailyLeaves)} 小叶子`:`${spec.name}已加入花册`):action.type==='water'?'喝饱水啦，提前 30 秒开花':`${spec.name}种下啦`);
  };
  const go=(type:'check'|'learn')=>{if(type==='check')app.open('smart');else{app.setSheet(null);app.setTab('游乐场');}};
  return <Sheet title="我的美妆花园"><div className="garden-sheet">
    <header className="garden-title"><div><small>BEAUTY IN BLOOM · 第 {Math.floor(farm.harvested/12)+1} 季</small><h2>{farm.harvested<4?'从一朵喜欢开始':'你的花园，又长大了'}</h2></div><button onClick={()=>app.open('wallet')} aria-label="查看小叶子"><Leaf size={16}/>{app.state.social.leaves}</button></header>
    <GardenView farm={farm} selected={selected} onSelect={setSelected} motion={app.state.settings.motion} effect={effect}/>
    <div className="garden-plot-tabs" aria-label="选择花圃">{farm.plots.map((p,i)=><button key={i} aria-pressed={selected===i} onClick={()=>setSelected(i)}><span>{i+1}号花圃</span><b>{p?(growth(p,time)===1?'可收获':flowers.find(f=>f.id===p.flower)!.name):'待播种'}</b>{p&&growth(p,time)===1&&<i/>}</button>)}</div>
    <section className="garden-care"><div className="garden-care-heading"><div><span>{selected+1}号花圃</span><h3>{!crop?'今天种什么？':ready?`${spec.name}开好啦`:`${spec.name}正在长大`}</h3></div><span className="water-count"><Droplets size={16}/>{farm.water} 水滴</span></div>
    {!crop?<><div className="garden-seeds">{flowers.map(f=><button key={f.id} aria-pressed={seed===f.id} disabled={farm.harvested<f.unlock} onClick={()=>setSeed(f.id)} style={{'--flower-tone':f.tone} as React.CSSProperties}><Flower2 size={27}/><b>{f.name}</b><small>{farm.harvested<f.unlock?<><LockKeyhole size={10}/>收获 {f.unlock} 次解锁</>:`${f.seconds} 秒 · +${f.leaves} 叶子`}</small></button>)}</div><button className="primary" onClick={()=>act({type:'plant',plot:selected,flower:seed})}>种下{spec.name}<span className="button-detail">种子免费</span></button></>:
    <><div className="garden-progress"><i style={{width:`${growth(crop,time)*100}%`}}/></div><div className="garden-countdown"><span>{ready?'花朵会一直等你来收':'还要 '+remaining(crop,time)+' 秒'}</span><span>{crop.watered?'已浇水 · 提前开花':`收获 +${spec.leaves} 小叶子`}</span></div><button className="primary" disabled={!ready&&(crop.watered||farm.water<1)} onClick={()=>act({type:ready?'harvest':'water',plot:selected})}>{ready?<><Flower2 size={19}/>收获{spec.name}</>:crop.watered?<><Check size={18}/>已浇水，等花开</>:farm.water<1?'水滴用完啦，去下方补充':<><Droplets size={18}/>浇一点水<span className="button-detail">−1 水滴 · 快 30 秒</span></>}</button></>}
    </section>
    <section className="garden-tasks"><div className="section-heading"><h3>给花园添点水</h3><span>每天自动补 6 滴</span></div>{[{id:'check' as const,name:'查一份种草',detail:'不同内容 · 每天 3 次',cap:3},{id:'learn' as const,name:'玩一关鉴真',detail:'完成一关 · 每天 2 次',cap:2}].map(t=><button key={t.id} onClick={()=>go(t.id)}><span className="task-glyph">{t.id==='check'?'01':'02'}</span><div><b>{t.name}</b><small>{t.detail}</small></div><span>{farm.tasks[t.id].length}/{t.cap}<strong>+2 水滴</strong></span><ArrowUpRight size={16}/></button>)}</section>
    <section className="garden-collection"><div className="section-heading"><h3>我的花册</h3><span>已收获 {farm.harvested} 次</span></div><div>{flowers.map(f=><article key={f.id} style={{color:f.tone}}><Flower2 size={25}/><b>{f.name}</b><small>{farm.collection[f.id]} 朵</small></article>)}</div><p>收获后可反复种植 · 今日花园叶子 {farm.dailyLeaves}/20<br/>达到上限仍可收花，水滴最多存 24 滴</p></section>
  </div></Sheet>;
}
