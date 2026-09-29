import { useState } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "system",
      text: "G10 Multi-Agent Builder ready.",
    },
  ]);

  const [builderRunning, setBuilderRunning] =
    useState(false);

  const [waitingForApproval, setWaitingForApproval] =
    useState(false);

  const [builderOutput, setBuilderOutput] =
    useState("");

  const [proposedChange, setProposedChange] =
    useState("");

  const extractProposedChange = (output) => {
    const marker = "PROPOSED CHANGE";

    const markerIndex = output.lastIndexOf(marker);

    if (markerIndex === -1) {
      return "";
    }

    let proposal = output.slice(markerIndex + marker.length);

    proposal = proposal
      .replace(/^=+/gm, "")
      .trim();

    const approvalIndex = proposal.search(
      /Type YES|Enter YES|Approve/i
    );

    if (approvalIndex !== -1) {
      proposal = proposal
        .slice(0, approvalIndex)
        .trim();
    }

    return proposal;
  };

  const sendMessage = async () => {
    const text = message.trim();

    if (!text || builderRunning) return;

    setMessages((current) => [
      ...current,
      {
        role: "user",
        text,
      },
      {
        role: "system",
        text: "Starting G10 Multi-Agent Builder...",
      },
    ]);

    setMessage("");
    setBuilderRunning(true);
    setWaitingForApproval(false);
    setBuilderOutput("");
    setProposedChange("");

    try {
      const response = await fetch(
        "http://localhost:3001/api/builder/run",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request: text,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();

        setMessages((current) => [
          ...current,
          {
            role: "system",
            text: `Builder error: ${error}`,
          },
        ]);

        setBuilderRunning(false);
        return;
      }

      if (!response.body) {
        throw new Error(
          "Builder returned no response stream."
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let output = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        output += decoder.decode(value, {
          stream: true,
        });

        setBuilderOutput(output);

        const proposal =
          extractProposedChange(output);

        if (proposal) {
          setProposedChange(proposal);
        }

        const approvalRequested =
          /Type YES|Enter YES|type YES|approval.*YES/i.test(
            output
          );

        if (approvalRequested) {
          setWaitingForApproval(true);
        }

        setMessages((current) => {
          const updated = [...current];

          if (
            updated.length &&
            updated[updated.length - 1].streaming
          ) {
            updated[updated.length - 1] = {
              role: "system",
              text: output,
              streaming: true,
            };
          } else {
            updated.push({
              role: "system",
              text: output,
              streaming: true,
            });
          }

          return updated;
        });
      }

      setMessages((current) => {
        const updated = [...current];

        if (updated.length) {
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            streaming: false,
          };
        }

        return updated;
      });

      setBuilderRunning(false);
      setWaitingForApproval(false);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "system",
          text: `Could not connect to Builder: ${error.message}`,
        },
      ]);

      setBuilderRunning(false);
      setWaitingForApproval(false);
    }
  };

  const respondToBuilder = async (responseText) => {
    try {
      const response = await fetch(
        "http://localhost:3001/api/builder/respond",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            response: responseText,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();

        setMessages((current) => [
          ...current,
          {
            role: "system",
            text: `Builder response error: ${error}`,
          },
        ]);

        return;
      }

      setWaitingForApproval(false);

      setMessages((current) => [
        ...current,
        {
          role: "user",
          text:
            responseText === "YES"
              ? "Approved."
              : "Rejected.",
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "system",
          text: `Could not respond to Builder: ${error.message}`,
        },
      ]);
    }
  };

  const refreshPreview = () => {
    const frame =
      document.getElementById("g10-preview");

    if (frame) {
      frame.src = frame.src;
    }
  };

  return (
    <div className="builder">
      <header className="topbar">
        <div>
          <strong>G10 DEV</strong>

          <span className="subtitle">
            Multi-Agent Builder
          </span>
        </div>

        <div className="status">
          <span className="dot"></span>

          {waitingForApproval
            ? "Waiting for Approval"
            : builderRunning
              ? "Builder Working"
              : "Ready"}
        </div>
      </header>

      <main className="workspace">
        <section className="managerPanel">
          <div className="panelHeader">
            <div>
              <h2>AI Manager</h2>

              <p>
                Tell G10 what you want changed.
              </p>
            </div>
          </div>

          <div className="agents">
            <span>Manager</span>
            <span>Investigator</span>
            <span>Frontend</span>
            <span>Supabase</span>
            <span>Debugging</span>
            <span>Review</span>
          </div>

          <div className="messages">
            {messages.map((item, index) => (
              <div
                key={index}
                className={`message ${item.role}`}
              >
                {item.text}
              </div>
            ))}
          </div>

          <div className="composer">
            <textarea
              value={message}
              disabled={builderRunning}
              onChange={(event) =>
                setMessage(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                builderRunning
                  ? "Builder is working..."
                  : "Example: Fix the customer portal login..."
              }
            />

            <button
              onClick={sendMessage}
              disabled={
                builderRunning ||
                !message.trim()
              }
            >
              {builderRunning
                ? "Working..."
                : "Send"}
            </button>
          </div>
        </section>

        <section className="previewPanel">
          <div className="previewHeader">
            <div>
              <h2>Live G10 OS</h2>

              <p>
                Actual local application preview
              </p>
            </div>

            <div className="previewActions">
              <button onClick={refreshPreview}>
                Refresh
              </button>

              <button
                onClick={() =>
                  window.open(
                    "http://localhost:5173/app.html",
                    "_blank"
                  )
                }
              >
                Open App
              </button>
            </div>
          </div>

          <div className="browserBar">
            <span></span>
            <span></span>
            <span></span>

            <div className="address">
              http://localhost:5173/app.html
            </div>
          </div>

          <div className="preview">
            <iframe
              id="g10-preview"
              title="G10 OS Preview"
              src="http://localhost:5173/app.html"
            />
          </div>

          <div className="changePanel">
            <div>
              <strong>
                Proposed Change
              </strong>

              <p>
                {proposedChange
                  ? proposedChange
                  : builderRunning
                    ? "Builder is investigating..."
                    : "No pending changes. Ask the AI Manager to modify G10 OS."}
              </p>
            </div>

            <div className="changeButtons">
              <button
                className="approve"
                disabled={!waitingForApproval}
                onClick={() =>
                  respondToBuilder("YES")
                }
              >
                Approve
              </button>

              <button
                disabled={!waitingForApproval}
                onClick={() =>
                  respondToBuilder("NO")
                }
              >
                Reject
              </button>

              <button disabled>
                Undo
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;