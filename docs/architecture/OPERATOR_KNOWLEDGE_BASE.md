# ResonantOS vNext Operator Knowledge Base

**Purpose:** Verified hand-off notes for operating the current Mac Mini, GX10, and NAS infrastructure from ResonantOS vNext.
**Owner:** Augmentor
**Last verified:** 2026-05-10

This document records live infrastructure facts that ResonantOS vNext can use for Compute Fabric, Provider Fabric, backup, and local transcription workflows. It intentionally does not store plaintext passwords or personal secrets.

## System Overview

Three-machine architecture:

| Machine | Role | OS | Location |
|---------|------|----|----------|
| Mac Mini (`192.168.1.197`) | Orchestrator / software host | macOS 26.4.1 | Rome |
| GX10 (`192.168.1.77`) | Compute / inference server | Ubuntu 24.04.4 LTS | Rome |
| NAS (`192.168.1.52`) | Backup / storage | Synology DSM-compatible Linux | Rome |

Core rule: GX10 is the compute and inference node. Mac Mini is the software host and operator workstation. Do not turn GX10 into a general application host unless a vNext Compute Fabric policy explicitly allows it.

## 1. Mac Mini Orchestrator

**Hostname:** `Resonants-Mac-mini.local`
**Current IP:** `192.168.1.197`
**User:** `augmentor`
**Hardware:** Mac mini, Apple M4, 16 GB memory

Relevant local services:

| Service | Endpoint | Verified state on 2026-05-10 |
|---------|----------|-------------------------------|
| OpenClaw gateway | `127.0.0.1:18789` | Running through LaunchAgent |
| Dashboard | `127.0.0.1:19100` | Installed, not listening during verification |
| Shield daemon | `127.0.0.1:9999` | Installed in dashboard code, not listening during verification |
| Logician proxy | `127.0.0.1:8081` and `/tmp/mangle.sock` | LaunchAgent present, proxy/socket not listening during verification |

LaunchAgents observed:

- `ai.openclaw.gateway`
- `ai.openclaw.whisper-server`
- `ai.hermes.gateway`
- `com.resonantos.trust-kernel-mangle`
- `com.resonantos.r-code-proxy`

Check current local state with:

```bash
openclaw status
launchctl list | rg -i 'openclaw|hermes|mangle|resonantos'
lsof -nP -iTCP:18789 -sTCP:LISTEN
lsof -nP -iTCP:19100 -sTCP:LISTEN
lsof -nP -iTCP:9999 -sTCP:LISTEN
lsof -nP -iTCP:8081 -sTCP:LISTEN
```

## 2. GX10 Inference Server

**Hostname:** `gx10-23bd`
**LAN names:** `gx10-23bd.local`, `192.168.1.77`
**Hardware:** ASUS Ascent GX10-GG0003BN, NVIDIA GB10 Grace Blackwell, compute capability `12.1`, 121 GiB usable RAM, 1 TB internal NVMe
**SSH:** `ssh rlab@gx10-23bd.local`
**VNC:** `vnc://192.168.1.77:5900`

Do not store plaintext SSH or VNC passwords in this repository. Use local keychain/password-manager records and SSH keys.

`x11vnc` is enabled and active through systemd. VNC port `5900` was open during verification.

If SSH fails with key or authentication errors:

1. Run `open -a "NVIDIA Sync"` on the Mac Mini.
2. Wait 5 seconds.
3. Retry `ssh rlab@gx10-23bd.local`.

Direct SSH was verified working on 2026-05-10, so NVIDIA Sync is a troubleshooting step, not a proven hard dependency.

### GPU Workload Rule

GB10 compute capability is `sm_121a` / CC `12.1`. PyPI GPU wheels should not be assumed to include correct kernels. GPU workloads on GX10 should run through NVIDIA-supported NGC containers unless a specific workload has been separately validated.

## 3. Model Serving

The active model is served by `llama.cpp` `llama-server` from `/mnt/data/llama.cpp/build/bin/llama-server`.

### Qwen 3.6 35B A3B

| Property | Value |
|----------|-------|
| File | `/mnt/data/LM-Studio/models/lmstudio-community/Qwen3.6-35B-A3B-GGUF/Qwen3.6-35B-A3B-Q4_K_M.gguf` |
| Port | `30004` |
| Context window | `400000` |
| Quantization | `Q4_K_M` |
| Process | `/mnt/data/llama.cpp/build/bin/llama-server -m /mnt/data/LM-Studio/models/lmstudio-community/Qwen3.6-35B-A3B-GGUF/Qwen3.6-35B-A3B-Q4_K_M.gguf -c 400000 --host 0.0.0.0 --port 30004 -ngl 99 --parallel 2 -fa on --cache-type-k q8_0 --cache-type-v q8_0 --jinja --reasoning off --no-webui --metrics` |
| Verification | `/health` returned `{"status":"ok"}`, `/v1/models` listed the model, and a chat probe returned `gx10-probe-ok` |
| Probe speed | Short completion probe measured about `65 tokens/sec` |

Launch command:

```bash
nohup /mnt/data/llama.cpp/build/bin/llama-server \
  -m /mnt/data/LM-Studio/models/lmstudio-community/Qwen3.6-35B-A3B-GGUF/Qwen3.6-35B-A3B-Q4_K_M.gguf \
  -c 400000 --host 0.0.0.0 --port 30004 \
  -ngl 99 --parallel 2 -fa on --cache-type-k q8_0 --cache-type-v q8_0 \
  --jinja --reasoning off --no-webui --metrics \
  > /tmp/qwen36-35b-30004.log 2>&1 &
```

Verify from GX10:

```bash
curl http://localhost:30004/health
```

Verify from Mac Mini:

```bash
curl http://192.168.1.77:30004/health
curl http://192.168.1.77:30004/v1/models
```

## 4. Provider Fabric Entries

The Mac Mini OpenClaw config currently has OpenAI-compatible provider entries for the GX10 model servers. vNext should model these as Provider Runtime Nodes and route through its own Provider Fabric policy instead of hard-coding OpenClaw ownership.

Relevant endpoints:

```json
{
  "gx10-qwen36-35b": {
    "type": "openai-compatible",
    "baseUrl": "http://192.168.1.77:30004/v1",
    "model": "Qwen3.6-35B-A3B-Q4_K_M.gguf",
    "contextWindow": 400000
  }
}
```

Use a local placeholder API key only if the OpenAI-compatible client requires one. Do not commit real provider secrets.

## 5. GX10 Storage

### Internal NVMe

The internal `931.5G` NVMe is mounted as `/`.

### External NVMe / Data Mount

`/mnt/data` is a `3.7T` ext4 mount backed by device `sda1`; it was `950G` used and `27%` full during verification.

Active and archive model files:

```text
/mnt/data/models/
|-- gemma-4-26B-A4B-it-UD-Q4_K_M.gguf  (16G, inactive)
|-- Qwen3.6-27B-Q4_K_M.gguf             (17G, inactive)
|-- gemma-4-26b-a4b-q4_k_m.gguf         (16G, old, archive candidate)
|-- gemma-4-26b-a4b-f16.gguf            (48G, BF16, archive candidate)
|-- Qwen3-14B.Q4_K_M.gguf               (8.4G, archive candidate)
`-- Qwen3.5-35B-A3B/                    (67G, archive candidate)

/mnt/data/LM-Studio/models/lmstudio-community/Qwen3.6-35B-A3B-GGUF/
`-- Qwen3.6-35B-A3B-Q4_K_M.gguf         (active on port 30004)

/mnt/data/archive-models/
|-- gemma-4-26b-a4b-it-hf/              (49G)
|-- gemma-4-26b-a4b-it/                 (49G)
`-- gemma-4-31b-it/                     (59G)
```

`~/.local/bin/llama-server` exists but is broken because required shared libraries such as `libmtmd.so.0`, `libllama.so.0`, and `libggml.so.0` are not found. Use `/mnt/data/llama.cpp/build/bin/llama-server`.

## 6. NAS Backup Storage

**Host:** `192.168.1.52`
**SSH alias:** `nas`
**SSH user:** `manolo`
**Capacity:** 22T total, about 5% used during verification

The verified backup directory is misspelled on disk:

```text
/volume1/Reosnant Backup/
`-- Audio Recordings/
    `-- 2026/
        |-- 03/
        `-- 04/
```

Planned but not verified on disk:

- `/volume1/Reosnant Backup/Transcripts/`
- `/volume1/Reosnant Backup/Mac Mini Backups/`
- `/volume1/Reosnant Backup/GX10 Archive/`

Do not silently switch docs to `/volume1/Resonant Backup/`; the live path is currently `/volume1/Reosnant Backup/`.

## 7. Local Audio Transcription

Use `mlx-whisper` on the Mac Mini for local transcription unless a specific job requires a different backend.

Command:

```bash
/tmp/mlx-whisper-env/bin/mlx_whisper <file> \
  --model mlx-community/whisper-large-v3-turbo \
  --language en \
  --output-format txt \
  --output-dir /tmp/whisper_out
```

Environment:

- venv: `/tmp/mlx-whisper-env/`
- Python: `3.13.13`
- model cache: `~/.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo/`
- cache size on 2026-05-10: about `4.84G`

Recreate if needed:

```bash
python3.13 -m venv /tmp/mlx-whisper-env
/tmp/mlx-whisper-env/bin/pip install mlx-whisper
```

## 8. Codex CLI

**Version:** `0.130.0`
**Config:** `~/.codex/config.toml`
**Configured default model:** `gpt-5.5`
**Sandbox:** `danger-full-access`
**Approval policy:** `never`

Use PTY execution for Codex CLI when invoked by automation.

Non-interactive command shape:

```bash
cd /path/to/project
codex exec --dangerously-bypass-approvals-and-sandbox "Read TASK.md and follow it exactly"
```

Do not use stale flags such as `--print` or `--permission-mode` for this local CLI workflow.

## 9. vNext Architecture Rules

1. Memory, personal data, private system state, and credentials must not be committed to public repositories.
2. `resonantos-augmentor` is private. `resonantos-alpha` is public. Do not mix private operator data into public code.
3. GX10 model endpoints should be represented as Provider Fabric nodes for inference.
4. GX10 shell/container execution should be represented as Compute Fabric jobs, not ad hoc add-on shell access.
5. Do not claim a service is working without test evidence. Record the probe used.
6. Do not install host-level GPU Python stacks on GX10 for CC `12.1` workloads without a specific validation record.
7. Do not store plaintext SSH, VNC, provider, Telegram, NAS, or other credentials in this repository.

## 10. Verification Commands

Mac Mini:

```bash
hostname
ifconfig en0 | rg 'inet '
sw_vers
codex --version
openclaw status
```

GX10:

```bash
ssh rlab@gx10-23bd.local 'lsb_release -a; nvidia-smi --query-gpu=name,compute_cap,memory.total --format=csv,noheader; df -h /mnt/data; ps -eo pid,cmd | grep llama-server | grep -v grep'
curl http://192.168.1.77:30004/health
curl http://192.168.1.77:30004/v1/models
```

NAS:

```bash
ssh nas 'hostname; df -h /volume1; find "/volume1/Reosnant Backup" -maxdepth 3 -type d | sort'
```
