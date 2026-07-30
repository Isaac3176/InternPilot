/**
 * Keyword-coverage match between a job description and the user's résumé.
 * Extracts skills mentioned in the JD (from a curated vocabulary), then reports
 * which appear on the résumé and which don't, plus a coverage score. Deterministic
 * and offline — honest "X of Y keywords found".
 */

const VOCAB: string[] = [
  // languages
  "Python", "Java", "JavaScript", "TypeScript", "C++", "C#", "C", "Go", "Rust", "Ruby",
  "Swift", "Kotlin", "Scala", "PHP", "SQL", "R", "MATLAB", "Bash", "Shell", "Perl",
  // frontend
  "React", "React Native", "Next.js", "Vue", "Angular", "Svelte", "Redux", "HTML", "CSS",
  "Tailwind", "SASS", "Webpack", "GraphQL",
  // backend / frameworks
  "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", "Rails",
  ".NET", "gRPC", "REST", "REST APIs", "microservices", "WebSockets",
  // data / ML
  "pandas", "NumPy", "scikit-learn", "PyTorch", "TensorFlow", "Keras", "XGBoost",
  "machine learning", "deep learning", "NLP", "computer vision", "data pipelines",
  "Spark", "Hadoop", "Airflow", "ETL", "Tableau", "Power BI",
  // databases
  "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "DynamoDB", "Elasticsearch", "Cassandra",
  // infra / devops
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Terraform", "Ansible", "Linux", "Unix",
  "Git", "GitHub Actions", "CI/CD", "Jenkins", "Kafka", "RabbitMQ", "Nginx", "Cloudflare",
  "Heroku", "serverless", "Lambda",
  // concepts
  "data structures", "algorithms", "distributed systems", "system design", "OOP",
  "concurrency", "multithreading", "operating systems", "networking", "security",
  "testing", "unit testing", "agile", "scrum", "design patterns", "object-oriented",
];

/** Whether `text` mentions `skill`, using word boundaries for short/ambiguous tokens. */
function mentions(text: string, skill: string): boolean {
  const s = skill.toLowerCase();
  if (/^[a-z0-9]{1,2}$/.test(s)) {
    return new RegExp(`(^|[^a-z0-9+#.])${s}([^a-z0-9+#.]|$)`, "i").test(text);
  }
  return text.toLowerCase().includes(s);
}

export interface JdMatch {
  matched: string[];
  missing: string[];
  score: number; // 0-100 coverage
}

export function jdSkillMatch(jdText: string, resumeText: string): JdMatch {
  const jd = jdText.toLowerCase();
  const jdSkills = VOCAB.filter((sk) => mentions(jd, sk));
  const matched = jdSkills.filter((sk) => mentions(resumeText, sk));
  const missing = jdSkills.filter((sk) => !mentions(resumeText, sk));
  const score = jdSkills.length ? Math.round((matched.length / jdSkills.length) * 100) : 0;
  return { matched, missing, score };
}
