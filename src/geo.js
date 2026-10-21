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
      height:Math.max(2,Math.min(11,Math.round(Number(t['building:levels'])||3))),tags:t};
  }).filter(Boolean);
}
function toGridFloat(lat,lon){const x=R*lon*DEG,y=R*Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*DEG/2));return [x/GRID_METERS,-y/GRID_METERS]}

const isWalkableType=t=>t==='road'||t==='path'||t==='park'||t==='grass'||t==='courtyard'||t==='sidewalk';

export class GeoVoxelGame extends VoxelGame {
  constructor(canvas){
    super(canvas);
    this.mode='geo';this.geoCenter=[0,0];this.geoFeatures=[];this.dataMode='stylized';this.geoTiles=new Map();
    this.progress={completed:[],coins:0};this.spawn=[0,0];this.heading=3;this.bridgeBuilt=false;this.crystalTaken=false;
    this.goalGlobal=null;this.goalReached=false;this.grandmaCell=null;this.grandmaTalked=false;this.packageReady=false;this.packageDelivered=false;this.chapterTarget=null;this.streetWaypoint=null;
    this.player={x:0,z:0,facing:3,yaw:this.facingYaw(3),jump:0};this.camYaw=.56;
  }
  setPlace(lat,lon){
    const g=toGrid(lat,lon);this.spawn=[...g];this.playerGlobal=[...g];this.heading=3;
    this.geoCenter=[...g];this.geoFeatures=[];this.geoTiles.clear();this.dataMode='stylized';
    this.bridgeBuilt=false;this.crystalTaken=false;this.streetWaypoint=null;this.player.facing=3;this.player.yaw=this.facingYaw(3);
    this.rebuild();
  }
  setFeatures(features, mode){this.geoFeatures=features;this.dataMode=mode;this.geoTiles.clear();this.rebuild();}
  cell(x,z){
    const k=key(x,z);if(this.geoTiles.has(k))return this.geoTiles.get(k);
    let c={type:'grass',height:0};
    if(this.dataMode!=='osm'){
      // Clearly labelled GAME DEMO scenery when live OSM geometry is unavailable.
      // Deterministic block-grid streets: it is never passed off as actual Moscow geometry.
      const dx=x-this.spawn[0],dz=z-this.spawn[1];
      const mx=((dx%10)+10)%10,mz=((dz%10)+10)%10;
      const r=hash(x,z);
      if(mx<2||mz<2)c={type:'road',height:0};
      else if(mx===2||mz===2||mx===9||mz===9)c={type:'path',height:0};
      else if((Math.floor(dx/10)+Math.floor(dz/10))%5===0)c={type:'park',height:0};
      else if((mx>=4&&mx<=7)&&(mz>=4&&mz<=7)&&r>.23)c={type:'building',height:3+Math.floor(hash(x+14,z-5)*7)};
      else c={type:'grass',height:0};
    }
    if(this.dataMode==='osm'){
      const px=x+.5,pz=z+.5;
      for(const f of this.geoFeatures){
        if(px<f.minx||px>f.maxx||pz<f.minz||pz>f.maxz)continue;
        const area=f.closed&&contains(px,pz,f.points),distance=f.type==='road'?f.points.slice(1).reduce((m,p,i)=>Math.min(m,distSeg(px,pz,f.points[i],p)),Infinity):Infinity;
        if(f.type==='park'&&area)c={type:'park',height:0};
        if(f.type==='road'&&(area||distance<.30))c={type:'road',height:0};
        if(f.type==='building'&&area)c={type:'building',height:f.height,tags:f.tags};
        if(f.type==='water'&&area)c={type:'water',height:0};
      }
    }
    // Ensure the initial spawn is walkable even if the address point falls inside a building polygon.
    if(x===this.spawn[0]&&z===this.spawn[1])c={type:'path',height:0};
    this.geoTiles.set(k,c);return c;
  }
  tileType(x,z){return this.cell(x,z).type;}
  isRoadLike(x,z){return ['road','path'].includes(this.tileType(x,z));}
  isSolid(x,z){return ['building','water'].includes(this.tileType(x,z));}
  isNearRoad(x,z){
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) if(this.isRoadLike(x+dx,z+dz)) return true;
    return false;
  }
  roadMask(x,z){
    return {
      e:this.isRoadLike(x+1,z),w:this.isRoadLike(x-1,z),s:this.isRoadLike(x,z+1),n:this.isRoadLike(x,z-1)
    };
  }
  nearestRoadDirection(x,z){
    const dirs=[[0,-1,'n'],[1,0,'e'],[0,1,'s'],[-1,0,'w']];
    for(let r=1;r<=2;r++){
      for(const [dx,dz,id] of dirs) if(this.isRoadLike(x+dx*r,z+dz*r)) return id;
    }
    return 's';
  }
  obstaclesAround(radius=15){const [x,z]=this.playerGlobal;const obstacles=[],water=[];
    for(let i=-radius;i<=radius;i++)for(let j=-radius;j<=radius;j++){
      const tx=x+i,tz=z+j,t=this.cell(tx,tz);
      if(t.type==='building')obstacles.push([tx,tz]);
      if(t.type==='water' && !(this.bridgeBuilt&&tx===this.spawn[0]&&tz===this.spawn[1]-5))water.push([tx,tz]);
    }
    return {obstacles,water};
  }
  drawBuilding(mesh,dx,dz,worldX,worldZ,height){
    const r=hash(worldX,worldZ);
    const wallPal=[['#d4c1b2','#c7a592','#866b63'],['#c9d1d8','#adb6c1','#5e6c78'],['#dfcfaa','#c8b384','#78634d'],['#d6c7d8','#b79fbe','#6b5e78']];
    const [wall,wall2,roof]=wallPal[Math.floor(r*wallPal.length)%wallPal.length];
    const podium=r>.65?'#9f8e81':'#8f847a';
    const h=height*.58 + (r>.82?.35:0);
    mesh.box(dx,-.02,dz,1,.12,1,podium);
    mesh.box(dx,h/2,dz,.96,h,.96,wall);
    if(r>.45) mesh.box(dx,h*0.52,dz,.82,h*.92,.82,wall2);
    mesh.box(dx,h+.08,dz,1.04,.15,1.04,roof);
    const winRows=Math.max(2,Math.round(height));
    for(let row=0;row<winRows;row++){
      const y=.36+row*.5;
      mesh.box(dx-.28,y,dz-.492,.12,.14,.02,row%2? '#9fd9ff':'#7fbbe9');
      mesh.box(dx+.03,y,dz-.492,.12,.14,.02,row%2? '#9fd9ff':'#7fbbe9');
      mesh.box(dx+.34,y,dz-.492,.12,.14,.02,row%2? '#9fd9ff':'#7fbbe9');
      if(r>.35){
        mesh.box(dx-.492,y,dz-.22,.02,.14,.12,'#7fbbe9');
        mesh.box(dx-.492,y,dz+.15,.02,.14,.12,'#7fbbe9');
      }
      if(r>.55){
        mesh.box(dx+.492,y,dz-.22,.02,.14,.12,'#7fbbe9');
        mesh.box(dx+.492,y,dz+.15,.02,.14,.12,'#7fbbe9');
      }
    }
    const doorDir=this.nearestRoadDirection(worldX,worldZ);
    if(doorDir==='n') mesh.box(dx,h*.18,dz-.49,.18,.34,.03,'#5b4433');
    else if(doorDir==='s') mesh.box(dx,h*.18,dz+.49,.18,.34,.03,'#5b4433');
    else if(doorDir==='w') mesh.box(dx-.49,h*.18,dz,.03,.34,.18,'#5b4433');
    else mesh.box(dx+.49,h*.18,dz,.03,.34,.18,'#5b4433');
  }
  drawRoadDecor(mesh,dx,dz,worldX,worldZ){
    const mask=this.roadMask(worldX,worldZ);
    const center='#4f5661';
    mesh.box(dx,-.19,dz,1,.38,1,center);
    const straightEW=(mask.e||mask.w)&&!(mask.n||mask.s);
    const straightNS=(mask.n||mask.s)&&!(mask.e||mask.w);
    if(straightEW){
      mesh.box(dx,.03,dz,.58,.02,.05,'#fff0b3');
      if((worldX+worldZ)%5===0) mesh.box(dx,.035,dz,.18,.03,.09,'#ffffff');
    } else if(straightNS){
      mesh.box(dx,.03,dz,.05,.02,.58,'#fff0b3');
      if((worldX+worldZ)%5===0) mesh.box(dx,.035,dz,.09,.03,.18,'#ffffff');
    } else if((mask.e&&mask.w)||(mask.n&&mask.s)) {
      mesh.box(dx,.03,dz,.28,.02,.28,'#fff0b3');
    }
    const degree=[mask.e,mask.w,mask.n,mask.s].filter(Boolean).length;
    if(degree>=3){
      mesh.box(dx,.035,dz-.32,.72,.02,.06,'#ffffff');
      mesh.box(dx,.035,dz+.32,.72,.02,.06,'#ffffff');
    }
  }
  drawSidewalk(mesh,dx,dz,worldX,worldZ){
    const shade=hash(worldX*2,worldZ*2)>.5?'#cfcac2':'#bfb8af';
    mesh.box(dx,-.17,dz,1,.42,1,'#8a8d91');
    mesh.tile(dx,dz,.05,shade,.94);
    if(hash(worldX,worldZ)>.86&&this.isNearRoad(worldX,worldZ)){
      mesh.box(dx,.44,dz,.08,.66,.08,'#656f7a');
      mesh.box(dx,.92,dz,.45,.2,.45,'#f4dfa0');
    }
  }
  drawCourtyard(mesh,dx,dz,worldX,worldZ){
    const r=hash(worldX,worldZ);
    const base=r>.5?'#799a6f':'#6d8f66';
    mesh.box(dx,-.19,dz,1,.38,1,base);
    mesh.tile(dx,dz,.03,r>.7?'#87a47c':'#7a9870',.96);
    if(r>.93){
      mesh.box(dx,.36,dz,.2,.72,.2,'#72563c');
      mesh.box(dx,.98,dz,1.02,.88,1.02,r>.97?'#3eb270':'#2d965d');
      mesh.box(dx,1.45,dz,.58,.34,.58,'#58c983');
    } else if(r<.08){
      mesh.box(dx,.06,dz,.68,.05,.28,'#ddd4c8');
      mesh.box(dx,.22,dz,.68,.08,.28,'#7a5b45');
    }
  }
  rebuild(){
    if(!this.playerGlobal)return;
    const [cx,cz]=this.geoCenter,[sx,sz]=this.spawn;
    this.geoTiles.clear();const m=new Mesh();
    for(let dx=-HALF;dx<=HALF;dx++)for(let dz=-HALF;dz<=HALF;dz++){
      const x=cx+dx,z=cz+dz;const c=this.cell(x,z);const r=hash(x,z);
      const nearRoad=this.isNearRoad(x,z),mask=this.roadMask(x,z);
      let visualType=c.type;
      if(c.type==='grass'&&nearRoad) visualType='sidewalk';
      else if(c.type==='grass'&&this.dataMode==='osm'&&r>.72) visualType='courtyard';
      else if(c.type==='path') visualType='sidewalk';

      if(visualType==='road') this.drawRoadDecor(m,dx,dz,x,z);
      else if(visualType==='sidewalk') this.drawSidewalk(m,dx,dz,x,z);
      else if(visualType==='building') this.drawBuilding(m,dx,dz,x,z,c.height||4);
      else if(visualType==='water'){
        m.box(dx,-.2,dz,1,.40,1,'#2d5378');
        m.tile(dx,dz,.0,'#43b9df',.92);
        if(r>.7) m.box(dx,.04,dz,.55,.03,.55,'#76d8f0');
      }
      else if(visualType==='park'){
        m.box(dx,-.19,dz,1,.38,1,'#4d7853');
        m.tile(dx,dz,.03,r>.58?'#5fa55f':'#4f9450',.96);
        if(r>.84){
          m.box(dx,.36,dz,.22,.72,.22,'#7a5638');
          m.box(dx,.99,dz,1.12,.92,1.12,r>.93?'#40b86e':'#2a9757');
          m.box(dx,1.48,dz,.62,.32,.62,'#65d792');
        }
      }
      else if(visualType==='courtyard') this.drawCourtyard(m,dx,dz,x,z);
      else {
        m.box(dx,-.19,dz,1,.38,1,'#567e56');
        m.tile(dx,dz,.03,r>.75?'#6aa266':'#5f975f',.96);
        if(r>.965){m.box(dx,.30,dz,.16,.6,.16,'#70533a');m.box(dx,.9,dz,.72,.72,.72,'#3ca86a');}
      }

      // Add curb strips alongside roads so the city reads like streets.
      if(visualType!=='road' && nearRoad && !['building','water'].includes(visualType)){
        if(mask.n||this.isRoadLike(x,z-1)) m.box(dx,.06,dz-.42,.96,.04,.08,'#e4ddd3');
        if(mask.s||this.isRoadLike(x,z+1)) m.box(dx,.06,dz+.42,.96,.04,.08,'#e4ddd3');
        if(mask.e||this.isRoadLike(x+1,z)) m.box(dx+.42,.06,dz,.08,.04,.96,'#e4ddd3');
        if(mask.w||this.isRoadLike(x-1,z)) m.box(dx-.42,.06,dz,.08,.04,.96,'#e4ddd3');
      }

      // A few parked cars near roads/courtyards.
      if((visualType==='courtyard'||visualType==='sidewalk') && nearRoad && r>.972){
        const rot=(Math.floor(r*10)%2)?0:Math.PI/2;
        m.box(dx,.18,dz,.62,.22,.35,r>.985?'#ea6453':'#4d8ef1',rot);
        m.box(dx,.31,dz,.34,.1,.26,'#9ed7ff',rot);
      }
    }
    if(this.bridgeBuilt){m.box(sx-cx,.1,sz-5-cz,.97,.22,.97,'#ba915d');m.box(sx-cx,.24,sz-5-cz,.65,.08,.65,'#8fdf95');}
    // Distant skyline blocks at the horizon for city depth.
    for(let edge=-HALF;edge<=HALF;edge+=3){
      const northH=1.2+((Math.sin(edge*1.7)+1)*1.5),southH=1.2+((Math.cos(edge*1.9)+1)*1.4);
      m.box(edge,northH/2,-HALF-1,1.8,northH,1.4,edge%2===0?'#6a7687':'#7f6f75');
      m.box(edge,southH/2,HALF+1,1.8,southH,1.4,edge%2===0?'#6c7b89':'#8a7a73');
      m.box(-HALF-1,northH/2,edge,1.4,northH,1.8,edge%2===0?'#6a7687':'#7f6f75');
      m.box(HALF+1,southH/2,edge,1.4,southH,1.8,edge%2===0?'#6c7b89':'#8a7a73');
    }
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
  makeDynamic(t){
    const m=new Mesh();this.makeCharacter(m,this.player.x,this.player.z,this.player.yaw,t);
    if(this.streetWaypoint){
      const [cx,cz]=this.geoCenter,[gx,gz]=this.streetWaypoint.target;
      const x=gx-cx,z=gz-cz;
      if(Math.abs(x)<=HALF&&Math.abs(z)<=HALF){
        const pack=this.streetWaypoint.stage===2;
        const height=.92+Math.sin(t*3)*.17;
        if(pack){
          m.box(x,.34,z,.65,.54,.65,'#d7a052');
          m.box(x,.62,z,.69,.12,.69,'#f1d18b');
          m.box(x,.66,z,.12,.10,.70,'#60e9b2');
        }else{
          m.box(x,.06,z,.90,.12,.90,this.streetWaypoint.stage===0?'#48cbee':'#ffd276');
          m.box(x,height,z,.19,1.5,.19,this.streetWaypoint.stage===0?'#55e8ff':'#ffda75',t*.18);
          m.box(x,height+.85,z,.65,.55,.65,this.streetWaypoint.stage===0?'#8aeeff':'#ffe5a1',t*.5);
        }
      }
    }
    if(this.chapterTarget){
      const [cx,cz]=this.geoCenter,x=this.chapterTarget[0]-cx,z=this.chapterTarget[1]-cz;
      if(Math.abs(x)<=HALF&&Math.abs(z)<=HALF){
        const bounce=.35+Math.sin(t*3)*.10;
        m.box(x,.08,z,.86,.1,.86,'#a880ff');
        m.box(x,.42+bounce,z,.42,.18,.20,'#ffe286',t*.35);
        m.box(x+.22,.42+bounce,z,.16,.18,.13,'#ffe286',t*.35);
        m.box(x-.25,.42+bounce,z,.18,.12,.14,'#fff3b5',t*.35);
      }
    }
    // A friendly voxel NPC appears ONLY at a confirmed destination, on a traversable game cell.
    if(this.grandmaCell){
      const [cx,cz]=this.geoCenter,x=this.grandmaCell[0]-cx,z=this.grandmaCell[1]-cz;
      if(Math.abs(x)<=HALF&&Math.abs(z)<=HALF){
        const bob=Math.sin(t*2.2)*.025;
        m.box(x,.06,z,.83,.1,.83,'#eac27c');
        // Purple coat/dress, cream face, silver hair, glasses and arms.
        m.box(x,.45+bob,z,.56,.70,.49,'#8d6db2');
        m.box(x,.84+bob,z,.51,.30,.51,'#c7acd9');
        m.box(x,1.10+bob,z,.52,.52,.53,'#f0cbac');
        m.box(x,1.42+bob,z,.58,.20,.59,'#dce5ee');
        m.box(x-.27,1.15+bob,z,.14,.43,.47,'#dce5ee');
        m.box(x+.27,1.15+bob,z,.14,.43,.47,'#dce5ee');
        m.box(x-.15,1.15+bob,z-.277,.14,.11,.04,'#453d58');
        m.box(x+.15,1.15+bob,z-.277,.14,.11,.04,'#453d58');
        m.box(x,1.15+bob,z-.28,.12,.035,.035,'#705b64');
        m.box(x,1.47+bob,z+.32,.22,.30,.20,'#dce5ee');
        m.box(x-.38,.78+bob,z,.20,.15,.22,'#eac5a5');
        m.box(x+.38,.78+bob,z,.20,.15,.22,'#eac5a5');
        if(!this.packageDelivered){
          m.box(x,2.06+Math.sin(t*3)*.13,z,.16,.48,.16,'#ffdd76');
          m.box(x,2.40+Math.sin(t*3)*.13,z,.20,.18,.20,'#fff2b4');
        } else {
          m.box(x,2.13+Math.sin(t*3)*.10,z,.26,.22,.22,'#ff8d9b',t*.2);
        }
      }
    }
    if(this.goalGlobal){
      const [cx,cz]=this.geoCenter,x=this.goalGlobal[0]-cx,z=this.goalGlobal[1]-cz;
      if(Math.abs(x)<HALF&&Math.abs(z)<HALF){
        const h=.9+Math.sin(t*2)*.16;
        m.box(x,h,z,.24,1.7,.24,'#efb756',t*.20);
        m.box(x,h+1.10,z,.95,.8,.95,'#ffd879',t*.35);
        m.box(x,h+1.55,z,.47,.29,.47,'#fff8db');
      }
    }
    return m;
  }
  getSnapshot(){const {obstacles,water}=this.obstaclesAround(19);return {origin:[...this.playerGlobal],facing:this.heading,obstacles,water,
      crystal:this.streetWaypoint?.stage===2?[this.streetWaypoint.target]:this.chapterTarget?[this.chapterTarget]:[],
      grandmaCell:this.grandmaCell,grandmaTalked:this.grandmaTalked,packageReady:this.packageReady,packageDelivered:this.packageDelivered,bridgeCell:[this.spawn[0],this.spawn[1]-5], bridgeBuilt:this.bridgeBuilt,maxRange:15,boards:3};}
  setGoal(cell){this.goalGlobal=cell;this.goalReached=false;}
  setStreetWaypoint(quest){this.streetWaypoint=quest?{stage:quest.stage,target:[...quest.target]}:null;}
  setGrandmaCell(cell){this.grandmaCell=cell?[...cell]:null;}
  setChapterTarget(cell){this.chapterTarget=cell?[...cell]:null;}
  setGrandmaContext(state,ready){
    this.grandmaTalked=Boolean(state?.talked);this.packageDelivered=Boolean(state?.delivered);this.packageReady=Boolean(ready);
  }
  nearRefresh(){return Math.max(Math.abs(this.playerGlobal[0]-this.geoCenter[0]),Math.abs(this.playerGlobal[1]-this.geoCenter[1]))>=8;}
}
