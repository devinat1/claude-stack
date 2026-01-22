import type { ExecutionStatus } from './status.js';

export interface Stack {
  stackName: string;
  stackDescription?: string | null;
  plans: StackPlan[];
  rootPlanIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StackPlan {
  planId: string;
  dependsOnPlanIds: string[];
  executionStatus: ExecutionStatus;
  lastExecutedAt?: string | null;
  executionDurationMs?: number | null;
}

export interface StackCreateOptions {
  stackName: string;
  stackDescription?: string | null;
  planIds: string[];
  autoResolveDependencies?: boolean;
}
