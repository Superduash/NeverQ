#!/usr/bin/env python3
"""
NeverQ Fast Code Exporter
Exports essential source code and configurations into clean, text bundles.
Excludes build artifacts, lockfiles, images, dependencies, and redundant files.

Outputs:
  - frontend.txt : All essential frontend code, configs, and PWA assets.
  - backend.txt  : All essential backend server code, configs, and integration reference.
  - codebase.txt : Complete unified codebase export (root configs, docs, backend, frontend).

Usage:
  python export.py             # Exports frontend.txt, backend.txt, and codebase.txt
  python export.py frontend    # Exports only frontend.txt
  python export.py backend     # Exports only backend.txt
  python export.py all         # Exports all three bundles
"""

import argparse
import datetime
import os
import sys
import time
from pathlib import Path

# Safe terminal encoding on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Directories to always skip entirely during traversal
EXCLUDE_DIRS = {
    "node_modules",
    "dist",
    "dist-ssr",
    "build",
    "out",
    ".git",
    ".vscode",
    ".idea",
    ".cache",
    ".parcel-cache",
    ".vite",
    ".turbo",
    "coverage",
    "__pycache__",
    ".system_generated",
    ".agents",
    "venv",
    ".venv",
    "env",
    "scratch",
    "Files",
}

# File extensions containing essential project code or configuration
ALLOWED_EXTENSIONS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".html",
    ".json",
    ".yaml",
    ".yml",
    ".md",
    ".bat",
    ".sh",
}

# Explicit filenames to always include even if they start with a dot
EXPLICIT_INCLUDE_FILES = {
    ".env.example",
    ".gitignore",
}

# Files to always ignore even if matching extension or located in project
IGNORE_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "FrontendQ.md",       # Prompt instruction blueprint
    "BackendQ.md",        # Prompt instruction blueprint
    "frontend.txt",
    "backend.txt",
    "codebase.txt",
    "export.txt",
    ".gitkeep",
    ".DS_Store",
    "Thumbs.db",
    "Desktop.ini",
}

# Redundant binary / media extensions to strictly ignore
IGNORED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".svg",      # SVGs can be megabytes of vector coordinate data (e.g. logo.svg is 1.65MB)
    ".pdf",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp3",
    ".mp4",
    ".zip",
    ".tar",
    ".gz",
    ".map",
}


def is_important_file(file_path: Path) -> bool:
    """Determines whether a file should be included in the export."""
    name = file_path.name
    suffix = file_path.suffix.lower()

    if name in IGNORE_FILES:
        return False

    if suffix in IGNORED_EXTENSIONS:
        return False

    # Allow explicit dot-files like .env.example, .gitignore
    if name in EXPLICIT_INCLUDE_FILES:
        return True

    # Ignore other hidden files (e.g. .env, .DS_Store)
    if name.startswith("."):
        return False

    if suffix not in ALLOWED_EXTENSIONS:
        return False

    return True


def collect_files(target_dir: Path, base_dir: Path) -> list[Path]:
    """Recursively collects important files under target_dir."""
    if not target_dir.exists():
        return []

    collected: list[Path] = []
    for root, dirs, files in os.walk(target_dir):
        # Prune excluded directories in-place so os.walk does not traverse them
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]

        for file in sorted(files):
            file_path = Path(root) / file
            if is_important_file(file_path):
                collected.append(file_path)

    return collected


def write_export_bundle(output_file: Path, files: list[Path], title: str, base_dir: Path) -> tuple[int, int]:
    """
    Writes a list of files into a formatted text bundle.
    Returns (file_count, line_count).
    """
    # Deterministic alphabetical ordering by relative POSIX path
    sorted_files = sorted(files, key=lambda p: str(p.relative_to(base_dir)).replace("\\", "/"))

    total_lines = 0
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(output_file, "w", encoding="utf-8") as out:
        out.write(f"# ==============================================================================\n")
        out.write(f"# NeverQ Code Export: {title}\n")
        out.write(f"# Generated: {now_str}\n")
        out.write(f"# Total Files: {len(sorted_files)}\n")
        out.write(f"# ==============================================================================\n\n")

        for file_path in sorted_files:
            rel_path = file_path.relative_to(base_dir).as_posix()
            try:
                content = file_path.read_text(encoding="utf-8", errors="replace")
                lines = content.splitlines()
                total_lines += len(lines)

                separator = "=" * 80
                out.write(f"{separator}\n")
                out.write(f"FILE: {rel_path} ({len(lines)} lines)\n")
                out.write(f"{separator}\n\n")
                out.write(content)
                if not content.endswith("\n"):
                    out.write("\n")
                out.write("\n")
            except Exception as e:
                print(f"[Warning] Error reading {rel_path}: {e}", file=sys.stderr)

    return len(sorted_files), total_lines


def print_stats(filename: str, count: int, lines: int, output_file: Path):
    size_kb = output_file.stat().st_size / 1024 if output_file.exists() else 0
    print(f"[Done] {filename:<14} : {count:>3} files | {lines:>6} lines | {size_kb:>7.1f} KB")


def main():
    parser = argparse.ArgumentParser(
        description="NeverQ Code Exporter - bundles essential project files without bloat."
    )
    parser.add_argument(
        "target",
        nargs="?",
        default="all",
        choices=["all", "frontend", "backend", "codebase"],
        help="Export target bundle (default: all)",
    )
    args = parser.parse_args()

    start_time = time.perf_counter()
    root_dir = Path(__file__).resolve().parent

    frontend_dir = root_dir / "frontend"
    backend_dir = root_dir / "backend"

    # Root files of interest
    root_files: list[Path] = []
    for candidate in [
        root_dir / "package.json",
        root_dir / "start.bat",
        root_dir / "README.md",
        root_dir / "BackendIntegrationRef.md",
        root_dir / "render.yaml",
        root_dir / ".gitignore",
    ]:
        if candidate.exists() and is_important_file(candidate):
            root_files.append(candidate)

    # Collect individual sets
    frontend_files = collect_files(frontend_dir, root_dir)
    backend_files = collect_files(backend_dir, root_dir)

    # Include BackendIntegrationRef.md in backend export as well for full backend contract reference
    backend_bundle_files = list(backend_files)
    backend_ref = root_dir / "BackendIntegrationRef.md"
    if backend_ref.exists() and backend_ref not in backend_bundle_files:
        backend_bundle_files.append(backend_ref)

    # Combined codebase set (unique files)
    all_files_map: dict[str, Path] = {}
    for f in root_files + backend_bundle_files + frontend_files:
        all_files_map[str(f.resolve())] = f
    codebase_files = list(all_files_map.values())

    print("[NeverQ Exporter] Scanning and bundling essential project files...")

    # Execute exports based on target
    if args.target in ("frontend", "all"):
        f_out = root_dir / "frontend.txt"
        f_count, f_lines = write_export_bundle(f_out, frontend_files, "Frontend", root_dir)
        print_stats("frontend.txt", f_count, f_lines, f_out)

    if args.target in ("backend", "all"):
        b_out = root_dir / "backend.txt"
        b_count, b_lines = write_export_bundle(b_out, backend_bundle_files, "Backend", root_dir)
        print_stats("backend.txt", b_count, b_lines, b_out)

    if args.target in ("codebase", "all"):
        c_out = root_dir / "codebase.txt"
        c_count, c_lines = write_export_bundle(c_out, codebase_files, "Full Codebase", root_dir)
        print_stats("codebase.txt", c_count, c_lines, c_out)

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    print(f"[Speed] Completed in {elapsed_ms:.1f} ms\n")


if __name__ == "__main__":
    main()
