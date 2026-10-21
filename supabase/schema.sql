
-- Cold Call Companion
-- Supabase PostgreSQL schema

create extension if not exists pgcrypto;

create table if not exists public.calls (
    id uuid primary key default gen_random_uuid(),

    prospect_name text,
    company_name text,
    prospect_role text,

    status text not null default 'in_progress'
        check (status in ('in_progress', 'completed')),

    current_stage integer not null default 1
        check (current_stage between 1 and 8),

    outcome text check (
        outcome in (
            'next_step_agreed',
            'agreed_to_receive_report',
            'interested',
            'follow_up',
            'call_again',
            'not_interested',
            'do_not_call',
            'wrong_person',
            'moved_company',
            'not_logged'
        )
    ),

    next_step text,
    next_step_at timestamptz,
    summary text,

    started_at timestamptz not null default now(),
    closed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.stage_results (
    id uuid primary key default gen_random_uuid(),

    call_id uuid not null
        references public.calls(id) on delete cascade,

    stage_number integer not null
        check (stage_number between 1 and 8),

    -- One or more quick-tap observations
    happened text[] not null default '{}',

    -- Exact words spoken by the prospect
    prospect_words text not null default '',

    updated_at timestamptz not null default now(),

    unique (call_id, stage_number)
);

create index if not exists calls_created_at_idx
    on public.calls (created_at desc);

create index if not exists calls_status_idx
    on public.calls (status);

create index if not exists stage_results_call_id_idx
    on public.stage_results (call_id);

-- The browser must not access these tables directly.
-- The FastAPI backend will use the Supabase service-role key.
alter table public.calls enable row level security;
alter table public.stage_results enable row level security;

-- No public policies are created intentionally.
