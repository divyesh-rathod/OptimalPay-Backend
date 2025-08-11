 export class MinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compareFunction: (a: T, b: T) => number) {
    this.compare = compareFunction;
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

  // Public methods that replace your array operations
  push(item: T): void {
    this.heap.push(item);
    this.heapifyUp(this.heap.length - 1);
  }

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
}