import { useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { createGarden } from './gardenScene';
import { flowers, growth, type Farm } from './farm';
export default function GardenView({farm,selected=-1,onSelect,compact=false,motion=true,effect}:{farm:Farm;selected?:number;onSelect?:(i:number)=>void;compact?:boolean;motion?:boolean;effect?:{type:string;plot:number;id:number}}) {
  const host=useRef<HTMLDivElement>(null),engine=useRef<ReturnType<typeof createGarden>|null>(null),callback=useRef(onSelect),[failed,setFailed]=useState(false);
  callback.current=onSelect;
  useEffect(()=>{
    if(!host.current)return;let scene:ReturnType<typeof createGarden>|null=null;
    const loss=()=>{setFailed(true);scene?.dispose();engine.current=null;scene=null;};
    host.current.addEventListener('garden-context-lost',loss);
    try{scene=createGarden(host.current,i=>callback.current?.(i),compact,motion&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches);engine.current=scene;scene.update(farm,selected);}catch{setFailed(true);}
    return()=>{host.current?.removeEventListener('garden-context-lost',loss);scene?.dispose();engine.current=null;};
  },[compact,motion]);
  useEffect(()=>{engine.current?.update(farm,selected);const timer=setInterval(()=>engine.current?.update(farm,selected),1000);return()=>clearInterval(timer);},[farm,selected]);
  useEffect(()=>{if(effect)engine.current?.effect(effect.type,effect.plot);},[effect]);
  return <div className={'garden-view '+(compact?'compact':'')}>
    <div ref={host} className="garden-canvas" />
    {failed&&<div className="garden-fallback"><p>当前设备用简洁花圃，照样能种花</p><div>{farm.plots.map((p,i)=><button key={i} onClick={()=>onSelect?.(i)}>{p?(growth(p,Date.now())===1?'🌸':'🌱'):'＋'}<small>{i+1}号 · {p?flowers.find(f=>f.id===p.flower)!.name:'空花圃'}</small></button>)}</div></div>}
    {!compact&&!failed&&<><span className="garden-gesture">拖动转一转 · 点花圃照顾</span><div className="garden-camera"><button aria-label="拉近花园" onClick={()=>engine.current?.view('in')}><Plus size={16}/></button><button aria-label="拉远花园" onClick={()=>engine.current?.view('out')}><Minus size={16}/></button><button aria-label="还原花园视角" onClick={()=>engine.current?.view('reset')}><Maximize size={15}/></button></div></>}
  </div>;
}
