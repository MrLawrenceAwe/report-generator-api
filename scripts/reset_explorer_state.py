#!/usr/bin/env python3
"""Reset Explorer storage, reports, saved topics, and SQLite state so manual testing feels like a fresh install."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import sqlite3


def _remove_directory(path: Path, verbose: bool) -> None:
    if path.exists():
        shutil.rmtree(path)
        if verbose:
            print(f"Removed directory {path}")
    else:
        if verbose:
            print(f"Directory {path} does not exist (skipped)")


def _clear_reports_table(db_path: Path, verbose: bool) -> None:
    if not db_path.exists():
        if verbose:
            print(f"Database {db_path} not found; skipping DB cleanup")
        return
    conn = sqlite3.connect(db_path)
    try:
        with conn:
            conn.execute("DELETE FROM reports")
        conn.execute("VACUUM")
        if verbose:
            print(f"Cleared reports table in {db_path}")
    finally:
        conn.close()


def _remove_database_files(db_path: Path, verbose: bool) -> None:
    removed_any = False
    base = str(db_path)
    candidates = [db_path, Path(f"{base}-wal"), Path(f"{base}-shm")]
    for candidate in candidates:
        if candidate.exists():
            candidate.unlink()
            removed_any = True
            if verbose:
                print(f"Removed {candidate}")
    if not removed_any and verbose:
        print(f"No SQLite files found at {db_path} (skipped)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset Explorer artifacts and database state for testing")
    parser.add_argument(
        "--data-dir",
        default="data/reports",
        help="Path to the report artifacts directory (default: %(default)s)",
    )
    parser.add_argument(
        "--db-path",
        default="reportgen.db",
        help="Path to the SQLite database (default: %(default)s)",
    )
    parser.add_argument(
        "--keep-db",
        action="store_true",
        help="Preserve the SQLite file (clears only the reports table, as before).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print cleanup progress messages.",
    )
    args = parser.parse_args()

    data_path = Path(args.data_dir)
    _remove_directory(data_path, args.verbose)
    data_path.mkdir(parents=True, exist_ok=True)
    if args.verbose:
        print(f"Recreated clean directory {data_path}")

    db_path = Path(args.db_path)
    if args.keep_db:
        _clear_reports_table(db_path, args.verbose)
    else:
        _remove_database_files(db_path, args.verbose)


if __name__ == "__main__":
    main()
