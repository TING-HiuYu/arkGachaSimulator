/**
 * GPU计算管理器 - 基于差值矩阵运算优化
 * 使用出货概率表和权重表，通过纯矩阵差值计算实现高效并行
 * GPU生成差值矩阵(概率-随机数)，CPU进行正负判断和目标验证
 * 避免GPU内IF操作，提升并行计算效率
 */

interface GPUSimulationConfig {
    basePity: number;
    maxPity: number;
    operatorCount: number;
}

interface OperatorInfo {
    name: string;
    weight: number;
}

interface OperatorConfig {
    operators: OperatorInfo[];
    maxDraws: number;
    basePity?: number;
}

interface GPUBatchResult {
    drawsResults: Float32Array; // 抽数差值矩阵 (概率-随机数的差值，正数表示出货)
    operatorResults: Float32Array; // 干员差值矩阵 (CDF-随机数的差值，最大正数表示选中)
    batchSize: number; // 实际批次大小
}

interface ProbabilityLookupTable {
    gachaTable: Float32Array; // A[0..99] 出货概率表 (单精度)
    operatorWeights: Float32Array; // 干员权重表 (单精度)
    maxPity: number;
    operatorCount: number;
}

export class GPUManager {
    private device: GPUDevice | null = null;
    private adapter: GPUAdapter | null = null;
    private computePipeline: GPUComputePipeline | null = null;
    private isInitialized = false;
    private maxBatchSize = 10000; // 每批次最大计算量
    private probabilityLookupTable: ProbabilityLookupTable | null = null; // 概率查找表

    constructor() {
        // 概率查找表将在需要时根据实际配置构建
    }

    /**
     * 构建概率查找表 - 出货概率表和干员权重表
     */
    /**
     * 构建概率查找表 - 支持动态basePity和干员配置
     * @param basePity 基础保底值（默认0）
     * @param operatorConfig 干员配置（可选，如果提供则使用实际干员权重）
     */
    private buildProbabilityLookupTable(basePity: number = 0, operatorConfig?: OperatorConfig): void {
        const maxPity = 100;
        const operatorCount = operatorConfig ? operatorConfig.operators.length : 8; // 使用实际干员数量或默认8个

        console.log(`[GPU] 开始构建概率查找表 (basePity: ${basePity})`);

        // 构建PMF
        const pmf = new Float32Array(maxPity);
        let survival = 1.0;  // 存活概率

        // 前50抽
        for (let pity = 0; pity < 50; pity++) {
            const p = 0.02;
            pmf[pity] = survival * p;
            survival *= (1 - p);
        }

        // 50-99抽
        for (let pity = 50; pity < 99; pity++) {
            const p = Math.min(1.0, 0.02 + 0.02 * (pity - 48));
            pmf[pity] = survival * p;
            survival *= (1 - p);
        }

        // 第100抽
        pmf[99] = survival;

        // 构建CDF
        const cdf = new Float32Array(maxPity);
        cdf[0] = pmf[0];

        for (let i = 1; i < maxPity; i++) {
            cdf[i] = cdf[i - 1] + pmf[i];
        }

        // 归一化
        const total = cdf[maxPity - 1];
        for (let i = 0; i < maxPity; i++) {
            cdf[i] /= total;
        }

        const gachaTable = cdf;

        if (basePity > 0) {
            const normalizationFactor = 1 - gachaTable[basePity - 1];

            // 使用匿名函数直接对gachaTable进行归一化
            gachaTable.set(
                ((slice: Float32Array, factor: number): Float32Array => {
                    const result = new Float32Array(slice.length);
                    for (let i = 0; i < slice.length; i++) {
                        result[i] = slice[i] / factor;
                    }
                    return result;
                })(gachaTable.slice(basePity, maxPity), normalizationFactor),
                basePity
            );
        }

        // 根据OperatorConfig构建干员权重CDF
        // 确保至少有足够的空间存储所有干员权重
        const actualOperatorCount = operatorConfig ? operatorConfig.operators.length : 8;
        const operatorWeights = new Float32Array(actualOperatorCount);
        
        if (operatorConfig && operatorConfig.operators.length > 0) {
            // 从OperatorConfig生成真实的权重CDF
            console.log('[GPU] 从OperatorConfig构建干员权重');
            console.log('[GPU] 干员配置:', operatorConfig.operators.map(op => `${op.name}: ${op.weight}`));
            
            // 步骤1: 权重归一化生成PMF
            const totalWeight = operatorConfig.operators.reduce((sum, op) => sum + op.weight, 0);
            const pmf = new Float32Array(operatorCount);
            
            for (let i = 0; i < operatorConfig.operators.length; i++) {
                pmf[i] = operatorConfig.operators[i].weight / totalWeight;
            }
            
            console.log('[GPU] 干员PMF:', Array.from(pmf.slice(0, operatorConfig.operators.length)));
            
            // 步骤2: PMF → CDF构建查找表
            operatorWeights[0] = pmf[0];
            for (let i = 1; i < operatorConfig.operators.length; i++) {
                operatorWeights[i] = operatorWeights[i - 1] + pmf[i];
            }
            
            // 确保最后一个CDF值为1.0（处理浮点精度问题）
            if (operatorConfig.operators.length > 0) {
                operatorWeights[operatorConfig.operators.length - 1] = 1.0;
            }
            
            // 剩余位置填充1.0以保持缓冲区结构一致性
            for (let i = operatorConfig.operators.length; i < operatorWeights.length; i++) {
                operatorWeights[i] = 1.0;
            }
            
            console.log('[GPU] 从OperatorConfig生成的CDF:', Array.from(operatorWeights));
        } else {
            // 默认均等权重的CDF: [1/n, 2/n, 3/n, ..., 1.0]
            console.log('[GPU] 使用默认均等权重CDF');
            const defaultOperatorCount = 8;
            const equalWeight = 1.0 / defaultOperatorCount;
            for (let i = 0; i < defaultOperatorCount; i++) {
                operatorWeights[i] = (i + 1) * equalWeight;
            }
            // 确保最后一个值为1.0
            operatorWeights[defaultOperatorCount - 1] = 1.0;
            console.log('[GPU] 默认CDF查找表:', Array.from(operatorWeights.slice(0, 8)));
        }

        this.probabilityLookupTable = {
            gachaTable,
            operatorWeights,
            maxPity,
            operatorCount: operatorCount // 使用实际干员数量，不强制设为8
        };

        console.log(`[GPU] 概率查找表构建完成 - 出货表: ${maxPity} 项, 干员表: ${operatorCount} 项`);

        // 调试输出：查找表内容
        console.log('[GPU] 出货概率查找表');
        console.log('[GPU] 前10抽概率:', Array.from(gachaTable.slice(0, 10)));
        console.log('[GPU] 第45-55抽概率:', Array.from(gachaTable.slice(45, 55)));
        console.log('[GPU] 第90-100抽概率:', Array.from(gachaTable.slice(90, 100)));

        console.log('[GPU] 干员权重表');
        if (operatorConfig) {
            console.log(`[GPU] 实际干员CDF (${operatorConfig.operators.length}个):`, Array.from(operatorWeights.slice(0, operatorConfig.operators.length)));
        } else {
            console.log('[GPU] 默认CDF查找表 (8个):', Array.from(operatorWeights.slice(0, 8)));
        }
    }

    /**
     * 检测GPU支持情况
     */
    public async checkGPUSupport(): Promise<{
        supported: boolean;
        info?: {
            vendor: string;
            architecture: string;
            device: string;
            maxWorkgroupSize: number;
            maxBatchSize: number;
        };
    }> {
        console.log('[GPU] 检测GPU支持状态');

        if (!('gpu' in navigator)) {
            console.log('[GPU] 浏览器不支持WebGPU');
            return { supported: false };
        }

        try {
            const adapter = await navigator.gpu?.requestAdapter({
                powerPreference: 'high-performance'
            });

            if (!adapter) {
                console.log('[GPU] 无法获取GPU适配器');
                return { supported: false };
            }

            // 获取适配器信息 - 使用兼容性检查
            let adapterInfo: any = {};
            try {
                // 尝试新的API
                if ('requestAdapterInfo' in adapter) {
                    adapterInfo = await (adapter as any).requestAdapterInfo();
                } else if ('info' in adapter) {
                    // 一些浏览器可能使用 info 属性
                    adapterInfo = (adapter as any).info;
                } else {
                    // 如果没有信息API，使用默认值
                    adapterInfo = {
                        vendor: 'Unknown',
                        architecture: 'Unknown',
                        device: 'Unknown',
                        description: 'WebGPU Adapter'
                    };
                }
            } catch (infoError) {
                console.log('[GPU] 获取适配器信息失败，使用默认信息:', infoError);
                adapterInfo = {
                    vendor: 'Unknown',
                    architecture: 'Unknown',
                    device: 'Unknown',
                    description: 'WebGPU Adapter'
                };
            }

            const limits = adapter.limits;

            // 根据GPU限制调整批次大小
            const maxWorkgroupSize = limits.maxComputeWorkgroupSizeX;
            this.maxBatchSize = Math.min(50000, maxWorkgroupSize * 100);

            console.log('[GPU] 检测完成:', {
                vendor: adapterInfo.vendor || 'Unknown',
                architecture: adapterInfo.architecture || 'Unknown',
                device: adapterInfo.device || 'Unknown',
                maxWorkgroupSize,
                maxBatchSize: this.maxBatchSize
            });

            return {
                supported: true,
                info: {
                    vendor: adapterInfo.vendor || 'Unknown',
                    architecture: adapterInfo.architecture || 'Unknown',
                    device: adapterInfo.device || 'Unknown',
                    maxWorkgroupSize,
                    maxBatchSize: this.maxBatchSize
                }
            };
        } catch (error) {
            console.log('[GPU] 检测失败:', error);
            return { supported: false };
        }
    }

    /**
     * 初始化GPU设备和管线
     */
    public async initialize(): Promise<boolean> {
        if (this.isInitialized) return true;

        try {
            if (!('gpu' in navigator)) {
                return false;
            }

            this.adapter = await navigator.gpu?.requestAdapter({
                powerPreference: 'high-performance'
            }) || null;

            if (!this.adapter) {
                console.log('[GPU] 适配器获取失败');
                return false;
            }

            this.device = await this.adapter.requestDevice({
                requiredLimits: {
                    maxComputeWorkgroupStorageSize: this.adapter.limits.maxComputeWorkgroupStorageSize,
                    maxComputeInvocationsPerWorkgroup: this.adapter.limits.maxComputeInvocationsPerWorkgroup
                }
            });

            if (!this.device) {
                console.log('[GPU] 设备创建失败');
                return false;
            }

            await this.createComputePipeline();
            this.isInitialized = true;
            console.log('[GPU] 初始化完成');
            return true;

        } catch (error) {
            console.error('[GPU] 初始化过程出错:', error);
            return false;
        }
    }

    /**
     * 创建计算管线 - 使用纯矩阵差值运算
     */
    private async createComputePipeline(): Promise<void> {
        if (!this.device) {
            throw new Error('GPU设备未初始化');
        }
        
        // 如果概率查找表不存在，使用默认配置构建
        if (!this.probabilityLookupTable) {
            console.log('[GPU] 概率查找表不存在，使用默认配置构建');
            this.buildProbabilityLookupTable(0); // 使用默认basePity=0
        }

        // 优化的WebGPU着色器代码 - 纯矩阵运算，避免IF操作
        const computeShaderCode = `
      @group(0) @binding(0) var<storage, read_write> drawsResults: array<f32>;
      @group(0) @binding(1) var<storage, read_write> operatorResults: array<f32>;
      @group(0) @binding(2) var<storage, read> config: array<f32>;
      @group(0) @binding(3) var<storage, read> randomNumbers: array<f32>;
      @group(0) @binding(4) var<storage, read> gachaTable: array<f32>;
      @group(0) @binding(5) var<storage, read> operatorWeights: array<f32>; // 存储干员CDF查找表

      // 纯矩阵运算 - 生成出货概率差值矩阵
      // 对每个概率元素减去随机值: result = gachaProb - randomValue
      // 数据布局：每个模拟结果占用(100-basePity)个位置
      fn generateGachaDifferences(basePity: f32, randomK1: f32, resultIndex: u32) {
        let maxPity = u32(config[1]); // 最大保底(100)
        let startPity = u32(basePity); // 基础保底位置
        let drawsPerGroup = u32(config[4]); // 每组实际抽数 = maxPity - basePity
        
        // 对每个有效抽数位置执行 gachaProbability - randomK1
        for (var i: u32 = 0u; i < drawsPerGroup; i++) {
          let actualPity = startPity + i; // 实际保底位置 = basePity + i
          let gachaProbability = gachaTable[actualPity];
          
          // 正数表示出货，负数表示未出货
          let differenceValue = gachaProbability - randomK1;
          
          // 存储到对应模拟的抽卡组中
          drawsResults[resultIndex * drawsPerGroup + i] = differenceValue;
        }
      }

      // 纯矩阵运算 - 生成干员概率差值矩阵  
      // 对每个CDF元素减去随机值: result = cdfValue - randomValue
      // 数据布局：每个模拟结果占用operatorCount个位置
      fn generateOperatorDifferences(randomK2: f32, resultIndex: u32) {
        let operatorCount = u32(config[2]);
        
        // 矩阵运算：对所有干员CDF值减去随机数
        for (var i: u32 = 0u; i < operatorCount; i++) {
          let cdf_value = operatorWeights[i]; // CDF查找表
          
          // 矩阵运算：直接计算差值，避免IF判断和循环查找
          // 正数表示该干员被选中概率范围，最大正数对应选中的干员
          let differenceValue = cdf_value - randomK2;
          
          // 存储到对应模拟的干员组中
          operatorResults[resultIndex * operatorCount + i] = differenceValue;
        }
      }

      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x;
        if (index >= u32(arrayLength(&randomNumbers)) / 2u) {
          return;
        }

        // CPU生成的随机数，每个模拟使用两个随机数
        let randomK1 = randomNumbers[index * 2u];     // K1用于抽卡判断
        let randomK2 = randomNumbers[index * 2u + 1u]; // K2用于干员选择
        
        // 读取配置
        let basePity = config[3]; // 基础保底
        
        // GPU执行纯矩阵差值计算，无IF操作
        // 结果按模拟分组：每个模拟的抽卡结果连续存储，干员结果连续存储
        generateGachaDifferences(basePity, randomK1, index);
        generateOperatorDifferences(randomK2, index);
      }
    `;

        const shaderModule = this.device.createShaderModule({
            code: computeShaderCode,
            label: 'MatrixDifferenceGachaShader'
        });

        // 使用auto布局让WebGPU自动推断绑定组布局
        this.computePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: shaderModule,
                entryPoint: 'main'
            },
            label: 'MatrixDifferenceGachaPipeline'
        });

        console.log('[GPU] 纯矩阵差值计算管线创建完成');
    }

    /**
     * 执行GPU批量模拟 - 使用纯矩阵差值运算
     */
    public async simulateBatch(
        batchSize: number,
        config: GPUSimulationConfig,
        operatorConfig: OperatorConfig
    ): Promise<GPUBatchResult> {
        // 确保GPU已经初始化
        if (!this.isInitialized) {
            console.log('[GPU] 未初始化，开始初始化');
            const initSuccess = await this.initialize();
            if (!initSuccess) {
                throw new Error('GPU初始化失败');
            }
        }
        
        if (!this.device || !this.computePipeline) {
            throw new Error('GPU设备或计算管线未正确初始化');
        }

        // 根据配置重新构建概率查找表（包含干员权重）
        console.log(`[GPU] 重新构建概率查找表 (basePity=${config.basePity})`);
        this.buildProbabilityLookupTable(config.basePity, operatorConfig);
        
        if (!this.probabilityLookupTable) {
            throw new Error('概率查找表构建失败');
        }

        const actualBatchSize = Math.min(batchSize, this.maxBatchSize);
        const maxPity = this.probabilityLookupTable.maxPity;
        const operatorCount = this.probabilityLookupTable.operatorCount;
        const basePity = config.basePity;
        const drawsPerGroup = maxPity - basePity; // 每组的实际抽数数量

        // 创建结果缓冲区 - 单精度浮点型
        // 抽卡结果：每个模拟占用 (100-basePity) 个位置
        // 干员结果：每个模拟占用 operatorCount 个位置
        const drawsResultSize = actualBatchSize * drawsPerGroup * 4; // f32 = 4 bytes
        const operatorResultSize = actualBatchSize * operatorCount * 4; // f32 = 4 bytes

        const drawsResultBuffer = this.device.createBuffer({
            size: drawsResultSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            label: 'DrawsResultBuffer'
        });

        const operatorResultBuffer = this.device.createBuffer({
            size: operatorResultSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            label: 'OperatorResultBuffer'
        });

        // 创建配置缓冲区 - 使用Float32Array而非Uint32Array
        const configBuffer = this.device.createBuffer({
            mappedAtCreation: true,
            size: 20, // 5个f32参数
            usage: GPUBufferUsage.STORAGE,
            label: 'ConfigBuffer'
        });

        const configArrayBuffer = configBuffer.getMappedRange();
        const configData = new Float32Array(configArrayBuffer);
        configData[0] = actualBatchSize;
        configData[1] = maxPity; // 最大保底(100)
        configData[2] = operatorCount;
        configData[3] = basePity; // 基础保底
        configData[4] = drawsPerGroup; // 每组实际抽数 = maxPity - basePity
        configBuffer.unmap();

        // 调试：输出传递给GPU的配置参数
        console.log('[GPU] 配置参数');
        console.log(`[GPU] actualBatchSize: ${actualBatchSize}, maxPity: ${maxPity}, operatorCount: ${operatorCount}, basePity: ${basePity}, drawsPerGroup: ${drawsPerGroup}`);
        console.log(`[GPU] operatorConfig.operators.length: ${operatorConfig.operators.length}`);
        console.log(`[GPU] this.probabilityLookupTable.operatorCount: ${this.probabilityLookupTable.operatorCount}`);

        // CPU生成随机数 - 每个模拟需要2个随机数[0,1]
        const randomCount = actualBatchSize * 2;
        const randomBuffer = this.device.createBuffer({
            mappedAtCreation: true,
            size: randomCount * 4, // Float32
            usage: GPUBufferUsage.STORAGE,
            label: 'RandomNumberBuffer'
        });

        const randomArrayBuffer = randomBuffer.getMappedRange();
        const randomNumbers = new Float32Array(randomArrayBuffer);

        // CPU生成[0,1]范围的随机数并保存副本用于调试
        const randomNumbersCopy = new Float32Array(randomCount);
        for (let i = 0; i < randomCount; i++) {
            const randomValue = Math.random();
            randomNumbers[i] = randomValue;
            randomNumbersCopy[i] = randomValue; // 保存副本
        }

        randomBuffer.unmap();

        // 创建查找表缓冲区
        const gachaTableBuffer = this.device.createBuffer({
            mappedAtCreation: true,
            size: this.probabilityLookupTable.gachaTable.byteLength,
            usage: GPUBufferUsage.STORAGE,
            label: 'GachaTableBuffer'
        });

        const gachaTableArrayBuffer = gachaTableBuffer.getMappedRange();
        new Float32Array(gachaTableArrayBuffer).set(this.probabilityLookupTable.gachaTable);
        gachaTableBuffer.unmap();

        const operatorWeightsBuffer = this.device.createBuffer({
            mappedAtCreation: true,
            size: this.probabilityLookupTable.operatorWeights.byteLength,
            usage: GPUBufferUsage.STORAGE,
            label: 'OperatorWeightsBuffer'
        });

        const operatorWeightsArrayBuffer = operatorWeightsBuffer.getMappedRange();
        new Float32Array(operatorWeightsArrayBuffer).set(this.probabilityLookupTable.operatorWeights);
        operatorWeightsBuffer.unmap();

        // 创建读取缓冲区
        const drawsReadBuffer = this.device.createBuffer({
            size: drawsResultSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            label: 'DrawsReadBuffer'
        });

        const operatorReadBuffer = this.device.createBuffer({
            size: operatorResultSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            label: 'OperatorReadBuffer'
        });

        try {
            // 创建绑定组
            const bindGroup = this.device.createBindGroup({
                layout: this.computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: drawsResultBuffer } },
                    { binding: 1, resource: { buffer: operatorResultBuffer } },
                    { binding: 2, resource: { buffer: configBuffer } },
                    { binding: 3, resource: { buffer: randomBuffer } },
                    { binding: 4, resource: { buffer: gachaTableBuffer } },
                    { binding: 5, resource: { buffer: operatorWeightsBuffer } }
                ],
                label: 'MatrixDifferenceBindGroup'
            });

            // 执行计算
            const commandEncoder = this.device.createCommandEncoder({
                label: 'MatrixDifferenceCommandEncoder'
            });

            const computePass = commandEncoder.beginComputePass({
                label: 'MatrixDifferenceComputePass'
            });

            computePass.setPipeline(this.computePipeline);
            computePass.setBindGroup(0, bindGroup);

            // 计算工作组数量
            const workgroupSize = 64;
            const workgroups = Math.ceil(actualBatchSize / workgroupSize);
            computePass.dispatchWorkgroups(workgroups);
            computePass.end();

            // 复制结果到可读缓冲区
            commandEncoder.copyBufferToBuffer(
                drawsResultBuffer, 0,
                drawsReadBuffer, 0,
                drawsResultSize
            );

            commandEncoder.copyBufferToBuffer(
                operatorResultBuffer, 0,
                operatorReadBuffer, 0,
                operatorResultSize
            );

            // 提交命令并等待完成
            this.device.queue.submit([commandEncoder.finish()]);

            // 读取结果
            await drawsReadBuffer.mapAsync(GPUMapMode.READ);
            await operatorReadBuffer.mapAsync(GPUMapMode.READ);

            const drawsArrayBuffer = drawsReadBuffer.getMappedRange();
            const operatorArrayBuffer = operatorReadBuffer.getMappedRange();

            // GPU返回的是f32格式的差值，直接读取为Float32Array并立即复制
            const drawsResults = new Float32Array(drawsArrayBuffer).slice(); // 立即复制，避免detached buffer
            const operatorResults = new Float32Array(operatorArrayBuffer).slice(); // 立即复制，避免detached buffer

            drawsReadBuffer.unmap();
            operatorReadBuffer.unmap();

            return {
                drawsResults,
                operatorResults,
                batchSize: actualBatchSize // 使用实际批次大小
            };

        } finally {
            // 清理所有缓冲区
            drawsResultBuffer.destroy();
            operatorResultBuffer.destroy();
            configBuffer.destroy();
            randomBuffer.destroy();
            gachaTableBuffer.destroy();
            operatorWeightsBuffer.destroy();
            drawsReadBuffer.destroy();
            operatorReadBuffer.destroy();
        }
    }

    /**
     * 执行一批出货模拟 - 吃满GPU缓存的90%
     * @param operatorConfig 干员配置 {name: {weight: number, target: number}}
     * @param basePity 基础保底
     * @returns 模拟结果列表 [{name: string, draws: number}, ...]
     */
    /**
     * 执行一批出货模拟，这批模拟会吃满可用缓存*0.90，然后返回一个list : {[name:str, draws:int] * n}
     * @param operatorConfig 干员配置，应该包含operators数组和maxDraws等信息
     * @returns 模拟结果数组，每个元素包含干员名称和抽数
     */
    public async runSimulation(operatorConfig: OperatorConfig): Promise<Array<{name: string, draws: number}>> {
        console.log('[GPU] 执行单批次GPU模拟，90%内存利用率');
        
        // 确保GPU已经初始化
        if (!this.isInitialized) {
            console.log('[GPU] 未初始化，开始初始化');
            const initSuccess = await this.initialize();
            if (!initSuccess) {
                throw new Error('GPU初始化失败');
            }
        }
        
        // 确保概率查找表已构建
        if (!this.probabilityLookupTable) {
            console.log('[GPU] 概率查找表未构建，开始构建');
            this.buildProbabilityLookupTable(operatorConfig.basePity || 0, operatorConfig);
        }
        
        // 重新创建计算管线以确保使用最新的概率表
        await this.createComputePipeline();
        
        try {
            // 确保设备存在
            if (!this.device) {
                throw new Error('GPU设备未初始化');
            }
            
            // 计算90%内存利用率下的批次大小
            const memoryInfo = this.device.limits;
            const maxBufferSize = memoryInfo.maxStorageBufferBindingSize * 0.9; // 90%内存利用率
            
            // 计算单次模拟需要的内存
            const bytesPerFloat = 4; // f32
            const configBasePity = operatorConfig.basePity || 0;
            const configDrawsPerGroup = operatorConfig.maxDraws - configBasePity; // 实际每组抽数
            const bytesPerSimulation = (
                configDrawsPerGroup * bytesPerFloat + // drawsResults：每个模拟占用(100-basePity)个位置
                operatorConfig.operators.length * bytesPerFloat // operatorResults：每个模拟占用operatorCount个位置
            );
            
            // 计算最大批次大小
            const maxBatchSize = Math.floor(maxBufferSize / bytesPerSimulation);
            const targetBatchSize = Math.min(maxBatchSize, 10000); // 限制最大批次为10000
            
            console.log(`[GPU] 计算的批次大小: ${targetBatchSize}, 单次模拟内存: ${bytesPerSimulation} bytes`);
            
            // 转换为GPU模拟配置
            const gpuConfig: GPUSimulationConfig = {
                basePity: operatorConfig.basePity || 0,
                maxPity: operatorConfig.maxDraws,
                operatorCount: operatorConfig.operators.length
            };
            
            // 执行单批次GPU模拟 - 现在干员权重会在simulateBatch中自动处理
            const result = await this.simulateBatch(targetBatchSize, gpuConfig, operatorConfig);
            
            // CPU处理GPU差值矩阵结果：正数表示出货/选中，负数表示未出货/未选中
            const simulationResults: Array<{name: string, draws: number}> = [];
            
            // 根据basePity和operatorCount预处理数据分组
            const basePity = operatorConfig.basePity || 0;
            const operatorCount = operatorConfig.operators.length;
            const drawsPerGroup = 100 - basePity; // 每组的抽数数量（从basePity开始到100抽）
            
            console.log(`[GPU] 开始处理GPU结果 - basePity: ${basePity}, operatorCount: ${operatorCount}, drawsPerGroup: ${drawsPerGroup}`);
            console.log(`[GPU] 总批次大小: ${result.batchSize}`);
            console.log(`[GPU] drawsResults长度: ${result.drawsResults.length}, operatorResults长度: ${result.operatorResults.length}`);
            console.log(`[GPU] 预期drawsResults长度: ${result.batchSize * drawsPerGroup}, 预期operatorResults长度: ${result.batchSize * operatorCount}`);

            // 调试：检查前几个干员结果的原始数据
            console.log('[GPU] 原始干员数据检查');
            for (let i = 0; i < Math.min(3, result.batchSize); i++) {
                const startIdx = i * operatorCount;
                const endIdx = startIdx + operatorCount;
                const rawData = Array.from(result.operatorResults.slice(startIdx, endIdx));
                console.log(`[GPU] 模拟 #${i} 原始干员数据 [${startIdx}-${endIdx-1}]: [${rawData.map(v => v.toFixed(3)).join(', ')}]`);
            }

            for (let i = 0; i < result.batchSize; i++) {
                // 1. 处理抽卡结果 - 每(100-basePity)个为一组
                const drawsGroupStartIdx = i * drawsPerGroup;
                const drawsGroup = Array.from(result.drawsResults.slice(drawsGroupStartIdx, drawsGroupStartIdx + drawsPerGroup));
                
                // 2. 处理干员结果 - 每operatorCount个为一组  
                const operatorGroupStartIdx = i * operatorCount;
                const operatorGroup = Array.from(result.operatorResults.slice(operatorGroupStartIdx, operatorGroupStartIdx + operatorCount));
                
                // 3. 在抽卡组中查找第一个出货位置（第一个正数差值）
                let firstHitDraw = -1;
                for (let drawIdx = 0; drawIdx < drawsGroup.length; drawIdx++) {
                    const differenceValue = drawsGroup[drawIdx];
                    
                    // 正数表示出货
                    if (differenceValue >= 0) {
                        firstHitDraw = basePity + drawIdx + 1; // 实际抽数 = basePity + 组内位置 + 1
                        break;
                    }
                }
                
                // 4. 在干员组中查找选中的干员（最大正数差值）
                let selectedOperatorName = '';
                if (firstHitDraw > 0) {
                    let selectedOperatorIdx = -1;
                    
                    for (let opIdx = 0; opIdx < operatorGroup.length; opIdx++) {
                        const diffValue = operatorGroup[opIdx];
                        if (diffValue > 0) {
                            selectedOperatorIdx = opIdx;
                            break; // 找到第一个正数就停止
                        }
                    }
                    
                    if (selectedOperatorIdx >= 0) {
                        selectedOperatorName = operatorConfig.operators[selectedOperatorIdx].name;
                    }
                }
                
                // 5. 记录有效的模拟结果
                if (firstHitDraw > 0 && selectedOperatorName) {
                    simulationResults.push({
                        name: selectedOperatorName,
                        draws: firstHitDraw
                    });
                }
                
                // 调试输出（仅前几个结果）
                if (i < 10) {
                    console.log(`[GPU] 模拟 #${i}: 抽卡组前5个[${drawsGroup.slice(0, 5).map(v => v.toFixed(3)).join(', ')}...], 干员组[${operatorGroup.map(v => v.toFixed(3)).join(', ')}]`);
                    console.log(`[GPU] 模拟 #${i}: 第${firstHitDraw}抽出货，选中${selectedOperatorName}`);
                }
            }
            
            console.log(`[GPU] 处理完成，返回${simulationResults.length}个模拟结果`);
            
            return simulationResults;
            
        } catch (error) {
            console.error('[GPU] runSimulation执行失败:', error);
            throw error;
        }
    }

    /**
     * 获取GPU性能基准测试
     */
    public async benchmark(testSize: number = 10000): Promise<{
        gpuTime: number;
        avgPerSimulation: number;
        simulationsPerSecond: number;
    }> {
        if (!this.isInitialized) {
            throw new Error('GPU未初始化');
        }

        console.log(`[GPU] 开始基准测试 - ${testSize} 次模拟`);

        // 创建测试用的操作员配置
        const testConfig: OperatorConfig = {
            operators: [
                { name: 'testOp1', weight: 0.7 },
                { name: 'testOp2', weight: 0.3 }
            ],
            maxDraws: 100,
            basePity: 0
        };

        const startTime = performance.now();
        await this.runSimulation(testConfig);
        const endTime = performance.now();

        const totalTime = endTime - startTime;
        const avgPerSimulation = totalTime / testSize;
        const simulationsPerSecond = 1000 / avgPerSimulation;

        console.log(`[GPU] 基准测试结果:
      总时间: ${totalTime.toFixed(2)}ms
      平均每次: ${avgPerSimulation.toFixed(4)}ms
      每秒模拟: ${simulationsPerSecond.toFixed(0)} 次`);

        return {
            gpuTime: totalTime,
            avgPerSimulation,
            simulationsPerSecond
        };
    }

    /**
     * 获取最大批次大小
     */
    public getMaxBatchSize(): number {
        return this.maxBatchSize;
    }

    /**
     * 检查GPU是否可用
     */
    public isAvailable(): boolean {
        return this.isInitialized;
    }

    /**
     * 销毁GPU资源
     */
    public destroy(): void {
        if (this.device) {
            this.device.destroy();
        }
        this.device = null;
        this.adapter = null;
        this.computePipeline = null;
        this.isInitialized = false;
        console.log('[GPU] 资源已清理');
    }
}
