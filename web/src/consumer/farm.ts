import type { AppState } from './model.ts';
import { earn } from './model.ts';
export type Flower = 'rose' | 'lavender' | 'camellia';
export type Crop = { flower: Flower; plantedAt: number; watered: boolean };
export type Farm = {
  version: 1; plots: (Crop | null)[]; water: number; harvested: number;
  collection: Record<Flower, number>; day: string; dailyLeaves: number;
  tasks: { check: string[]; learn: string[] }; lastNow: number;
};
export const flowers = [
  { id: 'rose' as const, name: '玫瑰', tone: '#bd4257', seconds: 45, leaves: 2, unlock: 0, note: '一抹玫瑰红' },
  { id: 'lavender' as const, name: '薰衣草', tone: '#8c78ad', seconds: 75, leaves: 3, unlock: 0, note: '温柔雾紫调' },
  { id: 'camellia' as const, name: '山茶花', tone: '#cc8b72', seconds: 120, leaves: 5, unlock: 4, note: '奶油白花瓣' },
];
export const farmDay = (now: number) => new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
export function newFarm(now = Date.now()): Farm {
  return { version: 1, plots: [{flower:'rose',plantedAt:now,watered:false}, {flower:'lavender',plantedAt:now,watered:false}, null, null], water:6, harvested:0, collection:{rose:0,lavender:0,camellia:0}, day:farmDay(now), dailyLeaves:0, tasks:{check:[],learn:[]}, lastNow:now };
}
export function syncFarm(farm: Farm | undefined, now = Date.now()): Farm {
  if (!farm || farm.version !== 1) return newFarm(now);
  const time = Math.max(now, farm.lastNow), day = farmDay(time);
  if (day > farm.day) return {...farm, day, water:Math.min(24,farm.water+6), dailyLeaves:0, tasks:{check:[],learn:[]},lastNow:time};
  return {...farm,lastNow:time};
}
export function growth(crop: Crop | null, now: number) {
  if (!crop) return 0;
  const duration = flowers.find(f=>f.id===crop.flower)!.seconds * 1000;
  return Math.min(1, Math.max(0,(now-crop.plantedAt+(crop.watered?30_000:0))/duration));
}
export function remaining(crop: Crop | null, now: number) {
  if (!crop) return 0;
  return Math.ceil((1-growth(crop,now))*flowers.find(f=>f.id===crop.flower)!.seconds);
}
export type FarmAction = {type:'plant';plot:number;flower:Flower} | {type:'water'|'harvest';plot:number};
export function actFarm(state: AppState, action: FarmAction, now=Date.now()): AppState {
  const farm=syncFarm(state.farm,now), time=farm.lastNow;
  if (!Number.isInteger(action.plot)||action.plot<0||action.plot>=farm.plots.length) return state;
  const crop=farm.plots[action.plot], plots=[...farm.plots];
  if(action.type==='plant') {
    const spec=flowers.find(f=>f.id===action.flower);
    if(crop||!spec||farm.harvested<spec.unlock) return state;
    plots[action.plot]={flower:spec.id,plantedAt:time,watered:false};
    return {...state,farm:{...farm,plots}};
  }
  if(!crop) return state;
  if(action.type==='water') {
    if(crop.watered||farm.water<1||growth(crop,time)>=1)return state;
    plots[action.plot]={...crop,watered:true};
    return {...state,farm:{...farm,plots,water:farm.water-1}};
  }
  if(growth(crop,time)<1)return state;
  const spec=flowers.find(f=>f.id===crop.flower)!, reward=Math.min(spec.leaves,Math.max(0,20-farm.dailyLeaves));
  plots[action.plot]=null;
  return {...state, farm:{...farm,plots,harvested:farm.harvested+1,dailyLeaves:farm.dailyLeaves+reward,collection:{...farm.collection,[crop.flower]:farm.collection[crop.flower]+1}},social:reward?earn(state.social,`garden-${farm.harvested+1}`,`${spec.name}收获`,reward):state.social};
}
export function nourish(state: AppState, kind:'check'|'learn', event:string, now=Date.now()):AppState {
  const farm=syncFarm(state.farm,now),done=farm.tasks[kind],cap=kind==='check'?3:2;
  if(done.includes(event)||done.length>=cap)return {...state,farm};
  return {...state,farm:{...farm,water:Math.min(24,farm.water+2),tasks:{...farm.tasks,[kind]:[...done,event]}}};
}
// Content identity for daily duplicate-reward prevention, never used as an authenticity score.
export function contentKey(value:string) {
  let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(36);
}
