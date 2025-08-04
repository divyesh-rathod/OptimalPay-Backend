declare module 'javascript-lp-solver' {
  interface Variable {
    [constraintName: string]: number;
  }

  interface Constraint {
    [variableName: string]: number;
    min?: number;
    max?: number;
    equal?: number;
  }

  interface Model {
    optimize: string;
    opType: 'max' | 'min';
    constraints: {
      [constraintName: string]: Constraint;
    };
    variables: {
      [variableName: string]: Variable;
    };
    ints?: {
      [variableName: string]: 1;
    };
    unrestricted?: {
      [variableName: string]: 1;
    };
    binaries?: {
      [variableName: string]: 1;
    };
  }

  interface Solution {
    feasible: boolean;
    result: number;
    bounded: boolean;
    isIntegral: boolean;
    [variableName: string]: any;
  }

  interface Model {
    optimize: string;
    opType: 'max' | 'min';
    constraints: {
      [constraintName: string]: Constraint;
    };
    variables: {
      [variableName: string]: Variable;
    };
    ints?: {
      [variableName: string]: 1;
    };
    unrestricted?: {
      [variableName: string]: 1;
    };
    binaries?: {
      [variableName: string]: 1;
    };
  }

  interface Solution {
    feasible: boolean;
    result: number;
    bounded: boolean;
    isIntegral: boolean;
    [variableName: string]: any;
  }

  function Solve(model: Model): Solution;
  
  export = Solve;
}