import React, { useState } from 'react';
import { Card, Row, Col, Statistic, Typography, Table, Tag, Input, Button, Space } from 'antd';
import type { CharacterStats, StatisticalData, SimulationStatistics } from '../utils/workerManager';

const { Text } = Typography;

interface StatisticsDisplayProps {
  statistics: {
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
  };
  sigmaAnalysis: {
    sigma1: { range: number[]; count: number; percentage: string };
    sigma2: { range: number[]; count: number; percentage: string };
    sigma3: { range: number[]; count: number; percentage: string };
  } | null;
  // 新的数据格式
  characterStats?: { [key: string]: CharacterStats };
  statisticalData?: StatisticalData;
  simulationStatistics?: SimulationStatistics; // 完整的统计数据
  operatorConfig: { [key: string]: { weight: number; target: number } };
}

const StatisticsDisplay: React.FC<StatisticsDisplayProps> = ({
  statistics,
  sigmaAnalysis,
  characterStats,
  statisticalData, // 保留供将来使用
  simulationStatistics,
  operatorConfig,
}) => {
  // 用户输入的抽数和分析结果
  const [userDraws, setUserDraws] = useState<string>('');
  const [positionResult, setPositionResult] = useState<{
    percentile: number;
    comparison: string;
    position: string;
    color: string;
  } | null>(null);

  // 避免未使用警告
  console.debug('[Stats] StatisticsDisplay props:', { statisticalData });

  // 计算95%百分点作为期望值
  const calculateP95 = (): number => {
    if (!simulationStatistics) return statistics.mean;
    
    const bucketEntries = Object.entries(simulationStatistics.drawsBucket)
      .map(([drawsStr, count]) => ({ draws: parseInt(drawsStr), count }))
      .sort((a, b) => a.draws - b.draws);

    const totalCount = bucketEntries.reduce((sum, entry) => sum + entry.count, 0);
    const targetCount = totalCount * 0.95; // 95%百分点

    let currentCount = 0;
    for (const entry of bucketEntries) {
      currentCount += entry.count;
      if (currentCount >= targetCount) {
        return entry.draws;
      }
    }
    
    return statistics.mean; // 备用值
  };

  // 计算用户位置的函数
  const calculateUserPosition = () => {
    const draws = parseInt(userDraws);
    if (isNaN(draws) || draws < 0 || !simulationStatistics) {
      setPositionResult(null);
      return;
    }

    // 使用drawsBucket计算百分位
    const bucketEntries = Object.entries(simulationStatistics.drawsBucket)
      .map(([drawsStr, count]) => ({ draws: parseInt(drawsStr), count }))
      .sort((a, b) => a.draws - b.draws);

    let totalCount = 0;
    let countBelowOrEqual = 0;

    // 计算总数和小于等于用户抽数的数量
    bucketEntries.forEach(({ draws: bucketDraws, count }) => {
      totalCount += count;
      if (bucketDraws <= draws) {
        countBelowOrEqual += count;
      }
    });

    const percentile = (countBelowOrEqual / totalCount) * 100;

    let comparison: string;
    let position: string;
    let color: string;

    if (percentile <= 50) {
      const betterThan = 100 - percentile;
      comparison = `优于 ${betterThan.toFixed(1)}% 的模拟数据`;
      position = `前 ${percentile .toFixed(1)}% `;
      color = '#52c41a'; // 绿色
    } else {
      const worseThan = percentile;
      comparison = `差于 ${worseThan.toFixed(1)}% 的模拟数据`;
      position = `后 ${(100 - percentile).toFixed(1)}% `;
      color = '#ff4d4f'; // 红色
    }

    setPositionResult({
      percentile: parseFloat(percentile.toFixed(1)),
      comparison,
      position,
      color
    });
  };
  // 基本统计数据
  const basicStatsColumns = [
    {
      title: '统计指标',
      dataIndex: 'metric',
      key: 'metric',
      width: '40%',
    },
    {
      title: '数值',
      dataIndex: 'value',
      key: 'value',
      width: '30%',
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      width: '30%',
      render: (text: string) => <Text type="secondary">{text}</Text>,
    },
  ];

  const basicStatsData = [
    {
      key: '1',
      metric: '期望值 (P95)',
      value: calculateP95().toFixed(0),
      description: '显著概率在此抽数内完成目标',
    },
    {
      key: '2',
      metric: '标准差',
      value: statistics.std.toFixed(1),
      description: '数据离散程度',
    },
    {
      key: '3',
      metric: 'P25分位数',
      value: statistics.p25.toFixed(0),
      description: '25%的人低于此值',
    },
    {
      key: '4',
      metric: 'P75分位数',
      value: statistics.p75.toFixed(0),
      description: '75%的人低于此值',
    },
    {
      key: '5',
      metric: '最小值',
      value: statistics.min.toString(),
      description: '最好运气',
    },
    {
      key: '6',
      metric: '最大值',
      value: statistics.max.toString(),
      description: '最坏运气',
    },
  ];

  // Sigma分析数据
  const sigmaColumns = [
    {
      title: 'Sigma范围',
      dataIndex: 'sigma',
      key: 'sigma',
      width: '25%',
    },
    {
      title: '抽数范围',
      dataIndex: 'range',
      key: 'range',
      width: '35%',
      render: (range: number[]) => (
        <Text>{range[0].toFixed(0)} - {range[1].toFixed(0)} 抽</Text>
      ),
    },
    {
      title: '占比',
      dataIndex: 'percentage',
      key: 'percentage',
      width: '20%',
      render: (percentage: string) => (
        <Tag color="blue">{percentage}%</Tag>
      ),
    },
  ];

  const sigmaData = sigmaAnalysis ? [
    {
      key: '1',
      sigma: '1σ',
      range: sigmaAnalysis.sigma1.range,
      percentage: sigmaAnalysis.sigma1.percentage,
      description: '约68%概率',
    },
    {
      key: '2',
      sigma: '2σ',
      range: sigmaAnalysis.sigma2.range,
      percentage: sigmaAnalysis.sigma2.percentage,
      description: '约95%概率',
    },
    {
      key: '3',
      sigma: '3σ',
      range: sigmaAnalysis.sigma3.range,
      percentage: sigmaAnalysis.sigma3.percentage,
      description: '约99.7%概率',
    },
  ] : [];

  // 角色统计数据
  const characterStatsColumns = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      width: '25%',
    },
    {
      title: '总计获得',
      dataIndex: 'total',
      key: 'total',
      width: '20%',
      render: (value: string) => <Text strong style={{ color: '#ff4d4f' }}>{value}</Text>,
    },
    {
      title: '平均每次模拟获得',
      dataIndex: 'mean',
      key: 'mean',
      width: '25%',
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: '目标/权重',
      dataIndex: 'target',
      key: 'target',
      width: '15%',
      render: (_text: string, record: any) => (
        <div>
          <Tag color={record.isTarget ? 'red' : 'default'}>
            目标: {record.targetValue}
          </Tag>
          <Tag color="blue">权重: {record.weight}</Tag>
        </div>
      ),
    },
  ];

  // 角色统计数据 - 优先使用新的统计数据格式
  const characterStatsData = characterStats ? Object.keys(characterStats).map(char => {
    const stats = characterStats[char];

    return {
      key: char,
      name: char,
      total: stats.count.toString(),
      mean: (stats.count / (simulationStatistics?.totalSimulations || 1)).toFixed(2), // 每次模拟平均获得数
      std: '0.00', // TODO: 标准差计算需要详细数据
      targetValue: operatorConfig[char]?.target || 0,
      weight: operatorConfig[char]?.weight || 1,
      isTarget: (operatorConfig[char]?.target || 0) > 0,
    };
  }) : [];

  return (
    <Row gutter={[16, 16]}>
      {/* 基本统计 */}
      <Col xs={24} lg={12}>
        <Card title="基本统计数据" size="small">
          <Row gutter={16} style={{ marginBottom: 16, margin: '0 8px' }} justify="space-around" align="middle">
            <Col flex="1">
              <div style={{ textAlign: 'left' }}>
                <Statistic
                  title="平均抽数"
                  value={statistics.mean}
                  precision={1}
                  valueStyle={{ color: '#1890ff' }}
                />
              </div>
            </Col>
            <Col flex="1">
              <div style={{ textAlign: 'left' }}>
                <Statistic
                  title="中位数"
                  value={statistics.median}
                  precision={1}
                  valueStyle={{ color: '#52c41a' }}
                />
              </div>
            </Col>
            <Col flex="1">
              <div style={{ textAlign: 'left' }}>
                <Statistic
                  title="标准差"
                  value={statistics.std}
                  precision={1}
                  valueStyle={{ color: '#faad14' }}
                />
              </div>
            </Col>
            <Col flex="2">
              <div style={{ textAlign: 'left' }}>
                <Statistic
                  title="总抽数"
                  value={statistics.totalDraws}
                  precision={0}
                  valueStyle={{ color: '#722ed1' }}
                />
              </div>
            </Col>
          </Row>
          <Table
            columns={basicStatsColumns}
            dataSource={basicStatsData}
            pagination={false}
            size="small"
          />
        </Card>
      </Col>

      {/* Sigma分析 */}
      <Col xs={24} lg={12}>
        <Card title="分布分析" size="small">
          <Table
            columns={sigmaColumns}
            dataSource={sigmaData}
            pagination={false}
            size="small"
          />
          <Text type="secondary" style={{ fontSize: '12px', marginTop: 8, display: 'block' }}>
            * Sigma（标准差）范围显示了数据的分布情况，帮助了解结果的可能性范围
          </Text>

          {/* 查看大概位置 */}
          <div style={{ marginTop: 16, padding: '12px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
            <Text strong style={{ fontSize: '14px', marginBottom: 8, display: 'block' }}>查看大概位置：</Text>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} lg={12}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text style={{ fontSize: '12px' }}>请输入您的抽数：</Text>
                  <Space>
                    <Input
                      type="number"
                      placeholder="请输入抽数"
                      value={userDraws}
                      onChange={(e) => setUserDraws(e.target.value)}
                      style={{ width: 150 }}
                      size="small"
                    />
                    <Button
                      type="primary"
                      size="small"
                      onClick={calculateUserPosition}
                      disabled={!userDraws || !simulationStatistics}
                    >
                      查看位置
                    </Button>
                  </Space>
                </Space>
              </Col>
              <Col xs={24} lg={12}>
                {positionResult ? (
                  <div style={{
                    padding: '12px',
                    border: `1px solid ${positionResult.color}`,
                    borderRadius: '4px',
                    backgroundColor: `${positionResult.color}08`
                  }}>
                    <Text strong style={{ fontSize: '13px' }}>分析结果：</Text>
                    <br />
                    <Text style={{ fontSize: '12px' }}>
                      您的抽数 <Text strong style={{ color: positionResult.color }}>
                        {positionResult.comparison}
                      </Text>
                    </Text>
                    <br />
                    <Text style={{ fontSize: '12px' }}>
                      位于 <Text strong style={{ color: positionResult.color }}>
                        {positionResult.position}
                      </Text>
                    </Text>
                  </div>
                ) : (
                  <div style={{
                    padding: '12px',
                    border: '1px dashed #d9d9d9',
                    borderRadius: '4px',
                    textAlign: 'center',
                    color: '#999',
                    fontSize: '12px'
                  }}>
                    输入抽数后点击"查看位置"查看分析结果
                  </div>
                )}
              </Col>
            </Row>
          </div>
        </Card>
      </Col>

      {/* 角色统计 */}
      <Col span={24}>
        <Card title="角色获得统计" size="small">
          <Table
            columns={characterStatsColumns}
            dataSource={characterStatsData}
            pagination={false}
            size="small"
          />
        </Card>
      </Col>
    </Row>
  );
};

export default StatisticsDisplay;
