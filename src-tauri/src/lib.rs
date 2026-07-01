use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:internpilot.db";

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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
