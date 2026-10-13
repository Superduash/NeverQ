#!/usr/bin/env python3
"""
NeverQ Fast Code Exporter
Exports essential source code from frontend/ and backend/ into frontend.txt and backend.txt.
Excludes build artifacts, locks, images, and third-party dependencies.
"""

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

# Directories to skip
EXCLUDE_DIRS = {
    "node_modules",
    "dist",
    "build",
    ".git",
    ".vscode",
    ".idea",
    "coverage",
    "__pycache__",
    ".system_generated",
}

# File extensions considered important code
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
}

# Files to always ignore even if matching extension
IGNORE_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "frontend.txt",
    "backend.txt",
}


def should_include_file(file_path: Path) -> bool:
    if file_path.name in IGNORE_FILES:
        return False
    if file_path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return False
    # Avoid hidden files
    if file_path.name.startswith("."):
        return False
    return True


def export_directory(target_dir: Path, output_file: Path, base_dir: Path) -> tuple[int, int]:
    """
    Scans target_dir and exports included code files into output_file.
    Returns (file_count, line_count).
    """
    if not target_dir.exists():
        print(f"Warning: Directory '{target_dir}' does not exist.")
        return 0, 0

    collected_files: list[Path] = []

    for root, dirs, files in os.walk(target_dir):
        # Filter directories in-place to avoid walking into excluded folders
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]

        for file in sorted(files):
            full_path = Path(root) / file
            if should_include_file(full_path):
                collected_files.append(full_path)

    # Sort files deterministically
    collected_files.sort(key=lambda p: str(p.relative_to(base_dir)).replace("\\", "/"))

    total_lines = 0
    with open(output_file, "w", encoding="utf-8") as out:
        out.write(f"# NeverQ Export: {target_dir.name}\n")
        out.write(f"# Total Files: {len(collected_files)}\n\n")

        for file_path in collected_files:
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
                print(f"Error reading {rel_path}: {e}", file=sys.stderr)

    return len(collected_files), total_lines


def main():
    start_time = time.perf_counter()
    root_dir = Path(__file__).resolve().parent

    frontend_dir = root_dir / "frontend"
    backend_dir = root_dir / "backend"

    frontend_out = root_dir / "frontend.txt"
    backend_out = root_dir / "backend.txt"

    print("[NeverQ Exporter] Scanning and bundling code files...")

    f_count, f_lines = export_directory(frontend_dir, frontend_out, root_dir)
    b_count, b_lines = export_directory(backend_dir, backend_out, root_dir)

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    f_size_kb = frontend_out.stat().st_size / 1024 if frontend_out.exists() else 0
    b_size_kb = backend_out.stat().st_size / 1024 if backend_out.exists() else 0

    print(f"[Done] frontend.txt : {f_count} files | {f_lines} lines | {f_size_kb:.1f} KB")
    print(f"[Done] backend.txt  : {b_count} files | {b_lines} lines | {b_size_kb:.1f} KB")
    print(f"[Speed] Completed in {elapsed_ms:.1f} ms")


if __name__ == "__main__":
    main()
