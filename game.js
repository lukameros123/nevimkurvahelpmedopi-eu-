// game.js — Main game loop

import { buildMap }     from './map.js';
import { WeaponSystem } from './weapon.js';
import { HUD }          from './hud.js';

const GLB_URL = './ak-47_with_arms_and_shoot_animation.glb';

export class Game {
  constructor({ canvas, onProgress, onReady }) {
    this.canvas     = canvas;
    this.onProgress = onProgress;
    this.onReady    = onReady;

    this.running  = false;
    this._keys    = {};
    this._mouse   = { dx: 0, dy: 0 };
    this._clock   = null;
    this._locked  = false;

    // Player
    this.yaw      = 0;
    this.pitch    = 0;
    this.velY     = 0;
    this.onGround = true;

    this.GRAVITY  = -22;
    this.JUMP_V   = 7;
    this.SPEED    = 5.5;
    this.WALK_SPD = 2.2;
    this._fireTimer = 0;
    this._fireRate  = 0.095;

    this._enemies = [];

    this._init();
  }

  async _init() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding    = THREE.sRGBEncoding;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Scene + camera
    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 300);
    this.camera.position.set(0, 1.65, 5);
    this.camera.rotation.order = 'YXZ';

    // Map
    buildMap(this.scene);

    // Weapon
    this.weapon = new WeaponSystem({ camera: this.camera, onProgress: this.onProgress });
    try {
      await this.weapon.load(GLB_URL);
    } catch(e) {
      console.warn('GLB failed:', e);
    }

    // HUD
    this.hud = new HUD();

    // Enemies
    this._spawnEnemies();

    // Muzzle flash
    this._buildMuzzleFlash();

    // Events
    this._bindEvents();

    this.onProgress(1);
    this.onReady();
    this._clock = new THREE.Clock(false);
  }

  // ── POINTER LOCK ─────────────────────────────────────────
  requestLock() {
    this.canvas.requestPointerLock =
      this.canvas.requestPointerLock ||
      this.canvas.mozRequestPointerLock ||
      this.canvas.webkitRequestPointerLock;
    this.canvas.requestPointerLock();
  }

  _bindEvents() {
    // Keyboard
    document.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this._keys[k] = true;
      if (k === 'r') this.weapon.reload();
      if (['w','a','s','d',' '].includes(k)) e.preventDefault();
    });
    document.addEventListener('keyup', e => {
      this._keys[e.key.toLowerCase()] = false;
    });

    // Mouse move — only fires when pointer is locked
    document.addEventListener('mousemove', e => {
      if (!this._locked) return;
      this._mouse.dx += e.movementX || e.mozMovementX || 0;
      this._mouse.dy += e.movementY || e.mozMovementY || 0;
    });

    // Shoot
    document.addEventListener('mousedown', e => {
      if (e.button === 0) {
        if (!this._locked) { this.requestLock(); return; }
        this._keys['lmb'] = true;
      }
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this._keys['lmb'] = false;
    });

    // Pointer lock change
    document.addEventListener('pointerlockchange',    () => this._onLockChange());
    document.addEventListener('mozpointerlockchange', () => this._onLockChange());

    // Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.weapon.syncCamera();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _onLockChange() {
    this._locked = !!(
      document.pointerLockElement    === this.canvas ||
      document.mozPointerLockElement === this.canvas
    );
    // Update paused overlay
    const p = document.getElementById('paused');
    if (p) p.classList.toggle('show', !this._locked && this.running);
  }

  start() {
    this.running = true;
    this._clock.start();
    this.requestLock();
    this._loop();
  }

  // ── MAIN LOOP ─────────────────────────────────────────────
  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    const delta = Math.min(this._clock.getDelta(), 0.05);

    this._updatePlayer(delta);
    this._updateShooting(delta);
    this._updateEnemies(delta);
    this._updateMuzzle(delta);
    this.weapon.update(delta, this._keys, { dx: this._mouse.dx, dy: this._mouse.dy });
    this.hud.update(delta, this.weapon);

    // Reset mouse accumulation
    this._mouse.dx = 0;
    this._mouse.dy = 0;

    // Render world
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);

    // Render weapon on top (clears depth, draws weapon cam)
    this.weapon.renderWeapon(this.renderer);
  }

  // ── PLAYER ───────────────────────────────────────────────
  _updatePlayer(delta) {
    const k = this._keys;

    // Look (only when locked)
    if (this._locked && (this._mouse.dx !== 0 || this._mouse.dy !== 0)) {
      const sens = 0.0018;
      this.yaw   -= this._mouse.dx * sens;
      this.pitch -= this._mouse.dy * sens;
      this.pitch  = THREE.MathUtils.clamp(this.pitch, -Math.PI * 0.46, Math.PI * 0.46);
    }

    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Movement
    const speed = k['shift'] ? this.WALK_SPD : this.SPEED;
    const fwd   = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move  = new THREE.Vector3();

    if (k['w']) move.addScaledVector(fwd,   1);
    if (k['s']) move.addScaledVector(fwd,  -1);
    if (k['a']) move.addScaledVector(right,-1);
    if (k['d']) move.addScaledVector(right, 1);

    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * delta);
    this.camera.position.add(move);

    // Gravity
    if (k[' '] && this.onGround) { this.velY = this.JUMP_V; this.onGround = false; }
    this.velY += this.GRAVITY * delta;
    this.camera.position.y += this.velY * delta;

    if (this.camera.position.y < 1.65) {
      this.camera.position.y = 1.65;
      this.velY = 0;
      this.onGround = true;
    }

    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -58, 58);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -58, 58);
  }

  // ── SHOOTING ─────────────────────────────────────────────
  _updateShooting(delta) {
    this._fireTimer -= delta;
    if (!this._keys['lmb'] || this._fireTimer > 0) return;
    if (!this.weapon.shoot()) return;

    this._fireTimer = this._fireRate;

    // Muzzle flash
    this._muzzleTimer = 0.055;

    // Raycast
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const meshes = [];
    this._enemies.forEach(e => e.traverse(c => { if (c.isMesh) meshes.push(c); }));
    const hits = ray.intersectObjects(meshes, false);

    if (hits.length > 0) {
      const enemy = this._findEnemy(hits[0].object);
      if (enemy) {
        const isHead = hits[0].object === enemy.userData.headMesh;
        const dmg    = isHead ? 100 : (27 + Math.random() * 12 | 0);
        enemy.userData.health -= dmg;
        this.hud.showHit();
        this._spawnBloodDecal(hits[0].point);
        if (enemy.userData.health <= 0) this._killEnemy(enemy);
        else this._hitReaction(enemy);
      }
    }
  }

  // ── ENEMIES ──────────────────────────────────────────────
  _spawnEnemies() {
    const pos = [
      [-15,0,-15],[15,0,-15],[0,0,-20],[-20,0,15],
      [20,0,15],[5,0,-30],[-30,0,0],[30,0,0],
    ];
    pos.forEach(([x,y,z]) => {
      const e = this._makeEnemy(x, y+1, z);
      this.scene.add(e);
      this._enemies.push(e);
    });
  }

  _makeEnemy(x, y, z) {
    const g = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1.1, 10),
      new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.8 })
    );
    body.castShadow = true;
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.9 })
    );
    head.position.y = 0.78;
    head.castShadow = true;
    g.add(head);

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1a3a6e })
    );
    plate.position.set(0, 0.1, 0.37);
    g.add(plate);

    g.position.set(x, y, z);
    g.userData = {
      isEnemy: true, health: 100, headMesh: head,
      origPos: new THREE.Vector3(x, y, z),
      bobT: Math.random() * Math.PI * 2,
    };
    return g;
  }

  _findEnemy(mesh) {
    for (const e of this._enemies) {
      let found = false;
      e.traverse(c => { if (c === mesh) found = true; });
      if (found) return e;
    }
    return null;
  }

  _hitReaction(enemy) {
    enemy.traverse(c => {
      if (c.isMesh && c.material) {
        if (!c.userData.origColor) c.userData.origColor = c.material.color.clone();
        c.material.color.set(0xff3333);
      }
    });
    setTimeout(() => {
      enemy.traverse(c => {
        if (c.isMesh && c.material && c.userData.origColor)
          c.material.color.copy(c.userData.origColor);
      });
    }, 140);
  }

  _killEnemy(enemy) {
    this.hud.addKillFeed('Ty', 'CT hráč', 'AK-47');
    let t = 0;
    const origY = enemy.position.y;
    const iv = setInterval(() => {
      t += 0.06;
      enemy.rotation.z = Math.min(t * 1.5, Math.PI / 2);
      enemy.position.y = origY - t * 0.4;
      if (t >= 1.2) {
        clearInterval(iv);
        this.scene.remove(enemy);
        this._enemies = this._enemies.filter(e => e !== enemy);
        setTimeout(() => {
          const nx = (Math.random() - 0.5) * 80;
          const nz = (Math.random() - 0.5) * 80;
          const ne = this._makeEnemy(nx, 1, nz);
          this.scene.add(ne);
          this._enemies.push(ne);
        }, 6000);
      }
    }, 50);
  }

  _spawnBloodDecal(pos) {
    const geo = new THREE.CircleGeometry(0.12 + Math.random() * 0.1, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8b0000, transparent: true, opacity: 0.7, depthWrite: false });
    const d   = new THREE.Mesh(geo, mat);
    d.rotation.x = -Math.PI / 2;
    d.position.copy(pos).setY(0.01);
    this.scene.add(d);
    setTimeout(() => { this.scene.remove(d); geo.dispose(); mat.dispose(); }, 8000);
  }

  _updateEnemies(delta) {
    const pp = this.camera.position;
    this._enemies.forEach(e => {
      const ud = e.userData;
      ud.bobT += delta * 1.2;
      const dx = pp.x - e.position.x;
      const dz = pp.z - e.position.z;
      e.rotation.y = Math.atan2(dx, dz);
      e.position.y = ud.origPos.y + Math.sin(ud.bobT) * 0.04;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist > 3 && dist < 35) {
        const sp = 1.8 * delta;
        e.position.x += (dx / dist) * sp;
        e.position.z += (dz / dist) * sp;
        ud.origPos.x = e.position.x;
        ud.origPos.z = e.position.z;
      }
      if (dist < 2.0) {
        this.hud.showDamage();
        this.hud.health = Math.max(0, this.hud.health - delta * 25);
        document.getElementById('hp-val').textContent = Math.ceil(this.hud.health);
      }
    });
  }

  // ── MUZZLE FLASH ─────────────────────────────────────────
  _buildMuzzleFlash() {
    const geo = new THREE.PlaneGeometry(0.2, 0.2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffbb44, transparent: true, opacity: 0,
      depthTest: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this._muzzle = new THREE.Mesh(geo, mat);
    this._muzzle.position.set(0.18, -0.20, -0.9);
    this._muzzleTimer = 0;
    if (this.weapon.weaponScene) this.weapon.weaponScene.add(this._muzzle);

    this._flashLight = new THREE.PointLight(0xff8800, 0, 4);
    this._flashLight.position.set(0, 1.6, -0.5);
    this.scene.add(this._flashLight);
  }

  _updateMuzzle(delta) {
    if (!this._muzzle) return;
    this._muzzleTimer -= delta;
    if (this._muzzleTimer <= 0) {
      this._muzzle.material.opacity = 0;
      if (this._flashLight) this._flashLight.intensity = 0;
    } else {
      this._muzzle.rotation.z = Math.random() * Math.PI * 2;
      this._muzzle.material.opacity = 0.7 + Math.random() * 0.3;
      this._muzzle.scale.setScalar(0.8 + Math.random() * 0.6);
      if (this._flashLight) this._flashLight.intensity = 3;
    }
  }
}
