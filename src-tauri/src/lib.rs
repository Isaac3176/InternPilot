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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
