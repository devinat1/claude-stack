import type { Stack, StackPlan, StackCreateOptions } from '../types/index.js';
import { loadPlanById } from './plan-parser.js';
import {
  buildDependencyGraph,
  findRootPlans,
  plansToStackPlans,
} from './dependency-graph.js';
import {
  loadStack,
  saveStack,
  deleteStack,
  listStacks,
  stackExists,
} from '../storage/stack-store.js';

export { loadStack, deleteStack, listStacks, stackExists };

/**
 * Create a new stack from plan IDs
 */
export const createStack = async ({
  stackName,
  stackDescription,
  planIds,
  autoResolveDependencies = true,
}: StackCreateOptions): Promise<Stack> => {
  // Load all specified plans
  const plans = await Promise.all(
    planIds.map((planId) => loadPlanById({ planId }))
  );

  const validPlans = plans.filter(
    (plan): plan is NonNullable<typeof plan> => plan !== null
  );

  if (validPlans.length === 0) {
    throw new Error('No valid plans found for the specified plan IDs.');
  }

  // Track original plan IDs as roots (these are the user-specified entry points)
  const originalPlanIds = validPlans.map((p) => p.planId);

  // If auto-resolve is enabled, also include any referenced plans
  const finalPlans = autoResolveDependencies
    ? await resolveAllDependencies({ plans: validPlans })
    : validPlans;

  const availablePlanIds = new Set(finalPlans.map((p) => p.planId));
  const graph = buildDependencyGraph({ plans: finalPlans, availablePlanIds });

  // Use original plan IDs as roots, or fall back to computed roots if available
  const computedRoots = findRootPlans({ graph });
  const rootPlanIds = computedRoots.length > 0 ? computedRoots : originalPlanIds;

  const stackPlans = plansToStackPlans({ plans: finalPlans });

  const stack: Stack = {
    stackName,
    stackDescription: stackDescription ?? null,
    plans: stackPlans,
    rootPlanIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveStack({ stack });
  return stack;
};

/**
 * Recursively resolve all plan dependencies
 */
const resolveAllDependencies = async ({
  plans,
}: {
  plans: NonNullable<Awaited<ReturnType<typeof loadPlanById>>>[];
}): Promise<NonNullable<Awaited<ReturnType<typeof loadPlanById>>>[]> => {
  const allPlanIds = new Set(plans.map((p) => p.planId));
  const allPlans = [...plans];
  const toResolve = plans.flatMap((p) => p.references);

  while (toResolve.length > 0) {
    const refId = toResolve.pop();
    if (!refId || allPlanIds.has(refId)) continue;

    const refPlan = await loadPlanById({ planId: refId });
    if (refPlan) {
      allPlanIds.add(refPlan.planId);
      allPlans.push(refPlan);
      toResolve.push(...refPlan.references);
    }
  }

  return allPlans;
};

/**
 * Add plans to an existing stack
 */
export const addPlansToStack = async ({
  stackName,
  planIds,
  autoResolveDependencies = true,
}: {
  stackName: string;
  planIds: string[];
  autoResolveDependencies?: boolean;
}): Promise<Stack> => {
  const existingStack = await loadStack({ stackName });

  if (!existingStack) {
    throw new Error(`Stack '${stackName}' not found.`);
  }

  const existingPlanIds = new Set(existingStack.plans.map((p) => p.planId));
  const newPlanIds = planIds.filter((id) => !existingPlanIds.has(id));

  if (newPlanIds.length === 0) {
    return existingStack;
  }

  const newPlans = await Promise.all(
    newPlanIds.map((planId) => loadPlanById({ planId }))
  );

  const validNewPlans = newPlans.filter(
    (plan): plan is NonNullable<typeof plan> => plan !== null
  );

  if (validNewPlans.length === 0) {
    return existingStack;
  }

  // Load existing plans to rebuild the graph
  const existingPlans = await Promise.all(
    existingStack.plans.map((sp) => loadPlanById({ planId: sp.planId }))
  );

  const allValidPlans = [
    ...existingPlans.filter(
      (p): p is NonNullable<typeof p> => p !== null
    ),
    ...validNewPlans,
  ];

  const finalPlans = autoResolveDependencies
    ? await resolveAllDependencies({ plans: allValidPlans })
    : allValidPlans;

  const availablePlanIds = new Set(finalPlans.map((p) => p.planId));
  const graph = buildDependencyGraph({ plans: finalPlans, availablePlanIds });
  const rootPlanIds = findRootPlans({ graph });
  const stackPlans = plansToStackPlans({ plans: finalPlans });

  // Preserve execution status for existing plans
  const updatedStackPlans = stackPlans.map((sp) => {
    const existingPlan = existingStack.plans.find(
      (ep) => ep.planId === sp.planId
    );
    if (existingPlan) {
      return {
        ...sp,
        executionStatus: existingPlan.executionStatus,
        lastExecutedAt: existingPlan.lastExecutedAt,
        executionDurationMs: existingPlan.executionDurationMs,
      };
    }
    return sp;
  });

  const updatedStack: Stack = {
    ...existingStack,
    plans: updatedStackPlans,
    rootPlanIds,
    updatedAt: new Date().toISOString(),
  };

  await saveStack({ stack: updatedStack });
  return updatedStack;
};

/**
 * Remove plans from a stack
 */
export const removePlansFromStack = async ({
  stackName,
  planIds,
}: {
  stackName: string;
  planIds: string[];
}): Promise<Stack> => {
  const existingStack = await loadStack({ stackName });

  if (!existingStack) {
    throw new Error(`Stack '${stackName}' not found.`);
  }

  const planIdsToRemove = new Set(planIds);
  const remainingPlans = existingStack.plans.filter(
    (p) => !planIdsToRemove.has(p.planId)
  );

  if (remainingPlans.length === 0) {
    throw new Error('Cannot remove all plans from a stack.');
  }

  // Rebuild graph with remaining plans
  const plans = await Promise.all(
    remainingPlans.map((sp) => loadPlanById({ planId: sp.planId }))
  );

  const validPlans = plans.filter(
    (p): p is NonNullable<typeof p> => p !== null
  );

  const availablePlanIds = new Set(validPlans.map((p) => p.planId));
  const graph = buildDependencyGraph({ plans: validPlans, availablePlanIds });
  const rootPlanIds = findRootPlans({ graph });

  // Update dependencies for remaining plans
  const updatedStackPlans = remainingPlans.map((sp) => ({
    ...sp,
    dependsOnPlanIds: sp.dependsOnPlanIds.filter(
      (depId) => !planIdsToRemove.has(depId)
    ),
  }));

  const updatedStack: Stack = {
    ...existingStack,
    plans: updatedStackPlans,
    rootPlanIds,
    updatedAt: new Date().toISOString(),
  };

  await saveStack({ stack: updatedStack });
  return updatedStack;
};

/**
 * Create a stack from a single plan, automatically including all its references
 */
export const createStackFromPlan = async ({
  planId,
  stackName,
  stackDescription,
}: {
  planId: string;
  stackName?: string;
  stackDescription?: string;
}): Promise<Stack> => {
  const plan = await loadPlanById({ planId });

  if (!plan) {
    throw new Error(`Plan '${planId}' not found.`);
  }

  const finalStackName = stackName ?? planId;

  return createStack({
    stackName: finalStackName,
    stackDescription: stackDescription ?? `Stack created from ${planId}`,
    planIds: [planId],
    autoResolveDependencies: true,
  });
};

/**
 * Update stack plan status (called during execution)
 */
export const updateStackPlanStatus = async ({
  stackName,
  planId,
  updates,
}: {
  stackName: string;
  planId: string;
  updates: Partial<StackPlan>;
}): Promise<Stack> => {
  const stack = await loadStack({ stackName });

  if (!stack) {
    throw new Error(`Stack '${stackName}' not found.`);
  }

  const updatedPlans = stack.plans.map((sp) =>
    sp.planId === planId ? { ...sp, ...updates } : sp
  );

  const updatedStack: Stack = {
    ...stack,
    plans: updatedPlans,
    updatedAt: new Date().toISOString(),
  };

  await saveStack({ stack: updatedStack });
  return updatedStack;
};
