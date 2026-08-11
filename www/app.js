function fmtT(s){if(!s||isNaN(s))return'00:00';const m=Math.floor(s/60),sc=Math.floor(s%60);return(m<10?'0':'')+m+':'+(sc<10?'0':'')+sc}
function switchPage(name){
  document.querySelectorAll('.ptab').forEach(x=>x.classList.remove('on'))
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('on'))
  document.querySelector(`.ptab[data-page="${name}"]`)?.classList.add('on')
  document.getElementById('page-'+name).classList.add('on')
}
document.querySelectorAll('.ptab').forEach(t=>t.onclick=()=>switchPage(t.dataset.page))

let queue=[],idx=0,playing=false,shuffle=false,repeat=false
const audio=new Audio()
let actx=null,analyser=null,freqData=null,src=null

function initCtx(){
  if(actx)return
  actx=new(window.AudioContext||window.webkitAudioContext)()
  src=actx.createMediaElementSource(audio)
  analyser=actx.createAnalyser();analyser.fftSize=128
  freqData=new Uint8Array(analyser.frequencyBinCount)
  src.connect(analyser);analyser.connect(actx.destination)
}
function renderQueue(){
  const list=document.getElementById('queueList')
  list.innerHTML=''
  queue.forEach((t,i)=>{
    const el=document.createElement('div')
    el.className='q-item'+(i===idx?' on':'')
    el.innerHTML=`<span class="q-num">${String(i+1).padStart(2,'0')}</span><span class="q-title">${t.name}</span><span class="q-dur">${fmtT(t.duration||0)}</span>`
    el.onclick=()=>{idx=i;loadTrack()}
    list.appendChild(el)
  })
  document.getElementById('queueCard').style.display=queue.length?'block':'none'
  document.getElementById('emptyHint').style.display=queue.length?'none':'block'
}
function loadTrack(){
  const t=queue[idx]
  if(!t)return
  document.getElementById('npBlock').style.display='flex'
  audio.src=URL.createObjectURL(t.file)
  audio.load()
  document.getElementById('npTitle').textContent=t.name
  document.getElementById('npArtist').textContent='TRACK '+(idx+1)+' / '+queue.length
  renderQueue()
}
function play(){
  if(!queue[idx])return
  initCtx();if(actx.state==='suspended')actx.resume()
  audio.play().then(()=>{playing=true;document.getElementById('btnPlay').textContent='⏸'}).catch(err=>{
    console.error('Playback failed:',err)
    document.getElementById('npArtist').textContent='PLAYBACK ERROR — '+err.message
  })
}
function pause(){audio.pause();playing=false;document.getElementById('btnPlay').textContent='▶'}
function next(){if(!queue.length)return;idx=shuffle?Math.floor(Math.random()*queue.length):(idx+1)%queue.length;loadTrack();play()}
function prev(){if(!queue.length)return;idx=(idx-1+queue.length)%queue.length;loadTrack();play()}
audio.addEventListener('ended',()=>{if(repeat){audio.currentTime=0;play()}else next()})
audio.addEventListener('timeupdate',()=>{
  if(!audio.duration)return
  document.getElementById('tCur').textContent=fmtT(audio.currentTime)
  document.getElementById('tDur').textContent=fmtT(audio.duration)
  document.getElementById('ccTime').textContent=fmtT(audio.currentTime)
  document.getElementById('progFill').style.width=(audio.currentTime/audio.duration*100)+'%'
})
document.getElementById('btnPlay').onclick=()=>playing?pause():play()
document.getElementById('btnNext').onclick=next
document.getElementById('btnPrev').onclick=prev
document.getElementById('btnBack10').onclick=()=>{if(audio.src)audio.currentTime=Math.max(0,audio.currentTime-10)}
document.getElementById('btnFwd10').onclick=()=>{if(audio.src&&audio.duration)audio.currentTime=Math.min(audio.duration,audio.currentTime+10)}
document.getElementById('btnShuf').onclick=function(){shuffle=!shuffle;this.classList.toggle('on',shuffle)}
document.getElementById('btnRep').onclick=function(){repeat=!repeat;this.classList.toggle('on',repeat)}
document.getElementById('pickBtn').onclick=()=>document.getElementById('fileInput').click()
document.getElementById('fileInput').onchange=(e)=>{
  const files=Array.from(e.target.files||[])
  if(!files.length)return
  queue=files.map(f=>({file:f,name:f.name.replace(/\.[^.]+$/,''),duration:0}))
  idx=0;loadTrack()
}

let srCtx=null,srOrigBuf=null,srNodes=null,srSrc=null
let srPlaying=false,srStartTime=0,srOffset=0,srRoom='hall',srIsLoading=false
let loopA=null,loopB=null,loopEnabled=false

function makeSatCurve(amount){
  const k=amount,n=8192,curve=new Float32Array(n),deg=Math.PI/180
  for(let i=0;i<n;i++){const x=i*2/n-1;curve[i]=((3+k)*x*20*deg)/(Math.PI+k*Math.abs(x))}
  return curve
}
function buildImpulse(ctx,type){
  const p={hall:{dur:3.5,decay:2.8},room:{dur:1.5,decay:1.2},plate:{dur:2.5,decay:1.8},cave:{dur:5.0,decay:4.0},spring:{dur:1.8,decay:1.4}}[type]||{dur:3.5,decay:2.8}
  const sr=ctx.sampleRate,len=Math.floor(sr*p.dur),imp=ctx.createBuffer(2,len,sr)
  const predelay=Math.floor(sr*0.018),buildup=Math.floor(sr*0.05),earlyTaps=6,earlyWindow=Math.floor(sr*0.08)
  for(let ch=0;ch<2;ch++){
    const d=imp.getChannelData(ch)
    for(let r=0;r<earlyTaps;r++){const pos=predelay+Math.floor(Math.random()*earlyWindow);if(pos<len)d[pos]+=(Math.random()<0.5?-1:1)*(1-r/earlyTaps)*0.5}
    let smoothed=0;const tailLen=len-predelay
    for(let i=predelay;i<len;i++){
      const t=i-predelay,noise=Math.random()*2-1
      smoothed=smoothed*0.72+noise*0.28
      d[i]+=smoothed*Math.min(1,t/buildup)*Math.pow(1-t/tailLen,p.decay)*0.8
    }
  }
  return imp
}
const impCache=new Map()
function getImpulse(ctx,type){if(!impCache.has(type))impCache.set(type,buildImpulse(ctx,type));return impCache.get(type)}

function srBuildGraph(){
  const speed=parseFloat(document.getElementById('speedSlider').value)
  const reverbMix=parseFloat(document.getElementById('reverbSlider').value)
  const bassDb=parseFloat(document.getElementById('bassSlider').value)
  const vol=parseFloat(document.getElementById('volSlider').value)
  const nostOn=document.getElementById('nostBtn').classList.contains('on')
  const s=srCtx.createBufferSource();s.buffer=srOrigBuf;s.playbackRate.value=speed
  const bass=srCtx.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=110;bass.gain.value=bassDb
  const nostHP=srCtx.createBiquadFilter();nostHP.type='highpass';nostHP.frequency.value=nostOn?130:20
  const nostLP=srCtx.createBiquadFilter();nostLP.type='lowpass';nostLP.frequency.value=nostOn?4200:20000
  const nostSat=srCtx.createWaveShaper();nostSat.curve=nostOn?makeSatCurve(15):null
  const conv=srCtx.createConvolver();conv.buffer=getImpulse(srCtx,srRoom)
  const dry=srCtx.createGain(),wet=srCtx.createGain(),master=srCtx.createGain()
  const w=reverbMix/100;dry.gain.value=1-w*.5;wet.gain.value=w*1.15;master.gain.value=vol/100
  const limiter=srCtx.createDynamicsCompressor()
  limiter.threshold.value=-3;limiter.knee.value=6;limiter.ratio.value=8;limiter.attack.value=0.003;limiter.release.value=0.15
  s.connect(bass);bass.connect(nostHP);nostHP.connect(nostLP);nostLP.connect(nostSat)
  nostSat.connect(dry);nostSat.connect(conv);conv.connect(wet)
  dry.connect(master);wet.connect(master);master.connect(limiter);limiter.connect(srCtx.destination)
  return{src:s,bass,dry,wet,master,conv,nostHP,nostLP,nostSat}
}
function srApplyLive(){
  if(!srNodes||!srPlaying)return
  const newSpeed=parseFloat(document.getElementById('speedSlider').value)
  if(newSpeed!==srNodes.src.playbackRate.value){
    const oldSpeed=srNodes.src.playbackRate.value
    srOffset+=(srCtx.currentTime-srStartTime)*oldSpeed
    srStartTime=srCtx.currentTime
  }
  const t=srCtx.currentTime,r=.05,w=parseFloat(document.getElementById('reverbSlider').value)/100
  const nostOn=document.getElementById('nostBtn').classList.contains('on')
  srNodes.src.playbackRate.setTargetAtTime(newSpeed,t,r)
  srNodes.bass.gain.setTargetAtTime(parseFloat(document.getElementById('bassSlider').value),t,r)
  srNodes.dry.gain.setTargetAtTime(1-w*.5,t,r);srNodes.wet.gain.setTargetAtTime(w*1.15,t,r)
  srNodes.master.gain.setTargetAtTime(parseFloat(document.getElementById('volSlider').value)/100,t,r)
  srNodes.nostHP.frequency.setTargetAtTime(nostOn?130:20,t,r)
  srNodes.nostLP.frequency.setTargetAtTime(nostOn?4200:20000,t,r)
  srNodes.nostSat.curve=nostOn?makeSatCurve(15):null
}
function srElapsed(){if(!srPlaying)return srOffset;const speed=srNodes?srNodes.src.playbackRate.value:1;return srOffset+(srCtx.currentTime-srStartTime)*speed}
function srPlay(){
  if(!srOrigBuf)return
  if(srCtx.state==='suspended')srCtx.resume()
  const nodes=srBuildGraph();srNodes=nodes;srSrc=nodes.src
  nodes.src.start(0,srOffset);srStartTime=srCtx.currentTime-srOffset/parseFloat(document.getElementById('speedSlider').value)
  srPlaying=true;document.getElementById('srPlayBtn').textContent='⏸ PAUSE'
  document.getElementById('srStopBtn').disabled=false
  nodes.src.onended=()=>{if(srPlaying)srStop()}
  requestAnimationFrame(srUpdateProg)
}
function srPause(){
  if(!srPlaying)return
  srOffset+=(srCtx.currentTime-srStartTime)*(srNodes?srNodes.src.playbackRate.value:1)
  if(srSrc){srSrc.onended=null;try{srSrc.stop()}catch(e){}}
  srPlaying=false;srSrc=null;srNodes=null
  document.getElementById('srPlayBtn').textContent='▶ PLAY'
}
function srStop(){
  if(srSrc){srSrc.onended=null;try{srSrc.stop()}catch(e){}}
  srPlaying=false;srSrc=null;srNodes=null;srOffset=0
  document.getElementById('srPlayBtn').textContent='▶ PLAY'
  document.getElementById('srStopBtn').disabled=true
}
function srUpdateProg(){
  if(!srPlaying||!srOrigBuf)return
  const speed=srNodes?srNodes.src.playbackRate.value:1
  let elapsed=srOffset+(srCtx.currentTime-srStartTime)*speed
  if(loopEnabled&&loopA!=null&&loopB!=null&&loopB>loopA&&elapsed>=loopB){
    if(srSrc){srSrc.onended=null;try{srSrc.stop()}catch(e){}}
    srOffset=loopA
    const nodes=srBuildGraph();srNodes=nodes;srSrc=nodes.src
    nodes.src.start(0,srOffset);srStartTime=srCtx.currentTime-srOffset/speed
    nodes.src.onended=()=>{if(srPlaying)srStop()}
    elapsed=loopA
  }
  document.getElementById('srStatus').textContent='PLAYING  '+fmtT(elapsed)+' / '+fmtT(srOrigBuf.duration)
  if(elapsed>=srOrigBuf.duration){srStop();return}
  requestAnimationFrame(srUpdateProg)
}
document.getElementById('srPlayBtn').onclick=()=>srPlaying?srPause():srPlay()
document.getElementById('srStopBtn').onclick=srStop
function srUpdateLoopStatus(){
  const el=document.getElementById('loopStatus')
  if(loopA==null||loopB==null)el.textContent='Set both points first.'
  else if(loopB<=loopA)el.textContent='Point B must be after point A.'
  else el.textContent=loopEnabled?`Looping ${fmtT(loopA)} - ${fmtT(loopB)}`:'Ready - press ENABLE.'
}
document.getElementById('loopSetA').onclick=()=>{loopA=srElapsed();document.getElementById('loopAVal').textContent=fmtT(loopA);srUpdateLoopStatus()}
document.getElementById('loopSetB').onclick=()=>{loopB=srElapsed();document.getElementById('loopBVal').textContent=fmtT(loopB);srUpdateLoopStatus()}
document.getElementById('loopToggle').onclick=()=>{
  if(loopA==null||loopB==null||loopB<=loopA){srUpdateLoopStatus();return}
  loopEnabled=!loopEnabled
  document.getElementById('loopToggle').textContent=loopEnabled?'DISABLE':'ENABLE'
  document.getElementById('loopToggle').classList.toggle('on',loopEnabled)
  srUpdateLoopStatus()
}
document.getElementById('loopClear').onclick=()=>{
  loopA=null;loopB=null;loopEnabled=false
  document.getElementById('loopAVal').textContent='--:--';document.getElementById('loopBVal').textContent='--:--'
  document.getElementById('loopToggle').textContent='ENABLE';document.getElementById('loopToggle').classList.remove('on')
  srUpdateLoopStatus()
}
document.getElementById('nostBtn').onclick=()=>{
  const b=document.getElementById('nostBtn')
  b.classList.toggle('on');b.textContent=b.classList.contains('on')?'ON':'OFF'
  srApplyLive()
}
function estimateBPM(buf){
  const data=buf.getChannelData(0),sr=buf.sampleRate
  const winSize=Math.floor(sr*0.01),numWindows=Math.floor(data.length/winSize)
  const envelope=new Float32Array(numWindows)
  for(let i=0;i<numWindows;i++){let sum=0;for(let j=0;j<winSize;j++){const v=data[i*winSize+j]||0;sum+=v*v}envelope[i]=Math.sqrt(sum/winSize)}
  const winRate=sr/winSize,minLag=Math.max(1,Math.floor(winRate*60/180)),maxLag=Math.floor(winRate*60/60)
  let bestLag=minLag,bestScore=-Infinity
  for(let lag=minLag;lag<=maxLag;lag++){let score=0;for(let i=0;i<numWindows-lag;i++)score+=envelope[i]*envelope[i+lag];if(score>bestScore){bestScore=score;bestLag=lag}}
  return 60/(bestLag/winRate)
}
document.getElementById('autoSpeedBtn').onclick=()=>{
  if(!srOrigBuf)return
  const btn=document.getElementById('autoSpeedBtn')
  btn.textContent='ANALYZING...';btn.disabled=true
  setTimeout(()=>{
    try{
      const bpm=estimateBPM(srOrigBuf),targetBpm=68
      let ratio=targetBpm/bpm
      while(ratio<0.5)ratio*=2
      while(ratio>1.3)ratio/=2
      ratio=Math.max(0.4,Math.min(1.6,ratio))
      document.getElementById('speedSlider').value=ratio.toFixed(2)
      document.getElementById('speedVal').textContent=ratio.toFixed(2)+'x'
      srApplyLive()
      document.getElementById('srStatus').textContent=`Est. BPM ${Math.round(bpm)} -> ${ratio.toFixed(2)}x`
    }catch(err){document.getElementById('srStatus').textContent='BPM estimate failed'}
    btn.textContent='AUTO SPEED (estimate)';btn.disabled=false
  },30)
}
;['speedSlider','reverbSlider','bassSlider','volSlider'].forEach(id=>{
  document.getElementById(id).addEventListener('input',(e)=>{
    const v=e.target.value
    if(id==='speedSlider')document.getElementById('speedVal').textContent=parseFloat(v).toFixed(2)+'x'
    if(id==='reverbSlider')document.getElementById('reverbVal').textContent=v+'%'
    if(id==='bassSlider')document.getElementById('bassVal').textContent=(v>=0?'+':'')+v+' dB'
    if(id==='volSlider')document.getElementById('volVal').textContent=v+'%'
    srApplyLive()
  })
})
document.querySelectorAll('#roomGrid .room-btn').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('#roomGrid .room-btn').forEach(x=>x.classList.remove('on'))
    b.classList.add('on');srRoom=b.dataset.type
    if(srNodes&&srPlaying)srNodes.conv.buffer=getImpulse(srCtx,srRoom)
  }
})
const PRESETS=[
  {name:'SLOWED+REVERB 1',speed:0.90,reverb:35,bass:2,room:'hall',nost:0},
  {name:'SLOWED+REVERB 2',speed:0.78,reverb:65,bass:4,room:'cave',nost:0},
  {name:'NOSTALGIA 1',speed:0.95,reverb:15,bass:1,room:'room',nost:1},
  {name:'NOSTALGIA 2',speed:0.85,reverb:30,bass:2,room:'plate',nost:1},
  {name:'NIGHTCORE',speed:1.30,reverb:0,bass:0,room:'room',nost:0},
  {name:'CLEAN',speed:1.0,reverb:30,bass:0,room:'plate',nost:0},
]
const presetRow=document.getElementById('presetRow')
PRESETS.forEach(p=>{
  const b=document.createElement('button')
  b.className='preset';b.textContent=p.name
  b.onclick=()=>{
    document.getElementById('speedSlider').value=p.speed;document.getElementById('speedVal').textContent=p.speed.toFixed(2)+'x'
    document.getElementById('reverbSlider').value=p.reverb;document.getElementById('reverbVal').textContent=p.reverb+'%'
    document.getElementById('bassSlider').value=p.bass;document.getElementById('bassVal').textContent=(p.bass>=0?'+':'')+p.bass+' dB'
    const nb=document.getElementById('nostBtn');nb.classList.toggle('on',!!p.nost);nb.textContent=p.nost?'ON':'OFF'
    document.querySelectorAll('#roomGrid .room-btn').forEach(x=>x.classList.remove('on'))
    document.querySelector(`#roomGrid .room-btn[data-type="${p.room}"]`)?.classList.add('on')
    srRoom=p.room
    if(srNodes&&srPlaying)srNodes.conv.buffer=getImpulse(srCtx,srRoom)
    srApplyLive()
  }
  presetRow.appendChild(b)
})
async function srFinishLoad(name,arrayBuffer){
  if(srIsLoading)return
  srIsLoading=true
  try{
    document.getElementById('srFileName').textContent=name
    document.getElementById('srStatus').textContent='DECODING...'
    document.getElementById('srStatus').className='sr-status proc'
    srStop()
    if(!srCtx)srCtx=new(window.AudioContext||window.webkitAudioContext)()
    srOrigBuf=await srCtx.decodeAudioData(arrayBuffer)
    document.getElementById('srPlayBtn').disabled=false
    document.getElementById('srRenderBtn').disabled=false
    document.getElementById('autoSpeedBtn').disabled=false
    document.getElementById('loopSetA').disabled=false
    document.getElementById('loopSetB').disabled=false
    document.getElementById('loopToggle').disabled=false
    document.getElementById('loopClear').disabled=false
    loopA=null;loopB=null;loopEnabled=false
    document.getElementById('loopAVal').textContent='--:--';document.getElementById('loopBVal').textContent='--:--'
    document.getElementById('loopToggle').textContent='ENABLE';document.getElementById('loopToggle').classList.remove('on')
    srUpdateLoopStatus()
    document.getElementById('srStatus').textContent='READY  '+fmtT(srOrigBuf.duration)
    document.getElementById('srStatus').className='sr-status ok'
    srPlay()
  }catch(err){
    document.getElementById('srStatus').textContent='COULD NOT LOAD: '+err.message
    document.getElementById('srStatus').className='sr-status'
    console.error('srFinishLoad failed:',err)
  }finally{srIsLoading=false}
}
document.getElementById('srPickBtn').onclick=()=>document.getElementById('srFileInput').click()
document.getElementById('srFileInput').onchange=async(e)=>{
  const f=e.target.files&&e.target.files[0]
  if(!f)return
  const ab=await f.arrayBuffer()
  await srFinishLoad(f.name,ab)
}
document.getElementById('srUseCurrentBtn').onclick=async()=>{
  const t=queue[idx]
  if(!t){document.getElementById('srStatus').textContent='NO TRACK SELECTED IN LIBRARY';return}
  const ab=await t.file.arrayBuffer()
  await srFinishLoad(t.name,ab)
}
document.getElementById('srRenderBtn').onclick=async()=>{
  if(!srOrigBuf)return
  const btn=document.getElementById('srRenderBtn')
  btn.disabled=true;btn.textContent='RENDERING...'
  try{
    const speed=parseFloat(document.getElementById('speedSlider').value)
    const offCtx=new OfflineAudioContext(srOrigBuf.numberOfChannels,Math.ceil(srOrigBuf.length/speed),srOrigBuf.sampleRate)
    const nostOn=document.getElementById('nostBtn').classList.contains('on')
    const s=offCtx.createBufferSource();s.buffer=srOrigBuf;s.playbackRate.value=speed
    const bass=offCtx.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=110;bass.gain.value=parseFloat(document.getElementById('bassSlider').value)
    const nostHP=offCtx.createBiquadFilter();nostHP.type='highpass';nostHP.frequency.value=nostOn?130:20
    const nostLP=offCtx.createBiquadFilter();nostLP.type='lowpass';nostLP.frequency.value=nostOn?4200:20000
    const nostSat=offCtx.createWaveShaper();nostSat.curve=nostOn?makeSatCurve(15):null
    const conv=offCtx.createConvolver();conv.buffer=buildImpulse(offCtx,srRoom)
    const dry=offCtx.createGain(),wet=offCtx.createGain(),master=offCtx.createGain()
    const w=parseFloat(document.getElementById('reverbSlider').value)/100;dry.gain.value=1-w*.5;wet.gain.value=w*1.15;master.gain.value=parseFloat(document.getElementById('volSlider').value)/100
    const limiter=offCtx.createDynamicsCompressor();limiter.threshold.value=-3;limiter.knee.value=6;limiter.ratio.value=8;limiter.attack.value=0.003;limiter.release.value=0.15
    s.connect(bass);bass.connect(nostHP);nostHP.connect(nostLP);nostLP.connect(nostSat)
    nostSat.connect(dry);nostSat.connect(conv);conv.connect(wet)
    dry.connect(master);wet.connect(master);master.connect(limiter);limiter.connect(offCtx.destination)
    s.start(0)
    const rendered=await offCtx.startRendering()
    const wavBlob=bufferToWav(rendered)
    const url=URL.createObjectURL(wavBlob)
    const a=document.createElement('a');a.href=url;a.download='g23_slowed_'+Date.now()+'.wav';document.body.appendChild(a);a.click();document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }catch(err){console.error('Render failed:',err)}
  btn.disabled=false;btn.textContent='⬇ RENDER & DOWNLOAD WAV'
}
function bufferToWav(buf){
  const numCh=buf.numberOfChannels,len=buf.length*numCh*2+44
  const ab=new ArrayBuffer(len),view=new DataView(ab)
  const writeStr=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i))}
  writeStr(0,'RIFF');view.setUint32(4,len-8,true);writeStr(8,'WAVE');writeStr(12,'fmt ')
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,numCh,true)
  view.setUint32(24,buf.sampleRate,true);view.setUint32(28,buf.sampleRate*numCh*2,true)
  view.setUint16(32,numCh*2,true);view.setUint16(34,16,true);writeStr(36,'data');view.setUint32(40,len-44,true)
  let off=44
  for(let i=0;i<buf.length;i++)for(let ch=0;ch<numCh;ch++){
    let sample=Math.max(-1,Math.min(1,buf.getChannelData(ch)[i]))
    view.setInt16(off,sample<0?sample*0x8000:sample*0x7FFF,true);off+=2
  }
  return new Blob([ab],{type:'audio/wav'})
}
window.addEventListener('error',e=>console.error('Uncaught error:',e.message))
window.addEventListener('unhandledrejection',e=>console.error('Unhandled rejection:',e.reason))
