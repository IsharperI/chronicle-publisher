/** SCORM 2004 runtime API wrapper script. */
export function buildScorm2004Runtime(): string {
  return `
window.__LMS = (function(){
  var API=null;
  function find(w){try{if(w.API_1484_11)return w.API_1484_11}catch(e){}try{if(w.parent&&w.parent!==w)return find(w.parent)}catch(e){}try{if(w.top&&w.top.API_1484_11)return w.top.API_1484_11}catch(e){}return null}
  try{API=find(window)}catch(e){}
  var initialized=false;
  function init(){if(API&&!initialized){try{API.Initialize("");initialized=true}catch(e){}}}
  function set(k,v){if(API)try{API.SetValue(k,String(v))}catch(e){}}
  function commit(){if(API)try{API.Commit("")}catch(e){}}
  function finish(){if(API&&initialized)try{API.Terminate("");initialized=false}catch(e){}}
  init();
  window.addEventListener("beforeunload",finish);
  return {
    api:API,
    setLocation:function(loc){set("cmi.location",String(loc));commit();},
    setStatus:function(status){
      // Map SCORM 1.2-style status to 2004 dual axes.
      if(status==="passed"){set("cmi.completion_status","completed");set("cmi.success_status","passed")}
      else if(status==="failed"){set("cmi.completion_status","completed");set("cmi.success_status","failed")}
      else if(status==="completed"){set("cmi.completion_status","completed")}
      else if(status==="incomplete"){set("cmi.completion_status","incomplete")}
      commit();
    },
    setScore:function(scaled,raw,min,max){
      if(typeof scaled==="number")set("cmi.score.scaled",String(Math.max(-1,Math.min(1,scaled))));
      if(typeof raw==="number")set("cmi.score.raw",String(raw));
      if(typeof min==="number")set("cmi.score.min",String(min));
      if(typeof max==="number")set("cmi.score.max",String(max));
      commit();
    },
    finish:finish
  };
})();`;
}
