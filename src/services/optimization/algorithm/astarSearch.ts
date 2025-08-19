/**
 * A* Search Orchestrator
 * 
 * This module contains the main A* search logic that coordinates all components
 * to find optimal debt payment strategies.
 * 
 * @module AStarSearch
 */

import { DebtResponse } from '../../../types/debts';
import { PaymentStrategy } from '../strategies/paymentStrategies';
import { generateAllPaymentStrategies } from '../strategies/paymentStrategies';
import { evaluateAndRankStrategies, findBestStrategy } from '../strategies/strategyEvaluation';
import {
  AStarConfig,
  AStarNode,
  AStarPriorityQueue,
  DEFAULT_ASTAR_CONFIG,
  createAStarPriorityQueue,
  createInitialAStarNode,
  createChildAStarNode,
  enqueueAStarNode,
  dequeueAStarNode,
  isAStarQueueEmpty,
  isGoalState,
  reconstructPath,
  validateAStarNode
} from './astar';

/**
 * Result of A* search
 */
export interface AStarSearchResult {
  success: boolean;
  optimalPath: PaymentStrategy[];
  totalCost: number;
  monthsToCompletion: number;
  iterations: number;
  timeElapsed: number;
  searchStats: {
    nodesExplored: number;
    maxQueueSize: number;
    pruningCount: number;
    beamSearchTriggered: boolean;
  };
  finalBalances: number[];
  error?: string;
}

/**
 * Search statistics for monitoring performance
 */
interface SearchStats {
  nodesExplored: number;
  maxQueueSize: number;
  pruningCount: number;
  beamSearchTriggered: boolean;
}

/**
 * Execute A* search to find optimal debt payment strategy
 * 
 * @param initialBalances - Starting debt balances
 * @param debts - Debt information array
 * @param availableBudget - Monthly budget available for debt payments
 * @param config - A* algorithm configuration
 * @returns Search result with optimal payment strategy
 */
export const executeAStarSearch = async (
  initialBalances: number[],
  debts: DebtResponse[],
  availableBudget: number,
  config: AStarConfig = DEFAULT_ASTAR_CONFIG
): Promise<AStarSearchResult> => {
  const startTime = Date.now();
  const openSet = createAStarPriorityQueue();
  const closedSet = new Map<string, AStarNode>();
  const searchStats: SearchStats = {
    nodesExplored: 0,
    maxQueueSize: 0,
    pruningCount: 0,
    beamSearchTriggered: false
  };

  try {
    // Initialize search with starting node
    const initialNode = createInitialAStarNode(initialBalances, debts, config);
    if (!validateAStarNode(initialNode, debts)) {
      throw new Error('Invalid initial node created');
    }
    
    enqueueAStarNode(openSet, initialNode);

    let iterations = 0;
    const timeout = startTime + config.stateTimeoutMs;

    // Main A* search loop
    while (!isAStarQueueEmpty(openSet) && iterations < config.maxIterations) {
      // Check timeout
      if (Date.now() > timeout) {
        return {
          success: false,
          optimalPath: [],
          totalCost: Infinity,
          monthsToCompletion: -1,
          iterations,
          timeElapsed: Date.now() - startTime,
          searchStats,
          finalBalances: initialBalances,
          error: 'Search timeout exceeded'
        };
      }

      iterations++;
      searchStats.maxQueueSize = Math.max(searchStats.maxQueueSize, openSet.size);

      // Get node with lowest f-cost
      const currentNode = dequeueAStarNode(openSet);
      if (!currentNode) break;

      searchStats.nodesExplored++;

      // Check if we've reached the goal
      if (isGoalState(currentNode, config)) {
        const optimalPath = reconstructPath(currentNode);
        return {
          success: true,
          optimalPath,
          totalCost: currentNode.gCost,
          monthsToCompletion: currentNode.month,
          iterations,
          timeElapsed: Date.now() - startTime,
          searchStats,
          finalBalances: currentNode.balances
        };
      }

      // Skip if already processed this state
      if (closedSet.has(currentNode.stateKey)) {
        continue;
      }

      // Mark current state as explored
      closedSet.set(currentNode.stateKey, currentNode);

      // Skip if exceeded maximum depth
      if (currentNode.month >= config.maxDepth) {
        continue;
      }

      // Generate possible payment strategies for this state
      const strategies = await generateNextStrategies(
        currentNode.balances,
        debts,
        availableBudget,
        config
      );

      // Create child nodes for each strategy
      for (const strategy of strategies) {
        const childNode = createChildAStarNode(currentNode, strategy, debts, config);
        
        if (!validateAStarNode(childNode, debts)) {
          continue;
        }

        // Skip if this state was already explored with better cost
        const existingNode = closedSet.get(childNode.stateKey);
        if (existingNode && existingNode.gCost <= childNode.gCost) {
          searchStats.pruningCount++;
          continue;
        }

        enqueueAStarNode(openSet, childNode);
      }

      // Apply beam search if queue becomes too large
      if (openSet.size > config.beamSearchWidth) {
        applyBeamSearch(openSet, config.beamSearchWidth);
        searchStats.beamSearchTriggered = true;
      }
    }

    // Search completed without finding goal
    return {
      success: false,
      optimalPath: [],
      totalCost: Infinity,
      monthsToCompletion: -1,
      iterations,
      timeElapsed: Date.now() - startTime,
      searchStats,
      finalBalances: initialBalances,
      error: iterations >= config.maxIterations ? 'Maximum iterations exceeded' : 'No solution found'
    };

  } catch (error) {
    return {
      success: false,
      optimalPath: [],
      totalCost: Infinity,
      monthsToCompletion: -1,
      iterations: 0,
      timeElapsed: Date.now() - startTime,
      searchStats,
      finalBalances: initialBalances,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * Generate next possible payment strategies from current state
 * 
 * @param currentBalances - Current debt balances
 * @param debts - Debt information array
 * @param availableBudget - Available monthly budget
 * @param config - A* configuration
 * @returns Array of viable payment strategies
 */
const generateNextStrategies = async (
  currentBalances: number[],
  debts: DebtResponse[],
  availableBudget: number,
  config: AStarConfig
): Promise<PaymentStrategy[]> => {
  // Update debt information with current balances
  const updatedDebts = debts.map((debt, i) => ({
    ...debt,
    currentAmount: currentBalances[i]
  }));

  // Generate all possible strategies
  const allStrategies = generateAllPaymentStrategies(
    currentBalances,
    updatedDebts,
    availableBudget
  );
  
  // Evaluate and rank strategies, return top candidates
  const evaluatedStrategies = evaluateAndRankStrategies(
    allStrategies,
    currentBalances,
    updatedDebts
  );

  // Return top strategies (limit to reasonable number for performance)
  return evaluatedStrategies.slice(0, Math.min(10, evaluatedStrategies.length));
};

/**
 * Apply beam search to limit queue size
 * 
 * @param queue - Priority queue to prune
 * @param maxSize - Maximum size to maintain
 */
const applyBeamSearch = (queue: AStarPriorityQueue, maxSize: number): void => {
  if (queue.size <= maxSize) return;

  // Sort by f-cost and keep only the best nodes
  queue.heap.sort((a, b) => a.fCost - b.fCost);
  queue.heap = queue.heap.slice(0, maxSize);
  queue.size = maxSize;

  // Re-heapify the reduced array
  for (let i = Math.floor(queue.size / 2) - 1; i >= 0; i--) {
    heapifyDownBeam(queue, i);
  }
};

/**
 * Heapify down for beam search pruning
 * 
 * @param queue - Priority queue
 * @param index - Starting index
 */
const heapifyDownBeam = (queue: AStarPriorityQueue, index: number): void => {
  while (true) {
    let minIndex = index;
    const leftChild = 2 * index + 1;
    const rightChild = 2 * index + 2;

    if (leftChild < queue.size && queue.heap[leftChild].fCost < queue.heap[minIndex].fCost) {
      minIndex = leftChild;
    }

    if (rightChild < queue.size && queue.heap[rightChild].fCost < queue.heap[minIndex].fCost) {
      minIndex = rightChild;
    }

    if (minIndex === index) break;

    [queue.heap[index], queue.heap[minIndex]] = [queue.heap[minIndex], queue.heap[index]];
    index = minIndex;
  }
};

/**
 * Quick search for immediate solutions (fallback strategy)
 * 
 * @param initialBalances - Starting debt balances
 * @param debts - Debt information array
 * @param availableBudget - Available monthly budget
 * @returns Quick solution or null if none found
 */
export const quickAStarSearch = async (
  initialBalances: number[],
  debts: DebtResponse[],
  availableBudget: number
): Promise<PaymentStrategy[] | null> => {
  const quickConfig: AStarConfig = {
    ...DEFAULT_ASTAR_CONFIG,
    maxIterations: 1000,
    beamSearchWidth: 50,
    maxDepth: 12,
    stateTimeoutMs: 5000
  };

  const result = await executeAStarSearch(initialBalances, debts, availableBudget, quickConfig);
  return result.success ? result.optimalPath : null;
};
