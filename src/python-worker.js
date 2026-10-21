/* True CPython via Pyodide WebAssembly in a disposable Web Worker. */
const BASE='https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
let python=null,bootstrap=null, initPromise=null;
function ensurePython(){
  if(!initPromise)initPromise=(async()=>{
    importScripts(BASE+'pyodide.js');
    python=await loadPyodide({indexURL:BASE});
    const r=await fetch('./python_bootstrap.py');
    if(!r.ok)throw new Error('Файл Python недоступен.');
    bootstrap=await r.text();
  })();
  return initPromise;
}
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{await ensurePython();self.postMessage({type:'ready'});}
    catch(err){self.postMessage({type:'load-error',error:String(err)});}return;
  }
  if(data.type!=='run')return;
  try{
    await ensurePython();
    python.globals.set('WORLD_STATE_JSON',JSON.stringify(data.world));
    python.globals.set('USER_CODE',data.code);
    await python.runPythonAsync(bootstrap);
    const v=JSON.parse(python.globals.get('LAST_RESULT_JSON'));
    self.postMessage({type:'result',job:data.job,...v});
  }catch(err){self.postMessage({type:'result',job:data.job,ok:false,error:String(err),actions:[]});}
};
