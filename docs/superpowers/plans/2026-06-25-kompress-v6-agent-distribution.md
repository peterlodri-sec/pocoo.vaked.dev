# Kompress v6: Agent Distribution Fine-Tuning Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train kompress-v6 on synthetic Claude Code agent-pattern data, validate improvement on real headroom proxy traffic, publish blog post.

**Architecture:** Extend `build_domain_data.py` with 5 new generators → generate 3k agent-pattern pairs → self-label with v4+override on vast.ai → merge with existing 2003 generic pairs → fine-tune from v4 weights → eval heretic + two-mode proxy comparison → write blog post from results.

**Tech Stack:** Python 3.12, PyTorch, ModernBERT-base, HuggingFace Hub, vast.ai (RTX 4090), headroom proxy

## Global Constraints

- All work in `/Users/lodripeter/workspace/peterlodri-sec/ultrawhale` (data + scripts) and `/Users/lodripeter/workspace/peterlodri-sec/pocoo.vaked.dev` (blog)
- Base model for v6: `PeetPedro/kompress-v4` (NOT v2-base — preserve override internalization)
- Training epochs: 3
- HuggingFace output repo: `PeetPedro/kompress-v6`
- Heretic success criterion: `exact_pct >= 0.967` (no regression from v4)
- Vast.ai script: `bash scripts/vast_relaunch.sh [OLD_ID] run_training_v6.sh`
- `_MUST_KEEP_RE` pattern (copy verbatim into every new script that uses it):
```python
_MUST_KEEP_RE = re.compile(
    r"\b0x[0-9A-Fa-f]+\b"
    r"|(?<![\w.])\d+(?:\.\d+)?(?![\w.])"
    r"|[A-Z_]{2,}"
    r"|[a-z_][a-z0-9_]*\.[a-z0-9_]+"
    r"|/[a-z0-9/._-]{2,}"
    r"|\.[a-z]{2,4}\b"
    r"|--?[a-z][\w-]*"
    r"|\b[A-Z][a-z]+[A-Z]\w*"
)
```

---

### Task 1: Add 5 agent-pattern generators to build_domain_data.py

**Files:**
- Modify: `scripts/build_domain_data.py`
- Test: run manually, inspect output

**Interfaces:**
- Produces: `data/kompress_agent_train.jsonl` (~3k rows)
- Each row: `{"text": str, "reference": str, "role": "tool", "source": str, "topic": "compression"}`
- Reference invariant: every token matching `_MUST_KEEP_RE` in `text` appears in `reference`; ratio `len(text)/len(reference) >= 1.3`

- [ ] **Step 1: Add shared data pools** at top of `build_domain_data.py` after existing `_ALLCAPS` pool:

```python
_FILES = [
    "main.py", "config.yaml", "Cargo.toml", "package.json", "Makefile",
    "server.ts", "router.go", "schema.prisma", "docker-compose.yml", "README.md",
    "auth.py", "middleware.ts", "db.rs", "api_test.py", "utils.js",
]
_EXTENSIONS = [".py", ".ts", ".rs", ".go", ".yaml", ".json", ".toml", ".sh", ".md"]
_USERS = ["dev", "app", "root", "ci", "runner", "deploy", "service"]
_SIZES = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072]
_PERMS = ["drwxr-xr-x", "-rw-r--r--", "-rwxr-xr-x", "drwx------", "-rw-rw-r--"]
_GIT_HASHES = [
    "a3f2c91", "b7d0e45", "c9a1b23", "d4e5f67", "e8b3c12",
    "f1a2b34", "90c4d56", "12e3f78", "34a5b90", "56c7d01",
]
_RUST_ERRORS = [
    "cannot borrow `{}` as mutable", "mismatched types: expected `{}`",
    "use of moved value: `{}`", "lifetime `'a` may not live long enough",
    "trait `{}` is not implemented for `{}`",
]
_TS_ERRORS = [
    "Type '{}' is not assignable to type '{}'",
    "Property '{}' does not exist on type '{}'",
    "Argument of type '{}' is not assignable",
    "Cannot find module '{}' or its corresponding type declarations",
]
_PYTHON_ERRORS = [
    "AttributeError: '{}' object has no attribute '{}'",
    "TypeError: {} takes {} positional arguments but {} were given",
    "KeyError: '{}'",
    "ImportError: cannot import name '{}' from '{}'",
]
_GREP_CONTEXTS = [
    "    def {}(self, request):",
    "    return {}(data)",
    "    raise {}(message)",
    "    logger.{{'level'}}.info(msg)",
    "    config = {}()",
    "    assert {} is not None",
    "    self.{} = value",
]
```

- [ ] **Step 2: Add `_make_bash_output` generator** after existing generators:

```python
def _make_bash_output(rng: random.Random) -> tuple[str, str]:
    cmd = rng.choice(["ls -la", "find . -name", "grep -rn", "git log --oneline", "cargo build"])
    path = rng.choice(_PATHS)
    flag = rng.choice(_FLAGS)
    num1 = rng.randint(1, 999999)
    num2 = rng.randint(100, 65536)
    user = rng.choice(_USERS)
    fname = rng.choice(_FILES)
    perm = rng.choice(_PERMS)
    error = rng.choice(_ALLCAPS)
    size = rng.choice(_SIZES)
    ext = rng.choice(_EXTENSIONS)
    hashv = rng.choice(_GIT_HASHES)
    mod = rng.choice(_MODULES)
    camel = rng.choice(_CAMEL)

    noise = [
        f"Running {cmd} on the project directory to check current state of files",
        f"The output below shows the directory listing after the recent changes were applied",
        f"Command executed successfully and produced the following results for review",
    ]
    if "ls" in cmd:
        text = (
            f"{rng.choice(noise)}\n"
            f"total {num1}\n"
            f"{perm}  3 {user}  staff  {size} Jun 25 09:14 .\n"
            f"-rw-r--r--  1 {user}  staff  {num2} Jun 24 18:30 {fname}\n"
            f"-rwxr-xr-x  1 {user}  staff  {size * 2} Jun 25 09:14 {path.split('/')[-1]}\n"
            f"Note that permissions and ownership information above reflects current state"
        )
        ref_lines = [
            f"total {num1}",
            f"{perm}  3 {user}  staff  {size} {fname}",
            f"-rwxr-xr-x  1 {user}  staff  {size * 2} {path.split('/')[-1]}",
        ]
    elif "find" in cmd:
        text = (
            f"{rng.choice(noise)}\n"
            f"{path}/{fname}\n"
            f"{path}/tests/test_{fname}\n"
            f"{path}/build/output{ext}\n"
            f"Found {num1} files matching the pattern {flag} in the repository"
        )
        ref_lines = [
            f"{path}/{fname}",
            f"{path}/tests/test_{fname}",
            f"{path}/build/output{ext}",
            f"Found {num1} files {flag}",
        ]
    elif "grep" in cmd:
        line1 = rng.randint(1, 500)
        line2 = line1 + rng.randint(5, 50)
        text = (
            f"{rng.choice(noise)}\n"
            f"{path}/{fname}:{line1}:    def {mod.split('.')[-1]}(self):\n"
            f"{path}/{fname}:{line2}:        raise {camel}(f'error at line {line1}')\n"
            f"Matches found: {num1} occurrences across {num2} files in total"
        )
        ref_lines = [
            f"{path}/{fname}:{line1}: def {mod.split('.')[-1]}(self):",
            f"{path}/{fname}:{line2}: raise {camel}(error at line {line1})",
            f"{num1} occurrences {num2} files",
        ]
    elif "git" in cmd:
        text = (
            f"{rng.choice(noise)}\n"
            f"{hashv} fix({mod.split('.')[0]}): resolve {camel} on retry path\n"
            f"{rng.choice(_GIT_HASHES)} chore: bump version to {num2 % 10}.{num1 % 100}.{num2 % 50}\n"
            f"Showing last {num1 % 20 + 1} commits on the main branch for context"
        )
        ref_lines = [
            f"{hashv} fix({mod.split('.')[0]}): {camel}",
            f"{rng.choice(_GIT_HASHES)} bump {num2 % 10}.{num1 % 100}.{num2 % 50}",
        ]
    else:  # cargo
        text = (
            f"{rng.choice(noise)}\n"
            f"   Compiling {mod.split('.')[0]} v{num2 % 10}.{num1 % 100}.0 ({path})\n"
            f"error[E0{num2 % 1000:03d}]: {rng.choice(_RUST_ERRORS).format(camel, 'str')}\n"
            f"  --> {path}/{fname}:{num2}:{num1 % 80}\n"
            f"The build failed with {num1 % 10 + 1} errors and {num1 % 5} warnings"
        )
        ref_lines = [
            f"Compiling {mod.split('.')[0]} v{num2 % 10}.{num1 % 100}.0 ({path})",
            f"error[E0{num2 % 1000:03d}]: {camel}",
            f"{path}/{fname}:{num2}:{num1 % 80}",
            f"{num1 % 10 + 1} errors {num1 % 5} warnings",
        ]

    reference = "\n".join(ref_lines)
    return text, reference


def gen_bash_output(rng: random.Random, n: int = 150) -> list[dict]:
    pairs = []
    for _ in range(n * 4):
        text, reference = _make_bash_output(rng)
        if len(text) >= 100 and len(text) / max(len(reference), 1) >= 1.3:
            pairs.append({
                "text": text, "reference": reference,
                "role": "tool", "source": "bash_output", "topic": "compression",
            })
        if len(pairs) >= n:
            break
    return pairs[:n]
```

- [ ] **Step 3: Add `_make_file_read` generator:**

```python
def _make_file_read(rng: random.Random) -> tuple[str, str]:
    fname = rng.choice(_FILES)
    path = rng.choice(_PATHS)
    func = rng.choice(_FUNCTIONS)
    mod = rng.choice(_MODULES)
    camel = rng.choice(_CAMEL)
    flag = rng.choice(_FLAGS)
    num1 = rng.randint(1, 500)
    num2 = rng.randint(1, 200)
    ext = fname.split(".")[-1] if "." in fname else "py"

    noise_lines = [
        f"# This module handles the core {mod.split('.')[0]} functionality",
        f"# Written by the platform team, last reviewed during the Q2 refactor",
        f"# See documentation at docs/{mod.replace('.','/')}.md for full context",
        f"# TODO: refactor this once the new API stabilizes in v2",
    ]
    code_lines = [
        f"{num1}: import {mod}",
        f"{num1 + 5}: from {mod} import {func}, {camel}",
        f"{num1 + 12}: def {func}(self, request, timeout={num2}):",
        f"{num1 + 13}:     if request.retries > {num2 % 10}:",
        f"{num1 + 14}:         raise {camel}(f'max retries {num2 % 10} exceeded')",
        f"{num1 + 20}:     return self.{func}(request, flag='{flag}')",
    ]

    text = (
        f"Reading file {path}/{fname} to understand the current implementation\n"
        + rng.choice(noise_lines) + "\n"
        + "\n".join(code_lines) + "\n"
        + f"The file contains {num1 + 50} lines total and was last modified on Jun {num2 % 28 + 1}"
    )
    reference = "\n".join(code_lines)
    return text, reference


def gen_file_read(rng: random.Random, n: int = 150) -> list[dict]:
    pairs = []
    for _ in range(n * 4):
        text, reference = _make_file_read(rng)
        if len(text) >= 100 and len(text) / max(len(reference), 1) >= 1.3:
            pairs.append({
                "text": text, "reference": reference,
                "role": "tool", "source": "file_read", "topic": "compression",
            })
        if len(pairs) >= n:
            break
    return pairs[:n]
```

- [ ] **Step 4: Add `_make_error_trace` generator:**

```python
def _make_error_trace(rng: random.Random) -> tuple[str, str]:
    lang = rng.choice(["python", "typescript", "rust"])
    path = rng.choice(_PATHS)
    fname = rng.choice(_FILES)
    func = rng.choice(_FUNCTIONS)
    camel = rng.choice(_CAMEL)
    mod = rng.choice(_MODULES)
    num1 = rng.randint(1, 500)
    num2 = rng.randint(1, 200)
    http = rng.choice(_HTTP_CODES)

    noise = [
        "The error occurred during the processing of the incoming request from the client",
        "This exception was caught by the global error handler and logged for investigation",
        "The following stack trace was captured at the time of the failure for debugging",
    ]

    if lang == "python":
        tmpl = rng.choice(_PYTHON_ERRORS).format(camel, func, num2, num2+1)
        trace_lines = [
            f"Traceback (most recent call last):",
            f"  File \"{path}/{fname}\", line {num1}, in {func}",
            f"    result = self.{func}(request)",
            f"  File \"{path}/{mod.replace('.','/')}.py\", line {num2}, in {func}",
            f"    raise {camel}(f'HTTP {http}: {tmpl}')",
            f"{camel}: HTTP {http} at {path}/{fname}:{num1}",
        ]
    elif lang == "typescript":
        tmpl = rng.choice(_TS_ERRORS).format(camel, func)
        trace_lines = [
            f"error TS{num2 % 9000 + 1000}: {tmpl}",
            f"  at {path}/{fname}:{num1}:{num2 % 80}",
            f"  at {func} ({path}/{mod.replace('.','/')}.ts:{num2}:{num2 % 40})",
            f"  at {camel}.handle ({path}/server.ts:{num1 + 10}:5)",
        ]
    else:
        tmpl = rng.choice(_RUST_ERRORS).format(camel, "str")
        trace_lines = [
            f"error[E0{num2 % 1000:03d}]: {tmpl}",
            f" --> {path}/{fname}:{num1}:{num2 % 80}",
            f"  |",
            f"{num1} | let mut {func.lower()} = {camel}::new();",
            f"  | ^^^ {camel} moved here at line {num2}",
        ]

    text = rng.choice(noise) + "\n" + "\n".join(trace_lines)
    reference = "\n".join(trace_lines)
    return text, reference


def gen_error_trace(rng: random.Random, n: int = 150) -> list[dict]:
    pairs = []
    for _ in range(n * 4):
        text, reference = _make_error_trace(rng)
        if len(text) >= 100 and len(text) / max(len(reference), 1) >= 1.2:
            pairs.append({
                "text": text, "reference": reference,
                "role": "tool", "source": "error_trace", "topic": "compression",
            })
        if len(pairs) >= n:
            break
    return pairs[:n]
```

- [ ] **Step 5: Add `_make_search_result` generator:**

```python
def _make_search_result(rng: random.Random) -> tuple[str, str]:
    path = rng.choice(_PATHS)
    fname = rng.choice(_FILES)
    func = rng.choice(_FUNCTIONS)
    camel = rng.choice(_CAMEL)
    num1 = rng.randint(1, 999)
    num2 = rng.randint(1, 100)
    size = rng.choice(_SIZES)
    flag = rng.choice(_FLAGS)

    noise = [
        f"Searching the codebase for references to understand impact before making changes",
        f"Running ripgrep to find all usages of the function across the repository",
        f"The search results below show all relevant matches that need to be updated",
    ]
    line1 = rng.randint(10, 300)
    line2 = line1 + rng.randint(10, 80)
    line3 = line2 + rng.randint(10, 50)

    result_lines = [
        f"{path}/{fname}:{line1}: def {func}(self, {flag.lstrip('-')}=None):",
        f"{path}/tests/test_{fname}:{line2}:     result = {func}(data, timeout={num2})",
        f"{path}/core/{fname}:{line3}:     raise {camel}(f'failed after {num1} attempts')",
        f"{num1} matches in {num2} files ({size} bytes searched)",
    ]

    text = (
        rng.choice(noise) + "\n"
        + "\n".join(result_lines) + "\n"
        + f"All {num1} matches are in production code paths and require careful review before {flag}"
    )
    reference = "\n".join(result_lines)
    return text, reference


def gen_search_result(rng: random.Random, n: int = 150) -> list[dict]:
    pairs = []
    for _ in range(n * 4):
        text, reference = _make_search_result(rng)
        if len(text) >= 100 and len(text) / max(len(reference), 1) >= 1.25:
            pairs.append({
                "text": text, "reference": reference,
                "role": "tool", "source": "search_result", "topic": "compression",
            })
        if len(pairs) >= n:
            break
    return pairs[:n]
```

- [ ] **Step 6: Add `_make_json_tool_result` generator:**

```python
def _make_json_tool_result(rng: random.Random) -> tuple[str, str]:
    func = rng.choice(_FUNCTIONS)
    camel = rng.choice(_CAMEL)
    mod = rng.choice(_MODULES)
    num1 = rng.randint(1, 9999)
    num2 = rng.randint(1, 100)
    http = rng.choice(_HTTP_CODES)
    path = rng.choice(_PATHS)
    flag = rng.choice(_FLAGS)

    noise = [
        f"The tool call returned the following JSON response from the MCP server",
        f"Received structured output from the {mod.split('.')[0]} tool endpoint below",
        f"Tool execution completed and returned the following structured data for processing",
    ]

    payload = {
        "status": http,
        "request_id": f"req_{num1:06d}",
        "operation": func,
        "resource": path,
        "result": {
            "count": num2,
            "items": [
                {"id": num1 + i, "type": camel, "flag": flag}
                for i in range(min(3, num2 % 4 + 1))
            ],
            "metadata": {
                "module": mod,
                "version": f"{num2 % 10}.{num1 % 100}.0",
                "max_retries": num2 % 5 + 1,
            }
        },
        "error": None if http < 400 else f"{camel}: {flag} rejected at {path}",
    }
    import json as _json
    payload_str = _json.dumps(payload, indent=2)

    key_lines = [
        f'"status": {http}',
        f'"request_id": "req_{num1:06d}"',
        f'"operation": "{func}"',
        f'"resource": "{path}"',
        f'"count": {num2}',
        f'"module": "{mod}"',
        f'"version": "{num2 % 10}.{num1 % 100}.0"',
    ]
    if http >= 400:
        key_lines.append(f'"error": "{camel}: {flag}"')

    text = rng.choice(noise) + "\n" + payload_str
    reference = "{\n  " + ",\n  ".join(key_lines) + "\n}"
    return text, reference


def gen_json_tool_result(rng: random.Random, n: int = 150) -> list[dict]:
    pairs = []
    for _ in range(n * 4):
        text, reference = _make_json_tool_result(rng)
        if len(text) >= 100 and len(text) / max(len(reference), 1) >= 1.3:
            pairs.append({
                "text": text, "reference": reference,
                "role": "tool", "source": "json_tool_result", "topic": "compression",
            })
        if len(pairs) >= n:
            break
    return pairs[:n]
```

- [ ] **Step 7: Update `main()` in `build_domain_data.py` to add new argument and generators:**

Replace the existing `main()` function with:

```python
def main() -> None:
    ap = argparse.ArgumentParser(description="Generate domain training data for Kompress")
    ap.add_argument("--output", default="data/domain_train.jsonl")
    ap.add_argument("--per-domain", type=int, default=150)
    ap.add_argument("--agent-only", action="store_true",
                    help="Generate only the 5 agent-pattern domains (v6 data)")
    args = ap.parse_args()

    rng = random.Random(SEED)

    original_generators = [
        ("code_diff", gen_code_diff),
        ("log_stream", gen_log_stream),
        ("json_tool_output", gen_json_tool_output),
        ("agent_error", gen_agent_error),
    ]
    agent_generators = [
        ("bash_output", gen_bash_output),
        ("file_read", gen_file_read),
        ("error_trace", gen_error_trace),
        ("search_result", gen_search_result),
        ("json_tool_result", gen_json_tool_result),
    ]
    generators = agent_generators if args.agent_only else original_generators + agent_generators

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    total = 0
    counts: dict[str, int] = {}
    with open(out_path, "w") as f:
        for domain, gen_fn in generators:
            pairs = gen_fn(rng, n=args.per_domain)
            for pair in pairs:
                f.write(json.dumps(pair) + "\n")
            counts[domain] = len(pairs)
            total += len(pairs)

    print(f"Written {total} pairs to {out_path}")
    for domain, count in counts.items():
        print(f"  {domain}: {count}")
```

- [ ] **Step 8: Generate and verify**

```bash
cd /Users/lodripeter/workspace/peterlodri-sec/ultrawhale
python3 scripts/build_domain_data.py \
    --agent-only \
    --per-domain 600 \
    --output data/kompress_agent_train.jsonl
```

Expected output:
```
Written 3000 pairs to data/kompress_agent_train.jsonl
  bash_output: 600
  file_read: 600
  error_trace: 600
  search_result: 600
  json_tool_result: 600
```

- [ ] **Step 9: Spot-check 5 rows, verify must-keep invariant**

```bash
python3 - << 'PY'
import json, re
_MK = re.compile(
    r"\b0x[0-9A-Fa-f]+\b|(?<![\w.])\d+(?:\.\d+)?(?![\w.])"
    r"|[A-Z_]{2,}|[a-z_][a-z0-9_]*\.[a-z0-9_]+|/[a-z0-9/._-]{2,}"
    r"|\.[a-z]{2,4}\b|--?[a-z][\w-]*|\b[A-Z][a-z]+[A-Z]\w*"
)
rows = [json.loads(l) for l in open("data/kompress_agent_train.jsonl")]
import random; random.seed(0); sample = random.sample(rows, 20)
violations = 0
for r in sample:
    must = [m.group(0) for m in _MK.finditer(r["text"])]
    missing = [m for m in must if m not in r["reference"]]
    if missing:
        print(f"VIOLATION in {r['source']}: missing {missing[:3]}")
        violations += 1
    ratio = len(r["text"]) / max(len(r["reference"]), 1)
    if ratio < 1.2:
        print(f"LOW RATIO {ratio:.2f} in {r['source']}: {r['text'][:60]}")
print(f"Checked 20 rows. Violations: {violations}")
PY
```

Expected: `Checked 20 rows. Violations: 0`

- [ ] **Step 10: Commit**

```bash
cd /Users/lodripeter/workspace/peterlodri-sec/ultrawhale
git add scripts/build_domain_data.py data/kompress_agent_train.jsonl
git commit -m "feat(data): add 5 agent-pattern generators for v6 training (bash/file/error/search/json)"
```

---

### Task 2: Create v6 training script

**Files:**
- Create: `scripts/run_training_v6.sh`

**Interfaces:**
- Consumes: `data/kompress_agent_train.jsonl` (from Task 1), `data/kompress_multi_train.jsonl` (existing)
- Consumes: `scripts/train_kompress_v32.py` (existing, unchanged — reuse with v4 base)
- Produces: `PeetPedro/kompress-v6` on HuggingFace

- [ ] **Step 1: Create `scripts/run_training_v6.sh`**

```bash
cat > /Users/lodripeter/workspace/peterlodri-sec/ultrawhale/scripts/run_training_v6.sh << 'SCRIPT'
#!/usr/bin/env bash
# Kompress v6: agent-distribution fine-tune from v4
# Hypothesis: synthetic Claude Code patterns (bash/file/error/search/json)
#             close training-production gap, improve real-world compression
set -euo pipefail
cd /workspace/ultrawhale
HF_TOKEN=${HF_TOKEN:-}
HF_REPO=${HF_REPO:-"PeetPedro/kompress-v6"}

echo "=== 1/6 Generate agent training data ==="
python3 scripts/build_domain_data.py \
    --agent-only \
    --per-domain 600 \
    --output data/kompress_agent_train.jsonl

echo "=== 2/6 Self-label agent data with v4+override ==="
python3 - << 'PY'
import json, re, torch, sys, pathlib
sys.path.insert(0, "/workspace/ultrawhale")
from scripts.train_kompress import HeadroomCompressorModel, load_v2_weights
from transformers import AutoTokenizer

_MUST_KEEP_RE = re.compile(
    r"\b0x[0-9A-Fa-f]+\b"
    r"|(?<![\w.])\d+(?:\.\d+)?(?![\w.])"
    r"|[A-Z_]{2,}"
    r"|[a-z_][a-z0-9_]*\.[a-z0-9_]+"
    r"|/[a-z0-9/._-]{2,}"
    r"|\.[a-z]{2,4}\b"
    r"|--?[a-z][\w-]*"
    r"|\b[A-Z][a-z]+[A-Z]\w*"
)

BASE = "answerdotai/ModernBERT-base"
tok = AutoTokenizer.from_pretrained(BASE)
model = HeadroomCompressorModel(BASE)
load_v2_weights(model, "PeetPedro/kompress-v4")   # <- v4, not v3
model.eval()
device = "cuda" if torch.cuda.is_available() else "cpu"
model = model.to(device)
print(f"Self-labeling on {device}")

def compress_with_override(text):
    enc = tok(text, return_tensors="pt", truncation=True, max_length=512, padding=True)
    enc = {k: v.to(device) for k, v in enc.items()}
    with torch.no_grad():
        logits, span = model(enc["input_ids"], enc["attention_mask"])
        probs = torch.softmax(logits, dim=-1)[0, :, 1]
        scores = probs * (0.5 + 0.5 * span[0])
        keep = scores > 0.5
    tokens = tok.convert_ids_to_tokens(enc["input_ids"][0])
    for i, t in enumerate(tokens):
        w = tok.convert_tokens_to_string([t]).strip()
        if _MUST_KEEP_RE.search(w):
            keep[i] = True
    kept = [t for t, k in zip(tokens, keep) if k and t not in ("[CLS]","[SEP]","<s>","</s>")]
    return tok.convert_tokens_to_string(kept)

records = [json.loads(l) for l in open("data/kompress_agent_train.jsonl")]
print(f"Self-labeling {len(records)} agent records...")
out, skipped = [], 0
for i, r in enumerate(records):
    if i % 500 == 0: print(f"  {i}/{len(records)}")
    new_ref = compress_with_override(r["text"])
    ratio = len(r["text"]) / max(len(new_ref), 1)
    if ratio >= 1.2 and len(new_ref) >= 30:
        out.append({
            "text": r["text"], "reference": new_ref,
            "role": r.get("role", "tool"),
            "source": "self_labeled_v4_" + r["source"],
            "topic": r.get("topic", ""),
        })
    else:
        skipped += 1

import random; random.seed(42)
samp = random.sample(out, min(100, len(out)))
mk_t, mk_r = 0, 0
for r in samp:
    must = [m.group(0) for m in _MUST_KEEP_RE.finditer(r["text"])]
    mk_t += len(must); mk_r += sum(1 for m in must if m in r["reference"])
print(f"mk_in_ref: {mk_r/max(mk_t,1):.3f} (target >= 0.85)")
print(f"Written {len(out)} self-labeled pairs (skipped {skipped})")

with open("data/agent_self_labeled.jsonl","w") as f:
    for r in out: f.write(json.dumps(r, ensure_ascii=False)+"\n")
PY

echo "=== 3/6 Merge: agent self-labeled + existing generic ==="
python3 - << 'PY'
import json
sources = [
    ("data/agent_self_labeled.jsonl", "agent"),
    ("data/kompress_multi_train.jsonl", "generic"),
]
merged = []
for path, label in sources:
    try:
        rows = [json.loads(l) for l in open(path)]
        merged.extend(rows)
        print(f"  {label}: {len(rows)} rows from {path}")
    except FileNotFoundError:
        print(f"  WARN: {path} not found, skipping")
import random; random.seed(42); random.shuffle(merged)
with open("data/v6_train.jsonl","w") as f:
    for r in merged: f.write(json.dumps(r, ensure_ascii=False)+"\n")
print(f"Total: {len(merged)} rows -> data/v6_train.jsonl")
PY

echo "=== 4/6 Fine-tune from v4 ==="
python3 scripts/train_kompress_v32.py \
    --data data/v6_train.jsonl \
    --base-model PeetPedro/kompress-v4 \
    --output kompress-v6-finetuned \
    --epochs 3 \
    --batch-size 16

echo "=== 5/6 Heretic eval ==="
python3 scripts/eval_heretic.py \
    --model kompress-v6-finetuned || echo "WARN: eval non-fatal"

echo "=== 6/6 ONNX export + HuggingFace upload ==="
pip install -q onnx onnxruntime
python3 - << 'PY'
import sys, os, torch
sys.path.insert(0, "/workspace/ultrawhale")
from scripts.train_kompress import HeadroomCompressorModel, load_v2_weights
from transformers import AutoTokenizer
model = HeadroomCompressorModel("answerdotai/ModernBERT-base")
load_v2_weights(model, "kompress-v6-finetuned")
model.eval()
tok = AutoTokenizer.from_pretrained("answerdotai/ModernBERT-base")
dummy = tok("hello world", return_tensors="pt")
class W(torch.nn.Module):
    def __init__(self,m): super().__init__(); self.m=m
    def forward(self,i,a):
        l,s=self.m(i,a); p=torch.softmax(l,dim=-1)[:,:,1]
        return p*(0.5+0.5*s)
os.makedirs("kompress-v6-finetuned/onnx",exist_ok=True)
torch.onnx.export(W(model),(dummy["input_ids"],dummy["attention_mask"]),
    "kompress-v6-finetuned/onnx/kompress-fp32.onnx",
    input_names=["input_ids","attention_mask"],output_names=["final_scores"],
    dynamic_axes={"input_ids":{0:"b",1:"s"},"attention_mask":{0:"b",1:"s"},"final_scores":{0:"b",1:"s"}},
    opset_version=17)
print("ONNX exported")
PY

if [ -n "$HF_TOKEN" ]; then
    python3 - << PY
from huggingface_hub import HfApi; import os
api=HfApi(token=os.environ["HF_TOKEN"])
api.create_repo("${HF_REPO}",exist_ok=True,private=False)
api.upload_folder(folder_path="kompress-v6-finetuned",repo_id="${HF_REPO}",
    commit_message="kompress-v6: agent-distribution fine-tune from v4")
print("Uploaded to ${HF_REPO}")
PY
fi
echo "=== Done. Check heretic exact_pct >= 0.967 ==="
SCRIPT
chmod +x scripts/run_training_v6.sh
```

- [ ] **Step 2: Verify the script is syntactically valid**

```bash
bash -n /Users/lodripeter/workspace/peterlodri-sec/ultrawhale/scripts/run_training_v6.sh
echo "Exit: $?"
```

Expected: `Exit: 0`

- [ ] **Step 3: Update vast_relaunch.sh default to reference v6 if needed**

Check: `grep "run_training" /Users/lodripeter/workspace/peterlodri-sec/ultrawhale/scripts/vast_relaunch.sh | head -3`

The vast_relaunch.sh takes SCRIPT as second arg — no change needed. Run as:
`bash scripts/vast_relaunch.sh [OLD_ID] run_training_v6.sh`

- [ ] **Step 4: Commit**

```bash
cd /Users/lodripeter/workspace/peterlodri-sec/ultrawhale
git add scripts/run_training_v6.sh
git commit -m "feat(training): add run_training_v6.sh — self-label agent data from v4, train on 5k merged pairs"
```

---

### Task 3: Launch vast.ai training and capture results

**Files:**
- Modify: `LOOP_STATE.md`

**Interfaces:**
- Consumes: `scripts/run_training_v6.sh`, `scripts/vast_relaunch.sh`
- Produces: `PeetPedro/kompress-v6` on HuggingFace + heretic score + mk_in_ref

- [ ] **Step 1: Launch training instance**

```bash
cd /Users/lodripeter/workspace/peterlodri-sec/ultrawhale
# Push latest to origin first so vast.ai pulls the new script
git push origin main

# Launch (omit OLD_ID if no prior instance running)
bash scripts/vast_relaunch.sh run_training_v6.sh
```

Note the instance ID printed. Monitor with:
```bash
vastai logs <INSTANCE_ID> --tail 50
```

- [ ] **Step 2: Watch for mk_in_ref and heretic output**

In the logs, look for these two lines:
```
mk_in_ref: X.XXX (target >= 0.85)
```
and from eval_heretic.py:
```
exact_pct: X.XXX
```

Record both values.

- [ ] **Step 3: Decision gate**

If `exact_pct < 0.967`: do NOT update headroom default. Check mk_in_ref — if < 0.80, try adding `--must-keep-weight 8.0` to train_kompress_v32.py call in run_training_v6.sh, then re-run (costs another ~$0.20).

If `exact_pct >= 0.967`: proceed to Task 4.

- [ ] **Step 4: Update LOOP_STATE.md with v6 results**

Add row to convergence table:
```markdown
| v6 | <mk_in_ref> | <exact_pct> | 0.000 | ✓ agent-distribution fine-tune |
```

Update budget tracking and add session close entry.

- [ ] **Step 5: Commit**

```bash
cd /Users/lodripeter/workspace/peterlodri-sec/ultrawhale
git add LOOP_STATE.md
git commit -m "chore(state): record v6 training results — exact_pct=X.XXX, mk_in_ref=X.XXX"
```

---

### Task 4: Real-world eval — two-mode proxy comparison

**Files:**
- No new files — measure from live headroom proxy

**Interfaces:**
- Consumes: `PeetPedro/kompress-v6` (from Task 3)
- Produces: before/after proxy stats (record in LOOP_STATE.md)

- [ ] **Step 1: Check headroom flag for disabling prefix freeze**

```bash
headroom proxy --help 2>&1 | grep -i "prefix\|freeze\|cache"
```

If `--no-prefix-freeze` exists, use it. If not, check:
```bash
headroom proxy --help 2>&1 | grep -i "protect\|stable\|align"
```

Use whatever flag disables CacheAligner for Mode B. If no flag exists, start Mode B proxy with a config override:
```bash
headroom proxy --port 8788 --kompress-model PeetPedro/kompress-v4 > /tmp/hr_v4_mode_b.log 2>&1 &
```
and disable prefix caching by editing `~/.headroom/config.yaml` temporarily.

- [ ] **Step 2: Capture v4 baseline — Mode A (normal)**

Ensure headroom proxy is running with v4:
```bash
# Check current kompress model
curl -s http://localhost:8787/stats | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('config',{}))"
```

Run a focused Claude Code session (10-15 tool calls: file reads, bash commands, grep). Then:
```bash
curl -s http://localhost:8787/stats | python3 -c "
import json, sys
d = json.load(sys.stdin)
c = d['compression']
a = d['agent_usage']['totals']
print('=== v4 Mode A baseline ===')
print(f'requests: {a[\"requests\"]}')
print(f'tokens_saved: {a[\"tokens_saved\"]}')
print(f'savings_pct: {a[\"savings_percent\"]:.3f}%')
print(f'avg_compression: {c[\"avg_compression_pct\"]:.1f}%')
print(f'compressed_requests: {c[\"requests_compressed\"]}')
"
```

Record the numbers.

- [ ] **Step 3: Capture v4 baseline — Mode B (no prefix freeze)**

Start a second proxy on port 8788 with prefix freeze disabled (use flag found in Step 1 or config override):
```bash
headroom proxy --port 8788 [--no-prefix-freeze or equivalent] &
HR_MODE_B_PID=$!
```

Run the same Claude Code session tasks pointing to port 8788 (set `ANTHROPIC_BASE_URL=http://localhost:8788` or equivalent). Then capture:
```bash
curl -s http://localhost:8788/stats | python3 -c "
import json, sys
d = json.load(sys.stdin)
c = d['compression']
print('=== v4 Mode B (no prefix freeze) ===')
print(f'requests: {d[\"requests\"][\"total\"]}')
print(f'compressed: {c[\"requests_compressed\"]}')
print(f'avg_compression: {c[\"avg_compression_pct\"]:.1f}%')
print(f'tokens_saved: {c[\"total_tokens_removed\"]}')
"
kill $HR_MODE_B_PID
```

- [ ] **Step 4: Swap kompress model to v6 and repeat**

Update headroom kompress model to v6. How to swap depends on headroom config:
```bash
# Check how kompress model is configured
grep -r "kompress" ~/.headroom/ 2>/dev/null | head -5
headroom proxy --help 2>&1 | grep -i "kompress"
```

Restart proxy with v6, repeat Mode A and Mode B sessions, capture same stats.

- [ ] **Step 5: Record delta**

```
Mode A: v4 savings_pct=X% → v6 savings_pct=Y%  (delta=+Z%)
Mode B: v4 avg_compression=X% → v6 avg_compression=Y%  (delta=+Z%)
Mode B: v4 tokens_saved=X → v6 tokens_saved=Y  (delta=+Z)
```

Add to LOOP_STATE.md under v6 entry.

- [ ] **Step 6: Commit results**

```bash
cd /Users/lodripeter/workspace/peterlodri-sec/ultrawhale
git add LOOP_STATE.md
git commit -m "chore(eval): record v6 two-mode proxy comparison results"
```

---

### Task 5: Write and publish blog post

**Files:**
- Create: `posts/2026-06-25-kompress-v6-agent-distribution.md` (in pocoo.vaked.dev)

**Interfaces:**
- Consumes: actual results from Tasks 3 and 4
- Produces: published post on pocoo.vaked.dev

- [ ] **Step 1: Write blog post with actual results**

Create `posts/2026-06-25-kompress-v6-agent-distribution.md`:

```markdown
---
title: "Closing the Training-Production Gap in Token Compression"
date: 2026-06-25
tags: [ml, kompress, headroom, fine-tuning, self-distillation]
description: "We fine-tuned kompress on synthetic Claude Code patterns — bash output, file reads, stack traces — and measured the real-world compression uplift against production traffic."
draft: false
---

[Fill in from actual results. Structure:]

## The gap

[Concrete example: one grep output vs one alpaca training pair. Show must-keep token density difference. 1-2 paragraphs.]

## What Claude Code actually produces

[5 categories with short examples. Use real examples from eval session if possible. Note: must-keep density in agent output is X% higher than generic NLP text.]

## Closing the gap with synthetic data

[Explain the generator approach. Include one code snippet — the bash_output generator's ls branch is the clearest. Self-labeling: v4+override as teacher.]

Training summary:
- 3,000 new agent-pattern pairs (5 domains × 600)
- Merged with 2,003 existing pairs = 5,003 total
- Fine-tuned from v4 (ModernBERT-base, 149M params)
- Cost: $0.20

## Results

[Fill from Tasks 3 and 4:]
- Heretic: v4 0.967 → v6 X.XXX
- Mode A (real deployment): +X% tokens saved
- Mode B (no prefix freeze): +X% compression ratio
- [If flat or negative: explain what this means — "the synthetic gap persists at this data scale" or similar]

[Include one plot: heretic score progression v2→v6.]

## What's next

- Domain routing: per-domain thresholds, zero training cost
- C3 self-distillation: enable proxy logging for one session, train v7 on real traffic
- The data flywheel: better model → better proxy → better training data

---
*Code: [ultrawhale repo link]. Model: PeetPedro/kompress-v6 on HuggingFace.*
```

- [ ] **Step 2: Replace all `X.XXX` placeholders with actual numbers from Tasks 3-4**

Verify no unfilled placeholders remain:
```bash
grep "X\.XXX\|\[Fill\|\[If flat\|\[Include one" \
    /Users/lodripeter/workspace/peterlodri-sec/pocoo.vaked.dev/posts/2026-06-25-kompress-v6-agent-distribution.md
```

Expected: no output (all placeholders filled).

- [ ] **Step 3: Build and check locally**

```bash
cd /Users/lodripeter/workspace/peterlodri-sec/pocoo.vaked.dev
npm run build 2>&1 | tail -5
```

Expected: no errors, new post appears in build output.

- [ ] **Step 4: Commit and publish**

```bash
cd /Users/lodripeter/workspace/peterlodri-sec/pocoo.vaked.dev
git add posts/2026-06-25-kompress-v6-agent-distribution.md
git commit -m "post: kompress-v6 — closing the training-production gap"
git push origin main
```
