/** SCORM 2004 runtime API wrapper script. Returns a JS string injected into index.html.
 *
 *  - Finds API_1484_11 in parent frames and calls Initialize("") on load.
 *  - Marks a new attempt "incomplete" so the LMS shows it as started.
 *  - getSuspend/setSuspend: cmi.suspend_data (the player saves hub progress there).
 *  - On leaving: reports cmi.session_time (ISO 8601, e.g. PT1H5M30S), sets
 *    cmi.exit ("suspend" until complete, so the LMS keeps the bookmark), then
 *    Terminate("").
 */
export function buildScorm2004Runtime(): string {
  return `
window.__LMS = (function(){
  var API=null;
  function find(w){try{if(w.API_1484_11)return w.API_1484_11}catch(e){}try{if(w.parent&&w.parent!==w)return find(w.parent)}catch(e){}try{if(w.top&&w.top.API_1484_11)return w.top.API_1484_11}catch(e){}return null}
  try{API=find(window)}catch(e){}
  var initialized=false;
  var sessionStart=0,completed=false;
  function init(){
    if(API&&!initialized){
      try{API.Initialize("");initialized=true;sessionStart=Date.now()}catch(e){}
      try{var cs=API.GetValue("cmi.completion_status");if(cs==="completed")completed=true;
        else if(!cs||cs==="unknown"||cs==="not attempted"){API.SetValue("cmi.completion_status","incomplete");API.Commit("")}}catch(e){}
    }
  }
  function isoDuration(ms){var t=Math.max(0,Math.floor(ms/1000));var h=Math.floor(t/3600),m=Math.floor((t%3600)/60),sec=t%60;return "PT"+h+"H"+m+"M"+sec+"S"}
  function set(k,v){if(API)try{API.SetValue(k,String(v))}catch(e){}}
  function commit(){if(API)try{API.Commit("")}catch(e){}}
  function finish(){
    if(!API||!initialized)return;
    initialized=false;
    try{API.SetValue("cmi.session_time",isoDuration(Date.now()-sessionStart))}catch(e){}
    try{API.SetValue("cmi.exit",completed?"normal":"suspend")}catch(e){}
    try{API.Commit("")}catch(e){}
    try{API.Terminate("")}catch(e){}
  }
  init();
  window.addEventListener("beforeunload",finish);
  window.addEventListener("pagehide",finish);
  return {
    api:API,
    setLocation:function(loc){set("cmi.location",String(loc));commit();},
    setStatus:function(status){
      // Map SCORM 1.2-style status to 2004 dual axes.
      if(status==="passed"||status==="failed"||status==="completed")completed=true;
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
    /* Saved progress (hub ticks), kept by the LMS between sessions. */
    getSuspend:function(){if(!API||!initialized)return "";try{return String(API.GetValue("cmi.suspend_data")||"")}catch(e){return ""}},
    setSuspend:function(v){v=String(v||"");if(v.length<=64000){set("cmi.suspend_data",v);commit()}},
    finish:finish
  };
})();`;
}
