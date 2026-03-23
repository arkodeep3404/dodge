import os
from pydantic_settings import BaseSettings
from pathlib import Path


def _find_project_root() -> Path:
    """Walk up from config.py to find the project root (contains dataset/)."""
    current = Path(__file__).resolve().parent
    for _ in range(10):
        if (current / "dataset").exists():
            return current
        if (current / ".env").exists():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    # Docker fallback: dataset mounted at /app/dataset
    if Path("/app/dataset").exists():
        return Path("/app")
    return Path(__file__).resolve().parent


_root = _find_project_root()

# Collect possible .env file paths
_env_files = []
for candidate in [_root / ".env", Path(__file__).resolve().parents[2] / ".env"]:
    if candidate.exists():
        _env_files.append(str(candidate))


class Settings(BaseSettings):
    openai_api_key: str
    mongodb_uri: str
    database_name: str = "jobdb"
    dataset_path: str = os.environ.get("DATASET_PATH", str(_root / "dataset"))

    model_config = {"env_file": _env_files[0] if _env_files else None}


settings = Settings()
