import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { CourseState } from '@/types/course';
import { safeColor, safeFontFamily, safeNumber, safeImageSrc, safeEnum } from './sanitize';
import { themeVarCssText, THEME_VAR_NAMES } from './themeVars';

function buildManifest(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course_manifest" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
    http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org_1">
    <organization identifier="org_1">
      <title>eLearning Course</title>
      <item identifier="item_1" identifierref="res_1">
        <title>eLearning Course</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res_1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>`;
}

function buildPlayerHtml(state: CourseState): string {
  const courseData = JSON.stringify({
    slides: state.slides,
    masterSlides: state.masterSlides,
    playerSettings: state.playerSettings,
    courseSettings: state.courseSettings,
  });

  // Sanitize all player-setting values that get embedded directly into the
  // generated <style> block. This blocks CSS/HTML/JS injection from malicious
  // imported project files. See src/lib/sanitize.ts.
  const rawPs = state.playerSettings;
  const ps = {
    backgroundColor: safeColor(rawPs.backgroundColor, '#1a1a2e'),
    buttonColor: safeColor(rawPs.buttonColor, '#3b82f6'),
    buttonBorderRadius: safeNumber(rawPs.buttonBorderRadius, 6, 0, 200),
    fontFamily: safeFontFamily(rawPs.fontFamily),
    showMenu: !!rawPs.showMenu,
    navigationMode: safeEnum(rawPs.navigationMode, ['free', 'restricted'] as const, 'free'),
    backgroundImage: safeImageSrc(rawPs.backgroundImage),
    backgroundMode: safeEnum(rawPs.backgroundMode, ['stretch', 'fit', 'tile'] as const, 'stretch'),
    courseTitle: (rawPs.courseTitle || 'Untitled Course').slice(0, 200),
    sidebarPosition: safeEnum(rawPs.sidebarPosition, ['left', 'right', 'none'] as const, 'left'),
    tabMenu: !!(rawPs.playerTabs?.showMenu ?? true),
    tabNotes: !!(rawPs.playerTabs?.showNotes ?? true),
    ctrlPlayPause: !!(rawPs.playerControls?.showPlayPause ?? true),
    ctrlCaptions: !!(rawPs.playerControls?.showCaptions ?? true),
  };
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const titleSafe = escapeHtml(ps.courseTitle);
  const dims = {
    width: safeNumber(state.courseSettings.canvasDimensions.width, 1920, 320, 7680),
    height: safeNumber(state.courseSettings.canvasDimensions.height, 1080, 240, 4320),
  };
  const aspect = `${dims.width}/${dims.height}`;

  // Sanitize theme palette and emit as CSS variables on :root so any element
  // using `var(--theme-*)` for its color updates if the palette changes.
  const safeThemeColors = (state.courseSettings.themeColors ?? []).map((c) => safeColor(c, '#000000'));
  const themeVarsCss = themeVarCssText(safeThemeColors);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>eLearning Course</title>
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
 #stage-fader{position:absolute;inset:0;display:block}
 #stage{position:absolute;top:0;left:0;width:${dims.width}px;height:${dims.height}px;transform-origin:top left;background:#fff;opacity:1;transition:opacity .25s ease-in-out}
 #stage.fading{opacity:0}
 #cc-overlay{position:absolute;left:5%;right:5%;bottom:6%;text-align:center;pointer-events:none;z-index:50;font-family:${ps.fontFamily}}
 #cc-overlay span{display:inline-block;background:rgba(0,0,0,0.75);color:#fff;padding:8px 16px;border-radius:6px;font-size:clamp(12px,2.4vw,28px);line-height:1.3;max-width:90%;white-space:pre-wrap}
 #cc-overlay.hidden{display:none}
 .el{position:absolute;transition:all .2s ease}
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
(function(){
  var API=null;
  function findAPI(w){try{if(w.API)return w.API}catch(e){}try{if(w.parent&&w.parent!==w)return findAPI(w.parent)}catch(e){}try{if(w.top&&w.top.API)return w.top.API}catch(e){}return null}
  try{API=findAPI(window)}catch(e){}
  if(API){try{API.LMSInitialize("")}catch(e){}}
  window.addEventListener("beforeunload",function(){if(API){try{API.LMSFinish("")}catch(e){}}});

  var data=window.COURSE_DATA;
  var slides=data.slides||[];
  var masters=data.masterSlides||[];
  var ps=data.playerSettings||{};
  var navMode=ps.navigationMode||"free";
  var current=0;
  var unlocked=false;
  var timer=null;
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

  // Apply transition fade-through-color to wrapper background.
  (function(){
    var wrapper=document.getElementById("stage-wrapper");
    var cs=(data.courseSettings&&data.courseSettings.transition)||{type:"fade",duration:1,color:"#000000"};
    if(wrapper)wrapper.style.background=cs.color||"#000000";
  })();

  function scaleStage(){
    var wrapper=document.getElementById("stage-wrapper");
    if(!wrapper)return;
    var s=wrapper.clientWidth/${dims.width};
    stage.style.transform="scale("+s+")";
  }
  window.addEventListener("resize",scaleStage);
  scaleStage();

  function buildMenu(){
    if(!slideListEl)return;
    slideListEl.innerHTML="";
    for(var i=0;i<slides.length;i++){
      (function(idx){
        var li=document.createElement("li");
        var b=document.createElement("button");
        b.type="button";
        b.textContent="Slide "+(idx+1);
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
    for(var i=0;i<masters.length;i++){if(masters[i].id===slide.masterId)return masters[i].elements||[]}
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
      d.style.padding="4px";
      d.style.overflow="hidden";
      d.style.wordWrap="break-word";
      d.textContent=el.content||"";
      if(el.hoverTextColor||el.hoverBackgroundColor){
        var baseTC=el.textColor||"#000",baseBG=el.backgroundColor||"transparent";
        d.addEventListener("mouseenter",function(){
          if(el.hoverTextColor)d.style.color=el.hoverTextColor;
          if(el.hoverBackgroundColor)d.style.backgroundColor=el.hoverBackgroundColor;
          d.style.cursor="pointer";
        });
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
      if(el.autoplay){vid.setAttribute("autoplay","");vid.muted=true;vid.setAttribute("muted","");}
      vid.setAttribute("playsinline","");
      vid.style.width="100%";vid.style.height="100%";vid.style.objectFit="contain";vid.style.background="#000";
      d.appendChild(vid);
    } else if(el.type==="shape"){
      var st=el.shapeType||"rectangle";
      var fillColor=el.fillColor||"#3b82f6";
      var borderColor=el.borderColor||"transparent";
      var borderWidth=el.borderWidth||0;
      if(st==="triangle"){
        // Use inline SVG so transparent fills/borders work cleanly.
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
          d.addEventListener("mouseenter",function(){
            if(el.hoverFillColor)poly.setAttribute("fill",el.hoverFillColor);
            if(el.hoverBorderColor)poly.setAttribute("stroke",el.hoverBorderColor);
            d.style.cursor="pointer";
          });
          d.addEventListener("mouseleave",function(){
            poly.setAttribute("fill",fillColor);
            poly.setAttribute("stroke",borderColor);
          });
        }
      } else {
        d.style.backgroundColor=fillColor;
        d.style.border=borderWidth+"px solid "+borderColor;
        if(st==="circle"){d.style.borderRadius="50%";}
        else if(typeof el.borderRadius==="number"){d.style.borderRadius=el.borderRadius+"px";}
        else {d.style.borderRadius="4px";}
        if(typeof el.boxShadow==="string"&&el.boxShadow.length<200&&!/[<>"'\\]/.test(el.boxShadow)){
          d.style.boxShadow=el.boxShadow;
        }
        if(el.hoverFillColor||el.hoverBorderColor){
          d.addEventListener("mouseenter",function(){
            if(el.hoverFillColor)d.style.backgroundColor=el.hoverFillColor;
            if(el.hoverBorderColor)d.style.borderColor=el.hoverBorderColor;
            d.style.cursor="pointer";
          });
          d.addEventListener("mouseleave",function(){
            d.style.backgroundColor=fillColor;
            d.style.borderColor=borderColor;
          });
        }
      }
      // Embedded shape text (centered via flexbox overlay).
      if(el.text){
        var txt=document.createElement("div");
        txt.textContent=el.text;
        txt.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;padding:4px;pointer-events:none;word-break:break-word;";
        txt.style.color=el.textColor||"#000";
        txt.style.fontSize=(el.fontSize||16)+"px";
        d.style.position="absolute";
        d.appendChild(txt);
      }
    } else if(el.type==="hotspot"){
      // Fully invisible interactive region in the published player.
      d.style.background="transparent";
      d.style.cursor="pointer";
    } else if(el.type==="checkbox"){
      d.style.display="flex";
      d.style.alignItems="center";
      d.style.gap="8px";
      d.style.padding="4px";
      d.style.color=el.textColor||"#fff";
      d.style.fontSize=(el.fontSize||16)+"px";
      d.style.overflow="hidden";
      var cb=document.createElement("input");
      cb.type="checkbox";
      if(el.defaultChecked)cb.checked=true;
      cb.style.width="18px";cb.style.height="18px";cb.style.flexShrink="0";cb.style.cursor="pointer";
      var lbl=document.createElement("label");
      lbl.textContent=el.label||"Checkbox";
      lbl.style.cursor="pointer";
      lbl.style.overflow="hidden";lbl.style.textOverflow="ellipsis";lbl.style.whiteSpace="nowrap";
      // Generate a unique id so clicking the label toggles the checkbox.
      var cbId="cb_"+Math.random().toString(36).slice(2,10);
      cb.id=cbId;lbl.htmlFor=cbId;
      d.appendChild(cb);
      d.appendChild(lbl);
    } else if(el.type==="table"){
      var tbl=document.createElement("table");
      tbl.style.width="100%";tbl.style.height="100%";tbl.style.tableLayout="fixed";
      tbl.style.borderCollapse="collapse";tbl.style.background="#fff";
      tbl.style.color=el.textColor||"#0f172a";
      tbl.style.fontSize=(el.fontSize||14)+"px";
      var tbody=document.createElement("tbody");
      var rc=Math.max(1,el.rowCount|0),cc=Math.max(1,el.colCount|0);
      var bcolor=el.borderColor||"#94a3b8";
      var dataM=el.cellData||[];
      for(var ri=0;ri<rc;ri++){
        var tr=document.createElement("tr");
        for(var ci=0;ci<cc;ci++){
          var td=document.createElement("td");
          td.textContent=(dataM[ri]&&dataM[ri][ci])||"";
          td.style.border="1px solid "+bcolor;
          td.style.padding="4px 6px";
          td.style.verticalAlign="top";
          td.style.overflow="hidden";
          td.style.wordBreak="break-word";
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      d.appendChild(tbl);
    }

    // Apply entrance animation with custom duration
    var animInMap={"fade":"anim-fade-in","fly-in-left":"anim-fly-in-left","fly-in-right":"anim-fly-in-right"};
    if(el.animationIn&&animInMap[el.animationIn]){
      d.classList.add(animInMap[el.animationIn]);
      var entDur=(el.entranceDuration!=null?el.entranceDuration:500);
      d.style.animationDuration=entDur+"ms";
    }
    return d;
  }

  function applyExitAnimations(container,onDone){
    var animOutMap={"fade":"anim-fade-out","fly-out-left":"anim-fly-out-left","fly-out-right":"anim-fly-out-right"};
    var nodes=container.querySelectorAll("[data-anim-out]");
    var maxDur=0;
    for(var i=0;i<nodes.length;i++){
      var node=nodes[i];
      var key=node.getAttribute("data-anim-out");
      var dur=parseInt(node.getAttribute("data-exit-dur")||"500",10);
      if(animOutMap[key]){
        // remove any entrance class first
        node.className="el";
        node.classList.add(animOutMap[key]);
        node.style.animationDuration=dur+"ms";
        if(dur>maxDur)maxDur=dur;
      }
    }
    if(maxDur===0){onDone();return}
    setTimeout(onDone,maxDur);
  }

  function setNavLock(locked){
    if(navMode!=="restricted"){nextBtn.disabled=current===slides.length-1;return}
    nextBtn.disabled=locked||current===slides.length-1;
  }

  // Active <audio> elements for the current slide, so we can pause on navigation.
  var activeAudio=[];
  function stopAudio(){
    for(var i=0;i<activeAudio.length;i++){
      try{activeAudio[i].pause();activeAudio[i].currentTime=0;activeAudio[i].src="";}catch(e){}
    }
    activeAudio=[];
  }
  function startAudio(slide){
    stopAudio();
    var tracks=(slide&&slide.audio)||[];
    for(var i=0;i<tracks.length;i++){
      var t=tracks[i];
      if(!t||!t.src)continue;
      var a=new Audio();
      a.preload="auto";
      a.src=t.src;
      // Play in sync with slide timeline (slide begins => t=0).
      var p=a.play();
      if(p&&p.catch)p.catch(function(){});
      activeAudio.push(a);
    }
  }

  // Per-slide saved playhead time (ms) for revisitMode==='resume'.
  var savedPlayheads={};
  // Slide internal timer (drives auto-advance & restricted-nav unlock).
  var slideTimer=null;
  var slideTimerStart=0;
  var slideTimerOffset=0;
  var slideTimerRunning=false;
  function clearSlideTimer(){
    if(slideTimer){clearTimeout(slideTimer);slideTimer=null}
    slideTimerRunning=false;
  }
  function currentPlayhead(){
    if(!slideTimerRunning)return slideTimerOffset;
    return slideTimerOffset+(Date.now()-slideTimerStart);
  }
  function startSlideTimer(startMs){
    clearSlideTimer();
    var slide=slides[current];
    if(!slide)return;
    var dur=slide.duration||5000;
    var advance=slide.advanceMode||"manual";
    slideTimerOffset=Math.max(0,Math.min(startMs||0,dur));
    slideTimerStart=Date.now();
    slideTimerRunning=true;
    unlocked=false;
    if(navMode==="restricted"){setNavLock(true)}else{unlocked=true;setNavLock(false)}
    var remaining=Math.max(0,dur-slideTimerOffset);
    slideTimer=setTimeout(function(){
      slideTimerRunning=false;
      slideTimerOffset=dur;
      savedPlayheads[slide.id]=dur;
      if(navMode==="restricted"){unlocked=true;setNavLock(false)}
      if(advance==="auto"&&current<slides.length-1){
        goTo(current+1);
      }else{
        setPlaying(false);
      }
    },remaining);
  }

  // Fade-through-color transition: fade stage to opacity 0, swap render, fade
  // back in. The wrapper background already shows the transition color.
  var transitionTimer=null;
  function clearTransitionTimer(){if(transitionTimer){clearTimeout(transitionTimer);transitionTimer=null}}

  function render(){
    stage.innerHTML="";
    if(current<0||current>=slides.length)return;
    var slide=slides[current];
    var masterEls=getMasterElements(slide);
    masterEls.forEach(function(el){stage.appendChild(renderElement(el))});
    (slide.elements||[]).forEach(function(el){stage.appendChild(renderElement(el))});
    if(meta)meta.textContent="Slide "+(current+1)+" / "+slides.length;
    prevBtn.disabled=current===0;
    buildMenu();
    updateNotes();
    var revisit=slide.revisitMode||"reset";
    var saved=savedPlayheads[slide.id];
    var startMs=(revisit==="resume"&&typeof saved==="number"&&saved<(slide.duration||5000))?saved:0;
    startAudio(slide);
    setPlaying(true);
    startSlideTimer(startMs);
    if(API){try{API.LMSSetValue("cmi.core.lesson_location",""+current)}catch(e){}}
  }

  // Play/pause control: pauses all active audio + slide timer.
  var playing=true;
  function setPlaying(v){
    playing=v;
    for(var i=0;i<activeAudio.length;i++){
      try{if(playing){activeAudio[i].play().catch(function(){})}else{activeAudio[i].pause()}}catch(e){}
    }
    if(playing){
      if(!slideTimerRunning){startSlideTimer(slideTimerOffset)}
    }else{
      if(slideTimerRunning){
        slideTimerOffset=currentPlayhead();
        clearSlideTimer();
      }
    }
    if(ppBtn)ppBtn.innerHTML=playing?"&#10074;&#10074;":"&#9658;";
    if(ppBtn)ppBtn.setAttribute("aria-label",playing?"Pause":"Play");
  }
  if(ppBtn)ppBtn.onclick=function(){setPlaying(!playing)};

  function goTo(idx){
    if(idx<0||idx>=slides.length||idx===current)return;
    var leaving=slides[current];
    if(leaving)savedPlayheads[leaving.id]=currentPlayhead();
    clearSlideTimer();
    stopAudio();
    var cs=(data.courseSettings&&data.courseSettings.transition)||{type:"fade",duration:1,color:"#000000"};
    var dur=(typeof cs.duration==="number")?cs.duration:1;
    if((cs.type||"none")==="none"){
      current=idx;render();return;
    }
    var halfMs=Math.max(50,(dur*1000)/2);
    stage.style.transition="opacity "+halfMs+"ms ease-in-out";
    stage.classList.add("fading");
    clearTransitionTimer();
    transitionTimer=setTimeout(function(){
      current=idx;
      render();
      void stage.offsetWidth;
      stage.classList.remove("fading");
    },halfMs);
  }
  prevBtn.onclick=function(){if(current>0)goTo(current-1)};
  nextBtn.onclick=function(){if(current<slides.length-1)goTo(current+1)};

  // ===== Closed captions =====
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
    if(!ccOverlay){return}
    if(!ccEnabled){ccOverlay.innerHTML="";requestAnimationFrame(tickCaptions);return}
    var slide=slides[current];
    var tracks=(slide&&slide.audio)||[];
    var text="";
    // Use the currentTime of the first audio track (most authoring tools have
    // a single voiceover per slide). Fall back to scanning all tracks.
    for(var i=0;i<activeAudio.length;i++){
      var a=activeAudio[i];
      var track=tracks[i];
      if(!track||!track.captions)continue;
      var t=a.currentTime||0;
      for(var j=0;j<track.captions.length;j++){
        var c=track.captions[j];
        var endT=c.endTime||(c.startTime+2);
        if(t>=c.startTime&&t<endT){text=c.text||"";break}
      }
      if(text)break;
    }
    if(text){
      ccOverlay.innerHTML='<span></span>';
      ccOverlay.firstChild.textContent=text;
    } else {
      ccOverlay.innerHTML="";
    }
    requestAnimationFrame(tickCaptions);
  }
  requestAnimationFrame(tickCaptions);

  render();
})();
</script>
</body>
</html>`;
}

export async function exportScorm(state: CourseState) {
  const zip = new JSZip();
  zip.file('imsmanifest.xml', buildManifest());
  zip.file('index.html', buildPlayerHtml(state));
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'course-scorm.zip');
}
