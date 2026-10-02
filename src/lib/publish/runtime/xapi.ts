/**
 * xAPI (Tin Can) adapter script for the exported player: sends initialized,
 * progressed, scored, completed, passed, failed and exited statements to the
 * configured LRS. Returns a JS string injected into index.html as window.__LMS.
 */
export interface XapiRuntimeOpts {
  endpoint: string;
  actorName: string;
  actorMbox: string;
  authToken: string; // Base64 basic auth
  activityId: string;
  activityName: string;
}

const esc = (s: string) => JSON.stringify(s);

export function buildXapiRuntime(opts: XapiRuntimeOpts): string {
  const endpoint = (opts.endpoint || '').replace(/"/g, '');
  const actorName = (opts.actorName || 'Learner').replace(/"/g, '');
  const actorMbox = (opts.actorMbox || 'mailto:learner@example.com').replace(/"/g, '');
  const auth = (opts.authToken || '').replace(/"/g, '');
  const activityId = (opts.activityId || `https://chronicle.publisher/course/${Date.now()}`).replace(/"/g, '');
  const activityName = (opts.activityName || 'eLearning Course').replace(/"/g, '');
  return `
window.__LMS = (function(){
  var ENDPOINT=${esc(endpoint)};
  var ACTOR={name:${esc(actorName)},mbox:${esc(actorMbox.startsWith('mailto:')?actorMbox:'mailto:'+actorMbox)}};
  var AUTH=${esc(auth)};
  var ACTIVITY={id:${esc(activityId)},definition:{name:{"en-US":${esc(activityName)}},type:"http://adlnet.gov/expapi/activities/course"}};
  function send(verbId,verbDisplay,extra){
    if(!ENDPOINT)return;
    var stmt={actor:ACTOR,verb:{id:verbId,display:{"en-US":verbDisplay}},object:ACTIVITY,timestamp:new Date().toISOString()};
    if(extra)stmt.result=extra;
    try{
      var url=ENDPOINT.replace(/\\/$/,"")+"/statements";
      var xhr=new XMLHttpRequest();
      xhr.open("POST",url,true);
      xhr.setRequestHeader("Content-Type","application/json");
      xhr.setRequestHeader("X-Experience-API-Version","1.0.3");
      if(AUTH)xhr.setRequestHeader("Authorization","Basic "+AUTH);
      xhr.send(JSON.stringify(stmt));
    }catch(e){}
  }
  send("http://adlnet.gov/expapi/verbs/initialized","initialized");
  window.addEventListener("beforeunload",function(){send("http://adlnet.gov/expapi/verbs/exited","exited")});
  return {
    api:null,
    setLocation:function(loc){send("http://adlnet.gov/expapi/verbs/progressed","progressed",{extensions:{"https://w3id.org/xapi/cmi5/result/extensions/progress":loc}});},
    setStatus:function(status){
      var verb=(status==="passed")?"http://adlnet.gov/expapi/verbs/passed":(status==="failed"?"http://adlnet.gov/expapi/verbs/failed":"http://adlnet.gov/expapi/verbs/completed");
      send(verb,status);
    },
    setScore:function(scaled,raw,min,max){
      var r={};
      if(typeof scaled==="number")r.scaled=Math.max(-1,Math.min(1,scaled));
      if(typeof raw==="number")r.raw=raw;
      if(typeof min==="number")r.min=min;
      if(typeof max==="number")r.max=max;
      send("http://adlnet.gov/expapi/verbs/scored","scored",{score:r});
    },
    finish:function(){}
  };
})();`;
}
