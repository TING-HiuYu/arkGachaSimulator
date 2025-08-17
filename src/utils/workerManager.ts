/**
 * Web Worker管理器
 * 每个Worker只执行一次模拟，通过完成Worker数量计算进度
 * 使用桶存储统计draws分布数据，支持GPU协同计算
 */

import { GPUManager } from './gpuManager';

interface WorkerTask {
  taskId: string;
  operatorConfig: any;
  basePity: number;
  workerId: number;
  simulationIndex: number;
}

interface SingleSimulationResult {
  totalDraws: number;
  characterCounts: { [key: string]: number };
  details: any;
}

// 数据结构定义
interface DrawsBucket {
  [draws: number]: number; // draws数量 -> 出现次数
}

interface CumulativeProbabilityPoint {
  draws: number;
  probability: number; // 累积概率百分比
}

interface HistogramDataPoint {
  draws: number;
  count: number;
  percentage: number;
  binStart: number;
  binEnd: number;
  binCenter: number;
}

export interface CharacterStats {
  count: number;
  averagePer100Draws: number;
  averageDrawsPerTarget: number;
}

export interface StatisticalData {
  mean: number;
  median: number;
  p25: number;
  p75: number;
  sigma: number;
  sigma1Range: { min: number; max: number; coverage: number };
  sigma2Range: { min: number; max: number; coverage: number };
  sigma3Range: { min: number; max: number; coverage: number };
}

/**
 * 模拟统计结果接口
 */
export interface SimulationStatistics {
  drawsBucket: DrawsBucket;
  cumulativeProbability: CumulativeProbabilityPoint[];
  histogramData: HistogramDataPoint[];
  characterStats: { [key: string]: CharacterStats };
  statisticalData: StatisticalData;
  totalSimulations: number;
  renderChannel: MessageChannel;
}

export class SimulationWorkerManager {
  private workers: Worker[] = [];
  private workerCount: number;
  private availableWorkers: Set<number> = new Set(); // 可用的Worker ID
  private gpuManager: GPUManager;
  private isGPUEnabled = false;
  private isGPUAvailable = false;
  private gpuStatusCallbacks: ((status: { available: boolean; enabled: boolean }) => void)[] = [];
  private activeTasks: Map<string, {
    resolve: Function;
    reject: Function;
    progressCallback?: Function;
    totalSimulations: number;
    completedSimulations: number;
    pendingSimulations: number[];
    operatorConfig: any;
    basePity: number;
    // 桶存储数据
    drawsBucket: DrawsBucket;
    characterCounts: { [key: string]: number };
  }> = new Map();
  renderChannel: MessageChannel;

  constructor() {
    // 获取 CPU 核心数，使用一半的核心
    this.workerCount = this.getCPUCoreCount();
    console.log(`[Worker] 创建 ${this.workerCount} 个 Worker 进行并行计算`);
    this.initializeWorkers();

    this.renderChannel = new MessageChannel();
    this.renderChannel.port2.onmessage = () => {
      // 这个回调会在下一个事件循环中执行，确保渲染更新
    };

    // 初始化GPU管理器
    this.gpuManager = new GPUManager();
    this.initializeGPU();

  }

  /**
   * 获取 CPU 核心数
   */
  private getCPUCoreCount(): number {
    const cores = navigator.hardwareConcurrency || 4;
    const workerCount = Math.max(1, Math.min(Math.floor(cores)));
    return workerCount;
  }

  /**
   * 初始化 Workers
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker('/simulation-worker.js');
      worker.addEventListener('message', this.handleWorkerMessage.bind(this));
      worker.addEventListener('error', (error) => {
        console.error(`[Worker] Worker ${i} 发生错误:`, error);
      });

      this.workers.push(worker);
      this.availableWorkers.add(i); // 初始时所有Worker都可用
    }
  }

  /**
   * 初始化GPU
   */
  private async initializeGPU(): Promise<void> {
    try {
      const gpuSupport = await this.gpuManager.checkGPUSupport();
      if (gpuSupport.supported) {
        this.isGPUAvailable = await this.gpuManager.initialize();
        console.log('[Worker] GPU可用状态:', this.isGPUAvailable);

        // 如果GPU可用，自动启用GPU
        if (this.isGPUAvailable) {
          this.isGPUEnabled = true;
          console.log('[Worker] GPU检测到支持，已自动启用GPU加速');
        }

        // 通知所有监听器GPU状态变化
        this.notifyGPUStatusChange();
      } else {
        console.log('[Worker] GPU不支持，使用CPU模拟');
        this.isGPUAvailable = false;
        this.isGPUEnabled = false;
      }
    } catch (error) {
      console.error('[Worker] GPU初始化失败:', error);
      this.isGPUAvailable = false;
      this.isGPUEnabled = false;
    }
  }

  /**
   * 通知GPU状态变化
   */
  private notifyGPUStatusChange(): void {
    const status = { available: this.isGPUAvailable, enabled: this.isGPUEnabled };
    this.gpuStatusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('[Worker] GPU状态回调执行失败:', error);
      }
    });
  }

  /**
   * 监听GPU状态变化
   */
  public onGPUStatusChange(callback: (status: { available: boolean; enabled: boolean }) => void): () => void {
    this.gpuStatusCallbacks.push(callback);

    // 立即调用一次回调，传递当前状态
    callback({ available: this.isGPUAvailable, enabled: this.isGPUEnabled });

    // 返回取消监听的函数
    return () => {
      const index = this.gpuStatusCallbacks.indexOf(callback);
      if (index > -1) {
        this.gpuStatusCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 设置GPU开关状态
   */
  public setGPUEnabled(enabled: boolean): void {
    this.isGPUEnabled = enabled && this.isGPUAvailable;
    console.log(`[Worker] GPU${this.isGPUEnabled ? '已启用' : '已禁用'}`);

    // 通知状态变化
    this.notifyGPUStatusChange();
  }

  /**
   * 获取GPU可用状态
   */
  public getGPUAvailability(): { available: boolean; enabled: boolean } {
    return {
      available: this.isGPUAvailable,
      enabled: this.isGPUEnabled
    };
  }

  /**
   * 处理 Worker 消息
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { type, taskId, workerId, result, error } = event.data;

    switch (type) {
      case 'complete':
        this.handleWorkerComplete(taskId, workerId, result);
        break;
      case 'error':
        this.handleWorkerError(taskId, error);
        break;
    }
  }

  /**
   * 处理Worker完成
   */
  private handleWorkerComplete(taskId: string, workerId: number, result: SingleSimulationResult): void {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      console.log(`[Worker] 未找到任务 ${taskId}`);
      return;
    }

    console.log(`[Worker] Worker ${workerId} 成功完成任务 ${taskId} - 抽数: ${result.totalDraws}, 进度: ${task.completedSimulations + 1}/${task.totalSimulations}`);

    // 释放Worker回可用池
    this.availableWorkers.add(workerId);

    // 增加完成计数
    task.completedSimulations++;

    // 桶存储draws数据
    const draws = result.totalDraws;
    if (task.drawsBucket[draws]) {
      task.drawsBucket[draws]++;
    } else {
      task.drawsBucket[draws] = 1;
    }

    // 累积角色统计
    Object.keys(result.characterCounts).forEach(char => {
      if (!task.characterCounts[char]) {
        task.characterCounts[char] = 0;
      }
      task.characterCounts[char] += result.characterCounts[char];
    });

    // 清理result数据防止内存泄漏
    result.characterCounts = {};
    result.details = [];
    result.totalDraws = 0;

    // 更新进度
    if (task.progressCallback) {
      const progress = (task.completedSimulations / task.totalSimulations) * 100;
      task.progressCallback(progress);
    }

    // 继续分配下一个模拟任务 (如果还有待处理的)
    this.assignNextSimulation(taskId);

    // 检查是否完成
    if (task.completedSimulations >= task.totalSimulations) {
      console.log(`[Worker] 任务 ${taskId} 全部 ${task.totalSimulations} 个模拟完成，开始计算统计数据`);
      this.completeTask(taskId);
    }
  }  /**
   * 处理Worker错误
   */
  private handleWorkerError(taskId: string, error: string): void {
    console.error(`[Worker] Worker 执行任务 ${taskId} 时发生错误:`, error);

    // 获取任务并拒绝
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.reject(new Error(error));
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 分配下一个模拟任务
   */
  private assignNextSimulation(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      console.log(`[Worker] 任务 ${taskId} 不存在`);
      return;
    }

    if (task.pendingSimulations.length === 0) {
      console.log(`[Worker] 任务 ${taskId} 没有待处理的模拟`);
      return;
    }

    if (this.availableWorkers.size === 0) {
      console.log(`[Worker] 没有可用的Worker`);
      return;
    }

    const simulationIndex = task.pendingSimulations.shift()!;
    const workerId = Array.from(this.availableWorkers)[0];
    this.availableWorkers.delete(workerId);

    const workerTask: WorkerTask = {
      taskId,
      operatorConfig: (task as any).operatorConfig,
      basePity: (task as any).basePity,
      workerId,
      simulationIndex
    };

    console.log(`[Worker] Worker ${workerId} 开始执行任务 ${taskId} - 模拟 ${simulationIndex}`);
    this.workers[workerId].postMessage(workerTask);
  }

  /**
   * 完成任务 - 计算所有统计数据
   */
  private completeTask(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    // 1. 计算累积概率分布
    const cumulativeProbability = this.calculateCumulativeProbability(task.drawsBucket, task.totalSimulations);

    // 2. 计算直方图数据
    const histogramData = this.calculateHistogramData(task.drawsBucket, task.totalSimulations);

    // 3. 计算角色统计
    const characterStats = this.calculateCharacterStats(task.characterCounts, task.drawsBucket);

    // 4. 计算统计数据 (mean, median, sigma等)
    const statisticalData = this.calculateStatisticalData(task.drawsBucket);

    // 构建统计结果
    const simulationStatistics: SimulationStatistics = {
      drawsBucket: task.drawsBucket,
      cumulativeProbability,
      histogramData,
      characterStats,
      statisticalData,
      totalSimulations: task.totalSimulations,
      renderChannel: this.renderChannel
    };

    // 解析 Promise
    console.log(`[Worker] 任务 ${taskId} 统计数据计算完成，返回结果`);
    task.resolve(simulationStatistics);

    // 彻底清理任务数据
    task.drawsBucket = {};
    task.characterCounts = {};
    task.pendingSimulations.length = 0;
    // 清理函数引用防止内存泄漏
    delete (task as any).operatorConfig;
    delete (task as any).resolve;
    delete (task as any).reject;
    delete (task as any).progressCallback;

    // 清理任务
    this.activeTasks.delete(taskId);

    // 检查是否所有任务都完成了，如果是则释放 worker 池
    if (this.activeTasks.size === 0) {
      console.log('[Worker] 所有任务已完成，释放 Worker 池');
      this.releaseWorkerPool();
    }
  }

  /**
   * 计算累积概率分布
   */
  private calculateCumulativeProbability(drawsBucket: DrawsBucket, totalSimulations: number): CumulativeProbabilityPoint[] {
    const sortedDraws = Object.keys(drawsBucket).map(Number).sort((a, b) => a - b);
    const cumulativeProbability: CumulativeProbabilityPoint[] = [];
    let cumulativeCount = 0;

    sortedDraws.forEach(draws => {
      cumulativeCount += drawsBucket[draws];
      const probability = (cumulativeCount / totalSimulations) * 100;
      cumulativeProbability.push({ draws, probability });
    });

    return cumulativeProbability;
  }

  /**
   * 计算直方图数据 - 基于桶数据生成分箱统计
   */
  private calculateHistogramData(drawsBucket: DrawsBucket, totalSimulations: number): HistogramDataPoint[] {
    const bucketEntries = Object.entries(drawsBucket)
      .map(([draws, count]) => ({ draws: parseInt(draws), count }))
      .sort((a, b) => a.draws - b.draws);

    if (bucketEntries.length === 0) return [];

    const minDraws = bucketEntries[0].draws;
    const maxDraws = bucketEntries[bucketEntries.length - 1].draws;
    const binCount = Math.min(50, Math.max(10, Math.floor(Math.sqrt(totalSimulations))));
    const binWidth = (maxDraws - minDraws) / binCount;

    // 创建分箱
    const bins: HistogramDataPoint[] = [];
    for (let i = 0; i < binCount; i++) {
      const binStart = minDraws + i * binWidth;
      const binEnd = binStart + binWidth;
      const binCenter = (binStart + binEnd) / 2;

      // 计算该分箱内的数据点数量
      let count = 0;
      bucketEntries.forEach(entry => {
        if (entry.draws >= binStart && (entry.draws < binEnd || (i === binCount - 1 && entry.draws <= binEnd))) {
          count += entry.count;
        }
      });

      if (count > 0) {
        bins.push({
          draws: Math.round(binCenter),
          count,
          percentage: (count / totalSimulations) * 100,
          binStart,
          binEnd,
          binCenter
        });
      }
    }

    return bins;
  }

  /**
   * 计算角色统计
   */
  private calculateCharacterStats(characterCounts: { [key: string]: number }, drawsBucket: DrawsBucket): { [key: string]: CharacterStats } {
    const characterStats: { [key: string]: CharacterStats } = {};
    const totalDraws = this.getTotalDrawsFromBucket(drawsBucket);

    Object.keys(characterCounts).forEach(char => {
      const count = characterCounts[char];
      const averagePer100Draws = (count / totalDraws) * 100;

      // 需要target配置来计算averageDrawsPerTarget
      // const target = operatorConfig[char]?.target || 1; // 从配置中获取target值
      // const averageDrawsPerTarget = meanDraws / (count / target);
      const averageDrawsPerTarget = 0; // 暂时设为0，等待target配置

      characterStats[char] = {
        count,
        averagePer100Draws,
        averageDrawsPerTarget
      };
    });

    return characterStats;
  }

  /**
   * 从桶中计算总draws数
   */
  private getTotalDrawsFromBucket(drawsBucket: DrawsBucket): number {
    return Object.entries(drawsBucket).reduce((total, [draws, count]) => {
      return total + (parseInt(draws) * count);
    }, 0);
  }

  /**
   * 计算统计数据 - 直接基于桶数据计算，避免内存爆炸
   */
  private calculateStatisticalData(drawsBucket: DrawsBucket): StatisticalData {
    // 直接基于桶计算统计数据，不重新创建大数组
    const bucketEntries = Object.entries(drawsBucket)
      .map(([draws, count]) => ({ draws: parseInt(draws), count }))
      .sort((a, b) => a.draws - b.draws);

    const totalCount = bucketEntries.reduce((sum, entry) => sum + entry.count, 0);

    // 计算加权平均值
    const mean = bucketEntries.reduce((sum, entry) => sum + entry.draws * entry.count, 0) / totalCount;

    // 计算中位数 - 基于桶数据
    const medianIndex = Math.floor(totalCount / 2);
    let currentCount = 0;
    let median = mean;
    for (const entry of bucketEntries) {
      currentCount += entry.count;
      if (currentCount >= medianIndex) {
        median = entry.draws;
        break;
      }
    }

    // 计算分位数 - 基于桶数据
    const p25Index = Math.floor(totalCount * 0.25);
    const p75Index = Math.floor(totalCount * 0.75);
    let p25 = mean, p75 = mean;
    currentCount = 0;

    for (const entry of bucketEntries) {
      currentCount += entry.count;
      if (p25 === mean && currentCount >= p25Index) {
        p25 = entry.draws;
      }
      if (currentCount >= p75Index) {
        p75 = entry.draws;
        break;
      }
    }

    // 计算加权方差和标准差
    const variance = bucketEntries.reduce((sum, entry) => {
      return sum + entry.count * Math.pow(entry.draws - mean, 2);
    }, 0) / totalCount;
    const sigma = Math.sqrt(variance);

    // 计算sigma范围覆盖度 - 基于桶数据
    const sigma1Min = Math.max(0, mean - sigma);
    const sigma1Max = mean + sigma;
    const sigma1Count = bucketEntries.reduce((count, entry) => {
      return entry.draws >= sigma1Min && entry.draws <= sigma1Max ? count + entry.count : count;
    }, 0);
    const sigma1Coverage = (sigma1Count / totalCount) * 100;

    const sigma2Min = Math.max(0, mean - 2 * sigma);
    const sigma2Max = mean + 2 * sigma;
    const sigma2Count = bucketEntries.reduce((count, entry) => {
      return entry.draws >= sigma2Min && entry.draws <= sigma2Max ? count + entry.count : count;
    }, 0);
    const sigma2Coverage = (sigma2Count / totalCount) * 100;

    const sigma3Min = Math.max(0, mean - 3 * sigma);
    const sigma3Max = mean + 3 * sigma;
    const sigma3Count = bucketEntries.reduce((count, entry) => {
      return entry.draws >= sigma3Min && entry.draws <= sigma3Max ? count + entry.count : count;
    }, 0);
    const sigma3Coverage = (sigma3Count / totalCount) * 100;

    return {
      mean,
      median,
      p25,
      p75,
      sigma,
      sigma1Range: { min: sigma1Min, max: sigma1Max, coverage: sigma1Coverage },
      sigma2Range: { min: sigma2Min, max: sigma2Max, coverage: sigma2Coverage },
      sigma3Range: { min: sigma3Min, max: sigma3Max, coverage: sigma3Coverage }
    };
  }

  /**
   * 确保 Worker 池已初始化
   */
  private ensureWorkersInitialized(): void {
    if (this.workers.length === 0) {
      console.log('[Worker] Worker 池为空，重新初始化');
      this.initializeWorkers();
    }
  }

  /**
   * 运行多线程模拟
   */
  public async runSimulation(
    totalSimulations: number,
    operatorConfig: any,
    basePity: number = 0,
    progressCallback?: (progress: number) => void
  ): Promise<SimulationStatistics> {
    console.log(`[Worker] 开始执行模拟任务 - 总模拟次数: ${totalSimulations}`);

    // 对 operatorConfig 按权重从小到大排序（如果有 weight 字段）
    if (operatorConfig && typeof operatorConfig === 'object') {
      const sortedEntries = Object.entries(operatorConfig).sort(([, a], [, b]) => {
        const wa = typeof (a as any).weight === 'number' ? (a as any).weight : 1;
        const wb = typeof (b as any).weight === 'number' ? (b as any).weight : 1;
        return wa - wb;
      });
      operatorConfig = Object.fromEntries(sortedEntries);
    }

    // 如果GPU可用且已启用，优先使用GPU
    if (this.isGPUEnabled && this.gpuManager.isAvailable()) {
      console.log('[Worker] 使用GPU加速模拟');
      return this.runGPUSimulation(totalSimulations, operatorConfig, basePity, progressCallback);
    }

    // 否则使用CPU Worker模拟
    console.log(`[Worker] 使用 ${this.workers.length} 个CPU Worker进行模拟`);
    return this.runCPUSimulation(totalSimulations, operatorConfig, basePity, progressCallback);
  }

  /**
   * GPU加速模拟 - 支持差值算法
   */
  private async runGPUSimulation(
    totalSimulations: number,
    operatorConfig: any,
    basePity: number,
    progressCallback?: (progress: number) => void
  ): Promise<SimulationStatistics> {
    console.log('[Worker] 执行GPU差值算法加速模拟');

    try {
      // 转换为新的OperatorConfig格式
      const operatorNames = Object.keys(operatorConfig);
      const newOperatorConfig = {
        operators: operatorNames
          .map(name => ({
            name,
            weight: operatorConfig[name].weight || 1
          })), // 按weight从小到大排序
        maxDraws: 100, // 默认最大抽数
        basePity
      };

      // 主程序处理所有GPU结果数据
      const drawsBucket: DrawsBucket = {};
      const characterCounts: { [key: string]: number } = {};

      let lastRenderTime = performance.now();
      const RENDER_INTERVAL = 16; // 约60fps

      for (let currentSim = 0; currentSim < totalSimulations;) {
        // 执行GPU差值算法模拟，获取所有原始结果
        const results = await this.gpuManager.runSimulation(newOperatorConfig);

        if (results) {
          console.log(`[Worker] GPU差值算法模拟完成 - 总计 ${currentSim} 次模拟`);
        }

        // 处理结果
        while (results && results.length > 0) {
          // 初始化每个角色的计数哈希表
          const operator: { [name: string]: number } = Object.fromEntries(
            Object.keys(operatorConfig).map(name => [name, 0])
          );

          let totalDraws = 0;

          // 遍历GPU结果，直到每个角色都达到目标
          for (; ;) {
            const result = results.pop();
            if (!result) break;
            const name = result.name;

            if (name in operator) {
              operator[name]++;
              totalDraws += result.draws;
              characterCounts[name] = (characterCounts[name] || 0) + 1;
            }

            // 如果所有角色都达到目标，提前退出
            if (Object.keys(operator).every(n => operator[n] >= operatorConfig[n].target)) {
              drawsBucket[totalDraws] = (drawsBucket[totalDraws] || 0) + 1;
              if (++currentSim >= totalSimulations) {
                // 所有模拟完成，进行结果处理
                while (results.pop()) { }
              }

              // 使用 requestAnimationFrame 确保渲染更新
              if (progressCallback) {
                const currentTime = performance.now();
                if (currentTime - lastRenderTime >= RENDER_INTERVAL) {
                  const progress = (currentSim / totalSimulations) * 100;
                  progressCallback(progress);

                  // 强制渲染更新
                  await new Promise(resolve => requestAnimationFrame(resolve));
                  lastRenderTime = currentTime;
                }
              }

              break;
            }
          };
        }
      }

      // 生成统计数据
      const cumulativeProbability = this.calculateCumulativeProbability(drawsBucket, totalSimulations);
      const histogramData = this.calculateHistogramData(drawsBucket, totalSimulations);
      const characterStats = this.calculateCharacterStats(characterCounts, drawsBucket);
      const statisticalData = this.calculateStatisticalData(drawsBucket);

      console.log('[Worker] 统计数据生成完成:', {
        cumulativeProbabilityPoints: cumulativeProbability.length,
        histogramBins: histogramData.length,
        characterStatsCount: Object.keys(characterStats).length
      });

      return {
        drawsBucket,
        cumulativeProbability,
        histogramData,
        characterStats,
        statisticalData,
        totalSimulations,
        renderChannel: this.renderChannel
      };
    } catch (error) {
      console.error('[Worker] GPU模拟失败, 回退到CPU模拟:', error);
      // GPU失败时回退到CPU模拟 
      return this.runCPUSimulation(totalSimulations, operatorConfig, basePity, progressCallback);
    }
  }

  /**
   * CPU Worker模拟
   */
  private async runCPUSimulation(
    totalSimulations: number,
    operatorConfig: any,
    basePity: number,
    progressCallback?: (progress: number) => void
  ): Promise<SimulationStatistics> {
    // 确保 Worker 池已初始化
    this.ensureWorkersInitialized();

    const taskId = `cpu_task_${Date.now()}_${Math.random()}`;
    console.log(`[Worker] CPU任务 ${taskId} - 总模拟次数: ${totalSimulations}, 使用 ${this.workers.length} 个Worker`);

    return new Promise((resolve, reject) => {
      // 创建待处理的模拟索引数组
      const pendingSimulations = Array.from({ length: totalSimulations }, (_, i) => i);

      // 注册任务
      this.activeTasks.set(taskId, {
        resolve,
        reject,
        progressCallback,
        totalSimulations,
        completedSimulations: 0,
        pendingSimulations,
        operatorConfig,
        basePity,
        // 桶存储数据
        drawsBucket: {},
        characterCounts: {}
      } as any);

      // 立即开始分配任务给可用的Worker
      const initialAssignments = Math.min(this.availableWorkers.size, totalSimulations);
      console.log(`[Worker] CPU任务 ${taskId} 初始分配 ${initialAssignments} 个Worker开始并行执行`);
      for (let i = 0; i < initialAssignments; i++) {
        this.assignNextSimulation(taskId);
      }
    });
  }

  /**
   * 释放 Worker 池
   */
  private releaseWorkerPool(): void {
    console.log(`[Worker] 释放 ${this.workers.length} 个 Worker`);
    this.workers.forEach((worker, index) => {
      worker.terminate();
      console.log(`[Worker] Worker ${index} 已终止`);
    });
    this.workers = [];
    this.availableWorkers.clear();

    // 清理所有剩余的任务数据
    this.activeTasks.forEach((task) => {
      task.drawsBucket = {};
      task.characterCounts = {};
      task.pendingSimulations.length = 0;
    });
    this.activeTasks.clear();

    // 建议垃圾回收
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
    }

    console.log('[Worker] Worker 池已释放，内存已清理');
  }

  /**
   * 销毁所有 Workers
   */
  public destroy(): void {
    this.releaseWorkerPool();
    this.activeTasks.clear();
  }
}
