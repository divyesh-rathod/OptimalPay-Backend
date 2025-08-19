// Functional Priority Queue Implementation
// Converted from OOP to functional style while maintaining all logic and parameters

export interface BoundedMinHeapState<T> {
  heap: T[];
  compare: (a: T, b: T) => number;
  maxCapacity: number;
  evictionStrategy: 'strict' | 'batch' | 'percentage';
  evictionThreshold: number;
}

// Helper functions for heap operations
const getParentIndex = (index: number): number => {
  return Math.floor((index - 1) / 2);
};

const getLeftChildIndex = (index: number): number => {
  return 2 * index + 1;
};

const getRightChildIndex = (index: number): number => {
  return 2 * index + 2;
};

const swap = <T>(heap: T[], index1: number, index2: number): void => {
  [heap[index1], heap[index2]] = [heap[index2], heap[index1]];
};

const heapifyUp = <T>(state: BoundedMinHeapState<T>, index: number): void => {
  while (index > 0) {
    const parentIndex = getParentIndex(index);
    if (state.compare(state.heap[index], state.heap[parentIndex]) >= 0) break;
    swap(state.heap, index, parentIndex);
    index = parentIndex;
  }
};

const heapifyDown = <T>(state: BoundedMinHeapState<T>, index: number): void => {
  while (getLeftChildIndex(index) < state.heap.length) {
    const leftChildIndex = getLeftChildIndex(index);
    const rightChildIndex = getRightChildIndex(index);
    
    let smallestChildIndex = leftChildIndex;
    if (
      rightChildIndex < state.heap.length &&
      state.compare(state.heap[rightChildIndex], state.heap[leftChildIndex]) < 0
    ) {
      smallestChildIndex = rightChildIndex;
    }

    if (state.compare(state.heap[index], state.heap[smallestChildIndex]) <= 0) break;
    
    swap(state.heap, index, smallestChildIndex);
    index = smallestChildIndex;
  }
};

const removeAtIndex = <T>(state: BoundedMinHeapState<T>, index: number): void => {
  if (index >= state.heap.length) return;
  
  // Replace with last element
  state.heap[index] = state.heap[state.heap.length - 1];
  state.heap.pop();
  
  if (index < state.heap.length) {
    // Try heapifying both directions
    const parentIndex = getParentIndex(index);
    if (index > 0 && state.compare(state.heap[index], state.heap[parentIndex]) < 0) {
      heapifyUp(state, index);
    } else {
      heapifyDown(state, index);
    }
  }
};

const evictWorstNodes = <T>(state: BoundedMinHeapState<T>): void => {
  if (state.heap.length <= state.evictionThreshold) return;

  let nodesToRemove: number;
  
  switch (state.evictionStrategy) {
    case 'strict':
      nodesToRemove = 1;
      break;
    case 'batch':
      nodesToRemove = Math.floor(state.heap.length * 0.1); // Remove 10%
      break;
    case 'percentage':
      nodesToRemove = Math.floor(state.heap.length * 0.25); // Remove 25%
      break;
    default:
      nodesToRemove = Math.floor(state.heap.length * 0.1);
  }

  // 🔧 FIX: Use compare function instead of accessing fScore directly
  const currentBest = state.heap[0]; // Best node (lowest f-score)
  
  // Find nodes that are significantly worse than current best
  const protectedNodes: T[] = [];
  const evictionCandidates: { node: T; index: number }[] = [];
  
  for (let i = 0; i < state.heap.length; i++) {
    const node = state.heap[i];
    const compareResult = state.compare(node, currentBest);
    
    // If node is much worse than current best (compare > 2.0), it's a candidate for eviction
    if (compareResult > 2.0) {
      evictionCandidates.push({ node, index: i });
    } else {
      protectedNodes.push(node);
    }
  }

  // Only evict if we have enough bad candidates
  if (evictionCandidates.length < Math.min(nodesToRemove, 100)) {
    // Not enough bad nodes - reduce eviction or skip
    nodesToRemove = Math.min(evictionCandidates.length, Math.floor(nodesToRemove * 0.5));
    if (nodesToRemove === 0) return;
  }

  // Sort eviction candidates by how bad they are (worst first)
  evictionCandidates.sort((a, b) => state.compare(b.node, a.node));
  
  // Remove the worst nodes
  const indicesToRemove = evictionCandidates
    .slice(0, nodesToRemove)
    .map(candidate => candidate.index)
    .sort((a, b) => b - a); // Remove from end to avoid index shifting

  for (const index of indicesToRemove) {
    removeAtIndex(state, index);
  }
};

// Factory function to create a new bounded min heap state
export const createBoundedMinHeap = <T>(
  compareFunction: (a: T, b: T) => number,
  maxCapacity: number = 100000, // Default: 100K nodes max
  evictionStrategy: 'strict' | 'batch' | 'percentage' = 'batch'
): BoundedMinHeapState<T> => {
  const evictionThreshold = Math.floor(maxCapacity * 0.9); // Start evicting at 90% full
  
  return {
    heap: [],
    compare: compareFunction,
    maxCapacity,
    evictionStrategy,
    evictionThreshold
  };
};

// 🚀 ENHANCED PUSH FUNCTION WITH CAPACITY MANAGEMENT
export const pushToHeap = <T>(state: BoundedMinHeapState<T>, item: T): void => {
  // Check if we need to evict nodes first
  if (state.heap.length >= state.evictionThreshold) {
    evictWorstNodes(state);
  }

  // If still at max capacity after eviction, force remove one worst node
  if (state.heap.length >= state.maxCapacity) {
    // Find and remove the worst single node
    let worstIndex = 0;
    for (let i = 1; i < state.heap.length; i++) {
      if (state.compare(state.heap[i], state.heap[worstIndex]) > 0) {
        worstIndex = i;
      }
    }
    removeAtIndex(state, worstIndex);
  }

  // Add the new item
  state.heap.push(item);
  heapifyUp(state, state.heap.length - 1);
};

// Pop function
export const popFromHeap = <T>(state: BoundedMinHeapState<T>): T | undefined => {
  if (state.heap.length === 0) return undefined;
  if (state.heap.length === 1) return state.heap.pop();

  const root = state.heap[0];
  state.heap[0] = state.heap.pop()!;
  heapifyDown(state, 0);
  return root;
};

// Utility functions
export const getHeapLength = <T>(state: BoundedMinHeapState<T>): number => {
  return state.heap.length;
};

export const isHeapEmpty = <T>(state: BoundedMinHeapState<T>): boolean => {
  return state.heap.length === 0;
};

export const peekHeap = <T>(state: BoundedMinHeapState<T>): T | undefined => {
  return state.heap.length > 0 ? state.heap[0] : undefined;
};

// 🚀 NEW UTILITY FUNCTIONS
export const getCurrentCapacity = <T>(state: BoundedMinHeapState<T>): number => {
  return state.heap.length;
};

export const getMaxCapacity = <T>(state: BoundedMinHeapState<T>): number => {
  return state.maxCapacity;
};

export const getCapacityUsage = <T>(state: BoundedMinHeapState<T>): number => {
  return (state.heap.length / state.maxCapacity) * 100;
};

// Force cleanup if needed
export const forceEviction = <T>(state: BoundedMinHeapState<T>, percentage: number = 0.5): number => {
  const targetSize = Math.floor(state.heap.length * (1 - percentage));
  const nodesToRemove = state.heap.length - targetSize;
  
  if (nodesToRemove <= 0) return 0;

  const sortedIndices = Array.from({ length: state.heap.length }, (_, i) => i)
    .sort((a, b) => state.compare(state.heap[b], state.heap[a]));

  const indicesToRemove = sortedIndices.slice(0, nodesToRemove).sort((a, b) => b - a);
  
  for (const index of indicesToRemove) {
    removeAtIndex(state, index);
  }

  return nodesToRemove;
};

// Pure functional implementation - no classes
// All functionality is now available through functions