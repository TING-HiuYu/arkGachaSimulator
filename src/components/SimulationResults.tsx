import React from 'react';
import { Card, Row, Col } from 'antd';
import { Column, Line } from '@ant-design/charts';

interface SimulationResultsProps {
  data: number[];
  characterCounts: { [key: string]: number[] };
  operatorConfig: { [key: string]: { weight: number; target: number } };
}

const SimulationResults: React.FC<SimulationResultsProps> = ({
  data,
  characterCounts,
  operatorConfig,
}) => {
  // 生成分布直方图数据
  const generateDistributionData = () => {
    if (!data || data.length === 0) return [];
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binCount = Math.min(50, Math.max(10, Math.floor(Math.sqrt(data.length))));
    const binWidth = Math.ceil((max - min) / binCount);
    
    const bins: { [key: string]: number } = {};
    
    data.forEach(value => {
      const binStart = Math.floor((value - min) / binWidth) * binWidth + min;
      const binEnd = binStart + binWidth;
      const binLabel = `${binStart}-${binEnd}`;
      
      if (!bins[binLabel]) {
        bins[binLabel] = 0;
      }
      bins[binLabel]++;
    });
    
    return Object.entries(bins)
      .map(([range, count]) => ({
        range,
        count,
        frequency: (count / data.length * 100).toFixed(1),
      }))
      .sort((a, b) => {
        const aStart = parseInt(a.range.split('-')[0]);
        const bStart = parseInt(b.range.split('-')[0]);
        return aStart - bStart;
      });
  };

  // 生成累积分布数据
  const generateCumulativeData = () => {
    if (!data || data.length === 0) return [];
    
    const sortedData = [...data].sort((a, b) => a - b);
    const cumulativeData = [];
    
    for (let i = 1; i <= 100; i++) {
      const percentileIndex = Math.ceil((i / 100) * sortedData.length) - 1;
      const value = sortedData[Math.min(percentileIndex, sortedData.length - 1)];
      cumulativeData.push({
        percentile: i,
        value,
        label: `${i}%`,
      });
    }
    
    return cumulativeData;
  };

  // 生成角色分布数据
  const generateCharacterData = () => {
    if (!characterCounts) return [];
    
    return Object.entries(characterCounts).map(([name, counts]) => {
      const mean = counts.reduce((sum, val) => sum + val, 0) / counts.length;
      const target = operatorConfig[name]?.target || 0;
      const isTarget = target > 0;
      
      return {
        name,
        mean: parseFloat(mean.toFixed(2)),
        target,
        isTarget,
        category: isTarget ? '目标角色' : '其他角色',
      };
    }).sort((a, b) => b.mean - a.mean);
  };

  const distributionData = generateDistributionData();
  const cumulativeData = generateCumulativeData();
  const characterData = generateCharacterData();

  // 计算一些关键统计数据用于图表标注
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const median = [...data].sort((a, b) => a - b)[Math.floor(data.length / 2)];

  return (
    <Row gutter={[16, 16]}>
      {/* 抽数分布直方图 */}
      <Col xs={24} lg={12}>
        <Card title="总抽数分布" size="small">
          <Column
            data={distributionData}
            xField="range"
            yField="count"
            height={300}
            label={{
              position: 'top',
              formatter: (datum: any) => {
                return datum.count > data.length * 0.02 ? datum.count.toString() : '';
              },
            }}
            tooltip={{
              formatter: (datum: any) => {
                return {
                  name: '频次',
                  value: `${datum.count} 次 (${datum.frequency}%)`,
                };
              },
            }}
            columnStyle={{
              fill: '#1890ff',
              fillOpacity: 0.8,
            }}
            annotations={[
              {
                type: 'line',
                start: [`${Math.floor(mean / 100) * 100}-${Math.floor(mean / 100) * 100 + 100}`, 'min'],
                end: [`${Math.floor(mean / 100) * 100}-${Math.floor(mean / 100) * 100 + 100}`, 'max'],
                style: {
                  stroke: '#f5222d',
                  lineWidth: 2,
                  lineDash: [4, 4],
                },
              },
              {
                type: 'text',
                position: [`${Math.floor(mean / 100) * 100}-${Math.floor(mean / 100) * 100 + 100}`, 'max'],
                content: `平均: ${mean.toFixed(0)}`,
                style: {
                  textAlign: 'center',
                  fontSize: 12,
                  fill: '#f5222d',
                },
                offsetY: -10,
              },
            ]}
            xAxis={{
              title: {
                text: '抽数范围',
              },
              label: {
                autoRotate: true,
              },
            }}
            yAxis={{
              title: {
                text: '模拟次数',
              },
            }}
          />
        </Card>
      </Col>

      {/* 累积概率分布 */}
      <Col xs={24} lg={12}>
        <Card title="累积概率分布" size="small">
          <Line
            data={cumulativeData}
            xField="percentile"
            yField="value"
            height={300}
            smooth={true}
            point={{
              size: 2,
              shape: 'circle',
              style: {
                fill: '#1890ff',
                stroke: '#ffffff',
                lineWidth: 1,
              },
            }}
            line={{
              size: 3,
              color: '#1890ff',
            }}
            tooltip={{
              formatter: (datum: any) => {
                return {
                  name: '累积概率',
                  value: `${datum.percentile}% 的人需要 ${datum.value} 抽或更少`,
                };
              },
            }}
            annotations={[
              // 50%线
              {
                type: 'line',
                start: [50, 'min'],
                end: [50, median],
                style: {
                  stroke: '#faad14',
                  lineWidth: 2,
                  lineDash: [4, 4],
                },
              },
              {
                type: 'line',
                start: ['min', median],
                end: [50, median],
                style: {
                  stroke: '#faad14',
                  lineWidth: 2,
                  lineDash: [4, 4],
                },
              },
              {
                type: 'text',
                position: [50, median],
                content: `中位数\n${median}抽`,
                style: {
                  textAlign: 'center',
                  fontSize: 12,
                  fill: '#faad14',
                  fontWeight: 'bold',
                },
                offsetY: -30,
              },
              // 90%线
              {
                type: 'line',
                start: [90, 'min'],
                end: [90, cumulativeData[89]?.value || 0],
                style: {
                  stroke: '#f5222d',
                  lineWidth: 2,
                  lineDash: [4, 4],
                },
              },
              {
                type: 'text',
                position: [90, cumulativeData[89]?.value || 0],
                content: `90%\n${cumulativeData[89]?.value || 0}抽`,
                style: {
                  textAlign: 'center',
                  fontSize: 12,
                  fill: '#f5222d',
                  fontWeight: 'bold',
                },
                offsetY: -30,
              },
            ]}
            xAxis={{
              title: {
                text: '累积概率 (%)',
              },
              min: 0,
              max: 100,
            }}
            yAxis={{
              title: {
                text: '所需抽数',
              },
            }}
          />
        </Card>
      </Col>

      {/* 角色获得统计 */}
      <Col span={24}>
        <Card title="角色获得统计" size="small">
          <Column
            data={characterData}
            xField="name"
            yField="mean"
            height={300}
            seriesField="category"
            color={['#f5222d', '#52c41a']}
            label={{
              position: 'top',
              formatter: (datum: any) => datum.mean.toString(),
            }}
            tooltip={{
              formatter: (datum: any) => {
                return {
                  name: datum.name,
                  value: `平均获得 ${datum.mean} 个${datum.target > 0 ? ` (目标: ${datum.target})` : ''}`,
                };
              },
            }}
            legend={{
              position: 'top',
            }}
            annotations={characterData
              .filter(char => char.target > 0)
              .map(char => ({
                type: 'line',
                start: [char.name, char.target],
                end: [char.name, char.target],
                style: {
                  stroke: '#faad14',
                  lineWidth: 3,
                },
              }))}
            xAxis={{
              title: {
                text: '角色名称',
              },
            }}
            yAxis={{
              title: {
                text: '平均获得数量',
              },
            }}
          />
        </Card>
      </Col>
    </Row>
  );
};

export default SimulationResults;
