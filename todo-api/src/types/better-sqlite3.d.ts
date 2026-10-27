declare module "better-sqlite3" {
  export default class Database {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): {
      all(params?: Record<string, unknown>): unknown[];
      get(params?: Record<string, unknown>): unknown;
      run(params?: Record<string, unknown>): {
        changes: number;
        lastInsertRowid: number;
      };
    };
  }
}
