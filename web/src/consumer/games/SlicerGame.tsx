import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight, Check, Heart, Pause, Play, RotateCcw, Sparkles, Scissors, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { useApp } from '../store';
import { art, Icon } from '../ui';
import { uid } from '../model';
import { syncFarm } from '../farm';
import { advance, claims, createRun, cut, CUT_SECONDS, HEIGHT, resultOf, settings, settle, WIDTH, type Claim, type Point, type Result, type Run, type Speed } from './sliceEngine';
import {cheer,cosmeticOf,EFFECT_SECONDS,halfMotion,halfPolygon,impactOf,newSweep,recordSweep,screenPoint,TRAIL_SECONDS,type Impact,type TrailPoint} from './sliceEffects';
import SliceFX from './SliceFX';
import './slicer.css';

function Face({claim}:{claim:Claim}) {
  return <><span className="slice-kind">{claim.kind}</span><img src={art(cosmeticOf(claim))} alt="" draggable={false}/><b>{claim.text}</b></>;
}
type Phase='ready'|'playing'|'paused'|'done';
export default function Slicer() {
  const {state,setState,sheet,tab,open}=useApp();
  const [phase,setPhase]=useState<Phase>('ready'), [speed,setSpeed]=useState<Speed>('easy');
  const [still,setStill]=useState(()=>!state.settings.motion||window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [,render]=useState(0), [hint,setHint]=useState(''), [outcome,setOutcome]=useState<{result:Result;leaves:number;water:number}|null>(null);
  const run=useRef<Run|null>(null), arena=useRef<HTMLDivElement>(null), trail=useRef<TrailPoint[]>([]),impacts=useRef<Impact[]>([]);
  const sweep=useRef(newSweep()),cheering=useRef<(ReturnType<typeof cheer>&{at:number;id:number})|null>(null);
  const pointer=useRef<{id:number;point:Point}|null>(null), finished=useRef(''),audio=useRef<AudioContext|null>(null);
  const current=useRef({finish:(_result:Result)=>{},phase});
  const sound=(good:boolean,combo:number)=>{
    if(!state.settings.sound)return;
    try {
      const ctx=audio.current||(audio.current=new AudioContext());void ctx.resume();
      const time=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=good?'triangle':'sine';osc.frequency.setValueAtTime(good?650+Math.min(combo,10)*75:210,time);osc.frequency.exponentialRampToValueAtTime(good?1300:110,time+.13);
      gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.045,time+.008);gain.gain.exponentialRampToValueAtTime(.0001,time+.19);
      osc.connect(gain).connect(ctx.destination);osc.start(time);osc.stop(time+.2);osc.onended=()=>{osc.disconnect();gain.disconnect();};
      const noise=ctx.createBufferSource(),buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.12),ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
      noise.buffer=buffer;const filter=ctx.createBiquadFilter(),air=ctx.createGain();filter.type='bandpass';filter.frequency.setValueAtTime(2200,time);filter.frequency.exponentialRampToValueAtTime(450,time+.1);air.gain.value=.06;
      noise.connect(filter).connect(air).connect(ctx.destination);noise.start(time);noise.onended=()=>{noise.disconnect();filter.disconnect();air.disconnect();};
    }catch{}
  };
  useEffect(()=>()=>{void audio.current?.close();},[]);
  current.current={phase,finish:(result)=>{
    if(finished.current===result.id)return;
    finished.current=result.id;
    const now=Date.now(), next=settle(state,result,now), before=syncFarm(state.farm,now);
    setState(s=>settle(s,result,now));
    setOutcome({result,leaves:next.social.leaves-state.social.leaves,water:(next.farm?.water||before.water)-before.water});
    setPhase('done');pointer.current=null;trail.current=[];
    arena.current?.closest('.main-scroll')?.scrollTo(0,0);
  }};
  const pause=()=>{pointer.current=null;trail.current=[];sweep.current=newSweep();setPhase(p=>p==='playing'?'paused':p);};
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)pause();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('blur',pause);
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',pause);};
  },[]);
  useEffect(()=>{if(sheet)pause();},[sheet]);
  useEffect(()=>{if(tab!=='游乐场')pause();},[tab]);
  useEffect(()=>{
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{if(!state.settings.motion||reduced.matches)setStill(true);};
    update();reduced.addEventListener('change',update);
    return()=>reduced.removeEventListener('change',update);
  },[state.settings.motion]);
  useEffect(()=>{
    if(phase!=='playing')return;
    let frame=0, previous=performance.now();
    const tick=(now:number)=>{
      const game=run.current;if(!game)return;
      advance(game,(now-previous)/1000,still);previous=now;
      trail.current=trail.current.filter(p=>game.elapsed-p.at<TRAIL_SECONDS);
      impacts.current=impacts.current.filter(p=>game.elapsed-p.at<EFFECT_SECONDS);
      render(n=>n+1);
      if(game.ended)current.current.finish(resultOf(game));
      else frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[phase,still]);
  const start=()=>{
    run.current=createRun(uid(),speed);finished.current='';setOutcome(null);setHint('切掉有问题的说法，合理的别切');
    pointer.current=null;trail.current=[];impacts.current=[];sweep.current=newSweep();cheering.current=null;setPhase('playing');
    if(state.settings.sound){try{audio.current ||= new AudioContext();void audio.current.resume();}catch{}}
    requestAnimationFrame(()=>{arena.current?.closest('.main-scroll')?.scrollTo(0,0);arena.current?.focus({preventScroll:true});});
  };
  const slice=(from:Point,to:Point)=>{
    const game=run.current;if(!game||current.current.phase!=='playing')return;
    const hits=cut(game,from,to);
    if(hits.length){
      const last=hits[hits.length-1];
      sweep.current=recordSweep(sweep.current,hits,game.elapsed);
      impacts.current=[...impacts.current,...hits.map(t=>impactOf(t,game.elapsed,game.combo))].slice(-8);
      const message=cheer(game.combo,sweep.current,last.claim.cut);
      cheering.current={...message,at:game.elapsed,id:last.id};
      setHint(message.title+' · '+message.detail);
      sound(message.tone!=='wrong',game.combo);
      if(state.settings.haptics)navigator.vibrate?.(message.tone==='wrong'?[25,25,20]:sweep.current.count>1?[12,15,20]:12);
    }
    trail.current=[...trail.current,{...to,at:game.elapsed}].slice(-36);
    render(n=>n+1);
    if(game.ended)current.current.finish(resultOf(game));
  };
  const point=(event:PointerEvent<HTMLDivElement>):Point|null=>{
    const rect=event.currentTarget.getBoundingClientRect();
    return screenPoint({x:event.clientX,y:event.clientY},rect);
  };
  const down=(event:PointerEvent<HTMLDivElement>)=>{
    if(phase!=='playing'||!event.isPrimary||event.button!==0||pointer.current)return;
    const p=point(event);if(!p)return;
    event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current={id:event.pointerId,point:p};sweep.current=newSweep();trail.current=[{...p,at:run.current?.elapsed||0}];slice(p,p);
  };
  const move=(event:PointerEvent<HTMLDivElement>)=>{
    if(!pointer.current||pointer.current.id!==event.pointerId)return;
    event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();
    const samples=event.nativeEvent.getCoalescedEvents?.()||[];
    for(const sample of [...samples,event.nativeEvent]){
      const p=screenPoint({x:sample.clientX,y:sample.clientY},rect);if(!p||!pointer.current)continue;
      slice(pointer.current.point,p);if(pointer.current)pointer.current.point=p;
    }
  };
  const stop=(event:PointerEvent<HTMLDivElement>)=>{if(pointer.current?.id===event.pointerId)pointer.current=null;};
  const up=(event:PointerEvent<HTMLDivElement>)=>{if(pointer.current?.id!==event.pointerId)return;const p=point(event);if(p)slice(pointer.current.point,p);stop(event);};
  const game=run.current, active=phase==='playing'||phase==='paused';
  const latest=impacts.current.at(-1),impactAge=game&&latest?game.elapsed-latest.at:99;
  const shake=!still&&impactAge<.22?Math.sin(impactAge*95)*(1-impactAge/.22)*(latest?.good?3:5):0;
  const cheerNow=game&&cheering.current&&game.elapsed-cheering.current.at<1.55?cheering.current:null;
  const toggleSound=()=>setState(s=>({...s,settings:{...s.settings,sound:!s.settings.sound}}));
  const bonus=!state.social.rewards.includes('slicer-v1')?'首通 +10 叶子':syncFarm(state.farm).tasks.learn.length<2&&syncFarm(state.farm).water<24?'通关 +2 水滴':'挑战新纪录';
  return <section className={'slicer '+(still?'slice-still':'')} aria-label="真假切切看">
    {phase==='ready'&&<>
      <div className="slice-poster">
        <div className="slice-eyebrow"><span>BEAUTY ARCADE / 01</span><Sparkles size={15}/></div>
        <h2>真假<span>切切看<i>!</i></span></h2>
        <p>划掉夸张种草</p>
        <span className="slice-poster-label"><Scissors size={13}/> 一刀双切 · 化妆品飞出</span>
        <div className="slice-demo slice-demo-bad"><Face claim={claims[0]}/><span className="slice-example-tag">切掉它</span></div>
        <div className="slice-demo slice-demo-good"><Face claim={claims[12]}/><span className="slice-example-tag">放过它</span></div>
        <svg className="slice-poster-swipe" viewBox="0 0 360 320" aria-hidden="true"><path d="M30 290 Q80 200 211 187 T325 90"/><path d="m311 96 14-6-4 15"/></svg>
        <span className="slice-poster-star">✦</span>
      </div>
      <div className="slice-setup">
        <div className="slice-speed" aria-label="游戏速度">{(['easy','rush'] as Speed[]).map(s=><button key={s} aria-pressed={speed===s} onClick={()=>setSpeed(s)}><b>{settings[s].title}</b><small>{settings[s].seconds} 秒{s==='easy'?' · 慢慢看':' · 更快抛出'}</small></button>)}</div>
        <div className="slice-goal"><span><Heart size={14}/> 3 颗心</span><span>80 分且切对 6 张通关</span></div>
        <button className="slice-start" onClick={start}><Play size={18} fill="currentColor"/><b>开切！</b><span>{bonus}</span></button>
        <label className="slice-still-toggle"><input type="checkbox" checked={still} onChange={e=>setStill(e.target.checked)}/> 减少动态 · 卡片停在原位</label>
        <button className="slice-sound-toggle" aria-pressed={state.settings.sound} onClick={toggleSound}>{state.settings.sound?<Volume2 size={15}/>:<VolumeX size={15}/>}刀光音效 · {state.settings.sound?'已开启':'点击开启'}</button>
      </div>
    </>}
    {active&&<>
      <div className="slice-game-title"><h2>真假切切看</h2><div><button onClick={toggleSound} aria-label={state.settings.sound?'关闭游戏音效':'开启游戏音效'}>{state.settings.sound?<Volume2 size={18}/>:<VolumeX size={18}/>}</button><button onClick={pause} aria-label="暂停游戏"><Pause size={19}/></button></div></div>
      <div className="slice-hud">
        <div><small>得分</small><b key={`${game?.hits}-${game?.hearts}`} className={!still&&game?.hits?'slice-score-bump':''}>{game?.score||0}<em> / 80</em></b></div>
        <div className="slice-timer"><small>剩余</small><b>{Math.ceil(settings[speed].seconds-(game?.elapsed||0))}<em>秒</em></b></div>
        <div className="slice-hearts" aria-label={`剩余 ${game?.hearts} 颗心`}>{[1,2,3].map(i=><Heart key={i} size={19} fill={i<=(game?.hearts||0)?'currentColor':'none'} className={i>(game?.hearts||0)?'empty':''}/>)}</div>
      </div>
      <div className="slice-time-track"><i style={{width:`${100*(1-(game?.elapsed||0)/settings[speed].seconds)}%`}}/></div>
      <div className={'slice-arena '+((game?.combo||0)>=5?'slice-fever':'')} ref={arena} tabIndex={0} role="group" aria-label="切切看游戏区，划过卡片切开；也可按1切左边、2切右边，空格暂停"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={stop} onLostPointerCapture={stop}
        onKeyDown={e=>{
          if(e.target!==e.currentTarget)return;
          if(e.key===' '||e.key==='Escape'){e.preventDefault();pause();return;}
          if(phase==='playing'&&['1','2'].includes(e.key)){
            e.preventDefault();const t=game?.targets.find(t=>t.lane===Number(e.key)-1&&t.cutAt===undefined&&t.born<game.elapsed&&t.y<HEIGHT-25);
            if(t){sweep.current=newSweep();slice(t,t);}
          }
        }}>
        <div className="slice-field-label"><span>美妆练习题</span><span className={(game?.combo||0)>1?'slice-streak':''}>{(game?.combo||0)>1?`${game?.combo} 连击 ✦`:'合理的说法别切'}</span></div>
        <div className="slice-scene" style={{transform:`translate(${shake}px,${-shake*.45}px)`}}>
        <div className="slice-field-orbit" aria-hidden="true"/>
        <div className="slice-field-floor" aria-hidden="true"><Scissors size={26}/><span>SWIPE TO SLICE</span></div>
        {game?.targets.filter(t=>t.born<=game.elapsed).map(t=>{
          const isCut=t.cutAt!==undefined, age=isCut?game.elapsed-t.cutAt!:0;
          return <div className={'slice-target '+(isCut?'is-cut ':'')+(isCut&&!t.claim.cut?'slice-wrong':'')} key={t.id}
            style={{left:`${t.x/WIDTH*100}%`,top:`${t.y/HEIGHT*100}%`,transform:`translate(-50%,-50%) rotate(${still?0:t.angle}deg)`}}>
            {!isCut?<button tabIndex={phase==='playing'?0:-1} aria-label={`切开：${t.claim.text.replace('\n','，')}`} onClick={e=>{if(e.detail===0){sweep.current=newSweep();slice(t,t);}}}><Face claim={t.claim}/></button>:<>
              {[0,1].map(side=><div className={'slice-half half-'+side} key={side} style={{clipPath:halfPolygon((t.cutAngle||0)-t.angle,side),transform:still?'none':halfMotion((t.cutAngle||0)-t.angle,side,age),opacity:Math.max(0,1-age/CUT_SECONDS)}}><Face claim={t.claim}/></div>)}
            </>}
          </div>;
        })}
        </div>
        <SliceFX time={game?.elapsed||0} trail={trail.current} impacts={impacts.current} still={still} combo={game?.combo||0}/>
        {cheerNow&&<div key={`${cheerNow.id}-${cheerNow.title}`} className={'slice-cheer '+cheerNow.tone} aria-hidden="true"><b>{cheerNow.title}</b><span>{cheerNow.detail}</span></div>}
        {phase==='paused'&&<div className="slice-pause"><span><Pause size={25}/></span><h3>歇一下，手感还在</h3><p>计时已暂停</p><button className="slice-start" onClick={()=>setPhase('playing')}><Play size={17}/>继续切</button><button className="slice-reset" onClick={()=>{setPhase('ready');run.current=null;}}>重新选一局</button></div>}
      </div>
      <div className="slice-live-note" role="status">{hint}</div>
      <div className="slice-controls"><span>滑动 / 点一下都能切</span><span>{(game?.hits||0)>=6&&(game?.score||0)>=80?'目标达成，守住 ♥':`已切对 ${game?.hits||0} / 6 张`}</span></div>
    </>}
    {phase==='done'&&outcome&&<>
      <div className="slice-result">
        <div className="slice-result-medal">{outcome.result.passed?<Trophy size={32}/>:<Scissors size={32}/>}</div>
        <span className="slice-eyebrow">{outcome.result.passed?'漂亮，这局通关！':'手感有了，再来一局'}</span>
        <strong>{outcome.result.score}<small>分</small></strong>
        <div className="slice-result-stats"><span>切对 <b>{outcome.result.hits}</b> 张</span><span>最高 <b>{outcome.result.bestCombo}</b> 连击</span><span>纪录 <b>{state.slicerBest||0}</b></span></div>
        <p>{outcome.result.passed?(outcome.leaves||outcome.water?`已收好${outcome.leaves?` ${outcome.leaves} 片叶子`:''}${outcome.water?` · ${outcome.water} 滴水`:''}`:'本局无额外奖励，继续冲新纪录'):'保住一颗心，80 分且切对 6 张就能通关'}</p>
        <button className="slice-start" onClick={start}><RotateCcw size={17}/>再切一局</button>
        <button className="slice-reset" onClick={()=>setPhase('ready')}>换个速度</button>
      </div>
      {outcome.result.reviews.length>0&&<div className="slice-review"><h3>这几刀，长知识了 <Sparkles size={16}/></h3>
        {outcome.result.reviews.filter((v,i,all)=>all.findIndex(a=>a.claim.id===v.claim.id)===i).sort((a,b)=>Number(a.correct)-Number(b.correct)).map((review,index)=><details key={review.claim.id} open={index<2}>
          <summary><span className={review.correct?'review-right':'review-wrong'}>{review.correct?<Check size={14}/>:<X size={14}/>}</span><b>{review.claim.text.replace('\n','，')}</b><small>{review.correct?'切对了':review.action==='miss'?'漏切了':'误切了'}</small></summary>
          <p>{review.claim.why}</p>
        </details>)}
        <small className="slice-example-note">本关是编写的美妆练习题，不是真实帖子的鉴定结果。</small>
      </div>}
      {outcome.result.passed&&<button className="slice-farm" onClick={()=>open('farm')}><Icon name="leaf" size={28}/><span>去花园浇浇花</span><ArrowUpRight size={17}/></button>}
    </>}
  </section>;
}
