// TypeScript接口定义，描述从Python编译来的JavaScript模块
export interface OperatorConfig {
  [key: string]: {
    weight: number;
    target: number;
  };
}

export interface SimulationResult {
  simulation_count: number;
  target_description: string;
  total_draws: {
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    percentile_25: number;
    percentile_75: number;
  };
  sigma_analysis: {
    [key: number]: {
      range: string;
      lower: number;
      upper: number;
      percentage: number;
      count: number;
      description: string;
    };
  };
  full_probability_stats: Array<{
    percentile: number;
    draws: number;
    probability: string;
    description: string;
  }>;
  cumulative_probability: { [key: number]: number };
  character_stats: {
    [key: string]: {
      mean: number;
      std: number;
      target: number;
      weight: number;
    };
  };
  raw_data: {
    total_draws: number[];
    percentiles: [number, number][];
  };
}

// 声明全局的Python模块接口
declare global {
  interface Window {
    ark_core?: {
      run_simulation: (n_simulations: number, operator_config?: OperatorConfig) => SimulationResult;
      get_example_config: (config_name: string) => OperatorConfig;
    };
  }
}
