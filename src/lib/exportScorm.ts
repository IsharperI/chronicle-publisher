import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { CourseState } from '@/types/course';

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

  const ps = state.playerSettings;
  const dims = state.courseSettings.canvasDimensions;
  const aspect = `${dims.width}/${dims.height}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>eLearning Course</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background-color:${ps.backgroundColor};${ps.backgroundImage ? `background-image:url(${ps.backgroundImage});${ps.backgroundMode === 'stretch' ? 'background-size:100% 100%;background-repeat:no-repeat;' : ps.backgroundMode === 'fit' ? 'background-size:contain;background-repeat:no-repeat;background-position:center;' : 'background-repeat:repeat;background-size:auto;'}` : ''}display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:${ps.fontFamily};color:#fff}
#stage-wrapper{position:relative;width:90vw;max-width:${Math.min(dims.width, 1280)}px;aspect-ratio:${aspect};background:#fff;overflow:hidden;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.4)}
#stage{position:absolute;inset:0;width:${dims.width}px;height:${dims.height}px;transform-origin:top left}
.el{position:absolute;transition:all .2s ease}
.controls{margin-top:20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center}
.controls button{padding:8px 24px;border:none;border-radius:${ps.buttonBorderRadius}px;background:${ps.buttonColor};color:#fff;font-size:14px;cursor:pointer;font-weight:500;font-family:${ps.fontFamily}}
.controls button:hover{filter:brightness(1.15)}
.controls button:disabled{opacity:.4;cursor:default;filter:none}
.controls span{font-size:14px;color:#aaa}
.controls select{padding:6px 10px;border-radius:${ps.buttonBorderRadius}px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font-size:13px;font-family:${ps.fontFamily};cursor:pointer}
@keyframes el-fade-in{from{opacity:0}to{opacity:1}}
@keyframes el-fade-out{from{opacity:1}to{opacity:0}}
@keyframes el-fly-in-left{from{opacity:0;transform:translateX(-120px)}to{opacity:1;transform:translateX(0)}}
@keyframes el-fly-in-right{from{opacity:0;transform:translateX(120px)}to{opacity:1;transform:translateX(0)}}
@keyframes el-fly-out-left{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-120px)}}
@keyframes el-fly-out-right{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(120px)}}
.anim-fade-in{animation-name:el-fade-in;animation-fill-mode:forwards;animation-timing-function:ease-out}
.anim-fade-out{animation-name:el-fade-out;animation-fill-mode:forwards;animation-timing-function:ease-in}
.anim-fly-in-left{animation-name:el-fly-in-left;animation-fill-mode:forwards;animation-timing-function:ease-out}
.anim-fly-in-right{animation-name:el-fly-in-right;animation-fill-mode:forwards;animation-timing-function:ease-out}
.anim-fly-out-left{animation-name:el-fly-out-left;animation-fill-mode:forwards;animation-timing-function:ease-in}
.anim-fly-out-right{animation-name:el-fly-out-right;animation-fill-mode:forwards;animation-timing-function:ease-in}
</style>
</head>
<body>
<div id="stage-wrapper"><div id="stage"></div></div>
<div class="controls">
  ${ps.showMenu ? '<select id="slideMenu"></select>' : ''}
  <button id="prev">&#9664; Prev</button>
  <span id="info"></span>
  <button id="next">Next &#9654;</button>
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
  var showMenu=!!ps.showMenu;
  var current=0;
  var unlocked=false;
  var timer=null;
  var stage=document.getElementById("stage");
  var info=document.getElementById("info");
  var prevBtn=document.getElementById("prev");
  var nextBtn=document.getElementById("next");
  var menuEl=document.getElementById("slideMenu");

  function scaleStage(){
    var wrapper=document.getElementById("stage-wrapper");
    var s=wrapper.clientWidth/1920;
    stage.style.transform="scale("+s+")";
  }
  window.addEventListener("resize",scaleStage);
  scaleStage();

  function buildMenu(){
    if(!menuEl||!showMenu)return;
    menuEl.innerHTML="";
    for(var i=0;i<slides.length;i++){
      var opt=document.createElement("option");
      opt.value=i;
      opt.textContent="Slide "+(i+1);
      if(i===current)opt.selected=true;
      menuEl.appendChild(opt);
    }
  }

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
    } else if(el.type==="shape"){
      var st=el.shapeType||"rectangle";
      d.style.backgroundColor=el.fillColor||"#3b82f6";
      d.style.border=(el.borderWidth||0)+"px solid "+(el.borderColor||"transparent");
      if(st==="circle")d.style.borderRadius="50%";
      if(st==="triangle"){
        d.style.backgroundColor="transparent";
        d.style.borderLeft=(el.width/2)+"px solid transparent";
        d.style.borderRight=(el.width/2)+"px solid transparent";
        d.style.borderBottom=el.height+"px solid "+(el.fillColor||"#3b82f6");
        d.style.width="0";d.style.height="0";
      }
      if(el.hoverFillColor||el.hoverBorderColor){
        var baseFill=el.fillColor||"#3b82f6",baseBorder=el.borderColor||"transparent";
        d.addEventListener("mouseenter",function(){
          if(st!=="triangle"){if(el.hoverFillColor)d.style.backgroundColor=el.hoverFillColor}
          if(el.hoverBorderColor)d.style.borderColor=el.hoverBorderColor;
          d.style.cursor="pointer";
        });
        d.addEventListener("mouseleave",function(){
          if(st!=="triangle")d.style.backgroundColor=baseFill;
          d.style.borderColor=baseBorder;
        });
      }
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
    if(navMode!=="restricted"){nextBtn.disabled=current===slides.length-1;if(menuEl)menuEl.disabled=false;return}
    nextBtn.disabled=locked||current===slides.length-1;
    if(menuEl)menuEl.disabled=locked;
  }

  function startRestrictionTimer(){
    unlocked=false;
    if(timer)clearTimeout(timer);
    if(navMode!=="restricted"){unlocked=true;setNavLock(false);return}
    setNavLock(true);
    var dur=(slides[current]&&slides[current].duration)||5000;
    timer=setTimeout(function(){unlocked=true;setNavLock(false)},dur);
  }

  function render(){
    stage.innerHTML="";
    if(current<0||current>=slides.length)return;
    var slide=slides[current];
    var masterEls=getMasterElements(slide);
    masterEls.forEach(function(el){stage.appendChild(renderElement(el))});
    (slide.elements||[]).forEach(function(el){stage.appendChild(renderElement(el))});
    info.textContent="Slide "+(current+1)+" / "+slides.length;
    prevBtn.disabled=current===0;
    buildMenu();
    startRestrictionTimer();
    if(API){try{API.LMSSetValue("cmi.core.lesson_location",""+current)}catch(e){}}
  }

  function goTo(idx){if(idx<0||idx>=slides.length||idx===current)return;applyExitAnimations(stage,function(){current=idx;render()})}
  prevBtn.onclick=function(){if(current>0)goTo(current-1)};
  nextBtn.onclick=function(){if(current<slides.length-1)goTo(current+1)};
  if(menuEl){menuEl.onchange=function(){var v=parseInt(menuEl.value,10);if(!isNaN(v)&&v>=0&&v<slides.length)goTo(v)}}
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
