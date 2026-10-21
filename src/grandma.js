/* Chapter progression. Grandma is a fictional NPC drawn near a verified geocoded goal.
   Cells and interactions are game-only and do not assert real entrances or residents. */
import { reachableCells, sameCell, walkable } from './street-quests.js';

export const GRANDMA_REWARD = 250;
export const CHAPTER_REWARD = 200;
export const CHAPTER_NAME = 'Глава 2: Тайна старого двора';

export function isCloseToNPC(player, npc) {
  if(!player || !npc)return false;
  return Math.abs(player[0]-npc[0])+Math.abs(player[1]-npc[1]) <= 1;
}

export function chooseGrandmaCell(getCell, goal, origin=null) {
  if(!goal)return null;
  const [gx,gz]=goal;
  // When a player is nearby, require a route from their actual walkable cell.
  const reachable=origin ? new Set(reachableCells(getCell,origin,25).map(c=>c.position.join(','))) : null;
  if(reachable && walkable(getCell(...origin)))reachable.add(origin.join(','));
  const candidates=[];
  for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
    const x=gx+dx,z=gz+dz, d=Math.abs(dx)+Math.abs(dz);
    if(d>5 || d<1)continue;
    const cell=getCell(x,z);
    if(!walkable(cell)||(reachable&&!reachable.has(`${x},${z}`)))continue;
    const road=cell.type==='road'||cell.type==='path';
    const borderingBuilding=[[0,1],[1,0],[0,-1],[-1,0]].some(([a,b])=>getCell(x+a,z+b)?.type==='building');
    candidates.push({x,z,d,score:d*9-(road?9:0)-(borderingBuilding?5:0)});
  }
  candidates.sort((a,b)=>a.score-b.score||a.x-b.x||a.z-b.z);
  return candidates.length?[candidates[0].x,candidates[0].z]:null;
}

export function nextGrandmaState(state,actions,packageReady,player,npc){
  const result={talked:Boolean(state?.talked),delivered:Boolean(state?.delivered)};
  let greeted=false,deliveredNow=false;
  if(!npc||!Array.isArray(actions))return {...result,greeted,deliveredNow};
  for(const a of actions){
    if(a.op==='talk'&&isCloseToNPC([a.x,a.z],npc)){
      result.talked=true;greeted=true;
    }
    if(a.op==='deliver'&&isCloseToNPC([a.x,a.z],npc)&&result.talked&&packageReady&&!result.delivered){
      result.delivered=true;deliveredNow=true;
    }
  }
  return {...result,greeted,deliveredNow};
}

export function planKeyQuest(getCell,from,grandmaCell){
  if(!from||!grandmaCell)return null;
  const options=reachableCells(getCell,from,11)
    .filter(c=>c.steps>=4&&c.steps<=9&&!sameCell(c.position,grandmaCell))
    .map(c=>({ ...c, score: c.steps + (getCell(...c.position).type==='road'?3:0) }));
  options.sort((a,b)=>b.score-a.score||a.position[0]-b.position[0]||a.position[1]-b.position[1]);
  return options[0]?.position||null;
}

export function collectedKey(actions,target){
  return !!target && Array.isArray(actions)&&actions.some(a=>a.op==='collect'&&sameCell([a.x,a.z],target));
}
