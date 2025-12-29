import logging
import sys
from typing import Any

from backend.core.config import settings

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/health") == -1

def setup_logging() -> None:
    # Basic Config
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    
    # Filter health checks from access logs
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

logger = logging.getLogger("emprendigo")
