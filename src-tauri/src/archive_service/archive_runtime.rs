// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::{
    load_archive_stats, load_recent_activity, open_archive_db, ArchiveActivityEntry, ArchiveStats,
};

#[derive(Deserialize)]
struct ArchiveConfigFile {
    mode: Option<String>,
    vault_root: String,
    managed_root: String,
    wiki_root: String,
    data_root: String,
    logs_root: String,
    config_root: String,
    mapping_file: Option<String>,
}

#[derive(Deserialize)]
struct VaultMapFile {
    mappings: Vec<VaultMappingFile>,
}

#[derive(Clone, Deserialize)]
pub(super) struct VaultMappingFile {
    pub(super) path: String,
    pub(super) role: String,
    pub(super) subtype: Option<String>,
    pub(super) managed_by_ai: Option<bool>,
    pub(super) immutable: Option<bool>,
    pub(super) rename_allowed: Option<bool>,
    pub(super) move_allowed: Option<bool>,
}

#[derive(Deserialize)]
struct IngestAgentConfigFile {
    enabled: Option<bool>,
    provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchivePathMapping {
    path: String,
    role: String,
    subtype: Option<String>,
    absolute_path: String,
    exists: bool,
    managed_by_ai: bool,
    immutable: bool,
    rename_allowed: bool,
    move_allowed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveSourceRoot {
    role: String,
    subtype: Option<String>,
    path: String,
    exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveIngestAgentStatus {
    enabled: bool,
    provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    config_file: String,
    prompt_file: String,
    config_exists: bool,
    prompt_exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveRuntimeStatus {
    pub(crate) status: String,
    pub(crate) mode: String,
    pub(crate) config_path: String,
    pub(crate) vault_root: String,
    pub(crate) managed_root: String,
    pub(crate) wiki_root: String,
    pub(crate) data_root: String,
    pub(crate) logs_root: String,
    pub(crate) config_root: String,
    pub(crate) mapping_file: String,
    pub(crate) intake_root: String,
    pub(crate) review_queue_root: String,
    mappings: Vec<ArchivePathMapping>,
    source_roots: Vec<ArchiveSourceRoot>,
    ingest_agent: ArchiveIngestAgentStatus,
    pub(crate) stats: Option<ArchiveStats>,
    pub(crate) recent_activity: Vec<ArchiveActivityEntry>,
}

pub(super) struct ArchiveRuntime {
    pub(super) config_path: PathBuf,
    pub(super) mode: String,
    pub(super) vault_root: PathBuf,
    pub(super) managed_root: PathBuf,
    pub(super) wiki_root: PathBuf,
    pub(super) data_root: PathBuf,
    pub(super) logs_root: PathBuf,
    pub(super) config_root: PathBuf,
    pub(super) mapping_file: PathBuf,
    pub(super) mappings: Vec<VaultMappingFile>,
}

impl ArchiveRuntime {
    pub(super) fn resolve(app: &AppHandle) -> Result<Self, String> {
        let config_path = archive_config_candidates(app)?
            .into_iter()
            .find(|candidate| candidate.exists())
            .ok_or_else(|| {
                "No Living Archive config was found. Set RESONANT_ARCHIVE_CONFIG or create _LivingArchive/CONFIG/ARCHIVE_CONFIG.json."
                    .to_string()
            })?;

        let raw = fs::read_to_string(&config_path)
            .map_err(|error| format!("Failed to read archive config: {error}"))?;
        let config: ArchiveConfigFile = serde_json::from_str(&raw)
            .map_err(|error| format!("Invalid archive config JSON: {error}"))?;

        let config_root = PathBuf::from(&config.config_root);
        let mapping_file = config
            .mapping_file
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| config_root.join("VAULT_MAP.json"));

        let mappings = if mapping_file.exists() {
            let raw_map = fs::read_to_string(&mapping_file)
                .map_err(|error| format!("Failed to read vault map: {error}"))?;
            serde_json::from_str::<VaultMapFile>(&raw_map)
                .map_err(|error| format!("Invalid vault map JSON: {error}"))?
                .mappings
        } else {
            Vec::new()
        };

        Ok(Self {
            config_path,
            mode: config.mode.unwrap_or_else(|| "adopt".to_string()),
            vault_root: PathBuf::from(config.vault_root),
            managed_root: PathBuf::from(config.managed_root),
            wiki_root: PathBuf::from(config.wiki_root),
            data_root: PathBuf::from(config.data_root),
            logs_root: PathBuf::from(config.logs_root),
            config_root,
            mapping_file,
            mappings,
        })
    }

    pub(super) fn db_path(&self) -> PathBuf {
        self.data_root.join("wiki.db")
    }

    pub(super) fn source_watch_index_path(&self) -> PathBuf {
        self.data_root.join("source-watch-index.json")
    }

    pub(super) fn review_queue_root(&self) -> PathBuf {
        self.managed_root.join("REVIEW")
    }

    pub(super) fn intake_root(&self) -> PathBuf {
        self.managed_root.join("INTAKE")
    }

    pub(super) fn memory_root(&self) -> PathBuf {
        if self
            .managed_root
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value == "Memory")
        {
            return self.managed_root.clone();
        }
        self.managed_root.join("Memory")
    }

    pub(super) fn memory_domain_root(&self, domain: &str) -> PathBuf {
        match domain {
            "human-knowledge" => self.memory_root().join("HUMAN_KNOWLEDGE"),
            "external-knowledge" => self.memory_root().join("EXTERNAL_KNOWLEDGE"),
            "ai-memory" => self.memory_root().join("AI_MEMORY"),
            "mixed-library" => self
                .memory_root()
                .join("INTAKE")
                .join("imports")
                .join("mixed"),
            _ => self.memory_root().join("UNCLASSIFIED_KNOWLEDGE"),
        }
    }

    pub(super) fn memory_domain_roots(&self) -> Vec<(&'static str, PathBuf)> {
        vec![
            (
                "human-knowledge",
                self.memory_domain_root("human-knowledge"),
            ),
            (
                "external-knowledge",
                self.memory_domain_root("external-knowledge"),
            ),
            ("ai-memory", self.memory_domain_root("ai-memory")),
            ("mixed-library", self.memory_domain_root("mixed-library")),
        ]
    }

    pub(super) fn system_memory_root(&self) -> PathBuf {
        self.memory_domain_root("ai-memory").join("system")
    }

    pub(super) fn system_memory_manifest_path(&self) -> PathBuf {
        self.memory_domain_root("ai-memory")
            .join("provenance")
            .join("system-memory-manifest.json")
    }

    pub(super) fn allowed_roots(&self) -> Vec<PathBuf> {
        let mut roots = vec![
            self.vault_root.clone(),
            self.managed_root.clone(),
            self.wiki_root.clone(),
            self.data_root.clone(),
            self.logs_root.clone(),
            self.config_root.clone(),
            self.review_queue_root(),
            self.intake_root(),
        ];
        roots.extend(
            self.mappings
                .iter()
                .map(|mapping| self.vault_root.join(&mapping.path)),
        );
        dedupe_paths(roots)
    }
}

fn archive_config_candidates(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut candidates = Vec::new();

    if let Some(path) = env::var_os("RESONANT_ARCHIVE_CONFIG") {
        candidates.push(PathBuf::from(path));
    }
    if let Some(path) = env::var_os("LIVING_ARCHIVE_CONFIG") {
        candidates.push(PathBuf::from(path));
    }
    if let Ok(documents_dir) = app.path().document_dir() {
        candidates.push(
            documents_dir
                .join("RESONANT_OS_BASE")
                .join("_LivingArchive")
                .join("CONFIG")
                .join("ARCHIVE_CONFIG.json"),
        );
    }

    Ok(dedupe_paths(candidates))
}

pub(super) fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();
    for path in paths {
        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            unique.push(path);
        }
    }
    unique
}

pub(crate) fn query_archive_runtime_status(
    app: &AppHandle,
) -> Result<ArchiveRuntimeStatus, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    fs::create_dir_all(runtime.intake_root())
        .map_err(|error| format!("Failed to ensure archive intake root: {error}"))?;
    fs::create_dir_all(runtime.review_queue_root())
        .map_err(|error| format!("Failed to ensure archive review root: {error}"))?;

    let ingest_agent_config = runtime.config_root.join("INGEST_AGENT_CONFIG.json");
    let ingest_agent_prompt = runtime.config_root.join("INGEST_AGENT_SYSTEM_PROMPT.md");
    let ingest_agent = if ingest_agent_config.exists() {
        let raw = fs::read_to_string(&ingest_agent_config)
            .map_err(|error| format!("Failed to read ingest agent config: {error}"))?;
        let config: IngestAgentConfigFile = serde_json::from_str(&raw)
            .map_err(|error| format!("Invalid ingest agent config JSON: {error}"))?;
        ArchiveIngestAgentStatus {
            enabled: config.enabled.unwrap_or(true),
            provider: config.provider,
            model: config.model,
            reasoning_effort: config.reasoning_effort,
            config_file: ingest_agent_config.display().to_string(),
            prompt_file: ingest_agent_prompt.display().to_string(),
            config_exists: true,
            prompt_exists: ingest_agent_prompt.exists(),
        }
    } else {
        ArchiveIngestAgentStatus {
            enabled: false,
            provider: None,
            model: None,
            reasoning_effort: None,
            config_file: ingest_agent_config.display().to_string(),
            prompt_file: ingest_agent_prompt.display().to_string(),
            config_exists: false,
            prompt_exists: ingest_agent_prompt.exists(),
        }
    };

    let mappings = runtime
        .mappings
        .iter()
        .map(|mapping| {
            let absolute_path = runtime.vault_root.join(&mapping.path);
            ArchivePathMapping {
                path: mapping.path.clone(),
                role: mapping.role.clone(),
                subtype: mapping.subtype.clone(),
                absolute_path: absolute_path.display().to_string(),
                exists: absolute_path.exists(),
                managed_by_ai: mapping.managed_by_ai.unwrap_or(false),
                immutable: mapping.immutable.unwrap_or(false),
                rename_allowed: mapping.rename_allowed.unwrap_or(false),
                move_allowed: mapping.move_allowed.unwrap_or(false),
            }
        })
        .collect::<Vec<_>>();

    let source_roots = runtime
        .mappings
        .iter()
        .filter(|mapping| mapping.role == "raw_sources" || mapping.role == "derived_sources")
        .map(|mapping| {
            let absolute_path = runtime.vault_root.join(&mapping.path);
            ArchiveSourceRoot {
                role: mapping.role.clone(),
                subtype: mapping.subtype.clone(),
                path: absolute_path.display().to_string(),
                exists: absolute_path.exists(),
            }
        })
        .collect::<Vec<_>>();

    let (stats, recent_activity) = match open_archive_db(&runtime)? {
        Some(connection) => (
            Some(load_archive_stats(&connection)?),
            load_recent_activity(&connection, 12)?,
        ),
        None => (None, Vec::new()),
    };

    Ok(ArchiveRuntimeStatus {
        status: if runtime.wiki_root.exists() && runtime.db_path().exists() {
            "ready".to_string()
        } else {
            "attention".to_string()
        },
        mode: runtime.mode.clone(),
        config_path: runtime.config_path.display().to_string(),
        vault_root: runtime.vault_root.display().to_string(),
        managed_root: runtime.managed_root.display().to_string(),
        wiki_root: runtime.wiki_root.display().to_string(),
        data_root: runtime.data_root.display().to_string(),
        logs_root: runtime.logs_root.display().to_string(),
        config_root: runtime.config_root.display().to_string(),
        mapping_file: runtime.mapping_file.display().to_string(),
        intake_root: runtime.intake_root().display().to_string(),
        review_queue_root: runtime.review_queue_root().display().to_string(),
        mappings,
        source_roots,
        ingest_agent,
        stats,
        recent_activity,
    })
}
