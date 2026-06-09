use std::collections::{BTreeMap, BTreeSet, VecDeque};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CompileError {
    #[error("workflow must contain at least one node")]
    EmptyWorkflow,
    #[error("node id must not be empty")]
    EmptyNodeId,
    #[error("duplicate node id {0}")]
    DuplicateNode(String),
    #[error("edge references missing node: {0}")]
    MissingNode(String),
    #[error("workflow contains a cycle")]
    Cycle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDefinition {
    #[serde(default)]
    pub nodes: Vec<WorkflowNode>,
    #[serde(default)]
    pub edges: Vec<WorkflowEdge>,
    #[serde(default)]
    pub metadata: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub config: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkflowEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPlan {
    pub node_count: usize,
    pub edge_count: usize,
    pub stages: Vec<ExecutionStage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionStage {
    pub index: usize,
    pub node_ids: Vec<String>,
}

pub fn compile(definition: &WorkflowDefinition) -> Result<ExecutionPlan, CompileError> {
    validate(definition)?;

    let mut incoming: BTreeMap<String, usize> = definition
        .nodes
        .iter()
        .map(|node| (node.id.clone(), 0))
        .collect();
    let mut outgoing: BTreeMap<String, BTreeSet<String>> = definition
        .nodes
        .iter()
        .map(|node| (node.id.clone(), BTreeSet::new()))
        .collect();

    for edge in &definition.edges {
        *incoming.get_mut(&edge.to).expect("validated") += 1;
        outgoing
            .get_mut(&edge.from)
            .expect("validated")
            .insert(edge.to.clone());
    }

    let mut ready = incoming
        .iter()
        .filter_map(|(id, count)| (*count == 0).then_some(id.clone()))
        .collect::<VecDeque<_>>();

    let mut visited = 0;
    let mut stages = Vec::new();
    while !ready.is_empty() {
        let stage_nodes = ready.drain(..).collect::<Vec<_>>();
        visited += stage_nodes.len();

        let mut next = BTreeSet::new();
        for id in &stage_nodes {
            for child in outgoing.get(id).into_iter().flatten() {
                let count = incoming.get_mut(child).expect("validated");
                *count -= 1;
                if *count == 0 {
                    next.insert(child.clone());
                }
            }
        }

        stages.push(ExecutionStage {
            index: stages.len(),
            node_ids: stage_nodes,
        });
        ready = next.into_iter().collect();
    }

    if visited != definition.nodes.len() {
        return Err(CompileError::Cycle);
    }

    Ok(ExecutionPlan {
        node_count: definition.nodes.len(),
        edge_count: definition.edges.len(),
        stages,
    })
}

pub fn validate(definition: &WorkflowDefinition) -> Result<(), CompileError> {
    if definition.nodes.is_empty() {
        return Err(CompileError::EmptyWorkflow);
    }

    let mut seen = BTreeSet::new();
    for node in &definition.nodes {
        if node.id.trim().is_empty() {
            return Err(CompileError::EmptyNodeId);
        }
        if !seen.insert(node.id.clone()) {
            return Err(CompileError::DuplicateNode(node.id.clone()));
        }
    }

    for edge in &definition.edges {
        if !seen.contains(&edge.from) {
            return Err(CompileError::MissingNode(edge.from.clone()));
        }
        if !seen.contains(&edge.to) {
            return Err(CompileError::MissingNode(edge.to.clone()));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn node(id: &str, node_type: &str) -> WorkflowNode {
        WorkflowNode {
            id: id.to_string(),
            node_type: node_type.to_string(),
            config: Map::new(),
        }
    }

    #[test]
    fn compiles_dag_into_parallel_stages() {
        let definition = WorkflowDefinition {
            nodes: vec![
                node("triage", "agent"),
                node("search", "retrieval"),
                node("draft", "llm"),
                node("approval", "human"),
            ],
            edges: vec![
                WorkflowEdge { from: "triage".into(), to: "search".into() },
                WorkflowEdge { from: "triage".into(), to: "draft".into() },
                WorkflowEdge { from: "search".into(), to: "approval".into() },
                WorkflowEdge { from: "draft".into(), to: "approval".into() },
            ],
            metadata: Map::new(),
        };

        let plan = compile(&definition).unwrap();
        assert_eq!(plan.node_count, 4);
        assert_eq!(plan.edge_count, 4);
        assert_eq!(plan.stages[0].node_ids, vec!["triage"]);
        assert_eq!(plan.stages[1].node_ids, vec!["draft", "search"]);
        assert_eq!(plan.stages[2].node_ids, vec!["approval"]);
    }

    #[test]
    fn rejects_missing_nodes() {
        let definition = WorkflowDefinition {
            nodes: vec![node("a", "agent")],
            edges: vec![WorkflowEdge { from: "a".into(), to: "b".into() }],
            metadata: Map::new(),
        };
        assert_eq!(validate(&definition), Err(CompileError::MissingNode("b".into())));
    }

    #[test]
    fn rejects_cycles() {
        let definition = WorkflowDefinition {
            nodes: vec![node("a", "agent"), node("b", "agent")],
            edges: vec![
                WorkflowEdge { from: "a".into(), to: "b".into() },
                WorkflowEdge { from: "b".into(), to: "a".into() },
            ],
            metadata: Map::new(),
        };
        assert_eq!(compile(&definition), Err(CompileError::Cycle));
    }

    #[test]
    fn deserializes_workflow_definition() {
        let definition: WorkflowDefinition = serde_json::from_value(serde_json::json!({
            "nodes": [{ "id": "a", "type": "agent" }],
            "edges": []
        }))
        .unwrap();
        let plan = compile(&definition).unwrap();
        assert_eq!(plan.stages[0].node_ids, vec!["a"]);
    }
}

