/**
 * hud.js — DOM 覆盖层：比分、挥拍窗口条、提示、菜单。
 * 不用 canvas 画字（文字交给浏览器排版，清晰且免费）。
 */
export class Hud {
  constructor() {
    this.pScore = document.getElementById('pScore');
    this.cScore = document.getElementById('cScore');
    this.difficulty = document.getElementById('difficulty');
    this.message = document.getElementById('message');
    this.powerFill = document.getElementById('powerFill');
    this.powerWrap = document.getElementById('powerWrap');
    this.serveDotP = document.getElementById('serveDotP');
    this.serveDotC = document.getElementById('serveDotC');
    this.overlay = document.getElementById('overlay');
    this.pauseEl = document.getElementById('pause');
    this.resultEl = document.getElementById('result');
    this.debugEl = document.getElementById('debug');
    this.fpsEl = document.getElementById('fps');
  }

  setScore(p, c) {
    this.pScore.textContent = p;
    this.cScore.textContent = c;
  }

  setDifficulty(label) {
    this.difficulty.textContent = label;
  }

  setMessage(text) {
    this.message.textContent = text || '';
    this.message.style.opacity = text ? '1' : '0';
  }

  /** 挥拍窗口指示：单击后从 1 递减到 0 */
  setSwing(v) {
    this.powerFill.style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`;
    this.powerWrap.classList.toggle('charging', v > 0.02);
  }

  setServer(side) {
    this.serveDotP.classList.toggle('on', side === 'player');
    this.serveDotC.classList.toggle('on', side === 'cpu');
  }

  showOverlay(show) {
    this.overlay.classList.toggle('hidden', !show);
  }

  showPause(show) {
    this.pauseEl.classList.toggle('hidden', !show);
  }

  showResult(winner, p, c) {
    const win = winner === 'player';
    this.resultEl.innerHTML = `
      <h2>${win ? '你赢了' : 'CPU 赢了'}</h2>
      <p class="final">${p} : ${c}</p>
      <p class="hint">按 R 再来一局</p>`;
    this.resultEl.classList.remove('hidden');
  }

  hideResult() {
    this.resultEl.classList.add('hidden');
  }

  setDebug(text) {
    if (!this.debugEl) return;
    this.debugEl.textContent = text;
    this.debugEl.classList.toggle('hidden', !text);
  }

  setFps(fps) {
    if (!this.fpsEl) return;
    this.fpsEl.textContent = fps.toFixed(0) + ' fps';
  }
}
