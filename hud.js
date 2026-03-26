// hud.js — CS2-style HUD

export class HUD {
  constructor() {
    this.health = 100;
    this.armor  = 100;
    this.money  = 800;
    this.kills  = 0;

    this._hitMarkerTimer = 0;
    this._damageTimer    = 0;
    this._el = {};

    this._build();
  }

  _build() {
    const css = `
      #hud * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }

      /* ── CROSSHAIR ── */
      #crosshair {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none; z-index: 50;
      }
      .ch-line {
        position: absolute; background: rgba(100,230,100,0.92);
        box-shadow: 0 0 3px rgba(0,0,0,0.9);
      }
      .ch-top    { width: 2px; height: 9px; top: -17px; left: -1px; }
      .ch-bottom { width: 2px; height: 9px; top:   7px; left: -1px; }
      .ch-left   { width: 9px; height: 2px; top:  -1px; left: -17px; }
      .ch-right  { width: 9px; height: 2px; top:  -1px; left:   7px; }
      .ch-dot    { width: 2px; height: 2px; top:  -1px; left:  -1px; background: rgba(100,230,100,0.6); }

      #hitmarker {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%,-50%);
        pointer-events: none; z-index: 51;
        opacity: 0; transition: opacity .08s;
      }
      #hitmarker.show { opacity: 1; }
      .hm-line {
        position: absolute; background: #fff;
        box-shadow: 0 0 4px rgba(0,0,0,1);
      }
      .hm-tl { width: 10px; height: 2px; top: -6px;  left: -6px;  transform: rotate(45deg); }
      .hm-tr { width: 10px; height: 2px; top: -6px;  right: -6px; transform: rotate(-45deg); }
      .hm-bl { width: 10px; height: 2px; bottom: -6px; left: -6px;  transform: rotate(-45deg); }
      .hm-br { width: 10px; height: 2px; bottom: -6px; right: -6px; transform: rotate(45deg); }

      /* ── BOTTOM BAR ── */
      #hud-bar {
        position: fixed; bottom: 0; left: 0; right: 0;
        display: flex; align-items: flex-end; justify-content: space-between;
        padding: 0 20px 12px; pointer-events: none; z-index: 50;
      }

      /* LEFT: health + armor */
      .hud-left { display: flex; flex-direction: column; gap: 6px; }
      .hud-stat  {
        display: flex; align-items: center; gap: 8px;
        color: #fff; font-size: 14px; font-weight: 600;
      }
      .hud-stat svg { width: 20px; height: 20px; opacity: .85; }
      .hud-val { font-size: 28px; font-weight: 700; min-width: 52px; }
      #hp-val  { color: #64e640; text-shadow: 0 0 12px #64e64088; }
      #ar-val  { color: #64b4e6; text-shadow: 0 0 12px #64b4e688; }

      /* CENTER: ammo */
      .hud-center { text-align: center; }
      #ammo-display {
        display: flex; align-items: baseline; gap: 6px;
        justify-content: center;
      }
      #ammo-cur {
        font-size: 48px; font-weight: 900; color: #fff;
        text-shadow: 0 2px 12px rgba(0,0,0,.8); letter-spacing: -2px;
        transition: color .15s;
      }
      #ammo-cur.low { color: #ff4444; }
      #ammo-sep { font-size: 28px; color: #666; font-weight: 300; }
      #ammo-res { font-size: 24px; color: #999; font-weight: 600; }
      #reload-txt {
        font-size: 12px; letter-spacing: 3px; color: #f5a623;
        text-transform: uppercase; opacity: 0;
        transition: opacity .2s; margin-top: 2px;
      }
      #reload-txt.show { opacity: 1; }
      #weapon-name {
        font-size: 11px; letter-spacing: 4px; color: #666;
        text-transform: uppercase; margin-bottom: 2px;
      }

      /* RIGHT: money + kills */
      .hud-right { text-align: right; display: flex; flex-direction: column; gap: 4px; }
      #money-val {
        font-size: 22px; font-weight: 700; color: #64e640;
        letter-spacing: 1px;
      }
      #money-val::before { content: '$'; font-size: 14px; vertical-align: top; margin-top: 4px; display: inline-block; }
      #kills-val { font-size: 12px; color: #888; letter-spacing: 2px; }

      /* ── DAMAGE VIGNETTE ── */
      #dmg-vignette {
        position: fixed; inset: 0; pointer-events: none; z-index: 49;
        background: radial-gradient(ellipse at center, transparent 50%, #ff000066 100%);
        opacity: 0; transition: opacity .1s;
      }

      /* ── KILL FEED ── */
      #killfeed {
        position: fixed; top: 80px; right: 16px;
        display: flex; flex-direction: column; gap: 4px;
        pointer-events: none; z-index: 50;
        max-width: 320px;
      }
      .kf-entry {
        background: rgba(0,0,0,.65); color: #fff;
        font-size: 12px; padding: 4px 10px;
        border-left: 3px solid #f5a623;
        animation: kfIn .2s ease-out;
        font-weight: 600; letter-spacing: .5px;
      }
      @keyframes kfIn { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform:none; } }

      /* ── ROUND TIMER ── */
      #timer {
        position: fixed; top: 14px; left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,.6); color: #fff;
        font-size: 26px; font-weight: 700; letter-spacing: 3px;
        padding: 4px 20px; border-radius: 2px;
        pointer-events: none; z-index: 50;
      }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // ── Crosshair ─────────────────────────────────────────
    const ch = document.createElement('div');
    ch.id = 'crosshair';
    ch.innerHTML = `
      <div class="ch-line ch-top"></div>
      <div class="ch-line ch-bottom"></div>
      <div class="ch-line ch-left"></div>
      <div class="ch-line ch-right"></div>
      <div class="ch-line ch-dot"></div>
    `;
    document.body.appendChild(ch);

    // ── Hit marker ────────────────────────────────────────
    const hm = document.createElement('div');
    hm.id = 'hitmarker';
    hm.innerHTML = `
      <div class="hm-line hm-tl"></div>
      <div class="hm-line hm-tr"></div>
      <div class="hm-line hm-bl"></div>
      <div class="hm-line hm-br"></div>
    `;
    document.body.appendChild(hm);
    this._el.hitmarker = hm;

    // ── HUD bar ───────────────────────────────────────────
    const bar = document.createElement('div');
    bar.id = 'hud-bar';
    bar.innerHTML = `
      <div class="hud-left">
        <div class="hud-stat">
          <svg viewBox="0 0 20 20" fill="none" stroke="#64e640" stroke-width="1.5">
            <path d="M10 2 L10 18 M4 8 L16 8" stroke-linecap="round"/>
            <circle cx="10" cy="10" r="8" stroke-dasharray="4 2"/>
          </svg>
          <div class="hud-val" id="hp-val">100</div>
        </div>
        <div class="hud-stat">
          <svg viewBox="0 0 20 20" fill="none" stroke="#64b4e6" stroke-width="1.5">
            <path d="M10 2 L17 6 L17 14 L10 18 L3 14 L3 6 Z"/>
          </svg>
          <div class="hud-val" id="ar-val">100</div>
        </div>
      </div>

      <div class="hud-center">
        <div id="weapon-name">AK-47</div>
        <div id="ammo-display">
          <span id="ammo-cur">30</span>
          <span id="ammo-sep">/</span>
          <span id="ammo-res">90</span>
        </div>
        <div id="reload-txt">● RELOAD ●</div>
      </div>

      <div class="hud-right">
        <div id="money-val">800</div>
        <div id="kills-val">KILLS: 0</div>
      </div>
    `;
    document.body.appendChild(bar);

    // ── Damage vignette ───────────────────────────────────
    const vig = document.createElement('div');
    vig.id = 'dmg-vignette';
    document.body.appendChild(vig);
    this._el.vignette = vig;

    // ── Kill feed ─────────────────────────────────────────
    const kf = document.createElement('div');
    kf.id = 'killfeed';
    document.body.appendChild(kf);
    this._el.killfeed = kf;

    // ── Timer ─────────────────────────────────────────────
    const timer = document.createElement('div');
    timer.id = 'timer';
    timer.textContent = '1:55';
    document.body.appendChild(timer);
    this._el.timer = timer;

    this._el.hp   = document.getElementById('hp-val');
    this._el.ar   = document.getElementById('ar-val');
    this._el.ammo = document.getElementById('ammo-cur');
    this._el.res  = document.getElementById('ammo-res');
    this._el.money  = document.getElementById('money-val');
    this._el.kills  = document.getElementById('kills-val');
    this._el.reload = document.getElementById('reload-txt');
  }

  // ── Update each frame ─────────────────────────────────────
  update(delta, weapon) {
    // Ammo
    if (weapon) {
      this._el.ammo.textContent = weapon.ammo;
      this._el.res.textContent  = weapon.reserve;
      this._el.ammo.classList.toggle('low', weapon.ammo <= 8);
      this._el.reload.classList.toggle('show', weapon.isReloading);
    }

    // Hit marker fade
    if (this._hitMarkerTimer > 0) {
      this._hitMarkerTimer -= delta;
      if (this._hitMarkerTimer <= 0) {
        this._el.hitmarker.classList.remove('show');
      }
    }

    // Damage vignette fade
    if (this._damageTimer > 0) {
      this._damageTimer -= delta;
      this._el.vignette.style.opacity = Math.min(1, this._damageTimer * 3);
    }

    // Timer countdown
    this._roundTime = (this._roundTime || 115) - delta;
    if (this._roundTime < 0) this._roundTime = 115;
    const m = Math.floor(this._roundTime / 60);
    const s = Math.floor(this._roundTime % 60);
    this._el.timer.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    this._el.timer.style.color = this._roundTime < 15 ? '#ff4444' : '#fff';
  }

  showHit() {
    this._el.hitmarker.classList.add('show');
    this._hitMarkerTimer = 0.22;
  }

  showDamage() {
    this._damageTimer = 0.6;
    this._el.vignette.style.opacity = '1';
  }

  addKillFeed(killer, victim, weapon) {
    this.kills++;
    this._el.kills.textContent = `KILLS: ${this.kills}`;
    this.money = Math.min(this.money + 300, 16000);
    this._el.money.textContent = this.money;

    const e = document.createElement('div');
    e.className = 'kf-entry';
    e.textContent = `${killer} ★ ${weapon} → ${victim}`;
    this._el.killfeed.prepend(e);
    setTimeout(() => e.remove(), 4000);
  }
}
