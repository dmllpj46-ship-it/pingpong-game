/**
 * scene.js — 场景图、灯光、球台、球网、球与球拍的可视化。
 * 只负责「长什么样」，不负责球的运动（由 physics 写位置）。
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { TABLE } from './physics.js';
import { buildArena } from './arena.js';
import { buildSky } from './sky.js';

const T = CONFIG.table;

/**
 * @param {THREE.WebGLRenderer} renderer
 */
export function createWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.Fog(0x0a1024, 12, 38);

  // ---- 星空背景 ----
  const sky = buildSky(scene);

  // ---- 相机：第一视角，站在玩家这端 ----
  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
  const eye = CONFIG.camera.eye;
  camera.position.set(eye[0], eye[1], eye[2]);
  camera.lookAt(CONFIG.camera.lookAt[0], CONFIG.camera.lookAt[1], CONFIG.camera.lookAt[2]);

  // ---- 灯光 ----
  const hemi = new THREE.HemisphereLight(0x9fc6ff, 0x0a0f16, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.2, 5.4, 1.8);
  key.castShadow = true;
  key.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.012;
  key.target.position.set(0, 0.76, 0);
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0x6fa8ff, 0.5);
  fill.position.set(-3, 2.5, -2);
  scene.add(fill);

  // 台面上方一盏柔和补光，让球有立体感
  const top = new THREE.PointLight(0xffffff, 6, 6, 2);
  top.position.set(0, 2.6, 0);
  scene.add(top);

  // ---- 地面 ----
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.92, metalness: 0.0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 地面上的淡色台区投影，增加空间感
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0x16202c, transparent: true, opacity: 0.85 });
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.2), zoneMat);
  zone.rotation.x = -Math.PI / 2;
  zone.position.y = 0.001;
  scene.add(zone);

  // ---- 周围看台、观众与鲜花 ----
  buildArena(scene);

  // ---- 球台 ----
  const table = new THREE.Group();
  scene.add(table);

  const topMat = new THREE.MeshStandardMaterial({ color: 0x14508c, roughness: 0.62, metalness: 0.03 });
  const topMesh = new THREE.Mesh(new THREE.BoxGeometry(T.width, T.thickness, T.length), topMat);
  topMesh.position.y = T.height - T.thickness / 2;
  topMesh.castShadow = true;
  topMesh.receiveShadow = true;
  table.add(topMesh);

  // 白色边线
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f6ff, roughness: 0.45, emissive: 0x1a2330 });
  const lineY = T.height + 0.0015;
  const lw = T.lineWidth;
  const sideGeo = new THREE.BoxGeometry(lw, 0.002, T.length);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(sideGeo, lineMat);
    m.position.set(sx * (TABLE.halfW - lw / 2), lineY, 0);
    table.add(m);
  }
  const endGeo = new THREE.BoxGeometry(T.width, 0.002, lw);
  for (const sz of [-1, 1]) {
    const m = new THREE.Mesh(endGeo, lineMat);
    m.position.set(0, lineY, sz * (TABLE.halfL - lw / 2));
    table.add(m);
  }
  // 中线（双打用，弱化显示）
  const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, T.length), lineMat.clone());
  centerLine.material.opacity = 0.45;
  centerLine.material.transparent = true;
  centerLine.position.set(0, lineY, 0);
  table.add(centerLine);

  // 台腿
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.6, metalness: 0.35 });
  const legGeo = new THREE.BoxGeometry(0.06, T.height - T.thickness, 0.06);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(sx * 0.6, (T.height - T.thickness) / 2, sz * 1.15);
      leg.castShadow = true;
      table.add(leg);
    }
  }

  // ---- 球网 ----
  const netGroup = new THREE.Group();
  scene.add(netGroup);

  const netMat = new THREE.MeshStandardMaterial({
    color: 0xdfe8f5,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(T.netWidth, T.netHeight, 1, 1), netMat);
  netMesh.position.set(0, T.height + T.netHeight / 2, 0);
  netGroup.add(netMesh);

  // 网上白边
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const tape = new THREE.Mesh(new THREE.BoxGeometry(T.netWidth, 0.012, 0.01), tapeMat);
  tape.position.set(0, T.height + T.netHeight - 0.006, 0);
  tape.castShadow = true;
  netGroup.add(tape);

  // 网柱
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a3648, roughness: 0.5, metalness: 0.5 });
  const postGeo = new THREE.CylinderGeometry(0.012, 0.012, T.netHeight + 0.02, 12);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(sx * TABLE.netHalfW, T.height + (T.netHeight + 0.02) / 2, 0);
    post.castShadow = true;
    netGroup.add(post);
  }

  // ---- 球 ----
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xfffaf0,
    roughness: 0.35,
    metalness: 0.0,
    emissive: 0x2a2a22,
  });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.physics.ballRadius, 20, 14), ballMat);
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = false;
  scene.add(ballMesh);

  // 球的接触阴影（地面/台面上的小暗斑，强化深度感）
  const blobShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.035, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  blobShadow.rotation.x = -Math.PI / 2;
  scene.add(blobShadow);

  // ---- 球拍 ----
  const playerPaddle = createPaddle(0xd94b4b, 0x2a1a1a);
  const cpuPaddle = createPaddle(0x2b2b33, 0x1a1a1f);
  scene.add(playerPaddle, cpuPaddle);

  // ---- CPU 卡通机器人对手 ----
  const cpuRobot = createRobot();
  scene.add(cpuRobot);

  // ---- 落点标记（己方半场的预测落点） ----
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.035, 0.058, 28),
    new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = T.height + 0.002;
  scene.add(marker);

  // ---- 调试层 ----
  const debugGroup = new THREE.Group();
  debugGroup.visible = CONFIG.debug;
  scene.add(debugGroup);

  const axes = new THREE.AxesHelper(1.2);
  axes.position.set(0, 0.01, 0);
  debugGroup.add(axes);

  const hitSphere = new THREE.Mesh(
    new THREE.SphereGeometry(CONFIG.paddle.hitRadius, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true })
  );
  debugGroup.add(hitSphere);

  // 球的轨迹线
  const TRAIL_MAX = 240;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0.6 }));
  trail.frustumCulled = false;
  scene.add(trail);

  return {
    scene,
    camera,
    sky,
    table,
    ballMesh,
    blobShadow,
    playerPaddle,
    cpuPaddle,
    cpuRobot,
    marker,
    debugGroup,
    hitSphere,
    trail,
    trailMax: TRAIL_MAX,
    keyLight: key,
  };
}

/** 造一把球拍：拍面（圆盘）+ 拍柄 */
function createPaddle(faceColor, handleColor) {
  const g = new THREE.Group();

  const bladeMat = new THREE.MeshStandardMaterial({ color: faceColor, roughness: 0.55, metalness: 0.02 });
  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(CONFIG.paddle.bladeRadius, CONFIG.paddle.bladeRadius, 0.012, 24),
    bladeMat
  );
  blade.rotation.x = Math.PI / 2; // 盘面朝向 z
  blade.castShadow = true;
  g.add(blade);

  // 拍面外圈（深色胶边）
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.8 });
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(CONFIG.paddle.bladeRadius, 0.006, 8, 24),
    rimMat
  );
  g.add(rim);

  const handleMat = new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.75 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.105, 0.02), handleMat);
  handle.position.set(0, -CONFIG.paddle.bladeRadius - 0.05, 0);
  handle.castShadow = true;
  g.add(handle);

  // 默认朝 +z 侧看，玩家拍略微上扬
  g.rotation.x = -0.12;
  return g;
}

/**
 * CPU 卡通机器人：圆头 + 发光眼睛 + 天线 + 躯干 + 手臂 + 脚。
 * 面朝 +z（玩家方向），由 ai.js 每帧设置 x 位置。
 */
function createRobot() {
  const g = new THREE.Group();

  const shell = new THREE.MeshStandardMaterial({ color: 0xdfe9f7, roughness: 0.35, metalness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff9f43, roughness: 0.45, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14202e, roughness: 0.5, metalness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x6ee7ff, emissive: 0x6ee7ff, emissiveIntensity: 1.8, roughness: 0.25,
  });

  // 躯干（胶囊）
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.34, 6, 14), shell);
  body.position.y = 0.34;
  body.castShadow = true;
  g.add(body);

  // 胸口橙色面板
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), accent);
  chest.position.set(0, 0.38, 0.20);
  g.add(chest);
  const chestLight = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.02), glow);
  chestLight.position.set(0, 0.38, 0.23);
  g.add(chestLight);

  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), shell);
  head.scale.set(1, 0.88, 0.92);
  head.position.y = 0.80;
  head.castShadow = true;
  g.add(head);

  // 面罩
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.05), dark);
  visor.position.set(0, 0.81, 0.19);
  g.add(visor);

  // 两只发光眼睛
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 8), glow);
    eye.position.set(sx * 0.085, 0.82, 0.225);
    g.add(eye);
  }

  // 耳朵（圆形侧板）
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 12), accent);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(sx * 0.215, 0.80, 0);
    g.add(ear);
  }

  // 天线
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 8), dark);
  stalk.position.y = 1.04;
  g.add(stalk);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 8), accent);
  bulb.position.y = 1.14;
  g.add(bulb);

  // 手臂：持拍手朝 +z 前伸，另一只自然下垂
  const armGeo = new THREE.CapsuleGeometry(0.055, 0.20, 4, 10);

  const armFront = new THREE.Mesh(armGeo, shell);
  armFront.position.set(0.20, 0.46, 0.19);
  armFront.rotation.set(1.0, 0, -0.35);
  armFront.castShadow = true;
  g.add(armFront);

  const armBack = new THREE.Mesh(armGeo, shell);
  armBack.position.set(-0.23, 0.34, 0.02);
  armBack.rotation.set(0.15, 0, 0.35);
  g.add(armBack);

  // 腿和脚
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.14, 4, 8);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(sx * 0.10, 0.03, 0);
    g.add(leg);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.22), accent);
    foot.position.set(sx * 0.10, -0.08, 0.04);
    g.add(foot);
  }

  // 整体放大，让隔着一整张球台也能看清
  g.scale.setScalar(1.35);
  return g;
}
