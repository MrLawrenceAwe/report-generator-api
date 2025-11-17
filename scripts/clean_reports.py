#!/usr/bin/env python3
"""Utility helpers for cleaning report artifacts and database rows."""
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

def _vacuum_db(db_path: Path, verbose: bool) -> None:
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Cleanup helper for report artifacts")
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
        help="If set, do not modify the reports table in the DB.",
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

    if not args.keep_db:
        _vacuum_db(Path(args.db_path), args.verbose)


if __name__ == "__main__":
    main()
