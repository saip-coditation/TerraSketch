import React from "react";
import Badge from "./shared/Badge.jsx";

const TONE_RULES = [
  { match: /(ec2|vm|gce|instance|compute|kubernetes|eks|gke|aks|ecs|fargate|app[\s_-]?service)/i, tone: "compute" },
  { match: /(s3|gcs|storage[\s_-]?account|bucket|blob)/i, tone: "storage" },
  { match: /(rds|sql|postgres|mysql|aurora|cloud[\s_-]?sql|cosmos|database)/i, tone: "database" },
  { match: /(vpc|subnet|vnet|network|gateway|route|alb|nlb|load[\s_-]?balancer|cloudfront|dns|firewall)/i, tone: "network" },
  { match: /(iam|role|policy|secret|key[\s_-]?vault|kms|security[\s_-]?group|nsg|cloud[\s_-]?armor)/i, tone: "security" },
  { match: /(lambda|function|cloud[\s_-]?run|cloud[\s_-]?function|api[\s_-]?gateway)/i, tone: "serverless" },
  { match: /(sqs|sns|pubsub|service[\s_-]?bus|queue|topic|kafka)/i, tone: "messaging" },
];

function toneFor(label) {
  for (const rule of TONE_RULES) {
    if (rule.match.test(label)) return rule.tone;
  }
  return "default";
}

export default function ResourceMap({ resources = [] }) {
  if (!resources.length) {
    return (
      <p className="text-sm text-slate-400">
        No resources were extracted from the input.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {resources.map((r, idx) => (
        <Badge key={`${r}-${idx}`} tone={toneFor(r)}>
          {r}
        </Badge>
      ))}
    </div>
  );
}
