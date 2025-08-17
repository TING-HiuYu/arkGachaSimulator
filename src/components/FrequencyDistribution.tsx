import React from 'react';
import { Card, Typography, Row, Col } from 'antd';
import { Column, Line } from '@ant-design/charts';

const { Text } = Typography;

interface FrequencyDistributionProps {
    totalDrawsData: number[]; // 保留兼容性，但不使用
    operatorConfig: { [key: string]: { weight: number; target: number } };
    statistics: {
        mean: number;
        median: number;
        std: number;
        p25: number;
        p75: number;
        min: number;
        max: number;
    } | null;
    simulationStatistics: {
        characterStats: { [key: string]: { count: number; } };
        totalSimulations: number;
        cumulativeProbability: Array<{ draws: number; probability: number }>;
        histogramData: Array<{
            draws: number;
            count: number;
            percentage: number;
            binStart: number;
            binEnd: number;
            binCenter: number;
        }>;
    };
}

const FrequencyDistribution: React.FC<FrequencyDistributionProps> = ({
    totalDrawsData, // 不再使用，保留兼容性
    operatorConfig,
    statistics,
    simulationStatistics,
}) => {
    // 直接使用simulationStatistics中的预计算数据
    const rawHistogramData = simulationStatistics.histogramData || [];
    const rawCumulativeData = simulationStatistics.cumulativeProbability || [];

    // 1. 为直方图准备数据 - 直接使用预计算的histogramData
    const generateHistogramData = () => {
        return rawHistogramData.map((item, index) => ({
            draws: item.draws,
            index: index,
            samplesInRange: item.count,
            binStart: item.binStart,
            binEnd: item.binEnd,
            binCenter: item.binCenter,
            percentage: item.percentage
        }));
    };

    // 2. 生成累积概率分布数据 - 直接使用预计算的数据
    const generateCumulativeData = () => {
        return rawCumulativeData.map(item => ({
            percentage: parseFloat(item.probability.toFixed(1)),
            draws: item.draws,
            label: `${item.probability.toFixed(1)}%`,
        }));
    };

    // 3. 生成干员获取统计数据
    const generateCharacterData = () => {
        console.log('[Chart] generateCharacterData 开始执行');
        console.log('[Chart] 输入数据检查:', { statistics, operatorConfig, simulationStatistics });
        
        if (!statistics || !simulationStatistics || !simulationStatistics.characterStats) {
            console.log('[Chart] 数据不完整，返回空数组');
            return [];
        }

        // 使用新的数据格式
        console.log('[Chart] 使用新的数据格式 simulationStatistics');
        const characterDataSource: { [key: string]: { count: number; totalSimulations: number; } } = {};
        
        Object.entries(simulationStatistics.characterStats).forEach(([name, stats]) => {
            characterDataSource[name] = {
                count: stats.count,
                totalSimulations: simulationStatistics.totalSimulations
            };
        });

        console.log('[Chart] characterDataSource:', characterDataSource);

        const result: Array<{
            name: string;
            value: number;
            type: string;
            category: string;
            target: number;
            scaledValue: number; // 用于显示的缩放值
        }> = [];

        // 先计算所有数据，用于获取最大值
        const tempData: Array<{ name: string; per100: number; avgDraws: number }> = [];
        
        Object.entries(characterDataSource).forEach(([name, data]) => {
            console.log(`[Chart] 处理角色 ${name}:`, data);
            
            const totalObtained = data.count; // 总计获得数
            const totalDraws = statistics.mean * simulationStatistics.totalSimulations;
            const target = operatorConfig[name]?.target || 0; // 目标数量
            
            // 计算每100抽出货个数：(总计获得 × 100) / 总抽数
            const avgPer100 = (totalObtained * 100) / totalDraws;
            
            // 计算平均每目标所需抽数：(总抽数 × 目标) / 总计获得
            let avgDrawsPerTarget = 0;
            if (totalObtained > 0 && target > 0) {
                avgDrawsPerTarget = (totalDraws * target) / totalObtained;
            }

            console.log(`[Chart] ${name} - avgPer100: ${avgPer100}, avgDrawsPerTarget: ${avgDrawsPerTarget}, target: ${target}`);

            tempData.push({
                name,
                per100: avgPer100,
                avgDraws: avgDrawsPerTarget
            });
        });

        console.log('[Chart] tempData:', tempData);

        if (tempData.length === 0) {
            console.log('[Chart] tempData 为空，返回空数组');
            return [];
        }

        // 获取最大值用于缩放
        const maxPer100 = Math.max(...tempData.map(d => d.per100));
        const maxAvgDraws = Math.max(...tempData.map(d => d.avgDraws));
        
        console.log('[Chart] 最大值:', { maxPer100, maxAvgDraws });
        
        // 生成最终数据
        tempData.forEach(({ name, per100, avgDraws }) => {
            const target = operatorConfig[name]?.target || 0;
            const isTarget = target > 0;
            const category = isTarget ? '目标角色' : '其他角色';

            // 添加每100抽数据（按比例缩放到0-100）
            const per100Entry = {
                name,
                value: parseFloat(per100.toFixed(2)),
                type: '每100抽出货个数',
                category,
                target,
                scaledValue: (per100 / maxPer100) * 100
            };
            result.push(per100Entry);

            // 添加平均每目标所需抽数（按比例缩放到0-100）
            const avgDrawsEntry = {
                name,
                value: parseFloat(avgDraws.toFixed(1)),
                type: '平均每目标所需抽数',
                category,
                target,
                scaledValue: (avgDraws / maxAvgDraws) * 100
            };
            result.push(avgDrawsEntry);
            
            console.log(`[Chart] ${name} 生成的数据条目:`, per100Entry, avgDrawsEntry);
        });

        const finalResult = result.sort((a, b) => {
            if (a.name !== b.name) {
                return a.name.localeCompare(b.name);
            }
            return a.type.localeCompare(b.type);
        });
        
        console.log('[Chart] 最终结果:', finalResult);
        return finalResult;
    };

    const histogramData = generateHistogramData();
    const cumulativeData = generateCumulativeData();
    const characterData = generateCharacterData();

    // 添加调试信息
    console.log('[Chart] FrequencyDistribution Debug:', {
        totalDrawsDataLength: totalDrawsData?.length || 0,
        histogramDataLength: histogramData.length,
        cumulativeDataLength: cumulativeData.length,
        characterDataLength: characterData.length,
        hasSimulationStatistics: !!simulationStatistics,
        characterDataSample: characterData.slice(0, 2),
    });

    return (
        <Row gutter={[16, 16]}>
            {/* 1. 抽数统计直方图 */}
            <Col span={24}>
                <Card title="抽数统计分布" size="small">
                    {histogramData.length > 0 ? (
                        <Column
                            data={histogramData}
                            xField="draws"
                            yField="samplesInRange"
                            height={350}
                            scale={{
                                y: {
                                    type: 'log', // 对数刻度
                                    domainMin: 1,
                                    unknown: 1,
                                    nice: true,
                                    clamp: true,
                                    base: 10,
                                },
                            }}
                            style={{
                                fill: '#1890ff',
                            }}
                            tooltip={{
                                title: (datum: any) => {
                                    if (!datum || !datum.binStart || !datum.binEnd) return `${datum.draws} 抽`;
                                    return `${Math.round(datum.binStart)} - ${Math.round(datum.binEnd)} 抽`;
                                },
                                items: [
                                    {
                                        name: '人数',
                                        field: 'samplesInRange',
                                        valueFormatter: (count: number) => `${count} 人`,
                                    },
                                    {
                                        name: '占比',
                                        field: 'percentage',
                                        valueFormatter: (percentage: number) => `${percentage.toFixed(2)}%`,
                                    },
                                ],
                            }}
                            interaction={{
                                tooltip: {
                                    render: (_event: any, { title, items }: any) => {
                                        if (!items || items.length === 0) return '';
                                        const item = items[0];
                                        if (!item) return '';

                                        const count = parseInt(item.value?.replace(/[^\d]/g, '') || '0') || 0;
                                        const rangeStr = title || '未知范围';

                                        return `
                        <div style="line-height: 1.6;">有 <span style="color: #90832fff; font-weight: bold; font-size: 16px;">${count}</span> 人在</div>
                        <div style="line-height: 1.6;"><span style="color: #90832fff; font-weight: bold; font-size: 16px;">${rangeStr}</span> 抽时完成了目标</div>
                    `;
                                    },
                                },
                            }}
                            axis={{
                                x: {
                                    title: '总抽数',
                                },
                                y: {
                                    title: '人数',
                                },
                            }}
                        />
                    ) : (
                        <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                            暂无数据
                        </div>
                    )}
                </Card>
            </Col>

            {/* 2. 累积概率分布 */}
            <Col xs={24} lg={12}>
                <Card title="累积概率分布" size="small">
                    {cumulativeData.length > 0 ? (
                        <Line
                            data={cumulativeData}
                            xField="percentage"
                            yField="draws"
                            height={350}
                            shapeField="smooth"
                            scale={{
                                y: {
                                    domainMin: 0,
                                },
                            }}
                            tooltip={{
                                title: 'percentage',
                                items: [
                                    {
                                        field: 'draws',
                                        name: '所需抽数',
                                        valueFormatter: (value: number) => `${value} 抽`,
                                    },
                                ],
                            }}
                            interaction={{
                                tooltip: {
                                    crosshairs: true,
                                    crosshairsStroke: '#666',
                                    crosshairsLineDash: [4, 4],
                                    marker: true,
                                    markerType: 'hollow',
                                    render: (_event: any, { title, items }: any) => {
                                        if (!items || items.length === 0) return '';
                                        const item = items[0];
                                        if (!item) return '';

                                        const percentage = parseFloat(title) || 0;
                                        const draws = item.value || 0;

                                        return `
                        <div style="line-height: 1.6;">有 <span style="color: #90832fff; font-weight: bold; font-size: 16px;">${percentage.toFixed(1)}%</span> 的玩家在</div>
                        <div style="line-height: 1.6;"><span style="color: #90832fff; font-weight: bold; font-size: 16px;">${draws}</span> 次抽卡内完成目标</div>
                    `;
                                    },
                                },
                            }}
                            style={{
                                lineWidth: 2,
                                stroke: '#1890ff',
                            }}
                            axis={{
                                x: {
                                    title: '累积概率 (%)',
                                    min: 0,
                                    max: 100,
                                    tickCount: 11,
                                },
                                y: {
                                    title: '所需抽数',
                                    min: 0,
                                },
                            }}
                        />
                    ) : (
                        <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                            暂无数据
                        </div>
                    )}
                </Card>
            </Col>

            {/* 3. 干员获取统计 */}
            <Col xs={24} lg={12}>
                <Card title="干员获取统计" size="small">
                    {characterData.length > 0 ? (
                        <Column
                            data={characterData}
                            xField="name"
                            yField="scaledValue" // 使用缩放值进行显示
                            height={350}
                            colorField="type" // 使用 colorField 来指定颜色分组字段
                            group={true} // 使用 group 而不是 isGroup
                            scale={{
                                color: {
                                    range : ['#1890ff', '#ff7875']
                                }
                            }}
                            label={{
                                position: 'top',
                                formatter: (datum: any) => {
                                    // 显示原始值而非缩放值
                                    if (!datum || datum.value === undefined) return '';
                                    const value = datum.value;
                                    const type = datum.type;
                                    
                                    if (type === '每100抽出货个数') {
                                        return `${value}个`;
                                    } else if (type === '平均每目标所需抽数') {
                                        return `${value}抽`;
                                    }
                                    return value.toString();
                                },
                            }}
                            interaction={{
                                tooltip: {
                                    render: (_event: any, { title }: any) => {
                                        if (!title) return '';
                                        
                                        const characterName = title || '未知角色';
                                        
                                        // 查找该角色的所有数据
                                        const characterAllData = characterData.filter(d => d.name === characterName);
                                        const per100Data = characterAllData.find(d => d.type === '每100抽出货个数');
                                        const avgDrawsData = characterAllData.find(d => d.type === '平均每目标所需抽数');
                                        
                                        let content = `<div style="padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px; background: white;">`;
                                        content += `<div style="font-weight: bold; margin-bottom: 6px;">${characterName}</div>`;
                                        
                                        if (per100Data) {
                                            const targetInfo = per100Data.target > 0 ? ` (目标: ${per100Data.target})` : '';
                                            content += `<div style="color: #666; margin-bottom: 2px;">每100抽出货: <span style="color: #1890ff; font-weight: bold;">${per100Data.value}个</span>${targetInfo}</div>`;
                                        }
                                        
                                        if (avgDrawsData) {
                                            content += `<div style="color: #666;">平均每目标所需: <span style="color: #ff7875; font-weight: bold;">${avgDrawsData.value}抽</span></div>`;
                                        }
                                        
                                        content += `</div>`;
                                        
                                        return content;
                                    },
                                },
                            }}
                            legend={{
                                position: 'top',
                            }}
                            axis={{
                                x: {
                                    title: '角色名称',
                                },
                                y: {
                                    title: '相对值 (%)',
                                    label: null, // 隐藏Y轴标签，因为是相对值
                                },
                            }}
                        />
                    ) : (
                        <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                            暂无数据
                        </div>
                    )}
                </Card>
            </Col>

            <Col span={24}>
                <div style={{ padding: 12, background: '#f6f8fa', borderRadius: 6 }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                        <strong>说明:</strong> 以上图表展示了抽卡模拟的核心统计数据。直方图显示抽数分布，累积概率图帮助评估达成目标的可能性，
                        干员统计图展示各角色的获得情况。鼠标悬停可查看详细数据。
                    </Text>
                </div>
            </Col>
        </Row>
    );
};

export default FrequencyDistribution;
