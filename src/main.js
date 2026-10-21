import { GeoVoxelGame, parseOSM, gridToLatLon, toGrid, GRID_METERS } from './geo.js';
import { LEVELS, STORAGE_KEY } from './levels.js';
import { FIRST_JOURNEY, resolveGoal, directionToCell, finishedGoal, metersApart } from './route.js';
import { panoramaUrl, mapUrl } from './panorama.js';
import { canMeetGrandma, grandmaMessage } from './grandma.js';
import { STREET_QUESTS, planStreetQuest, evaluateStreetQuest, reachableCells, sameCell, streetHint } from './street-quests.js';

const $ = id => document.getElementById(id);
const game = new GeoVoxelGame($('game'));
const DIR_NAMES = ['Восток →', 'Юг ↓', 'Запад ←', 'Север ↑'];
const HOME = [FIRST_JOURNEY.start.lat,FIRST_JOURNEY.start.lon]; // Exact selected start address, not GPS.
const saved = (() => { try {return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');}catch{return null;} })();
let place = saved?.place && Array.isArray(saved.place) ? saved.place : HOME;
let completed = Array.isArray(saved?.completed) ? saved.completed.filter(n=>Number.isInteger(n) && n>=0 && n<LEVELS.length) : [];
let coins = Number.isFinite(saved?.coins) ? saved.coins : 0;
let busy = false, worker = null, ready = false, workerTicket = 0, runTimer = null;
let selected = Math.min(LEVELS.length, completed.length), frameStart = 0, mapRefresh = 0, fetchCenter = null, fetchID = 0;
let touchX = null, toastTimer = null;
let editorWasOpen = false;
let codeDrafts = saved?.codeDrafts && typeof saved.codeDrafts==='object' ? saved.codeDrafts : {};
let goalCoords = Array.isArray(saved?.goalCoords) && saved.goalCoords.length===2 && saved.goalVerified===true ? saved.goalCoords : null;
let goalCell = goalCoords ? toGrid(...goalCoords) : null;
let questTurn=0, questMoves=0;
let streetProgress=Number.isInteger(saved?.streetProgress)?Math.min(STREET_QUESTS.length,Math.max(0,saved.streetProgress)):0;
let streetQuest=null;
let grandmaMet=!!saved?.grandmaMet;
let chapterTwo=!!saved?.chapterTwo;
let previousStreetTarget=Array.isArray(saved?.streetPrevious)?saved.streetPrevious:null;
let restoredStreetTarget=Array.isArray(saved?.streetTarget)?saved.streetTarget:null;



function save(){
  try {localStorage.setItem(STORAGE_KEY, JSON.stringify({place,completed,coins, position:game.playerGlobal,heading:game.heading,crystalTaken:game.crystalTaken,bridgeBuilt:game.bridgeBuilt,
    goalCoords,goalVerified:!!goalCoords,codeDrafts,streetProgress,streetTarget:streetQuest?.target || null,streetPrevious:previousStreetTarget,grandmaMet,chapterTwo}));}
  catch (_) {}
}
function showToast(msg){
  const t=$('toast');t.textContent=msg;t.classList.remove('hidden');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('hidden'),3100);
}
function feedback(msg,kind='info'){
  const el=$('feedback');el.className=`feedback ${kind}`;
  const span=document.createElement('span');span.textContent=kind==='good'?'✅':kind==='bad'?'⚠️':'💡';
  const p=document.createElement('p');p.textContent=msg;el.replaceChildren(span,p);
}
// A separate in-world mission system: educational objects, NEVER real deliveries.
function reachableStreetTarget(target){
  if(!target||!game.playerGlobal||!Array.isArray(target)||target.length!==2)return false;
  return reachableCells((x,z)=>game.cell(x,z),game.playerGlobal,12).some(c=>sameCell(c.position,target));
}
function setStreetStage(reuse=false){
  if(streetProgress>=STREET_QUESTS.length){streetQuest=null;game.setStreetWaypoint(null);updateStreetUI();return;}
  let q=null;
  if(reuse&&restoredStreetTarget&&reachableStreetTarget(restoredStreetTarget)){
    q={stage:streetProgress,target:[...restoredStreetTarget],kind:STREET_QUESTS[streetProgress].id,
      generic:streetProgress>0&&![[1,0],[0,1],[-1,0],[0,-1]].some(([dx,dz])=>game.cell(restoredStreetTarget[0]+dx,restoredStreetTarget[1]+dz).type==='building')};
  }
  streetQuest=q||planStreetQuest((x,z)=>game.cell(x,z),game.playerGlobal,streetProgress,previousStreetTarget);
  restoredStreetTarget=null;
  game.setStreetWaypoint(streetQuest);
  updateStreetUI();save();
}
function updateStreetUI(){
  const finished=streetProgress>=STREET_QUESTS.length;
  $('streetCount').textContent=`${streetProgress} / ${STREET_QUESTS.length}`;
  $('streetTitle').textContent=finished?'🎉 Все городские квесты пройдены!':STREET_QUESTS[streetProgress].icon+' '+STREET_QUESTS[streetProgress].name;
  $('streetDescription').textContent=finished?'Подарок для бабушки собран. Продолжай путешествие к дому бабушки по своему маршруту.':
    streetQuest ? (streetQuest.generic && streetProgress>0?'На этом участке пока нет подходящего здания. Иди к игровому ориентиру.':STREET_QUESTS[streetProgress].story):
    'Не удалось построить доступный путь. Попробуй загрузить другой участок карты.';
  $('streetInstruction').textContent=finished?'Отлично! Все награды получены.':
    streetQuest?STREET_QUESTS[streetProgress].command:'Нужны свободные клетки вокруг героя';
  $('streetHintButton').disabled=finished||!streetQuest;
  $('mapStreet').classList.toggle('hidden',!streetQuest);
}
function checkStreetQuest(actions){
  if(!evaluateStreetQuest(streetQuest,actions))return;
  const quest=STREET_QUESTS[streetProgress];
  previousStreetTarget=streetQuest.target;
  coins+=quest.reward;
  streetProgress++;
  setStreetStage(false);
  renderQuests();
  updateMap();
  updateGrandmaUI();
  save();
  showToast(`🏙 ${quest.name}: выполнено! +${quest.reward} 💎`);
  feedback(`Городская миссия выполнена: ${quest.name}. +${quest.reward} кристаллов!`,'good');
}
$('streetHintButton').addEventListener('click',()=>{
  feedback(streetProgress>=STREET_QUESTS.length?'Все городские задания пройдены!':
    streetHint(streetQuest,game.playerGlobal),'info');
  openEditor();
});

function renderQuests(){
  $('progressCount').textContent=`${completed.length} / ${LEVELS.length}`;
  $('coinCount').textContent=coins;
  const list=$('questList');list.replaceChildren();
  LEVELS.forEach((level,index)=>{
    const done=completed.includes(index),button=document.createElement('button');
    button.type='button';button.className='quest-card'+(selected===index?' active':'');
    const icon=document.createElement('span');icon.className='quest-icon';icon.textContent=level.icon;
    const wrap=document.createElement('span');
    const name=document.createElement('strong');name.className='quest-name';name.textContent=`${index+1}. ${level.name}`;
    const desc=document.createElement('small');desc.className='quest-descr';desc.textContent=level.subtitle;
    wrap.append(name,desc);button.append(icon,wrap);
    if(done){const tick=document.createElement('span');tick.className='quest-done';tick.textContent='✓';button.append(tick);}
    button.addEventListener('click',()=>{
      if(index>completed.length){showToast('Сначала пройди предыдущие задания. 🦖');return;}
      if(index<completed.length){showToast('Эта миссия уже выполнена! Можно продолжить исследование.');return;}
      selected=index;updateQuest();openEditor();
    });
    list.appendChild(button);
  });
}

const COMMAND_LIBRARY = [
  {at:0,label:'Шаг вперёд',code:'move_forward()',help:'Один шаг в сторону взгляда. Можно написать move_forward(3) для трёх шагов.'},
  {at:1,label:'Вправо',code:'turn_right()',help:'Повернуться на 90° по часовой стрелке, не делая шага.'},
  {at:1,label:'Влево',code:'turn_left()',help:'Повернуться на 90° против часовой стрелки.'},
  {at:2,label:'Цикл for',code:'for i in range(3):\n    move_forward()',help:'Повторить действие три раза. Следующая строка должна иметь четыре пробела.'},
  {at:3,label:'Проверить путь',code:'front_is_clear()',help:'Вернёт True, если впереди нет препятствия.'},
  {at:3,label:'Условие if',code:'if front_is_clear():\n    move_forward()',help:'Шагнуть, только если путь впереди свободен.'},
  {at:4,label:'Собрать предмет',code:'collect()',help:'Подобрать игровую посылку или предмет на текущей клетке.'},
  {at:4,label:'Поставить блок',code:'place_block()',help:'Поставить доступный строительный блок, если игровая ситуация это позволяет.'},
];
function insertCommand(code){
  const input=$('codeInput'),start=input.selectionStart,end=input.selectionEnd;
  const before=input.value.slice(0,start),after=input.value.slice(end);
  const previous=before.split('\n').at(-1);
  const mustNewline=previous.trim().length>0;
  const indent=(previous.match(/^\s*/)||[''])[0];
  const chunk=(mustNewline?'\n':'')+code.split('\n').map((line,i)=>i===0?indent+line:indent+line).join('\n')+'\n';
  input.setRangeText(chunk,start,end,'end');
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus();
}
function renderCommandLibrary(){
  const root=$('commandButtons');if(!root)return;
  root.replaceChildren();
  const max=selected>=LEVELS.length?LEVELS.length:selected;
  for(const item of COMMAND_LIBRARY){
    if(item.at>max)continue;
    const b=document.createElement('button');b.type='button';b.className='command-button';b.title=item.help;
    const label=document.createElement('strong');label.textContent=item.label;
    const syntax=document.createElement('code');syntax.textContent=item.code.split('\n')[0];
    const hint=document.createElement('small');hint.textContent=item.help;
    b.append(label,syntax,hint);b.addEventListener('click',()=>insertCommand(item.code));root.append(b);
  }
}

function updateQuest(){
  renderQuests();
  const level=LEVELS[selected];
  const sandbox=selected>=LEVELS.length;
  $('missionOrdinal').textContent=String(Math.min(selected+1,LEVELS.length)).padStart(2,'0');
  $('missionTitle').textContent=sandbox?'Свободное исследование':level.name;
  $('missionTopic').textContent=sandbox?'Твой код — твои маршруты':level.topic;
  $('missionStory').textContent=sandbox?'Ты прошёл обучение! Пиши свои программы на Python, чтобы путешествовать по настоящей карте, смотреть дороги и постройки.':level.story;
  $('missionTask').textContent=sandbox?'Придумай собственный маршрут — команды работают и после прохождения всех миссий.':level.task;
  $('codeInput').value=codeDrafts[selected] ?? (sandbox?'# Свободный мир — твой Python!\n':level.starter);
  updateLines();renderCommandLibrary();
  $('hubHeadline').textContent=sandbox?'Мир открыт для исследований':`Миссия ${selected+1}: ${level.name}`;
  $('hubDescription').textContent='Город Москва · старт: Народного Ополчения, 12к4 · цель: к бабушке';
  $('lessonCommand').textContent=sandbox?'Твои программы':level.command;
  $('lessonExplain').textContent=sandbox?'Экспериментируй с командами, циклами for, проверками if и функциями.':level.explain;
  $('lessonExample').textContent=sandbox?'if front_is_clear():\n    move_forward()':level.example;
  feedback('Пиши Python и запускай. Герой повторит команды на карте.');
}
function updateLines(){
  const el=$('codeInput'),count=Math.max(5,el.value.split('\n').length);
  $('lineGutter').textContent=Array.from({length:count},(_,i)=>i+1).join('\n');
}
$('codeInput').addEventListener('input',()=>{codeDrafts[selected]=$('codeInput').value;updateLines();save();});
$('codeInput').addEventListener('scroll',()=>{$('lineGutter').scrollTop=$('codeInput').scrollTop;});
$('codeInput').addEventListener('keydown',e=>{
  const el=e.currentTarget;
  if(e.key==='Tab'){e.preventDefault();el.setRangeText('    ',el.selectionStart,el.selectionEnd,'end');updateLines();}
  if(e.key==='Enter'){
    e.preventDefault();const prefix=el.value.slice(0,el.selectionStart).split('\n').at(-1);
    const indent=(prefix.match(/^\s*/)?.[0]||'')+(prefix.trimEnd().endsWith(':')?'    ':'');
    el.setRangeText('\n'+indent,el.selectionStart,el.selectionEnd,'end');updateLines();
  }
});

function openEditor(){
  $('editorPanel').classList.remove('hidden');$('openCodeButton').classList.add('hidden');
  editorWasOpen=true;
}
function closeEditor(){
  $('editorPanel').classList.add('hidden');$('openCodeButton').classList.remove('hidden');
  editorWasOpen=false;
}
$('openCodeButton').addEventListener('click',openEditor);
$('closeEditor').addEventListener('click',closeEditor);
$('backToHub').addEventListener('click',closeEditor);
$('startButton').addEventListener('click',()=>{$('intro').classList.add('hidden');openEditor();});
$('exploreButton').addEventListener('click',()=>{$('intro').classList.add('hidden');closeEditor();});
$('helpButton').addEventListener('click',()=>{$('helpModal').classList.remove('hidden');});
$('helpClose').addEventListener('click',()=>{$('helpModal').classList.add('hidden');});
$('helpOk').addEventListener('click',()=>{$('helpModal').classList.add('hidden');});

// Real city views: only external links, opened on explicit user taps.
function setPanoramaLinks(kind, coords) {
  const panorama=$(`panorama${kind}Link`),map=$(`panorama${kind}Map`);
  for (const a of [panorama,map]) {
    a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.classList.add('unavailable');
  }
  if(!coords || coords.length!==2)return;
  const [lat,lon]=coords;
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
  panorama.href=panoramaUrl(lat,lon);map.href=mapUrl(lat,lon);
  for (const a of [panorama,map]) {a.removeAttribute('aria-disabled');a.classList.remove('unavailable');}
}
function updatePanoramaLinks(){
  if(!game.playerGlobal)return;
  const current=gridToLatLon(...game.playerGlobal);
  setPanoramaLinks('Current',current);
  setPanoramaLinks('Start',HOME);
  setPanoramaLinks('Goal',goalCoords);
  $('panoramaCurrentLabel').textContent=`${current[0].toFixed(5)}°, ${current[1].toFixed(5)}° · игровая позиция`;
  $('panoramaGoalLabel').textContent=goalCoords?'Демьяна Бедного, 1к5 · координаты подтверждены':'Корпус 1к5 ещё не найден точно. Ссылка пока недоступна.';
}
function closePanorama(){ $('panoramaModal').classList.add('hidden'); }
$('openPanoramaButton').addEventListener('click',()=>{updatePanoramaLinks();$('panoramaModal').classList.remove('hidden');});
$('panoramaClose').addEventListener('click',closePanorama);
$('panoramaDone').addEventListener('click',closePanorama);
$('panoramaModal').addEventListener('click',e=>{if(e.target===$('panoramaModal'))closePanorama();});
for(const id of ['panoramaCurrentLink','panoramaCurrentMap','panoramaStartLink','panoramaStartMap','panoramaGoalLink','panoramaGoalMap']) {
  $(id).addEventListener('click',event=>{
    if($(id).getAttribute('aria-disabled')==='true')event.preventDefault();
  });
}

$('nextButton').addEventListener('click',()=>{
  $('victory').classList.add('hidden');updateQuest();openEditor();
});
$('victoryExplore').addEventListener('click',()=>{$('victory').classList.add('hidden');closeEditor();});
$('hintButton').addEventListener('click',()=>feedback(LEVELS[selected]?.hint||'Используй циклы for и команды move_forward(), turn_left(), turn_right().'));
$('solutionButton').addEventListener('click',()=>{
  const example=LEVELS[selected]?.example;
  feedback(example ? `Пример (в редактор не вставляем): ${example.replaceAll('\n',' / ')}` : 'Составь собственный маршрут.', 'info');
});

function resetCurrentMission(){
  codeDrafts[selected]=LEVELS[selected]?.starter || '# Напиши новую программу!\n';
  $('codeInput').value=codeDrafts[selected];updateLines();save();
  feedback('Редактор очищен. Положение Данчезавра на карте сохранено.');
}
$('resetButton').addEventListener('click',()=>{if(!busy)resetCurrentMission();});
$('retryGoal').addEventListener('click',()=>{void loadGoal();});
$('restartJourney').addEventListener('click',async()=>{
  if(busy)return;
  if(!window.confirm('Начать путешествие из дома заново? Сбросится прохождение, но не уроки и код.'))return;
  completed=[];coins=0;selected=0;codeDrafts={};streetProgress=0;grandmaMet=false;chapterTwo=false;streetQuest=null;previousStreetTarget=null;restoredStreetTarget=null;
  await goToPlace(...HOME,true);game.goalGlobal=goalCell;updateGrandmaUI();
  updateQuest();updateGoalUI();showToast('Ты вернулся на Народного Ополчения, 12к4');
});
function workerStatus(message){$('pythonStatus').textContent=message;}
function spawnWorker(){
  ready=false;
  worker?.terminate();worker=new Worker('./src/python-worker.js');
  workerStatus('Загружаем Python 3…');
  worker.onmessage=onWorkerMessage;
  worker.onerror=e=>{ready=false;workerStatus('Python недоступен');feedback('Не получилось загрузить Python. Проверь интернет и перезагрузи страницу.','bad');busy=false;toggleBusy(false);};
  worker.postMessage({type:'init'});
}
function toggleBusy(value){
  busy=value;
  $('runButton').disabled=value;
  $('resetButton').disabled=value;
  $('runButton').textContent=value?'⏳ Выполняется…':'▶ Запустить код';
}
function onWorkerMessage({data}){
  if(data.type==='ready'){ready=true;workerStatus('● Python готов');return;}
  if(data.type==='load-error'){
    ready=false;workerStatus('Нет подключения');
    feedback(`Ошибка загрузки Python: ${data.error}`,'bad');return;
  }
  if(data.type!=='result'||data.job!==workerTicket)return;
  clearTimeout(runTimer);
  if(!data.ok){toggleBusy(false);feedback(`${data.error||'Неизвестная ошибка.'} Попробуй исправить код и снова запустить.`,'bad');return;}
  const steps=Array.isArray(data.actions)?data.actions:[];
  animateActions(steps).then(()=>{
    toggleBusy(false);
    if(data.print?.trim())feedback(`Вывод программы: ${data.print.trim()}`,'info');
    else feedback(steps.length?`Готово! Выполнено действий: ${steps.length}.`:'Код выполнен, но персонаж остался на месте.','good');
    checkStreetQuest(steps);updateGrandmaUI();checkQuest(steps,$('codeInput').value);updateMap();save();
  });
}
async function animateActions(actions){
  for(const action of actions){
    game.applyGeoAction(action);
    updateMap();
    await new Promise(resolve=>setTimeout(resolve,action.op==='move'?210:160));
  }
  maybeLoadRealWorld();
}
$('runButton').addEventListener('click',()=>{
  if(busy)return;
  if(!ready){feedback('Python ещё загружается. Для первого запуска нужен интернет.','info');return;}
  toggleBusy(true);workerTicket++;
  const job=workerTicket;
  feedback('Проверяем алгоритм и выполняем код…','info');
  worker.postMessage({type:'run',job,code:$('codeInput').value,world:game.getSnapshot()});
  clearTimeout(runTimer);
  runTimer=setTimeout(()=>{
    if(job!==workerTicket||!busy)return;
    workerTicket++;
    toggleBusy(false);feedback('Программа выполнялась слишком долго. Проверь, нет ли бесконечного цикла. Python перезапущен.','bad');
    spawnWorker();
  },8500);
});
function checkQuest(actions,code){
  if(selected>=LEVELS.length)return;
  const current=selected,moves=actions.filter(x=>x.op==='move').length;
  const turns=actions.filter(x=>x.op==='turn').length;
  const logic=[
    ()=> moves>=1,
    ()=> moves>=1 && turns>=1,
    ()=> moves>=2 && /\bfor\b/.test(code) && /\brange\s*\(/.test(code),
    ()=> /\bif\s+front_is_clear\s*\(/.test(code) && /\bmove_forward\s*\(/.test(code),
    ()=> grandmaMet
  ];
  if(!logic[current]()){
    if(current===4)feedback(grandmaMessage({hasGoal:!!goalCell,near:finishedGoal(game.playerGlobal,goalCell,2),hasParcel:streetProgress>=STREET_QUESTS.length,met:grandmaMet}),'info');
    return;
  }
  const level=LEVELS[current];completed.push(current);coins+=level.reward;selected=Math.min(LEVELS.length,completed.length);
  renderQuests();
  $('victoryText').textContent=current===4?'Ура! Данчезавр пришёл в гости к бабушке, а маршрут придумал ты сам!':`${level.name}: отлично! Сам написал работающий Python.`;
  $('victoryReward').textContent=`+${level.reward} 💎`;
  $('nextButton').textContent=selected===LEVELS.length?'Играть дальше →':'Следующая миссия →';
  $('victory').classList.remove('hidden');save();
}
function updateGrandmaUI(){
  const near=finishedGoal(game.playerGlobal,goalCell,2);
  const ready=canMeetGrandma({hasGoal:!!goalCell,near,hasParcel:streetProgress>=STREET_QUESTS.length,met:grandmaMet});
  $('grandmaTalk').disabled=!ready;
  $('grandmaMessage').textContent=grandmaMessage({hasGoal:!!goalCell,near,hasParcel:streetProgress>=STREET_QUESTS.length,met:grandmaMet});
  $('grandmaChapter').classList.toggle('hidden',!chapterTwo);
  game.grandmaMet=grandmaMet;
}
$('grandmaTalk').addEventListener('click',()=>{
  if(!canMeetGrandma({hasGoal:!!goalCell,near:finishedGoal(game.playerGlobal,goalCell,2),hasParcel:streetProgress>=STREET_QUESTS.length,met:grandmaMet}))return;
  grandmaMet=true;chapterTwo=true;coins+=300;
  feedback('Бабушка: «Данчезавр, спасибо за посылку! Ты отлично освоил Python. Теперь отправляйся исследовать новые районы!» +300 💎','good');
  showToast('👵 Бабушка встретила Данчезавра! Глава 2 открыта');
  updateGrandmaUI();renderQuests();checkQuest([], '');save();
});
function updateGoalUI(){
  if(!game.playerGlobal)return;
  const el=$('goalDirection'),distance=$('goalDistance');
  updateGrandmaUI();
  if(!goalCell){el.textContent='⏳ Ищем точную координату корпуса 1к5';distance.textContent='Миссия доступна после подтверждения адреса';return;}
  const [x,z]=game.playerGlobal,dir=directionToCell(x,z,...goalCell),latlon=gridToLatLon(x,z);
  const meters=Math.round(metersApart(latlon,goalCoords));
  el.textContent=finishedGoal([x,z],goalCell,2)?'🏠 Дом бабушки рядом!':`🧭 К бабушке: ${dir}`;
  distance.textContent=`До цели по прямой ≈ ${meters} м · маршрут по улицам длиннее`;
}
async function loadGoal(){
  if(goalCoords){game.setGoal(goalCell);updateGoalUI();return;}
  try{
    const point=await resolveGoal();
    goalCoords=[point.lat,point.lon];goalCell=toGrid(...goalCoords);
    game.setGoal(goalCell);updateGoalUI();updateMap();save();
    showToast('Адрес бабушки найден на карте!');
  }catch(e){
    $('goalDirection').textContent='📍 Адрес корпуса пока не удалось определить';
    $('goalDistance').textContent='Точные данные OSM недоступны. Нажми «Найти бабушку» ещё раз.';
    console.warn('Cannot resolve exact destination',e);
  }
}

// OpenStreetMap widget: visual context only; never implies the avatar's GPS position.
function slippy(lat,lon,zoom){
  const scale=256*2**zoom,phi=Math.max(-85,Math.min(85,lat))*Math.PI/180;
  return [(lon+180)/360*scale,(1-Math.log(Math.tan(phi)+1/Math.cos(phi))/Math.PI)/2*scale];
}
let lastTileKey='';
function updateMap(){
  if(!game.playerGlobal)return;
  const [lat,lon]=gridToLatLon(...game.playerGlobal);
  $('geoCoordinates').textContent=`${lat.toFixed(5)}°, ${lon.toFixed(5)}° · ${DIR_NAMES[game.heading]}`;
  updateGoalUI();
  if(!$('panoramaModal').classList.contains('hidden'))updatePanoramaLinks();
  const ground= Math.round(GRID_METERS*Math.cos(lat*Math.PI/180));
  $('mapMeters').textContent=`1 клетка ≈ ${ground} м`;
  const zoom=16,[worldX,worldY]=slippy(lat,lon,zoom),tx=Math.floor(worldX/256),ty=Math.floor(worldY/256);
  const tileKey=`${tx}:${ty}:${zoom}`;
  let tiles=$('mapTiles');
  if(tileKey!==lastTileKey){
    lastTileKey=tileKey;tiles.replaceChildren();
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const img=document.createElement('img');img.alt='';img.loading='lazy';img.referrerPolicy='strict-origin-when-cross-origin';
      img.src=`https://tile.openstreetmap.org/${zoom}/${tx+dx}/${ty+dy}.png`;
      img.style.position='absolute';img.style.width='256px';img.style.height='256px';
      img.dataset.dx=dx;img.dataset.dy=dy;tiles.appendChild(img);
    }
  }
  const vp=$('mapViewport'),width=vp.clientWidth||282,height=vp.clientHeight||201;
  for(const img of tiles.children){
    const dx=Number(img.dataset.dx),dy=Number(img.dataset.dy);
    img.style.left=`${width/2-(worldX-tx*256)+256*dx}px`;
    img.style.top=`${height/2-(worldY-ty*256)+256*dy}px`;
  }
  const spacing=(GRID_METERS/ (40075016.6856/2**zoom/256));
  $('mapViewport').style.setProperty('--cell-size',`${spacing}px`);
  $('mapViewport').style.setProperty('--cell-offset-x',`${((spacing/2-worldX%spacing)%spacing+spacing)%spacing}px`);
  $('mapViewport').style.setProperty('--cell-offset-y',`${((spacing/2-worldY%spacing)%spacing+spacing)%spacing}px`);
  const street=$('mapStreet');
  if(streetQuest){
    const [markLat,markLon]=gridToLatLon(...streetQuest.target);
    const [markerWX,markerWY]=slippy(markLat,markLon,zoom);
    const sl=width/2+markerWX-worldX,st=height/2+markerWY-worldY;
    street.style.left=`${sl}px`;street.style.top=`${st}px`;
    street.classList.toggle('hidden',sl<12||sl>width-12||st<12||st>height-12);
  }else street.classList.add('hidden');
  const goal=$('mapGoal');
  if(goalCoords){
    const [goalWX,goalWY]=slippy(...goalCoords,zoom);
    const left=width/2+goalWX-worldX,top=height/2+goalWY-worldY;
    if(left>=12&&left<=width-12&&top>=12&&top<=height-12){goal.classList.remove('hidden');goal.style.left=`${left}px`;goal.style.top=`${top}px`;}
    else goal.classList.add('hidden');
  }else goal.classList.add('hidden');
}
function draw(now){
  const delta=Math.min(.1,(now-frameStart)/1000||.016);frameStart=now;
  game.render(now,delta);requestAnimationFrame(draw);
}
$('game').addEventListener('pointerdown',e=>{touchX=e.clientX;});
$('game').addEventListener('pointermove',e=>{
  if(e.buttons===1&&touchX!==null){game.camYaw+=Math.max(-20,Math.min(20,e.clientX-touchX))*.009;touchX=e.clientX;}
});
$('game').addEventListener('pointerup',()=>{touchX=null;});
$('game').addEventListener('pointercancel',()=>{touchX=null;});
window.addEventListener('resize',updateMap);

async function maybeLoadRealWorld(force=false){
  if(!game.playerGlobal)return;
  const [gx,gz]=game.playerGlobal;
  if(!force&&fetchCenter&&Math.max(Math.abs(gx-fetchCenter[0]),Math.abs(gz-fetchCenter[1]))<15)return;
  const currentID=++fetchID;
  fetchCenter=[gx,gz];
  $('geoStatus').textContent='Загружаем реальные здания и дороги…';
  const corners=[gridToLatLon(gx-23,gz-23),gridToLatLon(gx+23,gz+23)];
  const south=Math.min(...corners.map(p=>p[0])),north=Math.max(...corners.map(p=>p[0]));
  const west=Math.min(...corners.map(p=>p[1])),east=Math.max(...corners.map(p=>p[1]));
  const bbox=`(${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)})`;
  const query=`[out:json][timeout:18];(way["building"]${bbox};way["highway"]${bbox};way["natural"="water"]${bbox};way["waterway"="riverbank"]${bbox};way["leisure"="park"]${bbox};way["landuse"~"forest|grass|meadow|recreation_ground|reservoir"]${bbox};);out geom;`;
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),19000);
  try{
    const response=await fetch('https://overpass.private.coffee/api/interpreter',{method:'POST',body:new URLSearchParams({data:query}),signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const json=await response.json();
    if(currentID!==fetchID)return;
    const features=parseOSM(json.elements||[]);
    if(!features.length)throw new Error('На участке нет доступных объектов');
    game.setFeatures(features,'osm');
    setStreetStage(true);
    $('geoStatus').textContent=`3D из OpenStreetMap · объектов: ${features.length}`;
    updateMap();
  }catch(e){
    if(currentID!==fetchID)return;
    game.setFeatures([],'stylized');
    setStreetStage(true);
    $('geoStatus').textContent='3D-деморежим · карта OSM доступна отдельно';
    if(e?.name!=='AbortError')console.warn('OpenStreetMap 3D import unavailable',e);
  }finally{clearTimeout(timer);}
}

async function goToPlace(lat,lon,reset=true){
  place=[lat,lon];fetchID++;fetchCenter=null;
  game.setPlace(lat,lon);game.goalGlobal=goalCell;
  if(reset){completed=[];coins=0;selected=0;streetProgress=0;streetQuest=null;previousStreetTarget=null;restoredStreetTarget=null;updateQuest();}
  else{
    game.playerGlobal=saved?.position?.length===2?saved.position:[...game.spawn];
    game.heading=Number.isInteger(saved?.heading)?saved.heading:3;
    game.crystalTaken=Boolean(saved?.crystalTaken);
    game.bridgeBuilt=Boolean(saved?.bridgeBuilt);
    game.geoCenter=[...game.playerGlobal];game.rebuild();updateQuest();
  }
  setStreetStage(!reset);updateMap();save();
  await maybeLoadRealWorld(true);
}
// Location picker removed: the story uses a fixed starting location.

// Start: no geolocation permission, no account, no player position sent to any game server.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
spawnWorker();
void goToPlace(place[0],place[1],false).then(loadGoal).catch(console.error);
requestAnimationFrame(draw);

// v0.9: panels are collapsed by default so the playable city remains visible.
function attachPanelToggle(buttonId, panelId, expandedLabel){
  const button=document.getElementById(buttonId),panel=document.getElementById(panelId);
  if(!button||!panel)return;
  button.addEventListener('click',()=>{
    const expanded=panel.classList.toggle('expanded');
    panel.classList.toggle('compact',!expanded);
    button.setAttribute('aria-expanded',String(expanded));
    if(expandedLabel)button.textContent=expanded?expandedLabel:'🗺 Карта ▸';
  });
}
attachPanelToggle('toggleQuests','questRail');
attachPanelToggle('toggleJourney','journeyCard');
attachPanelToggle('toggleStreet','streetQuest');
attachPanelToggle('toggleMap','worldMap','🗺 Свернуть карту');
const editorExpand=document.getElementById('editorExpand');
editorExpand?.addEventListener('click',()=>{
  const full=document.getElementById('editorPanel').classList.toggle('editor-full');
  editorExpand.setAttribute('aria-expanded',String(full));
  editorExpand.textContent=full?'↕ Свернуть редактор':'↕ Развернуть редактор';
});
