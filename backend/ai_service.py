
import json
import os

from dotenv import load_dotenv
from google import genai

load_dotenv()


def _clean(value):
    """Normalize missing or whitespace-only values."""
    if value is None:
        return None

    if isinstance(value, str):
        value = value.strip()
        return value or None

    return value


def _normalize_observations(value):
    """Handle observations stored as a list or a string."""
    if value is None:
        return []

    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]

    if isinstance(value, str):
        value = value.strip()
        return [value] if value else []

    return [str(value)]


def summarize_call(call: dict, stages: list[dict]) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

    if not api_key:
        raise RuntimeError("Gemini API key is not configured")

    if not isinstance(call, dict):
        raise ValueError("Call data must be a dictionary")

    if not isinstance(stages, list):
        raise ValueError("Stage results must be a list")

    evidence = {
        "prospect": _clean(call.get("prospect_name")),
        "company": _clean(call.get("company_name")),
        "role": _clean(call.get("prospect_role")),
        "outcome": _clean(call.get("outcome")),
        "next_step": _clean(call.get("next_step")),
        "stages": [],
    }

    for item in stages:
        if not isinstance(item, dict):
            continue

        evidence["stages"].append({
            "stage_number": (
                item.get("stage_number")
                or item.get("stage")
            ),
            "observations": _normalize_observations(
                item.get("happened")
                or item.get("observations")
                or item.get("selected_outcomes")
            ),
            "prospect_words": _clean(
                item.get("prospect_words")
                or item.get("exact_words")
                or item.get("notes")
            ),
        })

    has_stage_evidence = any(
        stage["observations"] or stage["prospect_words"]
        for stage in evidence["stages"]
    )

    if not has_stage_evidence:
        print(
            "WARNING: Gemini received no recorded stage observations "
            "or prospect words."
        )

    prompt = f"""
You are the call-summary assistant for Cold Call Companion.

Create a concise, evidence-based summary of the supplied call record.

Return exactly these four sections:

1. CALL SUMMARY:
Summarize the recorded interaction in at most two sentences.

2. PROSPECT'S NEED OR CONCERN:
State the need or concern only if recorded evidence supports it.
Otherwise write "No need or concern recorded."

3. AGREED NEXT STEP:
Report the explicitly recorded next step.
If there is none, write "None recorded."

4. FOLLOW-UP NOTE:
Give one practical action grounded in the record.
If no action is recorded, say that more information is needed.
Never invent contact details, missing logs, commitments, or dates.

Rules:
- Use only the supplied evidence.
- Do not treat a suggested action as an agreed commitment.
- Do not interpret an empty field as proof that something happened.
- If the outcome is "do_not_call", explicitly state that no further
  contact should be made and do not recommend follow-up.
- Keep the entire response under 150 words.
- Do not mention internal implementation details.

RECORDED CALL DATA:
{json.dumps(evidence, ensure_ascii=False, indent=2)}
"""

    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model=model,
        contents=prompt,
    )

    summary = _clean(response.text)

    if not summary:
        raise RuntimeError("Gemini returned an empty response")

    return summary
