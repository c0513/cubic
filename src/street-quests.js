// Game-only city challenges. Waypoints are generated on walkable map cells; they are
// NOT claims about real shops, entrances, residents, or deliveries at an address.
export const STREET_QUESTS = Object.freeze([
  {id:'street',icon:'🚶',name:'Первый городской ориентир',reward:60,
   story:'Найди голубой маяк у улицы. Твой герой идёт туда только по твоему Python-коду.',
   command:'move_forward() · turn_left() · turn_right()',
   hint:'Смотри на голубой маяк в мире и на мини-карте. Сначала повернись в нужную сторону, а затем двигайся по одной клетке.'},
  {id:'door',icon:'🏢',name:'Отыщи проход во дворе',reward:100,
   story:'Подойди к золотому маркеру рядом со зданием. Сквозь стены проходить нельзя.',
   command:'front_is_clear() · if · move_forward()',
   hint:'Проверяй путь с помощью if front_is_clear(): и обходи непроходимые клетки поворотами.'},
  {id:'package',icon:'📦',name:'Посылка для бабушки',reward:150,
   story:'Найди зелёную посылку возле квартала и подними её командой collect(). Это игровой предмет, а не реальная доставка.',
   command:'move_forward() · collect()',
   hint:'Сначала дойди до зелёной коробки. Когда Данчезавр стоит на её клетке, отдельно запусти collect().' }
]);
const MOVES=[[1,0],[0,1],[-1,0],[0,-1]];
const k=([x,z])=>`${x},${z}`;
export const sameCell=(a,b)=>!!a&&!!b&&a[0]===b[0]&&a[1]===b[1];
export function walkable(cell){return cell && cell.type!=='building'&&cell.type!=='water';}
export function adjacentBuilding(getCell,x,z){return MOVES.some(([dx,dz])=>getCell(x+dx,z+dz).type==='building');}
export function reachableCells(getCell,start,maxSteps=12){
  if(!walkable(getCell(...start)))return [];
  const q=[{position:[...start],steps:0}],seen=new Set([k(start)]);
  for(let i=0;i<q.length;i++){
    const {position:[x,z],steps}=q[i];if(steps>=maxSteps)continue;
    for(const [dx,dz] of MOVES){
      const p=[x+dx,z+dz],id=k(p);
      if(seen.has(id)||!walkable(getCell(...p)))continue;
      seen.add(id);q.push({position:p,steps:steps+1});
    }
  }
  return q;
}
export function planStreetQuest(getCell,origin,stage,previous=null){
  if(stage>=STREET_QUESTS.length)return null;
  const cells=reachableCells(getCell,origin,11).filter(({steps})=>steps>=2);
  if(!cells.length)return null;
  const tagCandidate=item=>{
    const [x,z]=item.position,c=getCell(x,z);
    const nearBuilding=adjacentBuilding(getCell,x,z);
    const road=c.type==='road'||c.type==='path';
    // Educational route, not literal entrance or official pedestrian-routing data.
    const preferred=stage===0?road:nearBuilding;
    const distinct=previous&&!sameCell(previous,item.position);
    const moved=previous?Math.abs(previous[0]-x)+Math.abs(previous[1]-z):5;
    const score=(preferred?100:0)+(road&&stage===0?10:0)+Math.min(item.steps,7)*2+
      (distinct?8:0)+Math.min(moved,7) - (item.steps>9?14:0);
    return {...item,preferred,nearBuilding,score};
  };
  const ordered=cells.map(tagCandidate).sort((a,b)=>b.score-a.score || a.position[0]-b.position[0] || a.position[1]-b.position[1]);
  const candidate=(previous?ordered.find(item=>!sameCell(item.position,previous)):null)||ordered[0];
  if(!candidate)return null;
  return {stage,target:[...candidate.position],kind:STREET_QUESTS[stage].id,
    // If no building is represented nearby, don't advertise a real doorway.
    generic:stage>0&&!candidate.nearBuilding,
    dataSource:'game-waypoint'};
}
export function evaluateStreetQuest(quest,actions){
  if(!quest||!Array.isArray(actions))return false;
  if(quest.stage===2) return actions.some(a=>a.op==='collect'&&sameCell([a.x,a.z],quest.target));
  return actions.some(a=>a.op==='move'&&sameCell([a.x,a.z],quest.target));
}
export function streetHint(quest,current){
  if(!quest)return 'Нет доступного маршрута. Попробуй сменить участок карты.';
  const [dx,dz]=[quest.target[0]-current[0],quest.target[1]-current[1]];
  const direction=[dz<0?'север':dz>0?'юг':'',dx<0?'запад':dx>0?'восток':''].filter(Boolean).join(' и ')||'ты на клетке задания';
  return `Цель: ${direction}. По прямой ${Math.abs(dx)+Math.abs(dz)} клеток; обходы могут быть длиннее. ${STREET_QUESTS[quest.stage].hint}`;
}
