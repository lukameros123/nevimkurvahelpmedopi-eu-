// game.js — Main game loop: player, camera, shooting, enemies

import { buildMap }     from './map.js';
import { WeaponSystem } from './weapon.js';
import { HUD }          from './hud.js';

const GLB_URL = './ak-47_with_arms_and_shoot_animation.glb';

export class Game {
  constructor({ canvas, onProgress, onReady }) {
    this.canvas     = canvas;
    this.onProgress = onProgress;
    this.onReady    = onReady;

    this.running = false;
    this._keys   = {};
    this._mouse  = { dx: 0, dy: 0 };
    this._clock  = null;

    // Player state
    this.yaw    = 0;
    this.pitch  = 0;
    this.velY   = 0;
    this.onGround = true;
    this.GRAVITY  = -22;
    this.JUMP_V   = 7;
    this.SPEED    = 5.5;
    this.WALK_SPD = 2.2;

    // Enemies
    this._enemies = [];
    this._bullets  = [];
    this._shotTimer = 0;
    this._fireRate  = 0.095; // AK fire rate ~600rpm

    this._init();
  }

  async _init() {
    // ── Renderer ──────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas:      this.canvas,
      antialias:   true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding    = THREE.sRGBEncoding;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // ── Main Scene ────────────────────────────────────────
    this.scene = new THREE.Scene();

    // ── Player Camera ─────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 300);
    this.camera.position.set(0, 1.65, 5);

    // ── Build Map ─────────────────────────────────────────
    buildMap(this.scene);

    // ── Weapon ────────────────────────────────────────────
    this.weapon = new WeaponSystem({
      scene:      this.scene,
      camera:     this.camera,
      onProgress: this.onProgress
    });

    try {
      await this.weapon.load(GLB_URL);
    } catch(e) {
      console.warn('GLB load failed, continuing without model:', e);
    }

    // ── HUD ───────────────────────────────────────────────
    this.hud = new HUD();

    // ── Enemies ───────────────────────────────────────────
    this._spawnEnemies();

    // ── Muzzle flash ─────────────────────────────────────
    this._buildMuzzleFlash();

    // ── Events ────────────────────────────────────────────
    this._bindEvents();

    this.onProgress(1);
    this.onReady();

    // Clock
    this._clock = new THREE.Clock(false);
  }

  // ── Enemies ───────────────────────────────────────────────
  _spawnEnemies() {
    const positions = [
      [-15, 0, -15], [15, 0, -15], [0, 0, -20],
      [-20, 0,  15], [20, 0,  15], [5, 0, -30],
      [-30, 0,   0], [30, 0,   0],
    ];
    positions.forEach(([x, y, z]) => {
      const enemy = this._makeEnemy(x, y + 1, z);
      this.scene.add(enemy);
      this._enemies.push(enemy);
    });
  }

  _makeEnemy(x, y, z) {
    const group = new THREE.Group();

    // Body (CapsuleGeometry not in r128, use Cylinder + Spheres)
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.1, 10);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.8 });
    const body    = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.9 });
    const head    = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.9;
    head.castShadow = true;
    group.add(head);

    // CT logo plate on chest
    const plateGeo = new THREE.BoxGeometry(0.5, 0.4, 0.05);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x1a3a6e });
    const plate    = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(0, 0.1, 0.37);
    group.add(plate);

    group.position.set(x, y, z);
    group.userData = {
      isEnemy: true,
      health:  100,
      headMesh: head,
      origPos:  new THREE.Vector3(x, y, z),
      state:    'idle',
      bobT:     Math.random() * Math.PI * 2,
    };
    return group;
  }

  // ── Muzzle Flash ──────────────────────────────────────────
  _buildMuzzleFlash() {
    const geo  = new THREE.PlaneGeometry(0.18, 0.18);
    const mat  = new THREE.MeshBasicMaterial({
      color: 0xffaa44, transparent: true, opacity: 0,
      depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    this._muzzle = new THREE.Mesh(geo, mat);
    this._muzzle.position.set(0.22, -0.12, -0.9);
    this._muzzleTimer = 0;

    if (this.weapon.weaponScene) {
      this.weapon.weaponScene.add(this._muzzle);
    }

    // Point light for flash
    this._flashLight = new THREE.PointLight(0xff8800, 0, 3);
    this._flashLight.position.set(0, 1.6, -0.5);
    this.scene.add(this._flashLight);
  }

  // ── Input Events ──────────────────────────────────────────
  _bindEvents() {
    document.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this._keys[k] = true;
      if (k === 'r') this.weapon.reload();
    });
    document.addEventListener('keyup',   e => { this._keys[e.key.toLowerCase()] = false; });

    document.addEventListener('mousemove', e => {
      if (!document.pointerLockElement) return;
      this._mouse.dx += e.movementX;
      this._mouse.dy += e.movementY;
    });

    document.addEventListener('mousedown', e => {
      if (e.button === 0 && document.pointerLockElement) {
        this._keys['lmb'] = true;
      }
    });
    document.addEventListener('mouseup',   e => { if (e.button === 0) this._keys['lmb'] = false; });

    this.canvas.addEventListener('click', () => {
      if (this.running) this.canvas.requestPointerLock();
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.weapon.syncCamera();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  start() {
    this.running = true;
    this._clock.start();
    this.canvas.requestPointerLock();
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

    // Reset frame mouse
    this._mouse.dx = 0;
    this._mouse.dy = 0;

    // Render world
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);

    // Render weapon on top
    this.weapon.renderWeapon(this.renderer);
  }

  // ── PLAYER MOVEMENT ───────────────────────────────────────
  _updatePlayer(delta) {
    const k = this._keys;

    // Mouse look
    if (document.pointerLockElement) {
      const sens = 0.0018;
      this.yaw   -= this._mouse.dx * sens;
      this.pitch -= this._mouse.dy * sens;
      this.pitch  = THREE.MathUtils.clamp(this.pitch, -Math.PI * 0.48, Math.PI * 0.48);
    }

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y     = this.yaw;
    this.camera.rotation.x     = this.pitch;

    // Sync weapon camera rotation
    this.weapon.weaponCam.rotation.copy(this.camera.rotation);

    // Move
    const speed  = (k['shift'] ? this.WALK_SPD : this.SPEED);
    const fwd    = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right  = new THREE.Vector3(Math.cos(this.yaw),  0, -Math.sin(this.yaw));
    const move   = new THREE.Vector3();

    if (k['w']) move.addScaledVector(fwd,   1);
    if (k['s']) move.addScaledVector(fwd,  -1);
    if (k['a']) move.addScaledVector(right,-1);
    if (k['d']) move.addScaledVector(right, 1);

    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * delta);

    this.camera.position.add(move);

    // Gravity + jump
    if (k[' '] && this.onGround) {
      this.velY     = this.JUMP_V;
      this.onGround = false;
    }
    this.velY += this.GRAVITY * delta;
    this.camera.position.y += this.velY * delta;

    // Ground clamp
    if (this.camera.position.y < 1.65) {
      this.camera.position.y = 1.65;
      this.velY     = 0;
      this.onGround = true;
    }

    // World bounds
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -58, 58);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -58, 58);
  }

  // ── SHOOTING ──────────────────────────────────────────────
  _updateShooting(delta) {
    this._shotTimer -= delta;

    const wantFire = this._keys['lmb'];
    if (!wantFire || this._shotTimer > 0) return;
    if (!this.weapon.shoot()) return;

    this._shotTimer = this._fireRate;

    // Muzzle flash
    this._muzzleTimer = 0.06;
    if (this._muzzle) this._muzzle.material.opacity = 0.9;
    if (this._flashLight) this._flashLight.intensity = 3;

    // Raycast hit test
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const meshes = [];
    this._enemies.forEach(e => e.traverse(c => { if (c.isMesh) meshes.push(c); }));
    const hits = raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
      const hit  = hits[0];
      const enemy = this._findEnemy(hit.object);
      if (enemy) {
        const isHead = hit.object === enemy.userData.headMesh;
        const dmg    = isHead ? 100 : 27 + Math.random() * 12 | 0;
        enemy.userData.health -= dmg;

        this.hud.showHit();
        this._spawnBloodDecal(hit.point);

        if (enemy.userData.health <= 0) {
          this._killEnemy(enemy);
        } else {
          this._hitReaction(enemy);
        }
      }
    }
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
    enemy.userData.hitFlash = 0.15;
    enemy.traverse(c => {
      if (c.isMesh && c.material) {
        c.userData.origColor = c.userData.origColor || c.material.color.clone();
        c.material.color.set(0xff4444);
      }
    });
    setTimeout(() => {
      enemy.traverse(c => {
        if (c.isMesh && c.material && c.userData.origColor) {
          c.material.color.copy(c.userData.origColor);
        }
      });
    }, 150);
  }

  _killEnemy(enemy) {
    this.hud.addKillFeed('You', 'CT Player', 'AK-47');

    // Death animation — fall down
    let t = 0;
    const origY = enemy.position.y;
    const tick  = setInterval(() => {
      t += 0.05;
      enemy.rotation.z = Math.min(t * 1.5, Math.PI / 2);
      enemy.position.y = origY - t * 0.5;
      if (t >= 1.2) {
        clearInterval(tick);
        this.scene.remove(enemy);
        this._enemies = this._enemies.filter(e => e !== enemy);

        // Respawn after 6s
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
    const geo = new THREE.CircleGeometry(0.15 + Math.random() * 0.1, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8b0000, transparent: true, opacity: 0.75, depthWrite: false
    });
    const decal = new THREE.Mesh(geo, mat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.copy(pos).setY(0.01);
    this.scene.add(decal);
    setTimeout(() => {
      this.scene.remove(decal);
      geo.dispose(); mat.dispose();
    }, 8000);
  }

  // ── ENEMIES UPDATE ────────────────────────────────────────
  _updateEnemies(delta) {
    const playerPos = this.camera.position;

    this._enemies.forEach(e => {
      const ud = e.userData;
      ud.bobT += delta * 1.2;

      // Face player
      const dx = playerPos.x - e.position.x;
      const dz = playerPos.z - e.position.z;
      e.rotation.y = Math.atan2(dx, dz);

      // Idle bob
      e.position.y = ud.origPos.y + Math.sin(ud.bobT) * 0.04;

      // Simple patrol — move toward player when within range
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist > 4 && dist < 35) {
        const speed = 1.8 * delta;
        e.position.x += (dx / dist) * speed;
        e.position.z += (dz / dist) * speed;
        ud.origPos.x = e.position.x;
        ud.origPos.z = e.position.z;
      }

      // Damage player if close
      if (dist < 2.0) {
        this.hud.showDamage();
        this.hud.health = Math.max(0, this.hud.health - delta * 30);
        document.getElementById('hp-val').textContent = Math.ceil(this.hud.health);
      }
    });
  }

  // ── MUZZLE FLASH ─────────────────────────────────────────
  _updateMuzzle(delta) {
    if (!this._muzzle) return;
    this._muzzleTimer -= delta;
    if (this._muzzleTimer <= 0) {
      this._muzzle.material.opacity = 0;
      if (this._flashLight) this._flashLight.intensity = 0;
    } else {
      // Flicker
      this._muzzle.rotation.z   = Math.random() * Math.PI * 2;
      this._muzzle.material.opacity = 0.7 + Math.random() * 0.3;
      this._muzzle.scale.setScalar(0.8 + Math.random() * 0.5);
    }
  }
}
