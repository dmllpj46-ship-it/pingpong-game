/**
 * config.js — 所有可调参数的唯一来源。
 * 单位：长度 m，时间 s，角度 rad，速度 m/s。
 * 业务代码里出现裸数字（除 0/1/2/-1 这类结构常量）视为需要重构。
 */

export const CONFIG = {
  /** 调试层：坐标轴、轨迹线、落点标记、判定球线框、状态面板 */
  debug: false,

  physics: {
    /** 固定步长频率（Hz）。渲染帧用累加器追赶 */
    stepHz: 240,
    /** 单帧最多补多少步，超出丢弃（防切标签页回来炸掉） */
    maxStepsPerFrame: 8,
    /** 重力加速度 m/s² */
    gravity: -9.81,
    /** 空气阻力系数：a_drag = -dragK * |v| * v。真实值约 0.11，游戏取 1/3 手感更好 */
    dragK: 0.035,
    /** 马格努斯系数：a = magnusK * (ω × v)，经验值，靠手感调 */
    magnusK: 2.5e-3,
    /** 旋转衰减（每秒指数衰减系数） */
    spinDecay: 0.7,
    /** 球半径 m（40mm 球） */
    ballRadius: 0.02,
    /** 球质量 kg（2.7g），仅用于文档与成本估算 */
    ballMass: 0.0027,
    /** 球速上限 m/s */
    maxSpeed: 18,
    /** 单次预测模拟的最长时长 s */
    predictMaxTime: 2.0,
  },

  table: {
    length: 2.74,
    width: 1.525,
    /** 台面高度（球台顶面离地） */
    height: 0.76,
    thickness: 0.02,
    /** 球网高度（相对台面） */
    netHeight: 0.1525,
    /** 球网宽度（含两侧外伸） */
    netWidth: 1.83,
    /** 台面恢复系数 */
    restitution: 0.75,
    /** 台面摩擦（水平速度保留比例） */
    friction: 0.93,
    /** 白色边线宽度 */
    lineWidth: 0.02,
  },

  net: {
    /** 触网后 z 速度反弹比例 */
    restitution: 0.35,
    /** 触网后水平/垂直速度衰减 */
    dampX: 0.6,
    dampY: 0.4,
  },

  floor: {
    restitution: 0.55,
  },

  paddle: {
    /** 判定球半径（点一下就锁定来球，留很大余量） */
    hitRadius: 0.26,
    /** CPU 判定半径 */
    cpuHitRadius: 0.24,
    /**
     * 单击后的「锁定来球」时长（s）。要覆盖最坏情况：
     * 玩家在自己击球后立刻点、球往返一趟 + 对方发球延迟（合计可达 1.5–2 s）。
     */
    swingWindow: 3.2,
    /** 挥拍期间拍子横向咬住来球的跟随速率（1/s） */
    lockRate: 22,
    /** 拍面横向可动范围 */
    minX: -0.95,
    maxX: 0.95,
    /** 拍面高度自动跟随球，范围放宽到能接到任何落点 */
    minY: 0.45,
    maxY: 1.50,
    /** 拍面固定前后位置（台后 0.35 m），不再需要 W/S 进退 */
    fixedZ: 1.72,
    /** 横向精修幅度（A/D 叠加在鼠标值上） */
    lateralAssist: 0.25,
    /** 横向跟随平滑率（1/s），越大越跟手 */
    followRate: 55,
    /** 视觉拍面半径（放大一点，让 assist 看起来合理） */
    bladeRadius: 0.095,
  },

  camera: {
    fov: 65,
    near: 0.05,
    far: 300,
    /** 玩家眼位（站姿） */
    eye: [0, 1.52, 2.62],
    /** 注视点 */
    lookAt: [0, 0.9, -0.7],
    /** 击球前倾幅度（m），0 = 关闭 sway */
    swayAmount: 0.02,
  },

  /** 击球解算参数 */
  shot: {
    /** 飞行时间：power=0 → minT，power=1 → maxT */
    minTime: 0.70,
    maxTime: 0.42,
    /** 距离对飞行时间的放大系数 */
    distFactor: 0.06,
    /** 飞行时间夹取范围 */
    timeClamp: [0.34, 0.95],
    /** 落点横向范围 */
    targetHalfW: 0.70,
    /** 落点深度：power=0 → nearZ，power=1 → farZ（对方半场） */
    nearZ: 0.70,
    farZ: 1.30,
    /** 单击击球使用的固定力度（不再需要蓄力） */
    clickPower: 0.55,
    /** 拍面横移带来的落点偏移系数 */
    paddleToTarget: 0.85,
    /** 甩拍带角度：鼠标横速 × 该系数 */
    aimNudgeK: 0.05,
    aimNudgeMax: 0.18,
    /** 侧旋强度：拍面横速 × 该系数（rad/s） */
    sideSpinK: 14,
    /** 上旋强度（rad/s），固定给一点，让弧线更沉 */
    topSpin: 45,
  },

  ai: {
    /** 预判刷新频率 Hz */
    predictHz: 20,
    /** 每档难度参数 */
    levels: {
      easy: { reactionDelay: 0.32, maxSpeed: 2.2, aimError: 0.18, missChance: 0.06, targetHalfW: 0.35, targetZ: [0.55, 0.95] },
      normal: { reactionDelay: 0.22, maxSpeed: 3.2, aimError: 0.09, missChance: 0.02, targetHalfW: 0.55, targetZ: [0.60, 1.15] },
      hard: { reactionDelay: 0.14, maxSpeed: 4.2, aimError: 0.035, missChance: 0.0, targetHalfW: 0.66, targetZ: [0.60, 1.28] },
    },
    defaultLevel: 'normal',
    /** CPU 拍面固定 z */
    paddleZ: -1.75,
    /** CPU 击球判定的 z 窗口 */
    hitWindowZ: [-1.95, -1.45],
  },

  rules: {
    /** 每局目标分 */
    targetScore: 11,
    /** 净胜分 */
    winBy: 2,
    /** 每 N 分换发球 */
    serveSwitch: 2,
    /** 10:10 之后每 N 分换发球 */
    serveSwitchDeuce: 1,
    /** 得一分后的停顿（s） */
    pointPause: 1.4,
    /** 换发球前的准备时间（s） */
    serveDelay: 0.9,
  },

  /** 发球：球起始位置（己方台后上方） */
  serve: {
    startY: 1.22,
    startZ: 1.62,
    /** 目标落点（己方半场） */
    ownTargetZ: 0.60,
    /** 候选速度搜索范围（vy 允许下压平击，才有足够的过网后前冲） */
    vyRange: [-2.6, 3.2],
    vyStep: 0.2,
    vzRange: [-2.2, -6.0],
    vzStep: 0.25,
    /** 最小过网余量（m，已扣球半径） */
    minClearance: 0.035,
    /** 第二落点必须出台至少这么远，否则对手拍位（台后 0.4 m）够不到球 */
    minSecondBounceBeyond: 0.12,
  },

  audio: {
    enabled: true,
    /** 主音量 */
    volume: 0.5,
  },

  render: {
    /** 设备像素比上限 */
    maxPixelRatio: 2,
    /** 阴影贴图尺寸 */
    shadowMapSize: 1024,
  },
};

/** 难度顺序，用于 UI 切换 */
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABEL = { easy: '简单', normal: '普通', hard: '困难' };
