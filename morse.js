/**
 * morse.js - 三角洲行动 摩斯电码编解码与规则数据
 */

export const MORSE_DIGITS = {
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

/**
 * 快速根据点和划转数字
 */
export const CODE_TO_DIGIT = Object.entries(MORSE_DIGITS).reduce((acc, [digit, item]) => {
  acc[item.code] = digit;
  return acc;
}, {});

/**
 * 三角洲密码记忆口诀与技巧
 */
export const MORSE_RULES_TIPS = [
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

/**
 * 三角洲全地图密码房官方真实情报手册
 */
export const DELTA_MAP_INTEL = [
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

/**
 * 随机生成指定位数的数字密码字符串
 * @param {number} length 密码长度，默认3位
 * @returns {string} 例如 "382"
 */
export function generateRandomCode(length = 3) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

/**
 * 将一串数字转换为音频符号序列
 * 格式：
 * [
 *   { type: 'dot'|'dash', durationUnits: 1|3, charIndex: 0, symbolIndex: 0, digit: '3' },
 *   { type: 'symbol-space', durationUnits: 1 },
 *   ...
 *   { type: 'char-space', durationUnits: 3 },
 *   ...
 *   { type: 'loop-space', durationUnits: 7 }
 * ]
 */
export function codeToTimingEvents(codeString) {
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

      // 符号间微停顿（除了该数字最后一个符号）
      if (symIdx < symbols.length - 1) {
        events.push({
          type: 'symbol-space',
          durationUnits: 1,
          charIndex: charIdx
        });
      }
    });

    // 字符间停顿（数字与数字之间的清晰停顿，约 0.6s）
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

/**
 * 将一串数字转换为电脑屏幕显示的视觉符号组及速算解析
 */
export function getMorseVisualGroups(digitsStr) {
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

/**
 * 每日密码全图预设数据结构与各大地图机制信息 (含航天基地 A1-B1-B2-C1)
 */
export const DAILY_PASSWORDS_CONFIG = [
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

