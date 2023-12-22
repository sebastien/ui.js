from pathlib import Path

BASE = Path(__file__).parent
scope: str | None = None
events: dict[str, str] = {}

for line in (BASE / "dom-events.md").read_text().splitlines():
    if (line := line.strip()).endswith(":"):
        scope = line
    else:
        events[line] = scope
print([_ for _ in events])
