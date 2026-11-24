import type {
  AnalysisResponse,
  EssaySubjectScore,
  ExamPayload,
  MultipleChoiceSubjectScore,
} from "../../types";
import { decodeBytes, StandaloneParseError } from "./encoding";

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
  line: number;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseXmlTree(xmlText: string): XmlNode {
  if (/<!(?:DOCTYPE|ENTITY)\b/i.test(xmlText)) {
    throw new StandaloneParseError("XML DOCTYPE/ENTITY declarations are forbidden.");
  }

  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let pos = 0;
  const len = xmlText.length;

  const lineAt = (offset: number): number => {
    let lines = 1;
    for (let i = 0; i < offset; i++) {
      if (xmlText.charCodeAt(i) === 10) lines++;
    }
    return lines;
  };

  while (pos < len) {
    const lt = xmlText.indexOf("<", pos);
    if (lt < 0) {
      if (stack.length > 0 && pos < len) {
        stack[stack.length - 1]!.text += unescapeXml(xmlText.slice(pos));
      }
      break;
    }

    if (lt > pos && stack.length > 0) {
      stack[stack.length - 1]!.text += unescapeXml(xmlText.slice(pos, lt));
    }

    if (xmlText.startsWith("<!--", lt)) {
      const end = xmlText.indexOf("-->", lt + 4);
      if (end < 0) {
        throw new StandaloneParseError("Unterminated XML comment.", lineAt(lt));
      }
      pos = end + 3;
      continue;
    }

    if (xmlText.startsWith("<?", lt)) {
      const end = xmlText.indexOf("?>", lt + 2);
      if (end < 0) {
        throw new StandaloneParseError("Unterminated XML processing instruction.", lineAt(lt));
      }
      pos = end + 2;
      continue;
    }

    if (xmlText.startsWith("<![CDATA[", lt)) {
      const end = xmlText.indexOf("]]>", lt + 9);
      if (end < 0) {
        throw new StandaloneParseError("Unterminated XML CDATA section.", lineAt(lt));
      }
      if (stack.length > 0) {
        stack[stack.length - 1]!.text += xmlText.slice(lt + 9, end);
      }
      pos = end + 3;
      continue;
    }

    // Scan until closing '>' outside of single or double quotes.
    let quote: string | null = null;
    let gt = -1;
    for (let i = lt + 1; i < len; i++) {
      const ch = xmlText[i]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        gt = i;
        break;
      }
    }
    if (gt < 0) {
      throw new StandaloneParseError("Unterminated XML tag.", lineAt(lt));
    }

    const inside = xmlText.slice(lt + 1, gt).trim();
    pos = gt + 1;

    if (inside.startsWith("/")) {
      const tag = inside.slice(1).trim();
      const popped = stack.pop();
      if (!popped || popped.tag !== tag) {
        throw new StandaloneParseError(
          `Mismatched closing tag </${tag}>.`,
          lineAt(lt),
          tag,
        );
      }
      continue;
    }

    const selfClosing = inside.endsWith("/");
    const headerBody = selfClosing ? inside.slice(0, -1).trim() : inside;
    const tagMatch = /^([A-Za-z_][\w:.-]*)([\s\S]*)$/.exec(headerBody);
    if (!tagMatch) {
      throw new StandaloneParseError("Invalid XML tag syntax.", lineAt(lt));
    }
    const tag = tagMatch[1]!;
    const attrRaw = tagMatch[2] ?? "";

    const attrs: Record<string, string> = {};
    const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(attrRaw)) !== null) {
      attrs[am[1]!] = unescapeXml(am[2] ?? am[3] ?? "");
    }

    const node: XmlNode = {
      tag,
      attrs,
      text: "",
      children: [],
      line: lineAt(lt),
    };

    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(node);
    } else if (!root) {
      root = node;
    } else {
      throw new StandaloneParseError("Multiple XML root elements.", node.line, tag);
    }

    if (!selfClosing) {
      stack.push(node);
    }
  }

  if (stack.length > 0 || !root) {
    throw new StandaloneParseError("Malformed or incomplete XML document.");
  }
  return root;
}

function findChild(parent: XmlNode, tag: string): XmlNode | undefined {
  return parent.children.find((c) => c.tag === tag);
}

function findAllChildren(parent: XmlNode, tag: string): XmlNode[] {
  return parent.children.filter((c) => c.tag === tag);
}

function parseIntTag(parent: XmlNode, tag: string, fallback?: number): number {
  const el = findChild(parent, tag);
  if (!el) {
    if (fallback !== undefined) return fallback;
    throw new StandaloneParseError(`Missing required integer element <${tag}>.`, parent.line, tag);
  }
  const raw = el.text.trim();
  const n = Number(raw);
  if (!raw || !Number.isInteger(n)) {
    throw new StandaloneParseError(`Invalid integer value '${raw}' in <${tag}>.`, el.line, tag);
  }
  return n;
}

function parseFloatTag(parent: XmlNode, tag: string, fallback?: number): number {
  const el = findChild(parent, tag);
  if (!el) {
    if (fallback !== undefined) return fallback;
    throw new StandaloneParseError(`Missing required float element <${tag}>.`, parent.line, tag);
  }
  const raw = el.text.trim();
  const v = Number(raw);
  if (!raw || !Number.isFinite(v)) {
    throw new StandaloneParseError(`Invalid numeric value '${raw}' in <${tag}>.`, el.line, tag);
  }
  return v;
}

function splitCsvTokens(text: string): string[] {
  const tokens = text.split(",");
  if (tokens.length > 1 && tokens[tokens.length - 1]!.trim() === "") {
    tokens.pop();
  }
  return tokens;
}

function parseCsvFloats(
  text: string,
  allowBlank: boolean,
  el: XmlNode,
): Array<number | null> {
  return splitCsvTokens(text).map((tok, idx) => {
    const cleaned = tok.trim();
    if (allowBlank && (cleaned === "" || cleaned === "*" || cleaned === "#")) {
      return null;
    }
    const num = Number(cleaned);
    if (!cleaned || !Number.isFinite(num)) {
      throw new StandaloneParseError(
        `Invalid float token '${cleaned}' at item index ${idx + 1} in <${el.tag}>.`,
        el.line,
        el.tag,
      );
    }
    return num;
  });
}

export function parseAnaBytes(
  raw: Uint8Array,
  source: string,
): { exam: ExamPayload; file_version: string; detected_encoding: string } {
  const { text, encoding } = decodeBytes(raw);
  const root = parseXmlTree(text);
  if (root.tag !== "ANATES") {
    throw new StandaloneParseError(
      `Expected root tag <ANATES>, found <${root.tag}>.`,
      root.line,
      root.tag,
    );
  }
  const dm = findChild(root, "Data_Mentah");
  if (!dm) {
    throw new StandaloneParseError("Missing required section <Data_Mentah>.", root.line, "Data_Mentah");
  }
  const ds = findChild(root, "Data_Skor");

  const fileVersionAttr = (root.attrs["file_version"] ?? "").trim();
  const hasJumPilihan = Boolean(findChild(dm, "JumPilihan"));
  const hasNoButir = Boolean(findChild(dm, "NoButir"));
  const kunciRaw = (findChild(dm, "Kunci")?.text ?? "").trim();

  if (fileVersionAttr && fileVersionAttr !== "4.0.1" && fileVersionAttr !== "2.0.1") {
    throw new StandaloneParseError(
      `Unsupported ANATES file_version '${fileVersionAttr}'.`,
      root.line,
      root.tag,
    );
  }

  let kind: "multiple_choice" | "essay";
  if (fileVersionAttr === "4.0.1") {
    kind = "multiple_choice";
  } else if (fileVersionAttr === "2.0.1") {
    kind = "essay";
  } else if (hasJumPilihan) {
    kind = "multiple_choice";
  } else if (hasNoButir || kunciRaw.includes(",")) {
    kind = "essay";
  } else {
    throw new StandaloneParseError("Unable to infer ANATES schema kind.", root.line, root.tag);
  }

  const fileVersion = fileVersionAttr || (kind === "multiple_choice" ? "4.0.1" : "2.0.1");
  const jumButir = parseIntTag(dm, "JumButir");
  const jumSubyek = parseIntTag(dm, "JumSubyek", -1);
  const isNeedRecalc = parseIntTag(dm, "IsNeedRecalc", 1) !== 0;
  const isSorted = ds ? parseIntTag(ds, "IsUrutkanBerdSkor", 0) !== 0 : false;

  const jawabanEl = findChild(dm, "Jawaban");
  if (!jawabanEl) {
    throw new StandaloneParseError("Missing required element <Jawaban>.", dm.line, "Jawaban");
  }
  const subyekEls = findAllChildren(jawabanEl, "Subyek");
  if (jumSubyek >= 0 && subyekEls.length !== jumSubyek) {
    throw new StandaloneParseError(
      `<Jawaban> has ${subyekEls.length} <Subyek> entries, expected <JumSubyek>=${jumSubyek}.`,
      jawabanEl.line,
      "Jawaban",
    );
  }

  if (kind === "multiple_choice") {
    const jumPilihan = parseIntTag(dm, "JumPilihan");
    if (kunciRaw.length !== jumButir) {
      throw new StandaloneParseError(
        `<Kunci> length (${kunciRaw.length}) does not match <JumButir> (${jumButir}).`,
        dm.line,
        "Kunci",
      );
    }
    const mcSubjects = subyekEls.map((sub, idx) => {
      const nama = findChild(sub, "Nama")?.text ?? "";
      let jwb = findChild(sub, "Jwb")?.text ?? "";
      if (jwb === "") {
        jwb = "*".repeat(jumButir);
      } else if (jwb.length !== jumButir) {
        throw new StandaloneParseError(
          `Subject #${idx + 1} ('${nama}') <Jwb> length ${jwb.length} != <JumButir>=${jumButir}.`,
          sub.line,
          "Jwb",
        );
      }
      return { name: nama, responses: jwb, original_index: idx };
    });
    const weights = {
      correct: ds ? parseFloatTag(ds, "BobotBetul", 1.0) : 1.0,
      wrong: ds ? parseFloatTag(ds, "BobotSalah", 0.0) : 0.0,
    };
    return {
      exam: {
        kind: "multiple_choice",
        source_path: source,
        is_sorted_by_score: isSorted,
        is_need_recalc: isNeedRecalc,
        answer_key: kunciRaw,
        option_count: jumPilihan,
        weights,
        mc_subjects: mcSubjects,
      },
      file_version: fileVersion,
      detected_encoding: encoding,
    };
  }

  const kunciEl = findChild(dm, "Kunci");
  if (!kunciEl) {
    throw new StandaloneParseError("Missing required element <Kunci>.", dm.line, "Kunci");
  }
  const idealScores = parseCsvFloats(kunciRaw, false, kunciEl).filter(
    (v): v is number => v !== null,
  );
  if (idealScores.length !== jumButir) {
    throw new StandaloneParseError(
      `<Kunci> ideal score count (${idealScores.length}) does not match <JumButir> (${jumButir}).`,
      kunciEl.line,
      "Kunci",
    );
  }

  const noButirEl = findChild(dm, "NoButir");
  const itemNumbers = noButirEl
    ? findAllChildren(noButirEl, "NOBTR").map((el) => Number(el.text.trim()))
    : Array.from({ length: jumButir }, (_, i) => i + 1);

  const essaySubjects = subyekEls.map((sub, idx) => {
    const nama = findChild(sub, "Nama")?.text ?? "";
    const jwbEl = findChild(sub, "Jwb");
    const rawJwb = (jwbEl?.text ?? "").trim();
    const scores =
      rawJwb === ""
        ? new Array<number | null>(jumButir).fill(null)
        : parseCsvFloats(rawJwb, true, jwbEl ?? sub);
    if (scores.length !== jumButir) {
      throw new StandaloneParseError(
        `Subject #${idx + 1} ('${nama}') score count ${scores.length} != <JumButir>=${jumButir}.`,
        (jwbEl ?? sub).line,
        "Jwb",
      );
    }
    return { name: nama, scores, original_index: idx };
  });

  return {
    exam: {
      kind: "essay",
      source_path: source,
      is_sorted_by_score: isSorted,
      is_need_recalc: isNeedRecalc,
      ideal_scores: idealScores,
      item_numbers: itemNumbers,
      essay_subjects: essaySubjects,
    },
    file_version: fileVersion,
    detected_encoding: encoding,
  };
}

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "0";
  return Number.isInteger(v) ? String(v) : String(v);
}

export function serializeAna(exam: ExamPayload, analysis?: AnalysisResponse): Uint8Array {
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>'];

  if (exam.kind === "multiple_choice") {
    const subjects = exam.mc_subjects ?? [];
    const key = exam.answer_key ?? "";
    const weights = exam.weights ?? { correct: 1.0, wrong: 0.0 };
    const needRecalc = analysis ? false : exam.is_need_recalc;
    lines.push('<ANATES file_version="4.0.1">');
    lines.push("  <Data_Mentah>");
    lines.push(`    <Kunci>${escapeXml(key)}</Kunci>`);
    lines.push(`    <JumSubyek>${subjects.length}</JumSubyek>`);
    lines.push(`    <JumButir>${key.length}</JumButir>`);
    lines.push(`    <JumPilihan>${exam.option_count ?? 4}</JumPilihan>`);
    lines.push(`    <IsNeedRecalc>${needRecalc ? "-1" : "0"}</IsNeedRecalc>`);
    lines.push("    <Jawaban>");
    lines.push(`      <JumItem>${subjects.length}</JumItem>`);
    for (const s of subjects) {
      lines.push("      <Subyek>");
      lines.push(`        <Nama>${escapeXml(s.name)}</Nama>`);
      lines.push(`        <Jwb>${escapeXml(s.responses)}</Jwb>`);
      lines.push("      </Subyek>");
    }
    lines.push("    </Jawaban>");
    lines.push("  </Data_Mentah>");
    lines.push("  <Data_Skor>");
    if (analysis) {
      lines.push(`    <Rata2>${fmtNum(analysis.scoring.mean)}</Rata2>`);
      lines.push(`    <SD>${fmtNum(analysis.scoring.std_dev)}</SD>`);
      lines.push(`    <IsUrutkanBerdSkor>${exam.is_sorted_by_score ? "-1" : "0"}</IsUrutkanBerdSkor>`);
      lines.push(`    <JumButir>${key.length}</JumButir>`);
      lines.push(`    <BobotBetul>${fmtNum(weights.correct)}</BobotBetul>`);
      lines.push(`    <BobotSalah>${fmtNum(weights.wrong)}</BobotSalah>`);
      lines.push("    <Skor>");
      lines.push(`      <JumItem>${subjects.length}</JumItem>`);
      const order = exam.is_sorted_by_score
        ? analysis.scoring.sorted_order
        : analysis.scoring.subjects.map((_, i) => i);
      for (const pos of order) {
        const row = analysis.scoring.subjects[pos] as MultipleChoiceSubjectScore;
        lines.push("      <Subyek>");
        lines.push(`        <Nama>${escapeXml(row.name)}</Nama>`);
        lines.push(`        <SkorButir>${escapeXml(row.score_pattern)}</SkorButir>`);
        lines.push(`        <SkorAkhir>${fmtNum(row.raw_score)}</SkorAkhir>`);
        lines.push(`        <SkorDibobot>${fmtNum(row.weighted_score)}</SkorDibobot>`);
        lines.push(`        <UrutanAwal>${row.original_index}</UrutanAwal>`);
        lines.push(`        <JumBetul>${row.correct_count}</JumBetul>`);
        lines.push(`        <JumSalah>${row.wrong_count}</JumSalah>`);
        lines.push(`        <JumBlank>${row.blank_count}</JumBlank>`);
        lines.push("      </Subyek>");
      }
      lines.push("    </Skor>");
    } else {
      lines.push("    <Rata2>0</Rata2>");
      lines.push("    <SD>0</SD>");
      lines.push(`    <IsUrutkanBerdSkor>${exam.is_sorted_by_score ? "-1" : "0"}</IsUrutkanBerdSkor>`);
      lines.push("    <JumButir>0</JumButir>");
      lines.push(`    <BobotBetul>${fmtNum(weights.correct)}</BobotBetul>`);
      lines.push(`    <BobotSalah>${fmtNum(weights.wrong)}</BobotSalah>`);
      lines.push("    <Skor><JumItem>0</JumItem></Skor>");
    }
    lines.push("  </Data_Skor>");
    lines.push("</ANATES>");
    return new TextEncoder().encode(lines.join("\n"));
  }

  const subjects = exam.essay_subjects ?? [];
  const ideals = exam.ideal_scores ?? [];
  const itemNums =
    exam.item_numbers && exam.item_numbers.length === ideals.length
      ? exam.item_numbers
      : Array.from({ length: ideals.length }, (_, i) => i + 1);
  const needRecalc = analysis ? false : exam.is_need_recalc;

  lines.push('<ANATES file_version="2.0.1">');
  lines.push("  <Data_Mentah>");
  lines.push(`    <Kunci>${ideals.map((v) => fmtNum(v)).join(",")}</Kunci>`);
  lines.push(`    <JumSubyek>${subjects.length}</JumSubyek>`);
  lines.push(`    <JumButir>${ideals.length}</JumButir>`);
  lines.push(`    <IsNeedRecalc>${needRecalc ? "-1" : "0"}</IsNeedRecalc>`);
  lines.push("    <NoButir>");
  for (const num of itemNums) lines.push(`      <NOBTR>${num}</NOBTR>`);
  lines.push("    </NoButir>");
  lines.push("    <Jawaban>");
  lines.push(`      <JumItem>${subjects.length}</JumItem>`);
  for (const s of subjects) {
    lines.push("      <Subyek>");
    lines.push(`        <Nama>${escapeXml(s.name)}</Nama>`);
    lines.push(`        <Jwb>${s.scores.map((v) => (v === null ? "*" : fmtNum(v))).join(",")}</Jwb>`);
    lines.push("      </Subyek>");
  }
  lines.push("    </Jawaban>");
  lines.push("  </Data_Mentah>");
  lines.push("  <Data_Skor>");
  if (analysis) {
    lines.push(`    <Rata2>${fmtNum(analysis.scoring.mean)}</Rata2>`);
    lines.push(`    <SD>${fmtNum(analysis.scoring.std_dev)}</SD>`);
    lines.push(`    <IsUrutkanBerdSkor>${exam.is_sorted_by_score ? "-1" : "0"}</IsUrutkanBerdSkor>`);
    lines.push(`    <JumButir>${ideals.length}</JumButir>`);
    lines.push(`    <MaxSkor>${(analysis.scoring.observed_max ?? []).map((v) => fmtNum(v)).join(",")}</MaxSkor>`);
    lines.push(`    <MinSkor>${(analysis.scoring.observed_min ?? []).map((v) => fmtNum(v)).join(",")}</MinSkor>`);
    lines.push("    <NoButir>");
    for (const num of itemNums) lines.push(`      <NOBTR>${num}</NOBTR>`);
    lines.push("    </NoButir>");
    lines.push("    <Skor>");
    lines.push(`      <JumItem>${subjects.length}</JumItem>`);
    const order = exam.is_sorted_by_score
      ? analysis.scoring.sorted_order
      : analysis.scoring.subjects.map((_, i) => i);
    for (const pos of order) {
      const row = analysis.scoring.subjects[pos] as EssaySubjectScore;
      lines.push("      <Subyek>");
      lines.push(`        <Nama>${escapeXml(row.name)}</Nama>`);
      lines.push(`        <SkorButir>${row.scores.map((v) => (v === null ? "*" : fmtNum(v))).join(",")}</SkorButir>`);
      lines.push(`        <SkorTotal>${fmtNum(row.total_score)}</SkorTotal>`);
      lines.push(`        <UrutanAwal>${row.original_index}</UrutanAwal>`);
      lines.push(`        <JumBlank>${row.blank_count}</JumBlank>`);
      lines.push("      </Subyek>");
    }
    lines.push("    </Skor>");
  } else {
    lines.push("    <Rata2>0</Rata2>");
    lines.push("    <SD>0</SD>");
    lines.push(`    <IsUrutkanBerdSkor>${exam.is_sorted_by_score ? "-1" : "0"}</IsUrutkanBerdSkor>`);
    lines.push("    <JumButir>0</JumButir>");
    lines.push("    <Skor><JumItem>0</JumItem></Skor>");
  }
  lines.push("  </Data_Skor>");
  lines.push("</ANATES>");
  return new TextEncoder().encode(lines.join("\n"));
}
