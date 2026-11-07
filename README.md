# AEROLAB · 三维载具建模与交互式风洞

AEROLAB 是一个本地运行的三维飞行器/载具建模与气动可视化工作台。后端使用 Java 25 + Spring Boot，前端使用原生 HTML / CSS / JavaScript 与 Three.js。界面左侧是工作台主菜单（仅含“建模”和“模拟”），右侧为可环绕、缩放的三维呈现区。

> 气动求解器是面向交互与工程可视化的简化势流 + 经验尾迹模型，并非高保真 CFD，不能用于结构强度、适航认证或真实气动设计定型。

## 功能

### 建模

- 通过立方体、椭球体、圆柱体、圆锥体组合飞行器或简单载具。
- 在三维场景中点击选中部件，使用变换手柄或属性面板编辑位置、旋转、尺寸、颜色和名称。
- 平移、旋转、缩放三种变换模式；支持删除、复制和常用快捷键。
- 驾驶舱相机支持：
  - 三维坐标、航向角、俯仰角编辑；
  - 点击模型表面直接拾取相机位置；
  - 在建模视口内预览驾驶舱视角；
  - 模拟阶段使用该相机位置与朝向进入驾驶舱视角。
- 模型自动保存在浏览器 `localStorage`，刷新页面不会丢失。
- 左侧栏和属性面板在窄屏下自动收敛，保留可用性。

### 模拟

- 水平来流条件：风速、来流方位角（0° 为机头正对来流）、空气密度。
- 模型表面以颜色显示压力系数分布，高正压与负压吸力区使用不同颜色。
- 模型外部以三维彩色流线、流场粒子呈现局部风速，并显示风洞边界。
- 三维剖面分析：
  - 可选 X / Y / Z 截面；
  - 可沿轴向连续移动截面；
  - 在“压力场 / 风速场”之间切换；
  - 彩色切片显示场分布，并用截面轮廓标出模型与切面的交线。
- 求解摘要：动压、压力阻力、压力升力、峰值风速、湿表面积与求解耗时。
- 使用建立模型时定义的驾驶舱相机进入第一人称视角，支持拖动环视和滚轮改变视野。
- 所有三维视图支持：
  - 鼠标左键拖拽环绕；
  - 滚轮缩放；
  - 鼠标右键平移。

## 环境要求

- JDK 25（本项目按 Java 25 编译）
- Maven 3.9+
- 现代浏览器，需支持 WebGL 与 ES Modules

前端 Three.js 已作为本地静态资源放在 `src/main/resources/static/vendor/three/`，运行时不需要 CDN 或 Node.js。

## 启动

```bash
mvn spring-boot:run
```

打开 <http://localhost:8080>。

构建可执行包：

```bash
mvn clean package
java -jar target/aerolab-windtunnel-1.0.0.jar
```

运行测试：

```bash
mvn test
```

## 使用流程

1. 在“建模”页添加或编辑几何基元，组合成飞行器。
2. 在右侧属性面板设置驾驶舱相机位置、航向和俯仰；也可以点击“表面拾取”，再点击模型表面完成对位。
3. 点击“进入模拟”。
4. 调整来流参数，点击右上角“重新求解”。
5. 在“场着色”中选择压力场或风速场。
6. 在“剖面分析”中启用截面，切换 X/Y/Z 截面并拖动位置滑块，观察压力或风速分布。
7. 点击“进入驾驶舱视角”使用建模阶段定义的相机进行第一人称观察。

### 建模快捷键

| 快捷键 | 功能 |
|---|---|
| `W` / `E` / `R` | 移动 / 旋转 / 缩放变换模式 |
| `Delete` / `Backspace` | 删除选中部件 |
| `Ctrl/Cmd + D` | 复制选中部件 |
| `Esc` | 取消拾取、退出驾驶舱预览或取消选择 |

## 架构

```text
src/main/java/com/aerolab
├── core
│   ├── geometry       Vec3 / AABB / 欧拉旋转 / 三角网格生成
│   ├── model          ShapeType / ModelPart / VehicleModel / 驾驶舱相机 / 校验
│   └── simulation     FlowConditions / WindFrame / FlowGrid / FlowField
│                      AerodynamicSimulator（接口）
│                      SimplifiedAerodynamicSimulator（实现）
├── web
│   ├── dto            REST 请求与响应模型
│   ├── SimulationMapper、ProblemDetail 错误处理
│   └── SimulationController
├── config             SimulationConfiguration（只在此装配 Spring Bean）
└── AerolabApplication
src/main/resources/static
├── css/app.css
├── js
│   ├── core           API 客户端、模型仓库、WebGL 视口、通用 UI
│   ├── modeling       建模编辑器和几何构建
│   ├── simulation     模拟控制器、流场采样、流线/粒子/剖面渲染
│   └── util           色标、图标、几何工具
├── vendor/three       本地 Three.js 及 addons
└── index.html
```

### 模块边界

- `com.aerolab.core.*` 不依赖 Spring、HTTP、Jackson 或任何前端框架。几何、模型、求解器可通过纯 Java 调用。
- REST 层只做 JSON DTO 转换、参数错误映射和 Base64 浮点场编码，不承载计算逻辑。
- 前端渲染层只消费统一的模拟结果：
  - 表面网格与压力/速度数组；
  - 三维结构化流场；
  - 求解摘要。
- 如果替换为 Swing/JavaFX 客户端，可直接调用 `AerodynamicSimulator.simulate(model, conditions)` 并自行绘制 `SimulationResult`，无需改动核心计算。
- 如果替换求解器，实现 `AerodynamicSimulator` 并在 `SimulationConfiguration` 中替换 Bean 即可；API 与前端不需要变化。

### 模拟数据流

```text
浏览器中的模型
    │  POST /api/simulations（模型 + 来流条件）
    ▼
SimulationController
    ▼
SimulationMapper → core.model.VehicleModel / FlowConditions
    ▼
SimplifiedAerodynamicSimulator
    ├─ MeshGenerator：生成部件三角网格与法线
    ├─ 表面压力系数与压力合力
    ├─ 风轴坐标系中的三维流场网格
    └─ 结构化流场：风速、Cp、三向速度
    ▼
SimulationMapper：JSON + Base64 float32-LE
    ▼
Three.js 渲染：压力着色、流线、流场粒子、剖面纹理
```

## 求解模型

1. 将惯性系转换到与来流方向对齐的风轴坐标系。
2. 将每个部件视为各向异性扰流体，在三维采样网格上叠加势流扰动。
3. 使用经验尾迹模型近似部件下游的速度亏损与压力恢复损失。
4. 由 Bernoulli 关系生成流场压力系数。
5. 按表面法线计算部件表面 Cp；积分表面压力得到阻力、升力与侧力。

流场为固定尺寸的 46 × 24 × 28 结构化网格，响应中包含 Base64 little-endian float32 数组；前端的剖面场与流线均从该统一流场采样得到。模型内部单元格使用 `NaN` 标记，渲染时自动挖空。

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
    "windSpeedMps": 38,
    "windFromAzimuthDeg": 0,
    "airDensity": 1.225
  }
}
```

响应包含：

- `surface.parts[]`：每个部件的三角形顶点坐标、法线、Cp、表面速度；
- `flow`：网格尺寸、原点与世界坐标轴步长、Base64 float32 数组、索引顺序；
- `summary`：动压、阻力、升力、侧力、Cp 范围与最大流场速度；
- `solver`、`computeTimeMs`、`warnings`。

## 测试

测试覆盖：

- 各几何基元的封闭体积与朝外绕序；
- 模型表面网格与流场数组一致性；
- 不同风速与侧风工况；
- REST API 正常请求与非法模型错误响应。

```bash
mvn test
```

## 第三方组件

- [Three.js](https://threejs.org/) r180，MIT License，许可文本见 `src/main/resources/static/vendor/three/LICENSE`。
- Spring Boot 3.5，Apache License 2.0。
