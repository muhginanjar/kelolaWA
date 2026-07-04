use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowBounds {
    #[serde(skip_serializing_if = "Option::is_none")]
    x: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    y: Option<i32>,
    width: i32,
    height: i32,
}

impl Default for WindowBounds {
    fn default() -> Self {
        WindowBounds { x: None, y: None, width: 1100, height: 750 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Account {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    partition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default = "default_minimize_to_tray")]
    minimize_to_tray: bool,
    #[serde(default = "default_launch_at_login")]
    launch_at_login: String,
    #[serde(default)]
    window_bounds: WindowBounds,
    #[serde(default)]
    accounts: Vec<Account>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    active_account_id: Option<String>,
}

fn default_minimize_to_tray() -> bool {
    true
}

// One of "no", "yes", "minimized".
fn default_launch_at_login() -> String {
    "no".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            minimize_to_tray: default_minimize_to_tray(),
            launch_at_login: default_launch_at_login(),
            window_bounds: WindowBounds::default(),
            accounts: Vec::new(),
            active_account_id: None,
        }
    }
}

#[derive(Debug, Deserialize)]
struct Request {
    id: u64,
    cmd: String,
    #[serde(default)]
    data: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct Response {
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

struct Store {
    path: PathBuf,
    settings: Settings,
}

impl Store {
    fn load(user_data_dir: &str) -> Self {
        let path = PathBuf::from(user_data_dir).join("settings.json");
        let settings = fs::read_to_string(&path)
            .ok()
            .and_then(|contents| serde_json::from_str(&contents).ok())
            .unwrap_or_default();
        Store { path, settings }
    }

    fn save(&self) -> io::Result<()> {
        let json = serde_json::to_string_pretty(&self.settings)?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&self.path, json)
    }

    fn merge(&mut self, patch: &serde_json::Value) {
        if let Some(v) = patch.get("minimizeToTray").and_then(|v| v.as_bool()) {
            self.settings.minimize_to_tray = v;
        }
        if let Some(v) = patch.get("launchAtLogin").and_then(|v| v.as_str()) {
            self.settings.launch_at_login = v.to_string();
        }
        if let Some(bounds) = patch.get("windowBounds") {
            if let Ok(parsed) = serde_json::from_value::<WindowBounds>(bounds.clone()) {
                self.settings.window_bounds = parsed;
            }
        }
        if let Some(accounts) = patch.get("accounts") {
            if let Ok(parsed) = serde_json::from_value::<Vec<Account>>(accounts.clone()) {
                self.settings.accounts = parsed;
            }
        }
        if let Some(active_id) = patch.get("activeAccountId") {
            self.settings.active_account_id = active_id.as_str().map(|s| s.to_string());
        }
    }
}

fn main() {
    let user_data_dir = std::env::args().nth(1).unwrap_or_else(|| ".".to_string());
    let mut store = Store::load(&user_data_dir);

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }

        let request: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(err) => {
                eprintln!("failed to parse request: {err}");
                continue;
            }
        };

        let response = handle(&mut store, request);
        let serialized = serde_json::to_string(&response).unwrap_or_else(|_| {
            "{\"id\":0,\"error\":\"failed to serialize response\"}".to_string()
        });
        let _ = writeln!(out, "{serialized}");
        let _ = out.flush();
    }
}

fn handle(store: &mut Store, request: Request) -> Response {
    match request.cmd.as_str() {
        "get_settings" => Response {
            id: request.id,
            data: Some(serde_json::to_value(&store.settings).unwrap()),
            error: None,
        },
        "set_settings" => {
            store.merge(&request.data);
            match store.save() {
                Ok(_) => Response {
                    id: request.id,
                    data: Some(serde_json::to_value(&store.settings).unwrap()),
                    error: None,
                },
                Err(err) => Response {
                    id: request.id,
                    data: None,
                    error: Some(format!("failed to save settings: {err}")),
                },
            }
        }
        other => Response {
            id: request.id,
            data: None,
            error: Some(format!("unknown command: {other}")),
        },
    }
}
