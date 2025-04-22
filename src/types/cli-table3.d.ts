declare module "cli-table3" {
  interface TableOptions {
    head?: string[];
    wordWrap?: boolean;
    wrapOnWordBoundary?: boolean;
    [key: string]: any;
  }

  class Table {
    constructor(options?: TableOptions);
    push(row: any[]): void;
    toString(): string;
  }

  export = Table;
}
