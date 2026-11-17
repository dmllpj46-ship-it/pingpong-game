# AGENTS.md — 工程约定

给在本仓库里干活的 AI agent（以及未来的我）看的操作手册。
**动手前先读这一页，再读 `plan.md`。** 冲突时以 `plan.md` 的决策记录为准，本文件只管「怎么干」，不管「干什么」。

---

## 1. 项目定位

纯前端 3D 乒乓球游戏。**零构建、零框架、零后端**，依赖只有 three.js（import map 走 CDN）。

技术栈由 Jev 判定（`plan.md` §2），其中两条是硬约束：

- **不引入物理引擎**（cannon-es / rapier 都被 Jev 压到 ≤0.07）。物理是自研的，就在 `src/physics.js`。
- **不引入打包器**（v1 不做）。代码全部写成裸标识符 import，浏览器靠 `index.html` 的 import map 解析，这样将来要上 Vite 也不用改源码。

---

## 2. 必读顺序

| 顺序 | 文件 | 你要从中拿到什么 |
|---|---|---|
| 1 | `AGENTS.md` | 工程约定、禁区、完成标准（本文件） |
| 2 | `plan.md` | 世界坐标、物理公式、输入映射、AI 参数、里程碑、验收清单 |
| 3 | `README.md` | 怎么跑、怎么操作、调参入口在哪 |
| 4 | `src/config.js` | 所有可调数字的真实取值 |

---

## 3. 硬性不变量（违反即 bug）

### 3.1 单位与坐标

- 长度 **米**，时间 **秒**，角度用**弧度**。不要在代码里出现 cm 或 px 参与物理计算。
- **Y 向上**，球台长轴沿 **Z**，玩家在 **+Z** 端，对手在 **-Z** 端。
- 台面 `y = 0.76`，球网 `z = 0`，球半径 `0.02`。任何平面碰撞判定都要减/加球半径，否则球会「陷进台面」。

### 3.2 物理循环

- **固定步长 240 Hz**（`1/240`），用累加器追赶渲染帧；单帧最多补 **8** 步，超出直接丢弃。
- 主循环里**禁止分配对象**：不 `new THREE.Vector3()`、不 `.map()`、不 `.filter()`、不建临时数组、不拼字符串。所有向量用模块级预分配的 `_v1/_v2/_q1` 之类。（装饰性的观众/花束只在初始化时创建，见 `arena.js`，不违反此条）
- 碰撞一律**线段连续检测**（上一位置 → 当前位置），不要「先移动再纠正穿透」。

### 3.3 击球速度

- 击球速度**必须**用 `plan.md` §4.3 的反解公式（由落点和飞行时间解初速度），**不要**用「反射 + 随手加个系数」凑。可预测性来自反解，手感来自参数。
- 击球后不要手动改 `v.y` 去「修正弧线」，让重力自己拉。

### 3.4 参数集中

- 任何可调数字（速度、系数、时长、颜色强度、AI 阈值）**只能**写在 `src/config.js`。
- 业务代码里出现裸数字字面量（除 `0` / `1` / `2` / `-1` 这类结构性常量）视为需要重构。
- 新增参数必须加注释说明单位和影响。

### 3.5 规则

- 只允许在球**于己方半台弹起一次之后**回击；未弹起就碰到时**不做判罚**，球直接穿过拍面
  （实现偏离见 `plan.md` §12 #4，不要「顺手补上」截击判罚）。
- 计分逻辑只在 `rules.js`。其他模块**不准**改 `score` 或 `server`，只能发事件。

### 3.6 当前实现的输入与发球（别按旧方案改回去）

- **玩家只控左右 + 单击**：鼠标 X → 拍面横向，`A/D` → 横向精修；
  **单击发球、单击挥拍**（`requestSwing()` 开启 3.2 s 锁定窗口），没有蓄力、没有自动接球。
  单击后拍子会按 `predictAtZ()` 自动横向咬住来球；这是「点一下就能接」的核心，别删。
  觉得太容易先调 `hitRadius` 或 `swingWindow`，不要恢复蓄力条或去掉锁定（见 `plan.md` §14/§15）。
  拍面高度由 `predictAtZ()` 自动跟球，前后固定在 `paddle.fixedZ = 1.72`。
  **不要再引入鼠标 Y / W/S 控制**（用户实测反馈三轴太难，见 `plan.md` §13）。
- 相机 `(0, 1.52, 2.62)` 看向 `(0, 0.90, -0.70)`；拍面判定半径 0.26 m，CPU 0.24 m。
  改小判定半径前先看 `plan.md` §13 的实测基线：0.20 时只动鼠标 X 可连续多拍。
- 发球速度不是手算的，是 `physics.searchServeVelocity()` 网格搜索出来的：
  要求过网余量 + 第二落点出台。调整发球相关参数后**必须实测 CPU 能否回击**
  （`window.__pingpong.launchServe()` 后看 `rules.hitter` 是否变成 `cpu`）。
- `predictAtZ()` 是接球辅助的核心，玩家和 CPU 都依赖它。改它之前先想清楚：
  高度自动对齐一旦失效，两边都会回到「接不到球」的状态。

---

## 4. 文件职责边界

| 文件 | 管什么 | **不准**管什么 |
|---|---|---|
| `main.js` | 启动、`requestAnimationFrame`、resize、暂停/重开编排 | 不写物理、不写规则 |
| `scene.js` | 场景图、灯光、材质、球台/球网/球/拍的 mesh，以及 CPU 机器人模型 | 不改球的位置（由 physics 写） |
| `arena.js` | 看台、观众、鲜花（纯装饰，用 InstancedMesh） | 不参与碰撞；别在这里改物理或球的状态 |
| `sky.js` | 星空穹顶与闪烁星点（ShaderMaterial / Points） | 不参与碰撞；`main.js` 每帧调 `world.sky.update(dt)` |
| `physics.js` | 积分、碰撞、弹道解算、落点预测（纯计算，无 three 场景对象） | 不读输入、不改分数 |
| `player.js` | 输入 → 拍面姿态、命中判定、调 physics 击球 | 不自己算球的运动 |
| `ai.js` | 预判、移动、选落点 | 不直接改球速（走 physics 同一套击球接口） |
| `rules.js` | 状态机、比分、发球轮换、失误判定 | 不碰渲染 |
| `hud.js` | DOM 层比分/挥拍窗口条/提示 | 不用 canvas 画字 |
| `audio.js` | WebAudio 合成音 | 不加载外部音频文件 |

`physics.js` 是纯函数式的计算层：**输入状态 → 输出状态**，不持有 three.js 场景引用。这样它才能被 AI 拿去做「空跑预测」（`plan.md` §6.1）。

---

## 5. 代码风格

- ES modules，`const`/`let`，不用 `var`；不用 class 继承树，模块 + 普通对象即可。
- 2 空格缩进，语句结尾带分号。
- 导出的函数写 JSDoc（参数单位要标）：`@param {number} speed - 米/秒`。
- 命名：物理量带单位后缀（`vMps`、`tSec`、`distM`）或至少在注释里标；避免 `data`、`temp`、`obj` 这类名字。
- 不用 `console.log` 留在主路径；调试输出走 `config.debug` 开关。
- 不写 `// TODO` 之后就交差——要么做完，要么在 `plan.md` 风险表里登记。

---

## 6. 怎么跑 / 怎么验

### 6.1 运行

```bash
python -m http.server 8080     # 然后开 http://localhost:8080
```

**不要**用 `file://` 直接打开（ES module 会被 CORS 拦），也不要为此改成把代码内联进 HTML。

### 6.2 每次改完必须自查

| 检查项 | 方法 |
|---|---|
| 无控制台报错 | 打开 devtools 看 Console 干净 |
| 无 per-frame 分配 | Performance 录制 10 s，看 GC 是否周期性锯齿；或用 devtools 的 Allocation instrumentation |
| 帧率 | 1080p 下稳定 60 fps，`renderer.info.render.calls` < 60 |
| 球不穿台 | 用 `config.debug = true` 打开轨迹线，打 20 个高速球观察 |
| 规则不误判 | 打完一局 11 分，比分与发球方都正确 |

### 6.3 调试开关（`config.debug`）

打开后应提供：坐标轴 helper、球的轨迹线、预测落点标记、拍面判定球线框、当前 `dt`/`steps` 面板。这些是**功能**，不是临时代码，别删。

---

## 7. 完成标准（Definition of Done）

一个改动算「完成」，必须同时满足：

1. 行为符合 `plan.md` 对应章节（数字对得上，不是「差不多」）。
2. 新参数进了 `src/config.js` 并带单位注释。
3. 主循环无新增分配，帧率不掉。
4. 影响操作的改动（手感、判定、AI）**必须**附一句主观验证结论：「跟手」「能救短球」这类，不能只说「已实现」。
5. `plan.md` 的验收清单里相关条目能打勾。

---

## 8. 禁区

- ❌ 不要把 three.js 拷进仓库当 vendor（除非用户明确要求离线包）。
- ✅ three.js r169 已内置在 `vendor/three.module.js`，`index.html` 用 import map 指向本地。
  源码必须继续用裸标识符 `import * as THREE from 'three'`，这样换 CDN 或上 Vite 都只改一行。
  升级 three 时**替换整个文件**并同步更新 README 里的版本号，不要改 import 写法。
- ❌ 不要为了「更专业」加 TypeScript / React / Vite / 物理引擎 / 状态管理库。要加先问。
- ❌ 不要引入新的二进制资源；纹理用 `CanvasTexture` 程序生成，音效用 WebAudio 合成。
  （`vendor/three.module.js` 是唯一例外，已内置，别删）
- ❌ 不要改 `plan.md` §2 的决策表。要改决策，新增一行「YYYY-MM-DD 推翻了 X，理由是 Y」。
- ❌ 不要 `git commit --amend` 或 `push --force`。
- ❌ 不要把 `.workbuddy-ai/` 加进 `.gitignore` 之外的处理（它是项目数据目录，别删）。

---

## 9. 用 Jev 做决策（可选，但推荐）

遇到「A 还是 B」这类设计岔路，别拍脑袋，也别问用户十个问题——**用 `jev-classify` 让 Jev 判一次**，把概率记进 `plan.md` §2。

```python
import sys
sys.path.insert(0, r"C:\Users\WaterZhong\.agents\skills\jev-classify\scripts")
import jev

ns = type("N", (), {"key": None, "base_url": None, "model": None})()
key, base_url, model = jev.load_config(ns)
client = jev.Jev(key, base_url, model)

resp = client.post({
    "model": model,
    "state": {"project": "...", "constraints": ["..."]},
    "questions": {
        "q": {"type": "choice",
              "instructions": "Which option fits better?",
              "criteria": {"a": "描述 A", "b": "描述 B"}},
    },
})
```

三条实测要点（踩过）：

| 类型 | `criteria` 形状 | 返回 |
|---|---|---|
| `noul` | **对象**（可省略；传字符串会 422） | 仅 `noul` 概率，无 `confidence` |
| `choice` | **对象**：选项名 → 描述 | `choice` + `probabilities` + `confidence` |
| `score` | **有序列表**，每级一句情境描述 | `score` + `legend` + `probabilities` + `confidence` |

- 置信度 < 0.6 的判定按**建议**处理，不按命令处理；低于 0.5 时优先按工程常识复核。
- 密钥自动发现（`~/.workbuddy/.secrets/jev.env`），无需 export。
- 成本极低（$0.042/Mtok，仅计输入），但别在循环里调用。

---

## 10. 提交约定

- 一个里程碑一个 commit，消息用 `<M编号>: <做了什么>`，例如 `M2: 台面与球网碰撞 + 落点预测调试层`。
- 手感/参数调整单独 commit，消息里写清改了什么数、为什么（例：`tune: 台面恢复系数 0.72→0.75，球显得更弹`）。
- 文档（`plan.md`/`README.md`/本文件）改动与代码分开提交。
