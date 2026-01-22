export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface PlanExecutionStatus {
  planId: string;
  executionStatus: ExecutionStatus;
  lastExecutedAt?: string | null;
  executionDurationMs?: number | null;
  errorMessage?: string | null;
  exitCode?: number | null;
}

export interface StackExecutionStatus {
  stackName: string;
  planStatuses: Record<string, PlanExecutionStatus>;
  lastRunAt?: string | null;
  isRunning: boolean;
}
