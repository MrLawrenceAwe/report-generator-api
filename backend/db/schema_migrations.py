from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set

from sqlalchemy import MetaData, Table, inspect, text
from sqlalchemy.engine import Connection, Engine

from .models import Report, SavedTopic, User

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows fallback
    fcntl = None

_SUPPORTED_DIALECTS = {"sqlite"}


def ensure_lightweight_schema(engine: Engine) -> None:
    """Ensure legacy SQLite schemas shed unused columns and gain new ones."""

    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    managed_tables: Dict[str, Table] = {
        "users": User.__table__,
        "saved_topics": SavedTopic.__table__,
        "reports": Report.__table__,
    }
    ordered_table_names = _topologically_sorted_tables(managed_tables.values())
    username_default = '"full_name"'

    with _sqlite_migration_lock(engine):
        with engine.begin() as conn:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            try:
                for table_name in ordered_table_names:
                    table = managed_tables[table_name]
                    if table_name not in existing_tables:
                        continue
                    legacy_columns = [column["name"] for column in inspector.get_columns(table_name)]
                    desired_columns = [column.name for column in table.columns]
                    if legacy_columns == desired_columns:
                        continue
                    overrides: Dict[str, str] = {}
                    if table_name == "users" and "username" not in legacy_columns:
                        overrides["username"] = username_default
                    if table_name == "users":
                        overrides.setdefault("profile", 'COALESCE("profile", json(\'{}\'))')
                        overrides.setdefault("usage_counters", 'COALESCE("usage_counters", json(\'{}\'))')
                    if table_name == "reports":
                        overrides.setdefault("sections", 'COALESCE("sections", json(\'{}\'))')
                    _rebuild_table(conn, table, legacy_columns, desired_columns, overrides)
            finally:
                conn.execute(text("PRAGMA foreign_keys=ON"))


def _rebuild_table(
    conn: Connection,
    table: Table,
    legacy_columns: Sequence[str],
    desired_columns: Sequence[str],
    select_overrides: Dict[str, str],
) -> None:
    temp_name = f"{table.name}__legacy"
    conn.execute(text(f'ALTER TABLE "{table.name}" RENAME TO "{temp_name}"'))

    metadata = MetaData()
    new_table = table.tometadata(metadata)
    for fk in table.foreign_key_constraints:
        referenced = fk.elements[0].column.table
        if referenced.name not in metadata.tables:
            referenced.tometadata(metadata)
    new_table.create(bind=conn)

    legacy_set = set(legacy_columns)
    select_clause = ", ".join(
        _column_copy_expression(column, legacy_set, select_overrides) for column in desired_columns
    )
    columns_clause = ", ".join(f'"{column}"' for column in desired_columns)

    conn.execute(
        text(
            f'INSERT INTO "{table.name}" ({columns_clause}) '
            f'SELECT {select_clause} FROM "{temp_name}"'
        )
    )
    conn.execute(text(f'DROP TABLE "{temp_name}"'))


def _column_copy_expression(
    column: str,
    legacy_columns: Iterable[str],
    select_overrides: Dict[str, str],
) -> str:
    if column in select_overrides:
        return f'{select_overrides[column]} AS "{column}"'
    if column in legacy_columns:
        return f'"{column}"'
    return f'NULL AS "{column}"'


def _topologically_sorted_tables(tables: Iterable[Table]) -> List[str]:
    table_map = {table.name: table for table in tables}
    resolved: List[str] = []
    visiting: Set[str] = set()
    visited: Set[str] = set()

    def visit(table: Table) -> None:
        name = table.name
        if name in visited:
            return
        if name in visiting:
            raise RuntimeError(f"Cyclic dependency detected while ordering tables: {name}")
        visiting.add(name)
        for fk in table.foreign_key_constraints:
            referenced = fk.elements[0].column.table
            if referenced.name in table_map:
                visit(table_map[referenced.name])
        visiting.remove(name)
        visited.add(name)
        resolved.append(name)

    for table in tables:
        visit(table)
    return resolved


@contextmanager
def _sqlite_migration_lock(engine: Engine):
    if engine.dialect.name != "sqlite":
        yield
        return
    db_path = _sqlite_db_path(engine)
    if db_path is None:
        yield
        return
    lock_path = db_path.with_name(f"{db_path.name}.migration-lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "w", encoding="utf-8") as lock_file:
        if fcntl is not None:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def _sqlite_db_path(engine: Engine) -> Optional[Path]:
    database = engine.url.database
    if not database or database == ":memory:":
        return None
    return Path(database).expanduser().resolve()
