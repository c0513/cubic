import test from 'node:test';
import assert from 'node:assert/strict';
import {planStreetQuest,reachableCells,evaluateStreetQuest,streetHint,STREET_QUESTS} from '../src/street-quests.js';
const solid=new Set(['1,1','1,2','1,3','2,1','2,2','2,3']);
const getCell=(x,z)=>({type:solid.has(`${x},${z}`)?'building': z===0?'road':'grass'});
const assertConnected=(start,target)=>{
  const q=reachableCells(getCell,start,11);
  assert.ok(q.some(x=>x.position[0]===target[0]&&x.position[1]===target[1]));
};
test('three quests are present with independent rewards',()=>{
  assert.equal(STREET_QUESTS.length,3);
  assert.equal(STREET_QUESTS.reduce((a,b)=>a+b.reward,0),310);
});
test('first waypoint is reachable road, never a solid building',()=>{
  const q=planStreetQuest(getCell,[0,0],0);
  assert.equal(getCell(...q.target).type,'road');assertConnected([0,0],q.target);
});
test('second waypoint prefers safe square adjacent to a building',()=>{
  const q=planStreetQuest(getCell,[0,0],1);
  assert.equal(q.generic,false); assertConnected([0,0],q.target);
  assert.notEqual(getCell(...q.target).type,'building');
});
test('new destination is different from the previous checkpoint when possible',()=>{
  const first=planStreetQuest(getCell,[0,0],1);
  const second=planStreetQuest(getCell,first.target,2,first.target);
  assert.ok(second);assert.notDeepEqual(first.target,second.target);
});
test('third stage must use collect at the target, not just arrival',()=>{
  const q=planStreetQuest(getCell,[0,0],2);
  assert.equal(evaluateStreetQuest(q,[{op:'move',x:q.target[0],z:q.target[1]}]),false);
  assert.equal(evaluateStreetQuest(q,[{op:'collect',x:q.target[0],z:q.target[1]}]),true);
  assert.equal(evaluateStreetQuest(q,[{op:'collect',x:0,z:0}]),false);
});
test('arrival must include a real move action',()=>{
  const q=planStreetQuest(getCell,[0,0],0);
  assert.equal(evaluateStreetQuest(q,[]),false);
  assert.equal(evaluateStreetQuest(q,[{op:'turn',facing:1}]),false);
  assert.equal(evaluateStreetQuest(q,[{op:'move',x:q.target[0],z:q.target[1]}]),true);
});
test('no fake building claim if only open ground is available',()=>{
  const empty=()=>({type:'grass'});const q=planStreetQuest(empty,[0,0],1);
  assert.equal(q.generic,true);
  assert.ok(streetHint(q,[0,0]).includes('По прямой'));
});
test('blocked map returns no invented reachable destination',()=>{
  const allWall=(x,z)=>({type:x===0&&z===0?'path':'building'});
  assert.equal(planStreetQuest(allWall,[0,0],0),null);
});
