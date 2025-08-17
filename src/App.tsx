import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Typography, Row, Col } from 'antd';
import ConfigPanel from './components/ConfigPanel';
import StatisticsDisplay from './components/StatisticsDisplay';
import FrequencyDistribution from './components/FrequencyDistribution';
import { runSimulationWithStatistics, setGPUAcceleration, onGPUStatusChange } from './utils/gacha';
import type { SimulationStatistics } from './utils/workerManager';
import './App.css';

const { Header, Content } = Layout;
const { Title } = Typography;

interface OperatorConfig {
  [key: string]: {
    weight: number;
    target: number;
  };
}

const App: React.FC = () => {
  const [operatorConfig, setOperatorConfig] = useState<OperatorConfig>({
    "干员1": { weight: 114, target: 191 },
    "干员2": { weight: 514, target: 81 }
  } as OperatorConfig);
  const [basePity, setBasePity] = useState<number>(0);
  const [simulationCount, setSimulationCount] = useState<number>(10000);
  const [useMultiThreading, setUseMultiThreading] = useState<boolean>(true); // 默认使用多线程
  const [useGPUAcceleration, setUseGPUAcceleration] = useState<boolean>(false); // 默认不使用GPU
  const [gpuAvailable, setGpuAvailable] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isProcessingData, setIsProcessingData] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [simulationStatistics, setSimulationStatistics] = useState<SimulationStatistics | null>(null);
  const [progress, setProgress] = useState<number>(0);

  // 清空模拟数据的函数
  const clearSimulationData = useCallback(() => {
    setSimulationStatistics(null);
    setProgress(0);
    setProcessingStatus('');
    console.log('[App] 配置已更改，清空之前的模拟数据');
  }, []);

  // 初始化GPU支持检测
  useEffect(() => {
    // 监听GPU状态变化
    const unsubscribe = onGPUStatusChange((status) => {
      setGpuAvailable(status.available);
      
      // 修复循环调用：只在初始检测时自动启用，不调用setGPUAcceleration
      if (status.available && status.enabled && !useGPUAcceleration) {
        // 只更新UI状态，不调用setGPUAcceleration避免循环
        setUseGPUAcceleration(true);
        console.log('[App] GPU检测到支持，UI已同步GPU状态');
      }
      
      console.log('[App] GPU状态更新:', status);
    });

    // 组件卸载时取消监听
    return () => {
      unsubscribe();
    };
  }, [useGPUAcceleration]); // 添加依赖项
  
  // GPU开关处理函数
  const handleUseGPUAccelerationChange = useCallback((checked: boolean) => {
    setUseGPUAcceleration(checked);
    setGPUAcceleration(checked);
    clearSimulationData();
    console.log(`[App] GPU加速${checked ? '已启用' : '已禁用'}`);
  }, [clearSimulationData]);

  // 包装setter函数，在配置更改时清空数据
  const handleSetOperatorConfig = useCallback((config: OperatorConfig) => {
    setOperatorConfig(config);
    clearSimulationData();
  }, [clearSimulationData]);

  const handleSetBasePity = useCallback((pity: number) => {
    setBasePity(pity);
    clearSimulationData();
  }, [clearSimulationData]);

  const handleSetSimulationCount = useCallback((count: number) => {
    setSimulationCount(count);
    clearSimulationData();
  }, [clearSimulationData]);

  const handleRunSimulation = useCallback(async () => {
    setIsSimulating(true);
    setIsProcessingData(false);
    setProgress(0);
    setProcessingStatus('');
    setSimulationStatistics(null);

    try {
      // 使用更精确的进度回调
      const progressHandler = (progress: number) => {
        // 确保进度值在有效范围内
        const clampedProgress = Math.max(0, Math.min(100, progress));
        setProgress(clampedProgress);
        
        // 当进度达到100%时，切换到数据处理状态
        if (clampedProgress >= 100) {
          setIsProcessingData(true);
        }
      };

      console.log('[App] 使用多线程模式进行模拟');

      // 使用多线程统计函数
      const statisticsResult = await runSimulationWithStatistics(
        simulationCount,
        operatorConfig,
        basePity,
        progressHandler
      );
      
      console.log('[App] 接收到统计结果:', {
        totalSimulations: statisticsResult.totalSimulations,
        bucketKeys: Object.keys(statisticsResult.drawsBucket).length,
        cumulativePoints: statisticsResult.cumulativeProbability.length,
        histogramBins: statisticsResult.histogramData.length,
        hasStatisticalData: !!statisticsResult.statisticalData
      });
      
      // 确保完成时进度为100%并设置为数据处理状态
      setProgress(100);
      setIsProcessingData(true);
      
      // 开始详细的数据处理状态更新
      setProcessingStatus('处理数据中 - 正在计算基础统计参数');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setProcessingStatus('处理数据中 - 正在计算频数分布');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setProcessingStatus('处理数据中 - 正在计算累计概率分布');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setProcessingStatus('处理数据中 - 统计单干员平均值');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setProcessingStatus('完成');
      
      setSimulationStatistics(statisticsResult);
      
    } catch (error) {
      console.error('[App] 模拟运行出错:', error);
      setProgress(0); // 错误时重置进度
      setProcessingStatus('');
    } finally {
      // 重置所有状态
      setIsSimulating(false);
      setIsProcessingData(false);
      setTimeout(() => setProcessingStatus(''), 2000); // 2秒后清除完成状态
    }
  }, [simulationCount, operatorConfig, basePity]);

  // 直接使用simulationStatistics中的统计数据，避免重新计算
  const statistics = simulationStatistics ? {
    mean: simulationStatistics.statisticalData.mean,
    median: simulationStatistics.statisticalData.median,
    std: simulationStatistics.statisticalData.sigma,
    p25: simulationStatistics.statisticalData.p25,
    p75: simulationStatistics.statisticalData.p75,
    min: Math.min(...Object.keys(simulationStatistics.drawsBucket).map(Number)),
    max: Math.max(...Object.keys(simulationStatistics.drawsBucket).map(Number)),
    totalDraws: Object.entries(simulationStatistics.drawsBucket).reduce((total, [draws, count]) => {
      return total + (parseInt(draws) * count);
    }, 0),
    totalSimulations: simulationStatistics.totalSimulations,
    sigma1: { 
      min: simulationStatistics.statisticalData.sigma1Range.min, 
      max: simulationStatistics.statisticalData.sigma1Range.max 
    },
    sigma2: { 
      min: simulationStatistics.statisticalData.sigma2Range.min, 
      max: simulationStatistics.statisticalData.sigma2Range.max 
    },
    sigma3: { 
      min: simulationStatistics.statisticalData.sigma3Range.min, 
      max: simulationStatistics.statisticalData.sigma3Range.max 
    },
  } : null;
  
  const sigmaAnalysis = simulationStatistics ? {
    sigma1: { 
      range: [simulationStatistics.statisticalData.sigma1Range.min, simulationStatistics.statisticalData.sigma1Range.max], 
      count: 0, 
      percentage: simulationStatistics.statisticalData.sigma1Range.coverage.toFixed(1) 
    },
    sigma2: { 
      range: [simulationStatistics.statisticalData.sigma2Range.min, simulationStatistics.statisticalData.sigma2Range.max], 
      count: 0, 
      percentage: simulationStatistics.statisticalData.sigma2Range.coverage.toFixed(1) 
    },
    sigma3: { 
      range: [simulationStatistics.statisticalData.sigma3Range.min, simulationStatistics.statisticalData.sigma3Range.max], 
      count: 0, 
      percentage: simulationStatistics.statisticalData.sigma3Range.coverage.toFixed(1) 
    },
  } : null;

  return (
    <Layout className="app-layout" style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <Title level={2} style={{ color: 'white', margin: 0, textAlign: 'center' }}>
          明日方舟抽卡模拟器
        </Title>
      </Header>
      
      <Content style={{ padding: '24px', background: '#f0f2f5' }}>
        <Row gutter={[24, 24]}>
          {/* 配置面板 */}
          <Col xs={24} lg={8}>
            <ConfigPanel
              operatorConfig={operatorConfig}
              setOperatorConfig={handleSetOperatorConfig}
              basePity={basePity}
              setBasePity={handleSetBasePity}
              simulationCount={simulationCount}
              setSimulationCount={handleSetSimulationCount}
              isSimulating={isSimulating}
              isProcessingData={isProcessingData}
              progress={progress}
              processingStatus={processingStatus}
              onRunSimulation={handleRunSimulation}
              useMultiThreading={useMultiThreading}
              onUseMultiThreadingChange={setUseMultiThreading}
              useGPUAcceleration={useGPUAcceleration}
              onUseGPUAccelerationChange={handleUseGPUAccelerationChange}
              gpuAvailable={gpuAvailable}
            />
          </Col>

          {/* 结果显示区域 */}
          <Col xs={24} lg={16}>
            <Row gutter={[16, 16]}>
              {/* 基本统计 */}
              {statistics && (
                <Col span={24}>
                  <StatisticsDisplay
                    statistics={statistics}
                    sigmaAnalysis={sigmaAnalysis}
                    characterStats={simulationStatistics?.characterStats}
                    statisticalData={simulationStatistics?.statisticalData}
                    simulationStatistics={simulationStatistics || undefined}
                    operatorConfig={operatorConfig}
                  />
                </Col>
              )}

              {/* 频数分布 */}
              {simulationStatistics && (
                <Col span={24}>
                  <FrequencyDistribution
                    totalDrawsData={[]} // 传递空数组，组件内部直接使用simulationStatistics
                    operatorConfig={operatorConfig}
                    statistics={statistics}
                    simulationStatistics={simulationStatistics}
                  />
                </Col>
              )}
            </Row>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
};

export default App;
