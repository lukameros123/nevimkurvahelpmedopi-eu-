// weapon.js — AK-47 GLB, morph-target anim, CS2 hold, fake reload

export class WeaponSystem {
  constructor({ camera, onProgress }) {
    this.camera     = camera;
    this.onProgress = onProgress;

    this.model   = null;
    this.mixer   = null;
    this.actions = {};
    this.loaded  = false;

    this.ammo        = 30;
    this.maxAmmo     = 30;
    this.reserve     = 90;
    this.isReloading = false;
    this._reloadT    = 0;

    this.recoilKick = 0;
    this.recoilSide = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobTime = 0;

    this.basePos = new THREE.Vector3(0.18, -0.28, -0.45);
    this.baseRot = new THREE.Euler(0.0, 0.05, 0.0);

    // Dedicated weapon scene
    this.weaponScene = new THREE.Scene();
    this.weaponCam   = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.001, 30);

    this.weaponScene.add(new THREE.AmbientLight(0xfff4e0, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(1, 3, 2);
    this.weaponScene.add(sun);
    const fill = new THREE.DirectionalLight(0xaad4ff, 0.6);
    fill.position.set(-2, 0, 1);
    this.weaponScene.add(fill);
  }

  load(url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.GLTFLoader();
      try {
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        loader.setDRACOLoader(draco);
      } catch(e) {}

      loader.load(
        url,
        gltf => this._onLoad(gltf, resolve),
        xhr  => { if (xhr.lengthComputable) this.onProgress(xhr.loaded / xhr.total); },
        err  => { console.error('GLB error:', err); reject(err); }
      );
    });
  }

  _onLoad(gltf, resolve) {
    this.model = gltf.scene;

    this.model.traverse(child => {
      if (!child.isMesh) return;
      child.frustumCulled = false;
      child.castShadow    = false;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => {
        m.depthTest  = true;
        m.depthWrite = true;
        if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.3);
      });
    });

    // Auto-fit bounding box
    const box    = new THREE.Box3().setFromObject(this.model);
    const size   = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = 0.55 / maxDim;
    this.model.scale.setScalar(scale);
    this.model.position.sub(center.multiplyScalar(scale));

    console.log('[Weapon] loaded, scale=' + scale.toFixed(3) + ' size=' + size.x.toFixed(2) + 'x' + size.y.toFixed(2) + 'x' + size.z.toFixed(2));

    // Animation (morph target 'Object_0' = shoot)
    if (gltf.animations && gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.model);
      const clip   = gltf.animations[0];
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 2.0;
      this.actions.shoot = action;
    }

    this.weaponScene.add(this.model);
    this.loaded = true;
    this._positionModel();
    resolve(this);
  }

  _positionModel() {
    if (!this.model) return;
    this.model.position.add(this.basePos);
    this.model.rotation.copy(this.baseRot);
  }

  update(delta, keys, mouse) {
    if (!this.model) return;
    const { dx = 0, dy = 0 } = mouse || {};
    const moving = keys.w || keys.s || keys.a || keys.d;

    // Sway
    const swayTargX = THREE.MathUtils.clamp(-dx * 0.0005, -0.04, 0.04);
    const swayTargY = THREE.MathUtils.clamp(-dy * 0.0005, -0.03, 0.03);
    const lp = 1 - Math.exp(-10 * delta);
    this.swayX = THREE.MathUtils.lerp(this.swayX, swayTargX, lp);
    this.swayY = THREE.MathUtils.lerp(this.swayY, swayTargY, lp);

    // Bob
    let bobX = 0, bobY = 0;
    if (moving) {
      this.bobTime += delta * 7.5;
      bobX = Math.sin(this.bobTime)           * 0.012;
      bobY = Math.abs(Math.sin(this.bobTime)) * 0.010;
    }

    // Recoil decay
    const rd = 1 - Math.exp(-9 * delta);
    this.recoilKick = THREE.MathUtils.lerp(this.recoilKick, 0, rd);
    this.recoilSide = THREE.MathUtils.lerp(this.recoilSide, 0, rd * 0.7);

    // Reload procedural anim
    let reloadOffY = 0, reloadRot = 0;
    if (this.isReloading) {
      this._reloadT += delta;
      const t = this._reloadT;
      if (t < 0.35) {
        reloadOffY = -(t / 0.35) * 0.22;
        reloadRot  =  (t / 0.35) * 0.4;
      } else if (t < 1.7) {
        reloadOffY = -0.22;
        reloadRot  =  0.4;
      } else if (t < 2.2) {
        const f    = (t - 1.7) / 0.5;
        reloadOffY = THREE.MathUtils.lerp(-0.22, 0, f);
        reloadRot  = THREE.MathUtils.lerp(0.4,  0, f);
      } else {
        this.isReloading = false;
        this._reloadT    = 0;
        const take = Math.min(this.maxAmmo - this.ammo, this.reserve);
        this.ammo    += take;
        this.reserve -= take;
      }
    }

    this.model.position.set(
      this.basePos.x + this.swayX + bobX + this.recoilSide * 0.015,
      this.basePos.y + this.swayY + bobY - this.recoilKick * 0.035 + reloadOffY,
      this.basePos.z
    );
    this.model.rotation.set(
      this.baseRot.x - this.recoilKick * 0.05 + reloadRot,
      this.baseRot.y + this.swayX * 1.5,
      this.baseRot.z + this.swayX * 0.4 + bobX * 0.3
    );

    if (this.mixer) this.mixer.update(delta);
  }

  shoot() {
    if (this.isReloading) return false;
    if (this.ammo <= 0) { this.reload(); return false; }
    this.ammo--;
    this.recoilKick  = Math.min(this.recoilKick + 0.6, 2.2);
    this.recoilSide += (Math.random() - 0.5) * 0.45;
    if (this.actions.shoot) this.actions.shoot.reset().play();
    return true;
  }

  reload() {
    if (this.isReloading || this.ammo === this.maxAmmo || this.reserve <= 0) return;
    this.isReloading = true;
    this._reloadT    = 0;
  }

  syncCamera() {
    this.weaponCam.aspect = this.camera.aspect;
    this.weaponCam.updateProjectionMatrix();
  }

  renderWeapon(renderer) {
    if (!this.model) return;
    this.weaponCam.rotation.order = 'YXZ';
    this.weaponCam.rotation.copy(this.camera.rotation);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.weaponScene, this.weaponCam);
  }
}
