(() => {


'use strict';
const canvas = document.getElementById('game');
const sbConfigEl = document.getElementById('sbConfig');
const sbUrlInput = document.getElementById('sbUrl');
const sbKeyInput = document.getElementById('sbKey');
const sbSaveBtn = document.getElementById('sbSave');
const sbCloseBtn = document.getElementById('sbClose');
const nickConfigEl = document.getElementById('nickConfig');
const nickInput = document.getElementById('nickInput');
const nickSaveBtn = document.getElementById('nickSave');
const chatInput = document.getElementById('chatInput');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
try { ctx.imageSmoothingQuality = 'high'; } catch(e) {}
const W = canvas.width, H = canvas.height;

const keys = Object.create(null);
const mouse = {x: W/2, y: H/2, down:false, worldX:0, worldY:0};
let last = performance.now();
let state = 'loading';
let loadingTimer = 1.65;
let menuStep = 'main';
let searchTimer = 0;
let roomCreated = false;
let gameMode = 'mission'; // mission / lobby
let lobbyUi = null;       // shop / missions
let lobbyELock = false;
let flashlightBlink = 0;
let flashlightOn = true;
let noise = {x:0,y:0,timer:0};
let camera = {x:0,y:0};
let shake = 0;
let shakeTimer = 0;
let message = '';
let messageTimer = 0;
const story = {active:false, step:0, timer:0, focus:'player', locked:false};
let chatBubble = {text:'', timer:0};
let merchantBubble = {text:'', timer:0, next:3.5};
let merchantQuestion = {active:false, text:'', timer:0, asked:false};
const lobbyTargets = [];
let missionELock = false;
const alarmButtons = [];
const alarmBeacons = [];
let alarmReinforcementsDone = false;
let corpseFastRender = false;
let leaderboard = [];
let leaderboardTimer = 0;
let loadoutCategory = 'weapons';
let audioReady = false;
let ac = null;

const SUPABASE_DEFAULT_URL = 'https://gttowhevrktyjusejkyj.supabase.co';
const SUPABASE_DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0dG93aGV2cmt0eWp1c2Vqa3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzM0OTQsImV4cCI6MjA5Njk0OTQ5NH0.RQUYria4RPxsCs1Xti5b_sckvL8t5A0dtzrVKhvhODk';
const ONLINE_INDEX_CHANNEL = 'echo_noir_online_rooms_v1';
const ONLINE_ROOM_PREFIX = 'echo_noir_room_v1_';
const online = {
  client:null,
  ready:false,
  active:false,
  searching:false,
  isHost:false,
  clientId: localStorage.getItem('echo_noir_account_id') || ('p_' + Math.random().toString(36).slice(2,10)),
  playerName: localStorage.getItem('echo_noir_player_nick') || '',
  roomId:null,
  roomCode:null,
  roomChannel:null,
  indexChannel:null,
  rooms:[],
  remotePlayers:{},
  lastSend:0,
  lastIndexTrack:0,
  lastStatus:'OFFLINE',
  missionSeed:0
};
if(!localStorage.getItem('echo_noir_account_id')) localStorage.setItem('echo_noir_account_id', online.clientId);
if(!localStorage.getItem('echo_noir_db_ready')) localStorage.setItem('echo_noir_db_ready','0');

const rand = (a,b)=>a+Math.random()*(b-a);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const dist = (a,b,c,d)=>Math.hypot(a-c,b-d);
const angleTo = (a,b,c,d)=>Math.atan2(d-b,c-a);

// Zvuky: stačí do stejné složky jako index.html přidat soubory:
const soundPaths = {
  music: 'hra.mp3',
  weapons: {
    ak47: 'ak47.mp3',
    pistol: 'pistol.mp3',
    awp: 'awp.mp3',
    shotgun: 'shotgun.mp3',
    smg: 'smg.mp3'
  },
  reload: 'reload.mp3',
  pickup: 'pickup.mp3',
  hit: 'hit.mp3',
  death: 'death.mp3',
  door: 'door.mp3'
};
const soundCache = {};
let musicAudio = null;
let soundEnabled = true;

function initAudio(){
  audioReady = true;
}

function getAudio(path){
  if(!path) return null;
  if(!soundCache[path]){
    const a = new Audio(path);
    a.preload = 'auto';
    soundCache[path] = a;
  }
  return soundCache[path];
}

function playSound(path, volume=.55){
  if(!soundEnabled || !path) return;
  try{
    const base = getAudio(path);
    if(!base) return;
    const a = base.cloneNode();
    a.volume = volume;
    a.play().catch(()=>{});
  }catch(e){}
}

function playMusic(){
  if(!soundEnabled) return;
  try{
    if(!musicAudio){
      musicAudio = new Audio(soundPaths.music);
      musicAudio.loop = true;
      musicAudio.volume = .28;
    }
    musicAudio.play().catch(()=>{});
  }catch(e){}
}

function stopMusic(){
  try{ if(musicAudio){ musicAudio.pause(); musicAudio.currentTime = 0; } }catch(e){}
}

function getPlayerNick(){
  return (localStorage.getItem('echo_noir_player_nick') || '').trim();
}
function setPlayerNick(nick){
  const clean = String(nick || '').trim().slice(0,18) || ('HRÁČ ' + online.clientId.slice(-4).toUpperCase());
  localStorage.setItem('echo_noir_player_nick', clean);
  online.playerName = clean;
  saveProgress();
  saveAccountToSupabase();
  return clean;
}
function openNickEditor(){
  state = 'nick';
  if(nickInput) nickInput.value = getPlayerNick();
  if(nickConfigEl) nickConfigEl.classList.add('show');
  setTimeout(()=>{ try{ nickInput && nickInput.focus(); }catch(e){} }, 30);
}
function closeNickEditor(){
  if(nickConfigEl) nickConfigEl.classList.remove('show');
}
async function saveAccountToSupabase(){
  try{
    // REST tabulky se použijí až po spuštění SQL souboru v Supabase.
    // Bez toho by Supabase vracel 404 do konzole.
    if(localStorage.getItem('echo_noir_db_ready') !== '1') return;
    if(!ensureOnlineClient()) return;
    const nick = getPlayerNick();
    if(!nick) return;
    await online.client.from('echo_noir_accounts').upsert({
      id: online.clientId,
      nickname: nick,
      total_kills: player.totalKills|0,
      total_xp: player.totalXp|0,
      level: player.level|0,
      updated_at: new Date().toISOString()
    }, { onConflict:'id' });
  }catch(e){}
}

function getLocalLeaderboard(){
  const nick = getPlayerNick() || online.playerName || 'HRÁČ';
  return [{nickname:nick, level:player.level|0, total_kills:player.totalKills|0}];
}
async function refreshLeaderboard(force=false){
  try{
    if(!force && leaderboardTimer > 0) return;
    leaderboardTimer = 8;
    leaderboard = getLocalLeaderboard();
    if(localStorage.getItem('echo_noir_db_ready') !== '1') return;
    if(!ensureOnlineClient()) return;
    const {data,error} = await online.client
      .from('echo_noir_accounts')
      .select('nickname,total_kills,level')
      .order('level',{ascending:false})
      .order('total_kills',{ascending:false})
      .limit(8);
    if(!error && Array.isArray(data) && data.length) leaderboard = data;
  }catch(e){
    leaderboard = getLocalLeaderboard();
  }
}
function drawLobbyLeaderboard(){
  if(gameMode!=='lobby') return;
  const x = W-306, y = 104, w = 282, h = 216;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.78)';
  ctx.strokeStyle='#d20b1c';
  ctx.lineWidth=3;
  ctx.fillRect(x,y,w,h);
  ctx.strokeRect(x,y,w,h);
  ctx.font='24px Impact';
  ctx.textAlign='center';
  ctx.fillStyle='#fff';
  ctx.fillText('ŽEBŘÍČEK',x+w/2,y+32);
  ctx.font='13px Arial Black';
  ctx.textAlign='left';
  ctx.fillStyle='rgba(255,255,255,.65)';
  ctx.fillText('HRÁČ',x+14,y+58);
  ctx.fillText('LVL',x+154,y+58);
  ctx.fillText('KILL',x+205,y+58);
  const rows = (leaderboard && leaderboard.length ? leaderboard : getLocalLeaderboard()).slice(0,7);
  for(let i=0;i<rows.length;i++){
    const r=rows[i]||{};
    const yy=y+80+i*18;
    ctx.fillStyle=i===0?'#ffe07a':'#eee';
    const name=String(r.nickname||r.nick||'HRÁČ').slice(0,15);
    ctx.fillText((i+1)+'. '+name,x+14,yy);
    ctx.fillText(String(r.level||0),x+160,yy);
    ctx.fillText(String(r.total_kills||r.kills||0),x+208,yy);
  }
  ctx.restore();
}

function normalizeSupabaseUrl(value){
  let v = String(value || '').trim();
  if(!v) return '';
  if(!/^https?:\/\//i.test(v)){
    if(!v.includes('.')) v = v + '.supabase.co';
    v = 'https://' + v;
  }
  return v.replace(/\/+$/,'');
}
function getOnlineConfig(){
  const url = localStorage.getItem('echo_noir_supabase_url') || SUPABASE_DEFAULT_URL;
  const key = localStorage.getItem('echo_noir_supabase_key') || SUPABASE_DEFAULT_KEY;
  return { url: normalizeSupabaseUrl(url), key };
}
function saveOnlineConfig(url,key){
  localStorage.setItem('echo_noir_supabase_url', normalizeSupabaseUrl(url) || SUPABASE_DEFAULT_URL);
  localStorage.setItem('echo_noir_supabase_key', String(key || '').trim() || SUPABASE_DEFAULT_KEY);
}
function openSupabaseEditor(){
  const current = getOnlineConfig();
  if(sbUrlInput) sbUrlInput.value = current.url;
  if(sbKeyInput) sbKeyInput.value = current.key;
  if(sbConfigEl) sbConfigEl.classList.add('show');
}
function closeSupabaseEditor(){
  if(sbConfigEl) sbConfigEl.classList.remove('show');
}
function configureSupabase(){
  message = 'SUPABASE SE NENAČETL';
  messageTimer = 1.8;
  return false;
}
function saveSupabaseEditor(){
  saveOnlineConfig(sbUrlInput ? sbUrlInput.value : '', sbKeyInput ? sbKeyInput.value : '');
  online.client = null;
  online.ready = false;
  ensureOnlineClient();
  closeSupabaseEditor();
  message = 'SUPABASE ULOŽENO';
  messageTimer = 1.8;
  return true;
}
function ensureOnlineClient(){
  const cfg = getOnlineConfig();
  if(!cfg.url || !cfg.key){
    message = 'CHYBÍ SUPABASE';
    messageTimer = 1.8;
    return false;
  }
  if(!window.supabase || !window.supabase.createClient){
    message = 'SUPABASE CDN NENÍ NAČTENÉ';
    messageTimer = 1.8;
    return false;
  }
  if(!online.client){
    online.client = window.supabase.createClient(cfg.url, cfg.key, {
      realtime: { params: { eventsPerSecond: 30 } }
    });
  }
  online.ready = true;
  online.lastStatus = 'ONLINE';
  return true;
}
function rememberOnlineRoom(room){
  if(!room || !room.roomId) return;
  if(Date.now() - (room.ts || 0) > 15000) return;
  const map = new Map();
  for(const r of online.rooms || []){
    if(r && r.roomId && Date.now() - (r.ts || 0) <= 15000) map.set(r.roomId, r);
  }
  map.set(room.roomId, room);
  online.rooms = [...map.values()].filter(r=>!r.started).sort((a,b)=>(b.ts||0)-(a.ts||0));
}
function syncOnlineRooms(){
  if(!online.indexChannel) return;
  const st = online.indexChannel.presenceState();
  const map = new Map();
  for(const r of online.rooms || []){
    if(r && r.roomId && Date.now() - (r.ts || 0) <= 15000) map.set(r.roomId, r);
  }
  for(const arr of Object.values(st)){
    for(const p of arr){
      if(!p || p.type !== 'room') continue;
      if(Date.now() - (p.ts || 0) > 15000) continue;
      map.set(p.roomId, p);
    }
  }
  online.rooms = [...map.values()].filter(r=>!r.started).sort((a,b)=>(b.ts||0)-(a.ts||0));
}
function subscribeOnlineIndex(trackSelf=false){
  if(!ensureOnlineClient()) return false;
  if(online.indexChannel){
    if(trackSelf && online.isHost) trackOnlineRoom();
    else if(online.searching){ try{ online.indexChannel.track({type:'searcher',id:online.clientId,name:online.playerName,ts:Date.now()}); }catch(e){} }
    return true;
  }
  online.indexChannel = online.client.channel(ONLINE_INDEX_CHANNEL, {
    config:{ broadcast:{self:false,ack:false}, presence:{ key:online.clientId } }
  });
  online.indexChannel
    .on('broadcast',{event:'roomAnnounce'},payload=>{
      rememberOnlineRoom(payload.payload || {});
    })
    .on('presence',{event:'sync'},()=>syncOnlineRooms())
    .subscribe(async status=>{
      online.lastStatus = status;
      if(status === 'SUBSCRIBED'){
        if(trackSelf && online.isHost) trackOnlineRoom();
        else await online.indexChannel.track({type:'searcher',id:online.clientId,name:online.playerName,ts:Date.now()});
        syncOnlineRooms();
      }
    });
  return true;
}
async function trackOnlineRoom(){
  if(!online.indexChannel || !online.isHost || !online.roomId) return;
  const players = 1 + Object.keys(online.remotePlayers).length;
  const room = {
    type:'room',
    roomId:online.roomId,
    code:online.roomCode,
    host:online.playerName || getPlayerNick() || 'HOST',
    players,
    started:gameMode==='mission',
    ts:Date.now()
  };
  rememberOnlineRoom(room);
  try{ await online.indexChannel.track(room); }catch(e){}
  try{ await online.indexChannel.send({type:'broadcast',event:'roomAnnounce',payload:room}); }catch(e){}
  upsertDbRoom(room);
}


async function upsertDbRoom(room){
  try{
    if(!online.client || !room || !room.roomId) return;
    await online.client.from('echo_noir_rooms').upsert({
      room_id:room.roomId, code:room.code, host_id:online.clientId,
      host_name:room.host, players:room.players|0, started:!!room.started,
      updated_at:new Date().toISOString()
    }, {onConflict:'room_id'});
  }catch(e){}
}
async function fetchDbRooms(){
  try{
    if(!online.client) return;
    const since = new Date(Date.now()-18000).toISOString();
    const {data,error} = await online.client
      .from('echo_noir_rooms')
      .select('room_id,code,host_name,players,started,updated_at')
      .eq('started',false)
      .gt('updated_at',since)
      .order('updated_at',{ascending:false})
      .limit(10);
    if(error || !Array.isArray(data)) return;
    for(const r of data){
      rememberOnlineRoom({type:'room',roomId:r.room_id,code:r.code,host:r.host_name,players:r.players,started:r.started,ts:new Date(r.updated_at).getTime()});
    }
  }catch(e){}
}
function createOnlineRoom(){
  if(!ensureOnlineClient()) return false;
  online.active = true;
  online.searching = false;
  online.isHost = true;
  online.roomId = 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
  online.roomCode = online.roomId.slice(-4).toUpperCase();
  online.remotePlayers = {};
  setupOnlineRoomChannel();
  online.lastIndexTrack = 0;
  subscribeOnlineIndex(true);
  setTimeout(()=>trackOnlineRoom(),180);
  setTimeout(()=>trackOnlineRoom(),850);
  enterLobby();
  message = 'ONLINE LOBBY ' + online.roomCode;
  messageTimer = 2;
  return true;
}
function openOnlineSearch(){
  if(!ensureOnlineClient()) return false;
  online.active = false;
  online.searching = true;
  online.isHost = false;
  online.roomId = null;
  online.roomCode = null;
  online.remotePlayers = {};
  online.rooms = [];
  online.lastIndexTrack = 0;
  subscribeOnlineIndex(false);
  setTimeout(()=>syncOnlineRooms(),250);
  setTimeout(()=>fetchDbRooms(),450);
  menuStep = 'online_search';
  return true;
}
function joinOnlineRoom(room){
  if(!room || !room.roomId || !ensureOnlineClient()) return false;
  online.active = true;
  online.searching = false;
  online.isHost = false;
  online.roomId = room.roomId;
  online.roomCode = room.code || room.roomId.slice(-4).toUpperCase();
  online.remotePlayers = {};
  setupOnlineRoomChannel();
  enterLobby();
  message = 'PŘIPOJENO ' + online.roomCode;
  messageTimer = 1.6;
  return true;
}
function setupOnlineRoomChannel(){
  if(!online.client || !online.roomId) return;
  if(online.roomChannel){
    try{ online.client.removeChannel(online.roomChannel); }catch(e){}
  }
  online.roomChannel = online.client.channel(ONLINE_ROOM_PREFIX + online.roomId, {
    config:{
      broadcast:{ self:false, ack:false },
      presence:{ key:online.clientId }
    }
  });
  online.roomChannel
    .on('broadcast',{event:'state'},payload=>{
      const p = payload.payload || {};
      if(!p.id || p.id === online.clientId) return;
      online.remotePlayers[p.id] = {...(online.remotePlayers[p.id]||{}), ...p, lastSeen:Date.now()};
    })
    .on('broadcast',{event:'startMission'},payload=>{
      const data = payload.payload || {};
      if(!online.isHost) applyOnlineMissionStart(data);
    })
    .on('broadcast',{event:'chat'},payload=>{
      const c = payload.payload || {};
      if(!c.id || c.id === online.clientId) return;
      const rp = online.remotePlayers[c.id] || {id:c.id,name:c.name||'HRÁČ'};
      rp.chatText = String(c.text||'').slice(0,70);
      rp.chatUntil = Date.now()+4500;
      rp.lastSeen = Date.now();
      online.remotePlayers[c.id] = rp;
    })
    .subscribe(async status=>{
      online.lastStatus = status;
      if(status === 'SUBSCRIBED'){
        await online.roomChannel.track({id:online.clientId,name:online.playerName,role:online.isHost?'host':'player',ts:Date.now()});
        sendOnlineState(true);
      }
    });
}
function sendOnlineState(force=false){
  if(!online.active || !online.roomChannel || state!=='play') return;
  const now = performance.now();
  if(!force && now - online.lastSend < 30) return;
  online.lastSend = now;
  const pkt = {
    id:online.clientId,
    name:online.playerName,
    host:online.isHost,
    x:player.x,y:player.y,ang:player.ang,
    walk:player.walk,moving:player.moving,
    hp:player.hp,maxHp:player.maxHp,dead:player.dead,
    chatText:chatBubble.timer>0?chatBubble.text:'',chatUntil:chatBubble.timer>0?Date.now()+Math.max(400,chatBubble.timer*1000):0,
    gameMode,weaponType:player.weaponType,characterKey:player.characterKey,
    level:player.level,kills:player.kills,totalKills:player.totalKills,
    t:Date.now()
  };
  try{ online.roomChannel.send({type:'broadcast',event:'state',payload:pkt}); }catch(e){}
}
function onlineTick(dt){
  if(online.isHost && online.indexChannel && online.roomId){
    if(performance.now() - online.lastIndexTrack > 750){
      online.lastIndexTrack = performance.now();
      trackOnlineRoom();
    }
  } else if(online.searching && online.indexChannel){
    if(performance.now() - online.lastIndexTrack > 1200){
      online.lastIndexTrack = performance.now();
      syncOnlineRooms();
      fetchDbRooms();
    }
  }
  if(online.active) sendOnlineState(false);
  for(const [id,p] of Object.entries(online.remotePlayers)){
    if(Date.now() - (p.lastSeen || 0) > 6000) delete online.remotePlayers[id];
  }
}
function startOnlineMission(){
  if(!online.active) return false;
  if(!online.isHost){
    message = 'MISI SPOUŠTÍ JEN HOST';
    messageTimer = 1.6;
    return true;
  }
  const seed = Date.now();
  const data = {seed,roomId:online.roomId,startedBy:online.clientId};
  try{ online.roomChannel.send({type:'broadcast',event:'startMission',payload:data}); }catch(e){}
  applyOnlineMissionStart(data);
  trackOnlineRoom();
  return true;
}
function applyOnlineMissionStart(data={}){
  online.missionSeed = data.seed || Date.now();
  lobbyUi = null;
  gameMode = 'mission';
  resetGame();
  state = 'play';
  if(online.active){
    if(online.isHost){ player.x = 180; player.y = 590; }
    else { player.x = 245; player.y = 590; }
    player.ang = 0;
    revealFog(player.x, player.y, 255);
    camera.x = clamp(player.x - W/2, 0, Math.max(0,map.w-W));
    camera.y = clamp(player.y - H/2, 0, Math.max(0,map.h-H));
    sendOnlineState(true);
  }
}
function drawOnlinePlayers(){
  if(!online.active) return;
  for(const p of Object.values(online.remotePlayers)){
    if(!p || p.gameMode !== gameMode) continue;
    if(Date.now() - (p.lastSeen || 0) > 6000) continue;
    if(!Number.isFinite(p.rx)){ p.rx = p.x; p.ry = p.y; }
    p.rx += (p.x - p.rx) * .34;
    p.ry += (p.y - p.ry) * .34;
    const s = getSpriteAssetFor(p.characterKey || 'zlaty', p.weaponType || 'm4');
    drawSpriteAt(p.rx,p.ry,p.ang||0,p.walk||0,!!p.moving,p.name||'HRÁČ','brightness(.50) contrast(1.20) saturate(.85)',p.hp,p.maxHp||60,s.img,s.ready);
    if(p.chatText && Date.now() < (p.chatUntil||0)) drawWorldBubble(p.rx,p.ry-70,p.chatText,{maxChars:34,stroke:'#d20b1c'});
  }
}

// starý beep už nepípá generátor, jen zůstává kvůli kompatibilitě starého kódu
function beep(freq=120, dur=.06, gain=.04, type='square'){}

const map = {
  w: 2600,
  h: 1750,
  walls: [],
  decor: [],
  doors: []
};
const lobbyData = {
  shop:{x:350,y:300,w:230,h:75},
  shopkeeper:{x:465,y:258,ang:Math.PI/2},
  missionDesk:{x:810,y:300,w:210,h:82},
  pc:{x:865,y:276,w:58,h:42},
  loadout:{x:170,y:600,w:110,h:44},
  statsBoard:{x:140,y:132,w:180,h:56},
  teammate:{x:250,y:520,ang:0,walk:0,moving:false,name:'PLAYER 2',tx:250,ty:520},
  targetA:{x:675,y:575,ang:-Math.PI/2},
  targetB:{x:760,y:575,ang:-Math.PI/2}
};
const fog = { cell: 48, cols: 0, rows: 0, seen: [] };
const textures = { floor:null, floor2:null, floor3:null, tile:null, tileDark:null, vinyl:null, wall:null, wallDark:null, metal:null, wood:null, fabric:null, plastic:null, darkMetal:null, rug:null };
const playerSprite = new Image();
let playerSpriteReady = false;
playerSprite.onload = () => { playerSpriteReady = true; };
let currentPlayerSpriteSrc = 'loadout_m4.png';
playerSprite.src = currentPlayerSpriteSrc;
const enemySprites = [new Image(), new Image(), new Image(), new Image(), new Image(), new Image()];
const enemySpritesReady = [false, false, false, false, false, false];
enemySprites.forEach((img, i) => { img.onload = () => { enemySpritesReady[i] = true; }; });
enemySprites[0].src = 'enemy_custom.png';
enemySprites[1].src = 'enemy_variant1.png';
enemySprites[2].src = 'enemy_variant2.png';
enemySprites[3].src = currentPlayerSpriteSrc;
enemySprites[4].src = 'enemy_variant3.png';
enemySprites[5].src = 'enemy_variant4.png';
const turretSprite = new Image();
let turretSpriteReady = false;
turretSprite.onload = () => { turretSpriteReady = true; };
turretSprite.src = 'turret_custom.png';
const turretCandidates = [
  {x:260,y:245,ang:.65},{x:660,y:250,ang:2.35},{x:1000,y:250,ang:.88},{x:1320,y:255,ang:2.35},
  {x:1600,y:250,ang:.80},{x:2180,y:255,ang:2.45},{x:260,y:865,ang:.08},{x:960,y:870,ang:Math.PI},
  {x:1600,y:870,ang:.10},{x:2110,y:870,ang:Math.PI-.08},{x:250,y:1260,ang:.48},{x:920,y:1260,ang:-.62},
  {x:1570,y:1260,ang:Math.PI-.56},{x:2130,y:1265,ang:Math.PI+.35},
  {x:2660,y:1265,ang:Math.PI+.18},{x:720,y:1780,ang:.35},{x:1580,y:1780,ang:-.55},{x:2600,y:1780,ang:Math.PI-.35}
];
const cameraCandidates = [
  {x:190,y:155,ang:.9},{x:735,y:155,ang:2.35},{x:895,y:155,ang:.95},{x:1400,y:155,ang:2.35},
  {x:1650,y:155,ang:.95},{x:2230,y:155,ang:2.55},{x:120,y:900,ang:.04},{x:1200,y:900,ang:Math.PI-.04},
  {x:2230,y:900,ang:Math.PI+.05},{x:120,y:1465,ang:-.16},{x:1185,y:1465,ang:-1.58},{x:2230,y:1465,ang:Math.PI-.18},
  {x:2920,y:900,ang:Math.PI+.10},{x:2920,y:1465,ang:Math.PI-.25},{x:115,y:1900,ang:.12},{x:1550,y:1900,ang:-1.57},{x:2920,y:1900,ang:Math.PI-.12}
];
const missionName = 'MISE: ČERNÝ SKLAD';
const missionId = 'cerny_sklad';
const playerNick = 'PROJEKT SAS';
const loadoutDefs = {
  m4: {
    key: 'm4',
    name: 'M4A1',
    title: 'Útočná puška',
    desc: 'Vyvážená automatická puška pro základní postavu.',
    imgPath: 'loadout_m4.png',
    sound: soundPaths.weapons.ak47
  },
  sniper: {
    key: 'sniper',
    name: 'Sniper',
    title: 'Odstřelovačka',
    desc: 'Přesná puška na jednotlivé silné rány.',
    imgPath: 'loadout_sniper.png',
    sound: soundPaths.weapons.awp
  },
  lmg: {
    key: 'lmg',
    name: 'Kulomet',
    title: 'Těžký kulomet',
    desc: 'Rychlá palba a velký zásobník.',
    imgPath: 'loadout_lmg.png',
    sound: soundPaths.weapons.smg
  },
  shotgun: {
    key: 'shotgun',
    name: 'Shotgun',
    title: 'Brokovnice',
    desc: 'Silná zblízka, střílí rozptylem broků.',
    imgPath: 'loadout_shotgun.png',
    sound: soundPaths.weapons.shotgun
  },
  grenade: {
    key: 'grenade',
    name: 'Granát',
    title: 'Výbušnina',
    desc: 'Jeden kus do sekundárního slotu. Po hodu zmizí.',
    imgPath: null,
    sound: soundPaths.weapons.shotgun
  }
};
const loadoutOrder = ['m4','sniper','lmg','shotgun','grenade'];
loadoutOrder.forEach(key => {
  const d = loadoutDefs[key];
  d.img = new Image();
  d.ready = false;
  if(d.imgPath){
    d.img.onload = () => { d.ready = true; };
    d.img.src = d.imgPath;
  } else d.ready = true;
});
const equipmentDefs = {
  vest:{key:'vest',name:'Vesta',slot:'tělo',hp:12,armor:.06,desc:'+12 HP, menší poškození'},
  helmet:{key:'helmet',name:'Helma',slot:'hlava',hp:8,armor:.045,desc:'+8 HP, ochrana hlavy'},
  boots:{key:'boots',name:'Boty',slot:'nohy',hp:5,armor:.025,desc:'+5 HP, pevnější krok'},
  gloves:{key:'gloves',name:'Rukavice',slot:'ruce',hp:4,armor:.02,desc:'+4 HP, jistější úchop'},
  pants:{key:'pants',name:'Kalhoty',slot:'nohy',hp:7,armor:.035,desc:'+7 HP, lehká ochrana'}
};
const equipmentOrder = ['vest','helmet','boots','gloves','pants'];
const characterDefs = {
  zlaty: {
    key:'zlaty',
    name:'Zlatý Rachot',
    title:'základní postava',
    requiredLevel:1,
    imgPath:'char_zlaty_rachot.png',
    desc:'Těžký magor se zlatým kulometem. Základní skin.'
  },
  klobouk: {
    key:'klobouk',
    name:'Kloboučník Vrána',
    title:'level 5',
    requiredLevel:5,
    imgPath:'char_kloboucnik.png',
    desc:'Temný sniper s cylindrem a červeným zaměřením.'
  },
  sekac: {
    key:'sekac',
    name:'Černý Sekáč',
    title:'level 10',
    requiredLevel:10,
    imgPath:'char_sekac.png',
    desc:'Tichý sekáč s katanou. Zbraně pro něj dodáme později.'
  }
};
const characterOrder = ['zlaty','klobouk','sekac'];
characterOrder.forEach(key => {
  const d = characterDefs[key];
  d.img = new Image();
  d.ready = false;
  d.img.onload = () => { d.ready = true; };
  d.img.src = d.imgPath;
});
const weaponDefs = {
  m4: {
    name: 'M4A1', clip: 30, reserve: 120, damage: 66, speed: 980, spread: .028, fireDelay: .11,
    muzzleDist: 72, shellOffsetForward: 20, shellOffsetSide: -11, reloadTime: 1.35, pellets: 1,
    sound: soundPaths.weapons.ak47
  },
  sniper: {
    name: 'Sniper', clip: 5, reserve: 25, damage: 160, speed: 1680, spread: .005, fireDelay: .95,
    muzzleDist: 82, shellOffsetForward: 22, shellOffsetSide: -10, reloadTime: 1.9, pellets: 1,
    sound: soundPaths.weapons.awp
  },
  lmg: {
    name: 'Kulomet', clip: 65, reserve: 195, damage: 52, speed: 900, spread: .055, fireDelay: .09,
    muzzleDist: 76, shellOffsetForward: 22, shellOffsetSide: -10, reloadTime: 2.1, pellets: 1,
    sound: soundPaths.weapons.smg
  },
  shotgun: {
    name: 'Shotgun', clip: 8, reserve: 40, damage: 34, speed: 860, spread: .07, fireDelay: .72,
    muzzleDist: 74, shellOffsetForward: 18, shellOffsetSide: -9, reloadTime: 1.65, pellets: 6,
    sound: soundPaths.weapons.shotgun
  },
  grenade: {
    name: 'Granát', clip: 1, reserve: 0, damage: 0, speed: 0, spread: 0, fireDelay: .7,
    muzzleDist: 28, shellOffsetForward: 0, shellOffsetSide: 0, reloadTime: 0, pellets: 0,
    sound: soundPaths.weapons.shotgun, grenade:true
  }
};
const patrolZones = [
  {x:125,y:125,w:665,h:595}, {x:845,y:125,w:605,h:595}, {x:1505,y:125,w:465,h:595},
  {x:2025,y:125,w:305,h:595}, {x:125,y:775,w:2205,h:245}, {x:125,y:1075,w:395,h:455},
  {x:575,y:1075,w:645,h:455}, {x:1275,y:1075,w:555,h:455}, {x:1885,y:1075,w:445,h:455},
  {x:2400,y:125,w:180,h:620}, {x:2400,y:1075,w:180,h:430}
,
  {x:2380,y:1120,w:600,h:360},
  {x:140,y:1620,w:900,h:350},
  {x:1160,y:1620,w:850,h:350},
  {x:2160,y:1620,w:820,h:350}
];

const roomVisuals = [
  {x:125,y:125,w:665,h:595,floor:'tileDark', rugs:[{x:240,y:420,w:220,h:120,c:'#4f1414'},{x:500,y:230,w:150,h:90,c:'#1f3a4a'}]},
  {x:845,y:125,w:605,h:595,floor:'floor2', rugs:[{x:1030,y:440,w:180,h:110,c:'#4a3517'}]},
  {x:1505,y:125,w:465,h:595,floor:'vinyl', rugs:[{x:1635,y:455,w:160,h:96,c:'#233628'}]},
  {x:2025,y:125,w:305,h:595,floor:'tile', rugs:[{x:2082,y:445,w:135,h:85,c:'#353535'}]},
  {x:125,y:775,w:2205,h:245,floor:'floor3', rugs:[{x:770,y:835,w:190,h:70,c:'#40243d'},{x:1540,y:840,w:215,h:66,c:'#3b2f19'}]},
  {x:125,y:1075,w:395,h:455,floor:'tileDark', rugs:[{x:205,y:1325,w:170,h:95,c:'#143045'}]},
  {x:575,y:1075,w:645,h:455,floor:'floor2', rugs:[{x:760,y:1288,w:250,h:120,c:'#4d1717'}]},
  {x:1275,y:1075,w:555,h:455,floor:'vinyl', rugs:[{x:1435,y:1300,w:180,h:96,c:'#28352e'}]},
  {x:1885,y:1075,w:445,h:455,floor:'tile', rugs:[{x:1990,y:1295,w:170,h:98,c:'#2f243e'}]},
  {x:2390,y:1075,w:640,h:455,floor:'floor2', rugs:[{x:2570,y:1285,w:210,h:105,c:'#25323a'}]},
  {x:125,y:1585,w:945,h:445,floor:'floor3', rugs:[{x:350,y:1780,w:240,h:110,c:'#392020'}]},
  {x:1125,y:1585,w:925,h:445,floor:'vinyl', rugs:[{x:1400,y:1765,w:250,h:115,c:'#1f3440'}]},
  {x:2105,y:1585,w:925,h:445,floor:'tileDark', rugs:[{x:2380,y:1775,w:250,h:110,c:'#30293b'}]}
];
const ambientLights = [
  {x:1125,y:208,r:78,a:.14},
  {x:2140,y:240,r:72,a:.13},
  {x:420,y:860,r:68,a:.12},
  {x:980,y:1215,r:82,a:.14},
  {x:2140,y:1240,r:74,a:.13},
  {x:2670,y:1220,r:84,a:.13},
  {x:760,y:1790,r:82,a:.12},
  {x:1650,y:1810,r:86,a:.13},
  {x:2570,y:1810,r:90,a:.12}
];
function randomZone(){ return patrolZones[(Math.random()*patrolZones.length)|0]; }
function randomPointInZone(z, pad=44){
  return { x: rand(z.x+pad, z.x+z.w-pad), y: rand(z.y+pad, z.y+z.h-pad) };
}
function isSpawnClear(x,y,r=24){
  if(x < 95 || y < 95 || x > map.w-95 || y > map.h-95) return false;
  if(blockedCircle(x,y,r)) return false;
  if(pointInWall(x,y)) return false;
  if(dist(x,y,player.x,player.y) < 300) return false;
  for(const o of map.decor){
    if(['pipe','doorLight','plant','labelMission','labelLoadout'].includes(o.t)) continue;
    const nx = clamp(x,o.x,o.x+o.w), ny = clamp(y,o.y,o.y+o.h);
    if(Math.hypot(x-nx,y-ny) < r+34) return false;
  }
  return true;
}
function randomClearPointInZone(z, pad=70, tries=40){
  let best = randomPointInZone(z,pad);
  for(let i=0;i<tries;i++){
    const p = randomPointInZone(z,pad);
    if(isSpawnClear(p.x,p.y,26)) return p;
    best = p;
  }
  return best;
}
function wall(x,y,w,h){ map.walls.push({x,y,w,h}); }
function decor(x,y,w,h,t='pipe'){ map.decor.push({x,y,w,h,t}); }
function door(x,y,w,h){ map.doors.push({x,y,w,h,open:0,timer:0,snd:0}); }
function alarmButton(x,y,ang=0){
  alarmButtons.push({id:'ab_'+alarmButtons.length,x,y,ang,r:7,cooldown:0,flash:0,used:false});
}
function alarmBeacon(x,y){
  alarmBeacons.push({x,y,flash:0});
}
function nearestAlarmButton(x,y){
  let best=null, bd=1e9;
  for(const b of alarmButtons){
    if(b.cooldown > 0) continue;
    const d=dist(x,y,b.x,b.y);
    if(d<bd){ bd=d; best=b; }
  }
  return best;
}
function createEnemyAt(x,y,zone=null,kind=null){
  const roll = Math.random();
  kind = kind || (roll < .16 ? 'mirror' : roll < .40 ? 'rifle' : roll < .66 ? 'scout' : 'heavy');
  let spriteIndex = kind === 'mirror' ? 3 : kind === 'scout' ? 1 : kind === 'heavy' ? 2 : 0;
  const visualRoll = Math.random();
  if(kind !== 'mirror'){
    if(visualRoll < .16) spriteIndex = 4;
    else if(visualRoll < .32) spriteIndex = 5;
  }
  const modes = ['patrol','guard','idle','wander'];
  const aiMode = modes[(Math.random()*modes.length)|0];
  const baseHp = kind === 'heavy' ? 90 : kind === 'scout' ? 45 : kind === 'mirror' ? 62 : (spriteIndex===4 ? 54 : spriteIndex===5 ? 76 : 58);
  zone = zone || randomZone();
  enemies.push({
    x,y,r:20,
    hp:baseHp + wave*4, maxHp:baseHp + wave*4,
    ang:rand(-Math.PI,Math.PI), spd:(kind==='heavy'?65:kind==='scout'?112:kind==='mirror'?92:86)+wave*2,
    shootCd:rand(.6,1.8), state:'patrol',
    patrolAng:rand(-Math.PI,Math.PI), turn:rand(.8,2.4), ammo:8, reload:0,
    type: kind === 'heavy' ? 'armored' : 'grunt',
    kind, spriteIndex, aiMode, zone,
    homeX:x, homeY:y, roamX:x, roamY:y,
    guardAng:rand(-Math.PI,Math.PI), wait:rand(.4,2.2),
    spotted:false, spottedTimer:0, muzzleFx:0, alert:0,
    lastSeenX:x, lastSeenY:y, investigateX:x, investigateY:y,
    strafeDir:Math.random()<.5?-1:1, flashPhase:rand(0,Math.PI*2),
    buttonTarget:null, buttonTried:false, searchMapTimer:0,
    bloodColor: ((spriteIndex===0 && kind!=='mirror') || kind==='mirror') ? 'yellow' : 'red',
    blood:[], corpseAnim:0, corpseAnimMax:.24, corpseDX:0, corpseDY:0, corpseRot:0,
    bleedTime:0, bleedNext:0
  });
}
function spawnReinforcementsNear(x,y,count=6){
  if(alarmReinforcementsDone) return 0;
  alarmReinforcementsDone = true;
  const placed = [];
  let made = 0;
  for(let i=0;i<count;i++){
    let best=null, bestZone=null, bestScore=-1;
    for(let t=0;t<55;t++){
      const z = randomZone();
      const p = randomClearPointInZone(z,80,35);
      let near = 99999;
      for(const q of placed) near = Math.min(near, dist(p.x,p.y,q.x,q.y));
      const fromPlayer = dist(p.x,p.y,player.x,player.y);
      const score = Math.min(near, fromPlayer*.55) + rand(0,80);
      if(score > bestScore && fromPlayer > 420){
        bestScore = score; best = p; bestZone = z;
      }
    }
    if(!best){ const z=randomZone(); best=randomClearPointInZone(z,80,35); bestZone=z; }
    placed.push({x:best.x,y:best.y});
    createEnemyAt(best.x, best.y, bestZone);
    const e = enemies[enemies.length-1];
    e.alert = 3.8;
    e.state = 'investigate';
    e.searchMapTimer = 0;
    const rz = randomZone();
    const rp = randomClearPointInZone(rz,80,35);
    e.zone = rz;
    e.investigateX = rp.x;
    e.investigateY = rp.y;
    made++;
  }
  message = 'ALARM';
  messageTimer = 1.8;
  return made;
}
function activateAlarmButton(b, byPlayer=false){
  if(!b || b.cooldown>0) return false;
  b.cooldown = 18;
  b.flash = 4.5;
  b.used = true;
  for(const l of alarmBeacons) l.flash = 9.0;
  triggerSecurityAlarm(b.x,b.y,byPlayer?'player_button':'enemy_button');
  spawnReinforcementsNear(b.x,b.y,6);
  return true;
}
function updateAlarmButtons(dt){
  for(const l of alarmBeacons) l.flash = Math.max(0,l.flash-dt);
  for(const b of alarmButtons){
    b.cooldown = Math.max(0,b.cooldown-dt);
    b.flash = Math.max(0,b.flash-dt);
    if(dist(player.x,player.y,b.x,b.y)<30){
      player.pickupText = 'E: ALARM';
      if(keys.e && !missionELock){
        missionELock = true;
        activateAlarmButton(b,true);
      }
    }
  }
  if(!keys.e) missionELock=false;
}

function makeTexture(size, base, speck, line){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0,0,size,size);
  for(let i=0;i<size*size/8;i++){
    const v = Math.random()<.58 ? speck : (Math.random()<.5 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.025)');
    g.fillStyle = v;
    g.fillRect(Math.random()*size, Math.random()*size, 1+Math.random()*2.5, 1+Math.random()*2.5);
  }
  for(let i=0;i<18;i++){
    g.strokeStyle = Math.random()<.5 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.035)';
    g.lineWidth = Math.random()<.65 ? 1 : 2;
    const x=Math.random()*size, y=Math.random()*size;
    g.beginPath();
    g.moveTo(x,y);
    g.lineTo(x+rand(-28,28),y+rand(-28,28));
    g.stroke();
  }
  if(line){
    g.strokeStyle = line;
    g.lineWidth = 1;
    for(let i=-size;i<size*2;i+=16){ g.beginPath(); g.moveTo(i,0); g.lineTo(i+size,size); g.stroke(); }
  }
  return ctx.createPattern(c,'repeat');
}
function makeTextures(){
  if(textures.floor) return;
  textures.floor = makeTexture(96,'#434343','rgba(255,255,255,.035)','rgba(0,0,0,.12)');
  textures.floor2 = makeTexture(96,'#575757','rgba(255,255,255,.028)','rgba(0,0,0,.11)');
  textures.floor3 = makeTexture(96,'#4f463e','rgba(255,230,200,.02)','rgba(0,0,0,.09)');
  textures.tile = makeTexture(64,'#5c5d60','rgba(255,255,255,.03)','rgba(0,0,0,.18)');
  textures.tileDark = makeTexture(64,'#444549','rgba(255,255,255,.02)','rgba(0,0,0,.18)');
  textures.vinyl = makeTexture(80,'#403a35','rgba(255,255,255,.02)','rgba(0,0,0,.12)');
  textures.wall = makeTexture(72,'#626262','rgba(255,255,255,.05)','rgba(0,0,0,.18)');
  textures.wallDark = makeTexture(72,'#3e3e3e','rgba(255,255,255,.035)','rgba(0,0,0,.22)');
  textures.metal = makeTexture(48,'#2d2d2d','rgba(255,255,255,.055)','rgba(0,0,0,.25)');
  textures.darkMetal = makeTexture(48,'#151515','rgba(255,255,255,.04)','rgba(0,0,0,.30)');
  textures.wood = makeTexture(96,'#5b3921','rgba(255,205,135,.08)','rgba(0,0,0,.18)');
  textures.fabric = makeTexture(80,'#242424','rgba(255,255,255,.035)','rgba(0,0,0,.16)');
  textures.plastic = makeTexture(64,'#3a3a3a','rgba(255,255,255,.045)','rgba(0,0,0,.12)');
  textures.rug = makeTexture(54,'#3a2320','rgba(255,255,255,.03)','rgba(0,0,0,.06)');
}
function resetFog(){
  fog.cols = Math.ceil(map.w / fog.cell);
  fog.rows = Math.ceil(map.h / fog.cell);
  fog.seen = new Uint8Array(fog.cols * fog.rows);
  revealFog(player.x, player.y, 260);
}
function fogIndex(cx,cy){ return cy*fog.cols + cx; }
function revealFog(x,y,r=230){
  if(!fog.seen.length) return;
  const minX = clamp(Math.floor((x-r)/fog.cell),0,fog.cols-1);
  const maxX = clamp(Math.floor((x+r)/fog.cell),0,fog.cols-1);
  const minY = clamp(Math.floor((y-r)/fog.cell),0,fog.rows-1);
  const maxY = clamp(Math.floor((y+r)/fog.cell),0,fog.rows-1);
  for(let cy=minY; cy<=maxY; cy++){
    for(let cx=minX; cx<=maxX; cx++){
      const wx = cx*fog.cell + fog.cell/2;
      const wy = cy*fog.cell + fog.cell/2;
      if(Math.hypot(wx-x,wy-y) <= r) fog.seen[fogIndex(cx,cy)] = 1;
    }
  }
}
function fogSeenAt(x,y){
  if(!fog.seen.length) return false;
  const cx = clamp(Math.floor(x/fog.cell),0,fog.cols-1);
  const cy = clamp(Math.floor(y/fog.cell),0,fog.rows-1);
  return !!fog.seen[fogIndex(cx,cy)];
}
function revealSharedFog(){
  if(gameMode !== 'mission') return;
  revealFog(player.x, player.y, 300);
  if(online.active){
    for(const p of Object.values(online.remotePlayers)){
      if(p && p.gameMode === 'mission' && Date.now() - (p.lastSeen||0) < 6500){
        revealFog(p.x, p.y, 300);
      }
    }
  }
}
function drawExplorationFog(){
  if(gameMode !== 'mission' || !fog.seen.length) return;
  ctx.save();
  ctx.fillStyle = '#000';
  const c = fog.cell;
  const startX = clamp(Math.floor(camera.x/c)-1,0,fog.cols-1);
  const endX = clamp(Math.ceil((camera.x+W)/c)+1,0,fog.cols-1);
  const startY = clamp(Math.floor(camera.y/c)-1,0,fog.rows-1);
  const endY = clamp(Math.ceil((camera.y+H)/c)+1,0,fog.rows-1);
  for(let y=startY;y<=endY;y++){
    for(let x=startX;x<=endX;x++){
      if(!fog.seen[fogIndex(x,y)]){
        ctx.fillRect(x*c-camera.x, y*c-camera.y, c+1, c+1);
      }
    }
  }
  ctx.restore();
}

function buildMap(){
  map.w = 3100; map.h = 2100;
  map.walls.length = 0; map.decor.length = 0; map.doors.length = 0; alarmButtons.length = 0; alarmBeacons.length = 0; alarmReinforcementsDone = false;
  wall(-20,-20,map.w+40,20); wall(-20,map.h,map.w+40,20); wall(-20,0,20,map.h); wall(map.w,0,20,map.h);
  wall(0,0,3100,70); wall(0,2030,3100,70); wall(0,0,70,2100); wall(3030,0,70,2100);

  // méně zdí než původně, víc průchodů a širší mise
  wall(70,70,780,55); wall(1030,70,1300,55); wall(2460,70,570,55);
  wall(70,125,55,520); wall(70,930,55,600);
  wall(125,720,420,55); wall(900,720,430,55); wall(1710,720,420,55); wall(2470,720,420,55);
  wall(790,125,55,285);
  wall(1450,125,55,250);
  wall(1970,125,55,520);
  wall(300,1020,720,55); wall(1510,1020,560,55); wall(2380,1020,420,55);
  wall(520,1075,55,350); wall(1220,1125,55,330); wall(1830,1075,55,350); wall(2520,1075,55,420);
  wall(920,380,220,55); wall(1640,375,260,55);
  wall(520,310,55,180); wall(300,530,210,55);
  wall(2120,950,210,55);
  wall(650,1660,420,55); wall(1450,1660,500,55); wall(2250,1660,520,55);
  wall(1070,1510,55,390); wall(2050,1510,55,390);

  const doorCandidates = [
    [545,720,355,55], [1330,720,380,55], [2130,720,340,55], [1020,1020,490,55], [2070,1020,310,55], [70,650,55,280], [790,410,55,310], [1450,375,55,345]
  ];
  for(const d of doorCandidates){ if(Math.random() < .82) door(d[0],d[1],d[2],d[3]); }

  // tlačítka jsou na zdi u vchodů, ne uprostřed podlahy
  alarmButton(125,650,0);
  alarmButton(2380,1020,Math.PI/2);

  alarmBeacon(240,110);
  alarmBeacon(1110,110);
  alarmBeacon(1860,110);
  alarmBeacon(2860,120);
  alarmBeacon(230,990);
  alarmBeacon(1320,1000);
  alarmBeacon(2280,1000);
  alarmBeacon(2860,1020);
  alarmBeacon(470,1640);
  alarmBeacon(1510,1640);
  alarmBeacon(2460,1640);

  for(let x=230;x<770;x+=95) decor(x,185,55,8,'pipe');
  for(let x=890;x<1370;x+=95) decor(x,185,55,8,'pipe');
  for(let y=230;y<610;y+=90) decor(1472,y,8,55,'pipe');
  for(let x=1610;x<1930;x+=95) decor(x,668,55,8,'pipe');
  decor(155,170,58,120,'panel'); decor(870,160,86,55,'crate'); decor(1300,900,80,80,'crate'); decor(1910,1120,75,75,'crate');
  decor(2200,1350,90,55,'crate'); decor(710,1290,80,55,'crate'); decor(170,650,40,64,'doorLight');

  // víc nábytku / dekoru
  const furniture = [
    [225,260,110,58,'table'], [350,250,24,24,'chair'], [430,250,24,24,'chair'], [290,330,90,42,'cabinet'],
    [1000,265,130,54,'table'], [1170,260,24,24,'chair'], [860,260,24,24,'chair'], [1260,230,120,38,'shelf'],
    [1530,200,120,44,'cabinet'], [1715,205,70,36,'crate'], [1800,205,85,40,'shelf'], [2080,220,120,54,'table'],
    [2040,315,30,30,'chair'], [2190,315,30,30,'chair'], [320,835,140,62,'sofa'], [510,835,40,40,'plant'],
    [930,845,120,48,'table'], [1090,835,28,28,'chair'], [880,835,28,28,'chair'], [1535,845,105,44,'cabinet'],
    [1710,835,95,38,'shelf'], [2050,830,135,52,'table'], [2200,820,30,30,'chair'], [194,1165,95,42,'cabinet'],
    [340,1160,130,55,'table'], [332,1250,28,28,'chair'], [457,1250,28,28,'chair'], [630,1160,120,40,'shelf'],
    [825,1210,150,60,'sofa'], [1060,1210,40,40,'plant'], [1320,1170,120,48,'table'], [1460,1160,28,28,'chair'],
    [1265,1160,28,28,'chair'], [1560,1260,105,44,'cabinet'], [1910,1180,120,48,'table'], [2060,1170,28,28,'chair'],
    [1870,1270,28,28,'chair'], [2200,1180,95,42,'cabinet'], [2420,1280,130,58,'table'], [2450,1380,32,32,'chair'],
    [2400,1460,110,44,'shelf'], [2460,220,110,44,'cabinet'], [2440,340,120,62,'sofa'], [2500,445,36,36,'plant'],
    [2660,260,150,58,'table'], [2850,300,34,34,'chair'], [2740,520,120,44,'cabinet'],
    [2480,1180,145,56,'table'], [2740,1190,110,42,'shelf'], [2900,1300,40,40,'plant'],
    [280,1740,140,54,'table'], [500,1840,95,42,'cabinet'], [850,1750,120,44,'shelf'],
    [1300,1740,145,56,'table'], [1750,1820,115,46,'cabinet'], [2250,1745,145,58,'table'], [2800,1830,120,46,'shelf']
  ];
  for(const f of furniture) decor(f[0],f[1],f[2],f[3],f[4]);

  // random bedny / nábytek po mapě, s kolizí
  const randomTypes = ['crate','crate','cabinet','table','chair','shelf'];
  let tries = 0, placed = 0;
  while(placed < 24 && tries < 520){
    tries++;
    const z = randomZone();
    const t = randomTypes[(Math.random()*randomTypes.length)|0];
    const ww = t==='chair' ? rand(24,34) : t==='table' ? rand(78,130) : t==='shelf' ? rand(80,125) : rand(48,90);
    const hh = t==='chair' ? rand(24,34) : t==='table' ? rand(42,68) : t==='shelf' ? rand(34,48) : rand(42,90);
    const x = rand(z.x+45, z.x+z.w-ww-45);
    const y = rand(z.y+45, z.y+z.h-hh-45);
    const r = {x,y,w:ww,h:hh};
    let bad = false;
    for(const w of map.walls){ if(!(r.x+r.w < w.x || r.x > w.x+w.w || r.y+r.h < w.y || r.y > w.y+w.h)){ bad=true; break; } }
    if(!bad) for(const d of map.doors){ if(!(r.x+r.w < d.x-20 || r.x > d.x+d.w+20 || r.y+r.h < d.y-20 || r.y > d.y+d.h+20)){ bad=true; break; } }
    if(!bad) for(const o of map.decor){ if(!(r.x+r.w < o.x-16 || r.x > o.x+o.w+16 || r.y+r.h < o.y-16 || r.y > o.y+o.h+16)){ bad=true; break; } }
    if(bad) continue;
    decor(x,y,ww,hh,t);
    placed++;
  }
}


function buildLobbyMap(){
  map.w = 1280; map.h = 820;
  map.walls.length = 0; map.decor.length = 0; map.doors.length = 0;

  // čistá lobby místnost
  wall(-20,-20,map.w+40,20); wall(-20,map.h,map.w+40,20); wall(-20,0,20,map.h); wall(map.w,0,20,map.h);
  wall(0,0,map.w,70); wall(0,map.h-70,map.w,70); wall(0,0,70,map.h); wall(map.w-70,0,70,map.h);

  // lehké vnitřní hrany bez bludiště
  wall(70,70,1140,28); wall(70,722,1140,28);
  wall(70,70,28,680); wall(1182,70,28,680);

  // obchodník za pultem
  decor(335,305,270,82,'table');
  decor(355,388,230,38,'shelf');
  decor(320,255,70,44,'crate');
  decor(570,255,70,44,'crate');

  // stůl s PC, židle, kytka
  decor(790,305,235,86,'table');
  decor(870,260,70,42,'panel');
  decor(850,405,36,36,'chair');
  decor(1045,330,45,45,'plant');
  decor(835,220,130,34,'labelMission');
  decor(142,555,160,34,'labelLoadout');

  // čistý nábytek
  decor(180,150,130,42,'sofa');
  decor(960,150,145,38,'shelf');
  decor(170,600,110,44,'cabinet');
  decor(1030,610,90,54,'crate');

  lobbyData.shop = {x:335,y:305,w:270,h:82};
  lobbyData.shopkeeper = {x:470,y:252,ang:Math.PI/2};
  lobbyData.missionDesk = {x:790,y:305,w:235,h:86};
  lobbyData.pc = {x:870,y:260,w:70,h:42};
  lobbyData.loadout = {x:170,y:600,w:110,h:44};
  lobbyData.statsBoard = {x:140,y:132,w:180,h:56};
  lobbyData.teammate = {x:260,y:520,ang:0,walk:0,moving:false,name:'PLAYER 2',tx:260,ty:520};
}
function enterLobby(){
  gameMode = 'lobby';
  lobbyUi = null;
  buildLobbyMap();
  initLobbyTargets();
  enemies = []; turrets = []; cameras = []; bullets = []; grenades = []; explosions = []; craters = []; particles = []; pickups = []; shells = []; bulletMarks = []; bloodDecals = [];
  securityAlarm = {x:0,y:0,timer:0,source:''};
  recalcEquipmentStats();
  player.x=210; player.y=540; player.ang=0; player.hp=player.maxHp;
  applyLoadout(player.weaponType, false, true);
  refillInventoryAmmo();
  player.dead=false; player.reload=0; player.shootCd=0; player.muzzleFx=0; player.moving=false;
  player.recoilVX=0; player.recoilVY=0; player.shadowTime=0; player.hiddenInShadow=false;
  resetFog();
  revealFog(player.x, player.y, 900);
  state='play';
  message='LOBBY';
  messageTimer=1.2;
  camera.x = clamp(player.x - W/2, 0, Math.max(0,map.w-W));
  camera.y = clamp(player.y - H/2, 0, Math.max(0,map.h-H));
}
function startMissionFromLobby(){
  if(online.active){
    if(startOnlineMission()) return;
  }
  lobbyUi = null;
  gameMode = 'mission';
  resetGame();
  state='play';
}
function nearRect(cx,cy,r,rect){
  return cx > rect.x-r && cx < rect.x+rect.w+r && cy > rect.y-r && cy < rect.y+rect.h+r;
}
function updateLobby(dt){
  const simDt = dt;
  leaderboardTimer = Math.max(0, leaderboardTimer - dt);
  refreshLeaderboard(false);
  if(updateStory(dt)){
    updateLobbyTargets(dt);
    if(messageTimer>0) messageTimer -= dt;
    return;
  }
  player.ang = angleTo(player.x,player.y,mouse.worldX,mouse.worldY);
  let mx=0,my=0;
  if(keys.w || keys.arrowup) my -= 1;
  if(keys.s || keys.arrowdown) my += 1;
  if(keys.a || keys.arrowleft) mx -= 1;
  if(keys.d || keys.arrowright) mx += 1;
  const magReal = Math.hypot(mx,my);
  const mag = magReal || 1;
  const sprinting = (keys.shift || keys['shift']) && magReal > .05;
  const speed = player.spd * (sprinting ? 1.45 : 1);
  player.moving = magReal > 0.05;
  if(player.moving) player.walk += dt * (sprinting ? 18 : 12);
  moveCircle(player, mx/mag*speed, my/mag*speed, simDt);
  updatePlayerRecoil(dt);
  updateShadowStealth(dt, player.moving);
  revealFog(player.x,player.y,900);
  updatePlayerWeapon(dt, simDt);
  updateLooseFx(dt, simDt);
  updateLobbyTargets(dt);
  if(chatBubble.timer>0) chatBubble.timer -= dt;
  if(merchantBubble.timer>0) merchantBubble.timer -= dt;
  merchantBubble.next -= dt;
  if(merchantBubble.next <= 0 && !lobbyUi){
    if(!merchantQuestion.active && Math.random()<.38){
      const qs = [
        'Kadet, chceš testnout odstřelovačku? Přijď blíž a zmáčkni E.',
        'Mám tu AWP. Recoil je sprostý. Bereš? E.',
        'Dokážeš unést pořádnou ránu? E a dostaneš sniper.'
      ];
      merchantQuestion.active = true;
      merchantQuestion.text = qs[(Math.random()*qs.length)|0];
      merchantQuestion.timer = 12;
      merchantBubble.text = merchantQuestion.text;
      merchantBubble.timer = 5.8;
      merchantBubble.next = rand(10,16);
    } else {
      const lines = [
        'Kdo střílí do skříňky, platí novou.',
        'Mám tu zbraně, co prošly aspoň jednou STK.',
        'Kadet, nečum na mě a běž trénovat.',
        'Jestli tě trefí kamera, nedělej že to byla dekorace.',
        'Figurína si nestěžuje. Zatím.',
        'Dveře jsou pomalé, ale aspoň jsou dramatické.'
      ];
      merchantBubble.text = lines[(Math.random()*lines.length)|0];
      merchantBubble.timer = 3.4;
      merchantBubble.next = rand(7,14);
    }
  }
  if(merchantQuestion.active){
    merchantQuestion.timer -= dt;
    if(merchantQuestion.timer <= 0) merchantQuestion.active = false;
  }

  const nearShop = dist(player.x,player.y,lobbyData.shopkeeper.x,lobbyData.shopkeeper.y) < 95;
  const nearMission = nearRect(player.x,player.y,42,lobbyData.missionDesk);
  const nearLoadout = nearRect(player.x,player.y,42,lobbyData.loadout);
  if(!keys.e) lobbyELock = false;
  if(keys.e && !lobbyELock){
    lobbyELock = true;
    if(nearShop && merchantQuestion.active){
      applyLoadout('sniper', true, true, true);
      merchantQuestion.active = false;
      merchantBubble.text = 'Tak jo. Máš odstřelovačku. Až vystřelíš, kopne tě to jak vrata.';
      merchantBubble.timer = 5.2;
      message = 'AWP ZÍSKÁNA';
      messageTimer = 1.8;
    } else if(nearShop) lobbyUi = lobbyUi === 'shop' ? null : 'shop';
    else if(nearMission) lobbyUi = lobbyUi === 'missions' ? null : 'missions';
    else if(nearLoadout) lobbyUi = lobbyUi === 'loadout' ? null : 'loadout';
  }

  camera.x = clamp(player.x - W/2, 0, Math.max(0,map.w-W));
  camera.y = clamp(player.y - H/2, 0, Math.max(0,map.h-H));
  if(messageTimer>0) messageTimer -= dt;
}
function drawSpriteAt(x,y,ang,walk,moving,name,filter='brightness(.75) contrast(1.1)',hp=null,maxHp=60,spriteImg=null,spriteReady=false){
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(ang - Math.PI/2);
  const bob = moving ? Math.sin(walk)*2.2 : 0;
  const img = spriteImg || playerSprite;
  const ready = spriteImg ? spriteReady : playerSpriteReady;
  if(ready){
    ctx.filter = filter;
    ctx.drawImage(img,-70,-70+bob,140,140);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle='#d9d9d9'; ctx.strokeStyle='#000'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(0,-6+bob,26,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,26+bob,26,32,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.font='13px Impact'; ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=3;
  ctx.strokeText(name,x,y-55); ctx.fillText(name,x,y-55);
  if(Number.isFinite(hp)){
    const bw=58,bh=7,bx=x-bw/2,by=y-47;
    ctx.fillStyle='#111'; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#d20b1c'; ctx.fillRect(bx,by,bw*clamp(hp/Math.max(1,maxHp||60),0,1),bh);
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
  }
  ctx.restore();
}
function drawShopkeeper(){
  const s = lobbyData.shopkeeper;
  ctx.save();
  ctx.translate(s.x,s.y);
  ctx.rotate(s.ang - Math.PI/2);
  const img = enemySprites[1] || enemySprites[0];
  if(enemySpritesReady[1] && img){
    ctx.filter='brightness(.85) contrast(1.05) saturate(.7)';
    ctx.drawImage(img,-62,-62,124,124);
    ctx.filter='none';
  } else {
    ctx.fillStyle='#777'; ctx.strokeStyle='#000'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.ellipse(0,0,18,25,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.font='13px Impact'; ctx.textAlign='center'; ctx.fillStyle='#ffe9a0'; ctx.strokeStyle='#000'; ctx.lineWidth=3;
  ctx.strokeText('OBCHODNÍK',s.x,s.y-52);
  ctx.fillText('OBCHODNÍK',s.x,s.y-52);
  ctx.restore();
  if(merchantBubble.timer > 0) drawWorldBubble(s.x,s.y-62,merchantBubble.text,{maxChars:28,stroke:'#ffe07a',bg:'rgba(20,12,0,.86)',color:'#ffeeb5'});
}
function initLobbyTargets(){
  lobbyTargets.length = 0;
  lobbyTargets.push({name:'FIGURÍNA',x:lobbyData.targetA.x,y:lobbyData.targetA.y,ang:lobbyData.targetA.ang,r:20,hp:80,maxHp:80,spriteIndex:0,state:'idle',bloodColor:'yellow',blood:[],respawn:0,muzzleFx:0});
  lobbyTargets.push({name:'ČERNÝ TERČ',x:lobbyData.targetB.x,y:lobbyData.targetB.y,ang:lobbyData.targetB.ang,r:20,hp:105,maxHp:105,spriteIndex:2,state:'idle',bloodColor:'red',blood:[],respawn:0,muzzleFx:0});
}
function updateLobbyTargets(dt){
  for(const t of lobbyTargets){
    if(t.hp<=0){
      t.respawn -= dt;
      if(t.respawn <= 0){
        t.hp=t.maxHp; t.blood=[]; t.corpseAnim=0; t.corpseDX=0; t.corpseDY=0; t.corpseRot=0;
      }
    }
  }
}
function hitLobbyTarget(t,b){
  if(!t || t.hp<=0) return;
  const a=Math.atan2(b.vy,b.vx);
  const col=t.bloodColor || (t.spriteIndex===0?'yellow':'red');
  t.hp -= b.dmg;
  for(let i=0;i<5;i++) t.blood.push({x:rand(-18,18),y:rand(-18,18),r:rand(4,10),a:rand(-Math.PI,Math.PI),s:rand(.8,1.6),color:col});
  if(t.blood.length>28) t.blood.splice(0,t.blood.length-28);
  splatter(b.x,b.y,14,1.1,col);
  addBloodDecal(t.x+rand(-12,12),t.y+rand(-12,12),rand(10,20),false,a,col);
  playSound(soundPaths.hit,.23);
  if(t.hp<=0){
    t.hp=0; t.respawn=1.25; t.corpseAnim=0; t.corpseAnimMax=.22; t.corpseDX=Math.cos(a)*18; t.corpseDY=Math.sin(a)*18; t.corpseRot=rand(-.8,.8);
    addBloodDecal(t.x+rand(-18,18),t.y+rand(-18,18),rand(22,42),false,a,col);
  }
}
function drawLobbyTargets(){
  for(const t of lobbyTargets){
    if(t.hp<=0 && t.respawn < .55) continue;
    drawEnemy(t);
  }
}
function drawLobbyCharacters(){
  drawShopkeeper();
  drawLobbyTargets();
  if(online.active){
    drawOnlinePlayers();
    return;
  }
}

function drawLobbyStatsBoard(){
  if(gameMode!=='lobby') return;
  const s = lobbyData.statsBoard;
  ctx.save();
  ctx.fillStyle='rgba(5,5,5,.78)';
  ctx.strokeStyle='#8f141e';
  ctx.lineWidth=3;
  ctx.fillRect(s.x - camera.x, s.y - camera.y, s.w, s.h);
  ctx.strokeRect(s.x - camera.x, s.y - camera.y, s.w, s.h);
  ctx.font='13px Impact'; ctx.textAlign='left';
  ctx.fillStyle='#fff';
  ctx.fillText('LVL ' + player.level, s.x - camera.x + 10, s.y - camera.y + 20);
  ctx.fillText('KILLY ' + player.totalKills, s.x - camera.x + 10, s.y - camera.y + 38);
  ctx.fillText(player.level>=10 ? 'XP MAX' : ('XP ' + player.levelXp + '/' + player.nextLevelXp), s.x - camera.x + 82, s.y - camera.y + 38);
  ctx.restore();
}

function drawLobbyPrompts(){
  if(gameMode!=='lobby') return;
  ctx.save();
  const nearShop = dist(player.x,player.y,lobbyData.shopkeeper.x,lobbyData.shopkeeper.y) < 95;
  const nearMission = nearRect(player.x,player.y,42,lobbyData.missionDesk);
  const nearLoadout = nearRect(player.x,player.y,42,lobbyData.loadout);
  if(nearShop || nearMission || nearLoadout){
    const txt = nearShop ? 'E  OBCHODOVAT' : (nearMission ? 'E  VYBRAT MISI' : 'E  VYBAVENÍ');
    ctx.font='28px Impact'; ctx.textAlign='center'; ctx.strokeStyle='#000'; ctx.lineWidth=6; ctx.fillStyle='#fff';
    ctx.strokeText(txt,W/2,H-105); ctx.fillText(txt,W/2,H-105);
  }
  ctx.restore();
}
function wrapText(text, maxChars=24){
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for(const word of words){
    const test = line ? (line + ' ' + word) : word;
    if(test.length > maxChars && line){ lines.push(line); line = word; }
    else line = test;
  }
  if(line) lines.push(line);
  return lines;
}
function drawWorldBubble(x,y,text,opts={}){
  if(!text) return;
  const lines = wrapText(text, opts.maxChars || 32).slice(0,4);
  const w = Math.min(390, Math.max(120, ...lines.map(l=>l.length*9+34)));
  const h = 24 + lines.length*18;
  const bx = x - w/2, by = y - h - 18;
  ctx.save();
  ctx.fillStyle = opts.bg || 'rgba(0,0,0,.84)';
  ctx.strokeStyle = opts.stroke || '#d20b1c';
  ctx.lineWidth = 3;
  ctx.fillRect(bx,by,w,h);
  ctx.strokeRect(bx,by,w,h);
  ctx.beginPath();
  ctx.moveTo(x-10,by+h);
  ctx.lineTo(x,by+h+14);
  ctx.lineTo(x+10,by+h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = opts.font || '14px Arial Black';
  ctx.textAlign = 'center';
  ctx.fillStyle = opts.color || '#fff';
  for(let i=0;i<lines.length;i++) ctx.fillText(lines[i], x, by+20+i*18);
  ctx.restore();
}
const storySteps = [
  {focus:'player', dur:5.2, speaker:'INSTRUKTOR', text:'Vítej v Projektu SAS. Jsi nový kadet a dneska poprvé půjdeš do ostré akce.'},
  {focus:'player', dur:5.0, speaker:'INSTRUKTOR', text:'V lobby si můžeš zkusit zbraň na figurínách. Neboj, nestřílí zpátky a po zničení se obnoví.'},
  {focus:'shop', dur:5.4, speaker:'OBCHODNÍK', text:'Tady u mě měníš postavy. Některé potřebují vyšší level, tak nejdřív přežij pár misí.'},
  {focus:'loadout', dur:5.2, speaker:'OBCHODNÍK', text:'Tahle skříňka je vybavení. Vybereš zbraň a ostatní hráči ji uvidí stejně jako ty.'},
  {focus:'mission', dur:5.0, speaker:'OBCHODNÍK', text:'U počítače vybereš misi. Drž se týmu, světlo šetři a kamery ber vážně.'}
];
function storyFocusPoint(){
  const s = storySteps[story.step] || storySteps[0];
  if(s.focus === 'shop') return {x:lobbyData.shopkeeper.x,y:lobbyData.shopkeeper.y};
  if(s.focus === 'loadout') return {x:lobbyData.loadout.x+lobbyData.loadout.w/2,y:lobbyData.loadout.y+lobbyData.loadout.h/2};
  if(s.focus === 'mission') return {x:lobbyData.missionDesk.x+lobbyData.missionDesk.w/2,y:lobbyData.missionDesk.y+lobbyData.missionDesk.h/2};
  return {x:player.x,y:player.y};
}
function startFirstStory(){
  online.active = false;
  gameMode = 'lobby';
  lobbyUi = null;
  buildLobbyMap();
  initLobbyTargets();
  enemies = []; turrets = []; cameras = []; bullets = []; grenades = []; explosions = []; craters = []; particles = []; pickups = []; shells = []; bulletMarks = []; bloodDecals = [];
  player.x=210; player.y=540; player.ang=0; player.hp=player.maxHp;
  applyLoadout(player.weaponType, false, true);
  player.dead=false; player.reload=0; player.shootCd=0; player.muzzleFx=0; player.moving=false;
  resetFog();
  revealFog(player.x, player.y, 900);
  state='play';
  story.active=true; story.step=0; story.timer=0;
  const f = storyFocusPoint();
  camera.x = clamp(f.x - W/2, 0, Math.max(0,map.w-W));
  camera.y = clamp(f.y - H/2, 0, Math.max(0,map.h-H));
}
function afterNickReady(){
  online.playerName = getPlayerNick();
  saveAccountToSupabase();
  if(localStorage.getItem('projekt_sas_story_done') !== '1') startFirstStory();
  else state='menu';
}
function updateStory(dt){
  if(!story.active) return false;
  story.timer += dt;
  const f = storyFocusPoint();
  const tx = clamp(f.x - W/2, 0, Math.max(0,map.w-W));
  const ty = clamp(f.y - H/2, 0, Math.max(0,map.h-H));
  camera.x += (tx - camera.x) * clamp(dt*3.2,0,1);
  camera.y += (ty - camera.y) * clamp(dt*3.2,0,1);
  if(story.timer >= (storySteps[story.step]?.dur || 4.5)){
    story.step++;
    story.timer = 0;
    if(story.step >= storySteps.length){
      story.active = false;
      localStorage.setItem('projekt_sas_story_done','1');
      message='LOBBY';
      messageTimer=1.0;
    }
  }
  return true;
}
function drawStoryOverlay(){
  if(!story.active) return;
  const s = storySteps[story.step] || storySteps[0];
  let p = storyFocusPoint();
  drawWorldBubble(p.x, p.y-68, s.speaker + ': ' + s.text, {maxChars:42,bg:'rgba(0,0,0,.88)',stroke:'#ffe07a',color:'#fff'});
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='rgba(0,0,0,.34)';
  ctx.fillRect(0,0,W,86);
  ctx.font='24px Impact'; ctx.textAlign='center'; ctx.fillStyle='#fff';
  ctx.fillText('PROJEKT SAS — ÚVOD',W/2,38);
  ctx.font='14px Arial Black'; ctx.fillStyle='#bbb';
  ctx.fillText('Úvod se přehraje jen při prvním spuštění.',W/2,62);
  ctx.restore();
}
function openChatInput(){
  if(!chatInput || state!=='play' || gameMode!=='lobby') return;
  chatInput.value='';
  chatInput.classList.add('show');
  chatInput.focus();
}
function submitChatInput(){
  if(!chatInput) return;
  const txt = chatInput.value.trim().slice(0,70);
  chatInput.classList.remove('show');
  chatInput.blur();
  if(!txt) return;
  chatBubble.text = txt;
  chatBubble.timer = 4.5;
  if(online.active && online.roomChannel){
    try{ online.roomChannel.send({type:'broadcast',event:'chat',payload:{id:online.clientId,name:online.playerName,text:txt,t:Date.now()}}); }catch(e){}
  }
}

function getCharacterStripRects(){
  const cards = [];
  const startX = W/2 - 366;
  const startY = 218;
  const cardW = 230;
  const cardH = 300;
  const gap = 22;
  characterOrder.forEach((key,i)=>{
    cards.push({key,x:startX+i*(cardW+gap),y:startY,w:cardW,h:cardH});
  });
  return cards;
}
function drawCharacterStrip(card){
  const d = characterDefs[card.key];
  const selected = player.characterKey === d.key;
  const unlocked = player.level >= d.requiredLevel;
  ctx.save();
  ctx.fillStyle = selected ? 'rgba(105,14,20,.96)' : 'rgba(18,18,18,.96)';
  ctx.strokeStyle = selected ? '#ffe07a' : unlocked ? '#777' : '#3b3b3b';
  ctx.lineWidth = selected ? 4 : 2;
  ctx.fillRect(card.x,card.y,card.w,card.h);
  ctx.strokeRect(card.x,card.y,card.w,card.h);

  ctx.fillStyle='#050505';
  ctx.fillRect(card.x+10,card.y+10,card.w-20,154);
  if(d.ready){
    ctx.drawImage(d.img,card.x+18,card.y+8,card.w-36,160);
  } else {
    ctx.fillStyle='#333'; ctx.fillRect(card.x+18,card.y+18,card.w-36,140);
  }

  if(!unlocked){
    ctx.fillStyle='rgba(0,0,0,.58)';
    ctx.fillRect(card.x+10,card.y+10,card.w-20,154);
    ctx.font='20px Impact';
    ctx.textAlign='center';
    ctx.fillStyle='#ff4b4b';
    ctx.strokeStyle='#000';
    ctx.lineWidth=4;
    ctx.strokeText('LEVEL ' + d.requiredLevel,card.x+card.w/2,card.y+92);
    ctx.fillText('LEVEL ' + d.requiredLevel,card.x+card.w/2,card.y+92);
  }

  ctx.textAlign='left';
  ctx.fillStyle='#fff';
  ctx.font='22px Impact';
  ctx.fillText(d.name,card.x+14,card.y+192);
  ctx.font='14px Arial Black';
  ctx.fillStyle=unlocked?'#d5d5d5':'#8f8f8f';
  ctx.fillText(selected ? 'VYBRÁNO' : ('POŽADOVÁNÝ ' + d.title.toUpperCase()),card.x+14,card.y+215);

  ctx.font='12px Arial';
  ctx.fillStyle='#c8c8c8';
  const lines = wrapText(d.desc, 28);
  let yy=card.y+238;
  for(const line of lines.slice(0,2)){
    ctx.fillText(line,card.x+14,yy);
    yy += 14;
  }

  const bx=card.x+38, by=card.y+258, bw=card.w-76, bh=34;
  ctx.fillStyle = selected ? 'rgba(255,224,122,.18)' : unlocked ? 'rgba(210,11,28,.85)' : 'rgba(55,55,55,.75)';
  ctx.strokeStyle = selected ? '#ffe07a' : unlocked ? '#ff6b6b' : '#777';
  ctx.lineWidth=2;
  ctx.fillRect(bx,by,bw,bh);
  ctx.strokeRect(bx,by,bw,bh);
  ctx.font='16px Impact';
  ctx.textAlign='center';
  ctx.fillStyle=unlocked?'#fff':'#9b9b9b';
  ctx.fillText(selected?'VYBRÁNO':(unlocked?'VYBRAT':'ZAMČENO'),bx+bw/2,by+23);
  ctx.restore();
}

function getLoadoutCardRects(){
  const cards = [];
  const startX = W/2 - 392;
  const startY = 258;
  const cardW = 148;
  const cardH = 214;
  const gap = 11;
  loadoutOrder.forEach((key,i)=>{
    const col = i % 5;
    const row = (i / 5) | 0;
    cards.push({ key, x:startX + col*(cardW + gap), y:startY + row*(cardH + gap), w:cardW, h:cardH });
  });
  return cards;
}
function getEquipmentCardRects(){
  const cards=[];
  const startX=W/2-392, startY=258, cardW=148, cardH=214, gap=11;
  equipmentOrder.forEach((key,i)=>cards.push({key,x:startX+i*(cardW+gap),y:startY,w:cardW,h:cardH}));
  return cards;
}
function drawItemIcon(key,x,y,w,h){
  ctx.save(); ctx.translate(x+w/2,y+h/2);
  if(key==='grenade'){
    ctx.fillStyle='#1b2a1d'; ctx.strokeStyle='#dedede'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.ellipse(0,12,w*.22,h*.30,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.fillRect(-9,-22,18,14); ctx.strokeRect(-9,-22,18,14);
    ctx.strokeStyle='#bbb'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(13,-18,9,-1.4,1.4); ctx.stroke();
    ctx.fillStyle='#d20b1c'; ctx.fillRect(-16,-5,32,7);
  } else if(equipmentDefs[key]){
    const c1='#3a3a3a', c2='#101010'; ctx.strokeStyle='#cfcfcf'; ctx.lineWidth=2; ctx.fillStyle=c1;
    if(key==='vest'){
      ctx.beginPath(); ctx.moveTo(-28,-30); ctx.lineTo(-10,-20); ctx.lineTo(0,30); ctx.lineTo(10,-20); ctx.lineTo(28,-30); ctx.lineTo(22,32); ctx.lineTo(-22,32); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#5b0c14'; ctx.fillRect(-18,2,36,8);
    } else if(key==='helmet'){
      ctx.beginPath(); ctx.arc(0,0,30,Math.PI,Math.PI*2); ctx.lineTo(30,10); ctx.lineTo(-30,10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle=c2; ctx.fillRect(-18,8,36,8);
    } else if(key==='boots'){
      ctx.fillRect(-34,2,28,28); ctx.fillRect(6,2,28,28); ctx.fillStyle=c2; ctx.fillRect(-34,24,36,9); ctx.fillRect(6,24,36,9); ctx.strokeRect(-34,2,28,28); ctx.strokeRect(6,2,28,28);
    } else if(key==='gloves'){
      ctx.beginPath(); ctx.ellipse(-18,6,18,25,-.5,0,Math.PI*2); ctx.ellipse(18,6,18,25,.5,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle=c2; ctx.fillRect(-30,20,24,10); ctx.fillRect(6,20,24,10);
    } else if(key==='pants'){
      ctx.beginPath(); ctx.moveTo(-20,-28); ctx.lineTo(20,-28); ctx.lineTo(32,34); ctx.lineTo(8,34); ctx.lineTo(0,-4); ctx.lineTo(-8,34); ctx.lineTo(-32,34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle=c2; ctx.fillRect(-22,-22,44,8);
    }
  }
  ctx.restore();
}

function drawLoadoutCard(card, selected){
  const d = loadoutDefs[card.key];
  ctx.save();
  ctx.fillStyle = selected ? 'rgba(135,10,20,.95)' : 'rgba(18,18,18,.96)';
  ctx.strokeStyle = selected ? '#ffe07a' : '#5c5c5c';
  ctx.lineWidth = selected ? 4 : 2;
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.strokeRect(card.x, card.y, card.w, card.h);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(card.x+8, card.y+8, card.w-16, 108);
  if(d.ready && d.imgPath){
    ctx.drawImage(d.img, card.x+18, card.y+8, card.w-36, 108);
  } else {
    ctx.fillStyle='#1a1a1a'; ctx.fillRect(card.x+18, card.y+14, card.w-36, 96);
    drawItemIcon(card.key, card.x+18, card.y+14, card.w-36, 96);
  }

  ctx.textAlign='left';
  ctx.fillStyle='#fff';
  ctx.font='18px Impact';
  ctx.fillText(d.name, card.x+12, card.y+136);
  ctx.font='14px Arial Black';
  ctx.fillStyle='#d6d6d6';
  ctx.fillText(d.title, card.x+12, card.y+156);
  ctx.font='12px Arial';
  const lines = wrapText(d.desc, 24);
  let yy = card.y+175;
  for(const line of lines.slice(0,3)){
    ctx.fillText(line, card.x+12, yy);
    yy += 14;
  }
  ctx.font='11px Arial Black';
  const slotIdx = player.loadoutSlots.indexOf(card.key);
  ctx.fillStyle = selected ? '#ffe07a' : '#9f9f9f';
  ctx.fillText(selected ? ('SLOT ' + (slotIdx+1)) : 'KLIKNOUT DO SLOTU', card.x+12, card.y+206);
  ctx.restore();
}
function drawEquipmentCard(card){
  const d=equipmentDefs[card.key];
  const selected=!!player.equippedGear[card.key];
  ctx.save();
  ctx.fillStyle=selected?'rgba(115,75,15,.96)':'rgba(18,18,18,.96)';
  ctx.strokeStyle=selected?'#ffe07a':'#5c5c5c'; ctx.lineWidth=selected?4:2;
  ctx.fillRect(card.x,card.y,card.w,card.h); ctx.strokeRect(card.x,card.y,card.w,card.h);
  ctx.fillStyle='#0a0a0a'; ctx.fillRect(card.x+8,card.y+8,card.w-16,108);
  drawItemIcon(card.key,card.x+18,card.y+14,card.w-36,96);
  ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.font='18px Impact'; ctx.fillText(d.name,card.x+12,card.y+136);
  ctx.font='13px Arial Black'; ctx.fillStyle='#d6d6d6'; ctx.fillText(d.slot,card.x+12,card.y+156);
  ctx.font='12px Arial'; ctx.fillText(d.desc,card.x+12,card.y+176);
  ctx.font='11px Arial Black'; ctx.fillStyle=selected?'#ffe07a':'#9f9f9f'; ctx.fillText(selected?'NASAZENO':'KLIKNOUT NASADIT',card.x+12,card.y+206);
  ctx.restore();
}

function drawLobbyWindows(){
  if(gameMode!=='lobby' || !lobbyUi) return;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.72)';
  ctx.fillRect(0,0,W,H);
  let ww = 560, wh = 360, wx = W/2-280, wy = 150;
  if(lobbyUi==='loadout' || lobbyUi==='shop'){ ww = 820; wh = 430; wx = W/2-410; wy = 110; }
  ctx.fillStyle='rgba(8,8,8,.96)';
  ctx.strokeStyle='#d20b1c';
  ctx.lineWidth=4;
  ctx.fillRect(wx,wy,ww,wh);
  ctx.strokeRect(wx,wy,ww,wh);
  ctx.font='42px Impact'; ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=5;
  if(lobbyUi==='shop'){
    ctx.strokeText('OBCHOD - POSTAVY',W/2,170); ctx.fillText('OBCHOD - POSTAVY',W/2,170);
    const chars = getCharacterStripRects();
    chars.forEach(card => drawCharacterStrip(card));
  } else if(lobbyUi==='missions'){
    ctx.strokeText('VÝBĚR MISE',W/2,215); ctx.fillText('VÝBĚR MISE',W/2,215);
    const canStart = !online.active || online.isHost;
    const pct = (player.missionProgress && player.missionProgress[missionId]) ? player.missionProgress[missionId] : 0;
    drawButton(W/2-205,280,410,64,canStart ? (missionName + '  ' + pct + '%') : 'ČEKÁM NA HOSTA',canStart);
  } else if(lobbyUi==='loadout'){
    ctx.strokeText('VYBAVENÍ',W/2,170); ctx.fillText('VYBAVENÍ',W/2,170);
    drawButton(W/2-205,190,190,42,'ZBRANĚ',loadoutCategory==='weapons');
    drawButton(W/2+15,190,190,42,'VYBAVENÍ',loadoutCategory==='gear');
    if(loadoutCategory==='weapons'){
      const cards = getLoadoutCardRects();
      cards.forEach(card => drawLoadoutCard(card, player.loadoutSlots.includes(card.key)));
    } else {
      const cards = getEquipmentCardRects();
      cards.forEach(card => drawEquipmentCard(card));
    }
  }
  ctx.font='18px Impact'; ctx.fillStyle='#d8d8d8';
  if(lobbyUi==='loadout' || lobbyUi==='shop'){
    drawButton(W/2-90,545,180,48,'ZAVŘÍT',true);
  } else {
    drawButton(W/2-90,430,180,48,'ZAVŘÍT',true);
  }
  ctx.restore();
}
const player = {
  x:180,y:590,r:20,ang:0,spd:235,hp:60,maxHp:60,
  ammo:30,clip:30,reserve:90,reload:0,shootCd:0,bt:100,maxBt:100,
  score:0,kills:0,totalKills:0,totalXp:0,level:1,levelXp:0,nextLevelXp:20,missionProgress:{cerny_sklad:0},
  dead:false,pickupText:'',muzzleFx:0,walk:0,moving:false,weaponType:'m4',characterKey:'zlaty',reloadMax:0,
  loadoutSlots:['m4',null],selectedSlot:0,weaponState:{},slotTroll:[false,false],trollSniper:false,
  equippedGear:{},gearHpBonus:0,armorProtection:0,
  recoilVX:0,recoilVY:0,shadowTime:0,hiddenInShadow:false,
  bleedTime:0,bleedNext:0,blood:[]
};
const SAVE_KEY = 'bullet_echo_noir_save_v1';

function saveProgress(){
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      totalKills: player.totalKills|0,
      totalXp: player.totalXp|0,
      weaponType: player.weaponType || 'm4',
      loadoutSlots: player.loadoutSlots || ['m4',null],
      selectedSlot: player.selectedSlot|0,
      weaponState: player.weaponState || {},
      slotTroll: player.slotTroll || [false,false],
      equippedGear: player.equippedGear || {},
      characterKey: player.characterKey || 'zlaty',
      missionProgress: player.missionProgress || {cerny_sklad:0},
      nick: getPlayerNick()
    }));
  }catch(e){}
}
function loadProgress(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    if(Number.isFinite(data.totalKills)) player.totalKills = Math.max(0, data.totalKills|0);
    if(Number.isFinite(data.totalXp)) player.totalXp = Math.max(0, data.totalXp|0);
    if(Array.isArray(data.loadoutSlots)) player.loadoutSlots = [data.loadoutSlots[0] || 'm4', data.loadoutSlots[1] || null].map(x=>weaponDefs[x]?x:null);
    if(Number.isFinite(data.selectedSlot)) player.selectedSlot = clamp(data.selectedSlot|0,0,1);
    if(data.weaponState && typeof data.weaponState === 'object') player.weaponState = data.weaponState;
    if(Array.isArray(data.slotTroll)) player.slotTroll = [!!data.slotTroll[0], !!data.slotTroll[1]];
    if(data.equippedGear && typeof data.equippedGear === 'object') player.equippedGear = {...data.equippedGear};
    if(data.weaponType && weaponDefs[data.weaponType]) player.weaponType = data.weaponType;
    if(!player.loadoutSlots[player.selectedSlot]) player.loadoutSlots[player.selectedSlot] = player.weaponType || 'm4';
    if(player.loadoutSlots[player.selectedSlot] && weaponDefs[player.loadoutSlots[player.selectedSlot]]) player.weaponType = player.loadoutSlots[player.selectedSlot];
    player.trollSniper = !!player.slotTroll[player.selectedSlot];
    if(data.characterKey && characterDefs[data.characterKey]) player.characterKey = data.characterKey;
    if(data.missionProgress && typeof data.missionProgress === 'object') player.missionProgress = {...player.missionProgress, ...data.missionProgress};
    if(data.nick && !localStorage.getItem('echo_noir_player_nick')) localStorage.setItem('echo_noir_player_nick', data.nick);
  }catch(e){}
}
function getCurrentPlayerSpritePath(){
  if(player.characterKey === 'zlaty'){
    const l = loadoutDefs[player.weaponType] || loadoutDefs.m4;
    return l.imgPath || 'loadout_m4.png';
  }
  const char = characterDefs[player.characterKey] || characterDefs.zlaty;
  return char.imgPath || 'char_zlaty_rachot.png';
}
function updatePlayerSprite(){
  const spriteSrc = getCurrentPlayerSpritePath();
  currentPlayerSpriteSrc = spriteSrc;
  playerSpriteReady = false;
  playerSprite.src = spriteSrc;
  enemySpritesReady[3] = false;
  enemySprites[3].src = spriteSrc;
}
function getSpriteAssetFor(characterKey, weaponType){
  if(characterKey === 'zlaty'){
    const l = loadoutDefs[weaponType] || loadoutDefs.m4;
    return {img:l.img, ready:l.ready};
  }
  const ch = characterDefs[characterKey] || characterDefs.zlaty;
  return {img:ch.img, ready:ch.ready};
}
function randomizeBaseSpawnWeapon(){
  if(player.characterKey !== 'zlaty') return;
  const key = loadoutOrder[(Math.random()*loadoutOrder.length)|0] || 'm4';
  applyLoadout(key, false, true);
}
function applyCharacter(key, save=true){
  const def = characterDefs[key] || characterDefs.zlaty;
  if(player.level < def.requiredLevel){
    message = 'POTŘEBA LEVEL ' + def.requiredLevel;
    messageTimer = 1.4;
    return false;
  }
  player.characterKey = def.key;
  updatePlayerSprite();
  if(save) saveProgress();
  return true;
}
function snapshotWeaponState(){
  if(!player.weaponType || !weaponDefs[player.weaponType]) return;
  player.weaponState[player.weaponType] = {ammo:player.ammo|0,reserve:player.reserve|0,reload:Math.max(0,player.reload||0)};
}
function restoreWeaponState(key, refill=false){
  const def = weaponDefs[key] || weaponDefs.m4;
  player.clip = def.clip;
  const st = player.weaponState[key];
  if(refill || !st){
    player.ammo = def.clip;
    player.reserve = def.reserve;
    player.reload = 0;
    player.reloadMax = 0;
    player.weaponState[key] = {ammo:player.ammo,reserve:player.reserve,reload:0};
  } else {
    player.ammo = clamp(st.ammo|0,0,def.clip);
    player.reserve = Math.max(0,st.reserve|0);
    player.reload = Math.max(0,st.reload||0);
    player.reloadMax = player.reloadMax || 0;
  }
}
function applyLoadout(key, save=true, refill=false, troll=false){
  const useKey = weaponDefs[key] ? key : 'm4';
  snapshotWeaponState();
  player.selectedSlot = clamp(player.selectedSlot|0,0,1);
  player.loadoutSlots[player.selectedSlot] = useKey;
  player.slotTroll[player.selectedSlot] = !!troll;
  player.trollSniper = !!troll;
  player.weaponType = useKey;
  restoreWeaponState(useKey, refill);
  updatePlayerSprite();
  if(save) saveProgress();
}
function switchInventorySlot(slot){
  slot = clamp(slot|0,0,1);
  const key = player.loadoutSlots[slot];
  if(!key || !weaponDefs[key]){ message='PRÁZDNÝ SLOT'; messageTimer=.8; return false; }
  snapshotWeaponState();
  player.selectedSlot = slot;
  player.weaponType = key;
  player.trollSniper = !!(player.slotTroll && player.slotTroll[slot]);
  restoreWeaponState(key, false);
  updatePlayerSprite();
  saveProgress();
  message = weaponDefs[key].name;
  messageTimer = .75;
  return true;
}
function cycleInventory(){
  const next = player.selectedSlot===0 ? 1 : 0;
  if(!switchInventorySlot(next)) switchInventorySlot(player.selectedSlot);
}
function setInventoryWeaponFromLoadout(key){
  if(!weaponDefs[key]) return;
  snapshotWeaponState();
  let idx = player.loadoutSlots.indexOf(key);
  if(idx < 0){
    const empty = player.loadoutSlots.findIndex(v=>!v);
    idx = empty >= 0 ? empty : clamp(player.selectedSlot|0,0,1);
  }
  player.selectedSlot = idx;
  player.loadoutSlots[idx] = key;
  player.slotTroll[idx] = false;
  player.trollSniper = false;
  player.weaponType = key;
  restoreWeaponState(key, true);
  updatePlayerSprite();
  saveProgress();
}
function refillInventoryAmmo(){
  for(const key of player.loadoutSlots){
    if(key && weaponDefs[key]){
      const d=weaponDefs[key];
      player.weaponState[key]={ammo:d.clip,reserve:d.reserve,reload:0};
    }
  }
  restoreWeaponState(player.weaponType||player.loadoutSlots[player.selectedSlot]||'m4', true);
}
function recalcEquipmentStats(){
  const oldMax = player.maxHp || 60;
  let hp=0, armor=0;
  for(const key of equipmentOrder){
    if(player.equippedGear && player.equippedGear[key]){ hp += equipmentDefs[key].hp||0; armor += equipmentDefs[key].armor||0; }
  }
  player.gearHpBonus = hp;
  player.armorProtection = clamp(armor,0,.28);
  player.maxHp = 60 + hp;
  if(player.hp > player.maxHp) player.hp = player.maxHp;
  else if(player.hp > 0 && player.maxHp > oldMax) player.hp = Math.min(player.maxHp, player.hp + (player.maxHp-oldMax));
}
function toggleEquipment(key){
  if(!equipmentDefs[key]) return;
  if(!player.equippedGear) player.equippedGear = {};
  player.equippedGear[key] = !player.equippedGear[key];
  recalcEquipmentStats();
  saveProgress();
  message = equipmentDefs[key].name + (player.equippedGear[key] ? ' NASAZENO' : ' SUNDÁNO');
  messageTimer = 1.1;
}

function xpNeedForLevel(level){
  if(level >= 10) return 0;
  return 10 + level * 10; // lvl 1 -> 2 = 20 XP
}
function recalcPlayerLevel(){
  let lvl = 1;
  let rest = Math.max(0, player.totalXp|0);
  while(lvl < 10){
    const need = xpNeedForLevel(lvl);
    if(rest < need) break;
    rest -= need;
    lvl++;
  }
  player.level = lvl;
  player.levelXp = rest;
  player.nextLevelXp = lvl >= 10 ? 0 : xpNeedForLevel(lvl);
}
function grantXp(amount=1){
  const prev = player.level;
  player.totalXp += amount;
  recalcPlayerLevel();
  saveProgress();
  if(player.level > prev){
    message = 'LEVEL ' + player.level;
    messageTimer = 1.8;
  }
}
loadProgress();
recalcEquipmentStats();
online.playerName = getPlayerNick() || online.playerName || ('HRÁČ ' + online.clientId.slice(-4).toUpperCase());
recalcPlayerLevel();
applyLoadout(player.weaponType, false, true);
applyCharacter(player.characterKey, false);
let enemies = [];
let turrets = [];
let cameras = [];
let bullets = [];
let grenades = [];
let explosions = [];
let craters = [];
let particles = [];
let pickups = [];
let shells = [];
let bulletMarks = [];
let bloodDecals = [];
let securityAlarm = {x:0,y:0,timer:0,source:''};
let wave = 1;
let missionComplete = false;

function resetGame(){
  gameMode = 'mission';
  lobbyUi = null;
  buildMap();
  recalcPlayerLevel();
  recalcEquipmentStats();
  player.x=180; player.y=590; player.ang=0; player.hp=player.maxHp;
  applyLoadout(player.weaponType, false, true);
  refillInventoryAmmo();
  player.shootCd=0; player.bt=100; player.score=0; player.kills=0; player.dead=false; player.muzzleFx=0; player.walk=0; player.moving=false; player.reloadMax=0;
  player.recoilVX=0; player.recoilVY=0; player.shadowTime=0; player.hiddenInShadow=false;
  player.bleedTime=0; player.bleedNext=0; player.blood=[];
  enemies = []; turrets = []; cameras = []; bullets = []; grenades = []; explosions = []; craters = []; particles = []; pickups = []; shells = []; bulletMarks = []; bloodDecals = [];
  securityAlarm = {x:0,y:0,timer:0,source:''};
  wave = 1; missionComplete=false; message='CÍL: ELIMINUJ VŠECHNY NEPŘÁTELE'; messageTimer=3.2; shake=0;
  resetFog();
  spawnWave();
  spawnSecurity();
  playMusic();
}

function spawnWave(){
  const count = 12 + wave * 4;
  const modes = ['patrol','guard','idle','wander'];
  const placed = [];
  for(let i=0;i<count;i++){
    let zone = randomZone();
    let pt = randomClearPointInZone(zone, 70);
    let best = {x:pt.x, y:pt.y};
    let bestZone = zone;
    let bestScore = -1;
    for(let tries=0; tries<18; tries++){
      const z = randomZone();
      const cand = randomClearPointInZone(z, 70);
      let nearest = dist(cand.x,cand.y,180,590);
      for(const prev of placed) nearest = Math.min(nearest, dist(cand.x,cand.y,prev.x,prev.y));
      if(nearest > bestScore){
        bestScore = nearest;
        best = {x:cand.x, y:cand.y};
        bestZone = z;
      }
      if(nearest >= 170) break;
    }
    zone = bestZone;
    pt = best;
    placed.push({x:pt.x, y:pt.y});

    createEnemyAt(pt.x, pt.y, zone);
  }
  message = missionName;
  messageTimer = 1.7;
}

function shuffle(list){
  const arr = list.slice();
  for(let i=arr.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    const t=arr[i]; arr[i]=arr[j]; arr[j]=t;
  }
  return arr;
}
function pickSpacedCandidates(list, count, minDist=0){
  const picked = [];
  for(const item of shuffle(list)){
    if(picked.length >= count) break;
    let ok = true;
    for(const prev of picked){
      if(dist(item.x,item.y,prev.x,prev.y) < minDist){ ok = false; break; }
    }
    if(ok) picked.push({...item});
  }
  return picked;
}
function spawnSecurity(){
  turrets = [];
  cameras = [];
  const turretCount = 1 + ((Math.random()*2)|0);   // 1 až 2
  const cameraCount = (Math.random()*4)|0;         // 0 až 3
  const turretPool = turretCandidates.filter(pt=>!blockedCircle(pt.x,pt.y,36));
  for(const pt of pickSpacedCandidates(turretPool, turretCount, 250)){
    const inward = angleTo(pt.x,pt.y,map.w/2,map.h/2);
    turrets.push({
      x:pt.x, y:pt.y, r:28,
      hp:120, maxHp:120,
      ang:inward, baseAng:inward,
      sweep:rand(.35,.62), scanPhase:rand(0,Math.PI*2),
      shootCd:rand(.25,.9), muzzleFx:0,
      spotted:false, spottedTimer:0, hidden:true,
      blood:[]
    });
  }
  const cameraPool = cameraCandidates.filter(pt=>!blockedCircle(pt.x,pt.y,24));
  for(const pt of pickSpacedCandidates(cameraPool, cameraCount, 330)){
    const inward = angleTo(pt.x,pt.y,map.w/2,map.h/2);
    cameras.push({
      x:pt.x, y:pt.y, r:14,
      hp:60, maxHp:60,
      ang:inward, baseAng:inward,
      sweep:rand(.25,.48), scanPhase:rand(0,Math.PI*2),
      spotted:false, spottedTimer:0, hidden:true
    });
  }
}
function triggerSecurityAlarm(x,y,source='camera'){
  securityAlarm.x = clamp(x, 90, map.w-90);
  securityAlarm.y = clamp(y, 90, map.h-90);
  securityAlarm.timer = 10;
  securityAlarm.source = source;
}
function sensorOrigin(x,y,ang,offset=0){
  return {x:x + Math.cos(ang)*offset, y:y + Math.sin(ang)*offset};
}
function sensorCanSeePlayer(x,y,ang,width,maxD,offset=0){
  if(player.hiddenInShadow) return false;
  const o = sensorOrigin(x,y,ang,offset);
  const d = dist(o.x,o.y,player.x,player.y);
  if(d > maxD) return false;
  const a = angleTo(o.x,o.y,player.x,player.y);
  if(Math.abs(angleDiff(a, ang)) > width) return false;
  if(!los(o.x,o.y,player.x,player.y,6)) return false;
  return d <= castLightDistance(o.x,o.y,a,maxD) + 6;
}
function turretSeesPlayer(t){ return t.hp>0 && sensorCanSeePlayer(t.x,t.y,t.ang,.44,760,28); }
function cameraSeesPlayer(c){ return c.hp>0 && sensorCanSeePlayer(c.x,c.y,c.ang,.38,780,22); }
function playerSeesDevice(o){
  const d = dist(player.x, player.y, o.x, o.y);
  if(d < 45) return los(player.x, player.y, o.x, o.y);
  if(!flashlightOn) return false;
  const a = angleTo(player.x, player.y, o.x, o.y);
  if(Math.abs(angleDiff(a, player.ang)) > (keys[' '] ? .50 : .44)) return false;
  if(!los(player.x,player.y,o.x,o.y)) return false;
  return d <= castLightDistance(player.x, player.y, a, keys[' '] ? 740 : 660) + 8;
}
function hitTurret(t, b){
  if(t.hp <= 0) return;
  const a = Math.atan2(b.vy,b.vx);
  t.hp -= b.dmg * .8;
  t.spotted = true; t.spottedTimer = 1.2;
  t.blood.push({x:rand(-10,10),y:rand(-10,10),r:rand(3,7),a:rand(-Math.PI,Math.PI),s:rand(.8,1.4)});
  if(t.blood.length > 18) t.blood.shift();
  for(let i=0;i<10;i++) pushParticle(b.x,b.y,rand(-130,130),rand(-130,130),rand(.12,.35),rand(2,5),'spark');
  addBulletMark(b.x,b.y,a);
  if(t.hp <= 0){
    t.hp = 0;
    t.muzzleFx = 0;
    splatter(t.x,t.y,10,.55);
    for(let i=0;i<16;i++) pushParticle(t.x,t.y,rand(-180,180),rand(-180,180),rand(.18,.55),rand(2,6),'spark');
  }
}


function hitCamera(c, b){
  if(c.hp <= 0) return;
  const a = Math.atan2(b.vy,b.vx);
  c.hp -= b.dmg;
  c.spotted = true;
  c.spottedTimer = 1.4;
  for(let i=0;i<7;i++) pushParticle(b.x,b.y,rand(-110,110),rand(-110,110),rand(.10,.30),rand(2,4),'spark');
  addBulletMark(b.x,b.y,a);
  if(c.hp <= 0){
    c.hp = 0;
    c.spotted = false;
    c.spottedTimer = 2.0;
    for(let i=0;i<12;i++) pushParticle(c.x,c.y,rand(-160,160),rand(-160,160),rand(.15,.45),rand(2,5),'spark');
  }
}

function rectCircle(rect, cx, cy, cr){
  const nx = clamp(cx, rect.x, rect.x+rect.w);
  const ny = clamp(cy, rect.y, rect.y+rect.h);
  return Math.hypot(cx-nx, cy-ny) < cr;
}
function getDoorPanels(d){
  const open = clamp(d.open,0,1);
  if(open >= 0.995) return [];
  if(d.w >= d.h){
    const pw = d.w * 0.5;
    return [
      {x:d.x - pw*open, y:d.y, w:pw, h:d.h},
      {x:d.x + pw + pw*open, y:d.y, w:pw, h:d.h}
    ];
  }
  const ph = d.h * 0.5;
  return [
    {x:d.x, y:d.y - ph*open, w:d.w, h:ph},
    {x:d.x, y:d.y + ph + ph*open, w:d.w, h:ph}
  ];
}
function eachSolidRect(cb){
  for(const w of map.walls) cb(w);
  for(const d of map.doors) for(const p of getDoorPanels(d)) cb(p);
  for(const o of map.decor){
    if(['pipe','doorLight','plant'].includes(o.t)) continue;
    const pad = o.t==='chair' ? 3 : 6;
    cb({x:o.x+pad,y:o.y+pad,w:Math.max(4,o.w-pad*2),h:Math.max(4,o.h-pad*2)});
  }
}
function blockedCircle(x,y,r){
  let hit = false;
  eachSolidRect(w => { if(!hit && rectCircle(w,x,y,r)) hit = true; });
  return hit;
}
function moveCircle(obj, vx, vy, dt){
  const ox = obj.x, oy = obj.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(vx*dt,vy*dt)/10));
  const sx = vx*dt/steps, sy = vy*dt/steps;
  for(let i=0;i<steps;i++){
    let nx = obj.x + sx;
    if(!blockedCircle(nx,obj.y,obj.r)) obj.x = nx;
    let ny = obj.y + sy;
    if(!blockedCircle(obj.x,ny,obj.r)) obj.y = ny;
  }
  return Math.hypot(obj.x-ox,obj.y-oy) > .08;
}
function startCameraShake(power=8,dur=.22){
  shake = Math.max(shake,power);
  shakeTimer = Math.max(shakeTimer,dur);
}
function updatePlayerRecoil(dt){
  const s = Math.hypot(player.recoilVX||0, player.recoilVY||0);
  if(s < 1){ player.recoilVX=0; player.recoilVY=0; return false; }
  moveCircle(player, player.recoilVX, player.recoilVY, dt);
  const damp = Math.pow(.07, dt);
  player.recoilVX *= damp;
  player.recoilVY *= damp;
  return true;
}
function nearWallForShadow(){
  if(gameMode!=='mission' || player.dead) return false;
  const r = player.r + 16;
  for(let i=0;i<12;i++){
    const a = (Math.PI*2*i)/12;
    const x = player.x + Math.cos(a)*r;
    const y = player.y + Math.sin(a)*r;
    if(pointInWall(x,y)) return true;
  }
  return false;
}
function updateShadowStealth(dt, moving){
  if(gameMode!=='mission' || player.dead){
    player.shadowTime = 0;
    player.hiddenInShadow = false;
    return;
  }
  const recoilMoving = Math.hypot(player.recoilVX||0, player.recoilVY||0) > 18;
  if(!moving && !recoilMoving && nearWallForShadow()){
    player.shadowTime += dt;
    player.hiddenInShadow = player.shadowTime >= 3.0;
  } else {
    player.shadowTime = 0;
    player.hiddenInShadow = false;
  }
}
function walkRayClear(x,y,a,len,r=20){
  const steps = Math.max(2, Math.ceil(len/8));
  for(let i=1;i<=steps;i++){
    const px = x + Math.cos(a)*len*(i/steps);
    const py = y + Math.sin(a)*len*(i/steps);
    if(blockedCircle(px,py,r)) return false;
  }
  return true;
}
function steerVelocity(obj, vx, vy, dt){
  const speed = Math.hypot(vx,vy);
  if(speed < 1) return {vx,vy};
  const base = Math.atan2(vy,vx);
  const look = clamp(speed*dt + 34, 28, 76);
  if(walkRayClear(obj.x,obj.y,base,look,obj.r)) return {vx,vy};
  const probes = [0.35,-0.35,0.70,-0.70,1.05,-1.05,1.57,-1.57,2.20,-2.20,Math.PI];
  for(const off of probes){
    const a = base + off;
    if(walkRayClear(obj.x,obj.y,a,look,obj.r)){
      return {vx:Math.cos(a)*speed, vy:Math.sin(a)*speed};
    }
  }
  return {vx:0,vy:0};
}
function pointInWall(x,y){
  if(x < 0 || y < 0 || x > map.w || y > map.h) return true;
  let hit = false;
  eachSolidRect(w => { if(!hit && x>=w.x && x<=w.x+w.w && y>=w.y && y<=w.y+w.h) hit = true; });
  return hit;
}
function castLightDistance(x,y,a,maxLen){
  const step = 10;
  let last = 8;
  for(let d=8; d<=maxLen; d+=step){
    const px = x + Math.cos(a)*d;
    const py = y + Math.sin(a)*d;
    if(pointInWall(px,py)) return Math.max(8, d-step);
    last = d;
  }
  return Math.min(maxLen, last);
}
function segmentRectHit(x1,y1,x2,y2,r,rect){
  const minX = rect.x - r, minY = rect.y - r, maxX = rect.x + rect.w + r, maxY = rect.y + rect.h + r;
  const dx = x2-x1, dy = y2-y1;
  let t0 = 0, t1 = 1;
  const checks = [
    [-dx, x1-minX], [dx, maxX-x1],
    [-dy, y1-minY], [dy, maxY-y1]
  ];
  for(const c of checks){
    const p = c[0], q = c[1];
    if(Math.abs(p) < 1e-6){ if(q < 0) return false; }
    else {
      const t = q / p;
      if(p < 0){ if(t > t1) return false; if(t > t0) t0 = t; }
      else { if(t < t0) return false; if(t < t1) t1 = t; }
    }
  }
  return true;
}
function los(x1,y1,x2,y2, pad=5){
  if(pointInWall(x1,y1) || pointInWall(x2,y2)) return false;
  let blocked = false;
  eachSolidRect(r => {
    if(!blocked && segmentRectHit(x1,y1,x2,y2,pad,r)) blocked = true;
  });
  if(blocked) return false;
  const steps = Math.max(2, Math.ceil(Math.hypot(x2-x1,y2-y1)/5));
  for(let i=1;i<steps;i++){
    const t=i/steps;
    if(pointInWall(x1+(x2-x1)*t,y1+(y2-y1)*t)) return false;
  }
  return true;
}
function angleDiff(a,b){
  return Math.atan2(Math.sin(a-b), Math.cos(a-b));
}
function playerIlluminatesEnemy(e){
  if(!flashlightOn || !e || e.hp <= 0) return false;
  const d = dist(player.x, player.y, e.x, e.y);
  const a = angleTo(player.x, player.y, e.x, e.y);
  const diff = Math.abs(angleDiff(a, player.ang));
  const width = keys[' '] ? .50 : .44;
  if(diff > width) return false;
  if(!los(player.x, player.y, e.x, e.y, 7)) return false;
  return d <= castLightDistance(player.x, player.y, a, keys[' '] ? 740 : 660) + 4;
}
function playerSeesEnemy(e){
  const d = dist(player.x, player.y, e.x, e.y);
  if(d < 34) return los(player.x, player.y, e.x, e.y, 7);
  return playerIlluminatesEnemy(e);
}

function enemySeesPlayer(e){
  if(player.hiddenInShadow) return false;
  const d = dist(e.x,e.y,player.x,player.y);
  const maxD = e.kind==='scout' ? 560 : e.kind==='heavy' ? 470 : 510;
  if(d > maxD) return false;
  const a = angleTo(e.x,e.y,player.x,player.y);
  const diff = Math.abs(angleDiff(a, e.ang));
  const width = e.kind==='heavy' ? .28 : .36;
  if(diff > width) return false;
  if(!los(e.x,e.y,player.x,player.y)) return false;
  return d <= castLightDistance(e.x,e.y,a,e.kind==='scout'?540:480) + 8;
}
function pushParticle(x,y,vx,vy,life,size,kind='spark'){
  particles.push({x,y,vx,vy,life,max:life,size,kind});
  if(particles.length > 180) particles.splice(0, particles.length - 180);
}
function splatter(x,y,n=8,power=1,color='red'){
  // Bez explozivního rozprsknutí krve. Krev řeší decals/louže a sprayBloodToWall.
  const drops = Math.min(3, Math.max(1, Math.floor(n/26)));
  for(let i=0;i<drops;i++){
    addBloodDecal(x+rand(-10,10), y+rand(-10,10), rand(5,12)*power, false, rand(-Math.PI,Math.PI), color);
  }
}
function addBloodDecal(x,y,size=10,onWall=false,a=0,color='red'){
  bloodDecals.push({
    x,y,size:size*rand(.85,1.28), onWall, color,
    a:a+rand(-.9,.9),
    stretch:onWall?rand(1.2,2.1):rand(.95,1.6),
    alpha:onWall?rand(.45,.74):rand(.50,.82),
    dark:rand(.55,.98),
    lobes:2+((Math.random()*4)|0),
    drips:onWall ? 1+((Math.random()*3)|0) : ((Math.random()*3)|0),
    seed:Math.random()*1000
  });
  if(bloodDecals.length > 160) bloodDecals.splice(0, bloodDecals.length - 160);
}
function sprayBloodToWall(x,y,a,maxLen=90,color='red'){
  const step = 6;
  for(let d=12; d<=maxLen; d+=step){
    const px = x + Math.cos(a)*d;
    const py = y + Math.sin(a)*d;
    if(pointInWall(px,py)){
      addBloodDecal(px - Math.cos(a)*5, py - Math.sin(a)*5, rand(7,13), true, a, color);
      return;
    }
  }
}

function muzzle(x,y,a){
  for(let i=0;i<16;i++){
    const aa=a+rand(-.24,.24), s=rand(180,420);
    pushParticle(x,y,Math.cos(aa)*s,Math.sin(aa)*s,rand(.05,.18),rand(2,6),'spark');
  }
  for(let i=0;i<12;i++){
    const aa=a+rand(-.20,.20), s=rand(35,120);
    pushParticle(x,y,Math.cos(aa)*s,Math.sin(aa)*s,rand(.12,.34),rand(7,15),'smoke');
  }
}
function dropShell(x,y,a,power=1){
  const side = a + Math.PI/2 + rand(-.35,.35);
  let sx = x + Math.cos(side)*rand(12,26) + Math.cos(a)*rand(-8,8);
  let sy = y + Math.sin(side)*rand(12,26) + Math.sin(a)*rand(-8,8);

  const speed = rand(85,180) * power;
  shells.push({
    x:sx, y:sy,
    vx:Math.cos(side)*speed + Math.cos(a)*rand(-30,35)*power,
    vy:Math.sin(side)*speed + Math.sin(a)*rand(-30,35)*power,
    ang:rand(0,Math.PI*2),
    spin:(Math.random()<.5?-1:1)*rand(10,22),
    phase:rand(0,Math.PI*2),
    age:0,
    size:rand(.85,1.25) * (.9 + power*.18)
  });

  if(shells.length > 65) shells.splice(0, shells.length - 65);
}
function addBulletMark(x,y,a){
  bulletMarks.push({x,y,a,size:rand(3.5,6.5)});
  if(bulletMarks.length > 420) bulletMarks.splice(0, bulletMarks.length - 420);
}

function safeMuzzlePoint(x,y,a,desired){
  let lx = x + Math.cos(a)*10;
  let ly = y + Math.sin(a)*10;
  for(let d=12; d<=desired; d+=6){
    const tx = x + Math.cos(a)*d;
    const ty = y + Math.sin(a)*d;
    if(pointInWall(tx,ty) || !los(x,y,tx,ty,2)) break;
    lx = tx; ly = ty;
  }
  return {x:lx,y:ly};
}
function bulletSegmentHitsSolid(x1,y1,x2,y2){
  let blocked = false;
  eachSolidRect(r=>{
    if(!blocked && segmentRectHit(x1,y1,x2,y2,3,r)) blocked = true;
  });
  return blocked;
}
function shoot(owner, x,y,a, dmg, speed, spread=.035){
  const isPlayer = owner === 'p';
  const def = isPlayer && player.weaponType ? weaponDefs[player.weaponType] : null;
  const muzzleDist = def ? def.muzzleDist : (isPlayer ? 58 : 24);
  const mp = safeMuzzlePoint(x,y,a,muzzleDist);
  const bx = mp.x;
  const by = mp.y;
  const pellets = def && def.pellets ? def.pellets : 1;
  for(let i=0;i<pellets;i++){
    const extra = pellets > 1 ? rand(-spread*0.95, spread*0.95) : 0;
    const aa = a + rand(-spread, spread) + extra;
    bullets.push({x:bx,y:by,px:bx,py:by,vx:Math.cos(aa)*speed,vy:Math.sin(aa)*speed,life:1.15,owner,dmg:pellets>1?dmg:dmg});
  }
  muzzle(bx,by,a);
  playSound(isPlayer && def ? def.sound : soundPaths.weapons.ak47, isPlayer ? .62 : .32);
  if(isPlayer && def){
    noise.x = x; noise.y = y; noise.timer = .95;
    const shellAng = a + Math.PI/2;
    dropShell(
      x + Math.cos(a)*def.shellOffsetForward + Math.cos(shellAng)*def.shellOffsetSide,
      y + Math.sin(a)*def.shellOffsetForward + Math.sin(shellAng)*def.shellOffsetSide,
      a
    );
    player.muzzleFx = .1;
    const smokeCount = def.pellets && def.pellets > 1 ? 14 : 10;
    for(let i=0;i<smokeCount;i++){
      const sa = a + rand(-.16,.16), sv = rand(22,92);
      pushParticle(bx + Math.cos(a)*4, by + Math.sin(a)*4, Math.cos(sa)*sv, Math.sin(sa)*sv, rand(.12,.28), rand(6,13), 'smoke');
    }
  } else if(!isPlayer) {
    startCameraShake(1.4,.12);
  }
  beep(owner==='p'?92:70,.045,owner==='p'?.055:.025,'sawtooth');
}

function consumeCurrentSlotAfterUse(){
  const used = player.selectedSlot|0;
  player.loadoutSlots[used] = null;
  player.slotTroll[used] = false;
  player.weaponType = null;
  player.ammo = 0; player.reserve = 0; player.clip = 0; player.reload = 0;
  const other = used===0 ? 1 : 0;
  if(player.loadoutSlots[other]) switchInventorySlot(other);
  else { updatePlayerSprite(); saveProgress(); }
}
function throwGrenade(){
  const force = 560;
  const gx = player.x + Math.cos(player.ang)*34;
  const gy = player.y + Math.sin(player.ang)*34;
  grenades.push({x:gx,y:gy,z:18,vx:Math.cos(player.ang)*force,vy:Math.sin(player.ang)*force,vz:220,ang:0,spin:rand(-8,8),fuse:1.55,r:10,bounce:0});
  playSound(soundPaths.weapons.shotgun,.35);
  for(let i=0;i<8;i++) pushParticle(gx,gy,rand(-50,50),rand(-50,50),rand(.12,.25),rand(3,7),'smoke');
  consumeCurrentSlotAfterUse();
}
function damageEnemyExplosion(e,dmg,ang){
  if(e.hp<=0) return;
  e.hp -= dmg;
  e.alert = Math.max(e.alert,2.8);
  e.state='investigate';
  e.investigateX = player.x; e.investigateY = player.y;
  for(let i=0;i<5;i++) e.blood.push({x:rand(-24,24),y:rand(-24,24),r:rand(5,13),a:rand(-Math.PI,Math.PI),s:rand(.8,1.55),color:e.bloodColor});
  if(e.blood.length>30) e.blood.splice(0,e.blood.length-30);
  if(e.hp<=0){
    player.kills++; player.totalKills++; saveProgress(); grantXp(1); player.score += e.type==='armored'?180:100;
    e.hp=0; e.corpseDX=Math.cos(ang)*rand(30,55); e.corpseDY=Math.sin(ang)*rand(30,55); e.corpseRot=rand(-1.4,1.4); e.corpseAnim=0;
    e.bleedTime=rand(5,9); e.bleedNext=rand(.08,.18);
    addBloodDecal(e.x+rand(-20,20),e.y+rand(-20,20),rand(28,52),false,ang,e.bloodColor);
    if(Math.random()<.35) pickups.push({x:e.x+rand(-18,18),y:e.y+rand(-18,18),type:Math.random()<.55?'ammo':'med',r:13});
  }
}
function explodeGrenade(g){
  const wall = pointInWall(g.x,g.y);
  craters.push({x:g.x,y:g.y,r:wall?82:104,a:rand(-Math.PI,Math.PI),wall,seed:Math.random()*1000});
  if(craters.length>24) craters.splice(0,craters.length-24);
  explosions.push({x:g.x,y:g.y,t:.18,max:.18,r:wall?125:155});
  for(let i=0;i<50;i++){
    const a=rand(0,Math.PI*2), sp=rand(120,520);
    pushParticle(g.x,g.y,Math.cos(a)*sp,Math.sin(a)*sp,rand(.12,.58),rand(3,10),Math.random()<.55?'dust':'smoke');
  }
  startCameraShake(10,.75);
  noise.x=g.x; noise.y=g.y; noise.timer=1.3;
  const radius = wall?150:190;
  for(const e of enemies){
    if(e.hp<=0) continue;
    const d=dist(g.x,g.y,e.x,e.y);
    if(d<radius && los(g.x,g.y,e.x,e.y,8)){
      const dmg = 190 * (1 - d/radius) + 45;
      damageEnemyExplosion(e,dmg,angleTo(g.x,g.y,e.x,e.y));
    }
  }
}
function updateGrenades(dt, simDt){
  for(const g of grenades){
    g.fuse -= simDt;
    g.vz -= 520*simDt;
    let nx = g.x + g.vx*simDt, ny = g.y + g.vy*simDt;
    if(pointInWall(nx,g.y)){ g.vx *= -.45; nx = g.x + g.vx*simDt; g.bounce++; }
    if(pointInWall(g.x,ny)){ g.vy *= -.45; ny = g.y + g.vy*simDt; g.bounce++; }
    g.x = clamp(nx,6,map.w-6); g.y = clamp(ny,6,map.h-6);
    g.z += g.vz*simDt;
    if(g.z<=0){ g.z=0; g.vz=Math.abs(g.vz)*.38; g.vx*=.72; g.vy*=.72; if(Math.abs(g.vz)<35) g.vz=0; }
    g.vx*=Math.pow(.42,simDt); g.vy*=Math.pow(.42,simDt); g.ang+=g.spin*simDt;
    if(g.fuse<=0) { g.dead=true; explodeGrenade(g); }
  }
  grenades = grenades.filter(g=>!g.dead);
  for(const ex of explosions) ex.t -= dt;
  explosions = explosions.filter(e=>e.t>0);
}

function updatePlayerWeapon(dt, simDt){
  player.shootCd = Math.max(0, player.shootCd - simDt);
  if(player.weaponType==='grenade'){
    player.muzzleFx = Math.max(0, player.muzzleFx - dt*1.8);
    if(mouse.down && player.shootCd<=0 && player.ammo>0 && !player.dead){
      player.shootCd=.7; player.ammo=0; snapshotWeaponState(); throwGrenade();
    }
    return;
  }
  if(player.reload > 0){
    player.reload -= simDt;
    if(player.reload <= 0){
      const need = player.clip - player.ammo;
      const take = Math.min(need, player.reserve);
      player.ammo += take; player.reserve -= take;
      player.reload = 0;
      snapshotWeaponState();
    }
  }
  if(player.weaponType && (keys.r || player.ammo===0 && mouse.down) && player.reload<=0 && player.ammo<player.clip && player.reserve>0){
    const rw = weaponDefs[player.weaponType] || weaponDefs.m4;
    player.reload = rw.reloadTime || 1.55;
    player.reloadMax = player.reload;
    playSound(soundPaths.reload,.45);
    beep(180,.05,.025,'triangle');
  }
  player.muzzleFx = Math.max(0, player.muzzleFx - dt*1.8);
  if(player.weaponType && mouse.down && player.shootCd<=0 && player.reload<=0 && player.ammo>0 && !player.dead){
    const w = weaponDefs[player.weaponType] || weaponDefs.m4;
    player.ammo--;
    snapshotWeaponState();
    player.shootCd = w.fireDelay;
    const spread = w.spread + (player.moving ? (w.pellets>1 ? .020 : .014) : .004) + (keys.shift ? .010 : 0);
    shoot('p',player.x,player.y,player.ang,w.damage,w.speed,spread);
    if(player.weaponType === 'sniper' && player.trollSniper){
      player.recoilVX -= Math.cos(player.ang)*980;
      player.recoilVY -= Math.sin(player.ang)*980;
      startCameraShake(13,3.0);
      player.muzzleFx = .16;
    }
  }
}
function decorHitAt(x,y){
  for(const o of map.decor){
    if(!['crate','table','chair','cabinet','shelf','sofa'].includes(o.t)) continue;
    if(x>=o.x && x<=o.x+o.w && y>=o.y && y<=o.y+o.h) return o;
  }
  return null;
}
function spawnSplinters(x,y,a,kind='wood'){
  for(let i=0;i<12;i++){
    const aa=a+Math.PI+rand(-.9,.9);
    const sp=rand(90,280);
    pushParticle(x,y,Math.cos(aa)*sp,Math.sin(aa)*sp,rand(.18,.55),rand(2,5),kind);
  }
  for(let i=0;i<5;i++) pushParticle(x,y,rand(-90,90),rand(-90,90),rand(.12,.34),rand(2,4),'dust');
}
function updateLooseFx(dt, simDt){
  updateGrenades(dt, simDt);
  for(const b of bullets){
    b.life -= simDt;
    b.px = b.x; b.py = b.y;
    b.x += b.vx*simDt; b.y += b.vy*simDt;
    if(gameMode==='lobby' && b.owner==='p'){
      for(const t of lobbyTargets){
        if(t.hp>0 && dist(b.x,b.y,t.x,t.y)<t.r+6){
          b.life=0;
          hitLobbyTarget(t,b);
          break;
        }
      }
      if(b.life<=0) continue;
    }
    if(pointInWall(b.x,b.y) || bulletSegmentHitsSolid(b.px,b.py,b.x,b.y)){
      b.life = 0;
      const ba=Math.atan2(b.vy,b.vx);
      addBulletMark(b.x,b.y,ba);
      const hitDecor = decorHitAt(b.x,b.y);
      if(hitDecor) spawnSplinters(b.x,b.y,ba, hitDecor.t==='cabinet' || hitDecor.t==='shelf' ? 'metalchip' : 'wood');
      else for(let i=0;i<5;i++) pushParticle(b.x,b.y,rand(-70,70),rand(-70,70),rand(.15,.38),rand(1,3),'dust');
    }
  }
  bullets = bullets.filter(b=>b.life>0);
  for(const p of particles){ p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vx*=Math.pow(.08,dt); p.vy*=Math.pow(.08,dt); }
  particles = particles.filter(p=>p.life>0);
  for(const s of shells.slice(-90)){
    if(!s.settled){
      s.age += dt;
      let nx = s.x + s.vx*dt;
      if(pointInWall(nx, s.y)){ s.vx *= -.42; s.spin *= .65; nx = s.x + s.vx*dt; }
      if(nx < 4 || nx > map.w-4){ s.vx *= -.42; nx = clamp(nx, 4, map.w-4); }
      s.x = nx;
      let ny = s.y + s.vy*dt;
      if(pointInWall(s.x, ny)){ s.vy *= -.42; s.spin *= .65; ny = s.y + s.vy*dt; }
      if(ny < 4 || ny > map.h-4){ s.vy *= -.42; ny = clamp(ny, 4, map.h-4); }
      s.y = ny;
      s.ang += s.spin*dt;
      s.vx *= Math.pow(.11,dt);
      s.vy *= Math.pow(.11,dt);
      s.spin *= Math.pow(.08,dt);
      if(s.age > .45 && Math.hypot(s.vx,s.vy) < 18){
        s.vx = 0; s.vy = 0; s.spin = 0; s.settled = true;
      }
    }
  }
}

function update(dt){
  if(state==='loading'){
    loadingTimer -= dt;
    if(loadingTimer <= 0){
      if(!getPlayerNick()) openNickEditor();
      else afterNickReady();
    }
    return;
  }
  if(state==='nick') return;
  onlineTick(dt);
  revealSharedFog();
  if(state==='menu' && menuStep==='searching'){
    searchTimer -= dt;
    if(searchTimer <= 0){ menuStep='lobby'; roomCreated=false; }
    return;
  }
  if(state==='menu' && menuStep==='online_search'){
    syncOnlineRooms();
    return;
  }
  if(state !== 'play') return;
  if(gameMode==='lobby'){
    updateLobby(dt);
    return;
  }
  noise.timer = Math.max(0, noise.timer - dt);
  securityAlarm.timer = Math.max(0, securityAlarm.timer - dt);
  const wantBT = keys[' '] && player.bt>0 && !player.dead;
  const timeScale = wantBT ? .36 : 1;
  if(wantBT) player.bt = Math.max(0, player.bt - 28*dt);
  else player.bt = Math.min(player.maxBt, player.bt + 10*dt);
  const simDt = dt * timeScale;

  player.ang = angleTo(player.x,player.y,mouse.worldX,mouse.worldY);
  let mx=0,my=0;
  if(keys.w || keys.arrowup) my -= 1;
  if(keys.s || keys.arrowdown) my += 1;
  if(keys.a || keys.arrowleft) mx -= 1;
  if(keys.d || keys.arrowright) mx += 1;
  const magReal = Math.hypot(mx,my);
  const mag = magReal || 1;
  const sprinting = (keys.shift || keys['shift']) && magReal > .05 && !player.dead;
  const speed = player.spd * (wantBT ? .92 : 1) * (sprinting ? 1.55 : 1);
  player.moving = magReal > 0.05 && !player.dead;
  if(player.moving) player.walk += dt * (sprinting ? 18 : 12);
  if(!player.dead) {
    moveCircle(player, mx/mag*speed, my/mag*speed, simDt);
    updatePlayerRecoil(dt);
    updateShadowStealth(dt, player.moving);
    revealFog(player.x, player.y, 255);
  }

  updatePlayerWeapon(dt, simDt);
  updateAlarmButtons(simDt);

  for(const c of cameras){
    c.spottedTimer = Math.max(0, c.spottedTimer - simDt);
    if(c.hp <= 0) continue;
    c.scanPhase += simDt * .82;
    const scanAng = c.baseAng + Math.sin(c.scanPhase) * c.sweep;
    const sees = cameraSeesPlayer(c) || cameraSeesPlayer({x:c.x,y:c.y,ang:scanAng,hp:c.hp});
    let targetAng = sees ? angleTo(c.x,c.y,player.x,player.y) : scanAng;
    if(!sees && castLightDistance(c.x,c.y,targetAng,160) < 55) targetAng = angleTo(c.x,c.y,map.w/2,map.h/2);
    c.ang += angleDiff(targetAng, c.ang) * clamp(simDt * (sees ? 8.0 : 3.0), 0, .85);
    if(sees){
      c.spotted = true;
      c.spottedTimer = 1.4;
      triggerSecurityAlarm(player.x, player.y, 'camera');
      for(const e of enemies){
        if(e.hp>0){
          e.alert = Math.max(e.alert, 3.4);
          if(!e.buttonTried && Math.random()<.10){
            const b=nearestAlarmButton(e.x,e.y);
            if(b){ e.buttonTarget=b.id; e.buttonTried=true; e.state='pressButton'; }
          } else {
            e.state = 'investigate';
          }
          e.lastSeenX = player.x; e.lastSeenY = player.y;
          e.investigateX = player.x + rand(-36,36);
          e.investigateY = player.y + rand(-36,36);
        }
      }
    } else if(c.spottedTimer <= 0) c.spotted = false;
  }

  for(const t of turrets){
    t.muzzleFx = Math.max(0, t.muzzleFx - dt*2.2);
    t.shootCd = Math.max(0, t.shootCd - simDt);
    t.spottedTimer = Math.max(0, t.spottedTimer - simDt);
    if(t.hp <= 0) continue;
    t.scanPhase += simDt * .58;
    const scanAng = t.baseAng + Math.sin(t.scanPhase) * t.sweep;
    const sees = turretSeesPlayer(t) || sensorCanSeePlayer(t.x,t.y,scanAng,.44,760);
    let targetAng = sees ? angleTo(t.x,t.y,player.x,player.y) : scanAng;
    if(!sees && castLightDistance(t.x,t.y,targetAng,160) < 55) targetAng = angleTo(t.x,t.y,map.w/2,map.h/2);
    t.ang += angleDiff(targetAng, t.ang) * clamp(simDt * (sees ? 9.5 : 2.5), 0, .82);
    if(sees){
      t.spotted = true;
      t.spottedTimer = .35;
      if(t.shootCd <= 0){
        t.shootCd = .13 + Math.random() * .05;
        t.muzzleFx = .1;
        shoot('e', t.x, t.y, t.ang, 34, 760, .045);
      }
    } else if(t.spottedTimer <= 0) t.spotted = false;
  }

  for(const e of enemies){
    if(e.hp <= 0){
      e.muzzleFx = Math.max(0, e.muzzleFx - dt*1.9);
      if(e.corpseAnim < e.corpseAnimMax) e.corpseAnim = Math.min(e.corpseAnimMax, e.corpseAnim + simDt);
      if(e.bleedTime > 0){
        e.bleedTime = Math.max(0, e.bleedTime - simDt);
        e.bleedNext -= simDt;
        if(e.bleedNext <= 0 && enemies.filter(q=>q.hp<=0).length < 24){
          const deadT = clamp((e.corpseAnim||0) / (e.corpseAnimMax||.24), 0, 1);
          const cx = e.x + (e.corpseDX||0) * deadT + rand(-10,10);
          const cy = e.y + (e.corpseDY||0) * deadT + rand(-10,10);
          addBloodDecal(cx, cy, rand(10,20), false, rand(-Math.PI,Math.PI));
          if(Math.random() < .95) addBloodDecal(cx + rand(-10,10), cy + rand(-10,10), rand(8,16), false, rand(-Math.PI,Math.PI));
          if(Math.random() < .88) splatter(cx, cy, 8, 1.0);
          if(Math.random() < .42) sprayBloodToWall(cx, cy, rand(0,Math.PI*2), 90);
          e.bleedNext = rand(.08,.24);
        }
      }
      continue;
    }

    e.muzzleFx = Math.max(0, e.muzzleFx - dt*1.9);
    if(!enemySeesPlayer(e) && castLightDistance(e.x,e.y,e.ang,120) < 38){
      e.ang += rand(-1.2,1.2) + Math.PI*.55;
      e.wait = 0;
    }
    if(playerIlluminatesEnemy(e)){
      e.spotted = true;
      e.spottedTimer = .45;
    } else {
      e.spottedTimer = Math.max(0, e.spottedTimer - dt);
      if(e.spottedTimer <= 0) e.spotted = false;
    }

    const d = dist(e.x,e.y,player.x,player.y);
    const toPlayer = angleTo(e.x,e.y,player.x,player.y);
    const canSee = enemySeesPlayer(e);
    const hearRange = e.kind==='scout' ? 760 : e.kind==='heavy' ? 540 : 650;
    const heardNoise = noise.timer > 0 && dist(e.x,e.y,noise.x,noise.y) < hearRange;

    e.reload = Math.max(0, e.reload - simDt);
    e.shootCd = Math.max(0, e.shootCd - simDt);
    e.wait -= simDt;
    let vx=0,vy=0;

    if(canSee){
      e.alert = Math.max(e.alert, 3.2);
      if(!e.buttonTried && Math.random()<.10){
        const b=nearestAlarmButton(e.x,e.y);
        if(b){ e.buttonTarget=b.id; e.buttonTried=true; e.state='pressButton'; }
        else e.state='engage';
      } else if(!e.buttonTarget) e.state = 'engage';
      e.lastSeenX = player.x; e.lastSeenY = player.y;
      e.investigateX = player.x; e.investigateY = player.y;
    } else if(securityAlarm.timer > 0){
      e.alert = Math.max(e.alert, 3.2);
      if(e.state !== 'engage' && e.state !== 'pressButton') e.state = 'investigate';
      e.lastSeenX = securityAlarm.x; e.lastSeenY = securityAlarm.y;
      e.searchMapTimer = Math.max(0,(e.searchMapTimer||0)-simDt);
      if(e.searchMapTimer <= 0 || dist(e.x,e.y,e.investigateX,e.investigateY)<42){
        const z = randomZone();
        const p = randomClearPointInZone(z,70,40);
        e.zone = z;
        e.investigateX = p.x;
        e.investigateY = p.y;
        e.searchMapTimer = rand(2.0,4.5);
      }
    } else if(heardNoise){
      e.alert = Math.max(e.alert, 1.8);
      if(e.state !== 'engage') e.state = 'investigate';
      e.investigateX = noise.x + rand(-45,45);
      e.investigateY = noise.y + rand(-45,45);
    } else {
      e.alert = Math.max(0, e.alert - simDt);
      if(e.alert > 0.1 && e.state === 'engage') e.state = 'investigate';
    }

    const buttonTarget = e.buttonTarget ? alarmButtons.find(b=>b.id===e.buttonTarget && b.cooldown<=0) : null;
    if(buttonTarget){
      e.state='pressButton';
      const bd=dist(e.x,e.y,buttonTarget.x,buttonTarget.y);
      const ta=angleTo(e.x,e.y,buttonTarget.x,buttonTarget.y);
      e.ang += angleDiff(ta,e.ang) * clamp(simDt*7.8,0,.95);
      if(bd>30){
        vx=Math.cos(e.ang)*e.spd*.86;
        vy=Math.sin(e.ang)*e.spd*.86;
      } else {
        activateAlarmButton(buttonTarget,false);
        e.buttonTarget=null;
        e.alert=Math.max(e.alert,3.5);
        e.state='investigate';
      }
    } else if(canSee || e.alert > 0.1){
      const tx = canSee ? player.x : e.investigateX;
      const ty = canSee ? player.y : e.investigateY;
      const ta = angleTo(e.x,e.y,tx,ty);
      e.ang += angleDiff(ta, e.ang) * clamp(simDt * 6.8, 0, .9);

      if(canSee){
        let forward=0, side=0;
        if(e.kind==='scout'){
          forward = d > 220 ? .44 : d < 120 ? -.38 : .06;
          side = e.strafeDir * .48;
          if(Math.random() < simDt*.9) e.strafeDir *= -1;
        } else if(e.kind==='heavy'){
          forward = d > 190 ? .30 : d < 95 ? -.14 : 0;
          side = e.strafeDir * .12;
          if(Math.random() < simDt*.35) e.strafeDir *= -1;
        } else if(e.kind==='mirror'){
          forward = d > 240 ? .36 : d < 150 ? -.26 : .04;
          side = e.strafeDir * .24;
          if(Math.random() < simDt*.45) e.strafeDir *= -1;
        } else {
          forward = d > 210 ? .24 : d < 130 ? -.18 : 0;
          side = e.strafeDir * .20;
          if(Math.random() < simDt*.40) e.strafeDir *= -1;
        }
        const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
        vx = (ca*forward + Math.cos(e.ang+Math.PI/2)*side) * e.spd;
        vy = (sa*forward + Math.sin(e.ang+Math.PI/2)*side) * e.spd;

        if(d < 430 && e.shootCd<=0 && e.reload<=0){
          if(e.ammo>0){
            e.ammo--;
            e.shootCd = e.kind==='heavy' ? .22 : e.kind==='scout' ? .60 : e.kind==='mirror' ? .30 : .42;
            e.muzzleFx = .09;
            const dmg = e.kind==='heavy' ? 52 : e.kind==='scout' ? 34 : 42;
            const spd = e.kind==='heavy' ? 620 : e.kind==='scout' ? 540 : 590;
            const spread = e.kind==='heavy' ? .15 : e.kind==='scout' ? .22 : e.kind==='mirror' ? .12 : .17;
            shoot('e',e.x,e.y,e.ang,dmg,spd,spread);
          } else {
            e.reload = e.kind==='heavy' ? 2.1 : 1.7;
            e.ammo = e.kind==='heavy' ? 14 : e.kind==='mirror' ? 10 : 8;
          }
        }
      } else {
        const id = dist(e.x,e.y,e.investigateX,e.investigateY);
        if(id > 28){
          const mult = e.kind==='scout' ? .72 : e.kind==='heavy' ? .42 : .58;
          vx = Math.cos(e.ang) * e.spd * mult;
          vy = Math.sin(e.ang) * e.spd * mult;
        } else if(e.wait <= 0){
          e.wait = rand(.6,1.6);
          e.guardAng = rand(-Math.PI,Math.PI);
          e.ang += rand(-.85,.85);
          e.investigateX = clamp(e.lastSeenX + rand(-70,70), e.zone.x+24, e.zone.x+e.zone.w-24);
          e.investigateY = clamp(e.lastSeenY + rand(-70,70), e.zone.y+24, e.zone.y+e.zone.h-24);
        }
      }
    } else {
      e.state = e.aiMode;
      if(e.aiMode === 'guard'){
        e.ang += Math.sin(performance.now()/900 + e.homeX*.01 + e.flashPhase) * .003;
        if(e.wait <= 0){ e.wait = rand(1.3,3.2); e.guardAng += rand(-.75,.75); }
        e.ang += angleDiff(e.guardAng, e.ang) * .025;
      } else if(e.aiMode === 'idle'){
        if(e.wait <= 0){ e.wait = rand(1.0,3.5); e.ang += rand(-1.0,1.0); }
      } else {
        const td = dist(e.x,e.y,e.roamX,e.roamY);
        if(td < 18 || e.wait <= 0 || !Number.isFinite(e.roamX) || !Number.isFinite(e.roamY)){
          const pad = e.aiMode === 'wander' ? 80 : 52;
          const target = randomClearPointInZone(e.zone, pad, 25);
          e.roamX = target.x; e.roamY = target.y; e.wait = rand(.8, 2.8);
        }
        const aa = angleTo(e.x,e.y,e.roamX,e.roamY);
        e.ang += angleDiff(aa, e.ang) * .045;
        if(td > 16){
          const mult = e.aiMode === 'wander' ? .20 : .34;
          vx = Math.cos(e.ang) * e.spd * mult;
          vy = Math.sin(e.ang) * e.spd * mult;
        }
      }
    }

    const wantedMove = Math.abs(vx) + Math.abs(vy) > 1;
    if(wantedMove){
      const s = steerVelocity(e, vx, vy, simDt);
      vx = s.vx; vy = s.vy;
    }
    const moved = moveCircle(e,vx,vy,simDt);
    if(wantedMove && !moved){
      e.stuck = (e.stuck || 0) + simDt;
      e.ang += rand(-1.4,1.4) + Math.PI*.55;
      const target = randomClearPointInZone(e.zone, 80, 30);
      e.roamX = target.x; e.roamY = target.y;
      e.investigateX = target.x; e.investigateY = target.y;
      e.wait = rand(.15,.6);
      // malý postranní náraz, aby se nelepili o nábytek
      moveCircle(e, Math.cos(e.ang)*e.spd*.35, Math.sin(e.ang)*e.spd*.35, simDt);
    } else {
      e.stuck = 0;
    }
    e.x = clamp(e.x, 90, map.w - 90);
    e.y = clamp(e.y, 90, map.h - 90);
    if(blockedCircle(e.x,e.y,e.r)){
      const target = randomClearPointInZone(e.zone || randomZone(), 90, 50);
      e.x = target.x; e.y = target.y;
      e.roamX = target.x; e.roamY = target.y;
    }
  }

  for(const d of map.doors){
    const cx = d.x + d.w/2, cy = d.y + d.h/2;
    let trigger = dist(player.x,player.y,cx,cy) < 115;
    if(!trigger){
      for(const e of enemies){
        if(dist(e.x,e.y,cx,cy) < 100){ trigger = true; break; }
      }
    }
    if(trigger){
      d.timer = 1.15;
      d.beacon = 1;
      if(d.open < .05 && d.snd <= 0) { playSound(soundPaths.door,.25); d.snd = .8; }
      d.open = Math.min(1, d.open + simDt*.22);
    }
    else if(d.timer > 0) { d.timer -= simDt; d.beacon = 1; }
    else {
      if(d.open > .95 && d.snd <= 0) { playSound(soundPaths.door,.22); d.snd = .8; }
      if(d.open > 0) d.beacon = 1;
      d.open = Math.max(0, d.open - simDt*.14);
    }
    d.snd = Math.max(0, d.snd - dt);
  }

  for(const b of bullets){
    b.life -= simDt;
    b.px = b.x; b.py = b.y;
    b.x += b.vx*simDt; b.y += b.vy*simDt;
    if(pointInWall(b.x,b.y)){
      b.life = 0;
      const ba=Math.atan2(b.vy,b.vx);
      addBulletMark(b.x,b.y,ba);
      const hitDecor = decorHitAt(b.x,b.y);
      if(hitDecor) spawnSplinters(b.x,b.y,ba, hitDecor.t==='cabinet' || hitDecor.t==='shelf' ? 'metalchip' : 'wood');
      else for(let i=0;i<5;i++) pushParticle(b.x,b.y,rand(-70,70),rand(-70,70),rand(.15,.38),rand(1,3),'dust');
      continue;
    }
    if(b.owner==='p'){
      for(const c of cameras){
        if(c.hp>0 && dist(b.x,b.y,c.x,c.y)<c.r+9){
          b.life=0;
          hitCamera(c,b);
          break;
        }
      }
      if(b.life<=0) continue;
      for(const t of turrets){
        if(t.hp>0 && dist(b.x,b.y,t.x,t.y)<t.r+7){
          b.life=0;
          hitTurret(t,b);
          break;
        }
      }
      if(b.life<=0) continue;
      for(const e of enemies){
        if(e.hp>0 && dist(b.x,b.y,e.x,e.y)<e.r+4){
          e.hp -= b.dmg * (e.type==='armored'?.72:1);
          e.alert=2.5; b.life=0; playSound(soundPaths.hit,.28);

          // krev na sprite enemy
          const hitAng = Math.atan2(b.vy,b.vx);
          const bcol = e.bloodColor || (e.spriteIndex===0?'yellow':'red');
          splatter(b.x,b.y,16,1.45,bcol);
          const localA = hitAng - e.ang;
          for(let bi=0; bi<6; bi++){
            const relX = Math.cos(localA) * rand(4,20) + rand(-12,12);
            const relY = Math.sin(localA) * rand(2,16) + rand(-14,14);
            e.blood.push({x:relX,y:relY,r:rand(4,10),a:rand(-Math.PI,Math.PI),s:rand(.8,1.7),color:e.bloodColor||'red'});
          }
          if(e.blood.length > 32) e.blood.splice(0, e.blood.length - 32);

          // hodně krve na zem i případně na stěnu
          addBloodDecal(e.x + rand(-10,10), e.y + rand(-10,10), rand(12,22), false, hitAng, bcol);
          addBloodDecal(b.x + rand(-14,14), b.y + rand(-14,14), rand(10,18), false, hitAng, bcol);
          addBloodDecal(e.x + rand(-20,20), e.y + rand(-20,20), rand(9,18), false, hitAng, bcol);
          if(Math.random() < .96) addBloodDecal(e.x + rand(-22,22), e.y + rand(-22,22), rand(10,20), false, hitAng, bcol);
          if(Math.random() < .72) addBloodDecal(e.x + rand(-24,24), e.y + rand(-24,24), rand(7,14), false, hitAng + rand(-.4,.4), bcol);
          sprayBloodToWall(b.x,b.y,hitAng,115, bcol);
          sprayBloodToWall(e.x,e.y,hitAng + rand(-.22,.22),130, bcol);
          sprayBloodToWall(e.x,e.y,hitAng + rand(-.65,.65),165, bcol);

          if(e.hp<=0){
            player.kills++; player.totalKills++; saveProgress(); grantXp(1); player.score += e.type==='armored'?180:100; splatter(e.x,e.y,70,2.35,bcol);
            e.corpseDX = Math.cos(hitAng) * rand(14,30);
            e.corpseDY = Math.sin(hitAng) * rand(14,30);
            e.corpseRot = rand(-1.05,1.05);
            e.corpseAnim = 0;
            e.bleedTime = rand(11.0,18.0);
            e.bleedNext = rand(.04,.16);
            addBloodDecal(e.x + rand(-18,18), e.y + rand(-18,18), rand(38,62), false, hitAng, bcol);
            addBloodDecal(e.x + rand(-30,30), e.y + rand(-30,30), rand(24,42), false, hitAng, bcol);
            addBloodDecal(e.x + rand(-24,24), e.y + rand(-24,24), rand(18,34), false, hitAng + rand(-.6,.6), bcol);
            addBloodDecal(e.x + rand(-36,36), e.y + rand(-36,36), rand(22,48), false, rand(-Math.PI,Math.PI), bcol);
            sprayBloodToWall(e.x,e.y,hitAng,150,bcol);
            if(Math.random() < .86) sprayBloodToWall(e.x,e.y,hitAng + rand(-.7,.7),165,bcol);
            if(Math.random()<.42) pickups.push({x:e.x+rand(-18,18),y:e.y+rand(-18,18),type:Math.random()<.55?'ammo':'med',r:13});
          }
          break;
        }
      }
    } else if(dist(b.x,b.y,player.x,player.y)<player.r+4 && !player.dead){
      const realDmg = Math.max(1, b.dmg * (1 - (player.armorProtection||0)));
      player.hp -= realDmg; b.life=0; splatter(b.x,b.y,3); startCameraShake(player.hp > 0 ? 6 : 0,.24); playSound(soundPaths.hit,.45);
      const hitAng = Math.atan2(b.vy,b.vx);
      if(player.hp > 0){
        player.bleedTime = Math.max(player.bleedTime, rand(4.5,8.0));
        player.bleedNext = Math.min(player.bleedNext || .07, .07);
        for(let bi=0; bi<8; bi++){
          player.blood.push({x:rand(-24,24),y:rand(-24,24),r:rand(5,12),a:rand(-Math.PI,Math.PI),s:rand(.8,1.55)});
        }
        if(player.blood.length > 34) player.blood.splice(0, player.blood.length - 34);
        for(let bi=0; bi<5; bi++){
          addBloodDecal(player.x + rand(-18,18), player.y + rand(-18,18), rand(10,22), false, hitAng + rand(-.4,.4));
        }
        splatter(player.x, player.y, 22, 1.55);
        sprayBloodToWall(player.x, player.y, hitAng + rand(-.5,.5), 115);
      }
      if(player.hp<=0){ addBloodDecal(player.x + rand(-16,16), player.y + rand(-16,16), rand(28,46), false, hitAng); player.hp=0; player.dead=true; state='dead'; message=''; messageTimer=0; shake=0; playSound(soundPaths.death,.7); stopMusic(); beep(45,.4,.08,'sawtooth'); }
    }
  }
  if(player.bleedTime > 0 && !player.dead){
    player.bleedTime = Math.max(0, player.bleedTime - simDt);
    player.bleedNext -= simDt;
    if(player.bleedNext <= 0){
      const bx = player.x + rand(-10,10), by = player.y + rand(-10,10);
      addBloodDecal(bx, by, rand(8,15), false, rand(-Math.PI,Math.PI));
      if(Math.random() < .45) sprayBloodToWall(bx, by, rand(0,Math.PI*2), 78);
      player.bleedNext = rand(.14,.32);
    }
  }

  bullets = bullets.filter(b=>b.life>0);
  enemies = enemies.filter(e=>e.corpseKeep !== false);

  for(const p of particles){ p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vx*=Math.pow(.08,dt); p.vy*=Math.pow(.08,dt); }
  particles = particles.filter(p=>p.life>0);
  for(const s of shells){
    if(!s.settled){
      s.age += dt;

      let nx = s.x + s.vx*dt;
      if(pointInWall(nx, s.y)){
        s.vx *= -.42;
        s.spin *= .65;
        nx = s.x + s.vx*dt;
      }
      if(nx < 4 || nx > map.w-4){
        s.vx *= -.42;
        nx = clamp(nx, 4, map.w-4);
      }
      s.x = nx;

      let ny = s.y + s.vy*dt;
      if(pointInWall(s.x, ny)){
        s.vy *= -.42;
        s.spin *= .65;
        ny = s.y + s.vy*dt;
      }
      if(ny < 4 || ny > map.h-4){
        s.vy *= -.42;
        ny = clamp(ny, 4, map.h-4);
      }
      s.y = ny;

      s.ang += s.spin*dt;
      s.vx *= Math.pow(.11,dt);
      s.vy *= Math.pow(.11,dt);
      s.spin *= Math.pow(.08,dt);

      if(s.age > .45 && Math.hypot(s.vx,s.vy) < 18){
        s.vx = 0; s.vy = 0; s.spin = 0; s.settled = true;
      }
    }
  }

  if(shells.length > 65) shells.splice(0, shells.length - 65);
  player.pickupText='';
  if(!player.pickupText){
    for(const p of pickups){
      const d=dist(player.x,player.y,p.x,p.y);
      if(d<42){
        player.pickupText = p.type==='ammo' ? 'E: NÁBOJE' : 'E: LÉKÁRNA';
        if(keys.e || d<25){
          p.dead=true;
          if(p.type==='ammo'){ player.reserve += 18; snapshotWeaponState(); player.score += 25; }
          else { player.hp = Math.min(player.maxHp, player.hp+32); player.score += 25; }
          playSound(soundPaths.pickup,.45);
          beep(260,.07,.035,'triangle');
        }
      }
    }
  }
  pickups = pickups.filter(p=>!p.dead);

  if(flashlightBlink > 0) flashlightBlink = Math.max(0, flashlightBlink - dt);
  else if(Math.random() < dt * .09) flashlightBlink = rand(.04,.12);

  if(!missionComplete && enemies.length && enemies.every(e=>e.hp<=0)){
    missionComplete = true;
    player.missionProgress[missionId] = 100;
    saveProgress();
    saveAccountToSupabase();
    message = 'VYHRÁL SI';
    messageTimer = 999;
    player.reserve += 16;
    player.hp = Math.min(player.maxHp, player.hp + 18);
    stopMusic();
  }

  camera.x = clamp(player.x - W/2, 0, map.w-W);
  camera.y = clamp(player.y - H/2, 0, map.h-H);
  if(shakeTimer>0){
    shakeTimer = Math.max(0, shakeTimer - dt);
    if(shakeTimer<=0) shake = 0;
  } else if(shake>0) shake = Math.max(0,shake - 32*dt);
  if(messageTimer>0) messageTimer -= dt;
}

function toWorld(){
  const r = canvas.getBoundingClientRect();
  const sx = W / r.width, sy = H / r.height;
  mouse.worldX = camera.x + (mouse.x - r.left) * sx;
  mouse.worldY = camera.y + (mouse.y - r.top) * sy;
}

function drawLoading(){
  ctx.save();
  ctx.fillStyle='#050505';
  ctx.fillRect(0,0,W,H);
  ctx.textAlign='center';
  ctx.font='72px Impact';
  ctx.strokeStyle='#000';
  ctx.lineWidth=10;
  ctx.fillStyle='#fff';
  ctx.strokeText('PROJEKT SAS',W/2,230);
  ctx.fillText('PROJEKT SAS',W/2,230);
  const p = clamp(1 - loadingTimer/1.65, 0, 1);
  ctx.fillStyle='rgba(255,255,255,.12)';
  ctx.fillRect(W/2-220,340,440,24);
  ctx.fillStyle='#d20b1c';
  ctx.fillRect(W/2-220,340,440*p,24);
  ctx.strokeStyle='#fff';
  ctx.lineWidth=2;
  ctx.strokeRect(W/2-220,340,440,24);
  ctx.font='24px Impact';
  ctx.fillStyle='#ddd';
  ctx.fillText('LOADING...',W/2,395);
  ctx.restore();
}
function drawNickWaiting(){
  ctx.save();
  ctx.fillStyle='#050505';
  ctx.fillRect(0,0,W,H);
  ctx.textAlign='center';
  ctx.font='48px Impact';
  ctx.fillStyle='#fff';
  ctx.fillText('ZADEJ NICK',W/2,260);
  ctx.restore();
}
function isOnScreen(x,y,margin=160){
  return x > camera.x-margin && x < camera.x+W+margin && y > camera.y-margin && y < camera.y+H+margin;
}
function draw(){
  ctx.save();
  ctx.clearRect(0,0,W,H);
  if(state==='loading') drawLoading();
  else if(state==='nick') drawNickWaiting();
  else if(state==='menu') drawMenu();
  else {
    const sx = shake ? rand(-shake,shake) : 0;
    const sy = shake ? rand(-shake,shake) : 0;
    ctx.translate(-camera.x + sx, -camera.y + sy);
    drawWorld();
    drawShells();
    drawPickups();
    if(gameMode==='lobby') drawLobbyCharacters();
    else if(online.active) drawOnlinePlayers();
    drawCameras();
    drawTurrets();
    const deadCount = enemies.reduce((n,e)=>n+(e.hp<=0?1:0),0);
    corpseFastRender = deadCount > 14;
    for(const e of enemies){ if(!isOnScreen(e.x,e.y,190)) continue; if(e.hp<=0 || playerSeesEnemy(e)) drawEnemy(e); }
    corpseFastRender = false;
    drawGrenades();
    drawBullets();
    drawExplosions();
    drawParticles();
    ctx.translate(camera.x - sx, camera.y - sy);
    drawLighting();
    drawExplorationFog();
    ctx.save();
    ctx.translate(-camera.x + sx, -camera.y + sy);
    drawPlayer();
    if(gameMode==='lobby' && chatBubble.timer>0) drawWorldBubble(player.x,player.y-70,chatBubble.text,{maxChars:34,stroke:'#d20b1c'});
    if(gameMode==='lobby') drawStoryOverlay();
    ctx.restore();
    drawPlayerLabels();
    drawHUD();
    if(gameMode==='lobby'){ drawLobbyStatsBoard(); drawLobbyLeaderboard(); drawInventoryBar(); drawLobbyPrompts(); drawLobbyWindows(); }
    drawMessage();
    if(state==='dead') drawDead();
  }
  ctx.restore();
  requestAnimationFrame(loop);
}


function drawCameras(){
  for(const c of cameras){
    const visible = playerSeesDevice(c) || c.spottedTimer > 0 || c.hp <= 0;
    if(!visible) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang - Math.PI/2);
    ctx.fillStyle='rgba(0,0,0,.24)';
    ctx.beginPath(); ctx.ellipse(3,7,16,10,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=c.hp>0?'#171a1f':'#080808'; ctx.strokeStyle='#050505'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(-10,-10); ctx.lineTo(0,-4); ctx.lineTo(10,-10); ctx.lineTo(10,8); ctx.lineTo(-10,8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#2a2d33'; ctx.fillRect(-5,-18,10,10); ctx.strokeRect(-5,-18,10,10);
    ctx.fillStyle='#0b0d12'; ctx.fillRect(-12,8,24,8); ctx.strokeRect(-12,8,24,8);
    ctx.fillStyle=c.spotted ? 'rgba(255,55,55,.95)' : 'rgba(180,0,0,.85)';
    ctx.beginPath(); ctx.arc(0,-2,5,0,Math.PI*2); ctx.fill();
    const bw=42,bh=5;
    ctx.rotate(-(c.ang - Math.PI/2));
    ctx.fillStyle='#101010'; ctx.fillRect(-bw/2,-34,bw,bh);
    ctx.fillStyle=c.hp>0?'#d20b1c':'#333'; ctx.fillRect(-bw/2,-34,bw*Math.max(0,c.hp/c.maxHp),bh);
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(-bw/2,-34,bw,bh);
    ctx.restore();
  }
}
function drawTurrets(){
  for(const t of turrets){
    const visible = playerSeesDevice(t) || t.spottedTimer > 0 || t.hp <= 0;
    if(!visible) continue;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.ang - Math.PI/2);
    ctx.fillStyle='rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(4,14,34,20,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=t.hp>0?'#101115':'#050505'; ctx.strokeStyle='#040404'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(0,0,30,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle=t.hp>0?'#1d2027':'#080808'; ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.fill(); ctx.stroke();
    if(turretSpriteReady){
      ctx.filter = t.hp>0 ? 'brightness(.92) contrast(1.12)' : 'grayscale(1) brightness(.12)';
      ctx.drawImage(turretSprite, -50, -50, 100, 100);
      ctx.filter='none';
    }
    for(const bm of (t.blood||[])){
      ctx.save(); ctx.translate(bm.x,bm.y); ctx.rotate(bm.a); ctx.scale(bm.s,1);
      ctx.fillStyle='rgba(90,90,90,.75)';
      ctx.beginPath(); ctx.ellipse(0,0,bm.r,bm.r*.55,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    if(t.hp>0){
      ctx.fillStyle=t.spotted ? 'rgba(255,82,82,.95)' : 'rgba(180,0,0,.85)';
      ctx.fillRect(-10,-3,20,6);
      if(t.muzzleFx > 0){
        const p = clamp(t.muzzleFx / .1, 0, 1);
        const mx = 0, my = 46;
        const g = ctx.createRadialGradient(mx,my,1,mx,my,24 + (1-p)*18);
        g.addColorStop(0,'rgba(255,255,255,'+(0.55*p)+')');
        g.addColorStop(.35,'rgba(255,235,195,'+(0.30*p)+')');
        g.addColorStop(1,'rgba(255,235,195,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mx,my,24 + (1-p)*18,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,249,230,'+(0.52*p)+')';
        ctx.beginPath(); ctx.moveTo(mx,my-6); ctx.lineTo(mx-10,my+12); ctx.lineTo(mx,my+34+(1-p)*9); ctx.lineTo(mx+10,my+12); ctx.closePath(); ctx.fill();
      }
    }
    ctx.rotate(Math.PI/2 - t.ang);
    const bw=64,bh=8;
    ctx.fillStyle='#101010'; ctx.fillRect(-bw/2,-50,bw,bh);
    ctx.fillStyle=t.hp>0?'#d20b1c':'#333'; ctx.fillRect(-bw/2,-50,bw*Math.max(0,t.hp/t.maxHp),bh);
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(-bw/2,-50,bw,bh);
    ctx.restore();
  }
}


function drawLobbyWorld(){
  makeTextures();
  ctx.fillStyle = textures.floor2 || '#555';
  ctx.fillRect(0,0,map.w,map.h);
  ctx.fillStyle='rgba(255,255,255,.025)';
  ctx.fillRect(70,70,map.w-140,map.h-140);

  drawWallShadows();
  for(const w of map.walls){
    const grad = ctx.createLinearGradient(w.x,w.y,w.x,w.y+w.h);
    grad.addColorStop(0,'#707070'); grad.addColorStop(.55,'#565656'); grad.addColorStop(1,'#383838');
    ctx.fillStyle=grad; ctx.fillRect(w.x,w.y,w.w,w.h);
    ctx.globalAlpha=.5; ctx.fillStyle = w.h > 65 || w.w > 65 ? textures.wall : textures.wallDark; ctx.fillRect(w.x,w.y,w.w,w.h); ctx.globalAlpha=1;
    ctx.strokeStyle='#050505'; ctx.lineWidth=4; ctx.strokeRect(w.x,w.y,w.w,w.h);
    ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.lineWidth=1; ctx.strokeRect(w.x+5,w.y+5,Math.max(0,w.w-10),Math.max(0,w.h-10));
  }
  drawDoors();
  drawBulletMarks();
  for(const d of map.decor) drawDecor(d);
}

function drawMissionFloorDetail(){
  const cell=128;
  const sx=Math.max(0,Math.floor(camera.x/cell)-1), ex=Math.ceil((camera.x+W)/cell)+1;
  const sy=Math.max(0,Math.floor(camera.y/cell)-1), ey=Math.ceil((camera.y+H)/cell)+1;
  ctx.save();
  for(let gy=sy; gy<=ey; gy++){
    for(let gx=sx; gx<=ex; gx++){
      const h = Math.abs(Math.sin(gx*12.9898 + gy*78.233))*43758.5453;
      const f = h - Math.floor(h);
      const x=gx*cell, y=gy*cell;
      if(f>.66){
        ctx.fillStyle='rgba(0,0,0,.10)';
        ctx.beginPath(); ctx.ellipse(x+cell*(.2+f*.5), y+cell*(.25+f*.45), 20+f*35, 8+f*18, f*6.28, 0, Math.PI*2); ctx.fill();
      }
      if(f>.82){
        ctx.strokeStyle='rgba(255,255,255,.045)';
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(x+20,y+f*cell); ctx.lineTo(x+cell-18,y+(1-f)*cell); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
function drawWorld(){
  makeTextures();
  if(gameMode==='lobby'){
    drawLobbyWorld();
    return;
  }
  ctx.fillStyle = textures.floor;
  ctx.fillRect(0,0,map.w,map.h);
  drawMissionFloorDetail();

  for(const r of roomVisuals){
    ctx.save();
    ctx.fillStyle = textures[r.floor] || textures.floor2;
    ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.fillStyle='rgba(255,255,255,.018)';
    ctx.fillRect(r.x+10,r.y+10,Math.max(0,r.w-20),Math.max(0,r.h-20));
    ctx.strokeStyle='rgba(0,0,0,.28)'; ctx.lineWidth=3; ctx.strokeRect(r.x,r.y,r.w,r.h);
    // čistá podlaha bez šikmých čar
    for(const rug of r.rugs||[]){
      ctx.fillStyle = textures.rug; ctx.fillRect(rug.x,rug.y,rug.w,rug.h);
      ctx.fillStyle = rug.c; ctx.globalAlpha=.58; ctx.fillRect(rug.x,rug.y,rug.w,rug.h); ctx.globalAlpha=1;
      ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=3; ctx.strokeRect(rug.x,rug.y,rug.w,rug.h);
      ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1; ctx.strokeRect(rug.x+4,rug.y+4,rug.w-8,rug.h-8);
      for(let yy=rug.y+8; yy<rug.y+rug.h-6; yy+=11){ ctx.strokeStyle='rgba(255,255,255,.03)'; ctx.beginPath(); ctx.moveTo(rug.x+5,yy); ctx.lineTo(rug.x+rug.w-5,yy); ctx.stroke(); }
    }
    ctx.restore();
  }
  // odstraněné šikmé a mřížkové čáry z podlahy
drawWallShadows();
  for(const w of map.walls){
    const grad = ctx.createLinearGradient(w.x,w.y,w.x,w.y+w.h);
    grad.addColorStop(0,'#707070'); grad.addColorStop(.55,'#565656'); grad.addColorStop(1,'#383838');
    ctx.fillStyle=grad; ctx.fillRect(w.x,w.y,w.w,w.h);
    ctx.globalAlpha=.5; ctx.fillStyle = w.h > 65 || w.w > 65 ? textures.wall : textures.wallDark; ctx.fillRect(w.x,w.y,w.w,w.h); ctx.globalAlpha=1;
    ctx.strokeStyle='#050505'; ctx.lineWidth=4; ctx.strokeRect(w.x,w.y,w.w,w.h);
    ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.lineWidth=1; ctx.strokeRect(w.x+5,w.y+5,Math.max(0,w.w-10),Math.max(0,w.h-10));
  }
  drawDoors();
  drawBulletMarks();
  for(const d of map.decor) drawDecor(d);
  drawAlarmButtons();
  drawAlarmBeacons();

  // small lamp fixtures
  for(const l of ambientLights){
    ctx.fillStyle='rgba(20,20,20,.95)'; ctx.fillRect(l.x-10,l.y-10,20,20);
    ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.strokeRect(l.x-10,l.y-10,20,20);
    ctx.fillStyle='rgba(255,240,180,.22)'; ctx.beginPath(); ctx.arc(l.x,l.y,5,0,Math.PI*2); ctx.fill();
  }
}
function drawWallShadows(){
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.28)';
  for(const w of map.walls){
    if(w.w < 10 || w.h < 10) continue;
    ctx.fillRect(w.x+14,w.y+18,w.w,w.h);
  }
  ctx.restore();
}
function drawAlarmButtons(){
  if(gameMode!=='mission') return;
  for(const b of alarmButtons){
    const blink = b.flash>0 && Math.sin(performance.now()/75)>0;
    ctx.save();
    ctx.translate(b.x,b.y);
    ctx.rotate(b.ang||0);
    ctx.fillStyle='rgba(10,10,10,.92)';
    ctx.strokeStyle='#050505';
    ctx.lineWidth=3;
    ctx.fillRect(-11,-9,22,18);
    ctx.strokeRect(-11,-9,22,18);
    ctx.fillStyle=blink?'#ff3030':'#9d000b';
    ctx.strokeStyle='#240004';
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,0,b.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.34)';
    ctx.beginPath(); ctx.arc(-3,-4,3,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}
function drawAlarmBeacons(){
  if(gameMode!=='mission') return;
  const active = securityAlarm.timer>0 || alarmBeacons.some(l=>l.flash>0);
  for(const l of alarmBeacons){
    const blink = active && Math.sin(performance.now()/105)>0;
    ctx.save();
    ctx.translate(l.x,l.y);
    ctx.fillStyle='rgba(0,0,0,.82)';
    ctx.strokeStyle='#090909';
    ctx.lineWidth=2;
    ctx.fillRect(-12,-8,24,16);
    ctx.strokeRect(-12,-8,24,16);
    ctx.fillStyle=blink?'rgba(255,25,25,.98)':'rgba(80,0,0,.75)';
    ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.fill();
    if(blink){
      const g=ctx.createRadialGradient(0,0,2,0,0,46);
      g.addColorStop(0,'rgba(255,0,0,.45)');
      g.addColorStop(1,'rgba(255,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,46,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawDecor(d){
  makeTextures();
  ctx.save();

  if(d.t==='labelMission' || d.t==='labelLoadout'){
    const txt = d.t==='labelMission' ? 'Mise' : 'Vybavení';
    ctx.font='24px Impact';
    ctx.textAlign='center';
    ctx.strokeStyle='#000';
    ctx.lineWidth=6;
    ctx.fillStyle='#fff';
    ctx.strokeText(txt, d.x + d.w/2, d.y + 25);
    ctx.fillText(txt, d.x + d.w/2, d.y + 25);
    ctx.restore();
    return;
  }

  function shadow(){
    ctx.fillStyle='rgba(0,0,0,.28)';
    ctx.fillRect(d.x+7,d.y+8,d.w,d.h);
  }
  function bevel(fill, stroke='#050505'){
    shadow();
    ctx.fillStyle=fill;
    ctx.fillRect(d.x,d.y,d.w,d.h);
    ctx.strokeStyle=stroke; ctx.lineWidth=4; ctx.strokeRect(d.x,d.y,d.w,d.h);
    ctx.strokeStyle='rgba(255,255,255,.13)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(d.x+4,d.y+4); ctx.lineTo(d.x+d.w-4,d.y+4); ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.moveTo(d.x+4,d.y+d.h-4); ctx.lineTo(d.x+d.w-4,d.y+d.h-4); ctx.stroke();
  }

  if(d.t==='pipe'){
    ctx.fillStyle=textures.metal; ctx.fillRect(d.x,d.y,d.w,d.h);
    ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.strokeRect(d.x,d.y,d.w,d.h);
    ctx.fillStyle='rgba(255,255,255,.08)'; ctx.fillRect(d.x,d.y,Math.max(2,d.w*.22),d.h);
    ctx.fillStyle='#101010'; ctx.fillRect(d.x+d.w*.35,d.y-5,8,d.h+10);
  } else if(d.t==='panel'){
    bevel(textures.darkMetal);
    ctx.fillStyle='#626262'; ctx.fillRect(d.x+12,d.y+18,d.w-24,d.h-36);
    ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.strokeRect(d.x+12,d.y+18,d.w-24,d.h-36);
    ctx.fillStyle='#d20b1c'; ctx.fillRect(d.x+d.w-18,d.y+10,7,7);
  } else if(d.t==='crate'){
    bevel(textures.wood);
    ctx.strokeStyle='rgba(0,0,0,.58)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x+d.w,d.y+d.h); ctx.moveTo(d.x+d.w,d.y); ctx.lineTo(d.x,d.y+d.h); ctx.stroke();
    ctx.strokeStyle='rgba(255,210,140,.10)';
    for(let yy=d.y+10; yy<d.y+d.h; yy+=14){ ctx.beginPath(); ctx.moveTo(d.x+5,yy); ctx.lineTo(d.x+d.w-5,yy+rand(-2,2)); ctx.stroke(); }
  } else if(d.t==='doorLight'){
    ctx.fillStyle='#101010'; ctx.fillRect(d.x,d.y,d.w,d.h);
    ctx.fillStyle='#d20b1c'; ctx.shadowColor='#d20b1c'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(d.x+d.w/2,d.y+14,8,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.strokeStyle='#000'; ctx.lineWidth=3; ctx.strokeRect(d.x,d.y,d.w,d.h);
  } else if(d.t==='table'){
    bevel(textures.wood);
    const g = ctx.createLinearGradient(d.x,d.y,d.x,d.y+d.h);
    g.addColorStop(0,'rgba(255,210,150,.12)'); g.addColorStop(1,'rgba(0,0,0,.24)');
    ctx.fillStyle=g; ctx.fillRect(d.x+5,d.y+5,d.w-10,d.h-10);
    ctx.fillStyle='#171717';
    ctx.fillRect(d.x+7,d.y+d.h-11,9,11); ctx.fillRect(d.x+d.w-16,d.y+d.h-11,9,11);
    ctx.fillRect(d.x+7,d.y,9,11); ctx.fillRect(d.x+d.w-16,d.y,9,11);
  } else if(d.t==='chair'){
    bevel(textures.plastic);
    ctx.fillStyle='rgba(255,255,255,.06)'; ctx.fillRect(d.x+5,d.y+5,d.w-10,d.h*.38);
    ctx.strokeStyle='rgba(0,0,0,.42)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(d.x+5,d.y+d.h*.55); ctx.lineTo(d.x+d.w-5,d.y+d.h*.55); ctx.stroke();
  } else if(d.t==='cabinet'){
    bevel(textures.darkMetal);
    ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(d.x+d.w/2,d.y+6); ctx.lineTo(d.x+d.w/2,d.y+d.h-6); ctx.stroke();
    ctx.fillStyle='#b0b0b0'; ctx.fillRect(d.x+d.w/2-8,d.y+d.h/2-3,6,6); ctx.fillRect(d.x+d.w/2+3,d.y+d.h/2-3,6,6);
  } else if(d.t==='shelf'){
    bevel(textures.darkMetal);
    ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=2;
    for(let yy=d.y+d.h*.33; yy<d.y+d.h; yy+=d.h*.33){ ctx.beginPath(); ctx.moveTo(d.x+5,yy); ctx.lineTo(d.x+d.w-5,yy); ctx.stroke(); }
    for(let i=8;i<d.w-8;i+=18){ ctx.fillStyle=i%36===0?'#555':'#303030'; ctx.fillRect(d.x+i,d.y+6,10,d.h-12); }
  } else if(d.t==='sofa'){
    shadow();
    ctx.fillStyle=textures.fabric; ctx.fillRect(d.x,d.y,d.w,d.h);
    ctx.strokeStyle='#050505'; ctx.lineWidth=4; ctx.strokeRect(d.x,d.y,d.w,d.h);
    ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(d.x+9,d.y+11,d.w-18,d.h-22);
    ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(d.x+d.w/2,d.y+6); ctx.lineTo(d.x+d.w/2,d.y+d.h-6); ctx.stroke();
    ctx.fillStyle='#383838'; ctx.fillRect(d.x+6,d.y-8,d.w-12,14);
  } else if(d.t==='plant'){
    ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(d.x+d.w/2+5,d.y+d.h-5,d.w*.45,d.h*.18,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#202020'; ctx.fillRect(d.x+8,d.y+16,d.w-16,d.h-16); ctx.strokeStyle='#050505'; ctx.lineWidth=3; ctx.strokeRect(d.x+8,d.y+16,d.w-16,d.h-16);
    ctx.fillStyle='#6b6b6b';
    ctx.beginPath(); ctx.moveTo(d.x+d.w/2,d.y+5); ctx.lineTo(d.x+5,d.y+20); ctx.lineTo(d.x+d.w/2,d.y+24); ctx.lineTo(d.x+d.w-5,d.y+20); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawShells(){
  for(const s of shells){
    ctx.save();
    ctx.translate(s.x,s.y);
    ctx.rotate(s.ang + (s.settled ? 0 : Math.sin(s.age*15 + s.phase)*0.16));
    ctx.scale(s.size, s.size);

    ctx.fillStyle='#c49a33';
    ctx.strokeStyle='#2e2206';
    ctx.lineWidth=1.4;
    ctx.shadowColor='rgba(255,220,120,.32)';
    ctx.shadowBlur=4;

    ctx.fillRect(-7,-2.6,14,5.2);
    ctx.strokeRect(-7,-2.6,14,5.2);
    ctx.fillStyle='#f1cf6a';
    ctx.fillRect(4,-2,3,4);

    ctx.shadowBlur=0;
    ctx.restore();
  }
}
function drawDoors(){
  for(const d of map.doors){
    const panels = getDoorPanels(d);
    ctx.save();
    ctx.fillStyle='rgba(210,11,28,.18)'; ctx.fillRect(d.x,d.y,d.w,d.h);
    ctx.strokeStyle='rgba(210,11,28,.55)'; ctx.lineWidth=2; ctx.strokeRect(d.x,d.y,d.w,d.h);
    const moving = (d.open > .01 && d.open < .99) || d.timer > 0 || d.beacon > 0;
    if(moving){
      const blink = (Math.sin(performance.now()/95) > 0);
      const bx1 = d.x + d.w/2 - (d.w>=d.h ? 32 : 0);
      const by1 = d.y + d.h/2 - (d.w>=d.h ? 0 : 32);
      const bx2 = d.x + d.w/2 + (d.w>=d.h ? 32 : 0);
      const by2 = d.y + d.h/2 + (d.w>=d.h ? 0 : 32);
      ctx.fillStyle = blink ? 'rgba(255,35,35,.95)' : 'rgba(255,190,50,.85)';
      ctx.beginPath(); ctx.arc(bx1,by1,7,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx2,by2,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = blink ? 'rgba(255,0,0,.18)' : 'rgba(255,190,50,.14)';
      ctx.beginPath(); ctx.arc(bx1,by1,28,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx2,by2,28,0,Math.PI*2); ctx.fill();
    }
    for(const p of panels){
      const grad = ctx.createLinearGradient(p.x,p.y,p.x+(p.w||1),p.y+p.h);
      grad.addColorStop(0,'#6a6a6a'); grad.addColorStop(1,'#333');
      ctx.fillStyle=grad; ctx.fillRect(p.x,p.y,p.w,p.h);
      ctx.strokeStyle='#080808'; ctx.lineWidth=3; ctx.strokeRect(p.x,p.y,p.w,p.h);
      ctx.fillStyle='#d20b1c'; ctx.fillRect(p.x+p.w/2-2,p.y+8,4,Math.max(8,p.h-16));
    }
    ctx.restore();
  }
}
function drawBulletMarks(){
  for(const c of craters){
    ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(c.a); ctx.scale(1.25,.82);
    const g=ctx.createRadialGradient(0,0,4,0,0,c.r);
    g.addColorStop(0,c.wall?'rgba(0,0,0,.92)':'rgba(6,6,6,.95)');
    g.addColorStop(.45,c.wall?'rgba(38,38,38,.80)':'rgba(22,22,22,.86)');
    g.addColorStop(.74,'rgba(210,210,210,.22)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,c.r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(235,235,235,.20)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,c.r*.62,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=2;
    for(let i=0;i<9;i++){ const a=i*.7+c.seed; ctx.beginPath(); ctx.moveTo(Math.cos(a)*c.r*.18,Math.sin(a)*c.r*.18); ctx.lineTo(Math.cos(a)*c.r*(.45+((i%3)*.08)),Math.sin(a)*c.r*(.45+((i%3)*.08))); ctx.stroke(); }
    ctx.restore();
  }
  for(const bd of bloodDecals){
    ctx.save();
    ctx.translate(bd.x,bd.y);
    ctx.rotate(bd.a);
    ctx.scale(bd.stretch, 1);
    const yellow = bd.color === 'yellow';
    const baseDark = yellow ? (bd.onWall ? 'rgba(150,125,0,'+bd.alpha+')' : 'rgba(125,105,0,'+bd.alpha+')') : (bd.onWall ? 'rgba(110,6,6,'+bd.alpha+')' : 'rgba(96,0,0,'+bd.alpha+')');
    const baseMid = yellow ? (bd.onWall ? 'rgba(230,190,0,'+(bd.alpha*.55)+')' : 'rgba(210,170,0,'+(bd.alpha*.50)+')') : (bd.onWall ? 'rgba(160,18,18,'+(bd.alpha*.55)+')' : 'rgba(155,10,10,'+(bd.alpha*.50)+')');
    const baseHi = yellow ? (bd.onWall ? 'rgba(255,240,80,'+(bd.alpha*.22)+')' : 'rgba(255,220,40,'+(bd.alpha*.18)+')') : (bd.onWall ? 'rgba(215,45,45,'+(bd.alpha*.20)+')' : 'rgba(205,35,35,'+(bd.alpha*.16)+')');

    ctx.fillStyle = baseDark;
    ctx.beginPath();
    ctx.arc(0,0,bd.size*.55,0,Math.PI*2);
    for(let i=0;i<bd.lobes;i++){
      const aa = (i / Math.max(1, bd.lobes)) * Math.PI*2 + bd.seed*0.13;
      const rr = bd.size * (.30 + ((i%3)*.10));
      const ox = Math.cos(aa) * bd.size * (.36 + (i%2)*.10);
      const oy = Math.sin(aa) * bd.size * (.24 + ((i+1)%2)*.18);
      ctx.moveTo(ox+rr, oy);
      ctx.arc(ox, oy, rr, 0, Math.PI*2);
    }
    ctx.fill();

    ctx.fillStyle = baseMid;
    for(let i=0;i<Math.max(2, bd.lobes-1);i++){
      const aa = (i / Math.max(1, bd.lobes-1)) * Math.PI*2 + .6 + bd.seed*0.07;
      const ox = Math.cos(aa) * bd.size * .22;
      const oy = Math.sin(aa) * bd.size * .18;
      ctx.beginPath();
      ctx.arc(ox, oy, bd.size*(.10 + (i%2)*.06), 0, Math.PI*2);
      ctx.fill();
    }

    if(!bd.onWall){
      for(let i=0;i<bd.drips;i++){
        const ox = rand(-bd.size*.32, bd.size*.32);
        const top = bd.size * (.12 + i*.06);
        const len = bd.size * rand(.45,.95);
        ctx.fillStyle = baseDark;
        ctx.beginPath();
        ctx.moveTo(ox-top*.16, top*.1);
        ctx.quadraticCurveTo(ox-top*.26, len*.38, ox, len);
        ctx.quadraticCurveTo(ox+top*.28, len*.42, ox+top*.12, top*.05);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      for(let i=0;i<bd.drips;i++){
        const sx = bd.size * (.15 + i*.12);
        const sy = rand(-bd.size*.18, bd.size*.18);
        const len = bd.size * rand(.35,.8);
        ctx.strokeStyle = baseDark;
        ctx.lineWidth = 1.2 + Math.random()*1.4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + len, sy + rand(-bd.size*.12, bd.size*.12));
        ctx.stroke();
      }
    }

    ctx.fillStyle = baseHi;
    ctx.beginPath();
    ctx.arc(-bd.size*.14,-bd.size*.08,bd.size*.18,0,Math.PI*2);
    ctx.arc(bd.size*.12,bd.size*.10,bd.size*.10,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  for(const m of bulletMarks){
    ctx.save(); ctx.translate(m.x,m.y); ctx.rotate(m.a);
    ctx.fillStyle='rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(0,0,m.size,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.13)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-m.size-2,0); ctx.lineTo(m.size+2,0); ctx.moveTo(0,-m.size-2); ctx.lineTo(0,m.size+2); ctx.stroke();
    ctx.restore();
  }
}
function drawPickups(){
  for(const p of pickups){
    ctx.save(); ctx.translate(p.x,p.y);
    ctx.shadowColor='#d20b1c'; ctx.shadowBlur=8;
    ctx.fillStyle=p.type==='ammo'?'#1b1b1b':'#d9d9d9';
    ctx.strokeStyle='#000'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.rect(-13,-10,26,20); ctx.fill(); ctx.stroke();
    ctx.shadowBlur=0; ctx.strokeStyle='#d20b1c'; ctx.lineWidth=3;
    if(p.type==='ammo') { ctx.beginPath(); ctx.moveTo(-6,6); ctx.lineTo(-6,-6); ctx.moveTo(2,6); ctx.lineTo(2,-6); ctx.moveTo(8,6); ctx.lineTo(8,-6); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(8,0); ctx.moveTo(0,-8); ctx.lineTo(0,8); ctx.stroke(); }
    ctx.restore();
  }
}
function drawPlayer(){
  ctx.save();
  ctx.translate(player.x,player.y);
  ctx.rotate(player.ang - Math.PI/2);

  const bob = player.moving ? Math.sin(player.walk) * 2.6 : 0;
  const sway = player.moving ? Math.sin(player.walk * 0.5) * 0.03 : 0;
  ctx.rotate(sway);

  if(playerSpriteReady){
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch(e) {}
    ctx.filter = player.hiddenInShadow ? 'brightness(0.10) contrast(1.35) saturate(.25)' : 'brightness(0.40) contrast(1.18) saturate(.78)';
    ctx.drawImage(playerSprite, -74, -74 + bob, 148, 148);
    ctx.filter='none';
  } else {
    ctx.fillStyle='#d9d9d9'; ctx.strokeStyle='#000'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(0,-6 + bob,28,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,28 + bob,28,34,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }

  for(const bm of (player.blood || [])){
    ctx.save();
    ctx.translate(bm.x, bm.y + bob);
    ctx.rotate(bm.a);
    ctx.scale(bm.s, 1);
    ctx.fillStyle='rgba(150,8,8,.88)';
    ctx.beginPath();
    ctx.arc(0,0,bm.r*.44,0,Math.PI*2);
    ctx.arc(bm.r*.38,-bm.r*.12,bm.r*.30,0,Math.PI*2);
    ctx.arc(-bm.r*.26,bm.r*.18,bm.r*.24,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  if(player.muzzleFx > 0){
    const p = clamp(player.muzzleFx / .1, 0, 1);
    const my = 63 + bob;
    const mx = 0;
    const g = ctx.createRadialGradient(mx, my, 1, mx, my, 26 + (1-p)*18);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.54*p) + ')');
    g.addColorStop(.32, 'rgba(255,240,210,' + (0.30*p) + ')');
    g.addColorStop(.75, 'rgba(235,235,235,' + (0.13*p) + ')');
    g.addColorStop(1, 'rgba(220,220,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, 26 + (1-p)*18, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle='rgba(255,250,235,'+(0.55*p)+')';
    ctx.beginPath();
    ctx.moveTo(mx, my-6);
    ctx.lineTo(mx-10, my+14);
    ctx.lineTo(mx, my+44 + (1-p)*12);
    ctx.lineTo(mx+10, my+14);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle='rgba(235,235,235,'+(0.22*p)+')';
    ctx.beginPath(); ctx.arc(mx-10, my+7, 10 + (1-p)*6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx+10, my+6, 9 + (1-p)*6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx, my+17, 13 + (1-p)*9, 0, Math.PI*2); ctx.fill();
  }

  ctx.restore();
}
function drawEnemy(e){
  ctx.save();

  const deadT = e.hp <= 0 ? clamp((e.corpseAnim||0) / (e.corpseAnimMax||.24), 0, 1) : 0;
  const dx = (e.corpseDX||0) * deadT;
  const dy = (e.corpseDY||0) * deadT;
  const drot = (e.corpseRot||0) * deadT;
  ctx.translate(e.x + dx, e.y + dy);
  ctx.rotate((e.ang - Math.PI/2) + drot);
  if(e.hp<=0 && corpseFastRender){
    ctx.fillStyle='rgba(0,0,0,.78)';
    ctx.beginPath();
    ctx.ellipse(0,10,24,43,0,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle=(e.bloodColor==='yellow')?'rgba(135,112,0,.45)':'rgba(60,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(0,28,20,9,.2,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if(e.hp > 0 && e.state==='engage'){
    ctx.fillStyle='rgba(210,11,28,.13)';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,110,-.35,.35); ctx.closePath(); ctx.fill();
  }

  const si = Number.isInteger(e.spriteIndex) ? e.spriteIndex : 0;
  const img = enemySprites[si] || enemySprites[0];
  const ready = enemySpritesReady[si] || enemySpritesReady[0];
  if(ready && img){
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch(e2) {}
    ctx.filter = e.hp > 0 ? 'brightness(1.18) contrast(1.05)' : 'grayscale(1) brightness(0.11) contrast(1.12)';
    ctx.drawImage(img, -74, -74, 148, 148);
    ctx.filter = 'none';

    // krev na sprite - cákance místo jednoduchých kruhů
    for(const bm of (e.blood || [])){
      ctx.save();
      ctx.translate(bm.x, bm.y);
      ctx.rotate(bm.a);
      ctx.scale(bm.s, 1);
      const yb = (bm.color || e.bloodColor) === 'yellow';
      ctx.fillStyle = yb ? (e.hp > 0 ? 'rgba(225,190,0,.92)' : 'rgba(130,105,0,.86)') : (e.hp > 0 ? 'rgba(165,8,8,.92)' : 'rgba(75,4,4,.86)');
      ctx.beginPath();
      ctx.arc(0,0,bm.r*.46,0,Math.PI*2);
      ctx.arc(bm.r*.42,-bm.r*.12,bm.r*.34,0,Math.PI*2);
      ctx.arc(-bm.r*.34,bm.r*.18,bm.r*.28,0,Math.PI*2);
      ctx.arc(bm.r*.08,bm.r*.42,bm.r*.24,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = yb ? (e.hp > 0 ? 'rgba(155,130,0,.52)' : 'rgba(90,70,0,.44)') : (e.hp > 0 ? 'rgba(130,0,0,.52)' : 'rgba(55,0,0,.44)');
      ctx.lineWidth = Math.max(.8,bm.r*.08);
      ctx.beginPath();
      ctx.moveTo(bm.r*.28,bm.r*.05); ctx.lineTo(bm.r*.72,bm.r*.20);
      ctx.moveTo(-bm.r*.18,bm.r*.18); ctx.lineTo(-bm.r*.48,bm.r*.52);
      ctx.stroke();
      ctx.fillStyle = yb ? (e.hp > 0 ? 'rgba(255,240,50,.22)' : 'rgba(160,130,0,.16)') : (e.hp > 0 ? 'rgba(235,46,46,.22)' : 'rgba(115,18,18,.16)');
      ctx.beginPath(); ctx.arc(-bm.r*.12,-bm.r*.06,bm.r*.14,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.fillStyle=e.type==='armored'?'#777':'#d7d7d7'; ctx.strokeStyle='#050505'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.ellipse(0,0,17,22,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }

  if(e.hp > 0 && e.muzzleFx > 0){
    const p = clamp(e.muzzleFx / .09, 0, 1);
    const mx = 0, my = 56;
    const g = ctx.createRadialGradient(mx,my,1,mx,my,20 + (1-p)*16);
    g.addColorStop(0,'rgba(255,255,255,'+(0.48*p)+')');
    g.addColorStop(.35,'rgba(255,240,210,'+(0.25*p)+')');
    g.addColorStop(1,'rgba(255,240,210,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(mx,my,20 + (1-p)*16,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,248,230,'+(0.44*p)+')';
    ctx.beginPath(); ctx.moveTo(mx,my-4); ctx.lineTo(mx-8,my+11); ctx.lineTo(mx,my+34+(1-p)*10); ctx.lineTo(mx+8,my+11); ctx.closePath(); ctx.fill();
  }

  if(e.hp > 0){
    ctx.rotate(Math.PI/2 - e.ang - drot);
    const bw = 64, bh = 8;
    const hpw = bw*(e.hp/e.maxHp);
    ctx.fillStyle='#111'; ctx.fillRect(-bw/2,-62,bw,bh);
    ctx.fillStyle='#d20b1c'; ctx.fillRect(-bw/2,-62,hpw,bh);
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(-bw/2,-62,bw,bh);
  }

  ctx.restore();
}
function drawGrenades(){
  for(const g of grenades){
    ctx.save(); ctx.translate(g.x,g.y-g.z); ctx.rotate(g.ang);
    ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(4,g.z+9,13,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1d2c1e'; ctx.strokeStyle='#dedede'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,0,10,14,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.fillRect(-5,-17,10,8);
    ctx.restore();
  }
}
function drawExplosions(){
  for(const e of explosions){
    const p=clamp(e.t/e.max,0,1), rr=e.r*(.45+p*.20);
    ctx.save(); ctx.translate(e.x,e.y); ctx.globalAlpha=p;
    const g=ctx.createRadialGradient(0,0,3,0,0,rr);
    g.addColorStop(0,'rgba(255,255,255,.90)');
    g.addColorStop(.22,'rgba(210,210,210,.58)');
    g.addColorStop(.56,'rgba(0,0,0,.62)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;
    ctx.beginPath();
    const spikes=18;
    for(let i=0;i<spikes;i++){
      const a=i/spikes*Math.PI*2;
      const r=rr*rand(.45,1.0);
      const x=Math.cos(a)*r, y=Math.sin(a)*r;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawBullets(){
  ctx.save(); ctx.lineCap='round';
  for(const b of bullets){
    ctx.strokeStyle=b.owner==='p'?'#f3f3f3':'#d20b1c'; ctx.lineWidth=b.owner==='p'?3:2;
    ctx.beginPath(); ctx.moveTo(b.px,b.py); ctx.lineTo(b.x,b.y); ctx.stroke();
  }
  ctx.restore();
}
function drawParticles(){
  for(const p of particles){
    const a = clamp(p.life/p.max,0,1);
    ctx.globalAlpha = a;
    if(p.kind==='blood') ctx.fillStyle='#8d0610';
    else if(p.kind==='dust') ctx.fillStyle='#1f1f1f';
    else if(p.kind==='wood') ctx.fillStyle='rgba(146,92,42,.95)';
    else if(p.kind==='metalchip') ctx.fillStyle='rgba(180,180,170,.95)';
    else if(p.kind==='yellowblood') ctx.fillStyle='rgba(225,195,0,.95)';
    else if(p.kind==='smoke'){
      ctx.fillStyle='rgba(205,205,205,.42)';
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size + (1-a)*9,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
      continue;
    }
    else ctx.fillStyle='rgba(245,245,245,.95)';
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
  }
}
function drawLighting(){
  if(gameMode==='lobby'){
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,.10)';
    ctx.fillRect(0,0,W,H);
    ctx.restore();
    return;
  }
  ctx.save();
  const px = player.x - camera.x, py = player.y - camera.y;
  const wx = player.x, wy = player.y;
  const a = player.ang;
  const blinkMul = flashlightBlink > 0 ? .12 : 1;
  const flicker = (.96 + Math.sin(performance.now()/49)*.018 + Math.sin(performance.now()/97)*.010) * blinkMul;
  const len = flashlightOn ? ((keys[' '] ? 770 : 690) * flicker) : 34;
  const width = flashlightOn ? (keys[' '] ? .50 : .44) : .08;
  const rayCount = 42;

  ctx.fillStyle='rgba(0,0,0,.76)';
  ctx.fillRect(0,0,W,H);
  ctx.globalCompositeOperation='destination-out';

  // tiny body aura
  const aura = ctx.createRadialGradient(px,py,4,px,py,26);
  aura.addColorStop(0,'rgba(255,255,255,.78)');
  aura.addColorStop(.55,'rgba(255,255,255,.32)');
  aura.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=aura;
  ctx.beginPath(); ctx.arc(px,py,50,0,Math.PI*2); ctx.fill();

  // rare small ambient lights
  for(const l of ambientLights){
    const lx=l.x-camera.x, ly=l.y-camera.y;
    const g=ctx.createRadialGradient(lx,ly,3,lx,ly,l.r);
    g.addColorStop(0,'rgba(255,244,210,'+(l.a*2.4)+')');
    g.addColorStop(.45,'rgba(255,235,180,'+(l.a*1.35)+')');
    g.addColorStop(1,'rgba(255,235,180,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(lx,ly,l.r,0,Math.PI*2); ctx.fill();
  }

  // player flashlight cone blocked by walls
  const pts=[];
  for(let i=0;i<=rayCount;i++){
    const ra=a-width+(i/rayCount)*width*2;
    const d=castLightDistance(wx,wy,ra,len);
    pts.push({x:px+Math.cos(ra)*d,y:py+Math.sin(ra)*d});
  }
  if(flashlightOn){
    const beam=ctx.createRadialGradient(px,py,14,px,py,Math.max(35,len));
    beam.addColorStop(0,'rgba(255,255,255,.96)');
    beam.addColorStop(.20,'rgba(255,255,255,.78)');
    beam.addColorStop(.62,'rgba(255,255,255,.33)');
    beam.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=beam;
    ctx.beginPath(); ctx.moveTo(px,py); for(const pt of pts) ctx.lineTo(pt.x,pt.y); ctx.closePath(); ctx.fill();
  }

  // teammate flashlights - stejně viditelná baterka jako u hráče
  if(online.active){
    for(const op of Object.values(online.remotePlayers)){
      if(!op || op.gameMode !== gameMode || Date.now() - (op.lastSeen||0) > 6000) continue;
      const ox = Number.isFinite(op.rx) ? op.rx : op.x;
      const oy = Number.isFinite(op.ry) ? op.ry : op.y;
      const oa = op.ang || 0;
      const sx = ox - camera.x, sy = oy - camera.y;
      const oLen = 690, oWidth = .44, rc = 26;
      const oPts = [];
      for(let i=0;i<=rc;i++){
        const ra = oa-oWidth+(i/rc)*oWidth*2;
        const d = castLightDistance(ox,oy,ra,oLen);
        oPts.push({x:sx+Math.cos(ra)*d,y:sy+Math.sin(ra)*d});
      }
      const oaura = ctx.createRadialGradient(sx,sy,4,sx,sy,32);
      oaura.addColorStop(0,'rgba(255,255,255,.70)');
      oaura.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=oaura; ctx.beginPath(); ctx.arc(sx,sy,42,0,Math.PI*2); ctx.fill();
      const og=ctx.createRadialGradient(sx,sy,14,sx,sy,oLen);
      og.addColorStop(0,'rgba(255,255,255,.84)');
      og.addColorStop(.22,'rgba(255,255,255,.58)');
      og.addColorStop(.62,'rgba(255,255,255,.24)');
      og.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=og;
      ctx.beginPath(); ctx.moveTo(sx,sy); for(const pt of oPts) ctx.lineTo(pt.x,pt.y); ctx.closePath(); ctx.fill();
    }
  }

  const redCones = [];
  // enemy flashlights - vidíš je jen pokud enemy reálně spotneš
  for(const e of enemies){
    if(e.hp <= 0 || !playerIlluminatesEnemy(e)) continue;
    const ex=e.x-camera.x, ey=e.y-camera.y;
    const eLen = 690;
    const eWidth = .44;
    const ePts=[]; const rc=20;
    for(let i=0;i<=rc;i++){
      const ra=e.ang-eWidth+(i/rc)*eWidth*2;
      const d=castLightDistance(e.x,e.y,ra,eLen);
      ePts.push({x:ex+Math.cos(ra)*d,y:ey+Math.sin(ra)*d});
    }
    redCones.push({x:ex,y:ey,len:eLen,pts:ePts,strong:e.state==='engage'});
    const cut=ctx.createRadialGradient(ex,ey,10,ex,ey,eLen);
    cut.addColorStop(0,'rgba(255,255,255,.46)');
    cut.addColorStop(.46,'rgba(255,255,255,.16)');
    cut.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=cut;
    ctx.beginPath(); ctx.moveTo(ex,ey); for(const pt of ePts) ctx.lineTo(pt.x,pt.y); ctx.closePath(); ctx.fill();
  }

  const sensorCones = [];
  // kamera má vlastní kužel, ale vidíš ho jen pokud kameru skutečně osvítíš / vidíš teď
  for(const c of cameras){
    if(c.hp <= 0 || !playerSeesDevice(c)) continue;
    const co=sensorOrigin(c.x,c.y,c.ang,22);
    const cx=co.x-camera.x, cy=co.y-camera.y;
    const cLen = 720, cWidth = .38;
    const cPts=[]; const rc=16;
    for(let i=0;i<=rc;i++){
      const ra=c.ang-cWidth+(i/rc)*cWidth*2;
      const d=castLightDistance(co.x,co.y,ra,cLen);
      cPts.push({x:cx+Math.cos(ra)*d,y:cy+Math.sin(ra)*d});
    }
    const cg=ctx.createRadialGradient(cx,cy,4,cx,cy,cLen*.75);
    cg.addColorStop(0,c.spotted?'rgba(255,40,40,.58)':'rgba(255,40,40,.32)');
    cg.addColorStop(.35,c.spotted?'rgba(255,0,0,.34)':'rgba(210,0,0,.18)');
    cg.addColorStop(1,'rgba(210,0,0,0)');
    ctx.fillStyle=cg;
    ctx.beginPath(); ctx.moveTo(cx,cy); for(const pt of cPts) ctx.lineTo(pt.x,pt.y); ctx.closePath(); ctx.fill();
    sensorCones.push({x:cx,y:cy,len:cLen,pts:cPts,spotted:c.spotted});
  }

  // turret má taky dohledový kužel, ale nezobrazuje se jen podle prozkoumané mapy
  for(const t of turrets){
    if(t.hp <= 0 || !playerSeesDevice(t)) continue;
    const to=sensorOrigin(t.x,t.y,t.ang,28);
    const tx=to.x-camera.x, ty=to.y-camera.y;
    const tLen = 690, tWidth = .44;
    const tPts=[]; const rc=16;
    for(let i=0;i<=rc;i++){
      const ra=t.ang-tWidth+(i/rc)*tWidth*2;
      const d=castLightDistance(to.x,to.y,ra,tLen);
      tPts.push({x:tx+Math.cos(ra)*d,y:ty+Math.sin(ra)*d});
    }
    const tg=ctx.createRadialGradient(tx,ty,10,tx,ty,tLen*.75);
    tg.addColorStop(0,t.spotted?'rgba(255,55,55,.58)':'rgba(255,55,55,.32)');
    tg.addColorStop(.35,t.spotted?'rgba(255,0,0,.34)':'rgba(210,0,0,.18)');
    tg.addColorStop(1,'rgba(210,0,0,0)');
    ctx.fillStyle=tg;
    ctx.beginPath(); ctx.moveTo(tx,ty); for(const pt of tPts) ctx.lineTo(pt.x,pt.y); ctx.closePath(); ctx.fill();
    sensorCones.push({x:tx,y:ty,len:tLen,pts:tPts,spotted:t.spotted});
  }

  ctx.globalCompositeOperation='source-over';
  for(const s of sensorCones){
    const sg=ctx.createRadialGradient(s.x,s.y,8,s.x,s.y,s.len);
    sg.addColorStop(0,s.spotted?'rgba(255,0,0,.34)':'rgba(255,0,0,.22)');
    sg.addColorStop(.42,s.spotted?'rgba(210,0,0,.22)':'rgba(180,0,0,.14)');
    sg.addColorStop(1,'rgba(130,0,0,0)');
    ctx.fillStyle=sg;
    ctx.beginPath(); ctx.moveTo(s.x,s.y); for(const pt of s.pts) ctx.lineTo(pt.x,pt.y); ctx.closePath(); ctx.fill();
  }
  for(const c of redCones){
    const cone=ctx.createRadialGradient(c.x,c.y,10,c.x,c.y,c.len);
    cone.addColorStop(0,c.strong?'rgba(255,0,0,.46)':'rgba(255,0,0,.36)');
    cone.addColorStop(.24,c.strong?'rgba(230,0,0,.30)':'rgba(210,0,0,.24)');
    cone.addColorStop(.70,'rgba(150,0,0,.16)');
    cone.addColorStop(1,'rgba(150,0,0,0)');
    ctx.fillStyle=cone;
    ctx.beginPath(); ctx.moveTo(c.x,c.y); for(const pt of c.pts) ctx.lineTo(pt.x,pt.y); ctx.closePath(); ctx.fill();
  }

  // gunshot local flash
  if(player.muzzleFx > 0){
    const md = weaponDefs[player.weaponType]?.muzzleDist || 64;
    const mx = px + Math.cos(a)*md, my = py + Math.sin(a)*md;
    const r = 115 * clamp(player.muzzleFx/.1,0,1);
    const g = ctx.createRadialGradient(mx,my,3,mx,my,r);
    g.addColorStop(0,'rgba(255,255,255,.78)');
    g.addColorStop(.35,'rgba(255,255,255,.24)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mx,my,r,0,Math.PI*2); ctx.fill();
  }

  ctx.globalCompositeOperation='source-over';
  if(flashlightOn){
    const glow=ctx.createRadialGradient(px,py,10,px,py,Math.max(35,len));
    glow.addColorStop(0,'rgba(255,255,255,.08)');
    glow.addColorStop(.42,'rgba(255,255,255,.035)');
    glow.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=glow;
    ctx.beginPath(); ctx.moveTo(px,py); for(const pt of pts) ctx.lineTo(pt.x,pt.y); ctx.closePath(); ctx.fill();

    ctx.strokeStyle='rgba(255,255,255,.07)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(pts[0].x,pts[0].y); ctx.moveTo(px,py); ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y); ctx.stroke();
  }
  ctx.restore();
}
function drawPlayerLabels(){
  const level = player.level;
  const bw = 64, bh = 8;
  const x = player.x - bw/2 - camera.x;
  const y = player.y - 62 - camera.y;
  ctx.save();

  ctx.fillStyle='#111';
  ctx.fillRect(x,y,bw,bh);
  ctx.fillStyle='#d20b1c';
  ctx.fillRect(x,y,bw*(player.hp/player.maxHp),bh);
  ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(x,y,bw,bh);

  if(player.reload > 0 && player.reloadMax > 0){
    const ry = y + 12;
    const prog = clamp(1 - player.reload/player.reloadMax, 0, 1);
    ctx.fillStyle='#0d1710'; ctx.fillRect(x,ry,bw,bh);
    ctx.fillStyle='#18c85a'; ctx.fillRect(x,ry,bw*prog,bh);
    ctx.strokeStyle='#bdfccc'; ctx.strokeRect(x,ry,bw,bh);
  }

  ctx.font='13px Impact'; ctx.textAlign='center';
  ctx.fillStyle='#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=3;
  const label = (getPlayerNick() || online.playerName || playerNick) + '  LVL ' + level;
  ctx.strokeText(label, player.x - camera.x, y-6);
  ctx.fillText(label, player.x - camera.x, y-6);
  ctx.textAlign='left';
  ctx.restore();
}

function drawInventoryBar(){
  if(state!=='play') return;
  const size=78, gap=18, x=W/2 - size - gap/2, y=H-104;
  ctx.save();
  ctx.textAlign='center';
  for(let i=0;i<2;i++){
    const sx=x+i*(size+gap);
    const key=player.loadoutSlots[i];
    const sel=i===player.selectedSlot;
    ctx.fillStyle='rgba(0,0,0,.86)';
    ctx.strokeStyle=sel?'#ffe07a':'#d20b1c';
    ctx.lineWidth=sel?5:3;
    ctx.fillRect(sx,y,size,size);
    ctx.strokeRect(sx,y,size,size);
    ctx.strokeStyle='rgba(255,255,255,.13)';
    ctx.lineWidth=1;
    for(let t=1;t<4;t++){
      ctx.beginPath(); ctx.moveTo(sx+t*size/4,y); ctx.lineTo(sx+t*size/4,y+size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx,y+t*size/4); ctx.lineTo(sx+size,y+t*size/4); ctx.stroke();
    }
    if(key && loadoutDefs[key]){
      const d=loadoutDefs[key];
      if(d.ready && d.imgPath) ctx.drawImage(d.img,sx+8,y+10,size-16,40); else drawItemIcon(key,sx+8,y+8,size-16,45);
      ctx.font='15px Impact'; ctx.fillStyle='#fff';
      ctx.fillText(d.name,sx+size/2,y+59);
      const st = key===player.weaponType ? {ammo:player.ammo,reserve:player.reserve} : (player.weaponState[key]||{ammo:weaponDefs[key].clip,reserve:weaponDefs[key].reserve});
      ctx.font='12px Arial Black'; ctx.fillStyle='rgba(255,255,255,.70)';
      ctx.fillText(key==='grenade' ? ((st.ammo|0)+' ks') : ((st.ammo|0)+'/'+(st.reserve|0)),sx+size/2,y+73);
    } else {
      ctx.font='30px Impact'; ctx.fillStyle='rgba(255,255,255,.35)';
      ctx.fillText('+',sx+size/2,y+48);
    }
  }
  ctx.font='12px Arial Black'; ctx.fillStyle='rgba(255,255,255,.55)';
  ctx.fillText('+ / Ě PŘEPNOUT',W/2,y-12);
  ctx.restore();
}
function drawHUD(){
  ctx.save();
  // levý horní roh: zásobník + počet kulí
  ctx.fillStyle='rgba(0,0,0,.9)'; ctx.strokeStyle='#d20b1c'; ctx.lineWidth=3;
  ctx.fillRect(18,18,170,64); ctx.strokeRect(18,18,170,64);
  // jednoduchá ikonka zásobníku
  ctx.fillStyle='#1b1b1b'; ctx.strokeStyle='#bdbdbd'; ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(34,28); ctx.lineTo(64,28); ctx.lineTo(70,62); ctx.lineTo(40,62); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle='#444'; ctx.fillRect(45,62,12,8);
  const ammoNow = player.weaponType==='grenade' ? String(player.ammo) : String(player.ammo);
  const ammoRes = player.weaponType==='grenade' ? 'ks' : ('/ ' + String(player.reserve));
  ctx.font='26px Impact'; ctx.fillStyle='#fff';
  ctx.fillText(ammoNow, 88, 48);
  ctx.font='20px Impact'; ctx.fillStyle='#cfcfcf';
  ctx.fillText(ammoRes, 120, 48);
  ctx.font='12px Arial'; ctx.fillStyle='rgba(255,255,255,.6)';
  ctx.fillText('AMMO', 88, 66);
  if(player.pickupText){
    ctx.font='24px Impact'; ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=5;
    ctx.strokeText(player.pickupText,W/2,H-92); ctx.fillText(player.pickupText,W/2,H-92);
    ctx.textAlign='left';
  }
  // main menu ponechat
  ctx.fillStyle='rgba(0,0,0,.9)'; ctx.strokeStyle='#d20b1c'; ctx.lineWidth=4;
  ctx.fillRect(1090,8,150,42); ctx.strokeRect(1090,8,150,42);
  ctx.font='24px Impact'; ctx.fillStyle='#fff'; ctx.fillText('MAIN MENU',1110,37);

  drawMinimap();
  drawInventoryBar();
  ctx.restore();
}
function drawPortrait(){
  if(playerSpriteReady){
    ctx.save();
    ctx.beginPath(); ctx.arc(0,0,34,0,Math.PI*2); ctx.clip();
    ctx.drawImage(playerSprite, -36, -36, 72, 72);
    ctx.restore();
    ctx.strokeStyle='#000'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,34,0,Math.PI*2); ctx.stroke();
    return;
  }
  ctx.fillStyle='#171717'; ctx.strokeStyle='#000'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(0,0,32,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(-3,-1,28,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#d20b1c'; ctx.shadowColor='#d20b1c'; ctx.shadowBlur=8;
  ctx.beginPath(); ctx.arc(8,-7,5,0,Math.PI*2); ctx.arc(8,7,5,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0; ctx.strokeStyle='#505050'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(-22,-17); ctx.lineTo(-39,-30); ctx.moveTo(-22,17); ctx.lineTo(-38,31); ctx.stroke();
}
function drawMinimap(){
  const mw=210,mh=132,x=W-mw-18,y=H-mh-18;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.76)';
  ctx.strokeStyle='rgba(210,11,28,.85)';
  ctx.lineWidth=2;
  ctx.fillRect(x,y,mw,mh);
  ctx.strokeRect(x,y,mw,mh);
  ctx.fillStyle='rgba(255,255,255,.03)';
  ctx.fillRect(x+4,y+4,mw-8,mh-8);
  const sx=mw/map.w, sy=mh/map.h;

  if(fog.seen.length){
    for(let cy=0; cy<fog.rows; cy++){
      for(let cx=0; cx<fog.cols; cx++){
        if(!fog.seen[fogIndex(cx,cy)]) continue;
        const wx = cx*fog.cell + fog.cell/2;
        const wy = cy*fog.cell + fog.cell/2;
        ctx.fillStyle = pointInWall(wx,wy) ? 'rgba(130,130,130,.75)' : 'rgba(42,42,42,.95)';
        ctx.fillRect(x+cx*fog.cell*sx, y+cy*fog.cell*sy, Math.ceil(fog.cell*sx)+1, Math.ceil(fog.cell*sy)+1);
      }
    }
  }
  ctx.strokeStyle='rgba(255,255,255,.16)';
  ctx.lineWidth=1;
  ctx.strokeRect(x+camera.x*sx,y+camera.y*sy,W*sx,H*sy);

  ctx.fillStyle='#ff2a2a';
  ctx.beginPath(); ctx.arc(x+player.x*sx,y+player.y*sy,3.2,0,Math.PI*2); ctx.fill();
  ctx.font='9px Arial Black'; ctx.fillStyle='rgba(255,255,255,.62)';
  ctx.fillText('MAPA',x+8,y+13);
  ctx.restore();
}
function drawMessage(){
  if(messageTimer>0){
    ctx.save(); ctx.globalAlpha=clamp(messageTimer,0,1);
    ctx.font='76px Impact'; ctx.textAlign='center'; ctx.strokeStyle='#000'; ctx.lineWidth=8; ctx.fillStyle='#d20b1c';
    ctx.strokeText(message,W/2,H/2-60); ctx.fillText(message,W/2,H/2-60); ctx.textAlign='left'; ctx.restore();
  }
}
function drawDead(){
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.70)';
  ctx.fillRect(0,0,W,H);
  ctx.textAlign='center';

  ctx.font='82px Impact';
  ctx.strokeStyle='#000';
  ctx.lineWidth=9;
  ctx.fillStyle='#d20b1c';
  ctx.strokeText('KONEC',W/2,225);
  ctx.fillText('KONEC',W/2,225);

  ctx.font='25px Impact';
  ctx.lineWidth=5;
  ctx.fillStyle='#fff';
  const xpTxt = player.level >= 10 ? 'XP MAX' : ('XP ' + player.levelXp + '/' + player.nextLevelXp);
  const stat1 = 'SKÓRE: ' + player.score + '   KILLY: ' + player.kills;
  const stat2 = 'CELKEM KILLŮ: ' + player.totalKills + '   LVL ' + player.level + '   ' + xpTxt;
  ctx.strokeText(stat1,W/2,290);
  ctx.fillText(stat1,W/2,290);
  ctx.strokeText(stat2,W/2,325);
  ctx.fillText(stat2,W/2,325);

  drawButton(W/2-125,380,250,58,'ZNOVU', true);
  drawButton(W/2-125,455,250,58,'MENU', true);
  ctx.textAlign='left';
  ctx.restore();
}
function drawMenu(){
  ctx.save();
  makeTextures();
  ctx.fillStyle='#070707'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=textures.floor; ctx.fillRect(118,88,1045,485); ctx.strokeStyle='#000'; ctx.lineWidth=5; ctx.strokeRect(118,88,1045,485);
  ctx.fillStyle='rgba(0,0,0,.68)'; ctx.fillRect(0,0,W,H);

  ctx.font='82px Impact'; ctx.textAlign='center'; ctx.strokeStyle='#000'; ctx.lineWidth=10; ctx.fillStyle='#e6e6e6';
  ctx.strokeText('PROJEKT SAS',W/2,170); ctx.fillText('PROJEKT SAS',W/2,170);

  if(menuStep==='main'){
    drawButton(W/2-170,315,340,64,'HRÁT HRU', true);
    ctx.font='16px Arial Black';
    ctx.fillStyle='rgba(255,255,255,.58)';
    ctx.textAlign='left';
    ctx.fillText('Verze 0.1',22,H-18);
    ctx.textAlign='right';
    ctx.fillText('LukEngine',W-22,H-18);
    ctx.textAlign='center';
  } else if(menuStep==='find'){
    drawButton(W/2-190,330,380,58,'NAJÍT HRU', true);
    drawButton(W/2-190,405,380,58,'VYTVOŘIT', true);
  } else if(menuStep==='online_search'){
    ctx.font='30px Impact'; ctx.fillStyle='#fff'; ctx.fillText('ONLINE MÍSTNOSTI',W/2,245);
    ctx.font='16px Arial Black'; ctx.fillStyle='#aaa';
    ctx.fillText(online.rooms.length ? 'Vyber místnost' : 'Čekám na vytvořenou hru...',W/2,275);
    const list = online.rooms.slice(0,4);
    for(let i=0;i<list.length;i++){
      const r = list[i];
      drawButton(W/2-250,310+i*62,500,52,(r.code||'ROOM')+'  '+(r.host||'HOST')+'  '+(r.players||1)+'/2',true);
    }
    drawButton(W/2-190,590,380,48,'ZPĚT', true);
  } else if(menuStep==='searching'){
    ctx.font='34px Impact'; ctx.fillStyle='#fff'; ctx.fillText('HLEDÁM LOKÁLNĚ...',W/2,335);
    ctx.font='18px Arial Black'; ctx.fillStyle='#aaa'; ctx.fillText('čekám na lokální lobby',W/2,372);
  } else if(menuStep==='lobby'){
    ctx.font='28px Impact'; ctx.fillStyle='#fff'; ctx.fillText('LOBBY',W/2,260);
    ctx.font='18px Arial Black'; ctx.fillStyle='#aaa'; ctx.fillText(roomCreated ? 'Místnost vytvořena: 1/1' : 'Žádná místnost',W/2,300);
    drawButton(W/2-180,335,360,58,'VYTVOŘIT LOBBY', true);
    drawButton(W/2-180,410,360,58,'HRÁT', roomCreated);
    drawButton(W/2-180,485,360,48,'ZPĚT', true);
  } else if(menuStep==='mapselect'){
    ctx.font='28px Impact'; ctx.fillStyle='#fff'; ctx.fillText('VYBER MAPU',W/2,270);
    drawButton(W/2-190,340,380,64,'NOIR FACTORY', true);
    drawButton(W/2-190,425,380,48,'ZPĚT DO LOBBY', true);
  }

  ctx.textAlign='left';
  ctx.restore();
}
function drawButton(x,y,w,h,text,active){
  ctx.fillStyle=active?'rgba(0,0,0,.88)':'rgba(30,30,30,.8)'; ctx.strokeStyle='#d20b1c'; ctx.lineWidth=4;
  ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
  ctx.font='30px Impact'; ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.fillText(text,x+w/2,y+h/2+11); ctx.textAlign='left';
}

function loop(now){
  const dt = Math.min(.04,(now-last)/1000); last=now;
  toWorld(); update(dt); draw();
}

function menuClick(x,y){
  const cx = x, cy = y;
  function inb(bx,by,bw,bh){ return cx>=bx&&cx<=bx+bw&&cy>=by&&cy<=by+bh; }

  if(state==='menu'){
    if(menuStep==='main'){
      if(inb(W/2-170,315,340,64)){ menuStep='find'; }
    } else if(menuStep==='find'){
      if(inb(W/2-190,330,380,58)){ initAudio(); openOnlineSearch(); }
      if(inb(W/2-190,405,380,58)){ initAudio(); createOnlineRoom(); }
    } else if(menuStep==='online_search'){
      const list = online.rooms.slice(0,4);
      for(let i=0;i<list.length;i++){
        if(inb(W/2-250,310+i*62,500,52)){ initAudio(); joinOnlineRoom(list[i]); return; }
      }
      if(inb(W/2-190,590,380,48)){ menuStep='find'; }
    } else if(menuStep==='lobby'){
      if(inb(W/2-180,335,360,58)){ roomCreated=true; initAudio(); enterLobby(); }
      if(roomCreated && inb(W/2-180,410,360,58)){ initAudio(); enterLobby(); }
      if(inb(W/2-180,485,360,48)){ menuStep='find'; }
    } else if(menuStep==='mapselect'){
      if(inb(W/2-190,340,380,64)){ initAudio(); startMissionFromLobby(); }
      if(inb(W/2-190,425,380,48)){ menuStep='lobby'; }
    }
  } else if(state==='dead'){
    if(inb(W/2-125,370,250,58)){ resetGame(); state='play'; }
    if(inb(W/2-125,445,250,58)){ state='menu'; menuStep='main'; }
  } else if(state==='play'){
    if(gameMode==='lobby' && lobbyUi){
      if(lobbyUi==='missions' && inb(W/2-205,280,410,64)){ initAudio(); if(!online.active || online.isHost) startMissionFromLobby(); else { message='ČEKÁM NA HOSTA'; messageTimer=1.2; } return; }
      if(lobbyUi==='shop'){
        for(const card of getCharacterStripRects()){
          const bx=card.x+38, by=card.y+258, bw=card.w-76, bh=34;
          if(inb(bx,by,bw,bh)){
            const d = characterDefs[card.key];
            if(applyCharacter(card.key, true)){
              message = d.name;
              messageTimer = 1.2;
            }
            return;
          }
        }
        if(inb(W/2-90,545,180,48)){ lobbyUi=null; return; }
      }
      if(lobbyUi==='loadout'){
        if(inb(W/2-205,190,190,42)){ loadoutCategory='weapons'; return; }
        if(inb(W/2+15,190,190,42)){ loadoutCategory='gear'; return; }
        if(loadoutCategory==='weapons'){
          for(const card of getLoadoutCardRects()){
            if(inb(card.x, card.y, card.w, card.h)){
              setInventoryWeaponFromLoadout(card.key);
              message = loadoutDefs[card.key].name;
              messageTimer = 1.2;
              return;
            }
          }
        } else {
          for(const card of getEquipmentCardRects()){
            if(inb(card.x, card.y, card.w, card.h)){
              toggleEquipment(card.key);
              return;
            }
          }
        }
        if(inb(W/2-90,545,180,48)){ lobbyUi=null; return; }
      }
      if(inb(W/2-90,430,180,48)){ lobbyUi=null; return; }
    }
    if(inb(1090,8,150,42)){ state='menu'; menuStep='main'; }
  }
}

window.addEventListener('keydown', e=>{
  if(chatInput && document.activeElement === chatInput) return;
  const k=e.key.toLowerCase();
  if((k==='enter' || e.key==='Enter') && state==='play' && gameMode==='lobby' && !story.active){
    openChatInput();
    e.preventDefault();
    return;
  }
  if(story.active && (k==='enter' || k===' ')){
    story.timer = 999;
    e.preventDefault();
    return;
  }
  if(k==='f10'){ openSupabaseEditor(); e.preventDefault(); return; }
  if(state==='play' && (k==='+' || k==='=' || e.code==='NumpadAdd' || k==='ě')){
    cycleInventory();
    e.preventDefault();
    return;
  }
  if(k==='f' && !keys.f && state==='play' && gameMode!=='lobby') flashlightOn = !flashlightOn;
  keys[k]=true;
  if(k==='escape'){ state = state==='play' ? 'menu' : state; }
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()) || e.code==='Space') e.preventDefault();
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; if(e.code==='Space') keys[' ']=false; });
canvas.addEventListener('mousemove', e=>{ mouse.x=e.clientX; mouse.y=e.clientY; toWorld(); });
canvas.addEventListener('mousedown', e=>{
  initAudio(); mouse.down=true;
  const r=canvas.getBoundingClientRect(); const sx=W/r.width, sy=H/r.height;
  menuClick((e.clientX-r.left)*sx,(e.clientY-r.top)*sy);
});
window.addEventListener('mouseup', ()=>mouse.down=false);
canvas.addEventListener('contextmenu', e=>e.preventDefault());

// basic touch support
let touchFire=false;
canvas.addEventListener('touchstart', e=>{
  initAudio(); e.preventDefault();
  const t=e.changedTouches[0], r=canvas.getBoundingClientRect();
  mouse.x=t.clientX; mouse.y=t.clientY; mouse.down=true; touchFire=true; toWorld();
  menuClick((t.clientX-r.left)*W/r.width,(t.clientY-r.top)*H/r.height);
},{passive:false});
canvas.addEventListener('touchmove', e=>{ e.preventDefault(); const t=e.changedTouches[0]; mouse.x=t.clientX; mouse.y=t.clientY; toWorld(); },{passive:false});
canvas.addEventListener('touchend', e=>{ mouse.down=false; touchFire=false; },{passive:false});

window.addEventListener('beforeunload', ()=>{
  saveProgress();
  try{
    if(online.client && online.roomChannel) online.client.removeChannel(online.roomChannel);
    if(online.client && online.indexChannel) online.client.removeChannel(online.indexChannel);
  }catch(e){}
});
if(sbSaveBtn) sbSaveBtn.addEventListener('click', saveSupabaseEditor);
if(sbCloseBtn) sbCloseBtn.addEventListener('click', closeSupabaseEditor);
if(sbConfigEl) sbConfigEl.addEventListener('click', e=>{ if(e.target===sbConfigEl) closeSupabaseEditor(); });
if(nickSaveBtn) nickSaveBtn.addEventListener('click', ()=>{
  setPlayerNick(nickInput ? nickInput.value : '');
  closeNickEditor();
  afterNickReady();
});
if(nickInput) nickInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    setPlayerNick(nickInput.value);
    closeNickEditor();
    afterNickReady();
  }
});
if(chatInput) chatInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'){ submitChatInput(); e.preventDefault(); }
  if(e.key==='Escape'){ chatInput.classList.remove('show'); chatInput.blur(); e.preventDefault(); }
});

// předvyplní dodaný Supabase config do localStorage při prvním spuštění
if(!localStorage.getItem('echo_noir_supabase_url')) localStorage.setItem('echo_noir_supabase_url', SUPABASE_DEFAULT_URL);
if(!localStorage.getItem('echo_noir_supabase_key')) localStorage.setItem('echo_noir_supabase_key', SUPABASE_DEFAULT_KEY);

buildMap();
makeTextures();
resetFog();
requestAnimationFrame(loop);


})();
