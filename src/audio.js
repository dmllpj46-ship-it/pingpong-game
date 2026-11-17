/**
 * audio.js — WebAudio 合成音效。不加载任何外部音频文件。
 * 浏览器要求用户手势后才能出声，故首次点击时 ensure()。
 */
import { CONFIG } from './config.js';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = CONFIG.audio.enabled;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.volume;
    this.master.connect(this.ctx.destination);

    // 预生成一段白噪声，用于击球/触网的「啪」
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    this.noiseBuf = buf;
  }

  /** 击球：噪声爆点 + 短促音调，力度越大越亮 */
  hit(power = 0.5) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = Math.max(0, Math.min(1, power));

    this._noise(t, 0.05, 1400 + p * 2200, 0.16 + p * 0.16);
    this._tone(t, 620 + p * 420, 0.07, 'triangle', 0.10 + p * 0.08, 380);
  }

  /** 台面弹跳：闷一点、短一点 */
  bounce() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.035, 900, 0.09);
    this._tone(t, 320, 0.045, 'sine', 0.07, 220);
  }

  /** 触网：低沉的沙沙声 */
  net() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, 0.09, 420, 0.10);
  }

  /** 得分提示音 */
  point(playerScored) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (playerScored) {
      this._tone(t, 660, 0.10, 'sine', 0.14);
      this._tone(t + 0.10, 990, 0.14, 'sine', 0.12);
    } else {
      this._tone(t, 300, 0.14, 'sine', 0.12);
      this._tone(t + 0.10, 210, 0.18, 'sine', 0.10);
    }
  }

  _tone(t, freq, dur, type, gain, slideTo) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(t, dur, filterFreq, gain) {
    if (!this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = filterFreq;
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.01);
  }
}
