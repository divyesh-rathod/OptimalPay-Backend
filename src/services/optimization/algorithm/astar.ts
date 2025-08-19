/**
 * A* Algorithm Components
 * 
 * This module contains the core A* algorithm implementation for debt optimization,
 * including node management, state handling, and pathfinding logic.
 * 
 * @module AStarAlgorithm
 */

import { DebtResponse } from '../../../types/debts';
import { PaymentStrategy } from '../strategies/paymentStrategies';
import { createStateKey, discretizeBalance } from '../utils/balanceCalculations';
import { calculateMonthlyInterest, calculateNewBalance } from '../utils/interestCalculations';

/**
 * Configuration for A* algorithm
 */
export interface AStarConfig {
  maxIterations: number;               // Default: 100000 (maximum search iterations)
  beamSearchWidth: number;             // Default: 300 (beam search limitation)
  discretizationPrecision: number;     // Default: 25 (balance discretization)
  heuristicWeight: number;             // Default: 1.0 (heuristic weight factor)
  costWeight: number;                  // Default: 1.0 (cost weight factor)
  completionThreshold: number;         // Default: 5 (balance considered paid off)
  maxDepth: number;                    // Default: 60 (maximum months to search)
  stateTimeoutMs: number;              // Default: 30000 (30 seconds timeout)
}

/**
 * Default configuration for A* algorithm
 */
export const DEFAULT_ASTAR_CONFIG: AStarConfig = {
  maxIterations: 100000,
  beamSearchWidth: 300,
  discretizationPrecision: 25,
  heuristicWeight: 1.0,
  costWeight: 1.0,
  completionThreshold: 5,
  maxDepth: 60,
  stateTimeoutMs: 30000
};

/**
 * Node in the A* search tree
 */
export interface AStarNode {
  balances: number[];                  // Current debt balances
  payments: number[];                  // Payments made to reach this state
  gCost: number;                       // Actual cost from start
  hCost: number;                       // Heuristic cost to goal
  fCost: number;                       // Total cost (g + h)
  month: number;                       // Current month
  strategy?: PaymentStrategy;          // Strategy used to reach this state
  parent?: AStarNode;                  // Parent node for path reconstruction
  stateKey: string;                    // Unique identifier for this state
}

/**
 * Priority queue implementation for A* open set
 */
export interface AStarPriorityQueue {
  heap: AStarNode[];
  size: number;
}

/**
 * Create a new A* priority queue
 * 
 * @returns New empty priority queue
 */
export const createAStarPriorityQueue = (): AStarPriorityQueue => ({
  heap: [],
  size: 0
});

/**
 * Add node to priority queue
 * 
 * @param queue - Priority queue
 * @param node - Node to add
 */
export const enqueueAStarNode = (queue: AStarPriorityQueue, node: AStarNode): void => {
  queue.heap.push(node);
  queue.size++;
  heapifyUpAStar(queue, queue.size - 1);
};

/**
 * Remove and return node with lowest f-cost
 * 
 * @param queue - Priority queue
 * @returns Node with lowest f-cost, or null if empty
 */
export const dequeueAStarNode = (queue: AStarPriorityQueue): AStarNode | null => {
  if (queue.size === 0) return null;
  
  const minNode = queue.heap[0];
  const lastNode = queue.heap[queue.size - 1];
  queue.heap[0] = lastNode;
  queue.size--;
  queue.heap.pop();
  
  if (queue.size > 0) {
    heapifyDownAStar(queue, 0);
  }
  
  return minNode;
};

/**
 * Check if priority queue is empty
 * 
 * @param queue - Priority queue
 * @returns True if empty
 */
export const isAStarQueueEmpty = (queue: AStarPriorityQueue): boolean => queue.size === 0;

/**
 * Heapify up operation for A* priority queue
 * 
 * @param queue - Priority queue
 * @param index - Index to heapify from
 */
const heapifyUpAStar = (queue: AStarPriorityQueue, index: number): void => {
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (queue.heap[index].fCost >= queue.heap[parentIndex].fCost) break;
    
    [queue.heap[index], queue.heap[parentIndex]] = [queue.heap[parentIndex], queue.heap[index]];
    index = parentIndex;
  }
};

/**
 * Heapify down operation for A* priority queue
 * 
 * @param queue - Priority queue
 * @param index - Index to heapify from
 */
const heapifyDownAStar = (queue: AStarPriorityQueue, index: number): void => {
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
 * Create initial A* node
 * 
 * @param initialBalances - Starting debt balances
 * @param debts - Debt information array
 * @param config - A* configuration
 * @returns Initial node for search
 */
export const createInitialAStarNode = (
  initialBalances: number[],
  debts: DebtResponse[],
  config: AStarConfig = DEFAULT_ASTAR_CONFIG
): AStarNode => {
  const discretizedBalances = initialBalances.map(balance => 
    discretizeBalance(balance, config.discretizationPrecision)
  );
  
  const hCost = calculateHeuristic(discretizedBalances, debts);
  const stateKey = createStateKey(discretizedBalances, 0);
  
  return {
    balances: discretizedBalances,
    payments: new Array(debts.length).fill(0),
    gCost: 0,
    hCost,
    fCost: hCost,
    month: 0,
    stateKey: stateKey.toString()
  };
};

/**
 * Create child node from parent using payment strategy
 * 
 * @param parent - Parent node
 * @param strategy - Payment strategy to apply
 * @param debts - Debt information array
 * @param config - A* configuration
 * @returns New child node
 */
export const createChildAStarNode = (
  parent: AStarNode,
  strategy: PaymentStrategy,
  debts: DebtResponse[],
  config: AStarConfig = DEFAULT_ASTAR_CONFIG
): AStarNode => {
  const newBalances = parent.balances.map((balance, i) => {
    if (balance <= config.completionThreshold) return 0;
    
    const payment = Math.min(strategy.payments[i], balance + calculateMonthlyInterest(balance, debts[i].interestRate));
    const newBalance = calculateNewBalance(balance, payment, debts[i].interestRate);
    return discretizeBalance(newBalance, config.discretizationPrecision);
  });
  
  const newMonth = parent.month + 1;
  const gCost = parent.gCost + calculateStepCost(strategy.payments, debts);
  const hCost = calculateHeuristic(newBalances, debts);
  const fCost = (gCost * config.costWeight) + (hCost * config.heuristicWeight);
  const stateKey = createStateKey(newBalances, newMonth);
  
  return {
    balances: newBalances,
    payments: strategy.payments,
    gCost,
    hCost,
    fCost,
    month: newMonth,
    strategy,
    parent,
    stateKey: stateKey.toString()
  };
};

/**
 * Calculate heuristic cost for A* algorithm
 * 
 * @param balances - Current debt balances
 * @param debts - Debt information array
 * @returns Heuristic cost estimate
 */
export const calculateHeuristic = (balances: number[], debts: DebtResponse[]): number => {
  return balances.reduce((total, balance, i) => {
    if (balance <= 5) return total;
    
    const minPayment = debts[i].minimumPayment;
    const interestRate = debts[i].interestRate;
    
    // Estimate months to pay off with minimum payments
    const monthlyInterest = calculateMonthlyInterest(balance, interestRate);
    const principal = Math.max(1, minPayment - monthlyInterest);
    const estimatedMonths = Math.ceil(balance / principal);
    
    // Weight by total interest that would be paid
    const totalInterest = estimatedMonths * monthlyInterest;
    return total + totalInterest;
  }, 0);
};

/**
 * Calculate cost of a payment step
 * 
 * @param payments - Payments made this month
 * @param debts - Debt information array
 * @returns Cost of this step
 */
export const calculateStepCost = (payments: number[], debts: DebtResponse[]): number => {
  return payments.reduce((total, payment, i) => {
    // Cost is primarily the interest paid this month
    const balance = debts[i].currentAmount || 0;
    const interestCost = calculateMonthlyInterest(balance, debts[i].interestRate);
    
    // Add small penalty for higher payments to encourage efficiency
    const paymentPenalty = payment * 0.001;
    
    return total + interestCost + paymentPenalty;
  }, 0);
};

/**
 * Check if a state represents goal (all debts paid off)
 * 
 * @param node - Node to check
 * @param config - A* configuration
 * @returns True if goal state
 */
export const isGoalState = (node: AStarNode, config: AStarConfig = DEFAULT_ASTAR_CONFIG): boolean => {
  return node.balances.every(balance => balance <= config.completionThreshold);
};

/**
 * Reconstruct path from goal node to start
 * 
 * @param goalNode - Final node in optimal path
 * @returns Array of payment strategies representing optimal path
 */
export const reconstructPath = (goalNode: AStarNode): PaymentStrategy[] => {
  const path: PaymentStrategy[] = [];
  let current: AStarNode | undefined = goalNode;
  
  while (current && current.parent) {
    if (current.strategy) {
      path.unshift(current.strategy);
    }
    current = current.parent;
  }
  
  return path;
};

/**
 * Validate A* node for consistency
 * 
 * @param node - Node to validate
 * @param debts - Debt information array
 * @returns True if node is valid
 */
export const validateAStarNode = (node: AStarNode, debts: DebtResponse[]): boolean => {
  // Check balance array length
  if (node.balances.length !== debts.length) return false;
  
  // Check payment array length
  if (node.payments.length !== debts.length) return false;
  
  // Check for negative values
  if (node.balances.some(b => b < 0)) return false;
  if (node.payments.some(p => p < 0)) return false;
  
  // Check cost values
  if (node.gCost < 0 || node.hCost < 0 || node.fCost < 0) return false;
  
  // Check month
  if (node.month < 0) return false;
  
  return true;
};
