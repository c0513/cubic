// The starting building is geocoded from a published map location.
// Destination must resolve to the exact building, never to another house.
export const FIRST_JOURNEY = Object.freeze({
  start: { name: 'Старт: Народного Ополчения, 12к4', lat:55.772087, lon:37.479654 },
  goal: { name: 'Бабушка: Демьяна Бедного, 1к5', query: 'Москва, улица Демьяна Бедного, дом 1, корпус 5' }
});
export function metersApart(a,b){
  const R=6371000, rad=Math.PI/180, dLat=(b[0]-a[0])*rad, dLon=(b[1]-a[1])*rad;
  const q=Math.sin(dLat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(q)));
}
export function directionToCell(x,z,gx,gz){
  const dx=gx-x,dz=gz-z;
  if(dx===0&&dz===0)return 'Ты у цели!';
  const dirs=[];if(dz<0)dirs.push('север');if(dz>0)dirs.push('юг');if(dx<0)dirs.push('запад');if(dx>0)dirs.push('восток');return dirs.join(' + ');
}
export function finishedGoal(position, goal, tolerance=1){
  return !!goal&&Math.max(Math.abs(position[0]-goal[0]),Math.abs(position[1]-goal[1]))<=tolerance;
}
function exactAddress(obj){
  const text=[obj.display_name,obj.name,obj?.address?.house_number,obj?.address?.road].filter(Boolean).join(' ').toLowerCase().replace(/ё/g,'е');
  const numberMatch=/(?:^|\D)1\s*(?:к|корп(?:ус)?\.?|корпус)\s*5(?:\D|$)/i;
  return text.includes('демьяна бедного')&&numberMatch.test(text);
}
export async function resolveGoal(fetchImpl=fetch){
  // Try exact-address Nominatim first, then address-tagged OSM buildings via Overpass.
  // Nearby houses must NEVER silently replace the requested exact address.
  let lastError='Адрес не найден';
  try {
    const q=FIRST_JOURNEY.goal.query;
    const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&accept-language=ru&q=${encodeURIComponent(q)}`;
    const response=await fetchImpl(url);
    if(!response.ok)throw new Error(`Nominatim HTTP ${response.status}`);
    const matches=await response.json();
    const match=matches.find(exactAddress);
    if(match){
      const lat=Number(match.lat),lon=Number(match.lon);
      if(Number.isFinite(lat)&&Number.isFinite(lon)&&metersApart([55.771,37.483],[lat,lon])<1500)
        return {lat,lon,label:match.display_name};
    }
  }catch(err){lastError=String(err);}
  try{
    const query=`[out:json][timeout:15];(nwr["addr:housenumber"~"^1 *(?:к|корпус|корп) *5$"]["addr:street"~"Демьяна Бедного"](55.765,37.474,55.778,37.496););out center;`;
    const response=await fetchImpl('https://overpass.private.coffee/api/interpreter', {
      method:'POST',body:new URLSearchParams({data:query})
    });
    if(!response.ok)throw new Error(`Overpass HTTP ${response.status}`);
    const data=await response.json();
    const match=(data.elements||[]).find(el=>el.tags?.['addr:housenumber']&&
      /^1\s*(?:к|корпус|корп)\s*5$/i.test(el.tags['addr:housenumber']) &&
      (el.tags['addr:street']||'').toLowerCase().includes('демьяна бедного'));
    const lat=Number(match?.lat??match?.center?.lat),lon=Number(match?.lon??match?.center?.lon);
    if(match&&Number.isFinite(lat)&&Number.isFinite(lon)&&metersApart([55.771,37.483],[lat,lon])<1500)
      return {lat,lon,label:'Москва, улица Демьяна Бедного, 1к5'};
  }catch(err){lastError=String(err);}
  throw new Error(`Точные координаты 1к5 не подтверждены. ${lastError}`);
}
