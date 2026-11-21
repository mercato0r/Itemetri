from pathlib import Path

import pytest

ANATES_DIR = Path(__file__).resolve().parents[1]

ALL_SAMPLE_ANA_NAMES = (
    "biologi.ana",
    "ka ma2.ANA",
    "lat1.ANA",
    "latih3.ANA",
    "latihan2.ANA",
    "mts.ANA",
)


@pytest.fixture(scope="session")
def anates_dir() -> Path:
    return ANATES_DIR


@pytest.fixture(scope="session")
def reliabel_txt_bytes() -> bytes:
    return (ANATES_DIR / "reliabel.txt").read_bytes()
