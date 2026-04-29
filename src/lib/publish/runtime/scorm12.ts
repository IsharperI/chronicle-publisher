/** SCORM 1.2 runtime API wrapper script. Returns a JS string injected into index.html. */
export function buildScorm12Runtime(): string {
  return `
window.__LMS = (function(){
  var API=null;
  function find(w){try{if(w.API)return w.API}catch(e){}try{if(w.parent&&w.parent!==w)return find(w.parent)}catch(e){}try{if(w.top&&w.top.API)return w.top.API}catch(e){}return null}
  try{API=find(window)}catch(e){}
  var initialized=false;
  function init(){if(API&&!initialized){try{API.LMSInitialize("");initialized=true}catch(e){}}}
  function set(k,v){if(API)try{API.LMSSetValue(k,String(v))}catch(e){}}
  function commit(){if(API)try{API.LMSCommit("")}catch(e){}}
  function finish(){if(API&&initialized)try{API.LMSFinish("");initialized=false}catch(e){}}
  init();
  window.addEventListener("beforeunload",finish);
  return {
    api:API,
    setLocation:function(loc){set("cmi.core.lesson_location",String(loc));commit();},
    setStatus:function(status){
      // status: passed | failed | completed | incomplete | browsed | not attempted
      set("cmi.core.lesson_status",status);commit();
    },
    setScore:function(scaled,raw,min,max){
      if(typeof raw==="number")set("cmi.core.score.raw",String(raw));
      if(typeof min==="number")set("cmi.core.score.min",String(min));
      if(typeof max==="number")set("cmi.core.score.max",String(max));
      commit();
    },
    finish:finish
  };
})();`;
}
