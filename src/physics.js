/**
 * physics.js — 纯计算层：积分器、碰撞、弹道解算、落点预测。
 * 不持有 three.js 场景对象，不读输入，不改分数。这样才能被 AI 拿去空跑预测。
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';

const P = CONFIG.physics;
const T = CONFIG.table;

/** 球台几何常量（派生自 config，避免各处重复算） */
export const TABLE = {
  halfW: T.width / 2,
  halfL: T.length / 2,
  topY: T.height,
  netTopY: T.height + T.netHeight,
  netHalfW: T.netWidth / 2,
};

const G = P.gravity;
const R = P.ballRadius;

/** 球状态：位置、速度、旋转（rad/s） */
export class Ball {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
  }

  reset(x = 0, y = 1, z = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    return this;
  }

  copyFrom(other) {
    this.pos.copy(other.pos);
    this.vel.copy(other.vel);
    this.spin.copy(other.spin);
    return this;
  }
}

/** 碰撞事件结果容器（复用，避免每帧分配） */
export function createCollisionEvents() {
  return { tableBounce: false, bounceX: 0, bounceZ: 0, netHit: false, dead: false };
}

const _acc = new THREE.Vector3();
const _cross = new THREE.Vector3();

/**
 * 半隐式欧拉推进一步。
 * @param {Ball} ball
 * @param {number} dt - 秒
 */
export function integrate(ball, dt) {
  _acc.set(0, G, 0);
  const sp = ball.vel.length();
  if (sp > 1e-4) {
    // 空气阻力：a = -k * |v| * v
    _acc.addScaledVector(ball.vel, -P.dragK * sp);
    // 马格努斯：a = k * (ω × v)
    _cross.copy(ball.spin).cross(ball.vel);
    _acc.addScaledVector(_cross, P.magnusK);
  }
  ball.vel.addScaledVector(_acc, dt);
  ball.pos.addScaledVector(ball.vel, dt);

  // 旋转衰减
  const decay = Math.exp(-P.spinDecay * dt);
  ball.spin.multiplyScalar(decay);
}

/**
 * 用「上一位置 → 当前位置」线段做连续碰撞检测。
 * 就地修改 ball，结果写入 events。
 * @param {Ball} ball
 * @param {THREE.Vector3} prev - 上一帧位置
 * @param {object} events - createCollisionEvents() 的返回值
 */
export function resolveCollisions(ball, prev, events) {
  events.tableBounce = false;
  events.netHit = false;
  events.dead = false;

  const p = ball.pos;
  const v = ball.vel;

  // ---- 球网（z = 0 平面）----
  if ((prev.z > 0 && p.z <= 0) || (prev.z < 0 && p.z >= 0)) {
    const t = prev.z / (prev.z - p.z);
    const cy = prev.y + (p.y - prev.y) * t;
    const cx = prev.x + (p.x - prev.x) * t;
    if (cy - R < TABLE.netTopY && Math.abs(cx) < TABLE.netHalfW + 0.02) {
      // 触网：弹回击球方一侧并大幅衰减
      p.z = prev.z > 0 ? R : -R;
      v.z *= -CONFIG.net.restitution;
      v.x *= CONFIG.net.dampX;
      v.y *= CONFIG.net.dampY;
      events.netHit = true;
      return events;
    }
  }

  // ---- 台面（y = topY 平面，带矩形边界）----
  const y0 = prev.y - R - TABLE.topY;
  const y1 = p.y - R - TABLE.topY;
  if (y0 >= 0 && y1 < 0 && v.y < 0) {
    const t = y0 / (y0 - y1);
    const cx = prev.x + (p.x - prev.x) * t;
    const cz = prev.z + (p.z - prev.z) * t;
    if (Math.abs(cx) <= TABLE.halfW && Math.abs(cz) <= TABLE.halfL) {
      p.y = TABLE.topY + R;
      v.y = -v.y * T.restitution;
      v.x *= T.friction;
      v.z *= T.friction;
      // 旋转与台面摩擦：上旋让球前冲，下旋让球减速（简化处理）
      v.z += ball.spin.x * 0.0008;
      events.tableBounce = true;
      events.bounceX = cx;
      events.bounceZ = cz;
    }
  }

  // ---- 地面 ----
  if (p.y - R <= 0) {
    p.y = R;
    events.dead = true;
  }

  return events;
}

/**
 * 由「起点 + 目标落点 + 飞行时间」反解初速度。
 *   v = (t - p)/T - ½·g·T
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} target
 * @param {number} time
 * @param {THREE.Vector3} out
 */
export function solveVelocity(from, target, time, out) {
  out.subVectors(target, from).divideScalar(time);
  out.y += 0.5 * -G * time; // -½·g·T，g 为负故取正
  return out;
}

/**
 * 点到线段的最短距离平方（无分配）。
 */
export function distSqPointSegment(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

// ---------------------------------------------------------------------------
// 落点预测
// ---------------------------------------------------------------------------

const _scratch = new Ball();
const _prev = new THREE.Vector3();
const _ev = createCollisionEvents();

/**
 * 空跑模拟，预测球下一次落在台面上的位置。
 * @param {Ball} ball
 * @param {{ok:boolean,x:number,z:number,t:number,side:number,reason:string}} out
 */
export function predictLanding(ball, out) {
  out.ok = false;
  out.x = 0;
  out.z = 0;
  out.t = 0;
  out.side = 0;
  out.reason = 'timeout';

  _scratch.copyFrom(ball);
  const dt = 1 / P.stepHz;
  const maxSteps = Math.floor(P.predictMaxTime * P.stepHz);

  for (let i = 0; i < maxSteps; i++) {
    _prev.copy(_scratch.pos);
    integrate(_scratch, dt);
    resolveCollisions(_scratch, _prev, _ev);

    if (_ev.tableBounce) {
      out.ok = true;
      out.x = _ev.bounceX;
      out.z = _ev.bounceZ;
      out.t = (i + 1) * dt;
      out.side = Math.sign(_ev.bounceZ) || 0;
      out.reason = 'table';
      return out;
    }
    if (_ev.netHit) { out.reason = 'net'; return out; }
    if (_ev.dead) { out.reason = 'floor'; return out; }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 指定 z 平面的到达点预测（接球辅助的核心）
// ---------------------------------------------------------------------------

const _zBall = new Ball();
const _zPrev = new THREE.Vector3();
const _zEv = createCollisionEvents();

/**
 * 预测球飞到某个 z 平面时的 x / y。含重力、阻力、台面反弹。
 * 玩家拍用它自动跟高度，CPU 用它对准落点——两边都只需要处理左右。
 * @param {Ball} ball
 * @param {number} targetZ
 * @param {{ok:boolean,x:number,y:number,t:number}} out
 */
export function predictAtZ(ball, targetZ, out) {
  out.ok = false;
  out.x = 0;
  out.y = 0;
  out.t = 0;

  if (Math.abs(targetZ - ball.pos.z) < 1e-4) {
    out.x = ball.pos.x;
    out.y = ball.pos.y;
    out.ok = true;
    return out;
  }

  _zBall.copyFrom(ball);
  const dt = 1 / P.stepHz;
  const maxSteps = Math.floor(1.5 * P.stepHz);

  for (let i = 0; i < maxSteps; i++) {
    _zPrev.copy(_zBall.pos);
    integrate(_zBall, dt);
    resolveCollisions(_zBall, _zPrev, _zEv);
    if (_zEv.netHit || _zEv.dead) return out;

    if ((_zPrev.z - targetZ) * (_zBall.pos.z - targetZ) <= 0) {
      out.x = _zBall.pos.x;
      out.y = _zBall.pos.y;
      out.t = (i + 1) * dt;
      out.ok = true;
      return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 发球解算
// ---------------------------------------------------------------------------

/**
 * 用数值搜索找一个「先落己方台面、过网有足够余量、再落对方台面」的发球初速度。
 * 只在启动时跑一次，结果缓存。
 * @param {number} ownSign - 发球方所在一侧（+1 玩家 / -1 CPU）
 * @returns {{vx:number,vy:number,vz:number,clearance:number}}
 */
function searchServeVelocity(ownSign) {
  const S = CONFIG.serve;
  const dt = 1 / P.stepHz;
  let best = null;
  let fallback = null;

  const vzFrom = ownSign > 0 ? S.vzRange[0] : -S.vzRange[0];
  const vzTo = ownSign > 0 ? S.vzRange[1] : -S.vzRange[1];

  for (let vz = vzFrom; ownSign > 0 ? vz >= vzTo : vz <= vzTo; vz += ownSign > 0 ? -S.vzStep : S.vzStep) {
    for (let vy = S.vyRange[0]; vy <= S.vyRange[1]; vy += S.vyStep) {
      const res = simulateServe(ownSign, 0, S.startY, S.startZ * ownSign, 0, vy, vz, dt);
      if (!res.ok) continue;
      const cand = { vx: 0, vy, vz, clearance: res.clearance, secondZ: res.secondZ };
      if (!fallback || res.clearance > fallback.clearance) fallback = cand;

      // 硬条件：第二落点要出台，否则对手在台后 0.4 m 的拍位根本够不到球
      const beyond = Math.abs(res.secondZ) - TABLE.halfL;
      if (beyond < S.minSecondBounceBeyond) continue;
      // 打分：速度优先，过网余量次之
      const score = Math.abs(vz) + res.clearance * 2;
      if (!best || score > best.score) {
        best = { ...cand, score };
      }
    }
  }
  // 兜底：搜索失败时退回过网余量最大的解
  return best || fallback || { vx: 0, vy: 1.6, vz: -3.0 * ownSign, clearance: 0, secondZ: 0 };
}

/** 单次发球模拟（纯数值，无分配） */
function simulateServe(ownSign, px, py, pz, vx, vy, vz, dt) {
  let x = px, y = py, z = pz;
  let bouncedOwn = false;
  let crossed = false;
  let clearance = -99;
  let secondZ = 0;
  const maxSteps = Math.floor(2.0 * P.stepHz);

  for (let i = 0; i < maxSteps; i++) {
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
    vx += -P.dragK * sp * vx * dt;
    vy += (G - P.dragK * sp * vy) * dt;
    vz += -P.dragK * sp * vz * dt;

    const pz0 = z, py0 = y;
    x += vx * dt; y += vy * dt; z += vz * dt;

    // 过网检查
    if ((pz0 > 0 && z <= 0) || (pz0 < 0 && z >= 0)) {
      const t = pz0 / (pz0 - z);
      const cy = py0 + (y - py0) * t;
      const cl = cy - R - TABLE.netTopY;
      if (!crossed) clearance = cl;
      if (cl < 0) return { ok: false, clearance: cl, secondZ, reason: 'net' };
      crossed = true;
    }

    // 台面反弹
    if (y - R <= TABLE.topY && vy < 0 && Math.abs(x) <= TABLE.halfW && Math.abs(z) <= TABLE.halfL) {
      const side = z >= 0 ? 1 : -1;
      if (side === ownSign) {
        if (bouncedOwn) return { ok: false, clearance, secondZ, reason: 'double_own_bounce' };
        bouncedOwn = true;
        y = TABLE.topY + R;
        vy = -vy * T.restitution;
        vx *= T.friction;
        vz *= T.friction;
        continue;
      }
      // 落在对方台面：估算第二落点，判断对手是否有挥拍空间
      const vyUp = -vy * T.restitution;
      const vzAfter = vz * T.friction;
      secondZ = z + vzAfter * (2 * vyUp / -G);
      return {
        ok: bouncedOwn && crossed && clearance >= CONFIG.serve.minClearance,
        clearance,
        secondZ,
        reason: 'ok',
      };
    }

    if (y - R <= 0) return { ok: false, clearance, reason: 'floor' };
  }
  return { ok: false, clearance, reason: 'timeout' };
}

let _serveCache = null;
/** 取发球速度（按发球方缓存） */
export function getServeVelocity(ownSign) {
  if (!_serveCache) _serveCache = {};
  const key = ownSign > 0 ? 'player' : 'cpu';
  if (!_serveCache[key]) _serveCache[key] = searchServeVelocity(ownSign);
  return _serveCache[key];
}

/** 预热发球解算（启动时调用，避免首次发球卡顿） */
export function warmup() {
  getServeVelocity(1);
  getServeVelocity(-1);
}

/** 把速度限制在合法范围内 */
export function clampSpeed(v, max = P.maxSpeed) {
  const sp = v.length();
  if (sp > max) v.multiplyScalar(max / sp);
  return v;
}
