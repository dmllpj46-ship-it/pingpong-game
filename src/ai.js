/**
 * ai.js — CPU 对手：预判球到达自己拍位时的 x / y，只需要左右移动去接。
 * 难度来自反应延迟、移动速度、瞄准误差和漏球率，不来自「够不着球」。
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { solveVelocity, clampSpeed, distSqPointSegment, predictAtZ, TABLE } from './physics.js';

const AI = CONFIG.ai;
const R = CONFIG.physics.ballRadius;
const _target = new THREE.Vector3();
const _arrival = { ok: false, x: 0, y: 0, t: 0 };

export class CpuController {
  constructor(world, levelName = AI.defaultLevel) {
    this.mesh = world.cpuPaddle;
    this.robot = world.cpuRobot;
    this.x = 0;
    this.y = 0.95;
    this.tx = 0;

    this.predictTimer = 0;
    this.incoming = false;
    this.reactionTimer = 0;
    this.cooldown = 0;
    this.corner = 1;
    this.levelName = levelName;
    this.level = AI.levels[levelName];

    this.center = new THREE.Vector3(0, 0.95, AI.paddleZ);
    this.syncMesh();
  }

  setLevel(levelName) {
    if (!AI.levels[levelName]) return;
    this.levelName = levelName;
    this.level = AI.levels[levelName];
  }

  reset() {
    this.x = this.tx = 0;
    this.y = 0.95;
    this.predictTimer = 0;
    this.incoming = false;
    this.reactionTimer = 0;
    this.cooldown = 0;
    this.corner = 1;
    this.syncMesh();
  }

  /**
   * @param {number} dt
   * @param {import('./physics.js').Ball} ball
   * @param {import('./rules.js').Rules} rules
   */
  update(dt, ball, rules) {
    if (this.cooldown > 0) this.cooldown -= dt;

    const heading = ball.vel.z < -0.2;
    if (heading && rules.phase === 'rally') {
      if (!this.incoming) {
        this.incoming = true;
        this.reactionTimer = 0;
      }
      this.reactionTimer += dt;

      // 预判球到达 CPU 拍面时的位置；横向是唯一需要移动自由度的轴
      this.predictTimer -= dt;
      if (this.predictTimer <= 0) {
        this.predictTimer = 1 / AI.predictHz;
        predictAtZ(ball, AI.paddleZ, _arrival);
        if (_arrival.ok) {
          const err = (Math.random() * 2 - 1) * this.level.aimError;
          this.tx = _arrival.x + err;
          this.y = clamp(_arrival.y, 0.45, 1.50);
        } else {
          this.tx = ball.pos.x;
        }
      }
    } else {
      this.incoming = false;
      this.tx = this.x * 0.98; // 球不在来路上，慢慢回中
    }

    // 反应延迟内不动
    const ready = !this.incoming || this.reactionTimer >= this.level.reactionDelay;
    if (ready) {
      const maxStep = this.level.maxSpeed * dt;
      const dx = this.tx - this.x;
      if (Math.abs(dx) > 1e-4) {
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), maxStep);
      }
    }
    this.x = clamp(this.x, -0.85, 0.85);

    if (!this.incoming) this.y += (0.95 - this.y) * Math.min(1, dt * 8);

    this.syncMesh();
  }

  syncMesh() {
    this.center.set(this.x, this.y, AI.paddleZ);
    this.mesh.position.copy(this.center);
    this.mesh.rotation.set(0.18, this.x * 0.3, this.x * 0.1);

    // 机器人站在拍子后方，跟着左右移动并稍微转身
    if (this.robot) {
      this.robot.position.set(this.x, 0.18, AI.paddleZ - 0.38);
      this.robot.rotation.y = this.x * 0.18;
    }
  }

  tryHit(ball, prev, rules) {
    if (this.cooldown > 0) return false;
    if (!rules.canHit('cpu')) return false;
    if (ball.vel.z >= -0.2) return false;

    const c = this.center;
    const d2 = distSqPointSegment(
      c.x, c.y, c.z,
      prev.x, prev.y, prev.z,
      ball.pos.x, ball.pos.y, ball.pos.z
    );
    const reach = CONFIG.paddle.cpuHitRadius + R;
    if (d2 > reach * reach) return false;

    // 故意漏球（难度越高概率越低）
    if (Math.random() < this.level.missChance) {
      this.cooldown = 0.25;
      return false;
    }

    this.strike(ball);
    this.cooldown = 0.22;
    return true;
  }

  strike(ball) {
    const lv = this.level;
    let tx;
    if (this.levelName === 'hard') {
      this.corner *= -1;
      tx = Math.random() < 0.25 ? 0 : this.corner * 0.62;
    } else {
      tx = (Math.random() * 2 - 1) * lv.targetHalfW;
    }
    const tz = lerp(lv.targetZ[0], lv.targetZ[1], Math.random());

    _target.set(clamp(tx, -0.72, 0.72), TABLE.topY, tz);
    const dist = _target.distanceTo(ball.pos);
    const time = clamp(0.42 + dist * 0.055, 0.40, 0.85);

    solveVelocity(ball.pos, _target, time, ball.vel);
    ball.spin.x = 40;
    ball.spin.y = (Math.random() * 2 - 1) * 60;
    clampSpeed(ball.vel);
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
