import { SimulationWorkerManager, type SimulationStatistics } from './workerManager';

/**
 * 明日方舟抽卡模拟器 - TypeScript版本
 */

interface OperatorConfig {
  [key: string]: {
    weight: number;
    target: number;
  };
}

interface SimulationDetail {
  round: number;
  draws: number;
  operator: string;
  totalDraws: number;
}

interface SimulationResult {
  total: number;
  statistic: { [key: string]: number };
  details: SimulationDetail[];
}

interface Statistics {
  mean: number;
  median: number;
  std: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  totalDraws: number; // 总抽数
  totalSimulations: number; // 总模拟次数
  sigma1: { min: number; max: number };
  sigma2: { min: number; max: number };
  sigma3: { min: number; max: number };
}

interface FrequencyDistributionItem {
  draws: number;
  percentage: number;
  count: number;
}

interface SigmaRange {
  range: number[];
  count: number;
  percentage: string;
}

interface SigmaAnalysis {
  sigma1: SigmaRange;
  sigma2: SigmaRange;
  sigma3: SigmaRange;
}

interface MultipleSimulationResult {
  totalDraws: number[];
  characterCounts: { [key: string]: number[] };
  allDetails: SimulationDetail[][];
}

/**
 * 单次抽卡模拟 - 保底机制
 * @param basePity - 已累计未出6星的抽数
 * @returns 抽到6星所需的抽数
 */
export function gatcha(basePity: number = 0): number {
  let xunfang = basePity; // 从已累计的保底开始
  let currentProb = basePity < 50 ? 2 : 2 + (basePity - 50) * 2; // 根据保底计算初始概率

  while (xunfang < 50) {
    const chuhuo = Math.floor(Math.random() * 100) + 1;
    xunfang += 1;
    if (chuhuo <= currentProb) {
      return xunfang - basePity; // 返回本次消耗的抽数
    }
  }

  while (true) {
    currentProb += 2;
    const chuhuo = Math.floor(Math.random() * 100) + 1;
    if (chuhuo <= currentProb) {
      return xunfang - basePity; // 返回本次消耗的抽数
    }
    xunfang += 1;
  }
}

/**
 * 权重随机选择
 * @param items - 物品数组
 * @param weights - 权重数组
 * @returns 选中的物品
 */
function weightedChoice<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }

  return items[items.length - 1];
}

/**
 * 抽卡统计函数
 * @param operatorConfig - 干员配置
 * @param basePity - 已累计未出6星的抽数
 * @returns 模拟结果
 */
export function chouShuTongJi(operatorConfig?: OperatorConfig, basePity: number = 0): SimulationResult {
  // 默认配置
  if (!operatorConfig) {
    operatorConfig = {
      "海猫": { weight: 1, target: 99 },
    };
  }

  const operators = Object.keys(operatorConfig);
  const weights = operators.map(op => operatorConfig![op].weight);

  let total = 0;
  let currentPity = basePity; // 当前保底
  const statistic: { [key: string]: number } = {};
  // 不再保存详细信息以节省内存
  // const details: SimulationDetail[] = []; // 记录详细过程

  // 初始化统计
  operators.forEach(op => {
    statistic[op] = 0;
  });

  // 检查退出条件
  const checkCompletion = (): boolean => {
    return operators.every(op =>
      operatorConfig![op].target === 0 || statistic[op] >= operatorConfig![op].target
    );
  };

  while (!checkCompletion()) {
    const drawsThisRound = gatcha(currentPity);
    total += drawsThisRound;
    currentPity = 0; // 重置保底

    const selectedOperator = weightedChoice(operators, weights);
    statistic[selectedOperator] += 1;

    // 不再保存详细信息以节省内存
    // details.push({
    //   round: details.length + 1,
    //   draws: drawsThisRound,
    //   operator: selectedOperator,
    //   totalDraws: total
    // });
  }

  return {
    total,
    statistic,
    // 不再返回details数组以节省内存
    details: []
  };
}

/**
 * 运行多次模拟
 * @param n - 模拟次数
 * @param operatorConfig - 干员配置
 * @param basePity - 已累计未出6星的抽数
 * @param progressCallback - 进度回调函数
 * @returns Promise<模拟结果>
 */
export async function runSimulationMultipleTimes(
  n: number = 1000,
  operatorConfig?: OperatorConfig,
  basePity: number = 0,
  progressCallback?: (progress: number) => void
): Promise<MultipleSimulationResult> {
  const totalDraws: number[] = [];
  const characterCounts: { [key: string]: number[] } = {};
  const allDetails: SimulationDetail[][] = [];

  // 初始化角色统计
  Object.keys(operatorConfig || {}).forEach(char => {
    characterCounts[char] = [];
  });

  // 进度跟踪
  let lastReportedProgress = 0;

  for (let i = 0; i < n; i++) {
    const result = chouShuTongJi(operatorConfig, basePity);
    totalDraws.push(result.total);
    allDetails.push(result.details);

    // 收集角色统计
    Object.keys(result.statistic).forEach(char => {
      if (!characterCounts[char]) {
        characterCounts[char] = [];
      }
      characterCounts[char].push(result.statistic[char]);
    });

    // 进度回调 - 改进逻辑
    if (progressCallback) {
      const currentProgress = Math.floor((i + 1) / n * 100);
      // 只有当进度变化时才更新，避免频繁回调
      if (currentProgress > lastReportedProgress || i === n - 1) {
        lastReportedProgress = currentProgress;
        // 使用 requestAnimationFrame 或 setTimeout 异步更新进度
        progressCallback(currentProgress);
        await new Promise(resolve => {
          setTimeout(resolve, 0);
        });
      }
    }

    // 每500次让出线程，提高响应性
    if (i % 500 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  // 确保最终进度为100%
  if (progressCallback) {
    progressCallback(100);
  }

  return { totalDraws, characterCounts, allDetails };
}

// Worker 管理器实例 (单例)
let workerManager: SimulationWorkerManager | null = null;

/**
 * 获取 Worker 管理器实例
 */
function getWorkerManager(): SimulationWorkerManager {
  if (!workerManager) {
    workerManager = new SimulationWorkerManager();
  }
  return workerManager;
}

/**
 * 设置GPU加速选项
 */
export function setGPUAcceleration(enabled: boolean): void {
  const manager = getWorkerManager();
  manager.setGPUEnabled(enabled);
}

/**
 * 获取GPU可用性
 */
export function getGPUAvailability(): { available: boolean; enabled: boolean } {
  const manager = getWorkerManager();
  return manager.getGPUAvailability();
}

/**
 * 监听GPU状态变化
 */
export function onGPUStatusChange(callback: (status: { available: boolean; enabled: boolean }) => void): () => void {
  const manager = getWorkerManager();
  return manager.onGPUStatusChange(callback);
}

/**
 * 将统计结果转换为兼容的旧格式
 */
function convertStatisticsToLegacyFormat(simulationStatistics: SimulationStatistics): MultipleSimulationResult {
  // 从桶数据重建 totalDraws 数组
  const totalDraws: number[] = [];
  Object.entries(simulationStatistics.drawsBucket).forEach(([draws, count]) => {
    const drawsNum = parseInt(draws);
    for (let i = 0; i < count; i++) {
      totalDraws.push(drawsNum);
    }
  });

  // 重建 characterCounts 格式 (每个角色一个数组)
  const characterCounts: { [key: string]: number[] } = {};
  Object.keys(simulationStatistics.characterStats).forEach(char => {
    characterCounts[char] = Array(simulationStatistics.totalSimulations).fill(0);
    // 注意：这里需要根据实际的角色获得数据来填充，暂时使用总数平均分布
    const totalCount = simulationStatistics.characterStats[char].count;
    const avgPerSim = totalCount / simulationStatistics.totalSimulations;
    for (let i = 0; i < simulationStatistics.totalSimulations; i++) {
      characterCounts[char][i] = Math.round(avgPerSim);
    }
  });

  // allDetails 暂时为空数组（因为我们没有保存详细数据）
  const allDetails: SimulationDetail[][] = Array(simulationStatistics.totalSimulations).fill([]);

  return {
    totalDraws,
    characterCounts,
    allDetails
  };
}

/**
 * 运行多线程模拟 (使用 Web Workers)
 * @param n - 模拟次数
 * @param operatorConfig - 干员配置
 * @param basePity - 已累计未出6星的抽数
 * @param progressCallback - 进度回调函数
 * @returns Promise<模拟结果>
 */
export async function runSimulationMultipleTimesWithWorkers(
  n: number = 1000,
  operatorConfig?: OperatorConfig,
  basePity: number = 0,
  progressCallback?: (progress: number) => void
): Promise<MultipleSimulationResult> {
  const manager = getWorkerManager();

  // 使用默认配置
  const config = operatorConfig || {
    "海猫": { weight: 1, target: 99 },
    "其它": { weight: 1, target: 0 }
  };

  try {
    const simulationStatistics = await manager.runSimulation(n, config, basePity, progressCallback);

    // 将统计结果转换为兼容的旧格式
    const compatibleResult: MultipleSimulationResult = convertStatisticsToLegacyFormat(simulationStatistics);

    return compatibleResult;
  } catch (error) {
    console.error('[Gacha] 多线程模拟执行失败，回退到单线程模式:', error);
    // 回退到单线程模式
    return runSimulationMultipleTimes(n, config, basePity, progressCallback);
  }
}

/**
 * 使用多线程进行多次模拟 - 返回完整统计数据
 * @param n - 模拟次数
 * @param operatorConfig - 干员配置
 * @param basePity - 已累计未出6星的抽数
 * @param progressCallback - 进度回调函数
 * @returns Promise<完整统计结果>
 */
export async function runSimulationWithStatistics(
  n: number = 1000,
  operatorConfig?: OperatorConfig,
  basePity: number = 0,
  progressCallback?: (progress: number) => void
): Promise<SimulationStatistics> {
  const manager = getWorkerManager();

  // 使用默认配置
  const config = operatorConfig || {
    "海猫": { weight: 1, target: 99 },
    "其它": { weight: 1, target: 0 }
  };

  return manager.runSimulation(n, config, basePity, progressCallback);
}

/**
 * 销毁 Worker 管理器 (在应用卸载时调用)
 */
export function destroyWorkerManager(): void {
  if (workerManager) {
    workerManager.destroy();
    workerManager = null;
  }
}

/**
 * 计算统计信息
 * @param data - 数据数组
 * @returns 统计信息
 */
export function calculateStatistics(data: number[]): Statistics {
  if (data.length === 0) {
    return {} as Statistics;
  }

  const sortedData = [...data].sort((a, b) => a - b);
  const n = data.length;

  // 基本统计
  const mean = data.reduce((sum, val) => sum + val, 0) / n;
  const median = n % 2 === 0
    ? (sortedData[n / 2 - 1] + sortedData[n / 2]) / 2
    : sortedData[Math.floor(n / 2)];

  // 标准差
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const std = Math.sqrt(variance);

  // 分位数
  const p25 = percentile(sortedData, 25);
  const p75 = percentile(sortedData, 75);

  // Sigma范围
  const sigma1 = { min: mean - std, max: mean + std };
  const sigma2 = { min: mean - 2 * std, max: mean + 2 * std };
  const sigma3 = { min: mean - 3 * std, max: mean + 3 * std };

  // 计算总抽数和总模拟次数
  const totalDraws = data.reduce((sum, val) => sum + val, 0);
  const totalSimulations = data.length;

  return {
    mean,
    median,
    std,
    p25,
    p75,
    min: sortedData[0],
    max: sortedData[n - 1],
    totalDraws,
    totalSimulations,
    sigma1,
    sigma2,
    sigma3
  };
}

/**
 * 计算百分位数
 * @param sortedData - 已排序的数据
 * @param percentileValue - 百分位数 (0-100)
 * @returns 百分位数值
 */
function percentile(sortedData: number[], percentileValue: number): number {
  const index = (percentileValue / 100) * (sortedData.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedData[lower];
  }

  const weight = index - lower;
  return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
}

/**
 * 计算频数分布
 * @param data - 数据数组
 * @returns 频数分布数组
 */
export function calculateFrequencyDistribution(data: number[]): FrequencyDistributionItem[] {
  if (data.length === 0) return [];

  const sortedData = [...data].sort((a, b) => a - b);
  const n = data.length;
  const distribution: FrequencyDistributionItem[] = [];

  // 计算每个抽数值的累积频率
  const valueCount: { [key: number]: number } = {};
  sortedData.forEach(val => {
    valueCount[val] = (valueCount[val] || 0) + 1;
  });

  let cumulativeCount = 0;
  const uniqueValues = Object.keys(valueCount).map(Number).sort((a, b) => a - b);

  uniqueValues.forEach(draws => {
    cumulativeCount += valueCount[draws];
    const percentage = (cumulativeCount / n) * 100;
    distribution.push({
      draws,
      percentage: Math.round(percentage * 100) / 100, // 保留2位小数
      count: cumulativeCount
    });
  });

  return distribution;
}

/**
 * 计算sigma范围内的数据比例
 * @param data - 数据数组
 * @param stats - 统计信息
 * @returns sigma范围分析
 */
export function calculateSigmaAnalysis(data: number[], stats: Statistics): SigmaAnalysis {
  if (data.length === 0 || !stats) {
    return {} as SigmaAnalysis;
  }

  const { mean, std, min, max } = stats;

  // 计算sigma范围，但确保不超出实际数据的边界
  const sigma1Min = Math.max(min, Math.round(mean - std));
  const sigma1Max = Math.min(max, Math.round(mean + std));
  const sigma2Min = Math.max(min, Math.round(mean - 2 * std));
  const sigma2Max = Math.min(max, Math.round(mean + 2 * std));
  const sigma3Min = Math.max(min, Math.round(mean - 3 * std));
  const sigma3Max = Math.min(max, Math.round(mean + 3 * std));

  // 基于修正后的范围计算覆盖的数据
  const inSigma1 = data.filter(val => val >= sigma1Min && val <= sigma1Max).length;
  const inSigma2 = data.filter(val => val >= sigma2Min && val <= sigma2Max).length;
  const inSigma3 = data.filter(val => val >= sigma3Min && val <= sigma3Max).length;

  const total = data.length;

  return {
    sigma1: {
      range: [sigma1Min, sigma1Max],
      count: inSigma1,
      percentage: (inSigma1 / total * 100).toFixed(2)
    },
    sigma2: {
      range: [sigma2Min, sigma2Max],
      count: inSigma2,
      percentage: (inSigma2 / total * 100).toFixed(2)
    },
    sigma3: {
      range: [sigma3Min, sigma3Max],
      count: inSigma3,
      percentage: (inSigma3 / total * 100).toFixed(2)
    }
  };
}
