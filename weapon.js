// weapon.js — GLB loader, CS2 weapon hold, animations

export class WeaponSystem {
  constructor({ scene, camera, onProgress }) {
    this.scene      = scene;
    this.camera     = camera;
    this.onProgress = onProgress;

    this.model      = null;
    this.mixer      = null;
    this.actions    = {};
    this.loaded     = false;

    // CS2-like weapon offset (right-hand carry position)
    this.baseOffset = new THREE.Vector3(0.22, -0.26, -0.42);
    this.baseRot    = new THREE.Euler(0.04, 0.08, 0.0);

    // Sway / bob state
    this.swayX      = 0;
    this.swayY      = 0;
    this.swayTargX  = 0;
    this.swayTargY  = 0;
    this.bobTime    = 0;
    this.isMoving   = false;

    // Recoil
    this.recoilKick  = 0;
    this.recoilSide  = 0;

    // State
    this.isShooting  = false;
    this.isReloading = false;
    this.ammo        = 30;
    this.maxAmmo     = 30;
    this.reserve     = 90;

    // Weapon camera (renders on top)
    this._setupWeaponCamera();
  }

  _setupWeaponCamera() {
    // Separate camera for weapon — prevents clipping into walls
    this.weaponCam = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.01, 20);
    this.weaponScene = new THREE.Scene();

    // Lighting in weapon scene
    const amb = new THREE.AmbientLight(0xfff4e0, 1.2);
    this.weaponScene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(1, 2, 1);
    this.weaponScene.add(dir);

    const fill = new THREE.DirectionalLight(0xadd8ff, 0.4);
    fill.position.set(-1, 0, 1);
    this.weaponScene.add(fill);
  }

  load(glbUrl) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.GLTFLoader();

      // Try DRACOLoader if available
      try {
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        loader.setDRACOLoader(draco);
      } catch(e) {}

      loader.load(
        glbUrl,
        (gltf) => this._onLoad(gltf, resolve),
        (xhr)  => {
          if (xhr.lengthComputable) {
            this.onProgress(xhr.loaded / xhr.total);
          }
        },
        reject
      );
    });
  }

  _onLoad(gltf, resolve) {
    this.model = gltf.scene;

    // ── Scale & orient to CS2 style ─────────────────────────
    this.model.scale.setScalar(1.0);
    this.model.rotation.set(0, 0, 0);

    // Traverse materials — make them look sharp
    this.model.traverse(child => {
      if (child.isMesh) {
        child.castShadow    = false;
        child.receiveShadow = false;
        child.frustumCulled = false;

        if (child.material) {
          const m = Array.isArray(child.material) ? child.material : [child.material];
          m.forEach(mat => {
            mat.depthTest  = true;
            mat.depthWrite = true;
            // Slight roughness boost for realism
            if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.35);
          });
        }
      }
    });

    this.weaponScene.add(this.model);

    // ── Animations ───────────────────────────────────────────
    if (gltf.animations && gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.model);

      gltf.animations.forEach(clip => {
        const name   = clip.name.toLowerCase();
        const action = this.mixer.clipAction(clip);

        if (name.includes('shoot') || name.includes('fire') || name.includes('attack')) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          this.actions.shoot = action;
        } else if (name.includes('reload')) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          this.actions.reload = action;
        } else if (name.includes('idle') || name.includes('walk')) {
          action.setLoop(THREE.LoopRepeat, Infinity);
          this.actions.idle = action;
        } else {
          // First unknown anim → treat as shoot
          if (!this.actions.shoot) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            this.actions.shoot = action;
          }
        }
      });

      // Mixer event — animation finished
      this.mixer.addEventListener('finished', (e) => {
        const which = e.action;
        if (which === this.actions.shoot) {
          this.isShooting = false;
        }
        if (which === this.actions.reload) {
          this.isReloading = false;
          const needed = this.maxAmmo - this.ammo;
          const take   = Math.min(needed, this.reserve);
          this.ammo    += take;
          this.reserve -= take;
        }
        // Return to idle
        if (this.actions.idle) {
          this.actions.idle.reset().play();
        }
      });

      // Start idle
      if (this.actions.idle) this.actions.idle.play();
    }

    this.loaded = true;
    this._applyHoldPosition();
    resolve(this);
  }

  _applyHoldPosition() {
    if (!this.model) return;
    this.model.position.copy(this.baseOffset);
    this.model.rotation.copy(this.baseRot);
  }

  // ── Called each frame ─────────────────────────────────────
  update(delta, keys, mouseDelta) {
    if (!this.model) return;

    const { dx = 0, dy = 0 } = mouseDelta || {};
    this.isMoving = keys.w || keys.s || keys.a || keys.d;

    // ── Sway (mouse look follow) ──────────────────────────
    this.swayTargX = -dx * 0.0006;
    this.swayTargY = -dy * 0.0006;
    this.swayTargX = THREE.MathUtils.clamp(this.swayTargX, -0.05, 0.05);
    this.swayTargY = THREE.MathUtils.clamp(this.swayTargY, -0.04, 0.04);

    const lerpF = 1 - Math.exp(-12 * delta);
    this.swayX = THREE.MathUtils.lerp(this.swayX, this.swayTargX, lerpF);
    this.swayY = THREE.MathUtils.lerp(this.swayY, this.swayTargY, lerpF);

    // ── Movement bob ──────────────────────────────────────
    let bobX = 0, bobY = 0;
    if (this.isMoving) {
      this.bobTime += delta * 8;
      bobX = Math.sin(this.bobTime) * 0.015;
      bobY = Math.abs(Math.sin(this.bobTime)) * 0.012;
    } else {
      this.bobTime = 0;
    }

    // ── Recoil decay ──────────────────────────────────────
    this.recoilKick = THREE.MathUtils.lerp(this.recoilKick, 0, 1 - Math.exp(-10 * delta));
    this.recoilSide = THREE.MathUtils.lerp(this.recoilSide, 0, 1 - Math.exp(-8 * delta));

    // ── Apply to model ────────────────────────────────────
    this.model.position.set(
      this.baseOffset.x + this.swayX + bobX + this.recoilSide * 0.02,
      this.baseOffset.y + this.swayY + bobY - this.recoilKick * 0.04,
      this.baseOffset.z
    );
    this.model.rotation.set(
      this.baseRot.x - this.recoilKick * 0.06 + bobY * 0.5,
      this.baseRot.y + this.swayX * 2,
      this.baseRot.z + this.swayX * 0.5 + bobX * 0.5
    );

    // Animate mixer
    if (this.mixer) this.mixer.update(delta);
  }

  // ── SHOOT ──────────────────────────────────────────────────
  shoot() {
    if (this.isShooting || this.isReloading || this.ammo <= 0) {
      if (this.ammo <= 0) this.reload();
      return false;
    }

    this.ammo--;
    this.isShooting  = true;
    this.recoilKick  = 1.0;
    this.recoilSide  += (Math.random() - 0.5) * 0.6;

    if (this.actions.shoot) {
      if (this.actions.idle) this.actions.idle.stop();
      this.actions.shoot.reset().play();
    } else {
      // No animation found → fake timing
      setTimeout(() => { this.isShooting = false; }, 80);
    }

    return true;
  }

  // ── RELOAD ────────────────────────────────────────────────
  reload() {
    if (this.isReloading || this.ammo === this.maxAmmo || this.reserve <= 0) return;

    this.isReloading = true;

    if (this.actions.shoot) this.actions.shoot.stop();
    if (this.actions.idle)  this.actions.idle.stop();

    if (this.actions.reload) {
      this.actions.reload.reset().play();
    } else {
      // Fake reload
      setTimeout(() => {
        this.isReloading = false;
        const needed     = this.maxAmmo - this.ammo;
        const take       = Math.min(needed, this.reserve);
        this.ammo       += take;
        this.reserve    -= take;
        if (this.actions.idle) this.actions.idle.reset().play();
      }, 2000);
    }
  }

  // Weapon camera follows main camera rotation (but NOT position — fixed in view)
  syncCamera() {
    if (!this.weaponCam) return;
    this.weaponCam.aspect = this.camera.aspect;
    this.weaponCam.fov    = this.camera.fov * 0.88; // slightly zoomed for CS2 look
    this.weaponCam.updateProjectionMatrix();
  }

  renderWeapon(renderer) {
    if (!this.model) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.weaponScene, this.weaponCam);
  }
}
