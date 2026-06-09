use std::io::{self, Read};

use romanica_ingest_core::{IngestPayload, summarize_payload};

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let payload: IngestPayload = serde_json::from_str(&input)?;
    let summary = summarize_payload(&payload)?;
    println!("{}", serde_json::to_string_pretty(&summary)?);
    Ok(())
}
