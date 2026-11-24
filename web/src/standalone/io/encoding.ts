export class StandaloneParseError extends Error {
  status = 422;
  code = "parse_error";
  line: number | null;
  tag: string | null;

  constructor(message: string, line: number | null = null, tag: string | null = null) {
    super(message);
    this.line = line;
    this.tag = tag;
  }
}

export function decodeBytes(raw: Uint8Array): { text: string; encoding: string } {
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(raw.subarray(3)),
      encoding: "utf-8-sig",
    };
  }
  if (raw.length >= 2 && ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff))) {
    const enc = raw[0] === 0xff ? "utf-16le" : "utf-16be";
    return {
      text: new TextDecoder(enc, { fatal: true }).decode(raw.subarray(2)),
      encoding: "utf-16",
    };
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(raw),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(raw),
      encoding: "cp1252",
    };
  }
}
