/* Geographically anchored voxel world. All geometry is rendered as original block art.
   Real-world roads and building footprints come from OpenStreetMap/Overpass if available.
   Tutorials, collectibles, bridges, trees and avatar are game objects, NOT real map features. */
import { VoxelGame, Mesh } from './engine.js';

export const GRID_METERS = 32; // EPSG:3857 map metres; ground distance depends on latitude.
const R=6378137, HALF=21, DEG=Math.PI/180;
export function toGrid(lat,lon) {
  const x=R*lon*DEG, y=R*Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*DEG/2));
  return [Math.floor(x/GRID_METERS),Math.floor(-y/GRID_METERS)];
}
export function gridToLatLon(gx,gz) {
  const x=(gx+.5)*GRID_METERS, y=-(gz+.5)*GRID_METERS;
  return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2), x/R/DEG];
}
const local=(v,center)=>v-center;
const key=(x,z)=>`${x},${z}`;
function hash(x,z) {const v=Math.sin(x*12.9898+z*78.233)*43758.5453;return v-Math.floor(v)}
function contains(px,pz,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if(((a[1]>pz)!==(b[1]>pz))&&(px<(b[0]-a[0])*(pz-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
}return inside}
function distSeg(px,pz,a,b){const dx=b[0]-a[0],dz=b[1]-a[1];let t=dx*dx+dz*dz?( (px-a[0])*dx+(pz-a[1])*dz)/(dx*dx+dz*dz):0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-a[0]-t*dx,pz-a[1]-t*dz)}
export function parseOSM(elements){
  return elements.filter(o=>o.type==='way'&&Array.isArray(o.geometry)&&o.geometry.length>1).map(w=>{
    const pts=w.geometry.map(p=>{const [x,z]=toGridFloat(p.lat,p.lon);return [x,z]});
    let type=null;const t=w.tags||{};
    if(t.building&&t.building!=='no')type='building';
    else if(t.natural==='water'||t.waterway==='riverbank'||t.landuse==='reservoir')type='water';
    else if(t.highway)type='road';
    else if(t.leisure==='park'||['forest','grass','meadow','recreation_ground'].includes(t.landuse)||['wood','grassland'].includes(t.natural))type='park';
    if(!type)return null;
    const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]);return {type,points:pts,closed:Math.hypot(...[pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1]])<.03,
      minx:Math.min(...xs)-1,maxx:Math.max(...xs)+1,minz:Math.min(...zs)-1,maxz:Math.max(...zs)+1,
      height:Math.max(2,Math.min(9,Math.round(Number(t['building:levels'])||3))),tags:t};
  }).filter(Boolean);
}
function toGridFloat(lat,lon){const x=R*lon*DEG,y=R*Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*DEG/2));return [x/GRID_METERS,-y/GRID_METERS]}

export class GeoVoxelGame extends VoxelGame {
  constructor(canvas){super(canvas);this.mode='geo';this.geoCenter=[0,0];this.geoFeatures=[];this.dataMode='stylized';this.geoTiles=new Map();this.progress={completed:[],coins:0};this.spawn=[0,0];this.heading=3;this.bridgeBuilt=false;this.crystalTaken=false;this.player={x:0,z:0,facing:3,yaw:this.facingYaw(3),jump:0};this.camYaw=.48;}
  setPlace(lat,lon){
    const g=toGrid(lat,lon);this.spawn=[...g];this.playerGlobal=[...g];this.heading=3;
    this.geoCenter=[...g];this.geoFeatures=[];this.geoTiles.clear();this.dataMode='stylized';
    this.bridgeBuilt=false;this.crystalTaken=false;this.player.facing=3;this.player.yaw=this.facingYaw(3);
    this.rebuild();
  }
  setFeatures(features, mode){this.geoFeatures=features;this.dataMode=mode;this.geoTiles.clear();this.rebuild();}
  cell(x,z){
    const k=key(x,z);if(this.geoTiles.has(k))return this.geoTiles.get(k);
    let c={type:'grass',height:0};
    if(this.dataMode==='osm'){
      const px=x+.5,pz=z+.5;
      for(const f of this.geoFeatures){
        if(px<f.minx||px>f.maxx||pz<f.minz||pz>f.maxz)continue;
        const area=f.closed&&contains(px,pz,f.points),distance=f.type==='road'?f.points.slice(1).reduce((m,p,i)=>Math.min(m,distSeg(px,pz,f.points[i],p)),Infinity):Infinity;
        if(f.type==='park'&&area)c={type:'park',height:0};
        if(f.type==='road'&&(area||distance<.30))c={type:'road',height:0};
        if(f.type==='building'&&area)c={type:'building',height:f.height};
        if(f.type==='water'&&area)c={type:'water',height:0};
      }
    }
    // Training objects are deliberate game features, not claims about OSM geography.
    if(x===this.spawn[0]&&z<=this.spawn[1]&&z>=this.spawn[1]-10){c={type:'path',height:0};}
    if(x===this.spawn[0]&&z===this.spawn[1]-5&&!this.bridgeBuilt)c={type:'water',height:0,tutorial:true};
    this.geoTiles.set(k,c);return c;
  }
  obstaclesAround(radius=15){const [x,z]=this.playerGlobal;const obstacles=[],water=[];
    for(let i=-radius;i<=radius;i++)for(let j=-radius;j<=radius;j++){
      const tx=x+i,tz=z+j,t=this.cell(tx,tz);
      if(t.type==='building')obstacles.push([tx,tz]);
      if(t.type==='water' && !(this.bridgeBuilt&&tx===this.spawn[0]&&tz===this.spawn[1]-5))water.push([tx,tz]);
    }
    return {obstacles,water};
  }
  rebuild(){
    if(!this.playerGlobal)return;
    const [cx,cz]=this.geoCenter,[sx,sz]=this.spawn;
    this.geoTiles.clear();const m=new Mesh();
    for(let dx=-HALF;dx<=HALF;dx++)for(let dz=-HALF;dz<=HALF;dz++){
      const x=cx+dx,z=cz+dz,c=this.cell(x,z),r=hash(x,z);
      let color=c.type==='road'?'#566476':c.type==='building'?'#aaafaa':c.type==='water'?'#2482b0':c.type==='park'?'#418f51':c.type==='path'?'#a9a080':r>.75?'#5b995f':'#4d8d56';
      if(c.type==='road'&&r>.93)color='#687887';
      m.box(dx,-.23,dz,.99,.46,.99,color);
      if(c.type==='building'){
        const h=c.height*.53;
        m.box(dx,h/2,dz,.96,h,.96,r>.6?'#d0a682':'#c7b3a1');
        m.box(dx,h+.07,dz,1.04,.15,1.04,r>.6?'#975f53':'#68798c');
        for(let j=0;j<c.height;j++)m.box(dx,.42+j*.53,dz-.502,.25,.18,.015,'#79b8c5');
      }
      if(c.type==='water')m.box(dx,.035,dz,.92,.06,.92,'#31b5dc');
      const tutorial=x===sx&&z<=sz&&z>=sz-10;
      if((c.type==='grass'||c.type==='park')&&!tutorial&&r>.9){
        m.box(dx,.40,dz,.26,.9,.28,'#785b3d');
        m.box(dx,1.15,dz,1.0,1.1,1.0,r>.96?'#35b57a':'#2a985b');
        m.box(dx,1.84,dz,.6,.45,.6,'#45c17a');
      }
      if(tutorial&&z!==sz-5){m.box(dx,.015,dz,.58,.03,.58,'#d5c59a');}
      if(x===sx&&z===sz-9){m.box(dx,.12,dz,.8,.25,.8,'#65f6bd');m.box(dx,.29,dz,.45,.12,.45,'#ecffae');}
    }
    if(this.bridgeBuilt){m.box(sx-cx,.1,sz-5-cz,.97,.22,.97,'#ba915d');}
    this.upload(m);
    this.player.x=this.playerGlobal[0]-cx;this.player.z=this.playerGlobal[1]-cz;
    this.player.facing=this.heading;this.player.yaw=this.facingYaw(this.heading);
  }
  applyGeoAction(a){
    if(a.op==='move'){
      this.playerGlobal=[a.x,a.z];this.heading=a.facing;this.player.jump=.26;
      if(Math.abs(a.x-this.geoCenter[0])>9||Math.abs(a.z-this.geoCenter[1])>9){this.geoCenter=[a.x,a.z];this.rebuild();}
      this.player.x=a.x-this.geoCenter[0];this.player.z=a.z-this.geoCenter[1];
      this.player.yaw=this.facingYaw(this.heading);
    } else if(a.op==='turn'){this.heading=a.facing;this.player.facing=a.facing;this.player.yaw=this.facingYaw(a.facing);}
    else if(a.op==='collect'){this.crystalTaken=true;}
    else if(a.op==='place'){this.bridgeBuilt=true;this.rebuild();}
  }
  makeDynamic(t){const m=new Mesh();this.makeCharacter(m,this.player.x,this.player.z,this.player.yaw,t);const [sx,sz]=this.spawn,[cx,cz]=this.geoCenter;
    if(!this.crystalTaken&&Math.abs(sx-cx)<HALF&&Math.abs(sz-4-cz)<HALF){const x=sx-cx,z=sz-4-cz,h=.59+Math.sin(t*2.7)*.09;m.box(x,h,z,.39,.56,.39,'#40eafd',t*.8);m.box(x,h+.28,z,.24,.14,.24,'#ddffff',t*.8);}
    if(Math.abs(sx-cx)<HALF&&Math.abs(sz-9-cz)<HALF){const x=sx-cx,z=sz-9-cz;m.box(x,.64+Math.sin(t*1.8)*.08,z,.38,1.2,.38,'#65f6b5',t*.7);}
    return m;
  }
  getSnapshot(){const {obstacles,water}=this.obstaclesAround();return {origin:[...this.playerGlobal],facing:this.heading,obstacles,water,
      crystal:this.crystalTaken?[]:[[this.spawn[0],this.spawn[1]-4]], bridgeCell:[this.spawn[0],this.spawn[1]-5],
      bridgeBuilt:this.bridgeBuilt,maxRange:15,boards:3};}
  nearRefresh(){return Math.max(Math.abs(this.playerGlobal[0]-this.geoCenter[0]),Math.abs(this.playerGlobal[1]-this.geoCenter[1]))>=8;}
}
