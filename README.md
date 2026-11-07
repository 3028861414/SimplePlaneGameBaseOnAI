# AEROLAB · 三维载具建模、风洞与虚拟驾驶

AEROLAB 是一个本地运行的三维飞行器/简单载具工作台。后端使用 Java 25 + Spring Boot，前端使用原生 HTML / CSS / JavaScript 与 Three.js。左侧主菜单包含 **建模 / 模拟 / 驾驶** 三个工作区，右侧为可环绕、缩放的三维呈现区。

> 气动求解器是面向交互与工程可视化的简化势流 + 经验尾迹模型；飞行模型是基于部件质量、重心、转动惯量、机翼升力和操纵面力臂的六自由度刚体动力学，二者都不是高保真 CFD / 飞行动力学模型，不能用于结构强度、适航认证或真实设计定型。

## 功能

### 建模与装配

- 通过立方体、椭球体、圆柱体、圆锥体组合飞行器或简单载具。
- 在三维场景中点击选中部件，使用变换手柄或属性面板编辑位置、旋转、尺寸、颜色和名称。
- 平移、旋转、缩放三种变换模式；支持删除、复制和常用快捷键。
- 驾驶舱相机定义：
  - 编辑三维坐标、航向角和俯仰角；
  - 点击模型表面直接拾取驾驶舱位置；
  - 在建模视口内预览驾驶舱视角；
  - 驾驶和风洞驾驶舱视图均使用该相机。
- 飞行操纵系统配置：
  - 引擎安装点与最大推力；
  - 水平舵（俯仰）安装点；
  - 垂直舵（偏航）安装点；
  - 机炮安装点（预留，仅作为布局与按键占位）；
  - 每个几何部件的质量与“升力面”标记；
  - 引擎、水平舵、垂直舵和机炮的设备质量；
  - 水平/垂直舵的舵面面积；
  - 结构质量、设备质量与当前总质量实时汇总；
  - 各系统的三维彩色控制点标记；
  - 13 项飞行操作的键盘按键绑定、捕获式改键和冲突提示。
- 所有质量、部件位置与操纵点位置共同参与实际飞行计算：程序计算重心与完整 3×3 转动惯量，引擎安装点产生推力力矩，水平舵和垂直舵按安装位置、面积与局部动压产生控制力矩；这些系统不是纯摆设。
- 建模页提供“一键恢复默认”按钮，可恢复默认飞机、质量/升力面、操纵布局和按键映射。
- 内置默认飞机 **AEROLAB X-01**，包含几何部件、驾驶舱、两台引擎、水平/垂直舵、机炮及完整键盘映射。
- 飞机 JSON 文件导入/导出，包含几何、驾驶舱、飞行操纵系统和按键映射。
- 模型自动保存在浏览器 `localStorage`，刷新页面不会丢失；旧版模型数据会自动迁移到 v3 结构，缺少质量的旧部件会由后端按体积分配备用总质量。

### 气动模拟

- 任意三维来流：
  - 直接输入空气流动方向的 X / Y / Z 向量，并单独设置风速大小；
  - 方向向量无需手动归一化，求解器会自动归一化；
  - 支持机头来流、尾部来流、左右舷来流、上方/下方来流和任意斜向复合来流；
  - 提供常用方向预设。
- 模型表面以颜色显示压力系数分布；表面压力颜色与外部流场分层呈现。
- 外部流场可视化：
  - 按局部风速着色的三维流线；
  - 软发光流场粒子；
  - 低透明度场雾点云，直观显示空间速度分布；
  - 风洞边界框、入口平面和来流方向箭头；
  - 可分别开关流线 / 粒子 / 场雾 / 边界图层。
- 三维剖面分析：
  - 可选 X / Y / Z 截面；
  - 沿轴向连续移动截面；
  - 在“压力场 / 风速场”之间切换；
  - 彩色切片显示场分布，并绘制等值带与模型/切面交线；
  - 剖切面自动裁剪到有效流场边界，不再显示透明黑边或矩形渲染边框。
- 求解摘要：动压、压力阻力、压力升力、最大风速、湿表面积和求解耗时。
- 使用建模阶段定义的驾驶舱相机进入风洞第一人称视角，支持拖动环视、滚轮改变视野。
- 所有三维视图支持鼠标左键拖拽环绕、滚轮缩放、右键平移。

### 虚拟驾驶

- 从“驾驶”导航项或建模页“试飞”按钮进入虚拟世界。
- 无限程序化柏林噪声世界：不设世界边界，按 512 m × 512 m 区块生成，每区块 65 × 65 高度采样。
- 地形由多层低频噪声混合生成，包含：
  - 平原：低起伏草地；
  - 丘陵：中频起伏与缓坡；
  - 山地：脊状噪声形成的高耸山脊和雪线；
  - 高原：独立高原掩码形成的平坦顶面与边缘陡坡。
- 固定种子、连续高度函数；相邻区块共享边缘采样，不会出现缝隙。
- 简单飞机跑道：1600 m 长、52 m 宽，包含中心线、边线、入口标线和跑道灯；地形在跑道及其过渡区域被压平。
- 区块流式加载 / 卸载：
  - 服务器根据飞机所在区块加载附近区块，离开后卸载并释放会话缓存；
  - 客户端只构建收到的区块网格与树木，离开范围后移除并释放几何体；
  - 右上角提供 2–6 区块的加载半径滑动条，默认 3，可随不同设备性能和视距需求调整；
  - 加载半径保存在浏览器本地偏好中，下次进入驾驶时继续使用。
- 右上角分层设色地形小地图：
  - 始终以玩家飞机为中心，北向朝上；
  - 按海拔分层着色，并叠加简单山体阴影、50 m 等高带和方位环；
  - 显示当前地形类型、已加载区块数量和地图覆盖范围。
- 跑道两侧程序化树木、天空渐变、太阳光晕、云层、雾和远景；天空、太阳与云层会跟随无限世界中的飞机。
- 驾驶视图显示选项（右上角“设置”）：
  - 空气粒子开关：显示飞机周围随相对气流运动的光线粒子；关闭后停止更新与绘制，适合低配设备；
  - 第一人称 HUD 开关：座舱视角下显示水平仪、空速、离地高度、航向与坡度；关闭后隐藏座舱 HUD 与底部仪表盘；
  - 天气与风开关：开启后显示降雨并启用阵风/湍流，风场直接参与空气动力计算；
  - 每台引擎独立推力百分比滑块，仪表盘同步显示各引擎百分比。
- 驾驶动力学：
  - 以部件质量、重心和全 3×3 转动惯量积分的六自由度刚体运动；
  - 每个升力面按局部迎角、面积和展弦比产生垂直于翼面的升力，升力面与尾翼位置产生俯仰/滚转力矩；
  - 引擎推力作用于安装点，发动机 Y/Z 偏置产生配平力矩；
  - 水平舵/垂直舵按安装位置、舵面面积和局部动压产生控制力矩；
  - 起落架采用弹簧-阻尼接触模型，支持滑跑、抬头、离地与着陆，而不是直接把高度锁在地面；
  - 空中不限制俯仰角或滚转角，允许大迎角、失速、侧翻和倒飞；只有数值积分安全上限；
  - 低速失速、硬着陆、机体触地等物理终止条件；
  - `R` 或界面按钮可重置到跑道起点。
- 第一人称 / 第三人称驾驶：
  - `C` 切换；
  - 第一人称使用建模阶段指定的驾驶舱位置和朝向；
  - 第三人称跟随视角；
  - 鼠标拖动环视，滚轮调节第三人称距离或第一人称视野。
- 飞行仪表盘：
  - 圆形空速表（节 / m/s）；
  - 人工地平仪（俯仰、侧倾姿态球和俯仰梯）；
  - 航向带与方位读数；
  - 高度、AGL、垂直速度；
  - 油门环、引擎推力、G 载荷、迎角、升力和当前质量；
  - 每台引擎的实时推力百分比；
  - 第一人称座舱 HUD（可开关）：人工地平线、空速、高度、航向与坡度；
  - 失速、地形接近和坠毁告警。
- 服务器端以 60 Hz 固定步长运行飞行物理，并以 60 Hz 通过 WebSocket 推送遥测；前端使用平滑渲染时钟、带延迟缓冲的位置/姿态插值、HUD 节流和空闲时段区块构建，降低网络抖动与地形加载造成的卡顿。
- 三个三维工作区右下角均提供实时 X/Y/Z 轴指示器，随当前相机姿态旋转，避免迷失轴向。

## 环境要求

- JDK 25（本项目按 Java 25 编译）
- Maven 3.9+
- 现代浏览器，需支持 WebGL、ES Modules 和 WebSocket

Three.js 已作为本地静态资源放在 `src/main/resources/static/vendor/three/`，运行时不依赖 CDN 或 Node.js。

## 构建与启动

开发模式：

```bash
mvn spring-boot:run
```

打开 <http://localhost:8080>。

构建并运行可执行 JAR：

```bash
mvn clean package
java -jar target/aerolab-windtunnel-1.0.0.jar
```

如需修改端口：

```bash
java -jar target/aerolab-windtunnel-1.0.0.jar --server.port=9090
```

运行测试：

```bash
mvn test
```

## 使用流程

### 建模与试飞

1. 在“建模”页添加或编辑几何基元，组合成飞行器。
2. 在右侧属性面板设置驾驶舱相机位置、航向和俯仰；可点击“表面拾取”后点击模型表面完成对位。
3. 切换到“飞行系统”标签，设置质量、引擎和舵面安装点，点击按键绑定按钮后按下新键完成改键。
4. 如需保存或复用，点击模型列表上方的导入/导出按钮，读写 `.aerolab.json` 文件。
5. 点击“风洞模拟”或“试飞”，也可直接使用左侧主菜单切换工作区。

### 风洞

1. 调整风速、空气密度。
2. 输入来流方向向量或点击方向预设；方向向量表示**空气流动方向**。
3. 点击右上角“重新求解”。
4. 在“场着色”中选择压力场或风速场。
5. 启用“剖面分析”，切换 X/Y/Z 截面并拖动位置滑块。
6. 可点击“进入驾驶舱视角”使用驾驶舱相机观察流场。

方向向量参考（载具局部坐标，+X 指向机头、+Y 向上、+Z 指向右舷）：

| 来流 | 空气流动方向向量 |
|---|---|
| 机头正面来流 | `(-1, 0, 0)` |
| 从尾部吹来 | `(1, 0, 0)` |
| 从右舷吹来 | `(0, 0, -1)` |
| 从左舷吹来 | `(0, 0, 1)` |
| 从顶部向下吹 | `(0, -1, 0)` |
| 斜向复合来流 | 例如 `(-0.7, -0.25, -0.65)` |

### 驾驶

1. 在“驾驶”页或建模页点击“试飞”进入跑道。
2. 按住油门增加键（默认 `W`）将油门推满，飞机开始滑跑。
3. 速度超过起飞速度后按住抬头键（默认 `↑`）离地。
4. 使用 `←` / `→` 偏航，使用 `A` / `D` 滚转；`Shift` 加力，`B` 刹车。转弯需要像真实飞机一样配合滚转与拉杆。
5. 按 `C` 在第一人称/第三人称之间切换；拖动鼠标环视，滚轮调节距离/视野。
6. 按 `R` 或点击“重新起飞”回到跑道起点；按 `Esc` 或点击“返回建模”退出驾驶。

## 默认键盘映射

### 建模

| 快捷键 | 功能 |
|---|---|
| `W` / `E` / `R` | 移动 / 旋转 / 缩放变换模式 |
| `Delete` / `Backspace` | 删除选中部件 |
| `Ctrl/Cmd + D` | 复制选中部件 |
| `Esc` | 取消拾取、退出驾驶舱预览或取消选择 |

### 飞行

| 动作 | 默认按键 |
|---|---|
| 油门增加 / 减少 | `W` / `S` |
| 抬头 / 低头 | `↑` / `↓` |
| 左偏航 / 右偏航 | `←` / `→` |
| 左滚转 / 右滚转 | `A` / `D` |
| 加力 | 左 `Shift` |
| 刹车 | `B` |
| 切换视角 | `C` |
| 重新起飞 | `R` |
| 机炮（预留） | `Space` |
| 退出驾驶 | `Esc` |

以上按键均可在建模页“飞行系统 → 按键映射”中修改，并随飞机 JSON 一起导入/导出。

## 飞机 JSON 文件

导出文件示例结构：

```json
{
  "format": "aerolab-aircraft",
  "version": 3,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "name": "AEROLAB X-01",
  "parts": [
    {
      "id": "fuselage",
      "name": "机身",
      "shape": "CYLINDER",
      "position": { "x": 0, "y": 0, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": -90 },
      "size": { "x": 1.05, "y": 4.8, "z": 1.05 },
      "massKg": 430,
      "liftingSurface": false,
      "color": "#c9d7df"
    }
  ],
  "cockpit": {
    "position": { "x": 1.22, "y": 0.72, "z": 0 },
    "yawDegrees": 0,
    "pitchDegrees": -4
  },
  "flightSystems": {
    "massKg": 1350,
    "engines": [
      {
        "id": "engine-left",
        "name": "左引擎",
        "position": { "x": 0.35, "y": -0.44, "z": -1.85 },
        "maxThrustN": 4200,
        "massKg": 165
      }
    ],
    "horizontalRudders": [
      {
        "id": "elevator-left",
        "name": "左水平舵",
        "position": { "x": -2.55, "y": 0.13, "z": -0.9 },
        "areaM2": 0.9,
        "massKg": 18
      }
    ],
    "verticalRudders": [
      {
        "id": "rudder",
        "name": "垂直舵",
        "position": { "x": -2.45, "y": 0.65, "z": 0 },
        "areaM2": 0.8,
        "massKg": 14
      }
    ],
    "guns": [
      {
        "id": "gun-left",
        "name": "左机炮",
        "position": { "x": 3.05, "y": 0, "z": -0.18 },
        "massKg": 25
      }
    ]
  },
  "bindings": {
    "throttleUp": "KeyW",
    "throttleDown": "KeyS",
    "pitchUp": "ArrowUp",
    "pitchDown": "ArrowDown",
    "yawLeft": "ArrowLeft",
    "yawRight": "ArrowRight",
    "rollLeft": "KeyA",
    "rollRight": "KeyD",
    "boost": "ShiftLeft",
    "brake": "KeyB",
    "toggleCamera": "KeyC",
    "resetFlight": "KeyR",
    "fireGuns": "Space"
  }
}
```

坐标约定：

- 载具局部 +X 指向机头，+Y 向上，+Z 指向右舷。
- 所有操纵点坐标单位为米。
- 按键代码使用浏览器 `KeyboardEvent.code`（如 `KeyW`、`ArrowUp`、`ShiftLeft`）。
- `massKg` 为部件质量；`liftingSurface` 表示该部件是否按升力面计算。
- 若导入文件缺少 `flightSystems`，会补全默认操纵系统；显式给出的空数组会被保留。
- `flightSystems.massKg` 是兼容旧文件的备用总质量：仅当所有部件质量均为 0 时启用。
- 导入文件如果没有几何部件会被拒绝。

## 架构

```text
src/main/java/com/aerolab
├── core
│   ├── geometry       Vec3 / AABB / Quat / 欧拉旋转 / 三角网格生成
│   ├── model          ShapeType / ModelPart / VehicleModel / 驾驶舱相机 / 校验
│   ├── simulation     FlowConditions / WindFrame / FlowGrid / FlowField
│   │                  AerodynamicSimulator（接口）
│   │                  SimplifiedAerodynamicSimulator（实现）
│   ├── world          PerlinNoise2D / TerrainWorld / TerrainChunk / TerrainBiome
│   │                  Runway / WorldConfig / WorldGenerator
│   └── flight         FlightSystems / FlightSystemsFactory / KeyBindings
│                      MassProperties / FlightDynamics / FlightState
├── web
│   ├── dto            REST 请求与响应模型
│   ├── SimulationMapper、ProblemDetail 错误处理
│   ├── SimulationController
│   └── flight         FlightStartRequest / FlightMapper / FlightStateDto
│                      FlightSessionManager / FlightWebSocketHandler
├── config             SimulationConfiguration / FlightWebSocketConfig
└── AerolabApplication
src/main/resources/static
├── css/app.css
├── js
│   ├── core           API 客户端、模型仓库与导入导出、WebGL 视口、通用 UI、坐标轴指示器
│   ├── modeling       建模编辑器、飞行操纵配置和几何构建
│   ├── simulation     模拟控制器、流场采样、流线/粒子/场雾/剖面渲染
│   ├── flight         飞行视图、WebSocket 客户端、HUD、小地图、地形样式、区块世界渲染
│   └── util           色标、图标、几何工具、二进制解码
├── vendor/three       本地 Three.js 及 addons
└── index.html
```

### 模块边界

- `com.aerolab.core.*` 不依赖 Spring、HTTP、Jackson 或任何前端框架。几何、模型、求解器、地形和飞行动力学均可用纯 Java 调用。
- REST 层只做 JSON DTO 转换、参数错误映射和 Base64 浮点场编码，不承载计算逻辑。
- WebSocket 层只负责会话生命周期、输入转发和遥测序列化；飞行物理位于 `core.flight.FlightDynamics`。
- 前端渲染层只消费统一的结果：
  - 风洞：表面网格、压力/速度数组、结构化流场、求解摘要；
  - 驾驶：区块高度数据、跑道数据、60 Hz 飞行状态、模型与操纵配置。
- 若替换为 Swing/JavaFX 客户端，可直接调用：
  - `AerodynamicSimulator.simulate(model, conditions)` 绘制风洞结果；
  - `FlightDynamics.setKey(...)` / `step(dt)` / `snapshot()` 驱动飞行；
  - `WorldGenerator.generate()` 获取同一无限地形、区块采样与跑道。
- 若替换求解器，实现 `AerodynamicSimulator` 并在 `SimulationConfiguration` 中替换 Bean 即可，REST API 与前端无需变化。

### 风洞数据流

```text
浏览器中的模型 + 三维来流向量
    │  POST /api/simulations
    ▼
SimulationController
    ▼
SimulationMapper → core.model.VehicleModel / FlowConditions
    ▼
SimplifiedAerodynamicSimulator
    ├─ WindFrame：将来流方向转换为风轴坐标系
    ├─ MeshGenerator：生成部件三角网格与法线
    ├─ 表面压力系数与压力合力
    ├─ 三维流场网格
    └─ 结构化流场：风速、Cp、三向速度
    ▼
SimulationMapper：JSON + Base64 float32-LE
    ▼
Three.js：压力着色、流线、发光粒子、场雾、来流箭头、剖面纹理
```

### 驾驶数据流

```text
浏览器键盘事件 + 第一/第三人称视图
    │  WebSocket /ws/flight
    │  start { model, flightSystems, bindings }
    ▼
FlightWebSocketHandler → FlightMapper → AircraftDefinition
    ▼
FlightSessionManager
    ├─ 共享 WorldGenerator 生成的高度函数/跑道
    ├─ 60 Hz FlightDynamics.step(dt)
    ├─ 根据飞机位置同步 512 m 区块（增删 + 半径限制）
    └─ 60 Hz 推送 FlightStateDto
    ▼
FlightWorldScene：区块地形、跑道、飞机状态插值与相机
FlightHud：飞行仪表、分层设色小地图、区块半径滑动条
```

## 风洞求解模型

1. 将来流方向归一化，并构建风轴坐标系（下游、上、侧向）。
2. 将每个部件视为各向异性扰流体，在三维采样网格上叠加势流扰动。
3. 使用经验尾迹模型近似部件下游的速度亏损与压力恢复损失。
4. 由 Bernoulli 关系生成流场压力系数。
5. 按表面法线计算部件表面 Cp；积分表面压力得到阻力、升力与侧力。

流场为固定尺寸的 46 × 24 × 28 结构化网格，响应中包含 Base64 little-endian float32 数组；前端的剖面场、流线、粒子和场雾均从该统一流场采样。模型内部单元格使用 `NaN` 标记，渲染时自动挖空。

## HTTP API

### `GET /api/health`

```json
{"status":"ok","solver":"potential-flow-v1"}
```

### `POST /api/simulations`

请求示例：

```json
{
  "model": {
    "name": "AEROLAB X-01",
    "parts": [
      {
        "id": "fuselage",
        "name": "机身",
        "shape": "CYLINDER",
        "position": {"x": 0, "y": 0, "z": 0},
        "rotation": {"x": 0, "y": 0, "z": -90},
        "size": {"x": 1.05, "y": 4.8, "z": 1.05},
        "color": "#c9d7df"
      }
    ],
    "cockpit": {
      "position": {"x": 1.22, "y": 0.72, "z": 0},
      "yawDegrees": 0,
      "pitchDegrees": -4
    }
  },
  "conditions": {
    "direction": {"x": -1, "y": 0, "z": 0},
    "windSpeedMps": 38,
    "airDensity": 1.225
  }
}
```

`direction` 是空气流动方向（会被归一化），长度不影响结果；机头正面来流使用 `(-1, 0, 0)`。

响应包含：

- `surface.parts[]`：每个部件的三角形顶点坐标、法线、Cp、表面速度；
- `flow`：网格尺寸、原点与世界坐标轴步长、Base64 float32 数组、索引顺序；
- `summary`：动压、阻力、升力、侧力、Cp 范围与最大流场速度；
- `solver`、`computeTimeMs`、`warnings`。

## 飞行 WebSocket API

端点：`/ws/flight`

### 启动会话

客户端连接后发送：

```json
{
  "type": "start",
  "model": {
    "name": "AEROLAB X-01",
    "parts": [
      {
        "id": "fuselage",
        "name": "机身",
        "shape": "CYLINDER",
        "position": {"x": 0, "y": 0, "z": 0},
        "rotation": {"x": 0, "y": 0, "z": -90},
        "size": {"x": 1.05, "y": 4.8, "z": 1.05},
        "color": "#c9d7df"
      }
    ],
    "cockpit": {
      "position": {"x": 1.22, "y": 0.72, "z": 0},
      "yawDegrees": 0,
      "pitchDegrees": -4
    }
  },
  "flightSystems": {
    "massKg": 1350,
    "engines": [],
    "horizontalRudders": [],
    "verticalRudders": [],
    "guns": []
  },
  "bindings": {
    "throttleUp": "KeyW"
  },
  "chunkRadius": 3
}
```

服务器返回 `ready`，其中 `world` 包含区块尺寸/采样分辨率、初始区块列表、跑道参数、初始位置和加载半径；`state` 为初始遥测。每个区块包含 `chunkX`、`chunkZ`、高度场 Base64、海拔范围和主导地形类型。

### 输入与重置

```json
{ "type": "key", "code": "KeyW", "pressed": true }
```

```json
{ "type": "reset" }
```

调整区块加载半径：

```json
{ "type": "chunkRadius", "value": 5 }
```

服务器会在边界变化或半径变化时推送区块增删消息：

```json
{
  "type": "chunks",
  "added": [
    {
      "chunkX": 2,
      "chunkZ": -1,
      "resolution": 65,
      "originX": 1024,
      "originZ": -512,
      "sizeX": 512,
      "sizeZ": 512,
      "minHeight": 33.2,
      "maxHeight": 71.8,
      "biome": "HILLS",
      "heights": "Base64 little-endian float32..."
    }
  ],
  "removed": ["-2,-3"],
  "chunkRadius": 5
}
```

按键代码为原始 `KeyboardEvent.code`，由服务器根据 `bindings` 解析为具体操纵通道。

### 引擎与天气控制

独立设置某台引擎的推力百分比（`value` 为 0–1）：

```json
{ "type": "engineThrottle", "engineId": "engine-left", "value": 0.72 }
```

开启或关闭天气与风：

```json
{ "type": "weather", "enabled": true }
```

### 遥测

服务器以 60 Hz 推送：

```json
{
  "type": "state",
  "state": {
    "timeSeconds": 12.5,
    "position": {"x": -410.2, "y": 51.3, "z": 0},
    "velocity": {"x": 42.0, "y": 4.2, "z": 0},
    "orientation": {"x": 0, "y": 0, "z": 0, "w": 1},
    "speedMps": 42.0,
    "verticalSpeedMps": 4.2,
    "altitudeMslM": 51.3,
    "altitudeAglM": 16.3,
    "headingDeg": 0,
    "pitchDeg": 5.7,
    "rollDeg": 0,
    "throttle": 0.8,
    "engineThrustN": 6720,
    "engines": [
      {"id": "engine-left", "name": "左引擎", "throttle": 0.8, "thrustN": 3360, "maxThrustN": 4200},
      {"id": "engine-right", "name": "右引擎", "throttle": 0.8, "thrustN": 3360, "maxThrustN": 4200}
    ],
    "weatherEnabled": false,
    "windVelocity": {"x": 0, "y": 0, "z": 0},
    "liftN": 12400,
    "dragN": 910,
    "angleOfAttackDeg": 5.7,
    "massKg": 1350,
    "centerOfMass": {"x": 0.12, "y": 0.1, "z": 0},
    "gLoad": 1.0,
    "onGround": false,
    "crashed": false,
    "stalled": false,
    "outsideWorld": false,
    "crashReason": null
  }
}
```

## 测试

当前测试覆盖：

- 各几何基元的封闭体积与朝外绕序；
- 模型表面网格与流场数组一致性；
- 任意方向来流、风速与空气密度工况；
- REST API 正常请求与非法模型错误响应；
- 柏林地形确定性、相邻区块边缘连续性与跑道压平区域；
- 平原、丘陵、山地、高原四类地形均会在无限世界中生成；
- 飞行器跑道起步、油门加速、抬头起飞、滚转操纵与短时抬头后的稳定性；
- 多引擎独立推力与遥测、天气风场开关及阵风衰减；
- 部件质量决定重心、完整转动惯量和旧模型的备用质量分配；
- 自定义按键绑定在核心动力学中的解析；
- 飞行重置回到跑道起点。

```bash
mvn test
```

## 第三方组件

- [Three.js](https://threejs.org/) r180，MIT License，许可文本见 `src/main/resources/static/vendor/three/LICENSE`。
- Spring Boot 3.5，Apache License 2.0。

## 说明

本项目为本地交互式工程可视化与可操纵演示，不替代高保真 CFD、飞行模拟器或适航分析工具。风洞颜色、压力值、推力、失速和碰撞行为均为交互展示用途的简化模型。
