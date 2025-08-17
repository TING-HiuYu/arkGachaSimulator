# 明日方舟抽卡模拟器

基于概率统计的抽卡模拟分析工具，支持多线程计算和GPU加速，提供详细的统计数据和可视化图表。

## 
- **网页url**: <https://arkgachasimulate.hyc.icu>

## 功能特性

- **高性能计算**: 支持多线程Worker并行计算，可选GPU加速
- **详细统计**: 提供均值、中位数、标准差等统计指标
- **数据可视化**: 包含分布直方图、累计概率曲线、干员统计图表
- **灵活配置**: 支持自定义干员权重、保底设置、模拟次数
- **响应式设计**: 适配桌面和移动端设备

## 技术栈

- **前端框架**: React 18 + TypeScript
- **UI组件**: Ant Design
- **图表库**: Ant Design Charts
- **构建工具**: Vite
- **并行计算**: Web Workers
- **GPU加速**: WebGPU

## 快速开始

### 环境要求

- Node.js >= 16
- 支持现代JavaScript特性的浏览器
- （可选）支持WebGPU的浏览器以启用GPU加速

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

### 代码检查

```bash
npm run lint
```

## 项目结构

```
src/
├── components/          # React组件
│   ├── ConfigPanel.tsx  # 配置面板
│   ├── FrequencyDistribution.tsx  # 图表展示
│   ├── SimulationResults.tsx      # 结果展示
│   └── StatisticsDisplay.tsx      # 统计数据
├── utils/              # 工具模块
│   ├── gacha.ts        # 抽卡算法
│   ├── gpuManager.ts   # GPU计算管理
│   └── workerManager.ts # Worker管理
├── types/              # 类型定义
├── assets/             # 静态资源
└── App.tsx             # 主应用
```

## 使用说明

1. **配置参数**: 在左侧面板设置模拟次数、已累计保底、目标干员等参数
2. **选择计算方式**: 可选择多线程CPU计算或GPU加速计算
3. **开始模拟**: 点击"开始模拟"按钮执行计算
4. **查看结果**: 右侧展示统计数据、分布图表和干员获取统计

## 性能说明

- **多线程模式**: 利用CPU多核心并行计算，适合大规模模拟
- **GPU加速**: 使用WebGPU进行矩阵运算，显著提升计算速度
- **内存优化**: 采用桶存储和流式处理，避免大数组内存占用

## 浏览器兼容性

| 功能 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|---------|------|
| 基础功能 | ✅ | ✅ | ✅ | ✅ |
| Web Workers | ✅ | ✅ | ✅ | ✅ |
| WebGPU加速 | ✅ | 🚧 | 🚧 | ✅ |

注：WebGPU仍在部分浏览器中实验阶段

## 开发说明

### 添加新的干员配置

在`src/components/ConfigPanel.tsx`的预设配置中添加新的模板：

```typescript
const presetConfigs = {
  "新活动": {
    "干员A": { weight: 0.5, target: 1 },
    "干员B": { weight: 0.3, target: 1 },
    // ...
  }
};
```

### 扩展统计功能

在`src/utils/workerManager.ts`中的统计计算函数中添加新的指标计算。

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request来改进项目。
