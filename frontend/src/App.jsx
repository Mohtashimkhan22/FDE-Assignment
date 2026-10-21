
import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

// These are initial UI examples. Refine the wording and response
// patterns against the assignment's official guide and transcripts.
const STAGES = [
  {
    name: "Opening",
    purpose: "Introduce yourself and establish who you are speaking with.",
    prompts: ["Who is calling?", "What company are you with?"],
    tips: ["Keep the introduction brief", "Confirm you have the right person"],
    taps: ["Right person reached", "Introduced myself", "Wrong person"],
  },
  {
    name: "Purpose",
    purpose: "Explain the reason for your call clearly and briefly.",
    prompts: ["What is this regarding?", "What does your company do?"],
    tips: ["State the reason for calling", "Avoid a long product pitch"],
    taps: ["Purpose explained", "Asked for more information", "Not relevant"],
  },
  {
    name: "Permission",
    purpose: "Check whether the prospect can talk now.",
    prompts: ["I'm busy right now", "Can you call back later?"],
    tips: ["Respect their time", "Agree on another time if needed"],
    taps: ["Available to talk", "Asked to call back", "Too busy"],
  },
  {
    name: "Their business",
    purpose: "Understand the prospect's role and business context.",
    prompts: ["What do you need to know?", "Why are you asking?"],
    tips: ["Ask a concise question", "Listen before responding"],
    taps: ["Business context learned", "No details shared", "Not the decision-maker"],
  },
  {
    name: "Their need",
    purpose: "Understand the prospect's needs in their own words.",
    prompts: ["We already have a solution", "Our current process is manual"],
    tips: ["Capture exact words", "Do not assume a problem exists"],
    taps: ["Need identified", "No need stated", "Requested information"],
  },
  {
    name: "Objection",
    purpose: "Understand hesitation without arguing or pressuring.",
    prompts: ["It's too expensive", "Send me an email", "Not interested"],
    tips: ["Acknowledge the concern", "Clarify only when welcome"],
    taps: ["Concern clarified", "Email requested", "Not interested", "Do not call"],
  },
  {
    name: "Next step",
    purpose: "Record the next action the prospect actually agrees to.",
    prompts: ["Send me some information", "Let's schedule a meeting"],
    tips: ["Confirm the action", "Record timing and channel"],
    taps: ["Meeting agreed", "Report requested", "Follow-up agreed", "No next step"],
  },
  {
    name: "Close",
    purpose: "Confirm the outcome and finish the call respectfully.",
    prompts: ["Thanks, that's all I need", "Please don't contact me again"],
    tips: ["Record the true outcome", "Respect contact preferences"],
    taps: ["Call wrapped up", "Outcome confirmed"],
  },
];

const OUTCOMES = [
  ["next_step_agreed", "Next step agreed"],
  ["agreed_to_receive_report", "Agreed to receive information"],
  ["interested", "Interested"],
  ["follow_up", "Follow-up needed"],
  ["call_again", "Call again"],
  ["not_interested", "Not interested"],
  ["do_not_call", "Do not call"],
  ["wrong_person", "Wrong person"],
  ["moved_company", "Moved company"],
  ["not_logged", "Other / not logged"],
];

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.detail || `Request failed (${response.status})`
    );
  }

  return body;
}

function Icon({ children }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function App() {
  const [view, setView] = useState("call");
  const [health, setHealth] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [prospect, setProspect] = useState({
    prospect_name: "",
    company_name: "",
    prospect_role: "",
  });
  const [call, setCall] = useState(null);
  const [stageNumber, setStageNumber] = useState(1);
  const [happened, setHappened] = useState([]);
  const [words, setWords] = useState("");
  const [history, setHistory] = useState([]);
  const [outcome, setOutcome] = useState("follow_up");
  const [nextStep, setNextStep] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [summary, setSummary] = useState("");

  const stage = STAGES[stageNumber - 1];

  useEffect(() => {
    request("/health")
      .then(() => setHealth("online"))
      .catch(() => setHealth("offline"));
  }, []);

  async function loadHistory() {
    setBusy(true);
    setError("");
    try {
      const data = await request("/calls?limit=100");
      setHistory(data.items || []);
    } catch (err) {
      setError(`Couldn't load call history: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (view === "history") loadHistory();
  }, [view]);

  async function startCall(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const created = await request("/calls", {
        method: "POST",
        body: JSON.stringify({
          prospect_name: prospect.prospect_name.trim() || null,
          company_name: prospect.company_name.trim() || null,
          prospect_role: prospect.prospect_role.trim() || null,
        }),
      });

      setCall(created);
      setStageNumber(1);
      setHappened([]);
      setWords("");
      setSummary("");
      setShowClose(false);
      setNotice("Call started. Your progress will be saved to the database.");
    } catch (err) {
      setError(`Couldn't start call: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleTap(value) {
    setHappened((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  async function saveStage(number = stageNumber) {
    if (!call) return false;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await request(`/calls/${call.id}/stages/${number}`, {
        method: "PUT",
        body: JSON.stringify({
          happened,
          prospect_words: words,
        }),
      });
      setCall((current) => ({ ...current, current_stage: number }));
      setNotice(`Stage ${number} saved.`);
      return true;
    } catch (err) {
      setError(`Stage wasn't saved: ${err.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeStage(next) {
    const saved = await saveStage(stageNumber);
    if (!saved) return;

    setStageNumber(next);
    setHappened([]);
    setWords("");
    setNotice("");
  }

  async function closeCall(event) {
    event.preventDefault();
    if (!call) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      // Save the currently visible stage before closing the call.
      await request(`/calls/${call.id}/stages/${stageNumber}`, {
        method: "PUT",
        body: JSON.stringify({
          happened,
          prospect_words: words,
        }),
      });

      const closed = await request(`/calls/${call.id}/close`, {
        method: "POST",
        body: JSON.stringify({
          outcome,
          next_step: nextStep.trim() || null,
          next_step_at: null,
          summary: null,
        }),
      });

      setCall(closed);
      setShowClose(false);
      setNotice("Call saved. Generating the optional AI summary…");

      try {
        const ai = await request(`/calls/${call.id}/ai-summary`, {
          method: "POST",
        });
        setSummary(ai.summary || "");
        setNotice("Call and AI summary saved successfully.");
      } catch {
        setSummary("");
        setNotice(
          "Call saved. AI summary is unavailable right now; you can still view the call in history."
        );
      }
    } catch (err) {
      setError(`Couldn't close the call: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function resetCall() {
    setCall(null);
    setProspect({
      prospect_name: "",
      company_name: "",
      prospect_role: "",
    });
    setStageNumber(1);
    setHappened([]);
    setWords("");
    setSummary("");
    setNextStep("");
    setOutcome("follow_up");
    setShowClose(false);
    setError("");
    setNotice("");
  }

  const completedCalls = useMemo(
    () => history.filter((item) => item.status === "completed").length,
    [history]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => {
          e.preventDefault();
          setView("call");
        }}>
          <span className="brand-mark"><Icon>↗</Icon></span>
          <span>Callcraft<span className="brand-dot">.</span></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        <button
          className={`nav-item ${view === "call" ? "active" : ""}`}
          onClick={() => setView("call")}
        >
          <Icon>◉</Icon> Live call
        </button>
        <button
          className={`nav-item ${view === "history" ? "active" : ""}`}
          onClick={() => setView("history")}
        >
          <Icon>▤</Icon> Call history
        </button>

        <div className="sidebar-bottom">
          <div className={`connection-dot ${health}`} />
          <span>
            API {health === "online" ? "connected" : health === "offline" ? "offline" : "checking"}
          </span>
          <span className="version">v1.0</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="eyebrow">CALL WORKSPACE</div>
            <h1>{view === "call" ? "Cold call companion" : "Call history"}</h1>
          </div>
          <div className="topbar-right">
            <span className={`status-pill ${health}`}>
              <span className="small-dot" />
              {health === "online" ? "System online" : health === "offline" ? "API unavailable" : "Connecting"}
            </span>
            {call && call.status === "in_progress" && (
              <span className="live-pill"><span /> CALL IN PROGRESS</span>
            )}
          </div>
        </header>

        {error && (
          <div className="alert error" role="alert">
            <strong>Something needs attention.</strong> {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">×</button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button>
          </div>
        )}

        {view === "history" ? (
          <section className="history-page">
            <div className="section-heading">
              <div>
                <div className="eyebrow">YOUR ACTIVITY</div>
                <h2>Past calls</h2>
                <p>Review outcomes and where each conversation ended.</p>
              </div>
              <button className="button secondary" onClick={loadHistory} disabled={busy}>
                <Icon>↻</Icon> Refresh
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Total calls</span>
                <strong>{history.length}</strong>
                <small>Recorded in Supabase</small>
              </div>
              <div className="stat-card">
                <span>Completed</span>
                <strong>{completedCalls}</strong>
                <small>Calls with a final outcome</small>
              </div>
              <div className="stat-card">
                <span>In progress</span>
                <strong>{history.length - completedCalls}</strong>
                <small>Calls not yet closed</small>
              </div>
            </div>

            <div className="table-card">
              <div className="table-header">
                <div>
                  <h3>Recent conversations</h3>
                  <p>Your saved call records</p>
                </div>
                <span className="record-count">{history.length} records</span>
              </div>

              {history.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">▤</div>
                  <h3>No calls yet</h3>
                  <p>Start your first call to see it appear here.</p>
                  <button className="button primary" onClick={() => setView("call")}>
                    Start a call
                  </button>
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>PROSPECT</th>
                        <th>COMPANY</th>
                        <th>STAGE REACHED</th>
                        <th>OUTCOME</th>
                        <th>STATUS</th>
                        <th>DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.prospect_name || "Unknown prospect"}</strong>
                            <small>{item.prospect_role || "No role recorded"}</small>
                          </td>
                          <td>{item.company_name || "—"}</td>
                          <td>
                            <span className="stage-chip">
                              {item.current_stage || 1} / 8
                            </span>
                          </td>
                          <td>
                            {OUTCOMES.find(([value]) => value === item.outcome)?.[1] || "—"}
                          </td>
                          <td>
                            <span className={`table-status ${item.status}`}>
                              {item.status === "completed" ? "Completed" : "In progress"}
                            </span>
                          </td>
                          <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : !call ? (
          <section className="start-layout">
            <div className="welcome-panel">
              <div className="welcome-icon">✳</div>
              <div className="eyebrow">BE PRESENT. STAY STRUCTURED.</div>
              <h2>Make every<br />conversation count.</h2>
              <p>
                Keep your focus on the prospect. We'll keep the structure
                of the call, your notes, and the next step in view.
              </p>
              <div className="welcome-metrics">
                <div><strong>08</strong><span>Guided stages</span></div>
                <div><strong>01</strong><span>Clear next step</span></div>
                <div><strong>∞</strong><span>Room to listen</span></div>
              </div>
              <div className="quote-card">
                <span className="quote-mark">“</span>
                <p>A good call isn't a perfect pitch. It's a useful conversation.</p>
              </div>
            </div>

            <form className="start-card" onSubmit={startCall}>
              <div className="eyebrow">READY WHEN YOU ARE</div>
              <h2>Start a new call</h2>
              <p className="muted">Add what you know. You can leave any field blank.</p>

              <label>
                Prospect name <span>OPTIONAL</span>
                <input
                  value={prospect.prospect_name}
                  onChange={(e) => setProspect({ ...prospect, prospect_name: e.target.value })}
                  placeholder="e.g. Alex Morgan"
                  maxLength={200}
                />
              </label>
              <label>
                Company <span>OPTIONAL</span>
                <input
                  value={prospect.company_name}
                  onChange={(e) => setProspect({ ...prospect, company_name: e.target.value })}
                  placeholder="e.g. Northstar Labs"
                  maxLength={200}
                />
              </label>
              <label>
                Role or title <span>OPTIONAL</span>
                <input
                  value={prospect.prospect_role}
                  onChange={(e) => setProspect({ ...prospect, prospect_role: e.target.value })}
                  placeholder="e.g. Operations Director"
                  maxLength={200}
                />
              </label>

              <button className="button primary start-button" disabled={busy || health === "offline"}>
                {busy ? "Starting call…" : "Start call"} <span>→</span>
              </button>
              <div className="privacy-note"><Icon>▣</Icon> Notes are saved to your private database.</div>
            </form>
          </section>
        ) : call.status === "completed" ? (
          <section className="completion-card">
            <div className="completion-icon">✓</div>
            <div className="eyebrow">CALL SAVED</div>
            <h2>Conversation wrapped up.</h2>
            <p className="muted">
              {call.prospect_name || "Your prospect"} · {call.company_name || "Company not recorded"}
            </p>
            <div className="completion-outcome">
              <span>RECORDED OUTCOME</span>
              <strong>{OUTCOMES.find(([value]) => value === call.outcome)?.[1] || call.outcome}</strong>
              <p>{call.next_step || "No next step recorded."}</p>
            </div>
            {summary && (
              <div className="summary-card">
                <div className="summary-heading"><Icon>✦</Icon> Gemini call summary</div>
                <p>{summary}</p>
              </div>
            )}
            {!summary && (
              <p className="muted">The call is saved. An AI summary may be unavailable if the service is temporarily offline.</p>
            )}
            <div className="completion-actions">
              <button className="button primary" onClick={resetCall}>Start another call</button>
              <button className="button secondary" onClick={() => {
                resetCall();
                setView("history");
              }}>View call history</button>
            </div>
          </section>
        ) : (
          <section className="call-layout">
            <div className="call-main">
              <div className="prospect-strip">
                <div className="avatar">
                  {(call.prospect_name || call.company_name || "P").charAt(0).toUpperCase()}
                </div>
                <div className="prospect-info">
                  <strong>{call.prospect_name || "New prospect"}</strong>
                  <span>
                    {[call.prospect_role, call.company_name].filter(Boolean).join(" · ") || "Prospect details not provided"}
                  </span>
                </div>
                <span className="live-pill"><span /> LIVE SESSION</span>
              </div>

              <div className="progress-panel">
                <div className="progress-top">
                  <div>
                    <div className="eyebrow">CALL PROGRESS</div>
                    <h3>Stage {stageNumber} <span>of {STAGES.length}</span></h3>
                  </div>
                  <strong>{Math.round((stageNumber / STAGES.length) * 100)}%</strong>
                </div>
                <div className="progress-track">
                  <div style={{ width: `${(stageNumber / STAGES.length) * 100}%` }} />
                </div>
                <div className="stage-steps">
                  {STAGES.map((item, index) => {
                    const number = index + 1;
                    return (
                      <button
                        key={item.name}
                        title={item.name}
                        className={`stage-step ${number === stageNumber ? "current" : ""} ${number < stageNumber ? "passed" : ""}`}
                        onClick={() => {
                          if (number < stageNumber) {
                            setStageNumber(number);
                            setHappened([]);
                            setWords("");
                          }
                        }}
                        disabled={busy || number >= stageNumber}
                      >
                        <span>{number < stageNumber ? "✓" : number}</span>
                        <small>{item.name}</small>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="stage-card">
                <div className="stage-title-row">
                  <div className="stage-number">{String(stageNumber).padStart(2, "0")}</div>
                  <div>
                    <div className="eyebrow">CURRENT STAGE</div>
                    <h2>{stage.name}</h2>
                  </div>
                  <span className="purpose-tag">STAGE PURPOSE</span>
                </div>

                <div className="purpose-box">
                  <span className="purpose-icon">◎</span>
                  <div>
                    <strong>What this stage is for</strong>
                    <p>{stage.purpose}</p>
                  </div>
                </div>

                <div className="stage-section">
                  <div className="section-title">
                    <span className="section-icon">☷</span>
                    <div>
                      <h3>What you might hear</h3>
                      <p>Examples to help you stay prepared, not a script.</p>
                    </div>
                  </div>
                  <div className="response-list">
                    {stage.prompts.map((prompt) => (
                      <div className="response-example" key={prompt}>
                        <span>“</span><p>{prompt}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stage-section">
                  <div className="section-title">
                    <span className="section-icon">✳</span>
                    <div>
                      <h3>What happened?</h3>
                      <p>Tap all that apply. You can change these before saving.</p>
                    </div>
                  </div>
                  <div className="tap-options">
                    {stage.taps.map((tap) => (
                      <button
                        key={tap}
                        className={`tap-option ${happened.includes(tap) ? "selected" : ""}`}
                        onClick={() => toggleTap(tap)}
                        disabled={busy}
                      >
                        <span className="tap-check">{happened.includes(tap) ? "✓" : "+"}</span>
                        {tap}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="stage-section notes-section">
                  <div className="section-title">
                    <span className="section-icon">✎</span>
                    <div>
                      <h3>Capture their words</h3>
                      <p>Use their actual words where possible. Don't guess.</p>
                    </div>
                  </div>
                  <textarea
                    value={words}
                    onChange={(e) => setWords(e.target.value)}
                    maxLength={5000}
                    placeholder="“We're currently using…” or “The biggest challenge for us is…”"
                    rows={4}
                    disabled={busy}
                  />
                  <div className="textarea-footer">
                    <span>{words.length} / 5000 characters</span>
                    <button className="text-button" onClick={() => setWords("")} disabled={busy || !words}>
                      Clear notes
                    </button>
                  </div>
                </div>

                <div className="stage-footer">
                  <button className="button danger-outline" onClick={() => setShowClose(true)} disabled={busy}>
                    End call
                  </button>
                  <div className="stage-footer-right">
                    <button className="button secondary" onClick={() => saveStage()} disabled={busy}>
                      Save stage
                    </button>
                    {stageNumber < STAGES.length ? (
                      <button className="button primary" onClick={() => changeStage(stageNumber + 1)} disabled={busy}>
                        {busy ? "Saving…" : "Next stage"} <span>→</span>
                      </button>
                    ) : (
                      <button className="button primary" onClick={() => setShowClose(true)} disabled={busy}>
                        Finish call <span>→</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <aside className="call-rail">
              <div className="rail-card">
                <div className="rail-title"><span>✳</span> Keep in mind</div>
                <ul className="tips-list">
                  {stage.tips.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
              </div>

              <div className="rail-card next-card">
                <div className="eyebrow">UP NEXT</div>
                <h3>{stageNumber < STAGES.length ? STAGES[stageNumber].name : "Call outcome"}</h3>
                <p>{stageNumber < STAGES.length ? STAGES[stageNumber].purpose : "Record how the conversation ended."}</p>
                {stageNumber < STAGES.length && (
                  <button className="text-button" onClick={() => changeStage(stageNumber + 1)} disabled={busy}>
                    Go to next stage <span>→</span>
                  </button>
                )}
              </div>

              <div className="rail-card note-rail">
                <div className="rail-title"><Icon>▣</Icon> Save status</div>
                <p>Your notes are held in this screen until you save the stage or move to the next one.</p>
                <span className="save-label"><span /> Database connected via API</span>
              </div>
            </aside>
          </section>
        )}

        {showClose && call && call.status === "in_progress" && (
          <div className="modal-backdrop" role="presentation">
            <form className="close-modal" onSubmit={closeCall}>
              <button type="button" className="modal-x" onClick={() => setShowClose(false)} aria-label="Close">×</button>
              <div className="completion-icon small">✓</div>
              <div className="eyebrow">WRAP UP</div>
              <h2>How did the call end?</h2>
              <p className="muted">Record the actual outcome. This also saves the current stage.</p>

              <label>
                Call outcome
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  {OUTCOMES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                Agreed next step <span>OPTIONAL</span>
                <textarea
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. Send the requested information on Thursday"
                />
              </label>

              {outcome === "do_not_call" && (
                <div className="alert warning">
                  Respect this request. Do not initiate another call to this prospect.
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setShowClose(false)} disabled={busy}>
                  Keep calling
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? "Saving call…" : "Save and finish"}
                </button>
              </div>
            </form>
          </div>
        )}

        <footer className="app-footer">
          <span>CALLCRAFT <span className="brand-dot">.</span></span>
          <span>Listen first. Log accurately. Follow through.</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
