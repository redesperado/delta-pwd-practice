/**
 * audio.js - Web Audio API 音频引擎与战场环境音合成器 (三角洲特种强化版)
 */

class TacticalAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;

    // 经典真实三角洲电报音参数
    this.frequency = 750;       // 蜂鸣器音调 (Hz)，清脆高频
    this.volume = 0.8;          // 蜂鸣器音量 (0.0 ~ 1.0)
    this.unitTime = 0.125;      // 基准短音(dot)时长 (秒)，约 125ms，速度适中沉稳，符合游戏真实节奏
    this.speedRatio = 1.0;      // 播放速度倍率

    // 环境噪音节点
    this.ambientNoiseGain = null;
    this.ambientSource = null;
    this.ambientVolume = 0.15;
    this.isAmbientEnabled = false;

    // 排他任务会话控制 (绝对杜绝声音重叠与双重光标)
    this.currentSessionId = 0;
    this.previewSessionId = 0;   // 独立小抄预览会话ID，互不干扰
    this.isPlaying = false;
    this.isLooping = true;
    this.currentOsc = null;
    this.currentGain = null;

    // 事件回调
    this.onStateChange = null;   // (isPlaying) => {}
    this.onSymbolActive = null;  // ({ type, charIndex, symbolIndex, digit, duration }) => {}
    this.onSymbolInactive = null;// () => {}
    this.onCyclePause = null;    // (isPausing, remainingSeconds) => {}
    this.onSequenceComplete = null;
  }

  /**
   * 初始化/恢复音频上下文
   */
  async ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.initAmbientNoiseChain();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * 初始化战场环境底噪合成器
   */
  initAmbientNoiseChain() {
    if (!this.ctx) return;

    const bufferSize = this.ctx.sampleRate * 5;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    this.ambientSource = this.ctx.createBufferSource();
    this.ambientSource.buffer = noiseBuffer;
    this.ambientSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, this.ctx.currentTime);

    this.ambientNoiseGain = this.ctx.createGain();
    this.ambientNoiseGain.gain.setValueAtTime(
      this.isAmbientEnabled ? this.ambientVolume : 0.0001,
      this.ctx.currentTime
    );

    this.ambientSource.connect(filter);
    filter.connect(this.ambientNoiseGain);
    this.ambientNoiseGain.connect(this.ctx.destination);
    this.ambientSource.start(0);
  }

  setAmbientNoise(enabled, volume = null) {
    if (volume !== null) this.ambientVolume = volume;
    this.isAmbientEnabled = enabled;

    if (this.ambientNoiseGain && this.ctx) {
      const targetVol = this.isAmbientEnabled ? this.ambientVolume : 0.0001;
      this.ambientNoiseGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.ambientNoiseGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
    }
  }

  setFrequency(freq) {
    this.frequency = Math.max(400, Math.min(1200, freq));
  }

  setSpeed(ratio) {
    this.speedRatio = Math.max(0.5, Math.min(2.0, ratio));
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * 彻底停止所有正在发声的音调与后台异步序列 (排他切断)
   */
  stop() {
    this.currentSessionId++;
    this.isPlaying = false;

    // 强行切断当前发声音频节点
    if (this.currentOsc) {
      try {
        this.currentOsc.stop();
        this.currentOsc.disconnect();
      } catch (e) {}
      this.currentOsc = null;
    }

    if (this.currentGain) {
      try {
        this.currentGain.gain.cancelScheduledValues(this.ctx?.currentTime || 0);
        this.currentGain.gain.setValueAtTime(0.0001, this.ctx?.currentTime || 0);
        this.currentGain.disconnect();
      } catch (e) {}
      this.currentGain = null;
    }

    if (this.onSymbolInactive) this.onSymbolInactive();
    if (this.onCyclePause) this.onCyclePause(false, 0);
    if (this.onStateChange) this.onStateChange(false);
  }

  /**
   * 播放单次蜂鸣音（支持被 stop() 瞬间中断）
   */
  async playTone(durationSeconds, sessionId) {
    if (this.currentSessionId !== sessionId) return;
    await this.ensureContext();
    if (this.currentSessionId !== sessionId) return;

    return new Promise((resolve) => {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      this.currentOsc = osc;
      this.currentGain = gain;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.frequency, now);

      const attack = 0.005;
      const release = 0.005;
      const safeDuration = Math.max(durationSeconds, 0.02);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1.0, now + attack);
      gain.gain.setValueAtTime(1.0, now + safeDuration - release);
      gain.gain.linearRampToValueAtTime(0.0001, now + safeDuration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (e) {}
        if (this.currentOsc === osc) this.currentOsc = null;
        if (this.currentGain === gain) this.currentGain = null;
        resolve();
      };

      osc.onended = cleanup;
      osc.start(now);
      osc.stop(now + safeDuration);

      // 如果会话在发音中途被切换，立即提前触发清理
      const checkInterval = setInterval(() => {
        if (this.currentSessionId !== sessionId) {
          clearInterval(checkInterval);
          try { osc.stop(0); } catch (e) {}
          cleanup();
        }
      }, 20);
    });
  }

  /**
   * 安全可中断延时休眠
   */
  sleep(ms, sessionId) {
    return new Promise((resolve) => {
      let timer = null;
      let checkTimer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (checkTimer) clearInterval(checkTimer);
        resolve();
      };

      timer = setTimeout(cleanup, ms);

      // 每 25ms 快速检查一次会话令牌，若会话已变则立即退出
      checkTimer = setInterval(() => {
        if (this.currentSessionId !== sessionId) {
          cleanup();
        }
      }, 25);
    });
  }

  /**
   * 播放一串符号序列（支持循环播放与真实的轮次长停顿）
   */
  async playSequence(events, loop = true) {
    this.stop();
    await this.ensureContext();

    const sessionId = ++this.currentSessionId;
    this.isPlaying = true;
    this.isLooping = loop;

    if (this.onStateChange) this.onStateChange(true);

    try {
      do {
        if (this.currentSessionId !== sessionId) break;

        for (const event of events) {
          if (this.currentSessionId !== sessionId) break;

          const baseDuration = (this.unitTime * event.durationUnits) / this.speedRatio;

          if (event.type === 'dot' || event.type === 'dash') {
            if (this.onSymbolActive) {
              this.onSymbolActive({
                type: event.type,
                charIndex: event.charIndex,
                symbolIndex: event.symbolIndex,
                digit: event.digit,
                duration: baseDuration
              });
            }

            await this.playTone(baseDuration, sessionId);

            if (this.currentSessionId !== sessionId) break;
            if (this.onSymbolInactive) this.onSymbolInactive();

          } else if (event.type === 'loop-space') {
            // 一整轮播完之后的长停顿空白（约2.5~3秒）
            if (this.isLooping) {
              if (this.onCyclePause) {
                this.onCyclePause(true, baseDuration);
              }
              await this.sleep(baseDuration * 1000, sessionId);
              if (this.onCyclePause) {
                this.onCyclePause(false, 0);
              }
            }
          } else {
            // 符号内停顿或数字间停顿
            await this.sleep(baseDuration * 1000, sessionId);
          }
        }

        if (this.currentSessionId !== sessionId) break;
        if (this.onSequenceComplete) this.onSequenceComplete();

      } while (this.isLooping && this.currentSessionId === sessionId);

    } finally {
      if (this.currentSessionId === sessionId) {
        this.isPlaying = false;
        if (this.onSymbolInactive) this.onSymbolInactive();
        if (this.onCyclePause) this.onCyclePause(false, 0);
        if (this.onStateChange) this.onStateChange(false);
      }
    }
  }

  /**
   * 独立轻量试听方法 (专供右下角小抄/速查使用)
   * 播放完自己停止，完全不触发 onStateChange，不改变主界面播放按钮文案，不影响轮次状态
   */
  async previewSequence(events) {
    await this.ensureContext();
    const prevId = ++this.previewSessionId;

    try {
      for (const event of events) {
        if (this.previewSessionId !== prevId) break;

        const baseDuration = (this.unitTime * event.durationUnits) / this.speedRatio;
        if (event.type === 'dot' || event.type === 'dash') {
          await this.playPreviewTone(baseDuration, prevId);
        } else {
          await this.sleepPreview(baseDuration * 1000, prevId);
        }
      }
    } catch (e) {}
  }

  async playPreviewTone(durationSeconds, prevId) {
    if (this.previewSessionId !== prevId) return;
    await this.ensureContext();
    if (this.previewSessionId !== prevId) return;

    return new Promise((resolve) => {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.frequency, now);

      const attack = 0.005;
      const release = 0.005;
      const safeDuration = Math.max(durationSeconds, 0.02);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.9, now + attack);
      gain.gain.setValueAtTime(0.9, now + safeDuration - release);
      gain.gain.linearRampToValueAtTime(0.0001, now + safeDuration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (e) {}
        resolve();
      };

      osc.onended = cleanup;
      osc.start(now);
      osc.stop(now + safeDuration);

      const checkTimer = setInterval(() => {
        if (this.previewSessionId !== prevId) {
          clearInterval(checkTimer);
          try { osc.stop(0); } catch (e) {}
          cleanup();
        }
      }, 25);
    });
  }

  sleepPreview(ms, prevId) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      const checkTimer = setInterval(() => {
        if (this.previewSessionId !== prevId) {
          clearTimeout(timer);
          clearInterval(checkTimer);
          resolve();
        }
      }, 25);
    });
  }

  async playKeypadClick() {
    await this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.025);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.025);
  }

  async playSuccessSound() {
    await this.ensureContext();
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987, now);
    gain1.gain.setValueAtTime(0.5, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 0.12);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318, now + 0.1);
    gain2.gain.setValueAtTime(0.6, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.35);
  }

  async playErrorSound() {
    await this.ensureContext();
    const now = this.ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const startTime = now + (i * 0.14);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, startTime);

      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.09);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.09);
    }
  }
}

export const audioEngine = new TacticalAudioEngine();
