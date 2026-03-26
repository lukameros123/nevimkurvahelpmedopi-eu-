// map.js — CS2-style Dust2 inspired map

export function buildMap(scene) {
  const mats = {
    ground:  makeMat(0x8B7355, 0x6B5335, 0.8),
    wall:    makeMat(0xC8A96E, 0xA8895E, 0.9),
    crate:   makeMat(0x8B6914, 0x6B4914, 1.0),
    sky:     null,
  };

  // ── SKY ──────────────────────────────────────────────────
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.FogExp2(0xC4A882, 0.018);

  // ── AMBIENT + SUN ────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xfff4e0, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.width  = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far  = 200;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
  sun.shadow.camera.right = sun.shadow.camera.top   =  60;
  scene.add(sun);

  // Fill light
  const fill = new THREE.DirectionalLight(0xadd8ff, 0.3);
  fill.position.set(-20, 10, -20);
  scene.add(fill);

  // ── GROUND ───────────────────────────────────────────────
  addBox(scene, 120, 0.4, 120, 0, -0.2, 0, mats.ground, true);

  // ── OUTER WALLS ──────────────────────────────────────────
  const W = 60, H = 8, T = 1;
  addBox(scene, T,   H, 120,  W, H/2,   0,  mats.wall, true); // right
  addBox(scene, T,   H, 120, -W, H/2,   0,  mats.wall, true); // left
  addBox(scene, 120, H,  T,   0, H/2,  W,   mats.wall, true); // far
  addBox(scene, 120, H,  T,   0, H/2, -W,   mats.wall, true); // near

  // ── DUST2 GEOMETRY ───────────────────────────────────────
  // Long A
  addBox(scene, 40, 5, 1.5, -20, 2.5, 20,  mats.wall, true);
  addBox(scene, 1.5, 5, 25,  -2, 2.5, 7.5, mats.wall, true);

  // Mid wall
  addBox(scene, 1.5, 5, 30, -20, 2.5, -5,  mats.wall, true);

  // B site ramp
  addRamp(scene, 12, 3, 6, 20, 0, -20, mats.ground);

  // T-spawn cover blocks
  addBox(scene, 4, 2, 4, -35, 1,  35, mats.wall, true);
  addBox(scene, 4, 2, 4,  35, 1,  35, mats.wall, true);

  // CT spawn cover
  addBox(scene, 4, 2, 4, -35, 1, -35, mats.wall, true);
  addBox(scene, 4, 2, 4,  35, 1, -35, mats.wall, true);

  // ── CRATES & COVER ───────────────────────────────────────
  const cratePos = [
    [0,  0, 0],   // mid crate
    [10, 0, 0],
    [10, 1.2, 0],
    [-15, 0, 10],
    [-15, 0, -5],
    [20, 0, 10],
    [-8, 0, -15],
    [5,  0, 20],
    [-25, 0, 25],
    [25, 0, -25],
    [-25, 0, -25],
    [25, 0, 25],
  ];
  cratePos.forEach(([x, y, z]) => {
    const h = y === 1.2 ? 1.2 : 1.2;
    addCrate(scene, x, h/2, z, mats.crate);
  });

  // ── BOMB SITE A (platform) ────────────────────────────────
  addBox(scene, 14, 0.3, 14, -20, 0.15, -20, makeMat(0xAA8855, 0x996644, 1.0), true);

  // ── BOMB SITE B ───────────────────────────────────────────
  addBox(scene, 14, 0.3, 14,  20, 0.15,  20, makeMat(0xAA8855, 0x996644, 1.0), true);

  // Site markers (flat colored decal)
  addSiteMarker(scene, -20, 0.31, -20, 'A');
  addSiteMarker(scene,  20, 0.31,  20, 'B');

  // ── PILLARS ───────────────────────────────────────────────
  const pillars = [[-10,5],[10,5],[-10,-5],[10,-5],[0,12],[0,-12]];
  pillars.forEach(([x,z]) => addBox(scene, 1, 8, 1, x, 4, z, mats.wall, true));

  return scene;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMat(colorTop, colorSide, roughness) {
  return new THREE.MeshStandardMaterial({
    color: colorTop,
    roughness,
    metalness: 0.05
  });
}

function addBox(scene, w, h, d, x, y, z, mat, shadow) {
  const geo  = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow    = shadow;
  mesh.receiveShadow = shadow;
  mesh.userData.solid = true;
  scene.add(mesh);
  return mesh;
}

function addCrate(scene, x, y, z, mat) {
  const size = 1.2 + Math.random() * 0.3;
  const geo  = new THREE.BoxGeometry(size, size, size);

  // Add edge details
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.random() * 0.3 - 0.15;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.solid = true;
  scene.add(mesh);

  // Edges
  const edges = new THREE.EdgesGeometry(geo);
  const line  = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x4a3000, linewidth: 1 }));
  mesh.add(line);
}

function addRamp(scene, w, h, d, x, y, z, mat) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(d, 0);
  shape.lineTo(d, h);
  shape.lineTo(0, 0);

  const extrudeSettings = { depth: w, bevelEnabled: false };
  const geo  = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x - w/2, y, z - d/2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function addSiteMarker(scene, x, y, z, letter) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,180,0,0.18)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,180,0,0.7)';
  ctx.font = 'bold 180px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 135);

  const tex  = new THREE.CanvasTexture(canvas);
  const geo  = new THREE.PlaneGeometry(8, 8);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  scene.add(mesh);
}
