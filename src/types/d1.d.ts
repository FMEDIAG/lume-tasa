/// <reference types="@cloudflare/workers-types" />

declare module "@cloudflare/workers-types" {
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    exec(query: string): Promise<D1Result>;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    run<T = unknown>(): Promise<D1Result<T>>;
    all<T = unknown>(): Promise<D1Result<T[]>>;
    first<T = unknown>(): Promise<T | null>;
    raw<T = unknown>(): Promise<T[]>;
  }

  interface D1Result<T = unknown> {
    results: T[];
    meta: {
      changes: number;
      last_row_id: number;
      duration: number;
    };
  }
}

export {};