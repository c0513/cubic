import test from 'node:test';
import assert from 'node:assert/strict';
import {FIRST_JOURNEY,resolveGoal,directionToCell,finishedGoal,metersApart} from '../src/route.js';
import {toGrid,gridToLatLon} from '../src/geo.js';

test('start is the requested Moscow address and is a grid cell',()=>{
  assert.equal(FIRST_JOURNEY.start.lat,55.772087);
  assert.equal(FIRST_JOURNEY.start.lon,37.479654);
  const pos=toGrid(FIRST_JOURNEY.start.lat,FIRST_JOURNEY.start.lon);
  assert.equal(pos.length,2);
  assert.ok(metersApart([55.772087,37.479654],gridToLatLon(...pos))<40);
});
test('compass labels Moscow cardinal map directions',()=>{
  assert.equal(directionToCell(0,0,2,-3),'север + восток');
  assert.equal(directionToCell(3,4,3,4),'Ты у цели!');
});
test('goal is reached with a small entrance radius only',()=>{
  assert.equal(finishedGoal([10,20],[12,18],2),true);
  assert.equal(finishedGoal([10,20],[13,18],2),false);
});
test('geocoding accepts only target building not neighbour',async()=>{
  const fake=async()=>({ok:true,json:async()=>[{
    lat:'55.771258',lon:'37.482714',display_name:'улица Демьяна Бедного, 1к7, Москва'
  },{
    lat:'55.771200',lon:'37.481950',display_name:'Москва, улица Демьяна Бедного, 1к5'
  }]});
  const target=await resolveGoal(fake);
  assert.equal(target.lon,37.48195);
});
test('unverified neighbour alone is rejected',async()=>{
  const fake=async(url)=>url.includes('nominatim')?{ok:true,json:async()=>[{
    lat:'55.771258',lon:'37.482714',display_name:'улица Демьяна Бедного, 1к7, Москва'
  }]}:{ok:true,json:async()=>({elements:[]})};
  await assert.rejects(()=>resolveGoal(fake),/Точные координаты/);
});
