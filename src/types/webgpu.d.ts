/**
 * WebGPU类型声明
 * 为TypeScript提供WebGPU API的类型支持
 */

declare global {
  interface Navigator {
    gpu?: GPU;
  }

  interface GPU {
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  }

  interface GPURequestAdapterOptions {
    powerPreference?: 'low-power' | 'high-performance';
    forceFallbackAdapter?: boolean;
  }

  interface GPUAdapter {
    features: GPUSupportedFeatures;
    limits: GPUSupportedLimits;
    isFallbackAdapter: boolean;
    requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
    requestAdapterInfo(): Promise<GPUAdapterInfo>;
  }

  interface GPUAdapterInfo {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
  }

  interface GPUSupportedFeatures extends Set<string> {}

  interface GPUSupportedLimits {
    maxTextureDimension1D: number;
    maxTextureDimension2D: number;
    maxTextureDimension3D: number;
    maxTextureArrayLayers: number;
    maxBindGroups: number;
    maxDynamicUniformBuffersPerPipelineLayout: number;
    maxDynamicStorageBuffersPerPipelineLayout: number;
    maxSampledTexturesPerShaderStage: number;
    maxSamplersPerShaderStage: number;
    maxStorageBuffersPerShaderStage: number;
    maxStorageTexturesPerShaderStage: number;
    maxUniformBuffersPerShaderStage: number;
    maxUniformBufferBindingSize: number;
    maxStorageBufferBindingSize: number;
    minUniformBufferOffsetAlignment: number;
    minStorageBufferOffsetAlignment: number;
    maxVertexBuffers: number;
    maxVertexAttributes: number;
    maxVertexBufferArrayStride: number;
    maxInterStageShaderComponents: number;
    maxComputeWorkgroupStorageSize: number;
    maxComputeInvocationsPerWorkgroup: number;
    maxComputeWorkgroupSizeX: number;
    maxComputeWorkgroupSizeY: number;
    maxComputeWorkgroupSizeZ: number;
    maxComputeWorkgroupsPerDimension: number;
  }

  interface GPUDeviceDescriptor {
    requiredFeatures?: Iterable<string>;
    requiredLimits?: Record<string, number>;
    defaultQueue?: GPUQueueDescriptor;
  }

  interface GPUQueueDescriptor {
    label?: string;
  }

  interface GPUDevice extends EventTarget {
    features: GPUSupportedFeatures;
    limits: GPUSupportedLimits;
    queue: GPUQueue;
    lost: Promise<GPUDeviceLostInfo>;
    onuncapturederror: ((this: GPUDevice, ev: GPUUncapturedErrorEvent) => any) | null;
    
    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
    createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
    createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler;
    createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
    createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
    createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
    createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
    createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
    createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
    createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
    createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor): GPURenderBundleEncoder;
    
    destroy(): void;
    pushErrorScope(filter: GPUErrorFilter): void;
    popErrorScope(): Promise<GPUError | null>;
  }

  interface GPUBuffer {
    size: number;
    usage: number;
    mapState: GPUBufferMapState;
    
    mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
    getMappedRange(offset?: number, size?: number): ArrayBuffer;
    unmap(): void;
    destroy(): void;
  }

  interface GPUBufferDescriptor {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
    label?: string;
  }

  interface GPUTexture {
    width: number;
    height: number;
    depthOrArrayLayers: number;
    mipLevelCount: number;
    sampleCount: number;
    dimension: GPUTextureDimension;
    format: GPUTextureFormat;
    usage: number;
    
    createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
    destroy(): void;
  }

  interface GPUTextureDescriptor {
    size: GPUExtent3D;
    mipLevelCount?: number;
    sampleCount?: number;
    dimension?: GPUTextureDimension;
    format: GPUTextureFormat;
    usage: number;
    viewFormats?: Iterable<GPUTextureFormat>;
    label?: string;
  }

  interface GPUTextureView {}

  interface GPUTextureViewDescriptor {
    format?: GPUTextureFormat;
    dimension?: GPUTextureViewDimension;
    aspect?: GPUTextureAspect;
    baseMipLevel?: number;
    mipLevelCount?: number;
    baseArrayLayer?: number;
    arrayLayerCount?: number;
    label?: string;
  }

  interface GPUSampler {}

  interface GPUSamplerDescriptor {
    addressModeU?: GPUAddressMode;
    addressModeV?: GPUAddressMode;
    addressModeW?: GPUAddressMode;
    magFilter?: GPUFilterMode;
    minFilter?: GPUFilterMode;
    mipmapFilter?: GPUMipmapFilterMode;
    lodMinClamp?: number;
    lodMaxClamp?: number;
    compare?: GPUCompareFunction;
    maxAnisotropy?: number;
    label?: string;
  }

  interface GPUBindGroupLayout {}

  interface GPUBindGroupLayoutDescriptor {
    entries: Iterable<GPUBindGroupLayoutEntry>;
    label?: string;
  }

  interface GPUBindGroupLayoutEntry {
    binding: number;
    visibility: number;
    buffer?: GPUBufferBindingLayout;
    sampler?: GPUSamplerBindingLayout;
    texture?: GPUTextureBindingLayout;
    storageTexture?: GPUStorageTextureBindingLayout;
  }

  interface GPUBufferBindingLayout {
    type?: GPUBufferBindingType;
    hasDynamicOffset?: boolean;
    minBindingSize?: number;
  }

  interface GPUSamplerBindingLayout {
    type?: GPUSamplerBindingType;
  }

  interface GPUTextureBindingLayout {
    sampleType?: GPUTextureSampleType;
    viewDimension?: GPUTextureViewDimension;
    multisampled?: boolean;
  }

  interface GPUStorageTextureBindingLayout {
    access: GPUStorageTextureAccess;
    format: GPUTextureFormat;
    viewDimension?: GPUTextureViewDimension;
  }

  interface GPUPipelineLayout {}

  interface GPUPipelineLayoutDescriptor {
    bindGroupLayouts: Iterable<GPUBindGroupLayout>;
    label?: string;
  }

  interface GPUBindGroup {}

  interface GPUBindGroupDescriptor {
    layout: GPUBindGroupLayout;
    entries: Iterable<GPUBindGroupEntry>;
    label?: string;
  }

  interface GPUBindGroupEntry {
    binding: number;
    resource: GPUBindingResource;
  }

  interface GPUShaderModule {}

  interface GPUShaderModuleDescriptor {
    code: string;
    sourceMap?: object;
    label?: string;
  }

  interface GPUComputePipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
  }

  interface GPUComputePipelineDescriptor {
    layout: GPUPipelineLayout | 'auto';
    compute: GPUProgrammableStage;
    label?: string;
  }

  interface GPUProgrammableStage {
    module: GPUShaderModule;
    entryPoint: string;
    constants?: Record<string, number>;
  }

  interface GPURenderPipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
  }

  interface GPURenderPipelineDescriptor {
    layout: GPUPipelineLayout | 'auto';
    vertex: GPUVertexState;
    primitive?: GPUPrimitiveState;
    depthStencil?: GPUDepthStencilState;
    multisample?: GPUMultisampleState;
    fragment?: GPUFragmentState;
    label?: string;
  }

  interface GPUQueue {
    submit(commandBuffers: Iterable<GPUCommandBuffer>): void;
    onSubmittedWorkDone(): Promise<void>;
    writeBuffer(
      buffer: GPUBuffer,
      bufferOffset: number,
      data: BufferSource,
      dataOffset?: number,
      size?: number
    ): void;
    writeTexture(
      destination: GPUImageCopyTexture,
      data: BufferSource,
      dataLayout: GPUImageDataLayout,
      size: GPUExtent3D
    ): void;
    copyExternalImageToTexture(
      source: GPUImageCopyExternalImage,
      destination: GPUImageCopyTexture,
      copySize: GPUExtent3D
    ): void;
  }

  interface GPUCommandEncoder {
    beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder;
    beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
    copyBufferToBuffer(
      source: GPUBuffer,
      sourceOffset: number,
      destination: GPUBuffer,
      destinationOffset: number,
      size: number
    ): void;
    copyBufferToTexture(
      source: GPUImageCopyBuffer,
      destination: GPUImageCopyTexture,
      copySize: GPUExtent3D
    ): void;
    copyTextureToBuffer(
      source: GPUImageCopyTexture,
      destination: GPUImageCopyBuffer,
      copySize: GPUExtent3D
    ): void;
    copyTextureToTexture(
      source: GPUImageCopyTexture,
      destination: GPUImageCopyTexture,
      copySize: GPUExtent3D
    ): void;
    clearBuffer(buffer: GPUBuffer, offset?: number, size?: number): void;
    resolveQuerySet(
      querySet: GPUQuerySet,
      firstQuery: number,
      queryCount: number,
      destination: GPUBuffer,
      destinationOffset: number
    ): void;
    finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
    insertDebugMarker(markerLabel: string): void;
    popDebugGroup(): void;
    pushDebugGroup(groupLabel: string): void;
  }

  interface GPUComputePassEncoder {
    setPipeline(pipeline: GPUComputePipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: Iterable<number>): void;
    dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
    dispatchWorkgroupsIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void;
    end(): void;
    insertDebugMarker(markerLabel: string): void;
    popDebugGroup(): void;
    pushDebugGroup(groupLabel: string): void;
  }

  interface GPUCommandBuffer {}

  // 枚举和常量
  const GPUBufferUsage: {
    MAP_READ: number;
    MAP_WRITE: number;
    COPY_SRC: number;
    COPY_DST: number;
    INDEX: number;
    VERTEX: number;
    UNIFORM: number;
    STORAGE: number;
    INDIRECT: number;
    QUERY_RESOLVE: number;
  };

  const GPUMapMode: {
    READ: number;
    WRITE: number;
  };

  const GPUTextureUsage: {
    COPY_SRC: number;
    COPY_DST: number;
    TEXTURE_BINDING: number;
    STORAGE_BINDING: number;
    RENDER_ATTACHMENT: number;
  };

  const GPUShaderStage: {
    VERTEX: number;
    FRAGMENT: number;
    COMPUTE: number;
  };

  // 类型别名
  type GPUBindingResource = GPUBufferBinding | GPUSampler | GPUTextureView;
  type GPUBufferBinding = { buffer: GPUBuffer; offset?: number; size?: number };
  type GPUExtent3D = [number, number, number] | { width: number; height?: number; depthOrArrayLayers?: number };
  type GPUTextureDimension = '1d' | '2d' | '3d';
  type GPUTextureFormat = string;
  type GPUTextureViewDimension = '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
  type GPUTextureAspect = 'all' | 'stencil-only' | 'depth-only';
  type GPUAddressMode = 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
  type GPUFilterMode = 'nearest' | 'linear';
  type GPUMipmapFilterMode = 'nearest' | 'linear';
  type GPUCompareFunction = 'never' | 'less' | 'equal' | 'less-equal' | 'greater' | 'not-equal' | 'greater-equal' | 'always';
  type GPUBufferBindingType = 'uniform' | 'storage' | 'read-only-storage';
  type GPUSamplerBindingType = 'filtering' | 'non-filtering' | 'comparison';
  type GPUTextureSampleType = 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';
  type GPUStorageTextureAccess = 'write-only';
  type GPUBufferMapState = 'unmapped' | 'pending' | 'mapped';
  type GPUErrorFilter = 'validation' | 'out-of-memory' | 'internal';

  // 接口继续
  interface GPUError {
    message: string;
  }

  interface GPUDeviceLostInfo {
    reason: 'unknown' | 'destroyed';
    message: string;
  }

  interface GPUUncapturedErrorEvent extends Event {
    error: GPUError;
  }

  interface GPUComputePassDescriptor {
    label?: string;
    timestampWrites?: GPUComputePassTimestampWrites;
  }

  interface GPUComputePassTimestampWrites {
    querySet: GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }

  interface GPUQuerySet {}

  interface GPUCommandEncoderDescriptor {
    label?: string;
  }

  interface GPUCommandBufferDescriptor {
    label?: string;
  }

  interface GPURenderPassDescriptor {
    colorAttachments: (GPURenderPassColorAttachment | null)[];
    depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
    occlusionQuerySet?: GPUQuerySet;
    timestampWrites?: GPURenderPassTimestampWrites;
    label?: string;
  }

  interface GPURenderPassColorAttachment {
    view: GPUTextureView;
    resolveTarget?: GPUTextureView;
    clearValue?: GPUColor;
    loadOp: GPULoadOp;
    storeOp: GPUStoreOp;
  }

  interface GPURenderPassDepthStencilAttachment {
    view: GPUTextureView;
    depthClearValue?: number;
    depthLoadOp?: GPULoadOp;
    depthStoreOp?: GPUStoreOp;
    stencilClearValue?: number;
    stencilLoadOp?: GPULoadOp;
    stencilStoreOp?: GPUStoreOp;
  }

  interface GPURenderPassTimestampWrites {
    querySet: GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }

  interface GPURenderPassEncoder {}

  interface GPURenderBundleEncoder {}

  interface GPURenderBundleEncoderDescriptor {
    colorFormats: Iterable<GPUTextureFormat | null>;
    depthStencilFormat?: GPUTextureFormat;
    sampleCount?: number;
    depthReadOnly?: boolean;
    stencilReadOnly?: boolean;
    label?: string;
  }

  interface GPUVertexState extends GPUProgrammableStage {
    buffers?: Iterable<GPUVertexBufferLayout | null>;
  }

  interface GPUVertexBufferLayout {
    arrayStride: number;
    stepMode?: GPUVertexStepMode;
    attributes: Iterable<GPUVertexAttribute>;
  }

  interface GPUVertexAttribute {
    format: GPUVertexFormat;
    offset: number;
    shaderLocation: number;
  }

  interface GPUPrimitiveState {
    topology?: GPUPrimitiveTopology;
    stripIndexFormat?: GPUIndexFormat;
    frontFace?: GPUFrontFace;
    cullMode?: GPUCullMode;
    unclippedDepth?: boolean;
  }

  interface GPUDepthStencilState {
    format: GPUTextureFormat;
    depthWriteEnabled?: boolean;
    depthCompare?: GPUCompareFunction;
    stencilFront?: GPUStencilFaceState;
    stencilBack?: GPUStencilFaceState;
    stencilReadMask?: number;
    stencilWriteMask?: number;
    depthBias?: number;
    depthBiasSlopeScale?: number;
    depthBiasClamp?: number;
  }

  interface GPUStencilFaceState {
    compare?: GPUCompareFunction;
    failOp?: GPUStencilOperation;
    depthFailOp?: GPUStencilOperation;
    passOp?: GPUStencilOperation;
  }

  interface GPUMultisampleState {
    count?: number;
    mask?: number;
    alphaToCoverageEnabled?: boolean;
  }

  interface GPUFragmentState extends GPUProgrammableStage {
    targets: Iterable<GPUColorTargetState | null>;
  }

  interface GPUColorTargetState {
    format: GPUTextureFormat;
    blend?: GPUBlendState;
    writeMask?: number;
  }

  interface GPUBlendState {
    color: GPUBlendComponent;
    alpha: GPUBlendComponent;
  }

  interface GPUBlendComponent {
    operation?: GPUBlendOperation;
    srcFactor?: GPUBlendFactor;
    dstFactor?: GPUBlendFactor;
  }

  interface GPUImageCopyBuffer {
    buffer: GPUBuffer;
    offset?: number;
    bytesPerRow?: number;
    rowsPerImage?: number;
  }

  interface GPUImageCopyTexture {
    texture: GPUTexture;
    mipLevel?: number;
    origin?: GPUOrigin3D;
    aspect?: GPUTextureAspect;
  }

  interface GPUImageCopyExternalImage {
    source: ImageBitmap | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas;
    origin?: GPUOrigin2D;
    flipY?: boolean;
  }

  interface GPUImageDataLayout {
    offset?: number;
    bytesPerRow?: number;
    rowsPerImage?: number;
  }

  type GPUColor = [number, number, number, number] | { r: number; g: number; b: number; a: number };
  type GPULoadOp = 'load' | 'clear';
  type GPUStoreOp = 'store' | 'discard';
  type GPUVertexStepMode = 'vertex' | 'instance';
  type GPUVertexFormat = string;
  type GPUPrimitiveTopology = 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';
  type GPUIndexFormat = 'uint16' | 'uint32';
  type GPUFrontFace = 'ccw' | 'cw';
  type GPUCullMode = 'none' | 'front' | 'back';
  type GPUStencilOperation = 'keep' | 'zero' | 'replace' | 'invert' | 'increment-clamp' | 'decrement-clamp' | 'increment-wrap' | 'decrement-wrap';
  type GPUBlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';
  type GPUBlendFactor = 'zero' | 'one' | 'src' | 'one-minus-src' | 'src-alpha' | 'one-minus-src-alpha' | 'dst' | 'one-minus-dst' | 'dst-alpha' | 'one-minus-dst-alpha' | 'src-alpha-saturated' | 'constant' | 'one-minus-constant';
  type GPUOrigin2D = [number, number] | { x?: number; y?: number };
  type GPUOrigin3D = [number, number, number] | { x?: number; y?: number; z?: number };
}

export {};
