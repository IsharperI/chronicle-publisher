/** SCORM 1.2 runtime API wrapper script. Returns a JS string injected into index.html.
 *
 * Implements:
 *  - Standard SCORM 1.2 API discovery (parent + opener frame traversal, up to 500 levels).
 *  - LMSInitialize("") on load with return-value check (logs warning on failure).
 *  - LMSCommit("") after every LMSSetValue.
 *  - Session timer: starts on init, formatted as hh:mm:ss and reported via cmi.core.session_time on finish.
 *  - LMSFinish("") on beforeunload / pagehide.
 *  - No score is written until a quiz is scored, so courses without quizzes
 *    don't show up in LMS reports as "0%".
 */
export function buildScorm12Runtime(): string {
  return `
window.__LMS = (function(){
  function findAPI(win){
    var tries=0;
    while(win&&tries<500){
      try{ if(win.API) return win.API; }catch(e){}
      try{ if(win.parent&&win.parent!==win){ win=win.parent; tries++; continue; } }catch(e){}
      break;
    }
    return null;
  }
  function getAPI(){
    var api=null;
    try{ api=findAPI(window); }catch(e){}
    if(!api){ try{ if(window.opener&&!window.opener.closed) api=findAPI(window.opener); }catch(e){} }
    if(!api){ try{ if(window.top&&window.top!==window) api=findAPI(window.top); }catch(e){} }
    return api;
  }
  var API=getAPI();
  var initialized=false;
  var sessionStart=0;

  function pad(n){ n=Math.floor(n); return (n<10?"0":"")+n; }
  function formatSessionTime(ms){
    if(!ms||ms<0) ms=0;
    var totalSec=Math.floor(ms/1000);
    var h=Math.floor(totalSec/3600);
    var m=Math.floor((totalSec%3600)/60);
    var s=totalSec%60;
    return pad(h)+":"+pad(m)+":"+pad(s);
  }

  function set(k,v){
    if(!API||!initialized) return false;
    try{
      var r=API.LMSSetValue(k,String(v));
      try{ API.LMSCommit(""); }catch(e){}
      return r==="true"||r===true;
    }catch(e){ return false; }
  }
  function commit(){ if(API&&initialized){ try{ API.LMSCommit(""); }catch(e){} } }

  function init(){
    if(!API){
      try{ console.warn("[SCORM 1.2] API not found - tracking disabled."); }catch(e){}
      return;
    }
    try{
      var r=API.LMSInitialize("");
      if(r!=="true"&&r!==true){
        try{ console.warn("[SCORM 1.2] LMSInitialize returned false - tracking may not work."); }catch(e){}
      } else {
        initialized=true;
        sessionStart=Date.now();
        // Mark in-progress if still not attempted.
        try{
          var ls=API.LMSGetValue("cmi.core.lesson_status");
          if(!ls||ls==="not attempted"||ls===""){
            set("cmi.core.lesson_status","incomplete");
          }
        }catch(e){}
      }
    }catch(e){
      try{ console.warn("[SCORM 1.2] LMSInitialize threw:", e); }catch(e2){}
    }
  }

  function finish(){
    if(!API||!initialized) return;
    try{
      var elapsed=sessionStart>0?(Date.now()-sessionStart):0;
      set("cmi.core.session_time", formatSessionTime(elapsed));
      commit();
      API.LMSFinish("");
    }catch(e){}
    initialized=false;
  }

  init();
  window.addEventListener("beforeunload", finish);
  window.addEventListener("pagehide", finish);
  window.addEventListener("unload", finish);

  return {
    api: API,
    isInitialized: function(){ return initialized; },
    setLocation: function(loc){ set("cmi.core.lesson_location", String(loc)); },
    setStatus: function(status){
      // status: passed | failed | completed | incomplete | browsed | not attempted
      set("cmi.core.lesson_status", status);
    },
    setScore: function(scaled, raw, min, max){
      if(typeof min==="number") set("cmi.core.score.min", String(min)); else set("cmi.core.score.min","0");
      if(typeof max==="number") set("cmi.core.score.max", String(max)); else set("cmi.core.score.max","100");
      if(typeof raw==="number") set("cmi.core.score.raw", String(Math.round(raw)));
    },
    commit: commit,
    finish: finish
  };
})();`;
}
