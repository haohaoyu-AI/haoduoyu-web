#!/usr/bin/env python3
"""Check pending SQL statements; SQLite's parser keeps trigger bodies together."""
import pathlib
import re
import sqlite3
import sys


def violations(source):
    pending = ""
    start = 1
    line = 1
    found = []
    for char in source:
        pending += char
        if char == ";" and sqlite3.complete_statement(pending):
            head = re.sub(r"\A(?:\s+|--[^\n]*(?:\n|$)|/\*.*?\*/)*", "", pending, flags=re.S)
            if head and (not re.match(r"(?:CREATE|ALTER|DROP)\b", head, re.I)
                         or re.match(r"CREATE\s+TABLE\b[\s\S]*\bAS\s+SELECT\b", head, re.I)):
                found.append({"line": start + pending[:len(pending)-len(head)].count("\n"), "verb": head.split()[0]})
            pending = ""
            start = line
        if char == "\n":
            line += 1
    tail = re.sub(r"(?:--[^\n]*|/\*.*?\*/|\s)", "", pending, flags=re.S)
    if tail:
        found.append({"line": start, "verb": "incomplete_statement"})
    return found


if __name__ == "__main__":
    paths = [pathlib.Path(p) for p in sys.argv[1:]] or sorted(pathlib.Path("drizzle").glob("005[0-3]*.sql"))
    bad = [(str(p), violations(p.read_text())) for p in paths]
    bad = [(p, v) for p, v in bad if v]
    for path, problems in bad:
        print(path, problems)
    if bad:
        sys.exit(1)
    print(f"PASS {len(paths)} pending migrations contain schema statements only; runtime trigger bodies are DDL, not backfill.")
