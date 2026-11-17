/**
 * rules.js — 计分、发球轮换、回合状态机。
 * 只有这个模块能改 score / server；其他模块只发事件。
 */
import { CONFIG } from './config.js';

const R = CONFIG.rules;

/** 回合内的击球方与落点计数 */
export class Rules {
  constructor() {
    this.firstServer = 'player';
    this.reset();
  }

  reset() {
    this.playerScore = 0;
    this.cpuScore = 0;
    /** 'serve' | 'rally' | 'point' | 'over' */
    this.phase = 'serve';
    this.server = this.firstServer;
    this.winner = null;
    this.message = '';
    this.reason = '';
    this.pointTimer = 0;

    /** 当前回合最后一次击球方 */
    this.hitter = null;
    /** 落在击球方自己半场的次数 */
    this.bouncesHitter = 0;
    /** 落在接球方半场的次数 */
    this.bouncesReceiver = 0;
    /** 是否处于「发球后、尚未落对方台面」的阶段 */
    this.serveInFlight = false;
    this.totalPoints = 0;
  }

  /** 换发球的间隔（10:10 之后每分换） */
  serveSwitchInterval() {
    const deuce = this.playerScore >= R.targetScore - 1 && this.cpuScore >= R.targetScore - 1;
    return deuce ? R.serveSwitchDeuce : R.serveSwitch;
  }

  /** 根据已打的总分推导该谁发球 */
  computeServer() {
    const idx = Math.floor(this.totalPoints / this.serveSwitchInterval());
    return idx % 2 === 0 ? this.firstServer : other(this.firstServer);
  }

  /** 进入发球准备 */
  beginServe() {
    this.phase = 'serve';
    this.server = this.computeServer();
    this.hitter = this.server;
    this.bouncesHitter = 0;
    this.bouncesReceiver = 0;
    this.serveInFlight = true;
    this.reason = '';
    this.message = this.server === 'player' ? '单击 发球' : 'CPU 发球…';
  }

  /** 发球出手 */
  launch() {
    this.phase = 'rally';
    this.message = '';
  }

  /** 某人能否击球：必须是接球方，且球已在自己半场弹起过 */
  canHit(side) {
    if (this.phase !== 'rally') return false;
    if (this.hitter === side) return false;
    return this.bouncesReceiver >= 1;
  }

  /** 登记一次击球 */
  registerHit(side) {
    this.hitter = side;
    this.bouncesHitter = 0;
    this.bouncesReceiver = 0;
    this.serveInFlight = false;
    this.phase = 'rally';
  }

  /**
   * 登记一次台面弹跳。
   * @param {'player'|'cpu'} side - 弹跳发生在哪一侧
   * @returns {boolean} 是否因此产生了得分
   */
  registerBounce(side) {
    if (this.phase !== 'rally') return false;

    if (side === this.hitter) {
      // 落在击球方自己半场
      if (this.serveInFlight && this.bouncesHitter === 0) {
        this.bouncesHitter = 1; // 合法：发球第一落点
        return false;
      }
      this.award(other(this.hitter), this.serveInFlight ? 'serve_double_bounce' : 'own_side');
      return true;
    }

    // 落在接球方半场
    if (this.serveInFlight && this.bouncesHitter === 0) {
      this.award(other(this.hitter), 'serve_no_bounce');
      return true;
    }
    this.serveInFlight = false;
    this.bouncesReceiver += 1;
    if (this.bouncesReceiver >= 2) {
      this.award(this.hitter, 'double_bounce');
      return true;
    }
    return false;
  }

  /** 球落地（死球） */
  registerDead() {
    if (this.phase !== 'rally') return false;
    if (this.bouncesReceiver >= 1) {
      this.award(this.hitter, 'no_return');
    } else {
      this.award(other(this.hitter), this.serveInFlight ? 'serve_fault' : 'out');
    }
    return true;
  }

  /** 判一分 */
  award(who, reason) {
    if (this.phase === 'over' || this.phase === 'point') return;
    if (who === 'player') this.playerScore += 1;
    else this.cpuScore += 1;
    this.totalPoints += 1;
    this.reason = reason;
    this.phase = 'point';
    this.pointTimer = R.pointPause;
    this.message = reasonText(reason, who);

    if (this.hasWinner()) {
      this.winner = this.playerScore > this.cpuScore ? 'player' : 'cpu';
      this.phase = 'over';
    }
  }

  hasWinner() {
    const p = this.playerScore;
    const c = this.cpuScore;
    const hi = Math.max(p, c);
    const lo = Math.min(p, c);
    return hi >= R.targetScore && hi - lo >= R.winBy;
  }

  /** 推进计时（每物理步调用） */
  advance(dt) {
    if (this.phase !== 'point') return;
    this.pointTimer -= dt;
    if (this.pointTimer > 0) return;
    if (this.winner) {
      this.phase = 'over';
      return;
    }
    this.beginServe();
  }
}

function other(side) {
  return side === 'player' ? 'cpu' : 'player';
}

function reasonText(reason, who) {
  const to = who === 'player' ? '你' : 'CPU';
  switch (reason) {
    case 'own_side': return `${to === '你' ? 'CPU' : '你'}回球落在自己半场 — ${to}得分`;
    case 'double_bounce': return `${to === '你' ? 'CPU' : '你'}两次没接住 — ${to}得分`;
    case 'no_return': return `${to === '你' ? 'CPU' : '你'}没能接回 — ${to}得分`;
    case 'out': return `球出台 — ${to}得分`;
    case 'serve_fault': return `发球失误 — ${to}得分`;
    case 'serve_no_bounce': return `发球未先落己方台面 — ${to}得分`;
    case 'serve_double_bounce': return `发球两次落己方台面 — ${to}得分`;
    default: return `${to}得分`;
  }
}

export { other as otherSide };
