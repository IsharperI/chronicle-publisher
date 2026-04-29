import type { CourseState } from '@/types/course';
import { safeColor, safeFontFamily, safeNumber, safeImageSrc, safeEnum } from '../../sanitize';
import { themeVarCssText } from '../../themeVars';
import type { PublishOptions } from '../types';

/**
 * Builds the self-contained index.html for the published package. The HTML
 * contains a JSON blob with all course data (slides, masters, settings) plus a
 * runtime script that renders every slide and element type identically to the
 * in-app preview player. The LMS adapter is injected separately as
 * `window.__LMS` (see runtime/scorm12.ts, scorm2004.ts, xapi.ts).
 */
export function buildPlayerHtml(state: CourseState, opts: PublishOptions, lmsRuntime: string): string {
  const courseData = JSON.stringify({
    slides: state.slides,
    masterSlides: state.masterSlides,
    playerSettings: state.playerSettings,
    courseSettings: state.courseSettings,
  });

  const rawPs = state.playerSettings;
  const ps = {
    backgroundColor: safeColor(rawPs.backgroundColor, '#1a1a2e'),
    buttonColor: safeColor(rawPs.buttonColor, '#3b82f6'),
    buttonBorderRadius: safeNumber(rawPs.buttonBorderRadius, 6, 0, 200),
    fontFamily: safeFontFamily(rawPs.fontFamily),
    navigationMode: safeEnum(rawPs.navigationMode, ['free', 'restricted'] as const, 'free'),
    backgroundImage: safeImageSrc(rawPs.backgroundImage),
    backgroundMode: safeEnum(rawPs.backgroundMode, ['stretch', 'fit', 'tile'] as const, 'stretch'),
    courseTitle: (opts.courseTitle || rawPs.courseTitle || 'Untitled Course').slice(0, 200),
    sidebarPosition: safeEnum(rawPs.sidebarPosition, ['left', 'right', 'none'] as const, 'left'),
    tabMenu: !!(rawPs.playerTabs?.showMenu ?? true),
    tabNotes: !!(rawPs.playerTabs?.showNotes ?? true),
    ctrlPlayPause: !!(rawPs.playerControls?.showPlayPause ?? true),
    ctrlCaptions: !!(rawPs.playerControls?.showCaptions ?? true),
  };
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const titleSafe = escapeHtml(ps.courseTitle);
  const dims = {
    width: safeNumber(state.courseSettings.canvasDimensions.width, 1024, 320, 7680),
    height: safeNumber(state.courseSettings.canvasDimensions.height, 768, 240, 4320),
  };
  const aspect = `${dims.width}/${dims.height}`;

  const safeThemeColors = (state.courseSettings.themeColors ?? []).map((c) => safeColor(c, '#000000'));
  const themeVarsCss = themeVarCssText(safeThemeColors);

  // Embed completion config so the runtime can decide when to mark complete.
  const completionConfig = JSON.stringify(opts.completion || { mode: 'percent', percent: 100 });
  const reportStatusConfig = JSON.stringify(opts.reportStatus || 'passed-incomplete');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${titleSafe}</title>
<style>
:root{${themeVarsCss}}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{background-color:${ps.backgroundColor};${ps.backgroundImage ? `background-image:url("${ps.backgroundImage.replace(/"/g, '%22')}");${ps.backgroundMode === 'stretch' ? 'background-size:100% 100%;background-repeat:no-repeat;' : ps.backgroundMode === 'fit' ? 'background-size:contain;background-repeat:no-repeat;background-position:center;' : 'background-repeat:repeat;background-size:auto;'}` : ''}font-family:${ps.fontFamily};color:#fff;display:flex;flex-direction:column;min-height:100vh}
#topbar{flex:0 0 auto;height:48px;display:flex;align-items:center;padding:0 20px;background:rgba(0,0,0,.35);backdrop-filter:blur(6px);border-bottom:1px solid rgba(255,255,255,.08)}
#topbar h1{font-size:14px;font-weight:600;letter-spacing:.02em;margin:0}
#topbar .meta{margin-left:auto;font-size:12px;color:rgba(255,255,255,.6)}
#body{flex:1 1 auto;display:flex;min-height:0}
#sidebar{width:256px;flex-shrink:0;display:flex;flex-direction:column;background:rgba(0,0,0,.3);backdrop-filter:blur(6px)}
#sidebar.left{border-right:1px solid rgba(255,255,255,.08)}
#sidebar.right{border-left:1px solid rgba(255,255,255,.08);order:2}
#sidebar .tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.08)}
#sidebar .tabs button{flex:1;background:transparent;border:none;color:rgba(255,255,255,.6);font-size:12px;font-weight:500;padding:10px;cursor:pointer;font-family:${ps.fontFamily};border-bottom:2px solid transparent}
#sidebar .tabs button.active{color:#fff;border-bottom-color:${ps.buttonColor}}
#sidebar .pane{flex:1;overflow-y:auto;padding:12px;font-size:12px;color:rgba(255,255,255,.9)}
#sidebar .menu-list{list-style:none;margin:0;padding:0}
#sidebar .menu-list li{margin-bottom:4px}
#sidebar .menu-list button{width:100%;text-align:left;padding:8px 10px;border-radius:4px;background:transparent;border:none;color:rgba(255,255,255,.7);font-size:12px;cursor:pointer;font-family:${ps.fontFamily}}
#sidebar .menu-list button:hover{background:rgba(255,255,255,.05)}
#sidebar .menu-list button.active{color:#fff;background:${ps.buttonColor}33}
#notes-pane{white-space:pre-wrap;line-height:1.5}
#notes-pane.empty{color:rgba(255,255,255,.4);font-style:italic}
#stage-area{flex:1;display:flex;align-items:center;justify-content:center;min-width:0;padding:16px;order:1}
#stage-wrapper{position:relative;width:100%;max-width:${Math.min(dims.width, 1280)}px;aspect-ratio:${aspect};overflow:hidden;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.4);background:#000}
#stage{position:absolute;top:0;left:0;width:${dims.width}px;height:${dims.height}px;transform-origin:top left;background:#fff;opacity:1;transition:opacity .25s ease-in-out}
#stage.fading{opacity:0}
#cc-overlay{position:absolute;left:5%;right:5%;bottom:6%;text-align:center;pointer-events:none;z-index:50;font-family:${ps.fontFamily}}
#cc-overlay span{display:inline-block;background:rgba(0,0,0,0.75);color:#fff;padding:8px 16px;border-radius:6px;font-size:clamp(12px,2.4vw,28px);line-height:1.3;max-width:90%;white-space:pre-wrap}
.el{position:absolute;transition:all .2s ease}
@keyframes anim-fade-in{from{opacity:0}to{opacity:1}}
@keyframes anim-fade-out{from{opacity:1}to{opacity:0}}
@keyframes anim-fly-in-left{from{opacity:0;transform:translateX(-100%)}to{opacity:1;transform:translateX(0)}}
@keyframes anim-fly-in-right{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}
@keyframes anim-fly-out-left{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-100%)}}
@keyframes anim-fly-out-right{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(100%)}}
.anim-fade-in{animation:anim-fade-in .5s ease forwards}
.anim-fade-out{animation:anim-fade-out .5s ease forwards}
.anim-fly-in-left{animation:anim-fly-in-left .5s ease forwards}
.anim-fly-in-right{animation:anim-fly-in-right .5s ease forwards}
.anim-fly-out-left{animation:anim-fly-out-left .5s ease forwards}
.anim-fly-out-right{animation:anim-fly-out-right .5s ease forwards}
#controls{flex:0 0 auto;height:56px;display:flex;gap:8px;align-items:center;justify-content:center;padding:0 20px;background:rgba(0,0,0,.4);backdrop-filter:blur(6px);border-top:1px solid rgba(255,255,255,.08)}
#controls button{padding:8px 18px;border:none;border-radius:${ps.buttonBorderRadius}px;background:${ps.buttonColor};color:#fff;font-size:13px;cursor:pointer;font-weight:500;font-family:${ps.fontFamily};display:inline-flex;align-items:center;gap:4px}
#controls button:hover{filter:brightness(1.15)}
#controls button:disabled{opacity:.4;cursor:default;filter:none}
#controls #cc.off{opacity:.55}
</style>
</head>

<body>
<div id="topbar">
  <h1>${titleSafe}</h1>
  <span class="meta" id="meta"></span>
</div>
<div id="body">
  ${ps.sidebarPosition !== 'none' && (ps.tabMenu || ps.tabNotes) ? `<aside id="sidebar" class="${ps.sidebarPosition}">
    <div class="tabs">
      ${ps.tabMenu ? '<button id="tab-menu" class="active" data-tab="menu">Menu</button>' : ''}
      ${ps.tabNotes ? `<button id="tab-notes"${ps.tabMenu ? '' : ' class="active"'} data-tab="notes">Notes</button>` : ''}
    </div>
    ${ps.tabMenu ? '<div class="pane" id="menu-pane"><ul class="menu-list" id="slideList"></ul></div>' : ''}
    ${ps.tabNotes ? `<div class="pane" id="notes-pane"${ps.tabMenu ? ' style="display:none"' : ''}></div>` : ''}
  </aside>` : ''}
  <div id="stage-area">
    <div id="stage-wrapper"><div id="stage"></div><div id="cc-overlay" aria-live="polite"></div></div>
  </div>
</div>
<div id="controls">
  <button id="prev">&#9664; Prev</button>
  ${ps.ctrlPlayPause ? '<button id="playpause" aria-label="Play">&#9658;</button>' : ''}
  <button id="next">Next &#9654;</button>
  ${ps.ctrlCaptions ? '<button id="cc" aria-pressed="true" title="Toggle captions">CC</button>' : ''}
</div>
<script>
window.COURSE_DATA=${courseData.replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--')};
window.__PUBLISH_OPTS={completion:${completionConfig},reportStatus:${reportStatusConfig}};
</script>
<script>${lmsRuntime}</script>
<script>${PLAYER_RUNTIME(dims)}</script>
</body>
</html>`;
}

/** The slide-rendering runtime. Renders every element type and slide kind. */
function PLAYER_RUNTIME(dims: { width: number; height: number }): string {
  return `
(function(){
  var LMS=window.__LMS||{setLocation:function(){},setStatus:function(){},setScore:function(){},finish:function(){}};
  var PUB=window.__PUBLISH_OPTS||{completion:{mode:"percent",percent:100},reportStatus:"passed-incomplete"};
  var data=window.COURSE_DATA;
  var slides=data.slides||[];
  var masters=data.masterSlides||[];
  var ps=data.playerSettings||{};
  var navMode=ps.navigationMode||"free";
  var current=0;
  var unlocked=false;
  var stage=document.getElementById("stage");
  var meta=document.getElementById("meta");
  var prevBtn=document.getElementById("prev");
  var nextBtn=document.getElementById("next");
  var slideListEl=document.getElementById("slideList");
  var notesPane=document.getElementById("notes-pane");
  var menuPane=document.getElementById("menu-pane");
  var tabMenuBtn=document.getElementById("tab-menu");
  var tabNotesBtn=document.getElementById("tab-notes");
  var ppBtn=document.getElementById("playpause");

  // === Track visited slides for percent-based completion ===
  var visited={};
  var courseCompletionReported=false;

  (function(){
    var wrapper=document.getElementById("stage-wrapper");
    var cs=(data.courseSettings&&data.courseSettings.transition)||{type:"fade",duration:1,color:"#000000"};
    if(wrapper)wrapper.style.background=cs.color||"#000000";
  })();

  function scaleStage(){
    var wrapper=document.getElementById("stage-wrapper");
    if(!wrapper)return;
    var w=wrapper.clientWidth,h=wrapper.clientHeight;
    if(!w||!h)return;
    var sx=w/${dims.width},sy=h/${dims.height};
    var s=Math.min(sx,sy);
    if(!isFinite(s)||s<=0)s=1;
    stage.style.transform="scale("+s+")";
  }
  window.addEventListener("resize",scaleStage);
  window.addEventListener("load",scaleStage);
  scaleStage();
  setTimeout(scaleStage,0);
  setTimeout(scaleStage,100);

  function buildMenu(){
    if(!slideListEl)return;
    slideListEl.innerHTML="";
    for(var i=0;i<slides.length;i++){
      (function(idx){
        var li=document.createElement("li");
        var b=document.createElement("button");
        b.type="button";
        var t=slides[idx]&&slides[idx].title;
        b.textContent=(t&&(""+t).replace(/^\\s+|\\s+$/g,""))||("Slide "+(idx+1));
        if(idx===current)b.className="active";
        b.onclick=function(){goTo(idx)};
        li.appendChild(b);
        slideListEl.appendChild(li);
      })(i);
    }
  }

  function updateNotes(){
    if(!notesPane)return;
    var s=slides[current];
    var n=(s&&s.notes)||"";
    if(n&&n.trim()){notesPane.textContent=n;notesPane.classList.remove("empty")}
    else{notesPane.textContent="No notes for this slide.";notesPane.classList.add("empty")}
  }

  function activateTab(name){
    if(tabMenuBtn)tabMenuBtn.classList.toggle("active",name==="menu");
    if(tabNotesBtn)tabNotesBtn.classList.toggle("active",name==="notes");
    if(menuPane)menuPane.style.display=name==="menu"?"":"none";
    if(notesPane)notesPane.style.display=name==="notes"?"":"none";
  }
  if(tabMenuBtn)tabMenuBtn.onclick=function(){activateTab("menu")};
  if(tabNotesBtn)tabNotesBtn.onclick=function(){activateTab("notes")};

  function getMasterElements(slide){
    if(!slide.masterId)return[];
    for(var i=0;i<masters.length;i++)if(masters[i].id===slide.masterId)return masters[i].elements||[];
    return[];
  }

  function renderElement(el){
    var d=document.createElement("div");
    d.className="el";
    d.style.left=el.x+"px";d.style.top=el.y+"px";
    d.style.width=el.width+"px";d.style.height=el.height+"px";
    if(el.animationOut&&el.animationOut!=="none"){
      d.setAttribute("data-anim-out",el.animationOut);
      d.setAttribute("data-exit-dur",String(el.exitDuration!=null?el.exitDuration:500));
    }

    if(el.type==="text"){
      d.style.fontSize=(el.fontSize||24)+"px";
      d.style.fontWeight=el.fontWeight||"400";
      d.style.color=el.textColor||"#000";
      d.style.backgroundColor=el.backgroundColor||"transparent";
      d.style.padding="4px";d.style.overflow="hidden";d.style.wordWrap="break-word";
      d.textContent=el.content||"";
      if(el.hoverTextColor||el.hoverBackgroundColor){
        var baseTC=el.textColor||"#000",baseBG=el.backgroundColor||"transparent";
        d.addEventListener("mouseenter",function(){if(el.hoverTextColor)d.style.color=el.hoverTextColor;if(el.hoverBackgroundColor)d.style.backgroundColor=el.hoverBackgroundColor;d.style.cursor="pointer"});
        d.addEventListener("mouseleave",function(){d.style.color=baseTC;d.style.backgroundColor=baseBG});
      }
    } else if(el.type==="image"){
      var img=document.createElement("img");
      img.src=el.src||"";img.alt=el.alt||"";
      img.style.width="100%";img.style.height="100%";img.style.objectFit="contain";
      d.appendChild(img);
    } else if(el.type==="video"){
      var vid=document.createElement("video");
      vid.src=el.src||"";
      if(el.controls!==false)vid.setAttribute("controls","");
      if(el.autoplay){vid.setAttribute("autoplay","");vid.muted=true;vid.setAttribute("muted","")}
      vid.setAttribute("playsinline","");
      vid.style.width="100%";vid.style.height="100%";vid.style.objectFit="contain";vid.style.background="#000";
      d.appendChild(vid);
    } else if(el.type==="shape"){
      var st=el.shapeType||"rectangle";
      var fillColor=el.fillColor||"#3b82f6";
      var borderColor=el.borderColor||"transparent";
      var borderWidth=el.borderWidth||0;
      if(st==="triangle"){
        var svgNS="http://www.w3.org/2000/svg";
        var svg=document.createElementNS(svgNS,"svg");
        svg.setAttribute("viewBox","0 0 100 100");
        svg.setAttribute("preserveAspectRatio","none");
        svg.style.width="100%";svg.style.height="100%";svg.style.display="block";
        var poly=document.createElementNS(svgNS,"polygon");
        poly.setAttribute("points","50,5 95,95 5,95");
        poly.setAttribute("fill",fillColor);
        poly.setAttribute("stroke",borderColor);
        poly.setAttribute("stroke-width",String(borderWidth*2));
        svg.appendChild(poly);
        d.appendChild(svg);
        if(el.hoverFillColor||el.hoverBorderColor){
          d.addEventListener("mouseenter",function(){if(el.hoverFillColor)poly.setAttribute("fill",el.hoverFillColor);if(el.hoverBorderColor)poly.setAttribute("stroke",el.hoverBorderColor);d.style.cursor="pointer"});
          d.addEventListener("mouseleave",function(){poly.setAttribute("fill",fillColor);poly.setAttribute("stroke",borderColor)});
        }
      } else {
        d.style.backgroundColor=fillColor;
        d.style.border=borderWidth+"px solid "+borderColor;
        if(st==="circle"){d.style.borderRadius="50%"}
        else if(typeof el.borderRadius==="number"){d.style.borderRadius=el.borderRadius+"px"}
        else{d.style.borderRadius="4px"}
        if(typeof el.boxShadow==="string"&&el.boxShadow.length<200&&!/[<>"'\\\\]/.test(el.boxShadow)){d.style.boxShadow=el.boxShadow}
        if(el.hoverFillColor||el.hoverBorderColor){
          d.addEventListener("mouseenter",function(){if(el.hoverFillColor)d.style.backgroundColor=el.hoverFillColor;if(el.hoverBorderColor)d.style.borderColor=el.hoverBorderColor;d.style.cursor="pointer"});
          d.addEventListener("mouseleave",function(){d.style.backgroundColor=fillColor;d.style.borderColor=borderColor});
        }
      }
      if(el.text){
        var txt=document.createElement("div");
        txt.textContent=el.text;
        txt.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;padding:4px;pointer-events:none;word-break:break-word";
        txt.style.color=el.textColor||"#000";
        txt.style.fontSize=(el.fontSize||16)+"px";
        d.style.position="absolute";
        d.appendChild(txt);
      }
    } else if(el.type==="hotspot"){
      d.style.background="transparent";d.style.cursor="pointer";
    } else if(el.type==="checkbox"){
      d.style.display="flex";d.style.alignItems="center";d.style.gap="8px";d.style.padding="4px";
      d.style.color=el.textColor||"#fff";d.style.fontSize=(el.fontSize||16)+"px";d.style.overflow="hidden";
      var cb=document.createElement("input");cb.type="checkbox";if(el.defaultChecked)cb.checked=true;
      cb.style.width="18px";cb.style.height="18px";cb.style.flexShrink="0";cb.style.cursor="pointer";
      var lbl=document.createElement("label");lbl.textContent=el.label||"Checkbox";
      lbl.style.cursor="pointer";lbl.style.overflow="hidden";lbl.style.textOverflow="ellipsis";lbl.style.whiteSpace="nowrap";
      var cbId="cb_"+Math.random().toString(36).slice(2,10);
      cb.id=cbId;lbl.htmlFor=cbId;
      d.appendChild(cb);d.appendChild(lbl);
    } else if(el.type==="table"){
      var tbl=document.createElement("table");
      tbl.style.width="100%";tbl.style.height="100%";tbl.style.tableLayout="fixed";
      tbl.style.borderCollapse="collapse";tbl.style.background="#fff";
      tbl.style.color=el.textColor||"#0f172a";tbl.style.fontSize=(el.fontSize||14)+"px";
      var tbody=document.createElement("tbody");
      var rc=Math.max(1,el.rowCount|0),cc=Math.max(1,el.colCount|0);
      var bcolor=el.borderColor||"#94a3b8";
      var dataM=el.cellData||[];
      for(var ri=0;ri<rc;ri++){
        var tr=document.createElement("tr");
        for(var ci=0;ci<cc;ci++){
          var td=document.createElement("td");
          td.textContent=(dataM[ri]&&dataM[ri][ci])||"";
          td.style.border="1px solid "+bcolor;td.style.padding="4px 6px";
          td.style.verticalAlign="top";td.style.overflow="hidden";td.style.wordBreak="break-word";
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);d.appendChild(tbl);
    }

    var animInMap={"fade":"anim-fade-in","fly-in-left":"anim-fly-in-left","fly-in-right":"anim-fly-in-right"};
    if(el.animationIn&&animInMap[el.animationIn]){
      d.classList.add(animInMap[el.animationIn]);
      var entDur=(el.entranceDuration!=null?el.entranceDuration:500);
      d.style.animationDuration=entDur+"ms";
    }
    return d;
  }

  function setNavLock(locked){
    if(navMode!=="restricted"){nextBtn.disabled=current===slides.length-1;return}
    nextBtn.disabled=locked||current===slides.length-1;
  }

  var activeAudio=[];
  function stopAudio(){
    for(var i=0;i<activeAudio.length;i++){try{activeAudio[i].pause();activeAudio[i].currentTime=0;activeAudio[i].src=""}catch(e){}}
    activeAudio=[];
  }
  function startAudio(slide){
    stopAudio();
    var tracks=(slide&&slide.audio)||[];
    for(var i=0;i<tracks.length;i++){
      var t=tracks[i];if(!t||!t.src)continue;
      var a=new Audio();a.preload="auto";a.src=t.src;
      var p=a.play();if(p&&p.catch)p.catch(function(){});
      activeAudio.push(a);
    }
  }

  var savedPlayheads={};
  var slideTimer=null,slideTimerStart=0,slideTimerOffset=0,slideTimerRunning=false;
  function clearSlideTimer(){if(slideTimer){clearTimeout(slideTimer);slideTimer=null}slideTimerRunning=false}
  function currentPlayhead(){if(!slideTimerRunning)return slideTimerOffset;return slideTimerOffset+(Date.now()-slideTimerStart)}
  function startSlideTimer(startMs){
    clearSlideTimer();
    var slide=slides[current];if(!slide)return;
    var dur=slide.duration||5000;
    var advance=slide.advanceMode||"manual";
    slideTimerOffset=Math.max(0,Math.min(startMs||0,dur));
    slideTimerStart=Date.now();slideTimerRunning=true;unlocked=false;
    if(navMode==="restricted"){setNavLock(true)}else{unlocked=true;setNavLock(false)}
    var remaining=Math.max(0,dur-slideTimerOffset);
    slideTimer=setTimeout(function(){
      slideTimerRunning=false;slideTimerOffset=dur;savedPlayheads[slide.id]=dur;
      if(navMode==="restricted"){unlocked=true;setNavLock(false)}
      if(advance==="auto"&&current<slides.length-1){goTo(current+1)}
      else{setPlaying(false)}
    },remaining);
  }

  var transitionTimer=null;
  function clearTransitionTimer(){if(transitionTimer){clearTimeout(transitionTimer);transitionTimer=null}}

  var quizState={};

  function checkCorrect(slide){
    var q=slide.quiz||{};var st=quizState[slide.id];if(!st)return false;
    var qType=q.questionType||"multiple-choice";
    if(qType==="multiple-choice"){
      var choices=q.choices||[];
      var correctIds=choices.filter(function(c){return c.correct}).map(function(c){return c.id});
      if(q.singleSelect!==false)return correctIds.length===1&&st.answer===correctIds[0];
      var ans=st.answer||[];if(ans.length!==correctIds.length)return false;
      for(var i=0;i<correctIds.length;i++)if(ans.indexOf(correctIds[i])<0)return false;
      return true;
    }
    if(qType==="dnd-sorting"){
      var items=q.sortItems||[];if(!st.answer)return false;
      for(var i=0;i<items.length;i++)if(st.answer[i]!==items[i].id)return false;
      return true;
    }
    if(qType==="dnd-matching"){
      var pairs=q.pairs||[];if(!st.answer)return false;
      for(var i=0;i<pairs.length;i++)if(st.answer[pairs[i].id]!==pairs[i].id)return false;
      return true;
    }
    return false;
  }

  function renderQuizSlide(slide){
    var q=slide.quiz||{};
    var style=slide.quizStyle||{};
    var pageBg=style.pageBackgroundColor||"#f8fafc";
    var cardBg=style.cardBackgroundColor||"#ffffff";
    var textColor=style.textColor||"#0f172a";
    var fontFam=style.fontFamily||ps.fontFamily||"system-ui,sans-serif";
    var qFs=style.questionFontSize||28;
    var optFs=style.optionFontSize||18;
    var optBg=style.optionBackgroundColor||"#ffffff";
    var optBorder=style.optionBorderColor||"#cbd5e1";
    var optSelBorder=style.optionSelectedBorderColor||"#3b82f6";
    var optSelBg=style.optionSelectedBackgroundColor||"#dbeafe";
    var btnBg=style.buttonColor||ps.buttonColor||"#3b82f6";
    var btnText=style.buttonTextColor||"#ffffff";
    var cardR=(style.cardRadius!=null?style.cardRadius:12);
    var optR=(style.optionRadius!=null?style.optionRadius:8);

    var page=document.createElement("div");
    page.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:32px;font-family:"+fontFam+";color:"+textColor+";background:"+pageBg+";overflow:auto";
    var card=document.createElement("div");
    card.style.cssText="background:"+cardBg+";border-radius:"+cardR+"px;padding:32px;max-width:80%;width:720px;box-shadow:0 10px 30px rgba(0,0,0,0.1)";
    var heading=document.createElement("div");
    heading.style.cssText="font-size:"+qFs+"px;font-weight:600;margin-bottom:24px;line-height:1.3";
    heading.textContent=q.question||"Question";
    card.appendChild(heading);

    var st=quizState[slide.id]||(quizState[slide.id]={submitted:false,correct:false,answer:null,attemptsLeft:(q.attempts||1)});
    var qType=q.questionType||"multiple-choice";

    var optionsWrap=document.createElement("div");
    optionsWrap.style.cssText="display:flex;flex-direction:column;gap:12px;margin-bottom:24px";
    function makeOption(text,selected,onClick){
      var o=document.createElement("div");
      o.style.cssText="padding:14px 18px;border:2px solid "+(selected?optSelBorder:optBorder)+";background:"+(selected?optSelBg:optBg)+";border-radius:"+optR+"px;font-size:"+optFs+"px;cursor:pointer;transition:all .15s";
      o.textContent=text;o.onclick=function(){if(!st.submitted)onClick()};
      return o;
    }
    if(qType==="multiple-choice"){
      var choices=q.choices||[];
      var single=q.singleSelect!==false;
      if(st.answer==null)st.answer=single?null:[];
      choices.forEach(function(c){
        var sel=single?(st.answer===c.id):(st.answer.indexOf(c.id)>=0);
        var opt=makeOption(c.text||"",sel,function(){
          if(single){st.answer=c.id}
          else{var arr=st.answer.slice();var i=arr.indexOf(c.id);if(i>=0)arr.splice(i,1);else arr.push(c.id);st.answer=arr}
          render();
        });
        optionsWrap.appendChild(opt);
      });
    } else if(qType==="dnd-sorting"){
      var items=(q.sortItems||[]).slice();
      if(!st.answer)st.answer=items.map(function(it){return it.id});
      st.answer.forEach(function(id,idx){
        var item=null;for(var k=0;k<items.length;k++)if(items[k].id===id){item=items[k];break}
        var row=document.createElement("div");row.style.cssText="display:flex;align-items:center;gap:8px";
        var up=document.createElement("button");up.textContent="\\u2191";up.style.cssText="padding:4px 8px;cursor:pointer";
        var dn=document.createElement("button");dn.textContent="\\u2193";dn.style.cssText="padding:4px 8px;cursor:pointer";
        up.disabled=idx===0||st.submitted;dn.disabled=idx===st.answer.length-1||st.submitted;
        up.onclick=function(){var a=st.answer.slice();var t=a[idx-1];a[idx-1]=a[idx];a[idx]=t;st.answer=a;render()};
        dn.onclick=function(){var a=st.answer.slice();var t=a[idx+1];a[idx+1]=a[idx];a[idx]=t;st.answer=a;render()};
        var label=document.createElement("div");
        label.style.cssText="flex:1;padding:14px 18px;border:2px solid "+optBorder+";background:"+optBg+";border-radius:"+optR+"px;font-size:"+optFs+"px";
        label.textContent=item?(item.text||""):"";
        row.appendChild(up);row.appendChild(dn);row.appendChild(label);
        optionsWrap.appendChild(row);
      });
    } else if(qType==="dnd-matching"){
      var pairs=q.pairs||[];if(!st.answer)st.answer={};
      pairs.forEach(function(p){
        var row=document.createElement("div");row.style.cssText="display:flex;gap:12px;align-items:center";
        var left=document.createElement("div");
        left.style.cssText="flex:1;padding:14px 18px;border:2px solid "+optBorder+";background:"+optBg+";border-radius:"+optR+"px;font-size:"+optFs+"px";
        left.textContent=p.left||"";
        var sel=document.createElement("select");
        sel.style.cssText="flex:1;padding:12px;font-size:"+optFs+"px;border:2px solid "+optBorder+";border-radius:"+optR+"px;background:"+optBg;
        var blank=document.createElement("option");blank.value="";blank.textContent="\\u2014 select \\u2014";sel.appendChild(blank);
        pairs.forEach(function(p2){var o=document.createElement("option");o.value=p2.id;o.textContent=p2.right||"";if(st.answer[p.id]===p2.id)o.selected=true;sel.appendChild(o)});
        sel.disabled=st.submitted;
        sel.onchange=function(){st.answer[p.id]=sel.value};
        row.appendChild(left);row.appendChild(sel);optionsWrap.appendChild(row);
      });
    }
    card.appendChild(optionsWrap);

    var btnRow=document.createElement("div");
    btnRow.style.cssText="display:flex;gap:12px;align-items:center";
    if(!st.submitted){
      var submitBtn=document.createElement("button");
      submitBtn.textContent="Submit";
      submitBtn.style.cssText="padding:12px 24px;background:"+btnBg+";color:"+btnText+";border:none;border-radius:"+optR+"px;font-size:16px;cursor:pointer;font-weight:500";
      submitBtn.onclick=function(){
        st.correct=checkCorrect(slide);st.submitted=true;
        st.attemptsLeft=Math.max(0,(st.attemptsLeft|0)-1);
        // Completion check on quiz-based mode.
        if(PUB.completion&&PUB.completion.mode==="quiz"){
          if(!PUB.completion.quizSlideId||PUB.completion.quizSlideId===slide.id){
            reportCompletion();
          }
        }
        var fb=st.correct?(q.correctFeedback||{}):(q.incorrectFeedback||{});
        if(fb.mode==="jumpToSlide"&&fb.targetSlideId){
          for(var i=0;i<slides.length;i++)if(slides[i].id===fb.targetSlideId){goTo(i);return}
        }
        render();
      };
      btnRow.appendChild(submitBtn);
      if(q.allowSkip){
        var skipBtn=document.createElement("button");
        skipBtn.textContent="Skip";
        skipBtn.style.cssText="padding:12px 24px;background:transparent;color:"+textColor+";border:1px solid "+optBorder+";border-radius:"+optR+"px;font-size:16px;cursor:pointer";
        skipBtn.onclick=function(){
          if(q.skipTargetSlideId){for(var i=0;i<slides.length;i++)if(slides[i].id===q.skipTargetSlideId){goTo(i);return}}
          if(current<slides.length-1)goTo(current+1);
        };
        btnRow.appendChild(skipBtn);
      }
    } else {
      var fb=st.correct?(q.correctFeedback||{}):(q.incorrectFeedback||{});
      var msg=document.createElement("div");
      msg.style.cssText="padding:12px 16px;border-radius:"+optR+"px;background:"+(st.correct?"#dcfce7":"#fee2e2")+";color:"+(st.correct?"#14532d":"#7f1d1d")+";font-size:15px;flex:1";
      msg.textContent=fb.message||(st.correct?"Correct!":"Incorrect");
      btnRow.appendChild(msg);
      var canRetry=!st.correct&&st.attemptsLeft>0;
      if(canRetry){
        var retry=document.createElement("button");
        retry.textContent="Try Again";
        retry.style.cssText="padding:12px 24px;background:"+btnBg+";color:"+btnText+";border:none;border-radius:"+optR+"px;font-size:16px;cursor:pointer";
        retry.onclick=function(){st.submitted=false;st.answer=(q.questionType==="multiple-choice"&&q.singleSelect===false)?[]:(q.questionType==="dnd-matching"?{}:null);render()};
        btnRow.appendChild(retry);
      } else {
        var cont=document.createElement("button");
        cont.textContent="Continue";
        cont.style.cssText="padding:12px 24px;background:"+btnBg+";color:"+btnText+";border:none;border-radius:"+optR+"px;font-size:16px;cursor:pointer";
        cont.onclick=function(){if(current<slides.length-1)goTo(current+1)};
        btnRow.appendChild(cont);
      }
    }
    card.appendChild(btnRow);
    page.appendChild(card);
    stage.appendChild(page);
  }

  function renderResultsSlide(slide){
    var r=slide.results||{passThreshold:80,passMessage:"Congratulations, you passed!",failMessage:"Sorry, you did not pass."};
    var totalQuiz=0,correct=0;
    for(var i=0;i<slides.length;i++){
      if(slides[i].slideType==="quiz"){totalQuiz++;var s=quizState[slides[i].id];if(s&&s.correct)correct++}
    }
    var pct=totalQuiz>0?Math.round((correct/totalQuiz)*100):0;
    var passed=pct>=(r.passThreshold||0);
    var page=document.createElement("div");
    page.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:32px;font-family:"+(ps.fontFamily||"system-ui,sans-serif")+";background:#f8fafc;color:#0f172a";
    var card=document.createElement("div");
    card.style.cssText="background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:560px;box-shadow:0 10px 30px rgba(0,0,0,.1)";
    var h=document.createElement("div");
    h.style.cssText="font-size:48px;font-weight:700;margin-bottom:16px;color:"+(passed?"#16a34a":"#dc2626");
    h.textContent=pct+"%";
    var msg=document.createElement("div");
    msg.style.cssText="font-size:20px;margin-bottom:8px;font-weight:600";
    msg.textContent=passed?(r.passMessage||"Passed"):(r.failMessage||"Failed");
    var sub=document.createElement("div");
    sub.style.cssText="font-size:14px;color:#64748b";
    sub.textContent=correct+" of "+totalQuiz+" correct";
    card.appendChild(h);card.appendChild(msg);card.appendChild(sub);
    page.appendChild(card);stage.appendChild(page);
    // Report score + status to LMS.
    try{
      LMS.setScore(totalQuiz>0?(correct/totalQuiz):0,pct,0,100);
      var rs=PUB.reportStatus||"passed-incomplete";
      var status;
      if(rs==="passed-failed"){status=passed?"passed":"failed"}
      else if(rs==="completed-incomplete"){status=passed?"completed":"incomplete"}
      else{status=passed?"passed":"incomplete"}
      LMS.setStatus(status);
      if(LMS.commit)LMS.commit();
      courseCompletionReported=true;
    }catch(e){}
  }

  function computeQuizScore(){
    var totalQuiz=0,correct=0;
    for(var i=0;i<slides.length;i++){
      if(slides[i].slideType==="quiz"){
        totalQuiz++;
        var s=quizState[slides[i].id];
        if(s&&s.correct)correct++;
      }
    }
    var pct=totalQuiz>0?Math.round((correct/totalQuiz)*100):0;
    return {total:totalQuiz,correct:correct,pct:pct};
  }

  function reportCompletion(){
    if(courseCompletionReported)return;
    courseCompletionReported=true;
    try{
      var sc=computeQuizScore();
      LMS.setScore(sc.total>0?(sc.correct/sc.total):0, sc.pct, 0, 100);
      var rs=PUB.reportStatus||"passed-incomplete";
      var status;
      if(rs==="passed-failed"){ status="passed"; }
      else if(rs==="completed-incomplete"){ status="completed"; }
      else { status="passed"; }
      LMS.setStatus(status);
      if(LMS.commit)LMS.commit();
    }catch(e){}
  }

  function maybeReportPercentCompletion(){
    if(courseCompletionReported)return;
    if(!PUB.completion||PUB.completion.mode!=="percent")return;
    var thresh=Math.max(1,Math.min(100,PUB.completion.percent||100));
    var visitedCount=0;for(var k in visited)if(visited.hasOwnProperty(k))visitedCount++;
    var pct=slides.length>0?(visitedCount/slides.length)*100:0;
    if(pct>=thresh)reportCompletion();
  }

  function render(){
    stage.innerHTML="";
    if(current<0||current>=slides.length)return;
    var slide=slides[current];
    visited[slide.id]=true;
    var masterEls=getMasterElements(slide);
    masterEls.forEach(function(el){stage.appendChild(renderElement(el))});
    (slide.elements||[]).forEach(function(el){stage.appendChild(renderElement(el))});
    if(slide.slideType==="quiz")renderQuizSlide(slide);
    else if(slide.slideType==="results")renderResultsSlide(slide);
    if(meta)meta.textContent="Slide "+(current+1)+" / "+slides.length;
    prevBtn.disabled=current===0;
    buildMenu();updateNotes();
    var revisit=slide.revisitMode||"reset";
    var saved=savedPlayheads[slide.id];
    var startMs=(revisit==="resume"&&typeof saved==="number"&&saved<(slide.duration||5000))?saved:0;
    if(revisit==="reset")savedPlayheads[slide.id]=0;
    startAudio(slide);setPlaying(true);startSlideTimer(startMs);scaleStage();
    try{LMS.setLocation(current)}catch(e){}
    maybeReportPercentCompletion();
  }

  var playing=true;
  function setPlaying(v){
    playing=v;
    for(var i=0;i<activeAudio.length;i++){try{if(playing){activeAudio[i].play().catch(function(){})}else{activeAudio[i].pause()}}catch(e){}}
    if(playing){if(!slideTimerRunning)startSlideTimer(slideTimerOffset)}
    else{if(slideTimerRunning){slideTimerOffset=currentPlayhead();clearSlideTimer()}}
    if(ppBtn)ppBtn.innerHTML=playing?"\\u2759\\u2759":"\\u25B6";
    if(ppBtn)ppBtn.setAttribute("aria-label",playing?"Pause":"Play");
  }
  if(ppBtn)ppBtn.onclick=function(){setPlaying(!playing)};

  function goTo(idx){
    if(idx<0||idx>=slides.length||idx===current)return;
    var leaving=slides[current];if(leaving)savedPlayheads[leaving.id]=currentPlayhead();
    clearSlideTimer();stopAudio();
    var cs=(data.courseSettings&&data.courseSettings.transition)||{type:"fade",duration:1,color:"#000000"};
    var dur=(typeof cs.duration==="number")?cs.duration:1;
    if((cs.type||"none")==="none"){current=idx;render();return}
    var halfMs=Math.max(50,(dur*1000)/2);
    stage.style.transition="opacity "+halfMs+"ms ease-in-out";
    stage.classList.add("fading");
    clearTransitionTimer();
    transitionTimer=setTimeout(function(){current=idx;render();void stage.offsetWidth;stage.classList.remove("fading")},halfMs);
  }
  prevBtn.onclick=function(){if(current>0)goTo(current-1)};
  nextBtn.onclick=function(){if(current<slides.length-1)goTo(current+1)};

  // ===== Captions =====
  var ccOverlay=document.getElementById("cc-overlay");
  var ccBtn=document.getElementById("cc");
  var ccEnabled=true;
  if(ccBtn){
    ccBtn.onclick=function(){
      ccEnabled=!ccEnabled;
      ccBtn.setAttribute("aria-pressed",ccEnabled?"true":"false");
      if(ccEnabled){ccBtn.classList.remove("off")}else{ccBtn.classList.add("off")}
      if(!ccEnabled&&ccOverlay)ccOverlay.innerHTML="";
    };
  }
  function tickCaptions(){
    if(!ccOverlay)return;
    if(!ccEnabled){ccOverlay.innerHTML="";requestAnimationFrame(tickCaptions);return}
    var slide=slides[current];
    var tracks=(slide&&slide.audio)||[];
    var text="";
    for(var i=0;i<activeAudio.length;i++){
      var a=activeAudio[i];var track=tracks[i];if(!track||!track.captions)continue;
      var t=a.currentTime||0;
      for(var j=0;j<track.captions.length;j++){
        var c=track.captions[j];var endT=c.endTime||(c.startTime+2);
        if(t>=c.startTime&&t<endT){text=c.text||"";break}
      }
      if(text)break;
    }
    if(text){ccOverlay.innerHTML='<span></span>';ccOverlay.firstChild.textContent=text}
    else{ccOverlay.innerHTML=""}
    requestAnimationFrame(tickCaptions);
  }
  requestAnimationFrame(tickCaptions);

  render();
})();`;
}
