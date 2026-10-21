/* Tiny dependency-free voxel WebGL engine. All 3D graphics are genuine WebGL. */
const FACES = [
  {n:[1,0,0], shade:.79, p:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},
  {n:[-1,0,0],shade:.58,p:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]},
  {n:[0,1,0], shade:1.09,p:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},
  {n:[0,-1,0],shade:.4,p:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
  {n:[0,0,1],shade:.9,p:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]},
  {n:[0,0,-1],shade:.68,p:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]},
];
function color(hex) {
  const n=parseInt(hex.replace('#',''),16);
  return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
}
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
const seeded=(x,z)=>{let v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v)};
export class Mesh {
  constructor(){this.data=[];}
  tri(a,b,c,c3){for(const p of [a,b,c])this.data.push(...p,...c3);}
  quad(a,b,c,d,c3){this.tri(a,b,c,c3);this.tri(a,c,d,c3);}
  tile(x,z,y,hex,size=1){
    const h=size/2,v=color(hex);
    this.quad([x-h,y,z+h],[x+h,y,z+h],[x+h,y,z-h],[x-h,y,z-h],v);
  }
  box(cx,cy,cz,w,h,d,hex,rot=0){
    const cc=color(hex),sn=Math.sin(rot),cs=Math.cos(rot);
    for(const f of FACES){
      const p=f.p.map(t=>{
        let x=(t[0]-.5)*w,z=(t[2]-.5)*d;
        return [cx+x*cs-z*sn,cy+(t[1]-.5)*h,cz+x*sn+z*cs];
      });
      const tint=cc.map(v=>Math.min(1,v*f.shade));
      this.quad(p[0],p[1],p[2],p[3],tint);
    }
  }
  merge(other){this.data.push(...other.data);return this;}
}
function perspective(fovy, aspect, near, far) {
  const f=1/Math.tan(fovy/2),n=1/(near-far);
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*n,-1,0,0,2*far*near*n,0]);
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l)};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function lookAt(eye,target,up=[0,1,0]) {
  const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
export class VoxelGame {
  constructor(canvas){
    this.canvas=canvas;
    const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'}) || canvas.getContext('experimental-webgl',{alpha:false,antialias:false});
    if(!gl) throw new Error('WebGL недоступен в браузере.');
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();console.error('WebGL context lost');},{passive:false});
    this.gl=gl;
    const vs=`attribute vec3 a_pos;attribute vec3 a_color;uniform mat4 u_proj;uniform mat4 u_view;varying vec3 v_color;varying float v_distance;void main(){vec4 camera=u_view*vec4(a_pos,1.0);gl_Position=u_proj*camera;v_color=a_color;v_distance=length(camera.xyz);}`;
    const fs=`precision mediump float;varying vec3 v_color;varying float v_distance;uniform vec3 u_fog;void main(){float fog=smoothstep(17.0,42.0,v_distance);gl_FragColor=vec4(mix(v_color,u_fog,fog),1.0);}`;
    const makeShader=(type,source)=>{let sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh};
    const program=gl.createProgram();gl.attachShader(program,makeShader(gl.VERTEX_SHADER,vs));gl.attachShader(program,makeShader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    this.program=program;gl.useProgram(program);
    this.posLoc=gl.getAttribLocation(program,'a_pos');this.colLoc=gl.getAttribLocation(program,'a_color');
    this.viewLoc=gl.getUniformLocation(program,'u_view');this.projLoc=gl.getUniformLocation(program,'u_proj');
    gl.uniform3fv(gl.getUniformLocation(program,'u_fog'),new Float32Array(color('#142b4d')));
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    this.staticBuffer=gl.createBuffer();this.dynamicBuffer=gl.createBuffer();
    this.mode='hub';this.level=null;this.gems=[];this.blocks=[];this.player={x:0,z:3,facing:0,yaw:0,jump:0};
    this.camYaw=-.4;this.camera={eye:[0,8,9],target:[0,0,0]};
    this.time=0;
    this.buildHub();
    this.resize();
  }
  upload(mesh){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.staticBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.STATIC_DRAW);this.staticCount=mesh.data.length/6;}
  buildHub(){
    const m=new Mesh();
    // Island grassland with low cliffs, flower beds and small lakes.
    for(let x=-15;x<=15;x++)for(let z=-15;z<=15;z++){
      const n=seeded(x,z),edge=Math.max(Math.abs(x),Math.abs(z));
      const beach=edge>=14,pond=(x>7&&x<12&&z>6&&z<11);
      const grass=pond?'#2aa6ce':beach?'#d9bc79':n>.77?'#429c68':n>.42?'#37925b':'#328654';
      m.tile(x,z,0,grass);
      if(edge===15)m.box(x,-.38,z,1,.77,1,beach?'#b08d62':'#795c52');
      if(!pond&&edge<13&&n>.985)m.box(x,.10,z,.1,.22,.1,n>.993?'#ff82a9':'#f6e282');
    }
    // Water beneath island and floating smaller islets.
    for(let x=-19;x<=19;x++)for(let z=-19;z<=19;z++) if(Math.abs(x)>15||Math.abs(z)>15){
      if(seeded(x+111,z)>.05)m.tile(x,z,-1,'#174368');
    }
    const treeAt=[[-12,-9],[-8,10],[11,-8],[8,2],[12,12],[-12,5],[6,12],[-3,13],[-14,-1],[-7,-12],[13,-1],[3,-13]];
    for(const [x,z] of treeAt){
      m.box(x,.90,z,.43,1.8,.43,'#80543d');
      m.box(x,2.02,z,2.0,1.25,2.0,'#1b9a72');
      m.box(x,2.62,z,1.5,.9,1.5,'#33c58d');
      m.box(x,3.06,z,.8,.38,.8,'#56df9a');
    }
    // Stone road at central square.
    for(let i=-9;i<=9;i++){
      m.tile(i,0,.014,i%3===0?'#8294a5':'#667d95',.86);
      m.tile(0,i,.014,i%3===0?'#8294a5':'#667d95',.86);
    }
    // The four adventure portals.
    this.portals=[
      {x:-9,z:-7,color:'#43e0cb',name:'Первая команда'},
      {x:9,z:-7,color:'#a58aff',name:'Аллея кристаллов'},
      {x:-9,z:8,color:'#58bafb',name:'Мост над водой'},
      {x:9,z:8,color:'#ffb85c',name:'Умный маршрут'}
    ];
    for(const p of this.portals){
      m.box(p.x,-.15,p.z,3,.3,3,'#34475e');
      m.box(p.x-1.04,1.23,p.z,.5,2.6,.65,'#29334f');
      m.box(p.x+1.04,1.23,p.z,.5,2.6,.65,'#29334f');
      m.box(p.x,2.62,p.z,2.5,.5,.65,'#29334f');
      m.box(p.x-1.04,1.56,p.z,.22,1.7,.7,p.color);
      m.box(p.x+1.04,1.56,p.z,.22,1.7,.7,p.color);
      m.box(p.x,2.48,p.z,1.95,.2,.7,p.color);
      m.box(p.x,.09,p.z,1.5,.12,1.5,p.color);
    }
    // Giant blocky dinosaur statue at town center.
    m.box(2,1.0,2,1.4,2.0,1.3,'#309e79');
    m.box(2.7,2.30,2,.95,.95,1,'#45dca4');
    m.box(3.23,2.15,2,.6,.4,.82,'#b1ffd8');
    m.box(2.81,2.59,1.43,.16,.18,.12,'#0f2540');
    m.box(2,2.27,2,.85,.32,.85,'#3ad79c');
    m.box(1.17,.65,2,.95,.52,.56,'#3ad79c');
    this.upload(m);this.mode='hub';this.level=null;this.player.x=0;this.player.z=4;this.player.yaw=-Math.PI/2;
  }
  toArena(x,z){return [x-1.6,z-.2]}
  setArena(level){
    this.level=level;this.mode='arena';this.gems=level.crystals.map(([x,z])=>`${x},${z}`);this.blocks=[];
    const m=new Mesh();const [xmin,xmax,zmin,zmax]=level.bounds;
    for(let x=xmin;x<=xmax;x++)for(let z=zmin;z<=zmax;z++){
      const [px,pz]=this.toArena(x,z),water=level.water.some(([a,b])=>a===x&&b===z),rock=level.rocks.some(([a,b])=>a===x&&b===z);
      const isGoal=level.goal[0]===x&&level.goal[1]===z;
      const c=water?'#17496b':isGoal?'#37c9a2':(x+z)%2===0?'#667ca6':'#536b94';
      m.tile(px,pz,0,c,.985);
      if(!water)m.box(px,-.25,pz,1,.45,1,'#304763');
      if(water)m.tile(px,pz,-.12,'#2ab9ee',.89);
      if(rock){m.box(px,.47,pz,.93,.9,.94,'#8092af');m.box(px,.97,pz,.6,.21,.6,'#b2c0d0');}
      if(isGoal){m.box(px,.055,pz,.79,.12,.79,'#6efbd1');m.box(px,.115,pz,.5,.12,.5,'#2f967b');}
    }
    // Small starry stepping stones around arena frame.
    for(let i=0;i<18;i++){
      const x= Math.sin(i*1.9)*7,z=Math.cos(i*2.4)*5;
      m.box(x,-1.9,z,.55,.35,.55,i%2?'#355f90':'#6470c5');
    }
    this.upload(m);
    this.player.x=level.origin[0];this.player.z=level.origin[1];this.player.facing=level.facing;
    this.player.yaw=this.facingYaw(this.player.facing);this.player.jump=0;
  }
  facingYaw(facing){return [0,Math.PI/2,Math.PI,-Math.PI/2][facing]}
  moveHub(dx,dz,dt){
    if(this.mode!=='hub')return;
    const len=Math.hypot(dx,dz);if(!len)return;
    dx/=len;dz/=len;
    const speed=4.2;
    this.player.x=Math.max(-13.8,Math.min(13.8,this.player.x+dx*speed*dt));
    this.player.z=Math.max(-13.8,Math.min(13.8,this.player.z+dz*speed*dt));
    this.player.yaw=Math.atan2(dz,dx);
    this.player.jump=Math.max(this.player.jump,.04);
  }
  nearPortal(){
    if(this.mode!=='hub')return -1;
    const d=this.portals.map(p=>Math.hypot(this.player.x-p.x,this.player.z-p.z));
    const index=d.indexOf(Math.min(...d));return d[index]<3.5?index:-1;
  }
  applyAction(a){
    const p=this.player;
    if(a.op==='move'){p.x=a.x;p.z=a.z;p.facing=a.facing;p.yaw=this.facingYaw(p.facing);p.jump=.25;}
    else if(a.op==='turn'){p.facing=a.facing;p.yaw=this.facingYaw(p.facing);}
    else if(a.op==='collect'){this.gems=this.gems.filter(k=>k!==`${a.x},${a.z}`)}
    else if(a.op==='place'){this.blocks.push([a.x,a.z])}
  }
  makeCharacter(m,cx,cz,yaw,t){
    const jump=Math.sin(Math.min(1,this.player.jump)*Math.PI)*.22;
    const walking=this.mode==='hub'&&this.movingHub;
    const bob=walking?Math.sin(t*14)*.055:Math.sin(t*2.6)*.018;
    const y=.72+bob+jump;
    const box=(x,dy,z,w,h,d,c)=>{const xx=cx+x*Math.cos(yaw)-z*Math.sin(yaw),zz=cz+x*Math.sin(yaw)+z*Math.cos(yaw);m.box(xx,y+dy,zz,w,h,d,c,yaw)};
    // Body
    box(-.03,-.08,0,.72,.78,.58,'#4ed39d');
    box(.12,.28,0,.52,.28,.48,'#bdf6d5');
    // Head + muzzle
    box(.34,.44,0,.92,.78,.82,'#63e8ad');
    box(.85,.34,0,.52,.32,.48,'#cffff0');
    box(.99,.27,0,.12,.07,.16,'#2e7b6a');
    // Eyes
    box(.60,.63,-.24,.14,.16,.12,'#17324d');
    box(.60,.63,.24,.14,.16,.12,'#17324d');
    box(.67,.67,-.30,.08,.08,.06,'#ffffff');
    box(.67,.67,.18,.08,.08,.06,'#ffffff');
    // Crest and tail
    box(.10,.86,0,.26,.18,.38,'#39b57f');
    box(-.58,-.18,0,.72,.24,.36,'#36b181');
    box(-.93,-.20,0,.42,.14,.22,'#36b181');
    // Scarf
    box(.18,.05,0,.18,.40,.66,'#ff8f3c');
    box(.05,-.16,.23,.28,.18,.10,'#ff8f3c');
    // Legs
    box(-.18,-.55,-.21,.22,.36,.24,'#295f54');
    box(-.18,-.55,.21,.22,.36,.24,'#295f54');
    // Tiny hands
    box(.29,-.16,-.34,.20,.16,.14,'#53ba8e');
    box(.29,-.16,.34,.20,.16,.14,'#53ba8e');
    // Backpack
    box(-.18,.08,0,.18,.42,.38,'#516a8e');
  }
  makeDynamic(t){
    const m=new Mesh(),p=this.player;
    const [x,z]=this.mode==='arena'?this.toArena(p.x,p.z):[p.x,p.z];
    this.makeCharacter(m,x,z,p.yaw,t);
    if(this.mode==='arena'){
      for(const k of this.gems){
        const [gx,gz]=k.split(',').map(Number),[xx,zz]=this.toArena(gx,gz);
        const h=.48+Math.sin(t*3+gx)*.10;
        m.box(xx,h,zz,.31,.44,.31,'#4af5fa',t*.75);
        m.box(xx,h+.28,zz,.19,.14,.19,'#ccfeff',t*.75);
      }
      for(const [bx,bz] of this.blocks){
        const [xx,zz]=this.toArena(bx,bz);
        m.box(xx,-.06,zz,.94,.27,.94,'#ceab78');
        m.box(xx,.08,zz,.70,.10,.70,'#8fe79f');
      }
    }else{
      for(let i=0;i<8;i++){
        const xx=Math.sin(i*5.18)*11,zz=Math.cos(i*2.47)*11;
        m.box(xx,.28+Math.sin(t*1.5+i)*.08,zz,.22,.38,.22,i%2?'#d4adfc':'#58eec8',t*.7);
      }
    }
    return m;
  }
  resize(){
    const w=Math.max(1,Math.round(this.canvas.clientWidth*devicePixelRatio));
    const h=Math.max(1,Math.round(this.canvas.clientHeight*devicePixelRatio));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.gl.viewport(0,0,w,h);
    this.gl.useProgram(this.program);
    this.gl.uniformMatrix4fv(this.projLoc,false,perspective(.9,w/h,.1,75));
  }
  drawBuffer(buffer,count){
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.vertexAttribPointer(this.posLoc,3,gl.FLOAT,false,24,0);
    gl.vertexAttribPointer(this.colLoc,3,gl.FLOAT,false,24,12);
    gl.enableVertexAttribArray(this.posLoc);gl.enableVertexAttribArray(this.colLoc);
    gl.drawArrays(gl.TRIANGLES,0,count);
  }
  render(time,delta){
    const t=time*.001;this.time=t;
    if(this.player.jump>0)this.player.jump=Math.max(0,this.player.jump-delta*2.3);
    const gl=this.gl;this.resize();gl.clearColor(.078,.151,.271,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(this.mode==='arena'){
      const [hx,hz]=this.toArena(this.player.x,this.player.z);
      this.camera.eye=[3.8,9.8,10.2];this.camera.target=[1.2,.1,-.7];
    }else{
      const p=this.player;
      if(this.mode==='geo'){
        this.camera.target=[p.x,1.05,p.z];
        const a=this.camYaw;
        this.camera.eye=[p.x+Math.sin(a)*6.2,5.6,p.z+Math.cos(a)*6.2];
      }else{
        this.camera.target=[p.x,.78,p.z];
        const a=this.camYaw;
        this.camera.eye=[p.x+Math.sin(a)*8,6.7,p.z+Math.cos(a)*8];
      }
    }
    gl.uniformMatrix4fv(this.viewLoc,false,lookAt(this.camera.eye,this.camera.target));
    this.drawBuffer(this.staticBuffer,this.staticCount);
    const mesh=this.makeDynamic(t);gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamicBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.DYNAMIC_DRAW);
    this.drawBuffer(this.dynamicBuffer,mesh.data.length/6);
  }
}
