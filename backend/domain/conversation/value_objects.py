from enum import Enum

class MessageDirection(str, Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"

class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    TEMPLATE = "template"
    INTERACTIVE = "interactive"
