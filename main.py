"""Convenience entry point for the GuardianAI API server."""

import uvicorn

from backend.config import BACKEND_HOST, BACKEND_PORT


def main() -> None:
    uvicorn.run(
        "backend.main:app",
        host=BACKEND_HOST,
        port=BACKEND_PORT,
    )


if __name__ == "__main__":
    main()
