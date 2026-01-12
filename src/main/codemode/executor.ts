import * as vm from 'vm';
import type {
  CodemodeRequest,
  CodemodeResult,
  ToolCallLog,
} from '../../shared/types/query';

export interface McpToolExecutor {
  name: string;
  execute: (args: unknown) => Promise<unknown>;
}

export class CodemodeExecutor {
  private toolExecutors: Map<string, McpToolExecutor>;

  constructor(executors: McpToolExecutor[]) {
    this.toolExecutors = new Map(executors.map((e) => [e.name, e]));
  }

  addTool(executor: McpToolExecutor): void {
    this.toolExecutors.set(executor.name, executor);
  }

  removeTool(name: string): void {
    this.toolExecutors.delete(name);
  }

  async execute(request: CodemodeRequest): Promise<CodemodeResult> {
    const startTime = Date.now();
    const toolCalls: ToolCallLog[] = [];

    const mcp = this.createMcpProxy(toolCalls);

    const wrappedCode = `
      (async function(mcp) {
        ${request.code}
      })
    `;

    try {
      const context = vm.createContext({
        mcp,
        console: { log: () => {}, error: () => {}, warn: () => {} },
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        Math,
        RegExp,
        Promise,
        parseFloat,
        parseInt,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
      });

      const script = new vm.Script(wrappedCode);
      const fn = script.runInContext(context, {
        timeout: request.timeout || 30000,
      });
      const result = await fn(mcp);

      return {
        success: true,
        result,
        executionMs: Date.now() - startTime,
        toolCalls,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionMs: Date.now() - startTime,
        toolCalls,
      };
    }
  }

  private createMcpProxy(toolCalls: ToolCallLog[]): Record<string, unknown> {
    const executors = this.toolExecutors;

    return new Proxy(
      {},
      {
        get: (_, toolName: string) => {
          return async (args: unknown) => {
            const executor = executors.get(toolName);
            if (!executor) {
              throw new Error(`Unknown tool: ${toolName}`);
            }

            const callStart = Date.now();
            const result = await executor.execute(args);

            toolCalls.push({
              tool: toolName,
              args,
              result,
              durationMs: Date.now() - callStart,
            });

            return result;
          };
        },
      },
    );
  }
}
