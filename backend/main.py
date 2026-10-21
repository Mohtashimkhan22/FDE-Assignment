
import os
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import Client, create_client
from ai_service import summarize_call

load_dotenv()

app = FastAPI(
    title="Cold Call Companion API",
    version="1.0.0",
    description="API for guided cold calls and call history.",
)

frontend_origin = os.getenv(
    "FRONTEND_ORIGIN", "http://localhost:5173"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

supabase: Client | None = None

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)


Outcome = Literal[
    "next_step_agreed",
    "agreed_to_receive_report",
    "interested",
    "follow_up",
    "call_again",
    "not_interested",
    "do_not_call",
    "wrong_person",
    "moved_company",
    "not_logged",
]


class StartCallRequest(BaseModel):
    prospect_name: str | None = Field(default=None, max_length=200)
    company_name: str | None = Field(default=None, max_length=200)
    prospect_role: str | None = Field(default=None, max_length=200)


class StageResultRequest(BaseModel):
    happened: list[str] = Field(default_factory=list, max_length=12)
    prospect_words: str = Field(default="", max_length=5000)


class CloseCallRequest(BaseModel):
    outcome: Outcome
    next_step: str | None = Field(default=None, max_length=1000)
    next_step_at: datetime | None = None
    summary: str | None = Field(default=None, max_length=3000)


def get_db() -> Client:
    if supabase is None:
        raise HTTPException(
            status_code=503,
            detail="Database is not configured. Check backend environment variables.",
        )
    return supabase


def ensure_call_exists(call_id: UUID) -> dict:
    db = get_db()
    result = (
        db.table("calls")
        .select("*")
        .eq("id", str(call_id))
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Call not found")

    return result.data[0]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "cold-call-companion-api",
    }


@app.post("/calls", status_code=201)
def start_call(payload: StartCallRequest):
    db = get_db()

    result = (
        db.table("calls")
        .insert(
            {
                "prospect_name": payload.prospect_name,
                "company_name": payload.company_name,
                "prospect_role": payload.prospect_role,
                "status": "in_progress",
                "current_stage": 1,
            }
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=500,
            detail="Could not create the call",
        )

    return result.data[0]


@app.put("/calls/{call_id}/stages/{stage_number}")
def save_stage(
    call_id: UUID,
    stage_number: int,
    payload: StageResultRequest,
):
    if not 1 <= stage_number <= 8:
        raise HTTPException(
            status_code=422,
            detail="Stage number must be between 1 and 8",
        )

    call = ensure_call_exists(call_id)

    if call["status"] != "in_progress":
        raise HTTPException(
            status_code=409,
            detail="This call has already been closed",
        )

    db = get_db()
    now = datetime.now(timezone.utc).isoformat()

    result = (
        db.table("stage_results")
        .upsert(
            {
                "call_id": str(call_id),
                "stage_number": stage_number,
                "happened": payload.happened,
                "prospect_words": payload.prospect_words,
                "updated_at": now,
            },
            on_conflict="call_id,stage_number",
        )
        .execute()
    )

    db.table("calls").update(
        {"current_stage": stage_number}
    ).eq("id", str(call_id)).execute()

    return {
        "saved": True,
        "call_id": str(call_id),
        "stage_number": stage_number,
        "stage_result": result.data[0] if result.data else None,
    }


@app.post("/calls/{call_id}/close")
def close_call(call_id: UUID, payload: CloseCallRequest):
    call = ensure_call_exists(call_id)

    if call["status"] == "completed":
        raise HTTPException(
            status_code=409,
            detail="This call is already closed",
        )

    db = get_db()

    result = (
        db.table("calls")
        .update(
            {
                "status": "completed",
                "outcome": payload.outcome,
                "next_step": payload.next_step,
                "next_step_at": (
                    payload.next_step_at.isoformat()
                    if payload.next_step_at
                    else None
                ),
                "summary": payload.summary,
                "closed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", str(call_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=500,
            detail="Could not close the call",
        )

    return result.data[0]


@app.get("/calls")
def list_calls(limit: int = 50, offset: int = 0):
    if not 1 <= limit <= 100:
        raise HTTPException(
            status_code=422,
            detail="Limit must be between 1 and 100",
        )

    if offset < 0:
        raise HTTPException(
            status_code=422,
            detail="Offset cannot be negative",
        )

    db = get_db()

    result = (
        db.table("calls")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {
        "items": result.data,
        "limit": limit,
        "offset": offset,
    }



@app.post("/calls/{call_id}/ai-summary")
def generate_call_summary(call_id: UUID):
    db = get_db()
    call = ensure_call_exists(call_id)

    if call["status"] != "completed":
        raise HTTPException(
            status_code=409,
            detail="Close the call before generating its summary.",
        )

    stages_response = (
        db.table("stage_results")
        .select("*")
        .eq("call_id", str(call_id))
        .order("stage_number")
        .execute()
    )

    try:
        summary = summarize_call(
            call,
            stages_response.data or [],
        )
    except Exception:
        # Do not expose API keys or provider error details.
        raise HTTPException(
            status_code=502,
            detail="Gemini summary is temporarily unavailable.",
        )

    updated = (
        db.table("calls")
        .update({"summary": summary})
        .eq("id", str(call_id))
        .execute()
    )

    if not updated.data:
        raise HTTPException(
            status_code=500,
            detail="Summary generated but could not be saved.",
        )

    return {
        "call_id": str(call_id),
        "summary": summary,
    }
