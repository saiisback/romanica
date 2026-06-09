use std::io::{self, Read};

use romanica_agent_compiler::{WorkflowDefinition, compile};

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let definition: WorkflowDefinition = serde_json::from_str(&input)?;
    let plan = compile(&definition)?;
    println!("{}", serde_json::to_string_pretty(&plan)?);
    Ok(())
}

