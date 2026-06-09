use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;
use uuid::Uuid;

const MAX_TRACES: usize = 1_000;
const MAX_SPANS_PER_TRACE: usize = 10_000;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum IngestError {
    #[error("payload must contain at least one trace")]
    EmptyPayload,
    #[error("payload exceeds max trace count ({0})")]
    TooManyTraces(usize),
    #[error("trace {trace_id} exceeds max span count ({span_count})")]
    TooManySpans { trace_id: Uuid, span_count: usize },
    #[error("field {field} must not be empty")]
    EmptyField { field: &'static str },
    #[error("span {span_id} references missing parent {parent_span_id}")]
    MissingParent {
        span_id: Uuid,
        parent_span_id: Uuid,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestPayload {
    pub traces: Vec<IngestTrace>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestTrace {
    pub trace_id: Uuid,
    pub name: String,
    #[serde(default = "default_trace_status")]
    pub status: TraceStatus,
    pub start_time: u64,
    pub end_time: Option<u64>,
    #[serde(default)]
    pub metadata: Map<String, Value>,
    #[serde(default)]
    pub spans: Vec<IngestSpan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestSpan {
    pub span_id: Uuid,
    #[serde(default)]
    pub parent_span_id: Option<Uuid>,
    #[serde(rename = "type")]
    pub span_type: SpanType,
    pub name: String,
    #[serde(default = "default_span_status")]
    pub status: SpanStatus,
    pub start_time: u64,
    pub end_time: Option<u64>,
    #[serde(default)]
    pub input: Option<Value>,
    #[serde(default)]
    pub output: Option<Value>,
    #[serde(default)]
    pub error: Option<SpanError>,
    #[serde(default)]
    pub attributes: Map<String, Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TraceStatus {
    Ok,
    Error,
    Running,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SpanStatus {
    Ok,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SpanType {
    Llm,
    Tool,
    Retrieval,
    Agent,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SpanError {
    pub message: String,
    #[serde(default)]
    pub stack: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PayloadSummary {
    pub traces_received: usize,
    pub spans_received: usize,
    pub traces: Vec<TraceRollup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TraceRollup {
    pub trace_id: Uuid,
    pub duration_ms: Option<u64>,
    pub span_count: usize,
    pub total_tokens: u64,
    pub total_cost_usd: f64,
}

pub fn validate_payload(payload: &IngestPayload) -> Result<(), IngestError> {
    if payload.traces.is_empty() {
        return Err(IngestError::EmptyPayload);
    }
    if payload.traces.len() > MAX_TRACES {
        return Err(IngestError::TooManyTraces(payload.traces.len()));
    }

    for trace in &payload.traces {
        if trace.name.trim().is_empty() {
            return Err(IngestError::EmptyField { field: "trace.name" });
        }
        if trace.spans.len() > MAX_SPANS_PER_TRACE {
            return Err(IngestError::TooManySpans {
                trace_id: trace.trace_id,
                span_count: trace.spans.len(),
            });
        }

        let ids = trace
            .spans
            .iter()
            .map(|span| span.span_id)
            .collect::<std::collections::HashSet<_>>();

        for span in &trace.spans {
            if span.name.trim().is_empty() {
                return Err(IngestError::EmptyField { field: "span.name" });
            }
            if let Some(parent_span_id) = span.parent_span_id {
                if !ids.contains(&parent_span_id) {
                    return Err(IngestError::MissingParent {
                        span_id: span.span_id,
                        parent_span_id,
                    });
                }
            }
        }
    }

    Ok(())
}

pub fn summarize_payload(payload: &IngestPayload) -> Result<PayloadSummary, IngestError> {
    validate_payload(payload)?;

    let traces = payload
        .traces
        .iter()
        .map(|trace| {
            let (total_tokens, total_cost_usd) = trace.spans.iter().fold((0, 0.0), |acc, span| {
                let tokens = span_tokens(span);
                let cost = explicit_cost(span)
                    .unwrap_or_else(|| estimate_cost_usd(span_model(span), span_prompt_tokens(span), span_completion_tokens(span)));
                (acc.0 + tokens, acc.1 + cost)
            });
            TraceRollup {
                trace_id: trace.trace_id,
                duration_ms: duration_ms(trace.start_time, trace.end_time),
                span_count: trace.spans.len(),
                total_tokens,
                total_cost_usd,
            }
        })
        .collect::<Vec<_>>();

    Ok(PayloadSummary {
        traces_received: payload.traces.len(),
        spans_received: payload.traces.iter().map(|trace| trace.spans.len()).sum(),
        traces,
    })
}

fn span_tokens(span: &IngestSpan) -> u64 {
    attr_u64(&span.attributes, "totalTokens")
        .unwrap_or_else(|| span_prompt_tokens(span) + span_completion_tokens(span))
}

fn span_prompt_tokens(span: &IngestSpan) -> u64 {
    attr_u64(&span.attributes, "promptTokens").unwrap_or(0)
}

fn span_completion_tokens(span: &IngestSpan) -> u64 {
    attr_u64(&span.attributes, "completionTokens").unwrap_or(0)
}

fn explicit_cost(span: &IngestSpan) -> Option<f64> {
    attr_f64(&span.attributes, "costUsd")
}

fn span_model(span: &IngestSpan) -> Option<&str> {
    span.attributes.get("model").and_then(Value::as_str)
}

fn duration_ms(start: u64, end: Option<u64>) -> Option<u64> {
    end.map(|end| end.saturating_sub(start))
}

fn attr_u64(attrs: &Map<String, Value>, key: &str) -> Option<u64> {
    attrs.get(key).and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_f64().filter(|n| *n >= 0.0).map(|n| n as u64))
    })
}

fn attr_f64(attrs: &Map<String, Value>, key: &str) -> Option<f64> {
    attrs.get(key).and_then(Value::as_f64)
}

fn estimate_cost_usd(model: Option<&str>, prompt_tokens: u64, completion_tokens: u64) -> f64 {
    let Some(model) = model else {
        return 0.0;
    };
    let Some(price) = model_price(model) else {
        return 0.0;
    };
    (prompt_tokens as f64 / 1_000_000.0) * price.input
        + (completion_tokens as f64 / 1_000_000.0) * price.output
}

#[derive(Clone, Copy)]
struct ModelPrice {
    input: f64,
    output: f64,
}

fn model_price(model: &str) -> Option<ModelPrice> {
    let lower = model.to_lowercase();
    let key = MODEL_PRICES
        .iter()
        .filter_map(|(key, price)| lower.starts_with(key).then_some((*key, *price)))
        .max_by_key(|(key, _)| key.len())
        .map(|(_, price)| price)?;
    Some(key)
}

const MODEL_PRICES: &[(&str, ModelPrice)] = &[
    ("gpt-4o", ModelPrice { input: 2.5, output: 10.0 }),
    ("gpt-4o-mini", ModelPrice { input: 0.15, output: 0.6 }),
    ("gpt-4.1", ModelPrice { input: 2.0, output: 8.0 }),
    ("gpt-4.1-mini", ModelPrice { input: 0.4, output: 1.6 }),
    ("o3", ModelPrice { input: 2.0, output: 8.0 }),
    ("o3-mini", ModelPrice { input: 1.1, output: 4.4 }),
    ("claude-opus-4", ModelPrice { input: 15.0, output: 75.0 }),
    ("claude-sonnet-4", ModelPrice { input: 3.0, output: 15.0 }),
    ("claude-haiku-4", ModelPrice { input: 0.8, output: 4.0 }),
    ("gemini-2.5-pro", ModelPrice { input: 1.25, output: 10.0 }),
    ("gemini-2.5-flash", ModelPrice { input: 0.3, output: 2.5 }),
];

fn default_trace_status() -> TraceStatus {
    TraceStatus::Running
}

fn default_span_status() -> SpanStatus {
    SpanStatus::Ok
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn payload() -> IngestPayload {
        let trace_id = Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap();
        let root_id = Uuid::parse_str("22222222-2222-4222-8222-222222222222").unwrap();
        let llm_id = Uuid::parse_str("33333333-3333-4333-8333-333333333333").unwrap();

        IngestPayload {
            traces: vec![IngestTrace {
                trace_id,
                name: "support-agent".to_string(),
                status: TraceStatus::Ok,
                start_time: 1_000,
                end_time: Some(1_180),
                metadata: Map::new(),
                spans: vec![
                    IngestSpan {
                        span_id: root_id,
                        parent_span_id: None,
                        span_type: SpanType::Agent,
                        name: "root".to_string(),
                        status: SpanStatus::Ok,
                        start_time: 1_000,
                        end_time: Some(1_180),
                        input: None,
                        output: None,
                        error: None,
                        attributes: Map::new(),
                    },
                    IngestSpan {
                        span_id: llm_id,
                        parent_span_id: Some(root_id),
                        span_type: SpanType::Llm,
                        name: "draft".to_string(),
                        status: SpanStatus::Ok,
                        start_time: 1_020,
                        end_time: Some(1_120),
                        input: None,
                        output: None,
                        error: None,
                        attributes: Map::from_iter([
                            ("model".to_string(), Value::String("gpt-4o".to_string())),
                            ("promptTokens".to_string(), Value::from(100)),
                            ("completionTokens".to_string(), Value::from(50)),
                        ]),
                    },
                ],
            }],
        }
    }

    #[test]
    fn summarizes_tokens_cost_and_duration() {
        let summary = summarize_payload(&payload()).unwrap();
        assert_eq!(summary.traces_received, 1);
        assert_eq!(summary.spans_received, 2);
        assert_eq!(summary.traces[0].duration_ms, Some(180));
        assert_eq!(summary.traces[0].span_count, 2);
        assert_eq!(summary.traces[0].total_tokens, 150);
        assert!((summary.traces[0].total_cost_usd - 0.00075).abs() < 0.00000001);
    }

    #[test]
    fn rejects_empty_payload() {
        assert_eq!(
            validate_payload(&IngestPayload { traces: vec![] }),
            Err(IngestError::EmptyPayload)
        );
    }

    #[test]
    fn rejects_missing_parent() {
        let mut payload = payload();
        payload.traces[0].spans[1].parent_span_id =
            Some(Uuid::parse_str("44444444-4444-4444-8444-444444444444").unwrap());
        assert!(matches!(
            validate_payload(&payload),
            Err(IngestError::MissingParent { .. })
        ));
    }

    #[test]
    fn deserializes_camel_case_wire_payload() {
        let json = serde_json::json!({
            "traces": [{
                "traceId": "11111111-1111-4111-8111-111111111111",
                "name": "run",
                "startTime": 10,
                "spans": [{
                    "spanId": "22222222-2222-4222-8222-222222222222",
                    "type": "llm",
                    "name": "call",
                    "startTime": 10,
                    "attributes": { "totalTokens": 12, "costUsd": 0.01 }
                }]
            }]
        });

        let payload: IngestPayload = serde_json::from_value(json).unwrap();
        let summary = summarize_payload(&payload).unwrap();
        assert_eq!(summary.traces[0].total_tokens, 12);
        assert_eq!(summary.traces[0].total_cost_usd, 0.01);
    }
}
