/**
 * player.js — 玩家只需要左右控拍。
 * 高度由 predictAtZ() 自动跟球，前后位置固定；单击开启挥拍窗口。
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { solveVelocity, clampSpeed, distSqPointSegment, predictAtZ, TABLE } from './physics.js';

const P = CONFIG.paddle;
const SHOT = CONFIG.shot;
const R = CONFIG.physics.ballRadius;

const _target = new THREE.Vector3();
const _arrival = { ok: false, x: 0, y: 0, t: 0 };

export class PlayerController {
  constructor(world) {
    this.mesh = world.playerPaddle;

    this.x = 0;
    this.y = 1.05;
    this.z = P.fixedZ;
    this.tx = 0;

    this.ndcX = 0;
    /** 鼠标横向速度（NDC/s），用于甩拍带角度与侧旋 */
    this.ndcVelX = 0;
    this._lastNdcX = 0;

    /** 当前是否在高度辅助状态（球正飞向玩家） */
    this.autoHeight = false;

    /** 单击后的可击球窗口剩余时间（s） */
    this.swingTimer = 0;
    /** 挥拍动画进度 1 → 0 */
    this.swing = 0;

    this.center = new THREE.Vector3();
    this.syncMesh();
  }

  /** 鼠标横向位置（NDC，-1..1）。纵向输入已不再使用。 */
  setMouse(ndcX) {
    this.ndcX = ndcX;
  }

  reset() {
    this.x = this.tx = 0;
    this.y = 1.05;
    this.z = P.fixedZ;
    this.ndcVelX = 0;
    this.autoHeight = false;
    this.swingTimer = 0;
    this.syncMesh();
  }

  /** 单击：开启一段宽松的挥拍窗口；窗口内球到位就自动击球 */
  requestSwing() {
    this.swingTimer = P.swingWindow;
    this.swing = 1;
  }

  /**
   * @param {number} dt
   * @param {{a:boolean,d:boolean}} keys
   * @param {import('./physics.js').Ball} ball
   * @param {import('./rules.js').Rules} rules
   */
  update(dt, keys, ball, rules) {
    // 鼠标横向速度（用于甩拍角度与侧旋）
    const rawVel = (this.ndcX - this._lastNdcX) / Math.max(dt, 1e-4);
    this._lastNdcX = this.ndcX;
    this.ndcVelX += (rawVel - this.ndcVelX) * Math.min(1, dt * 18);

    // 横向：鼠标 1:1 控制
    const lateral = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    this.tx = clamp(this.ndcX * P.maxX + lateral * P.lateralAssist, P.minX, P.maxX);
    const k = 1 - Math.exp(-P.followRate * dt);
    this.x += (this.tx - this.x) * k;

    // 高度自动跟球；单击后横向也自动咬住来球，点早了一样能接到
    const incoming = rules.phase === 'rally' && ball.vel.z > 0.2;
    this.autoHeight = false;
    if (incoming) {
      predictAtZ(ball, this.z, _arrival);
      if (_arrival.ok) {
        this.y = clamp(_arrival.y, P.minY, P.maxY);
        this.autoHeight = true;
        if (this.swingTimer > 0) {
          const lockX = clamp(_arrival.x, P.minX, P.maxX);
          const kLock = 1 - Math.exp(-P.lockRate * dt);
          this.x += (lockX - this.x) * kLock;
          this.tx = this.x;
        }
      }
    }
    if (!this.autoHeight) {
      this.y += (1.05 - this.y) * Math.min(1, dt * 8);
    }

    // 单击挥拍窗口（0.6 s，宽松）
    if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - dt);
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 5);

    this.syncMesh();
  }

  syncMesh() {
    this.center.set(this.x, this.y, this.z);
    this.mesh.position.copy(this.center);
    this.mesh.rotation.set(-0.18 + this.swing * 0.5, -this.x * 0.35, -this.x * 0.12);
  }

  /**
   * 命中判定 + 击球。
   * @returns {boolean} 是否击球
   */
  tryHit(ball, prev, rules) {
    if (!rules.canHit('player')) return false;
    if (this.swingTimer <= 0) return false; // 必须点过鼠标
    if (ball.vel.z <= 0.2) return false;

    const c = this.center;
    const d2 = distSqPointSegment(
      c.x, c.y, c.z,
      prev.x, prev.y, prev.z,
      ball.pos.x, ball.pos.y, ball.pos.z
    );
    const reach = P.hitRadius + R;
    if (d2 > reach * reach) return false;

    this.strike(ball);
    return true;
  }

  /** 把球打出去：由落点反解初速度 */
  strike(ball) {
    const power = SHOT.clickPower;

    const nudge = clamp(this.ndcVelX * SHOT.aimNudgeK, -SHOT.aimNudgeMax, SHOT.aimNudgeMax);
    const tx = clamp(-this.x * SHOT.paddleToTarget + nudge, -SHOT.targetHalfW, SHOT.targetHalfW);
    const tz = -lerp(SHOT.nearZ, SHOT.farZ, power);
    _target.set(tx, TABLE.topY, tz);

    const dist = _target.distanceTo(ball.pos);
    let time = lerp(SHOT.minTime, SHOT.maxTime, power) * (1 + SHOT.distFactor * dist);
    time = clamp(time, SHOT.timeClamp[0], SHOT.timeClamp[1]);

    solveVelocity(ball.pos, _target, time, ball.vel);

    ball.spin.x = SHOT.topSpin;
    ball.spin.y = clamp(-this.ndcVelX * SHOT.sideSpinK, -260, 260);

    clampSpeed(ball.vel);

    this.swingTimer = 0;
    this.swing = 1;
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
