import React from 'react';
import {
  Card,
  Form,
  InputNumber,
  Button,
  Space,
  Select,
  Input,
  Row,
  Col,
  Typography,
  Switch,
  Progress,
  Alert,
  Popconfirm,
  Divider
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface OperatorConfig {
  [key: string]: {
    weight: number;
    target: number;
  };
}

interface ConfigPanelProps {
  operatorConfig: OperatorConfig;
  setOperatorConfig: (config: OperatorConfig) => void;
  basePity: number;
  setBasePity: (pity: number) => void;
  simulationCount: number;
  setSimulationCount: (count: number) => void;
  isSimulating: boolean;
  isProcessingData?: boolean;
  processingStatus?: string; // 新增：处理状态详情
  progress: number;
  onRunSimulation: () => void;
  useMultiThreading: boolean;
  onUseMultiThreadingChange: (checked: boolean) => void;
  useGPUAcceleration?: boolean;
  onUseGPUAccelerationChange?: (checked: boolean) => void;
  gpuAvailable?: boolean;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({
  operatorConfig,
  setOperatorConfig,
  basePity,
  setBasePity,
  simulationCount,
  setSimulationCount,
  isSimulating,
  isProcessingData = false,
  processingStatus = '',
  progress,
  onRunSimulation,
  useMultiThreading,
  onUseMultiThreadingChange,
  useGPUAcceleration = false,
  onUseGPUAccelerationChange,
  gpuAvailable = false,
}) => {
  // 追踪模拟次数输入框的聚焦状态
  const [isSimulationCountFocused, setIsSimulationCountFocused] = React.useState(false);

  // 计算是否应该禁用所有控件
  const isDisabled = isSimulating;

  // 预设配置
  const presetConfigs: { [key: string]: OperatorConfig } = {
    "联合毒池": {
      "干员1": { weight: 1, target: 6 },
      "干员2": { weight: 1, target: 0 },
      "干员3": { weight: 1, target: 0 },
      "干员4": { weight: 1, target: 0 },
    },
    "双UP": {
      "主UP": { weight: 1, target: 0 },
      "副UP": { weight: 1, target: 0 },
      "其它": { weight: 2, target: 0 },
    },
    "限定寻访": {
      "限定干员": { weight: 7, target: 6 },
      "陪跑": { weight: 7, target: 6 },
      "其他干员": { weight: 6, target: 0 },
    },
  };

  const applyPreset = (presetName: string) => {
    if (presetConfigs[presetName]) {
      setOperatorConfig(presetConfigs[presetName]);
    }
  };

  const addOperator = () => {
    const newName = `干员${Object.keys(operatorConfig).length + 1}`;
    setOperatorConfig({
      ...operatorConfig,
      [newName]: { weight: 1, target: 0 }
    });
  };

  const updateOperator = (oldName: string, newName: string, weight: number, target: number) => {
    const newConfig = { ...operatorConfig };
    if (oldName !== newName) {
      delete newConfig[oldName];
    }
    newConfig[newName] = { weight, target };
    setOperatorConfig(newConfig);
  };

  const removeOperator = (name: string) => {
    if (Object.keys(operatorConfig).length <= 1) return;
    const newConfig = { ...operatorConfig };
    delete newConfig[name];
    setOperatorConfig(newConfig);
  };

  return (
    <Card title="模拟配置">
      <Form layout="vertical">
        <Form.Item label="模拟次数 - 支持科学计数法 格式: (底数)e(乘以十的n次方)">
          <InputNumber
            min={100}
            max={100000000}
            step={1000}
            value={simulationCount}
            disabled={isDisabled}
            onChange={(value) => {
              // 只有在失去焦点或者输入有效值时才设置默认值
              if (value !== null && value !== undefined) {
                setSimulationCount(value);
              } else if (!isSimulationCountFocused) {
                setSimulationCount(10000);
              }
              // 在聚焦状态下，允许空值以便用户输入
            }}
            onFocus={() => setIsSimulationCountFocused(true)}
            onBlur={() => {
              setIsSimulationCountFocused(false);
              // 失去焦点时如果值为空则设置默认值
              if (simulationCount === null || simulationCount === undefined) {
                setSimulationCount(10000);
              }
            }}
            style={{ width: '100%' }}
            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          />
          {simulationCount > 500000 && (
            <Text type="warning" style={{ fontSize: '12px', marginTop: '4px', display: 'block' }}>
              你设太大有可能内存不足，程序是本地运行的，所以说别想着炸服务器 <br />
              建议开启GPU加速以提升性能
            </Text>
          )}
        </Form.Item>

        {/* <Form.Item label="已累计未出6星抽数">
          <InputNumber
            min={0}
            max={99}
            value={basePity}
            disabled={isDisabled}
            onChange={(value) => setBasePity(value || 0)}
            style={{ width: '100%' }}
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            明日方舟50抽后开始增加概率，99抽必出6星
          </Text>
        </Form.Item> */}

        <Divider />

        <Form.Item label="预设模板">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select
              placeholder="选择预设模板"
              style={{ width: '100%' }}
              disabled={isDisabled}
              onChange={applyPreset}
              allowClear
            >
              {Object.keys(presetConfigs).map(presetName => (
                <Select.Option key={presetName} value={presetName}>
                  {presetName}
                </Select.Option>
              ))}
            </Select>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              选择预设模板可以快速配置常见的抽卡场景
            </Text>
          </Space>
        </Form.Item>

        <Form.Item label="干员配置">
          <Space direction="vertical" style={{ width: '100%' }}>
            {Object.entries(operatorConfig).map(([name, config]) => (
              <Card key={name} size="small" style={{
                backgroundColor: '#fafafa',
                opacity: isDisabled ? 0.6 : 1,
                pointerEvents: isDisabled ? 'none' : 'auto'
              }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Input
                    placeholder="干员名称"
                    value={name}
                    disabled={isDisabled}
                    onChange={(e) => updateOperator(name, e.target.value, config.weight, config.target)}
                  />
                  <Row gutter={8}>
                    <Col span={12}>
                      <InputNumber
                        placeholder="权重"
                        min={1}
                        value={config.weight}
                        disabled={isDisabled}
                        onChange={(value) => updateOperator(name, name, value || 1, config.target)}
                        style={{ width: '100%' }}
                      />
                      <Text type="secondary" style={{ fontSize: '10px' }}>权重</Text>
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        placeholder="目标数量"
                        min={0}
                        value={config.target}
                        disabled={isDisabled}
                        onChange={(value) => updateOperator(name, name, config.weight, value || 0)}
                        style={{ width: '100%' }}
                      />
                      <Text type="secondary" style={{ fontSize: '10px' }}>目标数量</Text>
                    </Col>
                  </Row>
                  {Object.keys(operatorConfig).length > 1 && (
                    <Button
                      type="text"
                      danger
                      size="small"
                      disabled={isDisabled}
                      icon={<DeleteOutlined />}
                      onClick={() => removeOperator(name)}
                    >
                      删除
                    </Button>
                  )}
                </Space>
              </Card>
            ))}

            <Button
              type="dashed"
              onClick={addOperator}
              disabled={isDisabled}
              icon={<PlusOutlined />}
              style={{ width: '100%' }}
            >
              添加干员
            </Button>
          </Space>
        </Form.Item>

        <Form.Item>
          <Switch
            checked={useMultiThreading}
            onChange={onUseMultiThreadingChange}
            disabled={isDisabled}
          />
          <Text style={{ marginLeft: 8 }}>
            {useMultiThreading
              ? `多线程处理 (${Math.max(1, Math.min(Math.floor((navigator.hardwareConcurrency || 4))))} 线程)`
              : '单线程处理'}
          </Text>
        </Form.Item>

        <Form.Item>
          <Switch
            checked={useGPUAcceleration}
            onChange={onUseGPUAccelerationChange}
            disabled={isDisabled || !gpuAvailable}
          />
          <Text style={{ marginLeft: 8 }}>
            {gpuAvailable
              ? (useGPUAcceleration ? 'GPU加速已启用': 'GPU加速已禁用')
              : 'GPU不可用'}
          </Text>
          {gpuAvailable ? useGPUAcceleration ? (
            <Text type="secondary" style={{ fontSize: '12px', marginLeft: 8 }}>
              GPU在大幅加速的同时也会增加一些数据精度下降的风险
            </Text>
          ) : null : (
            <Text type="secondary" style={{ fontSize: '12px', marginLeft: 8 }}>
              需要支持WebGPU的浏览器
            </Text>
          )}
        </Form.Item>

        <Form.Item>
          {processingStatus && (
            <Alert
              message="处理状态"
              description={processingStatus}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* 高风险模拟警告 */}
          {simulationCount >= 100000 && !useGPUAcceleration ? (
            <Popconfirm
              title="大量模拟警告"
              description={
                <div style={{ maxWidth: 300 }}>
                  <p>您即将进行 <strong>{simulationCount.toLocaleString()}</strong> 次模拟，且未开启GPU加速。</p>
                  <p style={{ color: '#ff4d4f', margin: '8px 0' }}>
                    这可能导致浏览器卡死或响应缓慢
                  </p>
                  <p>建议：</p>
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    <li>开启GPU加速（如果支持）</li>
                    <li>或将模拟次数降低至10万以下</li>
                  </ul>
                </div>
              }
              onConfirm={onRunSimulation}
              okText="确认执行"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              placement="top"
            >
              <Button
                type="primary"
                size="large"
                loading={isSimulating}
                disabled={isDisabled}
                style={{ width: '100%' }}
              >
                {isSimulating
                  ? (isProcessingData ? '处理数据中...' : '模拟进行中...')
                  : '开始模拟'}
              </Button>
            </Popconfirm>
          ) : (
            <Button
              type="primary"
              size="large"
              onClick={onRunSimulation}
              loading={isSimulating}
              disabled={isDisabled}
              style={{ width: '100%' }}
            >
              {isSimulating
                ? (isProcessingData ? '处理数据中...' : '模拟进行中...')
                : '开始模拟'}
            </Button>
          )}
          {isSimulating && (
            <><Progress
              percent={Math.round(progress)}
              size="small"
              style={{ marginTop: 8 }}
              status={isProcessingData ? "active" : "normal"} /><Text type="secondary" style={{ fontSize: '12px', marginTop: 4 }}>
                如果长时间卡在0%请尝试刷新网页
              </Text></>
          )}
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ConfigPanel;
