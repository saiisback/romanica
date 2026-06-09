import type { EvaluatePolicy, PolicyDecision } from "@romanica/shared";

const REVIEW_ACTIONS = new Set([
  "agent.deploy",
  "workflow.publish",
  "worker_pool.scale",
  "secret.read",
  "secret.write",
]);

const DENY_ACTIONS = new Set([
  "project.delete",
  "audit.delete",
  "policy.disable",
]);

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

export function evaluatePolicy(input: EvaluatePolicy): PolicyDecision {
  const matchedRules: string[] = [];

  if (DENY_ACTIONS.has(input.action)) {
    matchedRules.push("deny_critical_control_plane_mutation");
    return {
      decision: "deny",
      reason: `${input.action} is blocked by project governance`,
      requiredApproval: false,
      matchedRules,
    };
  }

  if (bool(input.context.highRisk) || bool(input.context.destructive)) {
    matchedRules.push("review_high_risk_context");
  }

  if (REVIEW_ACTIONS.has(input.action)) {
    matchedRules.push("review_sensitive_action");
  }

  if (input.targetType === "secret") {
    matchedRules.push("review_secret_target");
  }

  if (matchedRules.length > 0) {
    return {
      decision: "review",
      reason: "human approval required before execution",
      requiredApproval: true,
      matchedRules,
    };
  }

  return {
    decision: "allow",
    reason: "no blocking policy matched",
    requiredApproval: false,
    matchedRules,
  };
}
