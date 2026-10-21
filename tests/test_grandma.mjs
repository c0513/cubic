import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseGrandmaCell, isCloseToNPC, nextGrandmaState, planKeyQuest, collectedKey, GRANDMA_REWARD, CHAPTER_REWARD } from '../src/grandma.js';
const world=(x,z)=>{
  if(x===0&&z===0) return {type:'building'};
  if(x===0&&z===-1) return {type:'road'};
  if(x===1&&z===0) return {type:'building'};
  return {type:'grass'};
};
test('grandma never appears without verified destination',()=>assert.equal(chooseGrandmaCell(world,null),null));
test('grandma appears on a walkable game cell next to address',()=>{
  const marker=chooseGrandmaCell(world,[0,0]);
  assert.deepEqual(marker,[0,-1]);
  assert.notEqual(world(...marker).type,'building');
});
test('grandma cannot be placed into fully blocked neighborhood',()=>{
  assert.equal(chooseGrandmaCell(()=>({type:'building'}),[0,0]),null);
});
test('conversation requires proximity and package for delivery',()=>{
  const npc=[4,5];
  const far=nextGrandmaState({},[{op:'talk',x:9,z:9},{op:'deliver',x:9,z:9}],true,[9,9],npc);
  assert.equal(far.talked,false);assert.equal(far.deliveredNow,false);
  const noPackage=nextGrandmaState({},[{op:'talk',x:4,z:4},{op:'deliver',x:4,z:4}],false,[4,4],npc);
  assert.equal(noPackage.talked,true);assert.equal(noPackage.deliveredNow,false);
  const ready=nextGrandmaState({},[{op:'talk',x:4,z:4},{op:'deliver',x:4,z:4}],true,[4,4],npc);
  assert.equal(ready.deliveredNow,true);assert.equal(ready.delivered,true);
  assert.equal(nextGrandmaState({talked:true,delivered:true},[{op:'deliver',x:4,z:4}],true,[4,4],npc).deliveredNow,false);
});
test('player can greet grandma from adjacent walkable cell',()=>{
  assert.equal(isCloseToNPC([4,4],[4,5]),true);
  assert.equal(isCloseToNPC([3,4],[4,5]),false);
});
test('chapter two plans a collectible reachable key after delivery',()=>{
  const pos=planKeyQuest(world,[0,-1],[0,-1]);
  assert.ok(pos);
  assert.notDeepEqual(pos,[0,-1]);
  assert.notEqual(world(...pos).type,'building');
  assert.equal(collectedKey([{op:'collect',x:pos[0],z:pos[1]}],pos),true);
  assert.equal(collectedKey([{op:'move',x:pos[0],z:pos[1]}],pos),false);
});
test('rewards have explicit fixed values',()=>{
  assert.equal(GRANDMA_REWARD,250);assert.equal(CHAPTER_REWARD,200);
});
