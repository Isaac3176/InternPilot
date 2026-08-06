use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tauri_plugin_sql::{Migration, MigrationKind};
use tiny_http::{Header, Method, Response, Server};

const DB_URL: &str = "sqlite:internpilot.db";

/// Local bridge between the browser extension and the app. The frontend pushes
/// the current profile + a shared token here; the extension reads /profile for
/// autofill and posts /application to record a job (relayed to the frontend).
#[derive(Default)]
struct BridgeState {
    token: Option<String>,
    profile_json: Option<String>,
    answers_json: Option<String>,
    snapshot_json: Option<String>,
    port: u16,
}
type SharedBridge = Arc<Mutex<BridgeState>>;

#[tauri::command]
fn bridge_set_profile(state: tauri::State<SharedBridge>, token: String, profile: String) {
    let mut s = state.lock().unwrap();
    s.token = Some(token);
    s.profile_json = Some(profile);
}

#[tauri::command]
fn bridge_set_answers(state: tauri::State<SharedBridge>, token: String, answers: String) {
    let mut s = state.lock().unwrap();
    s.token = Some(token);
    s.answers_json = Some(answers);
}

#[tauri::command]
fn bridge_set_snapshot(state: tauri::State<SharedBridge>, token: String, snapshot: String) {
    let mut s = state.lock().unwrap();
    s.token = Some(token);
    s.snapshot_json = Some(snapshot);
}

/// Best-effort LAN IP (no packets are sent — just resolves the outbound iface).
fn local_ip() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    Some(sock.local_addr().ok()?.ip().to_string())
}

/// Where the phone should point (same Wi-Fi): { ip, port }.
#[tauri::command]
fn bridge_info(state: tauri::State<SharedBridge>) -> String {
    let port = state.lock().unwrap().port;
    let ip = local_ip().unwrap_or_else(|| "127.0.0.1".into());
    format!("{{\"ip\":\"{}\",\"port\":{}}}", ip, port)
}

// The phone app is served straight from the bridge.
const MOBILE_HTML: &str = include_str!("../mobile.html");

fn cors_headers() -> Vec<Header> {
    [
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Headers", "Content-Type, X-IP-Token"),
        ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ("Content-Type", "application/json"),
    ]
    .iter()
    .filter_map(|(k, v)| Header::from_bytes(k.as_bytes(), v.as_bytes()).ok())
    .collect()
}

fn respond(request: tiny_http::Request, status: u16, body: &str) {
    let mut resp = Response::from_string(body).with_status_code(status);
    for h in cors_headers() {
        resp.add_header(h);
    }
    let _ = request.respond(resp);
}

fn header_value(request: &tiny_http::Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str().to_string())
}

fn respond_html(request: tiny_http::Request, body: &str) {
    let mut resp = Response::from_string(body).with_status_code(200);
    if let Ok(h) = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]) {
        resp.add_header(h);
    }
    let _ = request.respond(resp);
}

fn start_bridge(app: AppHandle, shared: SharedBridge) {
    // Bind to 0.0.0.0 so a phone on the same Wi-Fi can reach it (data routes
    // stay token-protected). May trigger a one-time Windows Firewall prompt.
    let mut server = None;
    for port in 8765u16..8769 {
        if let Ok(s) = Server::http(("0.0.0.0", port)) {
            shared.lock().unwrap().port = port;
            server = Some(s);
            break;
        }
    }
    let Some(server) = server else { return };

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let method = request.method().clone();
            let path = request.url().split('?').next().unwrap_or("").to_string();

            if method == Method::Options {
                respond(request, 204, "");
                continue;
            }
            if path == "/ping" {
                respond(request, 200, "{\"ok\":true,\"app\":\"InternPilot\"}");
                continue;
            }
            // The phone app shell is served unauthenticated; its data calls carry the token.
            if method == Method::Get && (path == "/" || path == "/m") {
                respond_html(request, MOBILE_HTML);
                continue;
            }

            let token_ok = {
                let s = shared.lock().unwrap();
                match (&s.token, header_value(&request, "X-IP-Token")) {
                    (Some(t), Some(h)) => !t.is_empty() && *t == h,
                    _ => false,
                }
            };
            if !token_ok {
                respond(request, 401, "{\"error\":\"unauthorized\"}");
                continue;
            }

            match (method, path.as_str()) {
                (Method::Get, "/answers") => {
                    let body = shared.lock().unwrap().answers_json.clone().unwrap_or_else(|| "[]".into());
                    respond(request, 200, &body);
                }
                (Method::Get, "/profile") => {
                    let body = shared.lock().unwrap().profile_json.clone().unwrap_or_else(|| "{}".into());
                    respond(request, 200, &body);
                }
                (Method::Get, "/data") => {
                    let body = shared.lock().unwrap().snapshot_json.clone().unwrap_or_else(|| "{}".into());
                    respond(request, 200, &body);
                }
                (Method::Post, "/action") => {
                    let mut body = String::new();
                    let _ = request.as_reader().read_to_string(&mut body);
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
                        let _ = app.emit("bridge://mobile-action", val);
                    }
                    respond(request, 200, "{\"ok\":true}");
                }
                (Method::Post, "/application") => {
                    let mut body = String::new();
                    let _ = request.as_reader().read_to_string(&mut body);
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
                        let _ = app.emit("bridge://application", val);
                    }
                    respond(request, 200, "{\"ok\":true}");
                }
                _ => respond(request, 404, "{\"error\":\"not found\"}"),
            }
        }
    });
}

/// Full schema based on the InternPilot AI proposal (section 8 - Database Design).
/// All tables are created up front so the data model is stable; Phase 1 only
/// reads/writes companies, applications, resume_versions, resume_bullets, and tasks.
const INITIAL_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS companies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    website     TEXT,
    industry    TEXT,
    size        TEXT,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resume_versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    file_path   TEXT,
    content     TEXT,
    target_role TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id        INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    role_title        TEXT NOT NULL,
    job_link          TEXT,
    location          TEXT,
    status            TEXT NOT NULL DEFAULT 'interested',
    date_saved        TEXT NOT NULL DEFAULT (datetime('now')),
    date_applied      TEXT,
    resume_version_id INTEGER REFERENCES resume_versions(id) ON DELETE SET NULL,
    job_description   TEXT,
    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resume_bullets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    experience_name TEXT,
    original_text   TEXT,
    improved_text   TEXT,
    tags            TEXT,
    application_id  INTEGER REFERENCES applications(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    sender         TEXT,
    subject        TEXT,
    body           TEXT,
    received_at    TEXT,
    classification TEXT,
    confidence     REAL,
    application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interviews (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    type           TEXT,
    date           TEXT,
    prep_status    TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interview_experiences (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    source      TEXT,
    role        TEXT,
    summary     TEXT,
    topics      TEXT,
    difficulty  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    due_date       TEXT,
    status         TEXT NOT NULL DEFAULT 'open',
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company_id);
CREATE INDEX IF NOT EXISTS idx_applications_status  ON applications(status);
CREATE INDEX IF NOT EXISTS idx_emails_application   ON emails(application_id);
CREATE INDEX IF NOT EXISTS idx_tasks_application    ON tasks(application_id);
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_schema",
            sql: INITIAL_SCHEMA,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_prep_plan_to_interviews",
            sql: "ALTER TABLE interviews ADD COLUMN prep_plan TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_gmail_id_to_emails",
            sql: "ALTER TABLE emails ADD COLUMN gmail_id TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_profile",
            sql: "CREATE TABLE IF NOT EXISTS profile (
                    id                  INTEGER PRIMARY KEY CHECK (id = 1),
                    target_roles        TEXT,
                    locations           TEXT,
                    work_auth           TEXT,
                    grad_year           TEXT,
                    skills              TEXT,
                    remote_pref         TEXT,
                    preferred_resume_id INTEGER,
                    onboarded           INTEGER NOT NULL DEFAULT 0,
                    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
                  );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_referral_to_applications",
            sql: "ALTER TABLE applications ADD COLUMN referral TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_contacts_and_referrals",
            sql: "CREATE TABLE IF NOT EXISTS contacts (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    name                 TEXT NOT NULL,
                    company_id           INTEGER REFERENCES companies(id) ON DELETE SET NULL,
                    title                TEXT,
                    team                 TEXT,
                    email                TEXT,
                    linkedin             TEXT,
                    relationship_type    TEXT,
                    relationship_strength INTEGER,
                    how_you_know         TEXT,
                    contact_again        INTEGER NOT NULL DEFAULT 1,
                    notes                TEXT,
                    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
                  );
                  CREATE TABLE IF NOT EXISTS referrals (
                    id                INTEGER PRIMARY KEY AUTOINCREMENT,
                    contact_id        INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
                    application_id    INTEGER REFERENCES applications(id) ON DELETE SET NULL,
                    company_id        INTEGER REFERENCES companies(id) ON DELETE SET NULL,
                    status            TEXT NOT NULL DEFAULT 'potential_contact',
                    first_contacted   TEXT,
                    last_interaction  TEXT,
                    next_follow_up    TEXT,
                    confirmation_note TEXT,
                    referral_link     TEXT,
                    thank_you_sent    INTEGER NOT NULL DEFAULT 0,
                    notes             TEXT,
                    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
                  );
                  CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
                  CREATE INDEX IF NOT EXISTS idx_referrals_contact ON referrals(contact_id);
                  CREATE INDEX IF NOT EXISTS idx_referrals_application ON referrals(application_id);
                  CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "expand_profile_for_autofill",
            sql: "ALTER TABLE profile ADD COLUMN first_name TEXT;
                  ALTER TABLE profile ADD COLUMN last_name TEXT;
                  ALTER TABLE profile ADD COLUMN email TEXT;
                  ALTER TABLE profile ADD COLUMN phone TEXT;
                  ALTER TABLE profile ADD COLUMN current_city TEXT;
                  ALTER TABLE profile ADD COLUMN current_state TEXT;
                  ALTER TABLE profile ADD COLUMN current_country TEXT;
                  ALTER TABLE profile ADD COLUMN linkedin_url TEXT;
                  ALTER TABLE profile ADD COLUMN github_url TEXT;
                  ALTER TABLE profile ADD COLUMN portfolio_url TEXT;
                  ALTER TABLE profile ADD COLUMN school TEXT;
                  ALTER TABLE profile ADD COLUMN degree TEXT;
                  ALTER TABLE profile ADD COLUMN major TEXT;
                  ALTER TABLE profile ADD COLUMN minor TEXT;
                  ALTER TABLE profile ADD COLUMN gpa TEXT;
                  ALTER TABLE profile ADD COLUMN graduation_date TEXT;
                  ALTER TABLE profile ADD COLUMN authorized_us TEXT;
                  ALTER TABLE profile ADD COLUMN requires_sponsorship TEXT;
                  ALTER TABLE profile ADD COLUMN security_clearance TEXT;
                  ALTER TABLE profile ADD COLUMN desired_salary TEXT;
                  ALTER TABLE profile ADD COLUMN willing_to_relocate TEXT;
                  ALTER TABLE profile ADD COLUMN earliest_start_date TEXT;
                  ALTER TABLE profile ADD COLUMN gender TEXT;
                  ALTER TABLE profile ADD COLUMN race_ethnicity TEXT;
                  ALTER TABLE profile ADD COLUMN hispanic_latino TEXT;
                  ALTER TABLE profile ADD COLUMN veteran_status TEXT;
                  ALTER TABLE profile ADD COLUMN disability_status TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_accounts",
            sql: "CREATE TABLE IF NOT EXISTS accounts (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    email         TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    salt          TEXT NOT NULL,
                    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
                  );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_target_date_to_profile",
            sql: "ALTER TABLE profile ADD COLUMN target_date TEXT;",
            kind: MigrationKind::Up,
        },
    ];

    let bridge: SharedBridge = Arc::new(Mutex::new(BridgeState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .manage(bridge.clone())
        .invoke_handler(tauri::generate_handler![bridge_set_profile, bridge_set_answers, bridge_set_snapshot, bridge_info])
        .setup(move |app| {
            start_bridge(app.handle().clone(), bridge.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
