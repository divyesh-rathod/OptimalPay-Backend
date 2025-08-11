// 🚀 HEURISTIC CACHING SYSTEM

const createFastStateKey = (balances: number[]): number => {
  // Each debt gets 12 bits (4096 possible values per debt)
  // 5 debts × 12 bits = 60 bits (fits in JavaScript's 53-bit precision)
  let key = 0;
  
  for (let i = 0; i < Math.min(balances.length, 5); i++) {
    const discretized = Math.min(4095, discretizeBalance(balances[i]) / 10); // Scale to fit 12 bits
    key = (key << 12) | discretized;
  }
  
  return key;
};

 const discretizeBalance = (balance: number): number => {
  if (balance <= 1) return 0;
  if (balance <= 500) return Math.round(balance / 25) * 25;    // $25 steps for small
  if (balance <= 5000) return Math.round(balance / 100) * 100; // $100 steps for medium  
  return Math.round(balance / 250) * 250;                      // $250 steps for large
};

 export class HeuristicCache {
  private cache = new Map<number, number>();
  private maxCacheSize = 10000; // Prevent memory bloat
  
  // Create cache key from balance pattern
  private createCacheKey(balances: number[]): number {
    // Round balances to nearest $500 for caching (groups similar states)
    const roundedBalances = balances.map(balance => Math.round(balance / 500) * 500);
    return createFastStateKey(roundedBalances);
  }
  
  get(balances: number[]): number | undefined {
    const key = this.createCacheKey(balances);
    return this.cache.get(key);
  }
  
  set(balances: number[], heuristic: number): void {
    // Prevent cache from growing too large
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest 20% of entries (simple LRU approximation)
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxCacheSize * 0.2));
      keysToDelete.forEach(key => this.cache.delete(key));
    }
    
    const key = this.createCacheKey(balances);
    this.cache.set(key, heuristic);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  get size(): number {
    return this.cache.size;
     }
     
}

// Create cache instance (outside the function)
const heuristicCache = new HeuristicCache();