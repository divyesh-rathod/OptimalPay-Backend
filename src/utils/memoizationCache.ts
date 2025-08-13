// src/utils/memoizationCache.ts

// Your existing discretization function (copy from optimization.service.ts)
const discretizeBalance = (balance: number): number => {
  if (balance <= 1) return 0;
  if (balance <= 500) return Math.round(balance / 25) * 25;    // $25 steps for small
  if (balance <= 5000) return Math.round(balance / 100) * 100; // $100 steps for medium  
  return Math.round(balance / 250) * 250;                      // $250 steps for large
};

// Your existing 3-hash function (enhanced)
const createBalanceHash = (balances: number[]): number => {
  let hash1 = 0;
  const primes = [982451653, 982451679, 982451707, 982451719, 982451783];
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i]);
    hash1 = (hash1 + (discretized * primes[i % primes.length])) >>> 0;
  }
  
  // Level 2: Bit rotation with Fibonacci numbers
  let hash2 = 0;
  const fibonacci = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i]);
    hash2 = ((hash2 << 7) - hash2 + (discretized * fibonacci[i % fibonacci.length])) >>> 0;
  }
  
  // Level 3: XOR with golden ratio multiplication
  let hash3 = 0;
  const goldenRatio = 0x9e3779b9; // (√5 - 1) / 2 * 2^32
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i]);
    hash3 = (hash3 ^ (discretized * goldenRatio)) >>> 0;
  }
  
  // Combine all three levels with bit mixing
  const combined = hash1 ^ (hash2 << 11) ^ (hash3 << 21);
  return combined >>> 0;
};

// NEW: Enhanced memoization key with context
export const createMemoizationKey = (
  balances: number[], 
  currentMonth: number,
  availableBudget: number,
  freedUpBudget: number,
  freedUpAvailableMonth: number
): number => {
  
  // Get your sophisticated balance hash
  const balanceHash = createBalanceHash(balances);
  
  // Create context hash from timeline/budget info
  const contextHash = (
    (currentMonth << 20) ^                              // Month: up to 2^12 = 4096 months
    ((Math.round(availableBudget / 50) & 0xFFF) << 8) ^ // Budget: rounded to $50, 12 bits
    ((Math.round(freedUpBudget / 50) & 0xFF) << 0) ^    // Freed budget: 8 bits  
    ((freedUpAvailableMonth & 0xFF) << 16)              // Freed month: 8 bits
  ) >>> 0;
  
  // Combine balance hash with context using bit mixing
  const finalKey = (balanceHash ^ (contextHash << 13) ^ (contextHash >>> 19)) >>> 0;
  
  return finalKey;
};

// Cache value interface
export interface MemoizedSolution {
  optimalMonths: number;           // Months to completion from this state
  totalInterest: number;           // Total interest cost from this state  
  optimalFirstPayments: number[];  // Best payment allocation for first month
  confidence: number;              // How reliable this cached solution is (0-100)
  cacheHits: number;               // Track how often this is reused
  cachedAt: number;                // Timestamp when cached
}

// Global cache instance
export const solutionCache = new Map<number, MemoizedSolution>();

// Cache statistics
export class CacheStats {
  public hits = 0;
  public misses = 0;
  public stores = 0;
  public startTime = Date.now();

  hit() {
    this.hits++;
  }

  miss() {
    this.misses++;
  }

  store() {
    this.stores++;
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : (this.hits / total) * 100;
  }

  logResults() {
    const endTime = Date.now();
    console.log(`📊 MEMOIZATION PERFORMANCE:`);
    console.log(`   Cache hits: ${this.hits}`);
    console.log(`   Cache misses: ${this.misses}`);
    console.log(`   Cache stores: ${this.stores}`);
    console.log(`   Hit rate: ${this.getHitRate().toFixed(1)}%`);
    console.log(`   Cache size: ${solutionCache.size} entries`);
    console.log(`   Total time: ${endTime - this.startTime}ms`);
  }
}