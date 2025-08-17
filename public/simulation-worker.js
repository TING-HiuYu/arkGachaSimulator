/**
 * Web Worker for gacha simulation
 * 抽卡模拟 Worker - 每个Worker只执行一次模拟
 */

/**
 * 单次抽卡模拟 - 保底机制
 * @param basePity - 已累计未出6星的抽数
 * @returns 抽到6星所需的抽数
 */
function gatcha(basePity = 0) {
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
function weightedChoice(items, weights) {
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
function chouShuTongJi(operatorConfig, basePity = 0) {
  // 数据验证
  if (!operatorConfig || Object.keys(operatorConfig).length === 0) {
    throw new Error('干员配置不能为空');
  }
  
  const operators = Object.keys(operatorConfig);
  const weights = operators.map(op => operatorConfig[op].weight);
  
  let total = 0;
  let currentPity = basePity;
  const statistic = {};
  
  // 初始化统计
  operators.forEach(op => {
    statistic[op] = 0;
  });
  
  // 检查退出条件
  const checkCompletion = () => {
    return operators.every(op => 
      operatorConfig[op].target === 0 || statistic[op] >= operatorConfig[op].target
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
  
  const result = { 
    total, 
    statistic, 
    // 不再返回details数组以节省内存
    details: [] 
  };
  
  // 清理局部变量
  operators.length = 0;
  weights.length = 0;
  currentPity = null;
  total = null;
  
  return result;
}

// Worker 消息处理 - 每个Worker只执行一次模拟
self.onmessage = function(e) {
  let { taskId, operatorConfig, basePity, workerId, simulationIndex } = e.data;
  
  try {
    // 每个Worker只执行一次模拟
    const result = chouShuTongJi(operatorConfig, basePity);
    
    // 发送完成结果
    self.postMessage({
      type: 'complete',
      taskId,
      workerId,
      simulationIndex,
      result: {
        totalDraws: result.total,
        characterCounts: result.statistic,
        details: result.details
      }
    });
    
    // 主动清理内存 - 重置所有变量
    result.statistic = null;
    result.details = null;
    
  } catch (error) {
    // 发送错误信息
    self.postMessage({
      type: 'error',
      taskId,
      workerId,
      simulationIndex,
      error: error.message
    });
  } finally {
    // 强制垃圾回收建议（虽然浏览器可能忽略）
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
    }
    
    // 清理局部变量引用
    operatorConfig = null;
    basePity = null;
    taskId = null;
    workerId = null;
    simulationIndex = null;
  }
};
