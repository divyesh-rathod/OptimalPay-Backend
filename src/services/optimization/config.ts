/**
 * Optimization Configuration Management
 * 
 * This module provides centralized configuration management for the optimization
 * service, implementing the repository pattern for settings persistence.
 * 
 * @module OptimizationConfig
 */

import { DebtResponse } from '../../types/debts';
import { AStarConfig, DEFAULT_ASTAR_CONFIG } from './algorithm/astar';
import { PaymentStrategyConfig, DEFAULT_PAYMENT_STRATEGY_CONFIG } from './strategies/paymentStrategies';
import { StrategyEvaluationConfig, DEFAULT_STRATEGY_EVALUATION_CONFIG } from './strategies/strategyEvaluation';
import { BudgetAllocationConfig, DEFAULT_BUDGET_ALLOCATION_CONFIG } from './utils/budgetAllocation';
import { DebtCategorizationConfig, DEFAULT_CATEGORIZATION_CONFIG } from './utils/debtCategorization';

/**
 * Complete optimization configuration
 */
export interface OptimizationConfig {
  algorithmConfig: AStarConfig;
  strategyConfig: PaymentStrategyConfig;
  evaluationConfig: StrategyEvaluationConfig;
  budgetConfig: BudgetAllocationConfig;
  categorizationConfig: DebtCategorizationConfig;
  globalConfig: GlobalOptimizationConfig;
}

/**
 * Global optimization settings
 */
export interface GlobalOptimizationConfig {
  enableAdvancedStrategies: boolean;     // Default: true
  enableLookaheadEvaluation: boolean;    // Default: true
  enableBeamSearch: boolean;             // Default: true
  enableQuickFallback: boolean;          // Default: true
  maxOptimizationTimeMs: number;         // Default: 60000 (1 minute)
  enableLogging: boolean;                // Default: false
  enableCaching: boolean;                // Default: true
  cacheExpirationMs: number;             // Default: 300000 (5 minutes)
  debugMode: boolean;                    // Default: false
}

/**
 * Default global configuration
 */
export const DEFAULT_GLOBAL_CONFIG: GlobalOptimizationConfig = {
  enableAdvancedStrategies: true,
  enableLookaheadEvaluation: true,
  enableBeamSearch: true,
  enableQuickFallback: true,
  maxOptimizationTimeMs: 60000,
  enableLogging: false,
  enableCaching: true,
  cacheExpirationMs: 300000,
  debugMode: false
};

/**
 * Default complete optimization configuration
 */
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  algorithmConfig: DEFAULT_ASTAR_CONFIG,
  strategyConfig: DEFAULT_PAYMENT_STRATEGY_CONFIG,
  evaluationConfig: DEFAULT_STRATEGY_EVALUATION_CONFIG,
  budgetConfig: DEFAULT_BUDGET_ALLOCATION_CONFIG,
  categorizationConfig: DEFAULT_CATEGORIZATION_CONFIG,
  globalConfig: DEFAULT_GLOBAL_CONFIG
};

/**
 * Configuration repository interface for persistence
 */
export interface ConfigRepository {
  load(userId: string): Promise<OptimizationConfig>;
  save(userId: string, config: OptimizationConfig): Promise<void>;
  loadDefault(): OptimizationConfig;
  validateConfig(config: OptimizationConfig): boolean;
}

/**
 * In-memory configuration repository (default implementation)
 */
export class InMemoryConfigRepository implements ConfigRepository {
  private configs = new Map<string, OptimizationConfig>();

  async load(userId: string): Promise<OptimizationConfig> {
    return this.configs.get(userId) || this.loadDefault();
  }

  async save(userId: string, config: OptimizationConfig): Promise<void> {
    if (!this.validateConfig(config)) {
      throw new Error('Invalid configuration provided');
    }
    this.configs.set(userId, config);
  }

  loadDefault(): OptimizationConfig {
    return { ...DEFAULT_OPTIMIZATION_CONFIG };
  }

  validateConfig(config: OptimizationConfig): boolean {
    // Validate algorithm config
    if (!config.algorithmConfig || typeof config.algorithmConfig !== 'object') return false;
    if (config.algorithmConfig.maxIterations <= 0) return false;
    if (config.algorithmConfig.beamSearchWidth <= 0) return false;
    if (config.algorithmConfig.maxDepth <= 0) return false;

    // Validate strategy config
    if (!config.strategyConfig || typeof config.strategyConfig !== 'object') return false;
    if (config.strategyConfig.minimumExtraBudget < 0) return false;

    // Validate evaluation config
    if (!config.evaluationConfig || typeof config.evaluationConfig !== 'object') return false;
    if (config.evaluationConfig.lookaheadDepth <= 0) return false;

    // Validate budget config
    if (!config.budgetConfig || typeof config.budgetConfig !== 'object') return false;
    if (config.budgetConfig.defaultHighPercentage < 0 || config.budgetConfig.defaultHighPercentage > 1) return false;

    // Validate categorization config
    if (!config.categorizationConfig || typeof config.categorizationConfig !== 'object') return false;
    if (config.categorizationConfig.otherHighRate <= 0) return false;

    // Validate global config
    if (!config.globalConfig || typeof config.globalConfig !== 'object') return false;
    if (config.globalConfig.maxOptimizationTimeMs <= 0) return false;

    return true;
  }
}

/**
 * Configuration manager service
 */
export class ConfigurationManager {
  private repository: ConfigRepository;
  private cache = new Map<string, { config: OptimizationConfig; timestamp: number }>();

  constructor(repository: ConfigRepository = new InMemoryConfigRepository()) {
    this.repository = repository;
  }

  /**
   * Get configuration for a user
   */
  async getConfig(userId: string): Promise<OptimizationConfig> {
    // Check cache first
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.timestamp < DEFAULT_GLOBAL_CONFIG.cacheExpirationMs) {
      return cached.config;
    }

    // Load from repository
    const config = await this.repository.load(userId);
    
    // Cache the result
    this.cache.set(userId, { config, timestamp: Date.now() });
    
    return config;
  }

  /**
   * Update configuration for a user
   */
  async updateConfig(userId: string, updates: Partial<OptimizationConfig>): Promise<void> {
    const currentConfig = await this.getConfig(userId);
    const newConfig = this.mergeConfigs(currentConfig, updates);
    
    await this.repository.save(userId, newConfig);
    
    // Update cache
    this.cache.set(userId, { config: newConfig, timestamp: Date.now() });
  }

  /**
   * Get adaptive configuration based on debt profile
   */
  async getAdaptiveConfig(userId: string, debts: DebtResponse[]): Promise<OptimizationConfig> {
    const baseConfig = await this.getConfig(userId);
    return this.adaptConfigToDebts(baseConfig, debts);
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(userId: string): Promise<void> {
    const defaultConfig = this.repository.loadDefault();
    await this.repository.save(userId, defaultConfig);
    this.cache.delete(userId);
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Merge configuration updates with existing config
   */
  private mergeConfigs(base: OptimizationConfig, updates: Partial<OptimizationConfig>): OptimizationConfig {
    return {
      algorithmConfig: { ...base.algorithmConfig, ...updates.algorithmConfig },
      strategyConfig: { ...base.strategyConfig, ...updates.strategyConfig },
      evaluationConfig: { ...base.evaluationConfig, ...updates.evaluationConfig },
      budgetConfig: { ...base.budgetConfig, ...updates.budgetConfig },
      categorizationConfig: { ...base.categorizationConfig, ...updates.categorizationConfig },
      globalConfig: { ...base.globalConfig, ...updates.globalConfig }
    };
  }

  /**
   * Adapt configuration based on debt characteristics
   */
  private adaptConfigToDebts(config: OptimizationConfig, debts: DebtResponse[]): OptimizationConfig {
    const adaptedConfig = { ...config };

    // Adjust based on number of debts
    if (debts.length > 10) {
      adaptedConfig.algorithmConfig = {
        ...adaptedConfig.algorithmConfig,
        beamSearchWidth: Math.max(200, adaptedConfig.algorithmConfig.beamSearchWidth),
        maxIterations: Math.max(50000, adaptedConfig.algorithmConfig.maxIterations)
      };
    }

    // Adjust based on debt complexity
    const totalDebt = debts.reduce((sum, debt) => sum + debt.currentAmount, 0);
    const avgInterestRate = debts.reduce((sum, debt) => sum + debt.interestRate, 0) / debts.length;

    if (totalDebt > 100000 || avgInterestRate > 0.15) {
      adaptedConfig.evaluationConfig = {
        ...adaptedConfig.evaluationConfig,
        lookaheadDepth: Math.max(4, adaptedConfig.evaluationConfig.lookaheadDepth)
      };
    }

    // Adjust categorization thresholds based on debt profile
    const maxInterestRate = Math.max(...debts.map(d => d.interestRate));
    if (maxInterestRate > 0.25) {
      adaptedConfig.categorizationConfig = {
        ...adaptedConfig.categorizationConfig,
        otherHighRate: Math.min(0.20, maxInterestRate * 0.8)
      };
    }

    return adaptedConfig;
  }
}

/**
 * Create configuration manager with specified repository
 */
export const createConfigurationManager = (repository?: ConfigRepository): ConfigurationManager => {
  return new ConfigurationManager(repository);
};

/**
 * Global configuration manager instance
 */
export const globalConfigManager = new ConfigurationManager();

/**
 * Configuration presets for different optimization scenarios
 */
export const CONFIG_PRESETS = {
  AGGRESSIVE: {
    ...DEFAULT_OPTIMIZATION_CONFIG,
    algorithmConfig: {
      ...DEFAULT_ASTAR_CONFIG,
      maxIterations: 200000,
      beamSearchWidth: 500,
      maxDepth: 72
    },
    strategyConfig: {
      ...DEFAULT_PAYMENT_STRATEGY_CONFIG,
      minimumExtraBudget: 200
    },
    globalConfig: {
      ...DEFAULT_GLOBAL_CONFIG,
      maxOptimizationTimeMs: 120000
    }
  } as OptimizationConfig,

  CONSERVATIVE: {
    ...DEFAULT_OPTIMIZATION_CONFIG,
    algorithmConfig: {
      ...DEFAULT_ASTAR_CONFIG,
      maxIterations: 25000,
      beamSearchWidth: 100,
      maxDepth: 36
    },
    strategyConfig: {
      ...DEFAULT_PAYMENT_STRATEGY_CONFIG,
      minimumExtraBudget: 50
    },
    globalConfig: {
      ...DEFAULT_GLOBAL_CONFIG,
      maxOptimizationTimeMs: 30000,
      enableAdvancedStrategies: false
    }
  } as OptimizationConfig,

  BALANCED: DEFAULT_OPTIMIZATION_CONFIG,

  QUICK: {
    ...DEFAULT_OPTIMIZATION_CONFIG,
    algorithmConfig: {
      ...DEFAULT_ASTAR_CONFIG,
      maxIterations: 10000,
      beamSearchWidth: 50,
      maxDepth: 24,
      stateTimeoutMs: 10000
    },
    evaluationConfig: {
      ...DEFAULT_STRATEGY_EVALUATION_CONFIG,
      lookaheadDepth: 2,
      maxTopStrategies: 2
    },
    globalConfig: {
      ...DEFAULT_GLOBAL_CONFIG,
      maxOptimizationTimeMs: 15000,
      enableLookaheadEvaluation: false
    }
  } as OptimizationConfig
};
