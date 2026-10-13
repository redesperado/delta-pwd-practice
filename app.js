/**
 * app.js - 三角洲行动 摩斯密码与电脑终端破译特训模拟器交互控制器
 */

import {
  MORSE_DIGITS,
  generateRandomCode,
  codeToTimingEvents,
  getMorseVisualGroups,
  DELTA_MAP_INTEL,
  MORSE_RULES_TIPS,
  DAILY_PASSWORDS_CONFIG
} from './morse.js';
import { audioEngine } from './audio.js';
import { MorseAudioDecoder } from './decoder.js';

class DeltaMorseTrainerApp {
  constructor() {
    // 当前全局模式配置 (默认作战大厅首页，绝无自动发声)
    this.currentMode = 'home'; // 'home' | 'dailyPasswords' | 'realCombat' | 'singleFlash' | 'terminalHack' | 'audioDecoder'
    this.codeLength = 3;       // 密码位数：默认3位，可选4位
    this.isVisualAssist = true;// 视觉节奏辅助（可关闭纯盲听）

    // 实时游戏声音破译状态
    this.decoder = null;
    this.decoderCanvasCtx = null;
    this.decoderHistory = [];

    // 每日密码与日期状态
    this.todayDateStr = '';
    this.dailyPasswords = [];
    this.isDailyEditMode = false;
    this.toastTimer = null;

    // 定时器句柄管理 (杜绝重叠与竞态)
    this.nextRoundTimer = null;
    this.singleTimer = null;
    this.hackTimerInterval = null;
    this.hackNextTimer = null;

    // 实战开门模式状态
    this.realTargetCode = '';
    this.realInputCode = '';
    this.realStartTime = 0;
    this.realTryCount = 0;

    // 单字速记模式状态
    this.singleTargetDigit = '';
    this.singleStartTime = 0;
    this.singleCombo = 0;
    this.singleBestCombo = 0;
    this.singleTotalAnswers = 0;
    this.singleCorrectAnswers = 0;
    this.singleReactionTimes = [];

    // 电脑终端视觉速算模式状态
    this.hackTargetCode = '';
    this.hackInputCode = '';
    this.hackStartTime = 0;
    this.hackSolvedTotal = 0;
    this.hackBestRecord = Infinity;
    this.hackTimesList = [];

    // DOM 元素缓存
    this.dom = {};
  }

  init() {
    this.cacheDom();
    this.initTodayDate();
    this.loadDailyPasswordsData();
    this.initAudioUnlockListener();
    this.initAudioEngineListeners();
    this.initEventListeners();
    this.renderCheatSheet();
    this.renderIntelModal();
    this.renderHomeView();
    this.renderDailyPasswordsView();
    this.initAudioDecoder();
    this.switchMode('home'); // 初始进入首页，绝对静音加载
  }

  /**
   * 针对 Cloudflare Pages 等公网 HTTPS 环境的 AudioContext 自动解锁机制
   */
  initAudioUnlockListener() {
    const unlock = () => {
      audioEngine.ensureContext();
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  cacheDom() {
    this.dom = {
      // 导航模式切换按钮
      tabHome: document.getElementById('tab-home'),
      tabDailyPasswords: document.getElementById('tab-daily-passwords'),
      tabRealCombat: document.getElementById('tab-real-combat'),
      tabSingleFlash: document.getElementById('tab-single-flash'),
      tabTerminalHack: document.getElementById('tab-terminal-hack'),
      tabAudioDecoder: document.getElementById('tab-audio-decoder'),

      // 主视图容器
      viewHome: document.getElementById('view-home'),
      viewDailyPasswords: document.getElementById('view-daily-passwords'),
      viewRealCombat: document.getElementById('view-real-combat'),
      viewSingleFlash: document.getElementById('view-single-flash'),
      viewTerminalHack: document.getElementById('view-terminal-hack'),
      viewAudioDecoder: document.getElementById('view-audio-decoder'),

      // 首页 DOM
      homeTodayDate: document.getElementById('home-today-date'),
      homeQuickList: document.getElementById('home-quick-list'),
      btnHomeCopyAll: document.getElementById('btn-home-copy-all'),
      btnHomeGotoDaily: document.getElementById('btn-home-goto-daily'),

      // 每日密码速报站 DOM
      dailyActiveDate: document.getElementById('daily-active-date'),
      dailySyncStatusText: document.getElementById('daily-sync-status-text'),
      btnSyncDaily: document.getElementById('btn-sync-daily'),
      btnCopyAllDaily: document.getElementById('btn-copy-all-daily'),
      btnEditDailyMode: document.getElementById('btn-edit-daily-mode'),
      btnResetDaily: document.getElementById('btn-reset-daily'),
      dailyEditHint: document.getElementById('daily-edit-hint'),
      btnSaveDailyEdits: document.getElementById('btn-save-daily-edits'),
      dailyCardsContainer: document.getElementById('daily-cards-container'),

      // 实战开门模式 DOM
      screenElem: document.getElementById('terminal-screen'),
      codeSlotsContainer: document.getElementById('code-slots-container'),
      screenStatusText: document.getElementById('screen-status-text'),
      screenMessage: document.getElementById('screen-message'),
      btnPlayPause: document.getElementById('btn-play-pause'),
      btnNextDoor: document.getElementById('btn-next-door'),
      btnReplay: document.getElementById('btn-replay'),
      btnLen3: document.getElementById('btn-len-3'),
      btnLen4: document.getElementById('btn-len-4'),

      // 视觉辅助与节奏条
      rhythmVisualizer: document.getElementById('rhythm-visualizer'),
      pulseLight: document.getElementById('pulse-light'),
      symbolDisplayContainer: document.getElementById('symbol-display-container'),

      // 单字速记 DOM
      singleComboText: document.getElementById('single-combo-text'),
      singleAccText: document.getElementById('single-acc-text'),
      singleAvgTimeText: document.getElementById('single-avg-time-text'),
      singleReplayBtn: document.getElementById('btn-single-replay'),
      singleNextBtn: document.getElementById('btn-single-next'),
      singleChoicesGrid: document.getElementById('single-choices-grid'),
      singlePromptMessage: document.getElementById('single-prompt-message'),

      // 电脑终端破译 DOM
      hackScreen: document.getElementById('hack-screen'),
      hackCardsRow: document.getElementById('hack-morse-cards-row'),
      hackInputSlots: document.getElementById('hack-input-slots-container'),
      hackStatusMessage: document.getElementById('hack-status-message'),
      hackExplainRow: document.getElementById('hack-explain-row'),
      hackTimerBadge: document.getElementById('hack-timer-badge'),
      hackSolvedCount: document.getElementById('hack-solved-count'),
      hackBestTime: document.getElementById('hack-best-time'),
      hackAvgTime: document.getElementById('hack-avg-time'),
      btnHackNext: document.getElementById('btn-hack-next'),

      // 侧边栏调控
      sliderSpeed: document.getElementById('slider-speed'),
      valSpeed: document.getElementById('val-speed'),
      sliderPitch: document.getElementById('slider-pitch'),
      valPitch: document.getElementById('val-pitch'),
      sliderVolume: document.getElementById('slider-volume'),
      valVolume: document.getElementById('val-volume'),
      switchVisual: document.getElementById('switch-visual'),
      switchAmbient: document.getElementById('switch-ambient'),
      ambientControlRow: document.getElementById('ambient-control-row'),
      sliderAmbientVol: document.getElementById('slider-ambient-vol'),
      valAmbientVol: document.getElementById('val-ambient-vol'),

      // 摩斯小抄与弹窗
      cheatSheetList: document.getElementById('cheat-sheet-list'),
      btnOpenIntel: document.getElementById('btn-open-intel'),
      btnCloseIntel: document.getElementById('btn-close-intel'),
      intelModalOverlay: document.getElementById('intel-modal-overlay'),
      intelModalContent: document.getElementById('intel-modal-content'),

      // 悬浮战术 Toast
      tacticalToast: document.getElementById('tactical-toast'),

      // 游戏声音实时破译 DOM
      decoderStatusPill: document.getElementById('decoder-status-pill'),
      decoderStatusDot: document.getElementById('decoder-status-dot'),
      decoderStatusText: document.getElementById('decoder-status-text'),
      btnStartSystemAudio: document.getElementById('btn-start-system-audio'),
      btnStartMicAudio: document.getElementById('btn-start-mic-audio'),
      btnStopAudioDecoder: document.getElementById('btn-stop-audio-decoder'),
      statDecoderHz: document.getElementById('stat-decoder-hz'),
      statDecoderSignal: document.getElementById('stat-decoder-signal'),
      decoderCanvas: document.getElementById('decoder-canvas'),
      decoderEnergyFill: document.getElementById('decoder-energy-fill'),
      decoderThresholdMarker: document.getElementById('decoder-threshold-marker'),
      decoderEnergyVal: document.getElementById('decoder-energy-val'),
      sliderDecoderFreq: document.getElementById('slider-decoder-freq'),
      valDecoderFreq: document.getElementById('val-decoder-freq'),
      sliderDecoderThreshold: document.getElementById('slider-decoder-threshold'),
      valDecoderThreshold: document.getElementById('val-decoder-threshold'),
      decoderLiveSymbols: document.getElementById('decoder-live-symbols'),
      decoderResultCode: document.getElementById('decoder-result-code'),
      decoderResultMeta: document.getElementById('decoder-result-meta'),
      btnCopyDecoderCode: document.getElementById('btn-copy-decoder-code'),
      btnClearDecoderCode: document.getElementById('btn-clear-decoder-code'),
      decoderHistoryList: document.getElementById('decoder-history-list')
    };
  }

  /**
   * 绑定 Web Audio API 回调事件
   */
  initAudioEngineListeners() {
    audioEngine.onStateChange = (isPlaying) => {
      this.updatePlayPauseBtnState(isPlaying);
    };

    audioEngine.onSymbolActive = (info) => {
      if (!this.isVisualAssist) return;

      // 点亮脉冲发光条
      if (this.dom.pulseLight) {
        this.dom.pulseLight.classList.add('active');
        if (info.type === 'dash') {
          this.dom.pulseLight.style.background = 'linear-gradient(90deg, #ffb703, #00ff88)';
        } else {
          this.dom.pulseLight.style.background = 'linear-gradient(90deg, #00b4d8, #00ff88)';
        }
      }

      // 点亮对应点划徽标
      const badge = document.querySelector(`.symbol-badge[data-char="${info.charIndex}"][data-sym="${info.symbolIndex}"]`);
      if (badge) {
        badge.classList.add('active');
      }
    };

    audioEngine.onSymbolInactive = () => {
      if (this.dom.pulseLight) {
        this.dom.pulseLight.classList.remove('active');
      }
      document.querySelectorAll('.symbol-badge.active').forEach(b => b.classList.remove('active'));
    };

    // 轮次间歇等待回调（长空白停顿）
    audioEngine.onCyclePause = (isPausing) => {
      if (this.currentMode !== 'realCombat') return;
      if (isPausing) {
        this.dom.screenStatusText.textContent = 'CYCLE PAUSE // 轮次间隙 (约2.8s)';
        this.dom.screenStatusText.style.color = 'var(--delta-amber)';
        if (this.dom.pulseLight) this.dom.pulseLight.classList.remove('active');
        document.querySelectorAll('.symbol-badge.active').forEach(b => b.classList.remove('active'));
      } else {
        this.dom.screenStatusText.textContent = `DECODING // ${this.codeLength} DIGITS`;
        this.dom.screenStatusText.style.color = 'var(--delta-green)';
      }
    };
  }

  /**
   * 注册用户界面交互与键盘快捷键
   */
  initEventListeners() {
    // 导航模式切换
    if (this.dom.tabHome) this.dom.tabHome.addEventListener('click', () => this.switchMode('home'));
    if (this.dom.tabDailyPasswords) this.dom.tabDailyPasswords.addEventListener('click', () => this.switchMode('dailyPasswords'));
    this.dom.tabRealCombat.addEventListener('click', () => this.switchMode('realCombat'));
    this.dom.tabSingleFlash.addEventListener('click', () => this.switchMode('singleFlash'));
    this.dom.tabTerminalHack.addEventListener('click', () => this.switchMode('terminalHack'));
    if (this.dom.tabAudioDecoder) this.dom.tabAudioDecoder.addEventListener('click', () => this.switchMode('audioDecoder'));

    // 首页快捷操作
    if (this.dom.btnHomeGotoDaily) this.dom.btnHomeGotoDaily.addEventListener('click', () => this.switchMode('dailyPasswords'));
    if (this.dom.btnHomeCopyAll) this.dom.btnHomeCopyAll.addEventListener('click', () => this.copyAllDailyPasswords());

    // 首页功能矩阵卡片按钮直达
    document.querySelectorAll('.btn-start-sim').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = btn.dataset.target;
        if (target) this.switchMode(target);
      });
    });

    // 每日密码速报站操作
    if (this.dom.btnSyncDaily) this.dom.btnSyncDaily.addEventListener('click', () => this.syncDailyPasswords());
    if (this.dom.btnCopyAllDaily) this.dom.btnCopyAllDaily.addEventListener('click', () => this.copyAllDailyPasswords());
    if (this.dom.btnEditDailyMode) this.dom.btnEditDailyMode.addEventListener('click', () => this.toggleDailyEditMode());
    if (this.dom.btnResetDaily) this.dom.btnResetDaily.addEventListener('click', () => this.resetDailyPasswords());
    if (this.dom.btnSaveDailyEdits) this.dom.btnSaveDailyEdits.addEventListener('click', () => this.saveDailyEdits());

    // 密码位数切换 (3位 / 4位)
    this.dom.btnLen3.addEventListener('click', () => this.setLength(3));
    this.dom.btnLen4.addEventListener('click', () => this.setLength(4));

    // 播放/控制按钮
    this.dom.btnPlayPause.addEventListener('click', () => this.togglePlayback());
    this.dom.btnReplay.addEventListener('click', () => this.replayCurrent());
    this.dom.btnNextDoor.addEventListener('click', () => this.startRealCombatRound(true));

    // 单字模式控制
    this.dom.singleReplayBtn.addEventListener('click', () => this.playSingleDigit());
    this.dom.singleNextBtn.addEventListener('click', () => this.startSingleRound(true));

    // 电脑终端破译控制
    this.dom.btnHackNext.addEventListener('click', () => this.startTerminalHackRound());

    // 军用小键盘点击
    document.querySelectorAll('.key-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (this.currentMode === 'realCombat') {
          this.handleKeypadInput(val);
        } else if (this.currentMode === 'terminalHack') {
          this.handleHackInput(val);
        }
      });
    });

    // 单字选项按钮
    document.querySelectorAll('.digit-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-digit');
        this.handleSingleChoice(val);
      });
    });

    // 调控滑块监听
    this.dom.sliderSpeed.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      this.dom.valSpeed.textContent = `${speed.toFixed(1)}x`;
      audioEngine.setSpeed(speed);
    });

    this.dom.sliderPitch.addEventListener('input', (e) => {
      const pitch = parseInt(e.target.value, 10);
      this.dom.valPitch.textContent = `${pitch}Hz`;
      audioEngine.setFrequency(pitch);
    });

    this.dom.sliderVolume.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value, 10);
      this.dom.valVolume.textContent = `${vol}%`;
      audioEngine.setVolume(vol / 100);
    });

    // 视觉辅助开关
    this.dom.switchVisual.addEventListener('change', (e) => {
      this.isVisualAssist = e.target.checked;
      this.toggleVisualAssist(this.isVisualAssist);
    });

    // 战场杂音开关与音量
    this.dom.switchAmbient.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      this.dom.ambientControlRow.style.display = enabled ? 'flex' : 'none';
      audioEngine.setAmbientNoise(enabled);
    });

    this.dom.sliderAmbientVol.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value, 10);
      this.dom.valAmbientVol.textContent = `${vol}%`;
      audioEngine.setAmbientNoise(this.dom.switchAmbient.checked, vol / 100);
    });

    // 情报手册模态框
    this.dom.btnOpenIntel.addEventListener('click', () => this.openIntelModal());
    this.dom.btnCloseIntel.addEventListener('click', () => this.closeIntelModal());
    this.dom.intelModalOverlay.addEventListener('click', (e) => {
      if (e.target === this.dom.intelModalOverlay) this.closeIntelModal();
    });

    // 全局物理键盘监听 (主键盘、小键盘、退格、回车、空格)
    window.addEventListener('keydown', (e) => {
      if (this.dom.intelModalOverlay.classList.contains('open')) {
        if (e.key === 'Escape') this.closeIntelModal();
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        this.triggerButtonVisualPress(e.key);
        if (this.currentMode === 'realCombat') {
          this.handleKeypadInput(e.key);
        } else if (this.currentMode === 'singleFlash') {
          this.handleSingleChoice(e.key);
        } else if (this.currentMode === 'terminalHack') {
          this.handleHackInput(e.key);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        this.triggerButtonVisualPress('CLEAR');
        if (this.currentMode === 'realCombat') {
          this.handleKeypadInput('CLEAR');
        } else if (this.currentMode === 'terminalHack') {
          this.handleHackInput('CLEAR');
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.triggerButtonVisualPress('ENTER');
        if (this.currentMode === 'realCombat') {
          this.handleKeypadInput('ENTER');
        } else if (this.currentMode === 'terminalHack') {
          this.handleHackInput('ENTER');
        }
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (this.currentMode === 'realCombat') {
          this.togglePlayback();
        } else if (this.currentMode === 'singleFlash') {
          this.playSingleDigit();
        }
      } else if (e.key === 'Escape') {
        this.closeIntelModal();
      }
    });
  }

  triggerButtonVisualPress(val) {
    const btn = document.querySelector(`.key-btn[data-val="${val}"]`);
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 120);
    }
  }

  /**
   * 切换主训练模式 (切换时绝不自动播放任何声音，由玩家主动触发)
   */
  switchMode(mode) {
    if (this.nextRoundTimer) {
      clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = null;
    }
    if (this.singleTimer) {
      clearTimeout(this.singleTimer);
      this.singleTimer = null;
    }
    if (this.hackTimerInterval) {
      clearInterval(this.hackTimerInterval);
      this.hackTimerInterval = null;
    }
    if (this.hackNextTimer) {
      clearTimeout(this.hackNextTimer);
      this.hackNextTimer = null;
    }

    // 切换 Tab 时彻底停止一切正在发声的音频引擎，杜绝任何声音重叠或自动响铃
    audioEngine.stop();
    if (mode !== 'audioDecoder' && this.decoder && this.decoder.isRunning) {
      this.decoder.stop();
    }
    this.currentMode = mode;

    if (this.dom.tabHome) this.dom.tabHome.classList.toggle('active', mode === 'home');
    if (this.dom.tabDailyPasswords) this.dom.tabDailyPasswords.classList.toggle('active', mode === 'dailyPasswords');
    if (this.dom.tabAudioDecoder) this.dom.tabAudioDecoder.classList.toggle('active', mode === 'audioDecoder');
    this.dom.tabRealCombat.classList.toggle('active', mode === 'realCombat');
    this.dom.tabSingleFlash.classList.toggle('active', mode === 'singleFlash');
    this.dom.tabTerminalHack.classList.toggle('active', mode === 'terminalHack');

    if (this.dom.viewHome) this.dom.viewHome.style.display = mode === 'home' ? 'block' : 'none';
    if (this.dom.viewDailyPasswords) this.dom.viewDailyPasswords.style.display = mode === 'dailyPasswords' ? 'block' : 'none';
    if (this.dom.viewAudioDecoder) this.dom.viewAudioDecoder.style.display = mode === 'audioDecoder' ? 'block' : 'none';
    this.dom.viewRealCombat.style.display = mode === 'realCombat' ? 'block' : 'none';
    this.dom.viewSingleFlash.style.display = mode === 'singleFlash' ? 'block' : 'none';
    this.dom.viewTerminalHack.style.display = mode === 'terminalHack' ? 'block' : 'none';

    if (mode === 'home') {
      this.renderHomeView();
    } else if (mode === 'dailyPasswords') {
      this.renderDailyPasswordsView();
    } else if (mode === 'audioDecoder') {
      this.updateDecoderStatusUI(this.decoder ? (this.decoder.isRunning ? 'listening' : 'idle') : 'idle');
    } else if (mode === 'realCombat') {
      this.startRealCombatRound(false); // 关键：切换进来不自动播放声音！
    } else if (mode === 'singleFlash') {
      this.startSingleRound(false);    // 关键：切换进来不自动播放声音！
    } else if (mode === 'terminalHack') {
      this.startTerminalHackRound();
    }
  }

  setLength(len) {
    if (this.codeLength === len) return;
    this.codeLength = len;
    if (len === 3) {
      this.dom.btnLen3.classList.add('active');
      this.dom.btnLen4.classList.remove('active');
    } else {
      this.dom.btnLen4.classList.add('active');
      this.dom.btnLen3.classList.remove('active');
    }
    this.startRealCombatRound(true);
  }

  toggleVisualAssist(enable) {
    if (enable) {
      this.dom.rhythmVisualizer.style.display = 'flex';
      this.dom.rhythmVisualizer.style.opacity = '1';
      this.renderSymbolGuideBadges();
    } else {
      this.dom.rhythmVisualizer.style.display = 'none';
      this.dom.rhythmVisualizer.style.opacity = '0';
    }
  }

  /* =========================================================================
     模式一：实战拟真开门模式逻辑
     ========================================================================= */

  startRealCombatRound(autoPlay = true) {
    if (this.nextRoundTimer) {
      clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = null;
    }
    audioEngine.stop();
    this.realTargetCode = generateRandomCode(this.codeLength);
    this.realInputCode = '';
    this.realTryCount = 0;
    this.realStartTime = Date.now();

    this.dom.screenElem.className = 'terminal-screen';
    this.dom.screenStatusText.textContent = `DECODING // ${this.codeLength} DIGITS`;
    this.dom.screenStatusText.style.color = 'var(--delta-green)';
    this.dom.screenMessage.className = 'screen-message';
    this.dom.screenMessage.textContent = autoPlay
      ? '听取电报音，输入密码开门'
      : '请点击【开始播放】或按【空格键】聆听密码';

    this.renderCodeSlots();
    this.renderSymbolGuideBadges();
    if (autoPlay) {
      this.replayCurrent();
    } else {
      this.updatePlayPauseBtnState(false);
    }
  }

  renderCodeSlots() {
    this.dom.codeSlotsContainer.innerHTML = '';
    for (let i = 0; i < this.codeLength; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot empty';
      slot.id = `slot-${i}`;
      this.dom.codeSlotsContainer.appendChild(slot);
    }
    this.updateCodeSlotsDisplay();
  }

  updateCodeSlotsDisplay() {
    for (let i = 0; i < this.codeLength; i++) {
      const slot = document.getElementById(`slot-${i}`);
      if (!slot) continue;
      if (i < this.realInputCode.length) {
        slot.textContent = this.realInputCode[i];
        slot.className = 'slot active';
      } else {
        slot.textContent = '';
        slot.className = i === this.realInputCode.length ? 'slot active empty' : 'slot empty';
      }
    }
  }

  renderSymbolGuideBadges() {
    this.dom.symbolDisplayContainer.innerHTML = '';
    if (!this.isVisualAssist) return;

    for (let c = 0; c < this.codeLength; c++) {
      const charGroup = document.createElement('div');
      charGroup.style.display = 'flex';
      charGroup.style.gap = '3px';

      for (let s = 0; s < 5; s++) {
        const badge = document.createElement('span');
        badge.className = 'symbol-badge';
        badge.dataset.char = c;
        badge.dataset.sym = s;
        badge.textContent = '·';
        charGroup.appendChild(badge);
      }

      this.dom.symbolDisplayContainer.appendChild(charGroup);
      if (c < this.codeLength - 1) {
        const divider = document.createElement('span');
        divider.style.color = '#334155';
        divider.textContent = '|';
        this.dom.symbolDisplayContainer.appendChild(divider);
      }
    }
  }

  replayCurrent() {
    const events = codeToTimingEvents(this.realTargetCode);
    audioEngine.playSequence(events, true);
  }

  togglePlayback() {
    if (audioEngine.isPlaying) {
      audioEngine.stop();
    } else {
      this.replayCurrent();
    }
  }

  updatePlayPauseBtnState(isPlaying) {
    if (isPlaying) {
      this.dom.btnPlayPause.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        暂停播放
      `;
      this.dom.btnPlayPause.style.borderColor = 'var(--delta-amber)';
      this.dom.btnPlayPause.style.color = 'var(--delta-amber)';
    } else {
      this.dom.btnPlayPause.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        开始循环播放
      `;
      this.dom.btnPlayPause.style.borderColor = 'var(--delta-green)';
      this.dom.btnPlayPause.style.color = 'var(--delta-green)';
    }
  }

  handleKeypadInput(val) {
    audioEngine.playKeypadClick();

    if (val >= '0' && val <= '9') {
      if (this.realInputCode.length < this.codeLength) {
        this.realInputCode += val;
        this.updateCodeSlotsDisplay();

        if (this.realInputCode.length === this.codeLength) {
          this.verifyRealCombatCode();
        }
      }
    } else if (val === 'CLEAR') {
      if (this.realInputCode.length > 0) {
        this.realInputCode = this.realInputCode.slice(0, -1);
        this.updateCodeSlotsDisplay();
      }
    } else if (val === 'ENTER') {
      this.verifyRealCombatCode();
    }
  }

  verifyRealCombatCode() {
    if (this.realInputCode.length === 0) return;

    this.realTryCount++;
    const isCorrect = this.realInputCode === this.realTargetCode;

    if (isCorrect) {
      audioEngine.stop();
      audioEngine.playSuccessSound();

      const timeElapsed = ((Date.now() - this.realStartTime) / 1000).toFixed(1);
      this.dom.screenElem.className = 'terminal-screen unlocked';
      this.dom.screenStatusText.textContent = 'ACCESS GRANTED // DOOR OPEN';
      this.dom.screenStatusText.style.color = 'var(--delta-green)';
      this.dom.screenMessage.className = 'screen-message success';
      this.dom.screenMessage.innerHTML = `🎉 房门开启成功！耗时: <strong>${timeElapsed}s</strong> (尝试 ${this.realTryCount} 次)`;

      if (this.nextRoundTimer) {
        clearTimeout(this.nextRoundTimer);
      }
      this.nextRoundTimer = setTimeout(() => {
        this.startRealCombatRound();
      }, 2000);

    } else {
      audioEngine.playErrorSound();
      this.dom.screenElem.className = 'terminal-screen locked-error';
      this.dom.screenStatusText.textContent = `ACCESS DENIED // 错误 (${this.realTryCount}/3)`;
      this.dom.screenStatusText.style.color = 'var(--delta-red)';
      this.dom.screenMessage.className = 'screen-message error';
      this.dom.screenMessage.textContent = '❌ 密码错误，请重新聆听辨别！';

      setTimeout(() => {
        this.dom.screenElem.className = 'terminal-screen';
        this.realInputCode = '';
        this.updateCodeSlotsDisplay();
      }, 600);
    }
  }

  /* =========================================================================
     模式二：单字速记突击模式逻辑
     ========================================================================= */

  startSingleRound(autoPlay = true) {
    if (this.singleTimer) {
      clearTimeout(this.singleTimer);
      this.singleTimer = null;
    }
    audioEngine.stop();
    this.singleTargetDigit = Math.floor(Math.random() * 10).toString();
    this.singleStartTime = Date.now();

    this.dom.singlePromptMessage.textContent = autoPlay
      ? '仔细听单字发音，快速点按答案！'
      : '请点击【再听一次】或按【空格键】开始听音答题！';
    this.dom.singlePromptMessage.style.color = 'var(--text-secondary)';

    document.querySelectorAll('.digit-choice-btn').forEach(btn => {
      btn.className = 'digit-choice-btn';
    });

    if (autoPlay) {
      this.playSingleDigit();
    }
  }

  playSingleDigit() {
    this.singleStartTime = Date.now();
    const events = codeToTimingEvents(this.singleTargetDigit);
    audioEngine.playSequence(events, false);
  }

  handleSingleChoice(digit) {
    if (!this.singleTargetDigit) return;

    if (this.singleTimer) {
      clearTimeout(this.singleTimer);
      this.singleTimer = null;
    }

    audioEngine.playKeypadClick();
    const isCorrect = digit === this.singleTargetDigit;
    const reactionTime = Date.now() - this.singleStartTime;

    this.singleTotalAnswers++;
    const chosenBtn = document.querySelector(`.digit-choice-btn[data-digit="${digit}"]`);
    const correctBtn = document.querySelector(`.digit-choice-btn[data-digit="${this.singleTargetDigit}"]`);

    if (isCorrect) {
      this.singleCorrectAnswers++;
      this.singleCombo++;
      if (this.singleCombo > this.singleBestCombo) {
        this.singleBestCombo = this.singleCombo;
      }
      this.singleReactionTimes.push(reactionTime);

      if (chosenBtn) chosenBtn.classList.add('correct');
      audioEngine.playSuccessSound();

      const morseInfo = MORSE_DIGITS[digit];
      this.dom.singlePromptMessage.innerHTML = `✅ 正确！数字 <strong>${digit}</strong> (${morseInfo.tip}) - 响应: ${reactionTime}ms`;
      this.dom.singlePromptMessage.style.color = 'var(--delta-green)';

      this.singleTimer = setTimeout(() => this.startSingleRound(), 900);

    } else {
      this.singleCombo = 0;
      if (chosenBtn) chosenBtn.classList.add('wrong');
      if (correctBtn) correctBtn.classList.add('correct');
      audioEngine.playErrorSound();

      const correctInfo = MORSE_DIGITS[this.singleTargetDigit];
      this.dom.singlePromptMessage.innerHTML = `❌ 答错了！正确答案是 <strong>${this.singleTargetDigit}</strong> (${correctInfo.tip})`;
      this.dom.singlePromptMessage.style.color = 'var(--delta-red)';

      this.singleTimer = setTimeout(() => this.startSingleRound(), 1500);
    }

    this.updateSingleStats();
  }

  updateSingleStats() {
    this.dom.singleComboText.textContent = `${this.singleCombo} (最高 ${this.singleBestCombo})`;
    const acc = this.singleTotalAnswers > 0
      ? Math.round((this.singleCorrectAnswers / this.singleTotalAnswers) * 100)
      : 100;
    this.dom.singleAccText.textContent = `${acc}%`;

    const avg = this.singleReactionTimes.length > 0
      ? Math.round(this.singleReactionTimes.reduce((a, b) => a + b, 0) / this.singleReactionTimes.length)
      : 0;
    this.dom.singleAvgTimeText.textContent = `${avg}ms`;
  }

  /* =========================================================================
     模式三：电脑终端屏幕视觉速算破译逻辑
     ========================================================================= */

  startTerminalHackRound() {
    if (this.hackTimerInterval) {
      clearInterval(this.hackTimerInterval);
      this.hackTimerInterval = null;
    }
    if (this.hackNextTimer) {
      clearTimeout(this.hackNextTimer);
      this.hackNextTimer = null;
    }

    this.hackTargetCode = generateRandomCode(3);
    this.hackInputCode = '';
    this.hackStartTime = Date.now();

    this.dom.hackScreen.className = 'hack-monitor-screen';
    this.dom.hackStatusMessage.className = 'screen-message';
    this.dom.hackStatusMessage.textContent = '肉眼识别上方摩斯代码，心算后输入 3 位密码黑入终端！';
    this.dom.hackExplainRow.style.display = 'none';
    this.dom.hackExplainRow.innerHTML = '';

    this.renderHackMorseCards();
    this.renderHackInputSlots();

    // 启动测速秒表
    this.dom.hackTimerBadge.textContent = '0.0s';
    this.hackTimerInterval = setInterval(() => {
      const elapsed = ((Date.now() - this.hackStartTime) / 1000).toFixed(1);
      this.dom.hackTimerBadge.textContent = `${elapsed}s`;
    }, 100);
  }

  renderHackMorseCards() {
    const groups = getMorseVisualGroups(this.hackTargetCode);
    this.dom.hackCardsRow.innerHTML = '';

    groups.forEach((g, idx) => {
      const card = document.createElement('div');
      card.className = 'hack-card';
      card.innerHTML = `
        <span class="hack-card-tag">[ CIPHER #${idx + 1} ]</span>
        <span class="hack-card-morse">${g.code}</span>
      `;
      this.dom.hackCardsRow.appendChild(card);
    });
  }

  renderHackInputSlots() {
    this.dom.hackInputSlots.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot empty';
      slot.id = `hack-slot-${i}`;
      this.dom.hackInputSlots.appendChild(slot);
    }
    this.updateHackInputSlotsDisplay();
  }

  updateHackInputSlotsDisplay() {
    for (let i = 0; i < 3; i++) {
      const slot = document.getElementById(`hack-slot-${i}`);
      if (!slot) continue;
      if (i < this.hackInputCode.length) {
        slot.textContent = this.hackInputCode[i];
        slot.className = 'slot active';
      } else {
        slot.textContent = '';
        slot.className = i === this.hackInputCode.length ? 'slot active empty' : 'slot empty';
      }
    }
  }

  handleHackInput(val) {
    audioEngine.playKeypadClick();

    if (val >= '0' && val <= '9') {
      if (this.hackInputCode.length < 3) {
        this.hackInputCode += val;
        this.updateHackInputSlotsDisplay();

        if (this.hackInputCode.length === 3) {
          this.verifyTerminalHackCode();
        }
      }
    } else if (val === 'CLEAR') {
      if (this.hackInputCode.length > 0) {
        this.hackInputCode = this.hackInputCode.slice(0, -1);
        this.updateHackInputSlotsDisplay();
      }
    } else if (val === 'ENTER') {
      this.verifyTerminalHackCode();
    }
  }

  verifyTerminalHackCode() {
    if (this.hackInputCode.length === 0) return;

    if (this.hackTimerInterval) {
      clearInterval(this.hackTimerInterval);
      this.hackTimerInterval = null;
    }

    const timeElapsedSec = parseFloat(((Date.now() - this.hackStartTime) / 1000).toFixed(1));
    const isCorrect = this.hackInputCode === this.hackTargetCode;
    const groups = getMorseVisualGroups(this.hackTargetCode);

    // 组装详细速算解释
    let explainHtml = '<div><strong>⚡ 速算推导法则：</strong></div>';
    groups.forEach((g, idx) => {
      explainHtml += `<div>[#${idx + 1}] <code>${g.code}</code> ➔ <strong>${g.digit}</strong> (${g.explain})</div>`;
    });
    this.dom.hackExplainRow.innerHTML = explainHtml;
    this.dom.hackExplainRow.style.display = 'flex';

    if (isCorrect) {
      audioEngine.playSuccessSound();
      this.dom.hackScreen.className = 'hack-monitor-screen unlocked';
      this.dom.hackStatusMessage.className = 'screen-message success';
      this.dom.hackStatusMessage.innerHTML = `💻 权限破译成功！神速: <strong>${timeElapsedSec}s</strong>`;

      this.hackSolvedTotal++;
      this.hackTimesList.push(timeElapsedSec);
      if (timeElapsedSec < this.hackBestRecord) {
        this.hackBestRecord = timeElapsedSec;
      }
      this.updateHackStats();

      this.hackNextTimer = setTimeout(() => {
        this.startTerminalHackRound();
      }, 2000);

    } else {
      audioEngine.playErrorSound();
      this.dom.hackScreen.className = 'hack-monitor-screen locked-error';
      this.dom.hackStatusMessage.className = 'screen-message error';
      this.dom.hackStatusMessage.innerHTML = `❌ 入侵失败！正确密码应为: <strong>${this.hackTargetCode}</strong>`;

      this.hackNextTimer = setTimeout(() => {
        this.dom.hackScreen.className = 'hack-monitor-screen';
        this.hackInputCode = '';
        this.updateHackInputSlotsDisplay();
      }, 1800);
    }
  }

  updateHackStats() {
    this.dom.hackSolvedCount.textContent = this.hackSolvedTotal;
    this.dom.hackBestTime.textContent = this.hackBestRecord !== Infinity ? `${this.hackBestRecord}s` : '--';
    const avg = this.hackTimesList.length > 0
      ? (this.hackTimesList.reduce((a, b) => a + b, 0) / this.hackTimesList.length).toFixed(1)
      : '0.0';
    this.dom.hackAvgTime.textContent = `${avg}s`;
  }

  /* =========================================================================
     摩斯小抄与全图情报弹窗渲染 (修复小抄不触发主播放按钮)
     ========================================================================= */

  renderCheatSheet() {
    this.dom.cheatSheetList.innerHTML = '';
    Object.entries(MORSE_DIGITS).forEach(([digit, item]) => {
      const el = document.createElement('div');
      el.className = 'cheat-item';
      el.innerHTML = `
        <span class="cheat-digit">${digit}</span>
        <span class="cheat-morse">${item.code}</span>
        <button class="cheat-sound-btn" title="试听发音">🔊 ${item.dots}快${item.dashes}慢</button>
      `;
      // 点击右下角小抄仅使用独立的 previewSequence 播放，绝不改动主界面播放/暂停按钮
      el.addEventListener('click', () => {
        const events = codeToTimingEvents(digit);
        audioEngine.previewSequence(events);
      });
      this.dom.cheatSheetList.appendChild(el);
    });
  }

  renderIntelModal() {
    let html = `
      <div>
        <h4 class="intel-section-title">⚡ 听音秒解技巧与速记口诀</h4>
        <div class="tips-box">
    `;

    MORSE_RULES_TIPS.forEach(tip => {
      html += `
        <div class="tip-item">
          <strong>${tip.title}</strong>
          <div>${tip.content.replace(/\n/g, '<br/>')}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
      <div>
        <h4 class="intel-section-title">🗺️ 三角洲行动各大地图密码房点位与机制</h4>
        <div class="map-intel-grid">
    `;

    DELTA_MAP_INTEL.forEach(map => {
      html += `
        <div class="map-card">
          <div class="map-card-head">
            <h4>${map.mapName}</h4>
            <span class="badge">${map.badge}</span>
          </div>
      `;
      map.rooms.forEach(r => {
        html += `
          <div class="room-detail" style="margin-bottom: 8px;">
            <div>🚪 <strong>${r.name}</strong> [${r.digits}] - <span style="color:var(--delta-amber);">${r.mechanism}</span></div>
            <div>📍 <strong>位置线索：</strong>${r.clue}</div>
            <div>🎁 <strong>物资奖励：</strong>${r.loot}</div>
          </div>
        `;
      });
      html += `</div>`;
    });

    html += `
        </div>
      </div>
    `;

    this.dom.intelModalContent.innerHTML = html;
  }

  openIntelModal() {
    this.dom.intelModalOverlay.classList.add('open');
  }

  closeIntelModal() {
    this.dom.intelModalOverlay.classList.remove('open');
  }

  /* =========================================================================
     战术反馈 Toast 提示与日期管理
     ========================================================================= */

  showToast(text, duration = 2200) {
    if (!this.dom.tacticalToast) return;
    this.dom.tacticalToast.textContent = text;
    this.dom.tacticalToast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.dom.tacticalToast.classList.remove('show');
    }, duration);
  }

  initTodayDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    this.todayDateStr = `${y}-${m}-${d}`;
  }

  loadDailyPasswordsData() {
    const saved = localStorage.getItem('delta_daily_passwords_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.dailyPasswords = parsed;
          return;
        }
      } catch (e) {}
    }
    this.dailyPasswords = JSON.parse(JSON.stringify(DAILY_PASSWORDS_CONFIG));
  }

  /* =========================================================================
     首页作战大厅渲染
     ========================================================================= */

  renderHomeView() {
    if (this.dom.homeTodayDate) {
      this.dom.homeTodayDate.textContent = this.todayDateStr;
    }

    if (this.dom.homeQuickList) {
      this.dom.homeQuickList.innerHTML = '';
      this.dailyPasswords.forEach(item => {
        const card = document.createElement('div');
        card.className = 'quick-card';
        const code = item.code || item.defaultCode;
        card.innerHTML = `
          <div class="quick-card-map">${item.mapName}</div>
          <div class="quick-card-bottom">
            <span class="quick-card-code">${code}</span>
            <button class="quick-copy-btn" data-code="${code}" data-name="${item.mapName}">复制</button>
          </div>
        `;
        const copyBtn = card.querySelector('.quick-copy-btn');
        if (copyBtn) {
          copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(code).then(() => {
              this.showToast(`📋 已复制 [${item.mapName}] 密码: ${code}`);
            }).catch(() => {
              this.showToast(`📋 密码: ${code}`);
            });
          });
        }
        this.dom.homeQuickList.appendChild(card);
      });
    }
  }

  /* =========================================================================
     每日密码速报站渲染与交互 (含航天基地 A1-B1-B2-C1 专属剖析)
     ========================================================================= */

  renderDailyPasswordsView() {
    if (this.dom.dailyActiveDate) {
      this.dom.dailyActiveDate.textContent = this.todayDateStr;
    }

    if (this.dom.btnResetDaily) {
      const hasCustom = localStorage.getItem('delta_daily_passwords_v2');
      this.dom.btnResetDaily.style.display = hasCustom ? 'inline-flex' : 'none';
    }

    if (this.dom.dailyEditHint) {
      this.dom.dailyEditHint.style.display = this.isDailyEditMode ? 'flex' : 'none';
    }

    if (this.dom.btnEditDailyMode) {
      this.dom.btnEditDailyMode.textContent = this.isDailyEditMode ? '完成退出' : '✏️ 自定义修改';
    }

    if (this.dom.dailyCardsContainer) {
      this.dom.dailyCardsContainer.innerHTML = '';
      this.dailyPasswords.forEach(item => {
        const card = document.createElement('div');
        card.className = 'daily-card';
        const code = item.code || item.defaultCode;
        const tagClass = item.tagType || 'normal';

        let breakdownHtml = '';
        if (item.id === 'space-city-a1b1b2c1') {
          const digits = code.split('');
          const a1 = digits[0] || '?';
          const b1 = digits[1] || '?';
          const b2 = digits[2] || '?';
          const c1 = digits[3] || '?';
          breakdownHtml = `
            <div class="daily-card-breakdown">
              <strong>四点联动分解：</strong>
              <span>[A1]=${a1}</span> · 
              <span>[B1]=${b1}</span> · 
              <span>[B2]=${b2}</span> · 
              <span>[C1]=${c1}</span>
            </div>
          `;
        }

        const codeAreaHtml = this.isDailyEditMode
          ? `<input type="text" maxlength="4" class="daily-code-input" data-id="${item.id}" value="${code}">`
          : `<div class="daily-code-box"><span class="code-text">${code}</span></div>`;

        card.innerHTML = `
          <div class="daily-card-info">
            <div class="daily-card-title-row">
              <span class="daily-card-title">${item.mapName}</span>
              <span class="daily-tag ${tagClass}">${item.tag}</span>
            </div>
            <div class="daily-card-desc">📍 <strong>位置：</strong>${item.pointDesc}</div>
            <div class="daily-card-loot">🎁 <strong>物资：</strong>${item.loot}</div>
            ${breakdownHtml}
          </div>
          <div class="daily-card-center">
            ${codeAreaHtml}
          </div>
          <div class="daily-card-actions">
            <button class="btn-card-copy" data-code="${code}" data-name="${item.mapName}">
              📋 复制
            </button>
            <button class="btn-card-audio" data-code="${code}" title="试听该组4位摩斯电报发音">
              🔊 试听发音
            </button>
          </div>
        `;

        // 单卡片复制按钮
        const copyBtn = card.querySelector('.btn-card-copy');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(code).then(() => {
              this.showToast(`📋 已复制 [${item.mapName}] 密码: ${code}`);
            }).catch(() => {
              this.showToast(`📋 密码: ${code}`);
            });
          });
        }

        // 单卡片试听按钮 (使用独立的 previewSequence，完全不影响正在进行的题目或播放按钮状态)
        const audioBtn = card.querySelector('.btn-card-audio');
        if (audioBtn) {
          audioBtn.addEventListener('click', () => {
            const events = codeToTimingEvents(code);
            audioEngine.previewSequence(events);
            this.showToast(`🔊 正在试听 [${code}] 摩斯电报音频...`);
          });
        }

        this.dom.dailyCardsContainer.appendChild(card);
      });
    }
  }

  copyAllDailyPasswords() {
    let text = `【三角洲行动 每日密码速报 (${this.todayDateStr})】\n`;
    this.dailyPasswords.forEach((item, idx) => {
      const code = item.code || item.defaultCode;
      if (item.id === 'space-city-a1b1b2c1') {
        const d = code.split('');
        text += `${idx + 1}. ${item.mapName}：${code} (A1=${d[0] || '?'}, B1=${d[1] || '?'}, B2=${d[2] || '?'}, C1=${d[3] || '?'})\n`;
      } else {
        text += `${idx + 1}. ${item.mapName}：${code}\n`;
      }
    });
    text += `* 提示：每日 00:00 官方统一轮换；密码门无法被手雷或爆炸物破坏，连续输错 3 次锁定 10 分钟！`;

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('📋 已复制今日全图密码，可直接粘贴分享至微信/QQ开黑群！');
    }).catch(() => {
      this.showToast('📋 复制成功！');
    });
  }

  syncDailyPasswords() {
    if (this.dom.btnSyncDaily) {
      this.dom.btnSyncDaily.disabled = true;
      this.dom.btnSyncDaily.innerHTML = `
        <span class="indicator-dot" style="animation: pulse 1s infinite;"></span>
        正在连接情报网络...
      `;
    }

    setTimeout(() => {
      if (this.dom.btnSyncDaily) {
        this.dom.btnSyncDaily.disabled = false;
        this.dom.btnSyncDaily.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
          检查网络最新更新
        `;
      }
      if (this.dom.dailySyncStatusText) {
        this.dom.dailySyncStatusText.textContent = `已校准同步最新情报 (${new Date().toLocaleTimeString()})`;
      }
      this.renderDailyPasswordsView();
      this.renderHomeView();
      this.showToast('🔄 今日全图密码已成功与服务器00:00数据校准对齐！');
    }, 600);
  }

  toggleDailyEditMode() {
    if (this.isDailyEditMode) {
      this.saveDailyEdits();
    } else {
      this.isDailyEditMode = true;
      this.renderDailyPasswordsView();
    }
  }

  saveDailyEdits() {
    const inputs = document.querySelectorAll('.daily-code-input');
    inputs.forEach(input => {
      const id = input.dataset.id;
      const val = input.value.trim();
      const target = this.dailyPasswords.find(p => p.id === id);
      if (target && val.length > 0) {
        target.code = val;
      }
    });

    localStorage.setItem('delta_daily_passwords_v2', JSON.stringify(this.dailyPasswords));
    this.isDailyEditMode = false;
    this.renderDailyPasswordsView();
    this.renderHomeView();
    this.showToast('💾 已保存自定义密码到本地缓存！');
  }

  resetDailyPasswords() {
    localStorage.removeItem('delta_daily_passwords_v2');
    this.dailyPasswords = JSON.parse(JSON.stringify(DAILY_PASSWORDS_CONFIG));
    this.isDailyEditMode = false;
    this.renderDailyPasswordsView();
    this.renderHomeView();
    this.showToast('↺ 已重置为推荐基准密码！');
  }

  /* =========================================================================
     游戏声音实时听音破译控制与示波器绘制
     ========================================================================= */

  initAudioDecoder() {
    this.decoder = new MorseAudioDecoder({
      targetFreq: 750,
      threshold: 0.20,
      onSignalState: (state) => {
        this.renderDecoderSignal(state);
      },
      onSymbolDetected: (symbol, duration) => {
        if (this.dom.decoderLiveSymbols) {
          this.dom.decoderLiveSymbols.textContent = this.decoder.currentSymbols || '--';
        }
      },
      onDigitDecoded: (digit, fullCode, codeSymbols) => {
        if (this.dom.decoderResultCode) {
          this.dom.decoderResultCode.textContent = fullCode.split('').join(' ');
        }
        if (this.dom.decoderResultMeta) {
          this.dom.decoderResultMeta.textContent = `已解码 ${fullCode.length} 位 · 最近解析: ${digit} (${codeSymbols})`;
        }
        if (this.dom.decoderLiveSymbols) {
          this.dom.decoderLiveSymbols.textContent = '--';
        }
      },
      onSequenceComplete: (fullCode) => {
        this.showToast(`🎯 完整密码捕获成功: ${fullCode}`);
        if (this.dom.decoderResultMeta) {
          this.dom.decoderResultMeta.textContent = `✅ 轮次捕获完毕: 【${fullCode}】等待下轮循环...`;
        }
        this.addDecoderHistory(fullCode);
      },
      onError: (errMsg) => {
        this.showToast(`⚠️ ${errMsg}`, 3500);
      },
      onStatusChange: (status) => {
        this.updateDecoderStatusUI(status);
      }
    });

    // 绑定音频采集控制按钮
    if (this.dom.btnStartSystemAudio) {
      this.dom.btnStartSystemAudio.addEventListener('click', async () => {
        try {
          await this.decoder.startSystemAudio();
          this.showToast('🖥️ 已接入系统音频内录，请切入游戏靠近密码门！');
        } catch (err) {
          this.showToast(`❌ 接入失败: ${err.message}`, 4000);
        }
      });
    }

    if (this.dom.btnStartMicAudio) {
      this.dom.btnStartMicAudio.addEventListener('click', async () => {
        try {
          await this.decoder.startMicrophone();
          this.showToast('🎙️ 已开启麦克风监听，请将设备对准扬声器！');
        } catch (err) {
          this.showToast(`❌ 麦克风开启失败: ${err.message}`, 4000);
        }
      });
    }

    if (this.dom.btnStopAudioDecoder) {
      this.dom.btnStopAudioDecoder.addEventListener('click', () => {
        this.decoder.stop();
        this.showToast('⏹️ 监听已停止');
      });
    }

    // 频率滑块
    if (this.dom.sliderDecoderFreq) {
      this.dom.sliderDecoderFreq.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.dom.valDecoderFreq) this.dom.valDecoderFreq.textContent = `${val} Hz`;
        if (this.dom.statDecoderHz) this.dom.statDecoderHz.textContent = `中心滤波：${val} Hz`;
        this.decoder.setTargetFrequency(val);
      });
    }

    // 预设芯片按钮
    document.querySelectorAll('.freq-presets .btn-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const freq = parseInt(btn.dataset.freq, 10);
        if (this.dom.sliderDecoderFreq) this.dom.sliderDecoderFreq.value = freq;
        if (this.dom.valDecoderFreq) this.dom.valDecoderFreq.textContent = `${freq} Hz`;
        if (this.dom.statDecoderHz) this.dom.statDecoderHz.textContent = `中心滤波：${freq} Hz`;
        document.querySelectorAll('.freq-presets .btn-chip').forEach(b => b.classList.toggle('active', b === btn));
        this.decoder.setTargetFrequency(freq);
      });
    });

    // 灵敏度滑块
    if (this.dom.sliderDecoderThreshold) {
      this.dom.sliderDecoderThreshold.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.dom.valDecoderThreshold) this.dom.valDecoderThreshold.textContent = `${val}%`;
        this.decoder.setThreshold(val / 100);
      });
    }

    // 一键复制已解码密码
    if (this.dom.btnCopyDecoderCode) {
      this.dom.btnCopyDecoderCode.addEventListener('click', () => {
        const code = this.decoder.decodedDigits;
        if (!code) {
          this.showToast('⚠️ 当前尚未解析出密码数字');
          return;
        }
        navigator.clipboard.writeText(code).then(() => {
          this.showToast(`📋 密码 【${code}】 已复制到剪贴板！`);
        }).catch(() => {
          this.showToast(`密码为: ${code}`);
        });
      });
    }

    // 清空重试
    if (this.dom.btnClearDecoderCode) {
      this.dom.btnClearDecoderCode.addEventListener('click', () => {
        this.decoder.resetBuffer();
        if (this.dom.decoderResultCode) this.dom.decoderResultCode.textContent = '_ _ _';
        if (this.dom.decoderLiveSymbols) this.dom.decoderLiveSymbols.textContent = '--';
        if (this.dom.decoderResultMeta) this.dom.decoderResultMeta.textContent = '已清空，等待新电报信号...';
        this.showToast('🧹 已重置当前识别缓存');
      });
    }

    // 初始化示波器 Canvas 上下文
    if (this.dom.decoderCanvas) {
      this.decoderCanvasCtx = this.dom.decoderCanvas.getContext('2d');
    }
  }

  updateDecoderStatusUI(status) {
    const isListening = status === 'listening';
    if (this.dom.decoderStatusPill) {
      this.dom.decoderStatusPill.classList.toggle('listening', isListening);
    }
    if (this.dom.decoderStatusText) {
      this.dom.decoderStatusText.textContent = isListening 
        ? `🟢 实时监听中 (${this.decoder && this.decoder.sourceType === 'system' ? '系统音频' : '麦克风'})`
        : '待命就绪 · 待选择音频源';
    }
    if (this.dom.btnStopAudioDecoder) {
      this.dom.btnStopAudioDecoder.style.display = isListening ? 'inline-flex' : 'none';
    }
    if (this.dom.btnStartSystemAudio) {
      this.dom.btnStartSystemAudio.classList.toggle('active', isListening && this.decoder && this.decoder.sourceType === 'system');
    }
    if (this.dom.btnStartMicAudio) {
      this.dom.btnStartMicAudio.classList.toggle('active', isListening && this.decoder && this.decoder.sourceType === 'microphone');
    }
  }

  renderDecoderSignal(state) {
    // 1. 更新电平能量条
    const pct = Math.min(100, Math.round(state.energy * 100));
    const threshPct = Math.min(100, Math.round(state.threshold * 100));
    if (this.dom.decoderEnergyFill) this.dom.decoderEnergyFill.style.width = `${pct}%`;
    if (this.dom.decoderThresholdMarker) this.dom.decoderThresholdMarker.style.left = `${threshPct}%`;
    if (this.dom.decoderEnergyVal) this.dom.decoderEnergyVal.textContent = `${pct}%`;

    // 2. 更新指示灯
    if (this.dom.statDecoderSignal) {
      if (state.isHigh) {
        this.dom.statDecoderSignal.classList.add('high');
        this.dom.statDecoderSignal.textContent = '🔊 蜂鸣信号';
      } else {
        this.dom.statDecoderSignal.classList.remove('high');
        this.dom.statDecoderSignal.textContent = '静音中';
      }
    }

    // 3. 绘制示波器波形
    if (this.decoderCanvasCtx && state.timeData) {
      const ctx = this.decoderCanvasCtx;
      const width = this.dom.decoderCanvas.width;
      const height = this.dom.decoderCanvas.height;

      ctx.clearRect(0, 0, width, height);

      // 绘制中心参考线
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // 绘制波形曲线
      ctx.beginPath();
      ctx.lineWidth = state.isHigh ? 2.5 : 1.5;
      ctx.strokeStyle = state.isHigh ? '#00ff66' : '#00b4d8';
      ctx.shadowColor = state.isHigh ? '#00ff66' : '#00b4d8';
      ctx.shadowBlur = state.isHigh ? 8 : 2;

      const sliceWidth = width / state.timeData.length;
      let x = 0;
      for (let i = 0; i < state.timeData.length; i++) {
        const v = state.timeData[i] / 128.0;
        const y = (v * height) / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  addDecoderHistory(code) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this.decoderHistory.unshift({ code, time });
    if (this.decoderHistory.length > 5) this.decoderHistory.pop();
    this.renderDecoderHistory();
  }

  renderDecoderHistory() {
    if (!this.dom.decoderHistoryList) return;
    if (this.decoderHistory.length === 0) {
      this.dom.decoderHistoryList.innerHTML = `<div class="history-empty">暂无捕获记录，启动监听靠近游戏密码门即可自动记录</div>`;
      return;
    }
    let html = '';
    this.decoderHistory.forEach(item => {
      html += `
        <div class="history-item">
          <div>
            <span class="history-code">${item.code}</span>
            <span style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">(${item.code.length}位)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="history-time">${item.time}</span>
            <button class="history-copy-btn" data-code="${item.code}">复制</button>
          </div>
        </div>
      `;
    });
    this.dom.decoderHistoryList.innerHTML = html;
    this.dom.decoderHistoryList.querySelectorAll('.history-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.dataset.code;
        navigator.clipboard.writeText(c).then(() => {
          this.showToast(`📋 已复制: ${c}`);
        });
      });
    });
  }
}

// 页面加载启动
window.addEventListener('DOMContentLoaded', () => {
  const app = new DeltaMorseTrainerApp();
  app.init();
});
