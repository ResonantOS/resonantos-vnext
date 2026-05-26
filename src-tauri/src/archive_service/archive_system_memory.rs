// Intent citation: docs/architecture/ADR-014-system-architecture-memory.md
// Intent citation: docs/architecture/ADR-009-rust-service-ipc-boundary.md

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::{
    dedupe_paths, sha256_hex, source_hash, system_time_label, unix_timestamp, ArchiveRuntime,
    ArchiveSystemMemoryManifest, ArchiveSystemMemoryPage, ArchiveSystemMemorySource,
    ArchiveSystemMemoryStatus,
};

#[derive(Clone, Copy)]
pub(super) struct SystemMemorySourceSpec {
    pub(super) relative_path: &'static str,
    pub(super) required: bool,
}

pub(super) const SYSTEM_MEMORY_GENERATOR_VERSION: &str = "resonantos-system-memory-v1";

pub(super) const SYSTEM_MEMORY_SOURCE_SPECS: &[SystemMemorySourceSpec] = &[
    SystemMemorySourceSpec {
        relative_path: "docs/README.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/FEATURE_BACKLOG.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/MODULE_MAP.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-001-platform-stack.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-002-modular-codebase.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-003-engineering-standards.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-005-provider-fabric-routing.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-006-addon-runtime-sdk.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-007-living-archive-boundaries.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-009-rust-service-ipc-boundary.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-010-recovery-ladder.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-011-living-archive-host-service.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-012-living-archive-approval-policy.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-013-living-archive-memory-domains.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-014-system-architecture-memory.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/product/UX-001-resonantos-app-shell.md",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src/core/contracts.ts",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src/core/runtime.ts",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src/core/provider-service.ts",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/src/archive_service.rs",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/src/lib.rs",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/src/provider_service.rs",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/src/recovery_service.rs",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/tauri.conf.json",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "package.json",
        required: false,
    },
];

pub(super) fn hash_text(value: &str) -> String {
    format!("sha256:{}", sha256_hex(value.as_bytes()))
}

pub(super) fn system_memory_project_root_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = env::var_os("RESONANTOS_PROJECT_ROOT") {
        candidates.push(PathBuf::from(path));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.clone());
        candidates.push(resource_dir.join("_up_"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR"))),
    );
    dedupe_paths(candidates)
}

pub(super) fn resolve_system_memory_project_root(app: &AppHandle) -> Result<PathBuf, String> {
    system_memory_project_root_candidates(app)
        .into_iter()
        .find(|candidate| candidate.join("docs").exists())
        .ok_or_else(|| {
            "No ResonantOS architecture source root was found for system memory refresh."
                .to_string()
        })
}

pub(super) fn collect_system_memory_sources(project_root: &Path) -> Vec<ArchiveSystemMemorySource> {
    SYSTEM_MEMORY_SOURCE_SPECS
        .iter()
        .map(|spec| {
            let absolute_path = project_root.join(spec.relative_path);
            let metadata = absolute_path.metadata().ok();
            ArchiveSystemMemorySource {
                relative_path: spec.relative_path.to_string(),
                absolute_path: absolute_path.display().to_string(),
                exists: absolute_path.exists(),
                required: spec.required,
                hash: if absolute_path.exists() {
                    source_hash(&absolute_path).ok()
                } else {
                    None
                },
                size_bytes: metadata.as_ref().map(|value| value.len()),
                modified_at: metadata
                    .and_then(|value| value.modified().ok())
                    .map(system_time_label),
            }
        })
        .collect()
}

pub(super) fn read_system_source(project_root: &Path, relative_path: &str) -> String {
    let path = project_root.join(relative_path);
    fs::read_to_string(&path).unwrap_or_else(|_| {
        format!(
            "> Source unavailable at refresh time: `{}`\n",
            path.display()
        )
    })
}

pub(super) fn first_markdown_heading(content: &str, fallback: &str) -> String {
    content
        .lines()
        .find_map(|line| line.strip_prefix("# ").map(str::trim))
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

pub(super) fn render_system_memory_section(project_root: &Path, relative_path: &str) -> String {
    let content = read_system_source(project_root, relative_path);
    let title = first_markdown_heading(&content, relative_path);
    format!(
        "## {}\n\n_Source: `{}`_\n\n{}\n",
        title,
        relative_path,
        content.trim()
    )
}

pub(super) fn write_system_memory_page(
    pages_root: &Path,
    page_id: &str,
    title: &str,
    content: &str,
    source_count: usize,
) -> Result<ArchiveSystemMemoryPage, String> {
    fs::create_dir_all(pages_root)
        .map_err(|error| format!("Failed to create system memory root: {error}"))?;
    let path = pages_root.join(format!("{page_id}.md"));
    fs::write(&path, content)
        .map_err(|error| format!("Failed to write system memory page {page_id}: {error}"))?;
    Ok(ArchiveSystemMemoryPage {
        page_id: page_id.to_string(),
        title: title.to_string(),
        file_path: path.display().to_string(),
        source_count,
        hash: hash_text(content),
    })
}

pub(super) fn render_system_memory_pages(
    project_root: &Path,
    runtime: &ArchiveRuntime,
    sources: &[ArchiveSystemMemorySource],
) -> Result<Vec<ArchiveSystemMemoryPage>, String> {
    let generated_at = unix_timestamp();
    let pages_root = runtime.system_memory_root();
    let available_sources = sources.iter().filter(|source| source.exists).count();
    let source_table = sources
        .iter()
        .map(|source| {
            format!(
                "| `{}` | {} | {} | {} |",
                source.relative_path,
                if source.required {
                    "required"
                } else {
                    "optional"
                },
                if source.exists { "present" } else { "missing" },
                source.hash.as_deref().unwrap_or("n/a")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let index_content = format!(
        "---\ntype: resonantos_system_memory\ntrust: core\nmanaged_by: resonantos_host\ngenerated_at: {generated_at}\n---\n\n# ResonantOS System Memory Index\n\nThis is host-owned architecture memory for Augmentor and the Resonant Engineer Agent. It is generated before user knowledge intake and must not be edited as user memory.\n\n## Rules\n\n- Treat these pages as the current system contract until the manifest reports stale sources.\n- Prefer this memory over user imports when answering how ResonantOS works.\n- Refresh this memory after architecture docs, IPC contracts, provider routing, recovery, or archive service code changes.\n\n## Source Inventory\n\n| Source | Role | Status | Hash |\n| --- | --- | --- | --- |\n{source_table}\n"
    );

    let architecture_docs = [
        "docs/README.md",
        "docs/architecture/MODULE_MAP.md",
        "docs/architecture/ADR-001-platform-stack.md",
        "docs/architecture/ADR-002-modular-codebase.md",
        "docs/architecture/ADR-003-engineering-standards.md",
        "docs/architecture/ADR-005-provider-fabric-routing.md",
        "docs/architecture/ADR-006-addon-runtime-sdk.md",
        "docs/architecture/ADR-009-rust-service-ipc-boundary.md",
    ];
    let architecture_content = format!(
        "---\ntype: resonantos_system_memory\ntrust: core\nmanaged_by: resonantos_host\ngenerated_at: {generated_at}\n---\n\n# ResonantOS Architecture Contract\n\n{}\n",
        architecture_docs
            .iter()
            .map(|path| render_system_memory_section(project_root, path))
            .collect::<Vec<_>>()
            .join("\n---\n\n")
    );

    let memory_docs = [
        "docs/architecture/ADR-007-living-archive-boundaries.md",
        "docs/architecture/ADR-010-recovery-ladder.md",
        "docs/architecture/ADR-011-living-archive-host-service.md",
        "docs/architecture/ADR-012-living-archive-approval-policy.md",
        "docs/architecture/ADR-013-living-archive-memory-domains.md",
        "docs/architecture/ADR-014-system-architecture-memory.md",
        "docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md",
    ];
    let memory_content = format!(
        "---\ntype: resonantos_system_memory\ntrust: core\nmanaged_by: resonantos_host\ngenerated_at: {generated_at}\n---\n\n# Living Archive And Recovery Contract\n\n{}\n",
        memory_docs
            .iter()
            .map(|path| render_system_memory_section(project_root, path))
            .collect::<Vec<_>>()
            .join("\n---\n\n")
    );

    let code_contract_content = format!(
        "---\ntype: resonantos_system_memory\ntrust: core\nmanaged_by: resonantos_host\ngenerated_at: {generated_at}\n---\n\n# ResonantOS Code Contract Inventory\n\nThis page is a deterministic source map for host services and TypeScript contracts. It does not replace source review; it tells agents which files define the running system boundary.\n\n## Indexed Sources\n\n{source_table}\n\n## Current Runtime Roots\n\n- Vault root: `{}`\n- Managed root: `{}`\n- System memory root: `{}`\n- System memory manifest: `{}`\n\n## Source Count\n\n{} architecture and code sources were indexed.\n",
        runtime.vault_root.display(),
        runtime.managed_root.display(),
        runtime.system_memory_root().display(),
        runtime.system_memory_manifest_path().display(),
        available_sources
    );

    Ok(vec![
        write_system_memory_page(
            &pages_root,
            "resonantos-system-index",
            "ResonantOS System Memory Index",
            &index_content,
            sources.len(),
        )?,
        write_system_memory_page(
            &pages_root,
            "resonantos-architecture-contract",
            "ResonantOS Architecture Contract",
            &architecture_content,
            architecture_docs.len(),
        )?,
        write_system_memory_page(
            &pages_root,
            "resonantos-archive-recovery-contract",
            "Living Archive And Recovery Contract",
            &memory_content,
            memory_docs.len(),
        )?,
        write_system_memory_page(
            &pages_root,
            "resonantos-code-contract-inventory",
            "ResonantOS Code Contract Inventory",
            &code_contract_content,
            sources.len(),
        )?,
    ])
}

pub(super) fn read_system_memory_manifest(
    manifest_path: &Path,
) -> Result<Option<ArchiveSystemMemoryManifest>, String> {
    if !manifest_path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(manifest_path)
        .map_err(|error| format!("Failed to read system memory manifest: {error}"))?;
    serde_json::from_str::<ArchiveSystemMemoryManifest>(&raw)
        .map(Some)
        .map_err(|error| format!("Invalid system memory manifest JSON: {error}"))
}

pub(super) fn system_memory_status_from_runtime(
    runtime: &ArchiveRuntime,
    project_root: &Path,
) -> Result<ArchiveSystemMemoryStatus, String> {
    let manifest_path = runtime.system_memory_manifest_path();
    let current_sources = collect_system_memory_sources(project_root);
    let manifest = read_system_memory_manifest(&manifest_path)?;
    let mut stale_sources = Vec::new();
    let missing_sources = current_sources
        .iter()
        .filter(|source| source.required && !source.exists)
        .map(|source| source.relative_path.clone())
        .collect::<Vec<_>>();

    if let Some(manifest) = manifest.as_ref() {
        for source in &current_sources {
            let previous = manifest
                .sources
                .iter()
                .find(|candidate| candidate.relative_path == source.relative_path);
            if previous.and_then(|value| value.hash.as_ref()) != source.hash.as_ref() {
                stale_sources.push(source.relative_path.clone());
            }
        }
    }

    let status = if manifest.is_none() {
        "missing"
    } else if !missing_sources.is_empty() {
        "blocked"
    } else if !stale_sources.is_empty() {
        "stale"
    } else {
        "ready"
    };

    Ok(ArchiveSystemMemoryStatus {
        status: status.to_string(),
        generated_at: manifest.as_ref().map(|value| value.generated_at.clone()),
        manifest_path: manifest_path.display().to_string(),
        pages_root: runtime.system_memory_root().display().to_string(),
        sources: current_sources,
        pages: manifest.map(|value| value.pages).unwrap_or_default(),
        stale_sources,
        missing_sources,
    })
}
