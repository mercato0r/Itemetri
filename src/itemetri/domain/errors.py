class AnatesError(Exception):
    """Base exception for all domain, engine, I/O, and CLI errors."""


class DomainValidationError(AnatesError):
    """Raised when exam invariants or analysis option constraints fail."""


class ParseError(AnatesError):
    """Raised when an input file violates XML or tabular structure."""

    def __init__(
        self,
        message: str,
        *,
        source: str | None = None,
        line: int | None = None,
        tag: str | None = None,
    ) -> None:
        self.raw_message = message
        self.source = source
        self.line = line
        self.tag = tag
        parts: list[str] = []
        if source is not None:
            parts.append(source)
        if line is not None:
            parts.append(f"line {line}")
        if tag is not None:
            parts.append(f"tag <{tag}>")
        prefix = f"[{' | '.join(parts)}] " if parts else ""
        super().__init__(f"{prefix}{message}")


class UnsupportedSchemaError(ParseError):
    """Raised when an XML archive uses an unrecognized root or schema version."""


class IoError(AnatesError):
    """Raised on filesystem or workbook serialization failures."""


class AnalysisError(AnatesError):
    """Raised when an analysis operation cannot proceed."""
