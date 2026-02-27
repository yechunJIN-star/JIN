const cv = document.getElementById('game')
const ctx = cv.getContext('2d')
const overlay = document.getElementById('overlay')
const panel = document.getElementById('panel')
const startBtn = document.getElementById('start')
const statusEl = document.getElementById('status')
const hudLeft = document.getElementById('hud-left')
const hudRight = document.getElementById('hud-right')
const bossbar = document.getElementById('bossbar')
const bossbarFill = document.getElementById('bossbar-fill')

const W = cv.width
const H = cv.height

let state = 'loading'
let last = 0
let acc = 0
let shake = 0
let score = 0
let levelIndex = 0
let levelTime = 0
let pattern = null
let patternOffset = 0
let spawnTimer = 0
const particles = []
const pickups = []
let audioCtx = null
let music = null
let sfx = null

const input = { left:false, right:false, up:false, down:false, fire:false, skill:false, ray:false }
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true
  if (e.code === 'ArrowUp' || e.code === 'KeyW') input.up = true
  if (e.code === 'ArrowDown' || e.code === 'KeyS') input.down = true
  if (e.code === 'Space' || e.code === 'KeyJ') input.fire = true
  if (e.code === 'KeyZ') input.skill = true
  if (e.code === 'KeyX') input.ray = true
})
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false
  if (e.code === 'ArrowUp' || e.code === 'KeyW') input.up = false
  if (e.code === 'ArrowDown' || e.code === 'KeyS') input.down = false
  if (e.code === 'Space' || e.code === 'KeyJ') input.fire = false
  if (e.code === 'KeyZ') input.skill = false
  if (e.code === 'KeyX') input.ray = false
})

const assets = {
  patternUrl: 'https://www.transparenttextures.com/patterns/stardust.png'
}

function loadAssets() {
  return new Promise(res => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      pattern = ctx.createPattern(img, 'repeat')
      statusEl.textContent = '载入完成 100%'
      startBtn.classList.remove('hidden')
      res()
    }
    img.onerror = () => {
      statusEl.textContent = '载入失败，仍可开始'
      startBtn.classList.remove('hidden')
      res()
    }
    statusEl.textContent = '载入中 50%'
    img.src = assets.patternUrl
  })
}

const player = {
  x: W/2, y: H-80, w: 36, h: 42, speed: 240, cd: 0, hp: 3, inv: 0, scd: 0,
  rcd: 0, rayActive: false, rayTime: 0, shield: 0
}
const bullets = []
const enemies = []
const ebullets = []
let boss = null

const levels = [
  { duration: 35, rate: 1.0, eHP: 3, eSpeed: 110, bossHP: 220, bossColor:'#b30000', bossFire:1.0 },
  { duration: 45, rate: 0.9, eHP: 4, eSpeed: 140, bossHP: 320, bossColor:'#00e676', bossFire:0.7 },
  { duration: 55, rate: 0.8, eHP: 6, eSpeed: 170, bossHP: 450, bossColor:'#111111', bossFire:1.3 }
]

function resetGame() {
  score = 0
  levelIndex = 0
  levelTime = 0
  bullets.length = 0
  enemies.length = 0
  ebullets.length = 0
  boss = null
  player.x = W/2
  player.y = H-80
  player.hp = 3
  player.inv = 0
  player.cd = 0
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function rnd(a,b){ return Math.random()*(b-a)+a }
function aabb(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by }

function drawBackground(dt) {
  patternOffset += dt*60
  ctx.save()
  if (pattern) {
    ctx.fillStyle = pattern
    ctx.setTransform(1,0,0,1,0,patternOffset%64)
    ctx.fillRect(-20,-20,W+40,H+40)
    ctx.setTransform(1,0,0,1,0,0)
  } else {
    const g = ctx.createLinearGradient(0,0,0,H)
    g.addColorStop(0,'#080a12')
    g.addColorStop(1,'#0f111a')
    ctx.fillStyle = g
    ctx.fillRect(0,0,W,H)
  }
  ctx.restore()
}

function drawShip(x,y,w,h,color) {
  ctx.save()
  ctx.translate(x,y)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0,-h*0.6)
  ctx.lineTo(w*0.35,h*0.4)
  ctx.lineTo(0,h*0.2)
  ctx.lineTo(-w*0.35,h*0.4)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.8)'
  ctx.fillRect(-w*0.1,-h*0.1,w*0.2,h*0.35)
  ctx.restore()
}

function spawnExplosion(x,y,opts={}) {
  const count = opts.count || 18
  const base = opts.base || '#ffb347'
  const maxR = opts.maxR || 2.8
  for (let i=0;i<count;i++){
    const a = Math.random()*Math.PI*2
    const sp = Math.random()*180+120
    particles.push({
      x, y,
      vx: Math.cos(a)*sp,
      vy: Math.sin(a)*sp,
      life: 0.6+Math.random()*0.4,
      r: Math.random()*maxR+1,
      color: base
    })
  }
}

function updateParticles(dt){
  for (let i=particles.length-1;i>=0;i--){
    const p = particles[i]
    p.life -= dt
    p.x += p.vx*dt
    p.y += p.vy*dt
    p.vx *= 0.98
    p.vy = p.vy + 220*dt
    if (p.life<=0) particles.splice(i,1)
  }
}

function drawParticles(){
  for (const p of particles){
    ctx.globalAlpha = Math.max(0,p.life*1.2)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

function spawnHeart(x,y){
  const h = {x, y, baseX:x, t0:0, amp:18, freq:1.6, v:90, r:9, t:'heart'}
  pickups.push(h)
}

function maybeDropHeart(x,y){
  if (Math.random()<0.12) spawnHeart(x,y)
}

function updatePickups(dt){
  for (let i=pickups.length-1;i>=0;i--){
    const p = pickups[i]
    p.t0 += dt
    p.y += p.v*dt
    p.x = p.baseX + Math.sin(p.t0*p.freq)*p.amp
    if (p.y>H+30) pickups.splice(i,1)
  }
}

function drawPickups(){
  for (const p of pickups){
    if (p.t==='heart'){
      ctx.save()
      ctx.translate(p.x,p.y)
      const s = p.r
      ctx.fillStyle = '#ff5a7a'
      ctx.beginPath()
      ctx.arc(-s*0.5,-s*0.2,s*0.55,0,Math.PI*2)
      ctx.arc(s*0.5,-s*0.2,s*0.55,0,Math.PI*2)
      ctx.moveTo(-s,-s*0.2)
      ctx.lineTo(0,s)
      ctx.lineTo(s,-s*0.2)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    } else if (p.t==='shield') {
      ctx.save()
      ctx.translate(p.x,p.y)
      const r = p.r
      ctx.strokeStyle = 'rgba(90,170,255,0.9)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0,0,r,0,Math.PI*2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(90,170,255,0.35)'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(0,0,r+2,0,Math.PI*2)
      ctx.stroke()
      ctx.restore()
    }
  }
}

function spawnShield(x,y){
  const s = {x, y, baseX:x, t0:0, amp:22, freq:1.4, v:85, r:12, t:'shield'}
  pickups.push(s)
}

function maybeDropShield(x,y){
  if (Math.random()<0.08) spawnShield(x,y)
}

function createMusic(ctx){
  const handles = []
  function clearAll(){
    while(handles.length){ clearInterval(handles.pop()) }
  }
  const noiseBuffer = (() => {
    const bufferSize = ctx.sampleRate * 0.2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1
    return buffer
  })()
  function beep(freq, dur, t0, type, gain=0.08){
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(0, ctx.currentTime + t0)
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur)
    o.connect(g).connect(ctx.destination)
    o.start(ctx.currentTime + t0)
    o.stop(ctx.currentTime + t0 + dur + 0.02)
  }
  function kick(t0){
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(160, ctx.currentTime + t0)
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + t0 + 0.2)
    g.gain.setValueAtTime(0.12, ctx.currentTime + t0)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + 0.22)
    o.connect(g).connect(ctx.destination)
    o.start(ctx.currentTime + t0)
    o.stop(ctx.currentTime + t0 + 0.24)
  }
  function hat(){
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 6000
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.04, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05)
    src.connect(hp).connect(g).connect(ctx.destination)
    src.start()
    src.stop(ctx.currentTime + 0.06)
  }
  function snare(){
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2000
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.07, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
    src.connect(bp).connect(g).connect(ctx.destination)
    src.start()
    src.stop(ctx.currentTime + 0.13)
  }
  function stageLoop(){
    clearAll()
    const bpm = 150
    const beat = 60/bpm
    const pat = [0,7,5,3,2,3,5,7]
    let step = 0
    handles.push(setInterval(()=>{
      const t = 0
      kick(t)
      const f0 = 440
      const note = pat[step%pat.length]
      const freq = f0*Math.pow(2, note/12)
      beep(freq, 0.14, 0.02, 'triangle', 0.07)
      beep(freq*0.5, 0.12, 0.10, 'sine', 0.05)
      if (step%2===0) beep(freq*2, 0.06, 0.26, 'square', 0.04)
      step++
    }, beat*1000))
    handles.push(setInterval(()=>{ hat() }, beat*500))
    let bb=0
    handles.push(setInterval(()=>{ if ((bb++ % 2)===1) snare() }, beat*1000))
  }
  function bossLoop(type){
    clearAll()
    const bpm = 176
    const beat = 60/bpm
    let step = 0
    handles.push(setInterval(()=>{
      const t = 0
      kick(t)
      let seq
      if (type==='snake') seq = [0,2,3,5,3,2]
      else if (type==='bat') seq = [0,1,4,1,0,7]
      else seq = [0,3,6,3]
      const base = type==='bat'? 392 : 330
      const note = seq[step%seq.length]
      const freq = base*Math.pow(2, note/12)
      const wave = type==='bat' ? 'sawtooth' : 'square'
      beep(freq, 0.16, 0.02, wave, 0.1)
      beep(freq*0.5, 0.16, 0.10, 'sine', 0.06)
      step++
    }, beat*1000))
    handles.push(setInterval(()=>{ hat() }, beat*250))
    handles.push(setInterval(()=>{ snare() }, beat*1000))
  }
  return {
    stage: ()=>stageLoop(),
    boss: (type)=>bossLoop(type),
    stop: ()=>clearAll()
  }
}

function ensureAudio(){
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    music = createMusic(audioCtx)
    sfx = createSfx(audioCtx)
  }
}

function createSfx(ctx){
  const noiseBuffer = (() => {
    const bufferSize = ctx.sampleRate * 0.3
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1
    return buffer
  })()
  function shoot(){
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.setValueAtTime(1100, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.06)
    g.gain.setValueAtTime(0.09, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.09)
  }
  function explosion(intensity=1){
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const filt = ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.setValueAtTime(600, ctx.currentTime)
    filt.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.25)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.25*intensity, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    src.connect(filt).connect(g).connect(ctx.destination)
    src.start()
    src.stop(ctx.currentTime + 0.36)
  }
  return { shoot, explosion }
}

function drawEnemy(x,y,w,h,t) {
  ctx.save()
  ctx.translate(x,y)
  if (t===0) {
    ctx.fillStyle = '#2bdcff'
    ctx.beginPath()
    ctx.arc(0,0,w*0.6,0,Math.PI*2)
    ctx.fill()
  } else if (t===1) {
    ctx.fillStyle = '#ffb84d'
    ctx.beginPath()
    ctx.ellipse(0,0,w*0.6,h*0.4,0,0,Math.PI*2)
    ctx.fill()
  } else if (t===2) {
    ctx.fillStyle = '#6aff6a'
    ctx.beginPath()
    ctx.moveTo(0,-h*0.6)
    ctx.lineTo(w*0.6,h*0.6)
    ctx.lineTo(-w*0.6,h*0.6)
    ctx.closePath()
    ctx.fill()
  } else if (t===3) {
    ctx.fillStyle = '#ff6b6b'
    ctx.beginPath()
    ctx.moveTo(0,-h*0.7)
    ctx.lineTo(w*0.25,0)
    ctx.lineTo(0,h*0.7)
    ctx.lineTo(-w*0.25,0)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillStyle = '#9b6bff'
    ctx.fillRect(-w*0.5,-h*0.5,w,h)
  }
  ctx.restore()
}

function drawBoss(b) {
  ctx.save()
  ctx.translate(b.x,b.y)
  if (b.type==='snake'){
    const n = 12
    for (let i=0;i<n;i++){
      const t = b.time*b.snakeFreq + i*0.5
      const px = Math.sin(t)*b.snakeAmp
      const py = -i*18
      const rr = b.r*0.8*(1 - i/n*0.8)
      const gx = ctx.createRadialGradient(px,py,rr*0.2,px,py,rr)
      gx.addColorStop(0,'#7cff8a')
      gx.addColorStop(0.5,b.color)
      gx.addColorStop(1,'#000')
      ctx.fillStyle = gx
      ctx.beginPath()
      ctx.arc(px,py,rr,0,Math.PI*2)
      ctx.fill()
    }
  } else if (b.type==='bat'){
    const bodyR = b.r*0.6
    const wingA = Math.sin(b.time*4)*0.6
    ctx.fillStyle = b.color
    ctx.beginPath()
    ctx.ellipse(0,0,bodyR*0.8,bodyR,0,0,Math.PI*2)
    ctx.fill()
    ctx.save()
    ctx.rotate(-0.4+wingA)
    ctx.beginPath()
    ctx.moveTo(0,0)
    ctx.lineTo(-b.r*1.2, -b.r*0.3)
    ctx.lineTo(-b.r*0.8, b.r*0.2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.rotate(0.4-wingA)
    ctx.beginPath()
    ctx.moveTo(0,0)
    ctx.lineTo(b.r*1.2, -b.r*0.3)
    ctx.lineTo(b.r*0.8, b.r*0.2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.arc(-bodyR*0.3,-bodyR*0.2,4,0,Math.PI*2)
    ctx.arc(bodyR*0.3,-bodyR*0.2,4,0,Math.PI*2)
    ctx.fill()
  } else {
    const r = b.r
    const g = ctx.createRadialGradient(0,0,r*0.2,0,0,r)
    g.addColorStop(0,'#ff3b3b')
    g.addColorStop(0.4,b.color)
    g.addColorStop(1,'#000')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0,0,r,0,Math.PI*2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,80,80,.6)'
    ctx.lineWidth = 6
    for (let i=0;i<8;i++){
      const a = (i/8)*Math.PI*2 + b.time*0.6
      ctx.beginPath()
      ctx.moveTo(Math.cos(a)*r*0.6,Math.sin(a)*r*0.6)
      ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function spawnEnemy(def, forcedType) {
  const x = rnd(30,W-30)
  const y = -30
  const t = forcedType!==undefined ? forcedType : Math.floor(rnd(0,5))
  let hp = def.eHP
  let v = def.eSpeed
  const e = {x,y,w:26,h:26,hp:hp,v:v,t, t0: Math.random()*Math.PI*2}
  if (t===1) {
    e.baseX = x
    e.amp = rnd(30,60)
    e.freq = rnd(1.2,1.8)
  } else if (t===2) {
    e.vx = rnd(-120,120)
  } else if (t===3) {
    e.track = rnd(90,130)
    e.v = v*1.1
    e.hp = Math.max(1, hp-1)
  } else if (t===4) {
    e.stopY = rnd(120,220)
    e.fireCD = rnd(0.4,0.9)
    e.v = v*0.8
    e.hp = hp+2
  }
  enemies.push(e)
}

function spawnBoss(def) {
  const type = levelIndex===0 ? 'orb' : levelIndex===1 ? 'snake' : 'bat'
  const radius = type==='snake' ? 70 : (type==='orb' ? 120 : 100)
  boss = {x: W/2, y: -220, r: radius, hp: def.bossHP, hpMax: def.bossHP, vx: 80, color: def.bossColor, enter: true, time:0, fireScale:def.bossFire, type }
  if (type==='snake') { boss.snakeAmp = 36; boss.snakeFreq = 3.2 }
  shake = 18
  if (music) music.boss(type==='snake' ? 'snake' : type==='bat' ? 'bat' : 'orb')
}

function updatePlayer(dt) {
  const s = player.speed
  let dx = 0, dy = 0
  if (input.left) dx -= 1
  if (input.right) dx += 1
  if (input.up) dy -= 1
  if (input.down) dy += 1
  const len = Math.hypot(dx,dy)||1
  player.x += (dx/len)*s*dt
  player.y += (dy/len)*s*dt
  player.x = clamp(player.x, 20, W-20)
  player.y = clamp(player.y, 40, H-40)
  if (player.cd>0) player.cd -= dt
  if (player.scd>0) player.scd -= dt
  if (player.rcd>0) player.rcd -= dt
  if (input.fire && player.cd<=0) {
    bullets.push({x:player.x-6,y:player.y-26,v:-420,w:6,h:14,dmg:1,bossDmg:2})
    bullets.push({x:player.x+6,y:player.y-26,v:-420,w:6,h:14,dmg:1,bossDmg:2})
    player.cd = 0.13
    if (sfx) sfx.shoot()
  }
  if (input.skill && player.scd<=0) {
    if (levelIndex===0){
      const speed = 540
      for (let i=-5;i<=5;i++){
        const a = i*0.11
        const vx = Math.sin(a)*speed
        const vy = -Math.cos(a)*speed
        bullets.push({x:player.x,y:player.y-26,vx,vy,w:6,h:14,dmg:2,bossDmg:3,pierce:0})
      }
      shake = Math.max(shake,6)
    } else if (levelIndex===1){
      const speed = 560
      const n = 16
      for (let i=0;i<n;i++){
        const a = (i/n)*Math.PI*2
        bullets.push({x:player.x,y:player.y-26,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,w:6,h:14,dmg:2,bossDmg:3,pierce:0})
      }
      shake = Math.max(shake,8)
    } else {
      const speed = 600
      for (let i=-7;i<=7;i++){
        const a = i*0.1
        const vx = Math.sin(a)*speed
        const vy = -Math.cos(a)*speed
        bullets.push({x:player.x,y:player.y-26,vx,vy,w:7,h:16,dmg:3,bossDmg:4,pierce:1})
      }
      shake = Math.max(shake,10)
    }
    player.scd = 5.0
    if (sfx) sfx.shoot()
  }
  const rayMax = 2.0
  if (input.ray && player.rcd<=0) {
    player.rayActive = true
  }
  if (!input.ray && player.rayActive) {
    player.rayActive = false
    player.rcd = 7.0
    player.rayTime = 0
  }
  if (player.rayActive) {
    player.rayTime += dt
    shake = Math.max(shake, 3)
    if (player.rayTime >= rayMax) {
      player.rayActive = false
      player.rcd = 7.0
      player.rayTime = 0
    }
  }
  if (player.shield>0) player.shield -= dt
  if (player.inv>0) player.inv -= dt
}

function updateBullets(dt) {
  for (let i=bullets.length-1;i>=0;i--){
    const b = bullets[i]
    if (b.vx!==undefined) {
      b.x += b.vx*dt
      b.y += b.vy*dt
    } else {
      b.y += b.v*dt
    }
    if (b.y<-40 || b.y>H+40 || b.x<-40 || b.x>W+40) bullets.splice(i,1)
  }
}

function updateEnemies(dt, def) {
  for (let i=enemies.length-1;i>=0;i--){
    const e = enemies[i]
    e.t0 += dt*2
    if (e.t===0) {
      const sway = Math.sin(e.t0)*20
      e.y += e.v*dt
      e.x += sway*dt
      if (Math.random()<0.004) ebullets.push({x:e.x,y:e.y+16,v: 170, w:8,h:16, t:'e'})
    } else if (e.t===1) {
      e.y += e.v*dt
      e.x = e.baseX + Math.sin(e.t0*e.freq)*e.amp
      if (Math.random()<0.005) ebullets.push({x:e.x,y:e.y+16,v: 180, w:8,h:16, t:'e'})
    } else if (e.t===2) {
      e.y += e.v*dt*0.9
      e.x += e.vx*dt
      if (e.x<20 || e.x>W-20) e.vx *= -1
      if (Math.random()<0.003) ebullets.push({x:e.x,y:e.y+16,v: 190, w:8,h:16, t:'e'})
    } else if (e.t===3) {
      const dx = player.x - e.x
      const sx = Math.sign(dx)
      e.x += sx*Math.min(Math.abs(dx), e.track*dt)
      e.y += e.v*dt*1.05
    } else if (e.t===4) {
      if (e.y < e.stopY) {
        e.y += e.v*dt*0.7
      } else {
        e.fireCD -= dt
        if (e.fireCD<=0) {
          const dx = player.x - e.x
          const dy = player.y - e.y
          const len = Math.hypot(dx,dy)||1
          const sp = 220
          ebullets.push({x:e.x,y:e.y+12,vx: dx/len*sp, vy: dy/len*sp, w:8,h:16, t:'b'})
          e.fireCD = rnd(0.8,1.2)
        }
      }
    }
    if (e.y>H+40) enemies.splice(i,1)
  }
}

function updateBoss(dt, def) {
  if (!boss) return
  boss.time += dt
  if (boss.enter) {
    boss.y += 70*dt
    if (boss.y>=140) { boss.enter=false; shake=10 }
  } else {
    if (boss.type==='snake') {
      boss.x += boss.vx*dt
      if (boss.x < 60 + boss.snakeAmp || boss.x > W - 60 - boss.snakeAmp) boss.vx *= -1
      boss.y += Math.sin(boss.time*2.2)*6*dt
    } else if (boss.type==='bat') {
      boss.x += boss.vx*dt
      if (boss.x<100 || boss.x>W-100) boss.vx *= -1
      boss.y += Math.sin(boss.time*2)*12*dt
    } else {
      boss.x += boss.vx*dt
      if (boss.x<80 || boss.x>W-80) boss.vx *= -1
    }
    if (boss.time>1.2/def.bossFire) {
      boss.time = 0
      shake = Math.max(shake,4)
      if (boss.type==='snake') {
        const n = 8
        for (let i=0;i<n;i++){
          const a = (i/n-0.5)*1.6
          const vx = Math.sin(a)*120
          const vy = 160 + Math.cos(a)*20
          ebullets.push({x:boss.x + Math.sin(i)*20, y:boss.y+boss.r*0.3, vx, vy, w:10, h:22, t:'b'})
        }
      } else if (boss.type==='bat') {
        const n = 6
        for (let i=0;i<n;i++){
          const a = i%2===0 ? -0.4 : 0.4
          const vx = Math.sin(a + Math.sin(i))*140
          const vy = 220
          ebullets.push({x:boss.x + (i%2===0?-60:60), y:boss.y+20, vx, vy, w:10, h:22, t:'b'})
        }
      } else {
        const spread = 6
        for (let i=-spread;i<=spread;i++){
          const a = i*0.08
          const vx = Math.sin(a)*80
          const vy = 180 + Math.cos(a)*30
          ebullets.push({x:boss.x + Math.sin(i)*20, y:boss.y+boss.r*0.8, vx, vy, w:10, h:22, t:'b'})
        }
      }
    }
  }
}

function updateEBullets(dt) {
  for (let i=ebullets.length-1;i>=0;i--){
    const b = ebullets[i]
    if (b.t==='e') {
      b.y += b.v*dt
    } else {
      b.x += b.vx*dt
      b.y += b.vy*dt
    }
    if (b.y>H+40 || b.x<-40 || b.x>W+40) ebullets.splice(i,1)
  }
}

function applyRayDamage(dt) {
  if (!player.rayActive) return
  const bw = 18
  const topY = 0
  const dpsE = 28
  const dpsB = 16
  for (let i=enemies.length-1;i>=0;i--){
    const e = enemies[i]
    if (e.y < player.y-6 && Math.abs(e.x - player.x) < bw/2) {
      e.hp -= dpsE * dt
      if (e.hp <= 0) {
        spawnExplosion(e.x,e.y)
        if (sfx) sfx.explosion(0.9)
        maybeDropHeart(e.x,e.y)
        enemies.splice(i,1)
        score += 10
      }
    }
  }
  if (boss) {
    if (boss.y - boss.r < player.y && Math.abs(boss.x - player.x) < (boss.r*0.6)) {
      boss.hp -= dpsB * dt
    }
  }
}

function handleCollisions(def) {
  for (let i=enemies.length-1;i>=0;i--){
    const e = enemies[i]
    for (let j=bullets.length-1;j>=0;j--){
      const b = bullets[j]
      if (aabb(e.x-13,e.y-13,26,26,b.x-3,b.y-7,6,14)) {
        const dmg = b.dmg || 1
        e.hp -= dmg
        if (b.pierce!==undefined){
          b.pierce -= 1
          if (b.pierce<=0) bullets.splice(j,1)
        } else {
          bullets.splice(j,1)
        }
        if (e.hp<=0) { spawnExplosion(e.x,e.y); if (sfx) sfx.explosion(1.35); maybeDropHeart(e.x,e.y); maybeDropShield(e.x,e.y); enemies.splice(i,1); score += 10 }
        break
      }
    }
    if (player.inv<=0 && player.shield<=0 && aabb(e.x-13,e.y-13,26,26,player.x-18,player.y-21,36,42)) {
      player.hp -= 1
      player.inv = 1.3
      shake = 10
      enemies.splice(i,1)
    }
  }
  for (let i=pickups.length-1;i>=0;i--){
    const p = pickups[i]
    if (aabb(p.x-10,p.y-10,20,20,player.x-18,player.y-21,36,42)) {
      if (p.t==='heart') {
        player.hp = Math.min(6, player.hp+1)
        shake = Math.max(shake,4)
      } else if (p.t==='shield') {
        player.shield = 5.0
        shake = Math.max(shake,5)
      }
      pickups.splice(i,1)
    }
  }
  for (let i=ebullets.length-1;i>=0;i--){
    const b = ebullets[i]
    if (player.inv<=0 && player.shield<=0 && aabb(b.x-5,b.y-10,10,20,player.x-18,player.y-21,36,42)) {
      player.hp -= 1
      player.inv = 1.1
      shake = 8
      ebullets.splice(i,1)
    }
  }
  if (boss) {
    for (let j=bullets.length-1;j>=0;j--){
      const b = bullets[j]
      if (aabb(boss.x-boss.r,boss.y-boss.r,boss.r*2,boss.r*2,b.x-3,b.y-7,6,14)) {
        const bd = b.bossDmg!==undefined ? b.bossDmg : 2
        boss.hp -= bd
        if (b.pierce!==undefined){
          b.pierce -= 1
          if (b.pierce<=0) bullets.splice(j,1)
        } else {
          bullets.splice(j,1)
        }
        break
      }
    }
    if (player.inv<=0 && player.shield<=0 && aabb(boss.x-boss.r,boss.y-boss.r,boss.r*2,boss.r*2,player.x-18,player.y-21,36,42)) {
      player.hp -= 2
      player.inv = 1.5
      shake = 14
    }
  }
}

function maybeSpawn(dt, def) {
  if (boss) return
  spawnTimer -= dt
  if (spawnTimer<=0) {
    const roll = Math.random()
    if (roll<0.2) {
      const t = Math.floor(rnd(0,5))
      for (let i=0;i<3;i++) spawnEnemy(def,t)
    } else if (roll<0.5) {
      spawnEnemy(def,1)
      spawnEnemy(def,1)
    } else {
      spawnEnemy(def)
    }
    spawnTimer = Math.max(0.35, def.rate)
  }
  if (levelTime>=def.duration && !boss) spawnBoss(def)
}

function drawBullets() {
  ctx.fillStyle = '#7cb8ff'
  for (const b of bullets) {
    ctx.fillRect(b.x-3,b.y-7,6,14)
  }
}

function drawEBullets() {
  for (const b of ebullets) {
    if (b.t==='e') {
      ctx.fillStyle = '#ffd36b'
      ctx.fillRect(b.x-4,b.y-8,8,16)
    } else {
      ctx.fillStyle = '#ff5555'
      ctx.beginPath()
      ctx.ellipse(b.x,b.y,6,10,0,0,Math.PI*2)
      ctx.fill()
    }
  }
}

function drawEnemies() {
  for (const e of enemies) drawEnemy(e.x,e.y,26,26,e.t)
}

function drawPlayer() {
  if (player.inv>0 && Math.floor(player.inv*10)%2===0) return
  drawShip(player.x,player.y,36,42,'#7aa6ff')
  if (player.shield>0){
    ctx.save()
    ctx.translate(player.x,player.y)
    const r = 26
    ctx.strokeStyle = 'rgba(90,170,255,0.85)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0,0,r,0,Math.PI*2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(90,170,255,0.35)'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.arc(0,0,r+2,0,Math.PI*2)
    ctx.stroke()
    ctx.restore()
  }
}

function nextLevelOrEnd() {
  if (levelIndex < levels.length-1) {
    levelIndex++
    levelTime = 0
    bullets.length = 0
    enemies.length = 0
    ebullets.length = 0
    boss = null
    shake = 12
  } else {
    state = 'victory'
    overlay.classList.remove('hidden')
    panel.innerHTML = '<h1>胜利</h1><div class="subtitle">总得分 '+score+'</div><button class="btn" id="again">再来一局</button>'
    document.getElementById('again').addEventListener('click', () => {
      overlay.classList.add('hidden')
      resetGame()
      state = 'playing'
    })
  }
}

function gameOver() {
  state = 'gameover'
  overlay.classList.remove('hidden')
  panel.innerHTML = '<h1>失败</h1><div class="subtitle">得分 '+score+'</div><button class="btn" id="retry">重试</button>'
  document.getElementById('retry').addEventListener('click', () => {
    overlay.classList.add('hidden')
    resetGame()
    state = 'playing'
  })
}

function update(dt) {
  if (state!=='playing') return
  const def = levels[levelIndex]
  levelTime += dt
  maybeSpawn(dt, def)
  updatePlayer(dt)
  updateBullets(dt)
  updateEnemies(dt, def)
  updateEBullets(dt)
  updateBoss(dt, def)
  updateParticles(dt)
  updatePickups(dt)
  applyRayDamage(dt)
  handleCollisions(def)
  if (player.hp<=0) return gameOver()
  if (boss && boss.hp<=0) {
    for (let i=0;i<6;i++){
      const ang = (i/6)*Math.PI*2
      spawnExplosion(boss.x+Math.cos(ang)*boss.r*0.6, boss.y+Math.sin(ang)*boss.r*0.6, {count:24, base:'#ff6b6b', maxR:4})
    }
    if (sfx) sfx.explosion(1.6)
    spawnHeart(boss.x, boss.y)
    boss = null
    bossbar.classList.add('hidden')
    score += 100
    nextLevelOrEnd()
    if (music) music.stage()
  }
  if (boss) {
    bossbar.classList.remove('hidden')
    bossbarFill.style.width = Math.max(0, Math.min(100, boss.hp/boss.hpMax*100))+'%'
  }
  hudLeft.textContent = '关卡 '+(levelIndex+1)
  hudLeft.textContent = '生命 '+player.hp+' | 关卡 '+(levelIndex+1)
  hudRight.textContent = '得分 '+score
}

function render(dt) {
  let sx = 0, sy = 0
  if (shake>0) {
    sx = rnd(-shake,shake)
    sy = rnd(-shake,shake)
    shake = Math.max(0, shake - dt*20)
  }
  ctx.save()
  ctx.translate(sx, sy)
  drawBackground(dt)
  drawEnemies()
  drawEBullets()
  drawBullets()
  drawParticles()
  if (player.rayActive) {
    const w = 18
    const h = Math.max(0, player.y-6)
    const hue = (player.rayTime*360)%360
    const grad = ctx.createLinearGradient(player.x, 0, player.x, h)
    grad.addColorStop(0, `hsla(${hue},90%,60%,0.9)`)
    grad.addColorStop(1, `hsla(${(hue+90)%360},90%,50%,0.6)`)
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = grad
    ctx.fillRect(player.x - w/2, 0, w, h)
    ctx.fillStyle = `hsla(${(hue+180)%360},90%,70%,0.3)`
    ctx.fillRect(player.x - w, 0, w*2, h)
    ctx.globalCompositeOperation = 'source-over'
  }
  drawPickups()
  drawPlayer()
  if (boss) drawBoss(boss)
  ctx.restore()
  if (state==='menu') {
    ctx.fillStyle = 'rgba(0,0,0,.4)'
    ctx.fillRect(0,0,W,H)
  }
}

function loop(t) {
  const now = t/1000
  const dt = Math.min(0.033, now - last || 0.016)
  last = now
  if (state==='playing') acc += dt
  while (acc>=0.016) {
    update(0.016)
    acc -= 0.016
  }
  render(dt)
  requestAnimationFrame(loop)
}

function setupMenu() {
  panel.innerHTML = '<h1>星域突击</h1><div class="subtitle">三关逐Boss，方向键移动，空格射击</div><button class="btn" id="start">开始游戏</button>'
  document.getElementById('start').addEventListener('click', () => {
    overlay.classList.add('hidden')
    resetGame()
    state = 'playing'
    ensureAudio()
    if (music) music.stage()
  })
}

startBtn.addEventListener('click', () => {
  state = 'menu'
  setupMenu()
})

loadAssets().then(()=>{
  requestAnimationFrame(loop)
})
