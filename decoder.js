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
    // 目标中心频率 (Hz)：三角洲行动真实摩斯蜂鸣官方音高为 1570Hz (1550~1575Hz)，部分地图/房间为 600Hz 或 750Hz~800Hz
    this.targetFreq = options.targetFreq || 1570;
    this.filterQ = options.filterQ || 1.4;
    this.autoTracking = options.autoTracking !== false; // 默认开启智能全频锁相
    this.detectedFreq = this.targetFreq;
    this.isCarrierLocked = false;               // 是否已锁定有效电报载波
    this.lastCarrierTime = 0;                   // 上次听到有效载波的时间戳

    // 自适应信噪比与动态门限参数 (CFAR / AGC)
    this.noiseFloor = 0.001;                    // 初始背景底噪 (超灵敏基准)
    this.signalPeak = 0.008;                    // 初始蜂鸣峰值强度 (适应弱音与麦克风)
    this.sensitivityMultiplier = options.sensitivityMultiplier || 0.35; // 触发门限系数 (0.20 ~ 0.52，默认 0.35)

    // 回调事件
    this.onSignalState = options.onSignalState || null;     // (state: { isHigh, energy, threshold, timeData, freqData, detectedFreq, targetFreq, noiseFloor, signalPeak, snr, isCarrierLocked })
    this.onSymbolDetected = options.onSymbolDetected || null; // (symbol: '·' | '-', durationMs)
    this.onDigitDecoded = options.onDigitDecoded || null;   // (digit: string, currentFullCode: string, codeSymbols: string, rawSymbols: string)
    this.onSequenceComplete = options.onSequenceComplete || null; // (fullCode: string)
    this.onError = options.onError || null;                 // (errorMsg: string)
    this.onStatusChange = options.onStatusChange || null;   // (status: 'idle' | 'listening' | 'paused')

    // Web Audio 节点
    this.audioCtx = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.scriptProcessor = null;
    this.silentGain = null;

    // 运行状态
    this.isRunning = false;
    this.sourceType = 'none'; // 'system' | 'microphone'
    this.animationId = null;
    this.latestState = null;
    this.lastProcessTime = 0;

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
    // 数字间停顿 (Inter-digit): 200ms ~ 600ms (典型 ~350ms)
    // 轮次间长停顿 (Inter-cycle): 2000ms ~ 5000ms (典型 ~3s)
    this.dotDashSplitMs = 160;
    this.minPulseMs = 35;        // 剔除 <35ms 偶发杂音毛刺与爆音
    this.maxPulseMs = 650;       // 剔除 >650ms 持续性长杂音
    this.charGapThresholdMs = 200; // 停顿超 200ms 结算当前数字
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
   * 采用 ScriptProcessorNode 直连无衰减原生音频流，驱动后台免休眠实时解码
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

    // 建立频谱与时域分析器
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.15;

    // 建立后台音频处理节点 (1024 样本在 48kHz 下约为 21.3ms，时间分辨率极其锐利)
    this.scriptProcessor = this.audioCtx.createScriptProcessor(1024, 1, 1);
    this.silentGain = this.audioCtx.createGain();
    this.silentGain.gain.setValueAtTime(0, this.audioCtx.currentTime); // 0 增益确保不发出回声

    // 连接外部媒体源 (直连 ScriptProcessor 与 AnalyserNode，彻底避免硬件二阶滤波产生的带外大幅衰减)
    if (this.mediaStream) {
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.scriptProcessor);
      this.sourceNode.connect(this.analyserNode);
    }

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
    this.isCarrierLocked = false;
    this.lastCarrierTime = performance.now();

    // 硬件时钟持续驱动分析
    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isRunning) return;
      const channelData = e.inputBuffer ? e.inputBuffer.getChannelData(0) : null;
      // 必须将 outputBuffer 彻底清零，杜绝任何输入音频泄漏到输出端形成自激声学反馈或环路串扰
      if (e.outputBuffer) {
        for (let c = 0; c < e.outputBuffer.numberOfChannels; c++) {
          e.outputBuffer.getChannelData(c).fill(0);
        }
      }
      this.analyzeFrame(performance.now(), channelData);
    };

    // UI 示波器渲染循环
    this.renderLoop();
  }

  /**
   * 计算指定频率的 Goertzel 单频共振能量 (连续角频率，消除整型谐波量化损耗)
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
   * 宽带纯音扫描 (500Hz ~ 2200Hz 真实三角洲电报频带)，依托 CA-CFAR 守卫频带差分杜绝低频轰鸣与白噪误锁
   */
  detectDominantFrequency(pcm, sampleRate = 48000) {
    let maxContrast = 0;
    let bestF = this.targetFreq;
    let maxE = 0;
    let totalE = 0;
    let count = 0;

    // 三角洲行动真实密码蜂鸣频率集中在 500Hz ~ 2200Hz (航天/绝密 1570Hz, 标准 1000Hz, 零号/长弓 750Hz, 巴克什 600Hz)
    // 避开 100~400Hz 常见枪炮重低音、脚步轰鸣、电脑风扇与 50/60Hz 工频交流声
    for (let f = 500; f <= 2200; f += 25) {
      const e = this.calcToneEnergy(pcm, f, sampleRate);
      totalE += e;
      count++;

      // 守卫频带能量估算 (检测该频点是否为孤立纯音尖峰)
      const guardOffset = Math.max(80, Math.min(180, f * 0.12));
      const guardE = (this.calcToneEnergy(pcm, Math.max(50, f - guardOffset), sampleRate) + 
                      this.calcToneEnergy(pcm, f + guardOffset, sampleRate)) / 2;
      const contrast = e / (guardE + 0.0001);

      if (e > 0.0035 && contrast >= 2.6) {
        const score = contrast * e;
        if (score > maxContrast) {
          maxContrast = score;
          bestF = f;
          maxE = e;
        }
      } else if (e > maxE) {
        maxE = e;
      }
    }
    const avgE = totalE / count;
    const peakiness = maxE / (avgE + 0.00001);
    return { freq: bestF, energy: maxE, peakiness, hasPureTone: maxContrast > 0 && peakiness >= 3.2 };
  }

  setTargetFrequency(freq, isAuto = false) {
    if (freq === 'auto') {
      this.autoTracking = true;
      this.isCarrierLocked = false;
      return;
    }
    this.autoTracking = isAuto;
    const num = parseInt(freq, 10);
    if (!isNaN(num)) {
      this.targetFreq = Math.max(80, Math.min(3500, num));
      this.detectedFreq = this.targetFreq;
      this.isCarrierLocked = true;
    }
  }

  /**
   * 设置灵敏度 (0.10 ~ 0.90)
   * 灵敏度越高，触发所需信噪比门限越低
   */
  setSensitivity(val) {
    const normalized = Math.max(0.1, Math.min(0.9, val));
    this.sensitivityMultiplier = 0.55 - (normalized * 0.35); // 0.235 ~ 0.515
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

    // 1. 纯音载波智能探测与平顶能量计算
    let toneAmp = 0;
    let spectralContrast = 1.0;

    if (pcm && pcm.length > 0) {
      if (this.autoTracking) {
        // 若长时间无信号 (>2200ms)，释放载波锁定重新进行全频段宽带扫描
        if (this.isCarrierLocked && (now - this.lastCarrierTime > 2200) && (now - this.highStartTime > 2200)) {
          this.isCarrierLocked = false;
        }

        if (!this.isCarrierLocked) {
          // 未锁定状态：全频宽带扫描纯音共振载波 (500Hz ~ 2200Hz)
          const scan = this.detectDominantFrequency(pcm, sr);
          if (scan.hasPureTone && scan.energy > this.noiseFloor * 1.8 && scan.energy > 0.0035) {
            this.targetFreq = scan.freq;
            this.detectedFreq = scan.freq;
            this.isCarrierLocked = true;
            this.lastCarrierTime = now;
            toneAmp = scan.energy; // 瞬间首帧咬合
          } else {
            // 平顶多点监测当前目标频点 (±30Hz)
            const fLow = Math.max(30, this.targetFreq - 30);
            toneAmp = Math.max(
              this.calcToneEnergy(pcm, fLow, sr),
              this.calcToneEnergy(pcm, this.targetFreq, sr),
              this.calcToneEnergy(pcm, this.targetFreq + 30, sr)
            );
          }
        } else {
          // 已锁定状态：三点平顶滤波器跟踪锁定载波 (容忍 ±30Hz 微偏与混响)
          const fLow = Math.max(30, this.targetFreq - 30);
          toneAmp = Math.max(
            this.calcToneEnergy(pcm, fLow, sr),
            this.calcToneEnergy(pcm, this.targetFreq, sr),
            this.calcToneEnergy(pcm, this.targetFreq + 30, sr)
          );
        }
      } else {
        // 手动模式：三点平顶滤波器聚焦用户设定频点
        const fLow = Math.max(30, this.targetFreq - 30);
        toneAmp = Math.max(
          this.calcToneEnergy(pcm, fLow, sr),
          this.calcToneEnergy(pcm, this.targetFreq, sr),
          this.calcToneEnergy(pcm, this.targetFreq + 30, sr)
        );
      }

      // 计算当前中心频点邻近守卫频带的背景底噪强度 (CA-CFAR)
      const guardOffset = Math.max(80, Math.min(200, this.targetFreq * 0.12));
      const guardE = (this.calcToneEnergy(pcm, Math.max(40, this.targetFreq - guardOffset), sr) +
                      this.calcToneEnergy(pcm, this.targetFreq + guardOffset, sr)) / 2;
      spectralContrast = toneAmp / (guardE + 0.0001);

      if (this.isCarrierLocked && toneAmp > this.noiseFloor * 1.6 && spectralContrast >= 1.5) {
        this.lastCarrierTime = now;
      }
    } else {
      // 降级使用 FFT 分析器
      const nyquist = sr / 2;
      const bin = Math.round((this.targetFreq / nyquist) * this.freqData.length);
      toneAmp = (this.freqData[bin] || 0) / 255.0;
      spectralContrast = 2.0;
    }

    // 2. 动态底噪与蜂鸣峰值自适应跟踪 (Leaky Integrator / CA-CFAR)
    // 判定当前帧是否属于背景声音 (低对比度、宽带噪音或能量偏低)
    const isBackgroundSound = spectralContrast < 1.65 || toneAmp < this.noiseFloor * 1.4;

    if (isBackgroundSound) {
      if (toneAmp > this.noiseFloor) {
        // 背景环境声音偏大 (游戏背景音、风噪、麦克风交流声)：平滑向上跟随，防止将背景音误认为信号
        this.noiseFloor = this.noiseFloor * 0.96 + toneAmp * 0.04;
      } else {
        // 背景声音减弱：平滑向下收敛
        this.noiseFloor = this.noiseFloor * 0.90 + toneAmp * 0.10;
      }
    } else if (toneAmp > this.signalPeak) {
      // 真实纯音突发蜂鸣：快速跟随峰值
      this.signalPeak = toneAmp;
    } else {
      // 适度衰减峰值 (防止单次按键过响导致后续无法触发)
      this.signalPeak = this.signalPeak * 0.985 + toneAmp * 0.015;
    }

    this.noiseFloor = Math.max(0.0003, Math.min(0.08, this.noiseFloor));
    this.signalPeak = Math.max(this.noiseFloor * 1.8, this.signalPeak);

    // 3. 自适应滞后阈值 (Schmitt Trigger + 纯音凸起度门限)
    const span = this.signalPeak - this.noiseFloor;
    const dynamicHigh = this.noiseFloor + span * this.sensitivityMultiplier;
    const dynamicLow = this.noiseFloor + span * (this.sensitivityMultiplier * 0.45);
    const minContrast = 1.35 + (1.0 - this.sensitivityMultiplier) * 0.7; // ~1.5 to ~2.0

    const isToneHigh = (toneAmp >= dynamicHigh) && (spectralContrast >= minContrast);
    const isToneLow = (toneAmp < dynamicLow) || (spectralContrast < 1.25);

    if (!this.isSignalHigh && isToneHigh) {
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
    } else if (this.isSignalHigh && isToneLow) {
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
      isCarrierLocked: this.isCarrierLocked,
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
