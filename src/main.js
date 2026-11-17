/**
 * main.js — 启动、主循环、输入编排、状态切换。
 * 只做编排：物理在 physics.js，规则在 rules.js，渲染对象在 scene.js。
 */
import * as THREE from 'three';
import { CONFIG, DIFFICULTY_LABEL } from './config.js';
import { createWorld } from './scene.js';
import {
  Ball,
  createCollisionEvents,
  integrate,
  resolveCollisions,
  predictLanding,
  getServeVelocity,
  warmup,
  TABLE,
} from './physics.js';
import { PlayerController } from './player.js';
import { CpuController } from './ai.js';
import { Rules } from './rules.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const world = createWorld(renderer);
const { scene, camera } = world;

const ball = new Ball();
const prev = new THREE.Vector3();
const events = createCollisionEvents();

const rules = new Rules();
const player = new PlayerController(world);
const cpu = new CpuController(world, CONFIG.ai.defaultLevel);
const hud = new Hud();
const sfx = new Sfx();

warmup();

/** 应用层状态：menu | playing | paused | over */
let appState = 'menu';
let difficulty = CONFIG.ai.defaultLevel;
let autoServeTimer = 0;
let lastPhase = rules.phase;
let swayImpulse = 0;
let markerTimer = 0;
let trailCount = 0;
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const landingInfo = { ok: false, x: 0, z: 0, t: 0, side: 0, reason: '' };
const keys = { a: false, d: false };

const trailAttr = world.trail.geometry.attributes.position;

// ---------------------------------------------------------------------------
// 输入
// ---------------------------------------------------------------------------

window.addEventListener('mousemove', (e) => {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  player.setMouse(clamp(nx, -1, 1));
});

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || appState !== 'playing') return;
  // 单击发球；回合中单击 = 挥拍接球
  if (rules.phase === 'serve' && rules.server === 'player') {
    launchServe();
    return;
  }
  player.requestSwing();
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') e.preventDefault();

  if (k === 'a') keys.a = true;
  if (k === 'd') keys.d = true;

  if (k === ' ' && appState === 'playing' && rules.phase === 'serve' && rules.server === 'player') {
    launchServe();
  }
  if (k === 'escape') {
    if (appState === 'playing') pause();
    else if (appState === 'paused') resume();
  }
  if (k === 'r') restart();
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a') keys.a = false;
  if (k === 'd') keys.d = false;
});

window.addEventListener('blur', () => {
  if (appState === 'playing') pause();
  player.swingTimer = 0;
  keys.a = keys.d = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 菜单按钮
document.querySelectorAll('.level-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    difficulty = btn.dataset.level;
    cpu.setLevel(difficulty);
    hud.setDifficulty(DIFFICULTY_LABEL[difficulty]);
    document.querySelectorAll('.level-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });
});

document.getElementById('startBtn').addEventListener('click', () => {
  sfx.ensure();
  hud.showOverlay(false);
  restart();
  appState = 'playing';
});

document.getElementById('resumeBtn').addEventListener('click', resume);
document.getElementById('restartBtn').addEventListener('click', () => {
  hud.showPause(false);
  restart();
  appState = 'playing';
});

// ---------------------------------------------------------------------------
// 流程控制
// ---------------------------------------------------------------------------

function restart() {
  rules.reset();
  rules.beginServe();
  player.reset();
  cpu.reset();
  placeServeBall();
  hud.setScore(0, 0);
  hud.setMessage(rules.message);
  hud.hideResult();
  hud.showPause(false);
  lastPhase = rules.phase;
  trailCount = 0;
  world.trail.geometry.setDrawRange(0, 0);
  swayImpulse = 0;
}

function pause() {
  appState = 'paused';
  player.swingTimer = 0;
  hud.showPause(true);
}

function resume() {
  if (appState !== 'paused') return;
  appState = 'playing';
  hud.showPause(false);
  last = performance.now();
}

function placeServeBall() {
  const sign = rules.server === 'player' ? 1 : -1;
  ball.reset(0, CONFIG.serve.startY, CONFIG.serve.startZ * sign);
  autoServeTimer = rules.server === 'player' ? 0 : CONFIG.rules.serveDelay;
  hud.setServer(rules.server);
  hud.setMessage(rules.message);
  trailCount = 0;
  world.trail.geometry.setDrawRange(0, 0);
}

function launchServe() {
  if (rules.phase !== 'serve') return;
  const sign = rules.server === 'player' ? 1 : -1;
  const v = getServeVelocity(sign);
  ball.vel.set(v.vx, v.vy, v.vz);
  ball.spin.set(0, 0, 0);
  rules.launch();
  hud.setMessage('');
  sfx.hit(0.35);
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

const STEP = 1 / CONFIG.physics.stepHz;
let last = performance.now();
let acc = 0;
let fpsTimer = 0;
let fpsFrames = 0;

function frame(now) {
  requestAnimationFrame(frame);

  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (appState === 'playing') {
    player.update(dt, keys, ball, rules);
    cpu.update(dt, ball, rules);

    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < CONFIG.physics.maxStepsPerFrame) {
      stepSim(STEP);
      acc -= STEP;
      steps += 1;
    }
    if (steps >= CONFIG.physics.maxStepsPerFrame) acc = 0;

    handlePhaseChange();
  }

  updateVisuals(dt);

  fpsTimer += dt;
  fpsFrames += 1;
  if (fpsTimer >= 0.5) {
    hud.setFps(fpsFrames / fpsTimer);
    fpsTimer = 0;
    fpsFrames = 0;
  }

  renderer.render(scene, camera);
}

/** 一个物理步 */
function stepSim(dt) {
  if (rules.phase === 'point') {
    rules.advance(dt);
    return;
  }

  if (rules.phase === 'serve') {
    if (autoServeTimer > 0) {
      autoServeTimer -= dt;
      if (autoServeTimer <= 0) launchServe();
    }
    return;
  }

  if (rules.phase !== 'rally') return;

  prev.copy(ball.pos);
  integrate(ball, dt);

  // 击球判定（必须在碰撞之前：命中后本步不再做台面/球网碰撞）
  const pBefore = rules.playerScore;
  const cBefore = rules.cpuScore;

  if (player.tryHit(ball, prev, rules)) {
    rules.registerHit('player');
    sfx.hit(CONFIG.shot.clickPower);
    swayImpulse = reducedMotion ? 0 : 1;
    afterScoreChange(pBefore, cBefore);
    resetTrail();
    return;
  }

  if (cpu.tryHit(ball, prev, rules)) {
    rules.registerHit('cpu');
    sfx.hit(0.55);
    afterScoreChange(pBefore, cBefore);
    resetTrail();
    return;
  }

  resolveCollisions(ball, prev, events);

  if (events.tableBounce) {
    const side = events.bounceZ > 0 ? 'player' : 'cpu';
    rules.registerBounce(side);
    sfx.bounce();
    afterScoreChange(pBefore, cBefore);
  }

  if (events.netHit) {
    sfx.net();
  }

  if (events.dead) {
    rules.registerDead();
    sfx.net();
    afterScoreChange(pBefore, cBefore);
  }
}

function afterScoreChange(pBefore, cBefore) {
  if (rules.playerScore > pBefore) {
    sfx.point(true);
    hud.setScore(rules.playerScore, rules.cpuScore);
    hud.setMessage(rules.message);
  } else if (rules.cpuScore > cBefore) {
    sfx.point(false);
    hud.setScore(rules.playerScore, rules.cpuScore);
    hud.setMessage(rules.message);
  }
}

function handlePhaseChange() {
  if (rules.phase === lastPhase) return;

  if (rules.phase === 'serve') placeServeBall();

  if (rules.phase === 'over') {
    appState = 'over';
    sfx.point(rules.winner === 'player');
    hud.showResult(rules.winner, rules.playerScore, rules.cpuScore);
  }

  lastPhase = rules.phase;
}

function resetTrail() {
  trailCount = 0;
  world.trail.geometry.setDrawRange(0, 0);
}

// ---------------------------------------------------------------------------
// 视觉更新（每帧，与物理步长解耦）
// ---------------------------------------------------------------------------

function updateVisuals(dt) {
  world.sky.update(dt);
  world.ballMesh.position.copy(ball.pos);

  // 球的接触阴影：在台面上方就投到台面，否则投到地面
  const overTable = Math.abs(ball.pos.x) <= TABLE.halfW && Math.abs(ball.pos.z) <= TABLE.halfL;
  const shadowY = overTable ? TABLE.topY + 0.003 : 0.004;
  world.blobShadow.position.set(ball.pos.x, shadowY, ball.pos.z);
  const h = Math.max(0, ball.pos.y - shadowY);
  const scale = 1 + Math.min(h, 1.2) * 1.1;
  world.blobShadow.scale.set(scale, scale, scale);
  world.blobShadow.material.opacity = Math.max(0.04, 0.30 - h * 0.18);

  // 挥拍窗口指示 + 发球方指示
  hud.setSwing(player.swingTimer / CONFIG.paddle.swingWindow);
  if (rules.phase === 'serve') hud.setServer(rules.server);

  // 来球提示：球正飞向玩家但还没单击时明确提醒，避免「点了没反应」的困惑
  if (rules.phase === 'rally' && ball.vel.z > 0.4 && player.swingTimer <= 0) {
    hud.setMessage('单击接球');
  } else if (rules.phase === 'rally') {
    hud.setMessage('');
  }

  // 相机 sway（击球瞬间的前倾）
  swayImpulse = Math.max(0, swayImpulse - dt * 5);
  const sway = CONFIG.camera.swayAmount * swayImpulse;
  const eye = CONFIG.camera.eye;
  camera.position.set(eye[0], eye[1] - sway * 0.35, eye[2] - sway);

  // 落点标记：球飞向玩家半场时显示预测落点
  markerTimer -= dt;
  if (markerTimer <= 0) {
    markerTimer = 0.05;
    const show = rules.phase === 'rally' && ball.vel.z > 0.4;
    if (show) {
      predictLanding(ball, landingInfo);
    }
    if (show && landingInfo.ok && landingInfo.side > 0) {
      world.marker.position.set(landingInfo.x, TABLE.topY + 0.003, landingInfo.z);
      world.marker.material.opacity = 0.75;
      const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.12;
      world.marker.scale.set(pulse, pulse, pulse);
    } else {
      world.marker.material.opacity = 0;
    }
  }

  // 轨迹线
  if (rules.phase === 'rally' && appState === 'playing') {
    pushTrail(ball.pos);
  }

  // 调试层
  if (CONFIG.debug) {
    world.hitSphere.position.copy(player.center);
    world.debugGroup.visible = true;
    hud.setDebug(
      `phase=${rules.phase} hitter=${rules.hitter ?? '-'} ` +
      `own=${rules.bouncesHitter} recv=${rules.bouncesReceiver} ` +
      `serve=${rules.serveInFlight ? 'Y' : 'N'} ` +
      `v=${ball.vel.length().toFixed(2)}m/s ` +
      `pos=(${ball.pos.x.toFixed(2)},${ball.pos.y.toFixed(2)},${ball.pos.z.toFixed(2)}) ` +
      `swing=${player.swingTimer.toFixed(2)}`
    );
  }
}

function pushTrail(p) {
  if (trailCount < world.trailMax) {
    trailAttr.setXYZ(trailCount, p.x, p.y, p.z);
    trailCount += 1;
  } else {
    const arr = trailAttr.array;
    arr.copyWithin(0, 3);
    trailAttr.setXYZ(world.trailMax - 1, p.x, p.y, p.z);
  }
  trailAttr.needsUpdate = true;
  world.trail.geometry.setDrawRange(0, trailCount);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

hud.setDifficulty(DIFFICULTY_LABEL[difficulty]);
hud.setScore(0, 0);
document.querySelectorAll('.level-btn').forEach((b) => {
  b.classList.toggle('active', b.dataset.level === difficulty);
});
ball.reset(0, CONFIG.serve.startY, CONFIG.serve.startZ);
hud.setServer('player');
requestAnimationFrame(frame);

// 暴露给控制台，方便调试与自动化验证
window.__pingpong = { CONFIG, rules, ball, player, cpu, world, restart, launchServe };
