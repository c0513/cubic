import test from 'node:test';
import assert from 'node:assert/strict';
import {panoramaUrl,mapUrl,validCoordinate} from '../src/panorama.js';
import {GeoVoxelGame, toGrid} from '../src/geo.js';

test('panorama URL uses longitude before latitude',()=>{
  const url=new URL(panoramaUrl(55.772087,37.479654));
  assert.equal(url.hostname,'yandex.ru');
  assert.equal(url.searchParams.get('panorama[point]'),'37.479654,55.772087');
});
test('map fallback points to the same coordinate',()=>{
  const url=new URL(mapUrl(55.772087,37.479654));
  assert.equal(url.searchParams.get('ll'),'37.479654,55.772087');
  assert.equal(url.searchParams.get('z'),'17');
});
test('incorrect coordinates rejected',()=>{
  assert.equal(validCoordinate(55.77,37.47),true);
  assert.equal(validCoordinate(NaN,37),false);
  assert.throws(()=>panoramaUrl(100,37),RangeError);
});
test('demo city is walkable and offers streets and buildings',()=>{
  const o=Object.create(GeoVoxelGame.prototype);
  o.spawn=toGrid(55.772087,37.479654);o.geoTiles=new Map();o.dataMode='stylized';o.geoFeatures=[];
  assert.equal(o.cell(...o.spawn).type,'path');
  const types=new Set();for(let x=0;x<20;x++)for(let z=0;z<20;z++)types.add(o.cell(o.spawn[0]+x,o.spawn[1]+z).type);
  assert(types.has('road'));assert(types.has('building'));assert(types.has('path'));
});
