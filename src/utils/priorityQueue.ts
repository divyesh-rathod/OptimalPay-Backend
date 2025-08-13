export class BoundedMinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;
  private maxCapacity: number;
  private evictionStrategy: 'strict' | 'batch' | 'percentage';
  private evictionThreshold: number;

  constructor(
    compareFunction: (a: T, b: T) => number,
    maxCapacity: number = 100000, // Default: 100K nodes max
    evictionStrategy: 'strict' | 'batch' | 'percentage' = 'batch'
  ) {
    this.compare = compareFunction;
    this.maxCapacity = maxCapacity;
    this.evictionStrategy = evictionStrategy;
    
    // Set eviction threshold (when to start removing)
    this.evictionThreshold = Math.floor(maxCapacity * 0.9); // Start evicting at 90% full
  }

  private getParentIndex(index: number): number {
    return Math.floor((index - 1) / 2);
  }

  private getLeftChildIndex(index: number): number {
    return 2 * index + 1;
  }

  private getRightChildIndex(index: number): number {
    return 2 * index + 2;
  }

  private swap(index1: number, index2: number): void {
    [this.heap[index1], this.heap[index2]] = [this.heap[index2], this.heap[index1]];
  }

  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = this.getParentIndex(index);
      if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) break;
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private heapifyDown(index: number): void {
    while (this.getLeftChildIndex(index) < this.heap.length) {
      const leftChildIndex = this.getLeftChildIndex(index);
      const rightChildIndex = this.getRightChildIndex(index);
      
      let smallestChildIndex = leftChildIndex;
      if (
        rightChildIndex < this.heap.length &&
        this.compare(this.heap[rightChildIndex], this.heap[leftChildIndex]) < 0
      ) {
        smallestChildIndex = rightChildIndex;
      }

      if (this.compare(this.heap[index], this.heap[smallestChildIndex]) <= 0) break;
      
      this.swap(index, smallestChildIndex);
      index = smallestChildIndex;
    }
  }

  private evictWorstNodes(): void {
    if (this.heap.length <= this.evictionThreshold) return;

    

    let nodesToRemove: number;
    
    switch (this.evictionStrategy) {
      case 'strict':
        nodesToRemove = 1;
        break;
      case 'batch':
        nodesToRemove = Math.floor(this.heap.length * 0.1); // Remove 10%
        break;
      case 'percentage':
        nodesToRemove = Math.floor(this.heap.length * 0.25); // Remove 25%
        break;
      default:
        nodesToRemove = Math.floor(this.heap.length * 0.1);
    }

     // 🔧 FIX: Use compare function instead of accessing fScore directly
  const currentBest = this.heap[0]; // Best node (lowest f-score)
  
  // Find nodes that are significantly worse than current best
  const protectedNodes: T[] = [];
  const evictionCandidates: { node: T; index: number }[] = [];
  
  for (let i = 0; i < this.heap.length; i++) {
    const node = this.heap[i];
    const compareResult = this.compare(node, currentBest);
    
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
  evictionCandidates.sort((a, b) => this.compare(b.node, a.node));
  
  // Remove the worst nodes
  const indicesToRemove = evictionCandidates
    .slice(0, nodesToRemove)
    .map(candidate => candidate.index)
    .sort((a, b) => b - a); // Remove from end to avoid index shifting

  for (const index of indicesToRemove) {
    this.removeAtIndex(index);
  }
  }

  private removeAtIndex(index: number): void {
    if (index >= this.heap.length) return;
    
    // Replace with last element
    this.heap[index] = this.heap[this.heap.length - 1];
    this.heap.pop();
    
    if (index < this.heap.length) {
      // Try heapifying both directions
      const parentIndex = this.getParentIndex(index);
      if (index > 0 && this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
        this.heapifyUp(index);
      } else {
        this.heapifyDown(index);
      }
    }
  }

  // 🚀 ENHANCED PUSH METHOD WITH CAPACITY MANAGEMENT
  push(item: T): void {
    // Check if we need to evict nodes first
    if (this.heap.length >= this.evictionThreshold) {
      this.evictWorstNodes();
    }

    // If still at max capacity after eviction, force remove one worst node
    if (this.heap.length >= this.maxCapacity) {
      // Find and remove the worst single node
      let worstIndex = 0;
      for (let i = 1; i < this.heap.length; i++) {
        if (this.compare(this.heap[i], this.heap[worstIndex]) > 0) {
          worstIndex = i;
        }
      }
      this.removeAtIndex(worstIndex);
    }

    // Add the new item
    this.heap.push(item);
    this.heapifyUp(this.heap.length - 1);
  }

  // Existing methods remain the same
  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const root = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.heapifyDown(0);
    return root;
  }

  get length(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  peek(): T | undefined {
    return this.heap.length > 0 ? this.heap[0] : undefined;
  }

  // 🚀 NEW UTILITY METHODS
  getCurrentCapacity(): number {
    return this.heap.length;
  }

  getMaxCapacity(): number {
    return this.maxCapacity;
  }

  getCapacityUsage(): number {
    return (this.heap.length / this.maxCapacity) * 100;
  }

  // Force cleanup if needed
  forceEviction(percentage: number = 0.5): number {
    const targetSize = Math.floor(this.heap.length * (1 - percentage));
    const nodesToRemove = this.heap.length - targetSize;
    
    if (nodesToRemove <= 0) return 0;

    const sortedIndices = Array.from({ length: this.heap.length }, (_, i) => i)
      .sort((a, b) => this.compare(this.heap[b], this.heap[a]));

    const indicesToRemove = sortedIndices.slice(0, nodesToRemove).sort((a, b) => b - a);
    
    for (const index of indicesToRemove) {
      this.removeAtIndex(index);
    }

    return nodesToRemove;
  }
}

// Keep the old MinHeap for backward compatibility
export class MinHeap<T> extends BoundedMinHeap<T> {
  constructor(compareFunction: (a: T, b: T) => number) {
    super(compareFunction, Infinity, 'batch'); // Unlimited capacity
  }
}