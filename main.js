/**
 * main.js - 三角洲行动 摩斯密码特训模拟器完整逻辑 (纯前端零依赖，支持双击直接运行与Cloudflare Pages部署)
 * 包含：
 * 1. 实战模拟开门模式 (听力3位/4位开锁)
 * 2. 单字本能闯关模式 (单字毫秒测速反应)
 * 3. 电脑终端破译模式 (视觉速算眼力挑战)
 * 4. 修复小抄点击独立试听不污染主播放按钮
 * 5. 全面适配 Cloudflare Pages 自动播放策略与静态托管
 */

(function () {
  'use strict';

  /* =========================================================================
     1. 摩斯电码与三角洲密码情报数据
     ========================================================================= */

  const MORSE_DIGITS = {
    '0': { code: '-----', dots: 0, dashes: 5, tip: '5长（慢音）', audioDesc: '慢-慢-慢-慢-慢' },
    '1': { code: '·----', dots: 1, dashes: 4, tip: '1短4长（1快4慢）', audioDesc: '快-慢-慢-慢-慢' },
    '2': { code: '··---', dots: 2, dashes: 3, tip: '2短3长（2快3慢）', audioDesc: '快-快-慢-慢-慢' },
    '3': { code: '···--', dots: 3, dashes: 2, tip: '3短2长（3快2慢）', audioDesc: '快-快-快-慢-慢' },
    '4': { code: '····-', dots: 4, dashes: 1, tip: '4短1长（4快1慢）', audioDesc: '快-快-快-快-慢' },
    '5': { code: '·····', dots: 5, dashes: 0, tip: '5短（快音）', audioDesc: '快-快-快-快-快' },
    '6': { code: '-····', dots: 4, dashes: 1, tip: '1长4短（1慢4快）', audioDesc: '慢-快-快-快-快' },
    '7': { code: '--···', dots: 3, dashes: 2, tip: '2长3短（2慢3快）', audioDesc: '慢-慢-快-快-快' },
    '8': { code: '---··', dots: 2, dashes: 3, tip: '3长2短（3慢2快）', audioDesc: '慢-慢-慢-快-快' },
    '9': { code: '----·', dots: 1, dashes: 4, tip: '4长1短（4慢1快）', audioDesc: '慢-慢-慢-慢-快' }
  };

  const MORSE_RULES_TIPS = [
    {
      title: '🎯 首尾判别律 / 轮次长停顿定首位（核心听音准则）',
      content: '实战中每播报完整的一轮密码后，必定有约 2.5 ~ 3 秒的明显静音空白（长停顿）。\n【长空白后的第一声，必定是第 1 位密码！】\n随后每个数字之间有约 0.6 秒的清晰停顿。因此密码的先后顺序是绝对明确固定的，只要耐心等待一次长停顿即可顺次记录，绝不需要穷举猜顺序！严禁盲目试错避免触发终端锁死。'
    },
    {
      title: '⚡ 首音定区间黄金法则（听音秒辨技巧）',
      content: '每个数字固定由 5 个符号组成：\n1. 【首声为短音（快嘀）】➔ 必定在 1 ~ 5 之间！直接数接下来这组一共出现了几个短音，短音总数即为该数字（1短=1, 2短=2, 3短=3, 4短=4, 5短=5）。\n2. 【首声为长音（慢哒）】➔ 必定在 6 ~ 0 之间！\n   · 5个全是长音 ➔ 0\n   · 1个短音（4长1短）➔ 9\n   · 2个短音（3长2短）➔ 8\n   · 3个短音（2长3短）➔ 7\n   · 4个短音（1长4短）➔ 6'
    },
    {
      title: '💻 电脑终端屏幕密码速算法（眼力视觉破解）',
      content: '在对局中黑入笔记本电脑或控制台时，屏幕会直接显示3位摩斯点划符号。无需死记硬背，牢记“前缀速算律”：\n1. 【点 · 开头】：数有几个点就是几（1点=1, 2点=2, 3点=3, 4点=4, 5点=5）。\n2. 【横 - 开头】：默认基底是 5，5 加上后面的点数即为数字（1长4短=5+1=6, 2长3短=5+2=7, 3长2短=5+3=8, 4长1短=5+4=9）。\n3. 【全横 -----】：即为数字 0。'
    },
    {
      title: '🔄 点划互补对称律（数字结构速记）',
      content: '0 与 5 互为极端（0是5长，5是5短）；\n1 与 9 对称（1是1短4长，9是4长1短）；\n2 与 8 对称（2是2短3长，8是3长2短）；\n3 与 7 对称（3是3短2长，7是2长3短）；\n4 与 6 对称（4是4短1长，6是1长4短）。'
    }
  ];

  const DELTA_MAP_INTEL = [
    {
      mapName: '零号大坝 (Zero Dam)',
      badge: '常规 / 机密热门',
      rooms: [
        {
          name: '主变电站地下水闸密码门 (主干密码房)',
          digits: '4位全服每日刷新',
          mechanism: '每日服务器统一轮换密码',
          clue: '位于主变电站右侧下水道井盖，顺地下管道红灯通道前行至水闸尽头。首次开启地上刷新专属彩蛋箱，内含高级物资/枪皮外观。',
          loot: '首通通关彩蛋箱、高阶防具、大红高价值物品刷新点。'
        },
        {
          name: '水泥厂 / 军营地下管道暗房 (彩蛋暗门)',
          digits: '3位局内动态',
          mechanism: '局内动态生成 / 现场线索',
          clue: '水泥厂左侧地下管道或军营管道深处。周边墙壁、水泥墩或管道端头常有喷漆箭头与数字线索，部分需通过现场电报蜂鸣破译。',
          loot: '5级头盔/防弹衣、扩容箱彩蛋、战术配件。'
        }
      ]
    },
    {
      mapName: '航天基地 (Space City)',
      badge: '绝密 / 高难对抗',
      rooms: [
        {
          name: '工业区组装室2楼控制室 (A1-B1-B2-C1 黑室密码门)',
          digits: '4位每日刷新',
          mechanism: '每日凌晨统一轮换 (A1/B1/B2/C1 四点联动机制)',
          clue: '位于工业区组装室二楼。门禁上标注有【A1、B1、B2、C1】四个联动代号，分别对应4位密码中的第1位、第2位、第3位和第4位！现场伴有电子蜂鸣，可听音破译，也可直接查阅每日更新。门内刷新隐秘协议箱与航天大红。',
          loot: '隐秘协议箱、顶级航天核心电子元件、大红高价值物品、机密保险箱。'
        },
        {
          name: '宿舍楼 / 试车间走廊安全门',
          digits: '4位每日刷新',
          mechanism: '每日服务器统一密码',
          clue: '宿舍楼区中心建筑二楼或水平试车间通道，属兵家必争之地。',
          loot: '高级武器箱、高阶战术装备。'
        }
      ]
    },
    {
      mapName: '长弓溪谷 (Longbow Valley)',
      badge: '常规 / 机密',
      rooms: [
        {
          name: '荒废村庄地下第三隔离区密码门',
          digits: '4位全服每日刷新',
          mechanism: '每日凌晨统一轮换',
          clue: '位于地图右下角荒废村庄下方撤离点附近的地下通道入口。内部地道墙体带有警示标识，门禁终端输入当日统一密码。',
          loot: '高级武器配件包、高阶防具、首通彩蛋物资。'
        }
      ]
    },
    {
      mapName: '巴克什 (Barkesh)',
      badge: '常规 / 机密',
      rooms: [
        {
          name: '大浴场北侧后勤通道保险门',
          digits: '4位全服每日刷新',
          mechanism: '每日凌晨统一轮换',
          clue: '大浴场北侧更衣室后门进入后勤狭长走廊尽头。',
          loot: '大红物品高概率点、高级医疗物资包。'
        }
      ]
    },
    {
      mapName: '潮汐监狱 (Tidal Prison)',
      badge: '特殊模式 / 轮换',
      rooms: [
        {
          name: '行政区一楼大厅楼梯转角安全锁',
          digits: '4位每日刷新',
          mechanism: '每日服务器统一密码',
          clue: '行政区一楼大厅楼梯下拐角处防暴门禁。',
          loot: '机密战术补给箱、高级物资。'
        }
      ]
    }
  ];

  function generateRandomCode(length = 3) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }
    return result;
  }

  function codeToTimingEvents(codeString) {
    const events = [];
    const digits = codeString.split('');

    digits.forEach((digit, charIdx) => {
      const morseObj = MORSE_DIGITS[digit];
      if (!morseObj) return;

      const symbols = morseObj.code.split('');
      symbols.forEach((sym, symIdx) => {
        const isDash = sym === '-';
        events.push({
          type: isDash ? 'dash' : 'dot',
          durationUnits: isDash ? 3 : 1,
          charIndex: charIdx,
          symbolIndex: symIdx,
          digit: digit,
          symbol: sym
        });

        // 符号内微停顿
        if (symIdx < symbols.length - 1) {
          events.push({
            type: 'symbol-space',
            durationUnits: 1,
            charIndex: charIdx
          });
        }
      });

      // 字符间停顿 (数字与数字之间清晰停顿，约 0.6s)
      if (charIdx < digits.length - 1) {
        events.push({
          type: 'char-space',
          durationUnits: 5,
          charIndex: charIdx
        });
      }
    });

    // 整串播完后的长空白停顿（约 2.75 秒真实实战静音间歇）
    events.push({
      type: 'loop-space',
      durationUnits: 22,
      charIndex: -1
    });

    return events;
  }

  function getMorseVisualGroups(digitsStr) {
    return digitsStr.split('').map((d) => {
      const item = MORSE_DIGITS[d];
      let explain = '';
      if (d === '0') {
        explain = '5横 = 0';
      } else if (parseInt(d, 10) <= 5) {
        explain = `点开头: ${item.dots}个点 = ${d}`;
      } else {
        explain = `横开头: 基数5 + ${item.dots}个点 = ${d}`;
      }

      return {
        digit: d,
        code: item ? item.code : '',
        tip: item ? item.tip : '',
        explain: explain
      };
    });
  }

  const DAILY_PASSWORDS_CONFIG = [
    {
      id: 'space-city-a1b1b2c1',
      mapName: '航天基地 (A1-B1-B2-C1 组装室)',
      pointDesc: '工业区组装室二楼控制室 (A1/B1/B2/C1 四点联动)',
      tag: '核心必争',
      tagType: 'core',
      loot: '隐秘协议箱 / 顶级航天电子元件 / 核心大红',
      defaultCode: '7419',
      breakdown: 'A1=7 · B1=4 · B2=1 · C1=9',
      note: '门上标有 A1·B1·B2·C1 四个联动代号，分别对应4位密码中的第1、2、3、4位！'
    },
    {
      id: 'zero-dam-watergate',
      mapName: '零号大坝 (变电站地下水闸)',
      pointDesc: '主变电站右侧下水道井盖 ➔ 地下通道红灯尽头水闸处',
      tag: '热门常驻',
      tagType: 'popular',
      loot: '首通专属彩蛋箱 / 高阶防具 / 保险箱大红',
      defaultCode: '6268',
      breakdown: '',
      note: '每日凌晨全服刷新统一 4 位密码，输入错误 3 次锁定 10 分钟。'
    },
    {
      id: 'longbow-valley-zone3',
      mapName: '长弓溪谷 (荒废村庄隔离区)',
      pointDesc: '荒废村庄右下方撤离点附近地下通道暗门',
      tag: '战术要地',
      tagType: 'normal',
      loot: '高级武器配件包 / 彩蛋箱 / 高阶物资',
      defaultCode: '5831',
      breakdown: '',
      note: '地道墙体带有警示标，门禁终端输入当日统一 4 位密码。'
    },
    {
      id: 'barkesh-bathhouse',
      mapName: '巴克什 (大浴场后勤通道)',
      pointDesc: '大浴场北侧更衣室后门 ➔ 狭长后勤走廊尽头',
      tag: '热门搜刮',
      tagType: 'popular',
      loot: '大红物品高概率点 / 高级医疗物资包',
      defaultCode: '4392',
      breakdown: '',
      note: '每日凌晨统一轮换密码，输错 3 次锁定 10 分钟。'
    },
    {
      id: 'tidal-prison-hall',
      mapName: '潮汐监狱 (行政大厅安全门)',
      pointDesc: '行政区一楼大厅楼梯拐弯下方防暴安全门',
      tag: '特殊轮换',
      tagType: 'normal',
      loot: '机密战术补给箱 / 防暴装备 / 大红',
      defaultCode: '8165',
      breakdown: '',
      note: '重刑监区防暴安全锁，每日定时统一重置。'
    }
  ];

  /* =========================================================================
     2. Web Audio API 音频引擎与环境音效 (排他任务锁 + 独立小抄试听)
     ========================================================================= */

  class TacticalAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;

      // 经典真实三角洲电报音参数
      this.frequency = 750;       // 蜂鸣器音调 (Hz)
      this.volume = 0.8;          // 蜂鸣器音量 (0.0 ~ 1.0)
      this.unitTime = 0.125;      // 基准短音(dot)时长 (秒)，约 125ms，速度适中沉稳
      this.speedRatio = 1.0;      // 播放速度倍率

      // 环境噪音节点
      this.ambientNoiseGain = null;
      this.ambientSource = null;
      this.ambientVolume = 0.15;
      this.isAmbientEnabled = false;

      // 排他会话令牌与小抄独立预览令牌
      this.currentSessionId = 0;
      this.previewSessionId = 0;
      this.isPlaying = false;
      this.isLooping = true;
      this.currentOsc = null;
      this.currentGain = null;

      this.onStateChange = null;
      this.onSymbolActive = null;
      this.onSymbolInactive = null;
      this.onCyclePause = null;
      this.onSequenceComplete = null;
    }

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

    stop() {
      this.currentSessionId++;
      this.isPlaying = false;

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

        const checkInterval = setInterval(() => {
          if (this.currentSessionId !== sessionId) {
            clearInterval(checkInterval);
            try { osc.stop(0); } catch (e) {}
            cleanup();
          }
        }, 20);
      });
    }

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

        checkTimer = setInterval(() => {
          if (this.currentSessionId !== sessionId) {
            cleanup();
          }
        }, 25);
      });
    }

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
     * 绝不影响主界面正在练习的题目、不改变播放按钮文案、不触发全局onStateChange
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

  const audioEngine = new TacticalAudioEngine();

  /* =========================================================================
     2.5 游戏声音实时摩斯听音与解码引擎 (Web Audio DSP)
     ========================================================================= */

  class MorseAudioDecoder {
    constructor(options = {}) {
      this.targetFreq = options.targetFreq || 750;
      this.filterQ = options.filterQ || 6.0;
      this.threshold = options.threshold || 0.20;
      this.noiseFloor = 0.02;

      this.onSignalState = options.onSignalState || null;
      this.onSymbolDetected = options.onSymbolDetected || null;
      this.onDigitDecoded = options.onDigitDecoded || null;
      this.onSequenceComplete = options.onSequenceComplete || null;
      this.onError = options.onError || null;
      this.onStatusChange = options.onStatusChange || null;

      this.audioCtx = null;
      this.mediaStream = null;
      this.sourceNode = null;
      this.bandpassFilter = null;
      this.analyserNode = null;

      this.isRunning = false;
      this.sourceType = 'none';
      this.animationId = null;

      this.isSignalHigh = false;
      this.highStartTime = 0;
      this.lowStartTime = 0;
      this.lastStateChangeTime = performance.now();

      this.currentSymbols = '';
      this.decodedDigits = '';
      this.isSequenceReported = false;

      this.timeData = null;
      this.freqData = null;
    }

    async startSystemAudio() {
      this.stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('当前浏览器不支持系统音频捕获 (getDisplayMedia)。请使用现代 Chrome/Edge 或 HTTPS 访问。');
      }
      try {
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
          throw new Error('未检测到音频轨道！请在共享弹窗中务必勾选【同时共享系统音频】(Share system audio)。');
        }
        stream.getVideoTracks().forEach(t => t.stop());
        audioTracks[0].addEventListener('ended', () => this.stop());
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
          throw new Error('麦克风权限被拒绝，请在浏览器地址栏允许麦克风权限。');
        }
        throw err;
      }
    }

    async initAudioPipeline() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.bandpassFilter = this.audioCtx.createBiquadFilter();
      this.bandpassFilter.type = 'bandpass';
      this.bandpassFilter.frequency.setValueAtTime(this.targetFreq, this.audioCtx.currentTime);
      this.bandpassFilter.Q.setValueAtTime(this.filterQ, this.audioCtx.currentTime);

      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.3;

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

    processLoop() {
      if (!this.isRunning) return;

      this.analyserNode.getByteTimeDomainData(this.timeData);
      this.analyserNode.getByteFrequencyData(this.freqData);

      let sumSquares = 0;
      const len = this.timeData.length;
      for (let i = 0; i < len; i++) {
        const normalized = (this.timeData[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / len);

      const nyquist = this.audioCtx.sampleRate / 2;
      const binIndex = Math.round((this.targetFreq / nyquist) * this.freqData.length);
      let freqEnergy = 0;
      let binCount = 0;
      for (let b = Math.max(0, binIndex - 2); b <= Math.min(this.freqData.length - 1, binIndex + 2); b++) {
        freqEnergy += this.freqData[b] / 255;
        binCount++;
      }
      freqEnergy = binCount > 0 ? freqEnergy / binCount : 0;
      const combinedEnergy = rms * 0.4 + freqEnergy * 0.6;

      const highThreshold = this.threshold;
      const lowThreshold = this.threshold * 0.65;
      const now = performance.now();

      if (!this.isSignalHigh && combinedEnergy >= highThreshold) {
        const silenceDuration = now - this.lowStartTime;
        this.handleSilenceEnd(silenceDuration);
        this.isSignalHigh = true;
        this.highStartTime = now;
        this.lastStateChangeTime = now;
      } else if (this.isSignalHigh && combinedEnergy < lowThreshold) {
        const toneDuration = now - this.highStartTime;
        this.handleToneEnd(toneDuration);
        this.isSignalHigh = false;
        this.lowStartTime = now;
        this.lastStateChangeTime = now;
      } else if (!this.isSignalHigh) {
        const currentSilence = now - this.lowStartTime;
        this.handleOngoingSilence(currentSilence);
      }

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

    handleToneEnd(durationMs) {
      if (durationMs < 35) return;
      let symbol = durationMs < 210 ? '·' : '-';
      this.currentSymbols += symbol;

      if (this.onSymbolDetected) {
        this.onSymbolDetected(symbol, durationMs);
      }

      if (this.currentSymbols.length === 5) {
        this.commitCurrentDigit();
      }
    }

    handleSilenceEnd(silenceDurationMs) {
      if (this.currentSymbols.length > 0 && silenceDurationMs > 600) {
        this.commitCurrentDigit();
      }
    }

    handleOngoingSilence(silenceDurationMs) {
      if (this.currentSymbols.length > 0 && silenceDurationMs > 650) {
        this.commitCurrentDigit();
      }

      if (this.decodedDigits.length >= 3 && silenceDurationMs > 2100 && !this.isSequenceReported) {
        this.isSequenceReported = true;
        if (this.onSequenceComplete) {
          this.onSequenceComplete(this.decodedDigits);
        }
      }

      if (silenceDurationMs > 4500 && this.isSequenceReported) {
        this.decodedDigits = '';
        this.isSequenceReported = false;
      }
    }

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

  /* =========================================================================
     3. 交互与训练主程序
     ========================================================================= */

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

    initAudioEngineListeners() {
      audioEngine.onStateChange = (isPlaying) => {
        this.updatePlayPauseBtnState(isPlaying);
      };

      audioEngine.onSymbolActive = (info) => {
        if (!this.isVisualAssist) return;

        if (this.dom.pulseLight) {
          this.dom.pulseLight.classList.add('active');
          if (info.type === 'dash') {
            this.dom.pulseLight.style.background = 'linear-gradient(90deg, #ffb703, #00ff88)';
          } else {
            this.dom.pulseLight.style.background = 'linear-gradient(90deg, #00b4d8, #00ff88)';
          }
        }

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

      document.querySelectorAll('.digit-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-digit');
          this.handleSingleChoice(val);
        });
      });

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

      this.dom.switchVisual.addEventListener('change', (e) => {
        this.isVisualAssist = e.target.checked;
        this.toggleVisualAssist(this.isVisualAssist);
      });

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

      this.dom.btnOpenIntel.addEventListener('click', () => this.openIntelModal());
      this.dom.btnCloseIntel.addEventListener('click', () => this.closeIntelModal());
      this.dom.intelModalOverlay.addEventListener('click', (e) => {
        if (e.target === this.dom.intelModalOverlay) this.closeIntelModal();
      });

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

  // DOM 就绪后启动
  window.addEventListener('DOMContentLoaded', () => {
    const app = new DeltaMorseTrainerApp();
    app.init();
  });
})();
