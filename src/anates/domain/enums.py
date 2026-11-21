from enum import StrEnum


class CompatibilityMode(StrEnum):
    LEGACY_ANATES = "legacy_anates"
    STANDARD_CORRECTED = "standard_corrected"


class ExamKind(StrEnum):
    MULTIPLE_CHOICE = "multiple_choice"
    ESSAY = "essay"


class DifficultyCategory(StrEnum):
    VERY_HARD = "Sangat Sukar"
    HARD = "Sukar"
    MEDIUM = "Sedang"
    EASY = "Mudah"
    VERY_EASY = "Sangat Mudah"


class SignificanceLevel(StrEnum):
    NAN = "NAN"
    NOT_SIGNIFICANT = "-"
    SIGNIFICANT = "Signifikan"
    HIGHLY_SIGNIFICANT = "Sangat Signifikan"


class DistractorQuality(StrEnum):
    KEY = "**"
    NONE = ""
    VERY_GOOD = "++"
    GOOD = "+"
    FAIR = "-"
    POOR = "--"
    VERY_POOR = "---"
    UNKNOWN = "?"


class EssayDifficultyScope(StrEnum):
    ALL_SUBJECTS = "all_subjects"
    UPPER_LOWER_2N = "upper_lower_2n"


class MergeAxis(StrEnum):
    APPEND_SUBJECTS = "subjects"
    APPEND_ITEMS = "items"


class ItemVerdictStatus(StrEnum):
    ACCEPT = "Terima"
    REVISE = "Revisi"
    REJECT = "Tolak"
