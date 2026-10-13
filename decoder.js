/**
 * decoder.js - 《三角洲行动》游戏声音实时摩斯密码听音与解码引擎
 * 采用 Web Audio API 进行频带滤波、能量检测、滞后阈值触发与高容错摩斯时序状态机解码
 * 深度优化：支持 ScriptProcessor 驱动后台长效免休眠监听，杜绝切屏至游戏时被浏览器冻结
 */

import { CODE_TO_DIGIT, MORSE_DIGITS } from './morse.js';

export class MorseAudioDecoder {
  constructor(options = {}) {
    this.targetFreq = options.targetFreq || 750; // 目标中心频率 (Hz)，三角洲蜂鸣通常在 750Hz 左右
    this.filterQ = options.filterQ || 1.6;       // 宽通滤波 Q 值 (1.6 覆盖 500~1100Hz，杜绝因频偏严重衰减音量)
    this.threshold = options.threshold || 0.08; // 能量触发阈值 (0.01 ~ 1.0，0.08 轻松捕获微弱游戏远音)
    this.detectedFreq = 750;                    // 实时自动侦测到的峰值载波频率

    // 回调事件
    this.onSignalState = options.onSignalState || null;     // (state: { isHigh, energy, threshold, timeData, freqData, detectedFreq, targetFreq })
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
    this.sourceType = 'none'; // 'system' | 'microphone' | 'selftest'
    this.animationId = null;
    this.latestState = null;
    this.lastProcessTime = 0;

    // 摩斯状态机变量
    this.isSignalHigh = false;
    this.highStartTime = 0;
    this.lowStartTime = performance.now();
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
   * 启动内置模拟自测模式 (直通注入 750Hz 382 密码蜂鸣，无需媒体流权限即可 100% 验证解码器与示波器)
   */
  async startSelfTest(code = '382') {
    this.stop();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.sourceType = 'selftest';
    await this.initAudioPipeline();
    this.setStatus('listening');

    this.playSyntheticTestBeeps(code);
  }

  /**
   * 生成合成测试音频：直通注入带通滤波器并输出到扬声器，保证零延迟 100% 成功触发
   */
  playSyntheticTestBeeps(code = '382') {
    if (!this.audioCtx || !this.bandpassFilter) return;
    const ctx = this.audioCtx;
    let t = ctx.currentTime + 0.15;
    const dot = 0.125;
    const dash = dot * 3;

    for (let i = 0; i < code.length; i++) {
      const digit = code[i];
      const morseInfo = MORSE_DIGITS[digit];
      if (!morseInfo) continue;
      const symbols = morseInfo.code;

      for (let s = 0; s < symbols.length; s++) {
        const sym = symbols[s];
        const dur = (sym === '·') ? dot : dash;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(this.targetFreq, t);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.7, t + 0.005);
        gain.gain.setValueAtTime(0.7, t + dur - 0.005);
        gain.gain.linearRampToValueAtTime(0.0001, t + dur);

        osc.connect(gain);
        // 直通注入 DSP 带通滤波器 (无需任何 MediaStreamDestination loopback，保证 100% 成功触发分析)
        gain.connect(this.bandpassFilter);
        // 同时输出至扬声器
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + dur);

        t += dur + dot;
      }
      t += dot * 2;
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

    // 建立宽频带通滤波器 (Bandpass Filter, Q=1.6，覆盖 500~1100Hz 常见电报音)
    this.bandpassFilter = this.audioCtx.createBiquadFilter();
    this.bandpassFilter.type = 'bandpass';
    this.bandpassFilter.frequency.setValueAtTime(this.targetFreq, this.audioCtx.currentTime);
    this.bandpassFilter.Q.setValueAtTime(this.filterQ, this.audioCtx.currentTime);

    // 建立频谱与时域分析器
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.15; // 降噪且响应迅捷

    // 建立后台音频处理节点 (1024 样本在 48kHz 下约为 21.3ms，时间分辨率极其锐利，杜绝拖尾)
    this.scriptProcessor = this.audioCtx.createScriptProcessor(1024, 1, 1);
    this.silentGain = this.audioCtx.createGain();
    this.silentGain.gain.setValueAtTime(0, this.audioCtx.currentTime); // 0 增益确保不发出回声

    // 连接外部媒体源 (如果有)
    if (this.mediaStream) {
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.bandpassFilter);
    }

    // 滤波器 ➔ 分析器 ➔ 处理节点 ➔ 静音输出 ➔ 扬声器(维持时钟)
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

    // 由音频硬件时钟持续驱动分析 (后台切到游戏也不会暂停)
    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isRunning) return;
      const channelData = e.inputBuffer ? e.inputBuffer.getChannelData(0) : null;
      this.analyzeFrame(performance.now(), channelData);
    };

    // UI 示波器渲染循环 (前台 60fps 绘制)
    this.renderLoop();
  }

  setTargetFrequency(freq) {
    this.targetFreq = Math.max(400, Math.min(1500, freq));
    if (this.bandpassFilter && this.audioCtx) {
      this.bandpassFilter.frequency.setTargetAtTime(this.targetFreq, this.audioCtx.currentTime, 0.05);
    }
  }

  setThreshold(val) {
    this.threshold = Math.max(0.02, Math.min(0.95, val));
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
   * 核心 DSP 与摩斯状态机分析 (每 ~21ms 由底层音频硬件驱动一次)
   */
  analyzeFrame(now, channelData = null) {
    if (!this.isRunning || !this.analyserNode) return;
    this.lastProcessTime = now;

    // 获取频域 FFT 数据
    this.analyserNode.getByteFrequencyData(this.freqData);

    // 1. 计算时域 RMS 能量 (全精度 Float32 计算，零衰减延迟)
    let rms = 0;
    if (channelData && channelData.length > 0) {
      let sumSquares = 0;
      const cLen = channelData.length;
      for (let i = 0; i < cLen; i++) {
        sumSquares += channelData[i] * channelData[i];
      }
      rms = Math.sqrt(sumSquares / cLen);

      // 同步更新 timeData 供示波器 Canvas 绘制波形
      const tLen = this.timeData.length;
      const step = Math.floor(cLen / tLen);
      for (let i = 0; i < tLen; i++) {
        const v = Math.max(-1, Math.min(1, channelData[i * step]));
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

    // 2. 频谱电报蜂鸣峰值侦测 (扫描 500Hz ~ 1250Hz 电报区间)
    const nyquist = this.audioCtx ? (this.audioCtx.sampleRate / 2) : 24000;
    const minBin = Math.max(1, Math.floor((500 / nyquist) * this.freqData.length));
    const maxBin = Math.min(this.freqData.length - 1, Math.ceil((1250 / nyquist) * this.freqData.length));

    let maxBinVal = 0;
    let peakBin = minBin;
    for (let b = minBin; b <= maxBin; b++) {
      if (this.freqData[b] > maxBinVal) {
        maxBinVal = this.freqData[b];
        peakBin = b;
      }
    }
    const peakHz = Math.round((peakBin / this.freqData.length) * nyquist);
    if (maxBinVal > 35) {
      this.detectedFreq = peakHz;
    }

    // 综合能量指数：纯由带通滤波后的时域 RMS 驱动，彻底消除 FFT 拖尾将点延长为划的问题
    const energy = Math.min(1.0, rms * 2.8);

    // 3. 滞后阈值比较 (Schmitt Trigger)
    const highThreshold = this.threshold;
    const lowThreshold = this.threshold * 0.55;

    if (!this.isSignalHigh && energy >= highThreshold) {
      // 信号由低变高 (蜂鸣开始)
      const silenceDuration = now - this.lowStartTime;
      this.handleSilenceEnd(silenceDuration);

      // 若上一轮完整密码已结算完毕且已静音超 1.2s，新声音响起代表新的一轮开始，重置前一轮
      if (this.isSequenceReported && silenceDuration > 1200) {
        this.decodedDigits = '';
        this.currentSymbols = '';
        this.isSequenceReported = false;
      }

      this.isSignalHigh = true;
      this.highStartTime = now;
      this.lastStateChangeTime = now;
    } else if (this.isSignalHigh && energy < lowThreshold) {
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

    this.latestState = {
      isHigh: this.isSignalHigh,
      energy: energy,
      threshold: this.threshold,
      timeData: this.timeData,
      freqData: this.freqData,
      detectedFreq: this.detectedFreq,
      targetFreq: this.targetFreq,
      currentSymbols: this.currentSymbols,
      decodedDigits: this.decodedDigits
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
    if (durationMs < 40) return;  // 过滤过短毛刺与按键爆音
    if (durationMs > 850) return; // 过滤非电报的超长背景嗡鸣

    // 标准游戏短音 ~125ms，长音 ~375ms，精确分割阈值为 200ms
    const symbol = durationMs < 200 ? '·' : '-';
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
    // 字符间停顿 (> 260ms) 提交当前数字 (解决即使个别丢音仅有 4 位时也能结算)
    if (this.currentSymbols.length > 0 && silenceDurationMs > 260) {
      this.commitCurrentDigit();
    }
  }

  handleOngoingSilence(silenceDurationMs) {
    if (this.currentSymbols.length > 0 && silenceDurationMs > 260) {
      this.commitCurrentDigit();
    }

    // 长空白判别律：停顿超 1500ms 认定整组密码播报完毕
    if (this.decodedDigits.length >= 3 && silenceDurationMs > 1500 && !this.isSequenceReported) {
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
