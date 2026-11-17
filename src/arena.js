/**
 * arena.js — 球台周围的看台、卡通观众与鲜花。
 * 全部用 InstancedMesh 批量绘制：几百个观众 + 花束也只有十几个 draw call。
 */
import * as THREE from 'three';

const SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0x74b9ff, 0xa29bfe, 0xffa502, 0xfd79a8];
const SKINS = [0xffd8b1, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffe0c0];
const HAIRS = [0x2d1b16, 0x4a2c12, 0x8b5a2b, 0xd4a017, 0x1c1c24, 0x6b4423];
const PETALS = [0xff6b9d, 0xffd166, 0xff5c5c, 0xf7f7ff, 0xc77dff, 0xff9f45, 0xffb6c1];

/** 固定种子，保证每次刷新看到的是同一批观众 */
let seed = 20261117;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

const TIERS = 3;
const ROW_DEPTH = 0.72;
const TIER_HEIGHT = 0.42;
const INNER_X = 2.6;
const INNER_Z = 3.4;

export function buildArena(scene) {
  buildStands(scene);
  buildCrowd(scene);
  buildFlowers(scene);
}

/** 三级环形看台（长条台阶） */
function buildStands(scene) {
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x1b2838, roughness: 0.88, metalness: 0.02 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2e4560, roughness: 0.7 });

  function slab(w, d) {
    return new THREE.BoxGeometry(w, 0.22, d);
  }

  for (let tier = 0; tier < TIERS; tier++) {
    const y = 0.11 + tier * TIER_HEIGHT;
    const out = tier * ROW_DEPTH + ROW_DEPTH / 2;

    // 远侧 / 近侧
    for (const sign of [-1, 1]) {
      const mesh = new THREE.Mesh(slab(15, ROW_DEPTH), platformMat);
      mesh.position.set(0, y, sign * (INNER_Z + out));
      mesh.receiveShadow = true;
      scene.add(mesh);

      const edge = new THREE.Mesh(new THREE.BoxGeometry(15, 0.035, 0.06), edgeMat);
      edge.position.set(0, y + 0.12, sign * (INNER_Z + out - ROW_DEPTH / 2));
      scene.add(edge);
    }

    // 左右两侧
    for (const sign of [-1, 1]) {
      const mesh = new THREE.Mesh(slab(ROW_DEPTH, 11), platformMat);
      mesh.position.set(sign * (INNER_X + out), y, 0);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}

/** 卡通观众：头 + 身体 + 头发 + 两只手，全部实例化 */
function buildCrowd(scene) {
  const people = [];

  for (let tier = 0; tier < TIERS; tier++) {
    const top = 0.22 + tier * TIER_HEIGHT;
    const out = tier * ROW_DEPTH + ROW_DEPTH / 2;

    // 远侧 / 近侧（沿 x 排开）
    for (const sign of [-1, 1]) {
      const z = sign * (INNER_Z + out);
      for (let x = -6.6; x <= 6.6; x += 0.66) {
        if (rnd() < 0.10) continue;
        people.push(makePerson(x + (rnd() - 0.5) * 0.12, top, z + (rnd() - 0.5) * 0.18, 'z'));
      }
    }

    // 左右两侧（沿 z 排开）
    for (const sign of [-1, 1]) {
      const x = sign * (INNER_X + out);
      for (let z = -4.8; z <= 4.8; z += 0.66) {
        if (rnd() < 0.10) continue;
        people.push(makePerson(x + (rnd() - 0.5) * 0.18, top, z + (rnd() - 0.5) * 0.12, 'x'));
      }
    }
  }

  const dummy = new THREE.Object3D();
  const n = people.length;

  // 身体
  const bodyMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.145, 0.19, 0.38, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    n
  );
  // 头
  const headMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.155, 10, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    n
  );
  // 头发（光头的人 scale 设 0）
  const hairMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 10, 6),
    new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    n
  );
  // 手（每人两只）
  const armMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.26, 6),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    n * 2
  );

  for (let i = 0; i < n; i++) {
    const p = people[i];

    dummy.position.set(p.x, p.top + 0.19, p.z);
    dummy.rotation.set(0, p.facing, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bodyMesh.setMatrixAt(i, dummy.matrix);
    bodyMesh.setColorAt(i, new THREE.Color(p.shirt));

    dummy.position.set(p.x, p.top + 0.49, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    headMesh.setMatrixAt(i, dummy.matrix);
    headMesh.setColorAt(i, new THREE.Color(p.skin));

    dummy.position.set(p.x, p.top + 0.57, p.z);
    dummy.scale.set(p.hasHair ? 1 : 0, p.hasHair ? 0.62 : 0, p.hasHair ? 1 : 0);
    dummy.updateMatrix();
    hairMesh.setMatrixAt(i, dummy.matrix);
    hairMesh.setColorAt(i, new THREE.Color(p.hair));

    for (let a = 0; a < 2; a++) {
      const idx = i * 2 + a;
      const s = a === 0 ? -1 : 1;
      if (p.axis === 'z') {
        dummy.position.set(p.x + s * 0.19, p.top + 0.27 + p.wave, p.z);
        dummy.rotation.set(0, 0, s * (0.35 + p.waveAngle));
      } else {
        dummy.position.set(p.x, p.top + 0.27 + p.wave, p.z + s * 0.19);
        dummy.rotation.set(s * (0.35 + p.waveAngle), 0, 0);
      }
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      armMesh.setMatrixAt(idx, dummy.matrix);
      armMesh.setColorAt(idx, new THREE.Color(p.skin));
    }
  }

  for (const m of [bodyMesh, headMesh, hairMesh, armMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    scene.add(m);
  }
}

function makePerson(x, top, z, axis) {
  return {
    x,
    top,
    z,
    axis,
    facing: axis === 'z' ? (z > 0 ? Math.PI : 0) : (x > 0 ? -Math.PI / 2 : Math.PI / 2),
    shirt: pick(SHIRTS),
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hasHair: rnd() > 0.18,
    wave: rnd() < 0.22 ? 0.07 : 0,
    waveAngle: rnd() * 0.6,
  };
}

/** 鲜花：花盆 + 花茎 + 花瓣 + 花心，同样实例化 */
function buildFlowers(scene) {
  const spots = [
    [-1.85, -2.55], [1.85, -2.55],
    [-2.15, -0.85], [2.15, -0.85],
    [-2.15, 1.20], [2.15, 1.20],
    [-1.70, 2.65], [1.70, 2.65],
  ];

  const potPositions = [];
  const stems = [];
  const petals = [];
  const centers = [];

  for (const [bx, bz] of spots) {
    potPositions.push([bx, bz]);
    const count = 6 + Math.floor(rnd() * 3);
    for (let j = 0; j < count; j++) {
      const a = (j / count) * Math.PI * 2 + rnd() * 0.4;
      const r = 0.05 + rnd() * 0.12;
      const fx = bx + Math.cos(a) * r;
      const fz = bz + Math.sin(a) * r;
      const fy = 0.30 + rnd() * 0.26;
      const color = pick(PETALS);
      stems.push({ x: fx, z: fz, top: fy });
      centers.push({ x: fx, y: fy, z: fz });

      const petalCount = 5;
      for (let k = 0; k < petalCount; k++) {
        const pa = (k / petalCount) * Math.PI * 2 + rnd() * 0.2;
        petals.push({
          x: fx + Math.cos(pa) * 0.052,
          y: fy,
          z: fz + Math.sin(pa) * 0.052,
          rot: pa,
          color,
        });
      }
    }
  }

  const dummy = new THREE.Object3D();

  const potMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.15, 0.115, 0.20, 10),
    new THREE.MeshStandardMaterial({ color: 0xb5643c, roughness: 0.8 }),
    potPositions.length
  );
  potPositions.forEach(([x, z], i) => {
    dummy.position.set(x, 0.10, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    potMesh.setMatrixAt(i, dummy.matrix);
  });

  const stemMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.010, 0.012, 1, 5),
    new THREE.MeshStandardMaterial({ color: 0x3f9d52, roughness: 0.85 }),
    stems.length
  );
  stems.forEach((s, i) => {
    const h = Math.max(0.08, s.top - 0.18);
    dummy.position.set(s.x, 0.18 + h / 2, s.z);
    dummy.rotation.set(0, 0, (rnd() - 0.5) * 0.25);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    stemMesh.setMatrixAt(i, dummy.matrix);
  });

  const petalMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.042, 8, 6),
    new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }),
    petals.length
  );
  petals.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, -p.rot, 0);
    dummy.scale.set(1.15, 0.42, 0.72);
    dummy.updateMatrix();
    petalMesh.setMatrixAt(i, dummy.matrix);
    petalMesh.setColorAt(i, new THREE.Color(p.color));
  });

  const centerMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.024, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.6 }),
    centers.length
  );
  centers.forEach((c, i) => {
    dummy.position.set(c.x, c.y + 0.006, c.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    centerMesh.setMatrixAt(i, dummy.matrix);
  });

  for (const m of [potMesh, stemMesh, petalMesh, centerMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    scene.add(m);
  }
}
