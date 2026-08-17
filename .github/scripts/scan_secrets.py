"""Fail CI when a Git-tracked text file contains a likely credential.

The scanner reports only the rule and location. It never prints the matched value.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SELF = Path(__file__).resolve()
PLACEHOLDERS = re.compile(
    r"(?i)(example|placeholder|change[-_]?me|replace[-_]?me|your[-_]|dummy|sample|localhost)"
)
RULES = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "MongoDB URI with embedded credentials": re.compile(
        r"mongodb(?:\+srv)?://[^\s/:]+:[^\s@]+@", re.IGNORECASE
    ),
    "Google API key": re.compile(r"AIza[0-9A-Za-z_-]{35}"),
    "GitHub token": re.compile(r"(?:ghp|github_pat)_[A-Za-z0-9_]{20,}"),
    "AWS access key": re.compile(r"(?:AKIA|ASIA)[A-Z0-9]{16}"),
    "generic assigned secret": re.compile(
        r"(?i)(?:api[_-]?key|api[_-]?secret|access[_-]?token|client[_-]?secret|password)"
        r"\s*[:=]\s*['\"]([^'\"]{16,})['\"]"
    ),
}


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [ROOT / item.decode() for item in result.stdout.split(b"\0") if item]


def main() -> int:
    findings: list[tuple[str, int, str]] = []
    for path in tracked_files():
        if path.resolve() == SELF or not path.is_file() or path.stat().st_size > 2_000_000:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for line_number, line in enumerate(content.splitlines(), start=1):
            for rule_name, pattern in RULES.items():
                match = pattern.search(line)
                if match and not PLACEHOLDERS.search(match.group(0)):
                    findings.append((path.relative_to(ROOT).as_posix(), line_number, rule_name))

    if findings:
        print("Secret scan failed. Potential credentials found:")
        for file_name, line_number, rule_name in findings:
            print(f"- {file_name}:{line_number} ({rule_name})")
        return 1

    print(f"Secret scan passed: {len(tracked_files())} tracked files checked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
