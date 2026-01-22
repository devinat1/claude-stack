import type { Plan, StackPlan } from '../types/index.js';

interface DependencyNode {
  planId: string;
  dependsOnPlanIds: string[];
  dependentPlanIds: string[];
}

interface TopologicalSortResult {
  sortedPlanIds: string[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

/**
 * Build a dependency graph from plans based on their references
 */
export const buildDependencyGraph = ({
  plans,
  availablePlanIds,
}: {
  plans: Plan[];
  availablePlanIds: Set<string>;
}): Map<string, DependencyNode> => {
  const graph = new Map<string, DependencyNode>();

  // Initialize nodes for all plans
  plans.forEach((plan) => {
    graph.set(plan.planId, {
      planId: plan.planId,
      dependsOnPlanIds: [],
      dependentPlanIds: [],
    });
  });

  // Build edges based on references
  plans.forEach((plan) => {
    const node = graph.get(plan.planId);
    if (!node) return;

    // Filter references to only include plans that exist in the available set
    const validDependencies = plan.references.filter((refId) =>
      availablePlanIds.has(refId)
    );

    node.dependsOnPlanIds = validDependencies;

    // Update reverse dependencies
    validDependencies.forEach((depId) => {
      const depNode = graph.get(depId);
      if (depNode) {
        depNode.dependentPlanIds.push(plan.planId);
      }
    });
  });

  return graph;
};

/**
 * Detect cycles in the dependency graph using DFS
 */
export const detectCycle = ({
  graph,
}: {
  graph: Map<string, DependencyNode>;
}): { hasCycle: boolean; cycleNodes: string[] } => {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycleNodes: string[] = [];

  const dfs = (nodeId: string, path: string[]): boolean => {
    visited.add(nodeId);
    recursionStack.add(path.join(' -> '));

    const node = graph.get(nodeId);
    if (!node) return false;

    for (const depId of node.dependsOnPlanIds) {
      if (!visited.has(depId)) {
        if (dfs(depId, [...path, depId])) {
          return true;
        }
      } else if (path.includes(depId)) {
        // Found a cycle
        const cycleStart = path.indexOf(depId);
        cycleNodes.push(...path.slice(cycleStart), depId);
        return true;
      }
    }

    return false;
  };

  for (const nodeId of graph.keys()) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId, [nodeId])) {
        return { hasCycle: true, cycleNodes };
      }
    }
  }

  return { hasCycle: false, cycleNodes: [] };
};

/**
 * Perform topological sort using Kahn's algorithm
 */
export const topologicalSort = ({
  graph,
}: {
  graph: Map<string, DependencyNode>;
}): TopologicalSortResult => {
  const cycleResult = detectCycle({ graph });
  if (cycleResult.hasCycle) {
    return {
      sortedPlanIds: [],
      hasCycle: true,
      cycleNodes: cycleResult.cycleNodes,
    };
  }

  const inDegree = new Map<string, number>();
  const sortedPlanIds: string[] = [];

  // Calculate in-degrees - initialize all nodes to 0
  graph.forEach((_, nodeId) => {
    if (!inDegree.has(nodeId)) {
      inDegree.set(nodeId, 0);
    }
  });

  graph.forEach((node) => {
    const dependencyCount = node.dependsOnPlanIds.length;
    if (dependencyCount > 0) {
      inDegree.set(node.planId, dependencyCount);
    }
  });

  // Find nodes with no dependencies (in-degree = 0)
  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  // Process nodes in topological order
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) continue;

    sortedPlanIds.push(nodeId);

    const node = graph.get(nodeId);
    if (!node) continue;

    // Reduce in-degree of dependent nodes
    node.dependentPlanIds.forEach((depId) => {
      const currentDegree = inDegree.get(depId) ?? 0;
      const newDegree = currentDegree - 1;
      inDegree.set(depId, newDegree);

      if (newDegree === 0) {
        queue.push(depId);
      }
    });
  }

  return {
    sortedPlanIds,
    hasCycle: false,
  };
};

/**
 * Find root plans (plans with no dependencies within the stack)
 */
export const findRootPlans = ({
  graph,
}: {
  graph: Map<string, DependencyNode>;
}): string[] => {
  const rootPlanIds: string[] = [];

  graph.forEach((node, nodeId) => {
    if (node.dependsOnPlanIds.length === 0) {
      rootPlanIds.push(nodeId);
    }
  });

  return rootPlanIds;
};

/**
 * Convert plans to StackPlan format with resolved dependencies
 */
export const plansToStackPlans = ({
  plans,
}: {
  plans: Plan[];
}): StackPlan[] => {
  const availablePlanIds = new Set(plans.map((p) => p.planId));
  const graph = buildDependencyGraph({ plans, availablePlanIds });

  return plans.map((plan) => {
    const node = graph.get(plan.planId);
    return {
      planId: plan.planId,
      dependsOnPlanIds: node?.dependsOnPlanIds ?? [],
      executionStatus: 'pending' as const,
      lastExecutedAt: null,
      executionDurationMs: null,
    };
  });
};

/**
 * Get execution order for a stack
 */
export const getExecutionOrder = ({
  stackPlans,
}: {
  stackPlans: StackPlan[];
}): TopologicalSortResult => {
  const graph = new Map<string, DependencyNode>();

  stackPlans.forEach((stackPlan) => {
    graph.set(stackPlan.planId, {
      planId: stackPlan.planId,
      dependsOnPlanIds: stackPlan.dependsOnPlanIds,
      dependentPlanIds: [],
    });
  });

  // Build reverse dependencies
  stackPlans.forEach((stackPlan) => {
    stackPlan.dependsOnPlanIds.forEach((depId) => {
      const depNode = graph.get(depId);
      if (depNode) {
        depNode.dependentPlanIds.push(stackPlan.planId);
      }
    });
  });

  return topologicalSort({ graph });
};
