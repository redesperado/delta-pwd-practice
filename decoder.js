/**
 * decoder.js - 《三角洲行动》游戏声音实时摩斯密码听音与解码引擎
 * 采用 Web Audio API 进行频带滤波、能量检测、滞后阈值触发与高容错摩斯时序状态机解码
 * 深度优化：支持 ScriptProcessor 驱动后台长效免休眠监听，杜绝切屏至游戏时被浏览器冻结
 * 算法升级：
 * 1. 校准三角洲行动官方摩斯密码房真实蜂鸣频率 (~1570Hz, 1550~1575Hz)
 * 2. 引入自适应动态信噪比门限 (CFAR / AGC)，实时跟踪游戏背景底噪与蜂鸣峰值，杜绝固定阈值失效
 * 3. 引入 Goertzel 单频共振与频谱峰值比 (Peakiness) 检测，精准过滤人声交流、枪声低音与环境嗡鸣
 * 4. 支持 750Hz~1800Hz 智能载波自动锁频 (Auto Frequency Tracking) 与官方 1570Hz / 1000Hz / 750Hz 预设
 */

import { CODE_TO_DIGIT, MORSE_DIGITS } from './morse.js';

export class MorseAudioDecoder {
  constructor(options = {}) {
    // 目标中心频率 (Hz)：三角洲行动真实摩斯蜂鸣官方音高为 1570Hz (1550~1575Hz)
    this.targetFreq = options.targetFreq || 1570;
    this.filterQ = options.filterQ || 1.4;       // 宽通滤波 Q 值
    this.autoTracking = options.autoTracking !== false; // 默认开启智能锁频
    this.detectedFreq = 1570;                   // 实时自动侦测到的峰值载波频率

    // 自适应信噪比与动态门限参数 (CFAR / AGC)
    this.noiseFloor = 0.002;                    // 初始背景底噪
    this.signalPeak = 0.025;                    // 初始蜂鸣峰值强度
    this.sensitivityMultiplier = options.sensitivityMultiplier || 0.35; // 触发门限系数 (0.18 ~ 0.55，默认 0.35)

    // 回调事件
    this.onSignalState = options.onSignalState || null;     // (state: { isHigh, energy, threshold, timeData, freqData, detectedFreq, targetFreq, noiseFloor, signalPeak, snr })
    this.onSymbolDetected = options.onSymbolDetected || null; // (symbol: '·' | '-', durationMs)
    this.onDigitDecoded = options.onDigitDecoded || null;   // (digit: string, currentFullCode: string, codeSymbols: string, rawSymbols: string)
    this.onSequenceComplete = options.onSequenceComplete || null; // (fullCode: string)
    this.onError = options.onError || null;                 // (errorMsg: string)
    this.onStatusChange = options.onStatusChange || null;   // (status: 'idle' | 'listening' | 'paused')

    // Web Audio 节点
    this.audioCtx = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.bandpassFilter = null;
    this.analyserNode = null;
    this.scriptProcessor = null;
    this.silentGain = null;

    // 运行状态
    this.isRunning = false;
    this.sourceType = 'none'; // 'system' | 'microphone'
    this.animationId = null;
    this.latestState = null;
    this.lastProcessTime = 0;
    this.lastTrackTime = 0;

    // 摩斯状态机变量 (毫秒时钟)
    this.isSignalHigh = false;
    this.highStartTime = 0;
    this.lowStartTime = performance.now();
    this.lastStateChangeTime = performance.now();

    // 真实游戏校准时序常量 (基于真实三角洲密码房录音标定)
    // 点音 (Dot): 60ms ~ 130ms (典型 ~85ms)
    // 划音 (Dash): 180ms ~ 420ms (典型 ~280ms)
    // 点划判定分界: 160ms (<160ms 为点，>=160ms 为划)
    // 字符微停顿 (Intra-char): 60ms ~ 120ms (典型 ~85ms)
    // 数字间停顿 (Inter-digit): 300ms ~ 600ms (典型 ~450ms)
    // 轮次间长停顿 (Inter-cycle): 2800ms ~ 6000ms (典型 ~3.5s)
    this.dotDashSplitMs = 160;
    this.minPulseMs = 35;        // 剔除 <35ms 偶发杂音毛刺
    this.maxPulseMs = 650;       // 剔除 >650ms 持续性长杂音
    this.charGapThresholdMs = 220; // 停顿超 220ms 结算当前数字
    this.cycleGapThresholdMs = 1400; // 停顿超 1400ms 判定整组密码播报结束

    // 收集中的点划与数字
    this.currentSymbols = '';     // 当前正在录入的点划 (如 "···")
    this.decodedDigits = '';      // 当前轮次已识别出的完整密码 (如 "382")
    this.isSequenceReported = false; // 避免长空白期间重复触发完成

    // 内部缓冲区 (提前预分配，杜绝未挂载分析器时调用空指针异常)
    this.timeData = new Uint8Array(512);
    this.freqData = new Uint8Array(256);
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
        stream.getTracks().forEach(t => t.stop());
        throw new Error('未检测到音频轨道！请在共享选择窗口中务必勾选【同时共享系统音频】(Share system audio)。建议选择【整个屏幕】并勾选左下角音频共享。');
      }

      // 注意：切勿主动关闭视频轨！Chromium 机制下关闭视频轨会导致屏幕捕获会话被直接销毁，连带导致音频轨被系统切断
      // 保持视频轨在后台存在且不渲染，CPU 占用微乎其微
      const videoTracks = stream.getVideoTracks();
      if (videoTracks && videoTracks.length > 0) {
        videoTracks[0].addEventListener('ended', () => {
          this.stop();
        });
      }

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

      const audioTracks = stream.getAudioTracks();
      if (audioTracks && audioTracks.length > 0) {
        audioTracks[0].addEventListener('ended', () => {
          this.stop();
        });
      }

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
   * 采用 ScriptProcessorNode 驱动后台免休眠实时解码
   */
  async initAudioPipeline() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!this.audioCtx) {
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.audioCtx.onstatechange = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended' && this.isRunning) {
        this.audioCtx.resume().catch(() => {});
      }
    };

    // 建立带通滤波器 (宽通 Q=1.4，平坦过渡，保证蜂鸣信号无衰减通过)
    this.bandpassFilter = this.audioCtx.createBiquadFilter();
    this.bandpassFilter.type = 'bandpass';
    this.bandpassFilter.frequency.setValueAtTime(this.targetFreq, this.audioCtx.currentTime);
    this.bandpassFilter.Q.setValueAtTime(this.filterQ, this.audioCtx.currentTime);

    // 建立频谱与时域分析器
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.15;

    // 建立后台音频处理节点 (1024 样本在 48kHz 下约为 21.3ms，时间分辨率极其锐利)
    this.scriptProcessor = this.audioCtx.createScriptProcessor(1024, 1, 1);
    this.silentGain = this.audioCtx.createGain();
    this.silentGain.gain.setValueAtTime(0, this.audioCtx.currentTime); // 0 增益确保不发出回声

    // 连接外部媒体源 (如果有)
    if (this.mediaStream) {
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.bandpassFilter);
    }

    // 滤波器 ➔ 分析器 ➔ 处理节点 ➔ 静音输出 ➔ 扬声器(维持硬件时钟)
    this.bandpassFilter.connect(this.analyserNode);
    this.bandpassFilter.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.silentGain);
    this.silentGain.connect(this.audioCtx.destination);

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
    this.lastProcessTime = performance.now();
    this.lastTrackTime = performance.now();

    // 硬件时钟持续驱动分析
    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isRunning) return;
      const channelData = e.inputBuffer ? e.inputBuffer.getChannelData(0) : null;
      this.analyzeFrame(performance.now(), channelData);
    };

    // UI 示波器渲染循环
    this.renderLoop();
  }

  /**
   * 计算指定频率的 Goertzel 单频共振能量
   */
  calcToneEnergy(pcm, freq, sampleRate = 48000) {
    const len = pcm.length;
    const w = (2 * Math.PI * freq) / sampleRate;
    const c = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < len; i++) {
      const s = pcm[i] + c * s1 - s2;
      s2 = s1;
      s1 = s;
    }
    return Math.sqrt(Math.max(0, s2 * s2 + s1 * s1 - c * s1 * s2)) / (len / 2);
  }

  /**
   * 扫描 750Hz ~ 1800Hz 频段，自动探测并锁定纯音峰值
   */
  detectDominantFrequency(pcm, sampleRate = 48000) {
    let maxE = 0;
    let bestF = this.targetFreq;
    let totalE = 0;
    let count = 0;

    for (let f = 750; f <= 1800; f += 25) {
      const e = this.calcToneEnergy(pcm, f, sampleRate);
      totalE += e;
      count++;
      if (e > maxE) {
        maxE = e;
        bestF = f;
      }
    }
    const avgE = totalE / count;
    const peakiness = maxE / (avgE + 0.00001); // 纯音尖锐度比值
    return { freq: bestF, energy: maxE, peakiness };
  }

  setTargetFrequency(freq, isAuto = false) {
    if (freq === 'auto') {
      this.autoTracking = true;
      return;
    }
    this.autoTracking = isAuto;
    const num = parseInt(freq, 10);
    if (!isNaN(num)) {
      this.targetFreq = Math.max(500, Math.min(2200, num));
      this.detectedFreq = this.targetFreq;
      if (this.bandpassFilter && this.audioCtx) {
        this.bandpassFilter.frequency.setTargetAtTime(this.targetFreq, this.audioCtx.currentTime, 0.05);
      }
    }
  }

  /**
   * 设置灵敏度 (0.10 ~ 0.90)
   * 灵敏度越高，触发所需信噪比门限越低
   */
  setSensitivity(val) {
    // 0.10 对应高门限 0.52 (迟钝/抗杂音)
    // 0.90 对应低门限 0.20 (灵敏/微弱音)
    const normalized = Math.max(0.1, Math.min(0.9, val));
    this.sensitivityMultiplier = 0.55 - (normalized * 0.35); // 0.20 ~ 0.515
  }

  // 兼容老接口
  setThreshold(val) {
    this.setSensitivity(val);
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.onaudioprocess = null;
        this.scriptProcessor.disconnect();
      } catch (e) {}
      this.scriptProcessor = null;
    }
    if (this.silentGain) {
      try { this.silentGain.disconnect(); } catch (e) {}
      this.silentGain = null;
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
      try {
        this.mediaStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) {}
      this.audioCtx = null;
    }
    this.sourceType = 'none';
    this.setStatus('idle');
  }

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
   * 核心 DSP 与自适应摩斯状态机分析 (每 ~21ms 执行一次)
   */
  analyzeFrame(now, channelData = null) {
    if (!this.isRunning) return;
    this.lastProcessTime = now;

    // 获取频域 FFT 数据供可视化
    if (this.analyserNode && this.freqData) {
      this.analyserNode.getByteFrequencyData(this.freqData);
    }

    const sr = this.audioCtx ? this.audioCtx.sampleRate : 48000;

    let pcm = channelData;
    let rms = 0;

    if (pcm && pcm.length > 0) {
      let sumSquares = 0;
      const cLen = pcm.length;
      for (let i = 0; i < cLen; i++) {
        sumSquares += pcm[i] * pcm[i];
      }
      rms = Math.sqrt(sumSquares / cLen);

      // 同步更新 timeData 供示波器 Canvas 绘制波形
      const tLen = this.timeData.length;
      const step = Math.floor(cLen / tLen);
      for (let i = 0; i < tLen; i++) {
        const v = Math.max(-1, Math.min(1, pcm[i * step]));
        this.timeData[i] = Math.round((v + 1) * 127.5);
      }
    } else {
      this.analyserNode.getByteTimeDomainData(this.timeData);
      let sumSquares = 0;
      const len = this.timeData.length;
      for (let i = 0; i < len; i++) {
        const normalized = (this.timeData[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      rms = Math.sqrt(sumSquares / len);
    }

    // 1. 计算目标中心频率的 Goertzel 能量
    let toneAmp = 0;
    if (pcm && pcm.length > 0) {
      toneAmp = this.calcToneEnergy(pcm, this.targetFreq, sr);
    } else {
      // 降级使用 FFT 提取目标频点能量
      const nyquist = sr / 2;
      const bin = Math.round((this.targetFreq / nyquist) * this.freqData.length);
      toneAmp = (this.freqData[bin] || 0) / 255.0;
    }

    // 2. 自动载波锁频 (Auto Frequency Tracking)
    // 每 40ms 在有声区间扫描纯音峰值，排除环境语音并自动微调中心频点
    if (pcm && this.autoTracking && (now - this.lastTrackTime > 40)) {
      this.lastTrackTime = now;
      if (rms > this.noiseFloor * 1.5 && rms > 0.002) {
        const scan = this.detectDominantFrequency(pcm, sr);
        // peakiness > 2.2 说明是高度纯净的电报纯音，非宽频人声/爆炸低音
        if (scan.peakiness > 2.2 && scan.energy > this.noiseFloor * 1.8) {
          this.targetFreq = Math.round(this.targetFreq * 0.85 + scan.freq * 0.15);
          this.detectedFreq = scan.freq;
          toneAmp = Math.max(toneAmp, scan.energy);
          if (this.bandpassFilter && this.audioCtx) {
            this.bandpassFilter.frequency.setTargetAtTime(this.targetFreq, this.audioCtx.currentTime, 0.05);
          }
        }
      }
    } else if (!this.autoTracking) {
      this.detectedFreq = this.targetFreq;
    }

    // 3. 动态底噪与峰值包络自适应跟踪 (Leaky Integrator / AGC)
    if (toneAmp < this.noiseFloor * 1.5) {
      // 静音平缓期：底噪缓慢向当前平底收敛
      this.noiseFloor = this.noiseFloor * 0.98 + toneAmp * 0.02;
    } else if (toneAmp > this.signalPeak) {
      // 突发蜂鸣：快速跟随峰值
      this.signalPeak = toneAmp;
    } else {
      // 缓慢衰减峰值 (防止单次按键过响导致后续无法触发)
      this.signalPeak = this.signalPeak * 0.999 + toneAmp * 0.001;
    }
    this.noiseFloor = Math.max(0.0005, this.noiseFloor);
    this.signalPeak = Math.max(this.noiseFloor * 2.5, this.signalPeak);

    // 4. 自适应滞后阈值 (Schmitt Trigger)
    const span = this.signalPeak - this.noiseFloor;
    const dynamicHigh = this.noiseFloor + span * this.sensitivityMultiplier;
    const dynamicLow = this.noiseFloor + span * (this.sensitivityMultiplier * 0.52);

    if (!this.isSignalHigh && toneAmp >= dynamicHigh) {
      // 信号由低变高 (蜂鸣开始)
      const silenceDuration = now - this.lowStartTime;
      this.handleSilenceEnd(silenceDuration);

      // 若上一轮完整密码已结算完毕且停顿超 1.4s，新声音响起代表新的一轮开始，重置前一轮
      if (this.isSequenceReported && silenceDuration > this.cycleGapThresholdMs) {
        this.decodedDigits = '';
        this.currentSymbols = '';
        this.isSequenceReported = false;
      }

      this.isSignalHigh = true;
      this.highStartTime = now;
      this.lastStateChangeTime = now;
    } else if (this.isSignalHigh && toneAmp < dynamicLow) {
      // 信号由高变低 (蜂鸣结束)
      const toneDuration = now - this.highStartTime;
      this.handleToneEnd(toneDuration);
      this.isSignalHigh = false;
      this.lowStartTime = now;
      this.lastStateChangeTime = now;
    } else if (!this.isSignalHigh) {
      // 持续静音
      const currentSilence = now - this.lowStartTime;
      this.handleOngoingSilence(currentSilence);
    }

    // 归一化能量 (0 ~ 1.0) 供 VU 电平表展示
    const normalizedEnergy = Math.max(0, Math.min(1.0, (toneAmp - this.noiseFloor) / (span + 0.0001)));
    const normalizedThresh = Math.max(0, Math.min(1.0, (dynamicHigh - this.noiseFloor) / (span + 0.0001)));

    this.latestState = {
      isHigh: this.isSignalHigh,
      energy: normalizedEnergy,
      rawEnergy: toneAmp,
      noiseFloor: this.noiseFloor,
      signalPeak: this.signalPeak,
      threshold: normalizedThresh,
      timeData: this.timeData,
      freqData: this.freqData,
      detectedFreq: this.detectedFreq,
      targetFreq: this.targetFreq,
      currentSymbols: this.currentSymbols,
      decodedDigits: this.decodedDigits,
      snr: (this.signalPeak / Math.max(0.0001, this.noiseFloor)).toFixed(1)
    };
  }

  /**
   * UI 示波器渲染循环 (requestAnimationFrame)
   */
  renderLoop() {
    if (!this.isRunning) return;
    const now = performance.now();

    // 兜底保护：若 scriptProcessor 暂未触发，renderLoop 兜底执行分析
    if (!this.lastProcessTime || (now - this.lastProcessTime > 70)) {
      this.analyzeFrame(now);
    }

    if (this.onSignalState && this.latestState) {
      this.onSignalState(this.latestState);
    }

    this.animationId = requestAnimationFrame(() => this.renderLoop());
  }

  handleToneEnd(durationMs) {
    if (durationMs < this.minPulseMs) return;  // 过滤过短毛刺与按键爆音 (<35ms)
    if (durationMs > this.maxPulseMs) return; // 过滤非电报的超长背景嗡鸣 (>650ms)

    // 三角洲真实录音短音 ~85ms，长音 ~280ms，精确分割阈值为 160ms
    const symbol = durationMs < this.dotDashSplitMs ? '·' : '-';
    this.currentSymbols += symbol;

    if (this.onSymbolDetected) {
      this.onSymbolDetected(symbol, durationMs);
    }

    // 满 5 位立即触发结算
    if (this.currentSymbols.length === 5) {
      this.commitCurrentDigit();
    }
  }

  handleSilenceEnd(silenceDurationMs) {
    // 字符间停顿 (> 220ms) 提交当前数字 (即便丢音导致只有 4 位也能自动容错结算)
    if (this.currentSymbols.length > 0 && silenceDurationMs > this.charGapThresholdMs) {
      this.commitCurrentDigit();
    }
  }

  handleOngoingSilence(silenceDurationMs) {
    if (this.currentSymbols.length > 0 && silenceDurationMs > this.charGapThresholdMs) {
      this.commitCurrentDigit();
    }

    // 长空白判别律：停顿超 1400ms 认定整组密码播报完毕
    if (this.decodedDigits.length >= 3 && silenceDurationMs > this.cycleGapThresholdMs && !this.isSequenceReported) {
      this.isSequenceReported = true;
      if (this.onSequenceComplete) {
        this.onSequenceComplete(this.decodedDigits);
      }
    }
  }

  commitCurrentDigit() {
    if (!this.currentSymbols) return;

    const raw = this.currentSymbols;
    this.currentSymbols = '';

    const resolved = this.resolveSymbolsToDigit(raw);

    if (resolved) {
      this.decodedDigits += resolved.digit;
      this.isSequenceReported = false;
      if (this.onDigitDecoded) {
        this.onDigitDecoded(resolved.digit, this.decodedDigits, resolved.matchedCode, raw);
      }
    }
  }

  /**
   * 极高容错的摩斯符号解析器：支持精确匹配、后向5位匹配、丢失1位4位匹配与汉明距离1单符号纠错
   */
  resolveSymbolsToDigit(rawCode) {
    if (!rawCode) return null;

    // 1. 精确匹配
    if (CODE_TO_DIGIT[rawCode] !== undefined) {
      return { digit: CODE_TO_DIGIT[rawCode], matchedCode: rawCode };
    }

    // 2. 杂音导致超过 5 位，尝试截取后 5 位匹配
    if (rawCode.length > 5) {
      const suffix = rawCode.slice(-5);
      if (CODE_TO_DIGIT[suffix] !== undefined) {
        return { digit: CODE_TO_DIGIT[suffix], matchedCode: suffix };
      }
    }

    // 3. 丢失 1 位 (4位常见容错)
    if (rawCode.length === 4) {
      const tolerant4 = {
        '----': '0', '····': '5',
        '···-': '4', '·---': '1',
        '-···': '6', '---·': '9',
        '··--': '3', '--··': '8'
      };
      if (tolerant4[rawCode]) {
        return { digit: tolerant4[rawCode], matchedCode: MORSE_DIGITS[tolerant4[rawCode]].code };
      }
    }

    // 4. 5 位单符号翻转容错 (汉明距离 <= 1)
    if (rawCode.length === 5) {
      let bestDigit = null;
      let minDistance = 999;
      for (const [digit, info] of Object.entries(MORSE_DIGITS)) {
        const pattern = info.code;
        let dist = 0;
        for (let i = 0; i < 5; i++) {
          if (rawCode[i] !== pattern[i]) dist++;
        }
        if (dist < minDistance) {
          minDistance = dist;
          bestDigit = digit;
        }
      }
      if (minDistance <= 1 && bestDigit !== null) {
        return { digit: bestDigit, matchedCode: MORSE_DIGITS[bestDigit].code };
      }
    }

    return null;
  }
}
