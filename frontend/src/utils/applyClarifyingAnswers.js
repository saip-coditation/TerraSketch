/**
 * Patches a DiagramIR or ResourcePlan with the user's MCQ answers, client-side,
 * so the edited object can be POSTed straight to the existing HITL edit
 * endpoints (`/ir/edit`, `/plan/edit`) — no new backend endpoint needed.
 *
 * `answers` is `{ [questionId]: selectedOptionIndex }`. A single round of
 * `questions` only ever contains one `kind` (see graph.py's two pause points).
 */

export function applyStructuralAnswers(diagramIr, questions, answers) {
  const nodes = diagramIr.nodes.map((n) => ({ ...n }));
  const ambiguities = (diagramIr.ambiguities || []).slice();

  for (const q of questions) {
    if (q.kind !== "structural") continue;
    const idx = answers[q.id] ?? q.recommended_index ?? 0;
    const value = q.options[idx]?.value;
    const node = nodes.find((n) => n.id === q.target_node_id);
    if (node && value != null) {
      node.kind = value;
      node.confidence = 1.0;
    }
    const ambIdx = ambiguities.findIndex((a) => a.node_id === q.target_node_id);
    if (ambIdx !== -1) ambiguities.splice(ambIdx, 1);
  }

  return { ...diagramIr, nodes, ambiguities };
}

export function applyConfigurationAnswers(resourcePlan, questions, answers) {
  const resources = resourcePlan.resources.map((r) => ({ ...r, args: { ...r.args } }));

  for (const q of questions) {
    if (q.kind !== "configuration") continue;
    const idx = answers[q.id] ?? q.recommended_index ?? 0;
    const value = q.options[idx]?.value;
    const resource = resources.find((r) => r.local_id === q.target_resource_id);
    if (resource && value != null) {
      resource.args[q.target_field] = value;
    }
  }

  return { ...resourcePlan, resources };
}
