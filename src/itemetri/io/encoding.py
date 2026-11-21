from charset_normalizer import from_bytes

from itemetri.domain.errors import ParseError


def decode_bytes(raw: bytes, *, source: str | None = None) -> tuple[str, str]:
    """Decode raw file bytes preserving legacy Windows-1252 and BOM-tagged encodings."""
    if raw.startswith(b"\xef\xbb\xbf"):
        try:
            return (raw.decode("utf-8-sig"), "utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ParseError(f"Invalid UTF-8 BOM sequence: {exc}", source=source) from exc

    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            return (raw.decode("utf-16"), "utf-16")
        except UnicodeDecodeError as exc:
            raise ParseError(f"Invalid UTF-16 sequence: {exc}", source=source) from exc

    try:
        return (raw.decode("utf-8"), "utf-8")
    except UnicodeDecodeError:
        pass

    match = from_bytes(raw).best()
    if match is not None:
        return (str(match), match.encoding)

    try:
        return (raw.decode("cp1252"), "cp1252")
    except UnicodeDecodeError as exc:
        raise ParseError(
            f"Unable to decode bytes as UTF-8 or Windows-1252: {exc}",
            source=source,
        ) from exc
