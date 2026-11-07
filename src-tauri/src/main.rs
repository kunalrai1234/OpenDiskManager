// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;

#[tauri::command]
fn scan_real_storage() -> Result<String, String> {
    // Strictly safe invocation: hardcoded binary and argument array.
    // Zero shell concatenation or untrusted user input.
    let output = Command::new("powershell.exe")
        .args(&[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            "detect-disks.ps1",
        ])
        .output()
        .map_err(|e| format!("Failed to execute disk detection process: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Storage detection failed: {}", err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout_str)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_real_storage])
        .run(tauri::generate_context!())
        .expect("error while running OpenDisk Manager desktop application");
}
