"""Skema keluaran AI (structured output). Batasan panjang & isi ditegakkan di validators.py,
bukan di skema, agar skema tetap kompatibel dengan mode strict OpenAI."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StyleAnalysis(_Strict):
    technique: Literal["garis_bidang_datar", "bervolume", "campuran"]
    use_shading: bool
    reason: str


class StageText(_Strict):
    stage_code: str
    title: str
    action: str
    tools: list[str]
    done_when: str
    common_mistakes: list[str]


class RegionLabel(_Strict):
    region_code: str
    label: str


class CultureClaim(_Strict):
    text: str
    type: Literal["fakta", "perkiraan"]
    source_codes: list[str]
    stage_code: str | None


class Reflection(_Strict):
    question: str
    options: list[str]
    correct_index: int
    answer_source_code: str


class LessonText(_Strict):
    style: StyleAnalysis
    skill_goal: str
    culture_goal: str
    stages: list[StageText]
    region_labels: list[RegionLabel]
    culture_claims: list[CultureClaim]
    reflection: Reflection | None
