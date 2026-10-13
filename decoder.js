/**
 * decoder.js - 《三角洲行动》游戏声音实时摩斯密码听音与解码引擎
 * 采用 Web Audio API 进行频带滤波、能量检测、滞后阈值触发与摩斯时序状态机解码
 */

import { CODE_TO_DIGIT } from './morse.js';

export class MorseAudioDecoder {
  constructor(options = {}) {
    this.targetFreq = options.targetFreq || 750; // 目标中心频率 (Hz)，三角洲蜂鸣通常在 750Hz 左右
    this.filterQ = options.filterQ || 6.0;       // 窄带滤波 Q 值
    this.threshold = options.threshold || 0.20; // 能量触发阈值 (0.01 ~ 1.0)
    this.noiseFloor = 0.02;                     // 底噪基准线

    // 回调事件
    this.onSignalState = options.onSignalState || null;     // (state: { isHigh, energy, threshold, timeDomainData, freqData })
    this.onSymbolDetected = options.onSymbolDetected || null; // (symbol: '·' | '-', durationMs)
    this.onDigitDecoded = options.onDigitDecoded || null;   // (digit: string, currentFullCode: string, codeSymbols: string)
    this.onSequenceComplete = options.onSequenceComplete || null; // (fullCode: string)
    this.onError = options.onError || null;                 // (errorMsg: string)
    this.onStatusChange = options.onStatusChange || null;   // (status: 'idle' | 'listening' | 'paused')

    // Web Audio 节点
    this.audioCtx = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.bandpassFilter = null;
    this.analyserNode = null;

    // 运行状态
    this.isRunning = false;
    this.sourceType = 'none'; // 'system' | 'microphone'
    this.animationId = null;

    // 摩斯状态机变量
    this.isSignalHigh = false;
    this.highStartTime = 0;
    this.lowStartTime = 0;
    this.lastStateChangeTime = performance.now();

    // 收集中的点划与数字
    this.currentSymbols = '';     // 当前正在录入的点划 (如 "···")
    this.decodedDigits = '';      // 当前轮次已识别出的完整密码 (如 "382")
    this.isSequenceReported = false; // 避免长空白期间重复触发完成

    // 内部缓冲区
    this.timeData = null;
    this.freqData = null;
  }

  /**
   * 启动系统音频内录捕获 (getDisplayMedia)
   */
  async startSystemAudio() {
    this.stop();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('当前浏览器不支持系统音频捕获 (getDisplayMedia)。请使用现代 Chrome、Edge 或启用 HTTPS 访问。');
    }

    try {
      // 必须请求 video: true 才能在大部分浏览器弹出系统/窗口选择器
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        // 用户未勾选“共享音频”
        stream.getTracks().forEach(t => t.stop());
        throw new Error('未检测到音频轨道！请在共享选择窗口中务必勾选【同时共享系统音频】(Share system audio)。');
      }

      // 停止视频轨以极大节约 CPU 和显存
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(t => t.stop());

      // 监听用户点击浏览器“停止共享”
      audioTracks[0].addEventListener('ended', () => {
        this.stop();
      });

      this.mediaStream = stream;
      this.sourceType = 'system';
      await this.initAudioPipeline();
      this.setStatus('listening');
    } catch (err) {
      this.setStatus('idle');
      if (err.name === 'NotAllowedError') {
        throw new Error('用户取消了共享或未授予权限。');
      }
      throw err;
    }
  }

  /**
   * 启动麦克风 / 线性输入捕获 (getUserMedia)
   */
  async startMicrophone(deviceId = null) {
    this.stop();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风采集。请在 HTTPS 或本地环境下使用现代浏览器。');
    }

    try {
      const audioConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      };
      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      this.mediaStream = stream;
      this.sourceType = 'microphone';
      await this.initAudioPipeline();
      this.setStatus('listening');
    } catch (err) {
      this.setStatus('idle');
      if (err.name === 'NotAllowedError') {
        throw new Error('麦克风权限被拒绝，请在浏览器地址栏允许麦克风访问权限。');
      }
      throw err;
    }
  }

  /**
   * 初始化 Web Audio API 信号处理管线
   */
  async initAudioPipeline() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

    // 建立双二阶带通滤波器 (Bandpass Filter)
    this.bandpassFilter = this.audioCtx.createBiquadFilter();
    this.bandpassFilter.type = 'bandpass';
    this.bandpassFilter.frequency.setValueAtTime(this.targetFreq, this.audioCtx.currentTime);
    this.bandpassFilter.Q.setValueAtTime(this.filterQ, this.audioCtx.currentTime);

    // 建立频谱与时域分析器
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.3; // 适度平滑降噪

    // 连接管线：源 ➔ 窄带滤波 ➔ 分析器 (绝不连接 destination 避免麦克风回声)
    this.sourceNode.connect(this.bandpassFilter);
    this.bandpassFilter.connect(this.analyserNode);

    this.timeData = new Uint8Array(this.analyserNode.fftSize);
    this.freqData = new Uint8Array(this.analyserNode.frequencyBinCount);

    this.isRunning = true;
    this.isSignalHigh = false;
    this.highStartTime = 0;
    this.lowStartTime = performance.now();
    this.lastStateChangeTime = performance.now();
    this.currentSymbols = '';
    this.decodedDigits = '';
    this.isSequenceReported = false;

    this.processLoop();
  }

  /**
   * 设置中心滤波频率 (可在 500Hz ~ 1200Hz 之间动态微调)
   */
  setTargetFrequency(freq) {
    this.targetFreq = Math.max(400, Math.min(1500, freq));
    if (this.bandpassFilter && this.audioCtx) {
      this.bandpassFilter.frequency.setTargetAtTime(this.targetFreq, this.audioCtx.currentTime, 0.05);
    }
  }

  /**
   * 设置触发阈值 (0.02 ~ 0.90)
   */
  setThreshold(val) {
    this.threshold = Math.max(0.02, Math.min(0.95, val));
  }

  /**
   * 停止采集与处理
   */
  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (e) {}
      this.sourceNode = null;
    }
    if (this.bandpassFilter) {
      try { this.bandpassFilter.disconnect(); } catch (e) {}
      this.bandpassFilter = null;
    }
    if (this.analyserNode) {
      try { this.analyserNode.disconnect(); } catch (e) {}
      this.analyserNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) {}
      this.audioCtx = null;
    }
    this.sourceType = 'none';
    this.setStatus('idle');
  }

  /**
   * 清空当前识别进度
   */
  resetBuffer() {
    this.currentSymbols = '';
    this.decodedDigits = '';
    this.isSequenceReported = false;
  }

  setStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * 核心采样与解码循环 (requestAnimationFrame)
   */
  processLoop() {
    if (!this.isRunning) return;

    this.analyserNode.getByteTimeDomainData(this.timeData);
    this.analyserNode.getByteFrequencyData(this.freqData);

    // 1. 计算时域 RMS 能量与峰值
    let sumSquares = 0;
    let peak = 0;
    const len = this.timeData.length;
    for (let i = 0; i < len; i++) {
      const normalized = (this.timeData[i] - 128) / 128; // -1.0 ~ 1.0
      sumSquares += normalized * normalized;
      const absVal = Math.abs(normalized);
      if (absVal > peak) peak = absVal;
    }
    const rms = Math.sqrt(sumSquares / len);

    // 2. 结合中心频率处的频域能量加强信噪比
    // 频域 bin 计算: targetFreq / (nyquist / binCount)
    const nyquist = this.audioCtx.sampleRate / 2;
    const binIndex = Math.round((this.targetFreq / nyquist) * this.freqData.length);
    let freqEnergy = 0;
    // 取中心 bin 周围 3 个 bin 的均值
    let binCount = 0;
    for (let b = Math.max(0, binIndex - 2); b <= Math.min(this.freqData.length - 1, binIndex + 2); b++) {
      freqEnergy += this.freqData[b] / 255;
      binCount++;
    }
    freqEnergy = binCount > 0 ? freqEnergy / binCount : 0;

    // 综合能量指数 (时域 RMS * 0.5 + 频域带通能量 * 0.5)
    const combinedEnergy = rms * 0.4 + freqEnergy * 0.6;

    // 3. 滞后阈值比较 (Schmitt Trigger)
    const highThreshold = this.threshold;
    const lowThreshold = this.threshold * 0.65; // 滞后回差，避免毛刺

    const now = performance.now();

    if (!this.isSignalHigh && combinedEnergy >= highThreshold) {
      // 信号由低变高 (蜂鸣开始)
      const silenceDuration = now - this.lowStartTime;
      this.handleSilenceEnd(silenceDuration);

      this.isSignalHigh = true;
      this.highStartTime = now;
      this.lastStateChangeTime = now;
    } else if (this.isSignalHigh && combinedEnergy < lowThreshold) {
      // 信号由高变低 (蜂鸣结束)
      const toneDuration = now - this.highStartTime;
      this.handleToneEnd(toneDuration);

      this.isSignalHigh = false;
      this.lowStartTime = now;
      this.lastStateChangeTime = now;
    } else if (!this.isSignalHigh) {
      // 正在静音状态中，检测静音持续时间 (用于检测数字结束或整轮结束)
      const currentSilence = now - this.lowStartTime;
      this.handleOngoingSilence(currentSilence);
    }

    // 4. 回调当前帧状态给 UI 与示波器
    if (this.onSignalState) {
      this.onSignalState({
        isHigh: this.isSignalHigh,
        energy: combinedEnergy,
        threshold: this.threshold,
        timeData: this.timeData,
        freqData: this.freqData,
        currentSymbols: this.currentSymbols,
        decodedDigits: this.decodedDigits
      });
    }

    this.animationId = requestAnimationFrame(() => this.processLoop());
  }

  /**
   * 单音响起结束 (判断点·还是划-)
   * @param {number} durationMs 单音持续毫秒
   */
  handleToneEnd(durationMs) {
    // 过滤小于 35ms 的短噪点脉冲
    if (durationMs < 35) return;

    let symbol = '';
    // 标准游戏短音 ~125ms，长音 ~375ms
    // 分割阈值设为 210ms (允许 0.6x ~ 1.5x 语速波动)
    if (durationMs < 210) {
      symbol = '·';
    } else {
      symbol = '-';
    }

    this.currentSymbols += symbol;

    if (this.onSymbolDetected) {
      this.onSymbolDetected(symbol, durationMs);
    }

    // 若已经达到 5 位符号，立即结算一个数字 (摩斯数字固定由5位点划组成)
    if (this.currentSymbols.length === 5) {
      this.commitCurrentDigit();
    }
  }

  /**
   * 静音期结束 (新音符响起触发)
   */
  handleSilenceEnd(silenceDurationMs) {
    // 如果之前点划未满5个但遇到明显长停顿，说明可能有漏判或杂音，尝试容错
    if (this.currentSymbols.length > 0 && silenceDurationMs > 600) {
      // 超过 600ms 停顿应属于字符间停顿
      this.commitCurrentDigit();
    }
  }

  /**
   * 持续静音检测 (处理字符间隔、长空白轮次结束)
   */
  handleOngoingSilence(silenceDurationMs) {
    // 1. 如果缓冲区有点划但不足 5 位，且静音超过 650ms，自动触发提交
    if (this.currentSymbols.length > 0 && silenceDurationMs > 650) {
      this.commitCurrentDigit();
    }

    // 2. 长空白判别律：三角洲每轮播完有一段约 2.0s ~ 3.0s 的绝对长空白
    if (this.decodedDigits.length >= 3 && silenceDurationMs > 2100 && !this.isSequenceReported) {
      this.isSequenceReported = true;
      if (this.onSequenceComplete) {
        this.onSequenceComplete(this.decodedDigits);
      }
    }

    // 若静音超过 4 秒且无新声音，重置轮次状态以准备下一轮
    if (silenceDurationMs > 4500 && this.isSequenceReported) {
      this.decodedDigits = '';
      this.isSequenceReported = false;
    }
  }

  /**
   * 提交当前 5 位点划并翻译为数字
   */
  commitCurrentDigit() {
    if (!this.currentSymbols) return;

    const code = this.currentSymbols;
    this.currentSymbols = '';

    const digit = CODE_TO_DIGIT[code];
    if (digit !== undefined) {
      this.decodedDigits += digit;
      this.isSequenceReported = false;
      if (this.onDigitDecoded) {
        this.onDigitDecoded(digit, this.decodedDigits, code);
      }
    }
  }
}
