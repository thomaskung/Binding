"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@binding/ui";
import { createAgentToken, revokeAgentToken, type AgentTokenSummary } from "../agent-token-actions";

interface Props {
  agentAccessOptedIn: boolean;
  initialTokens: AgentTokenSummary[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Fills the "Coming soon" agent/API-token placeholder reserved on
 * `/seeker/settings/security` since Phase 6 (DESIGN.md §14e, Phase 11).
 * Gated on the agent-access consent toggle (`/seeker/settings/privacy`) —
 * this card shows a plain notice instead of the create form when consent
 * hasn't been granted, rather than letting a token get created and then
 * silently fail every real MCP call. */
export function AgentTokenCard({ agentAccessOptedIn, initialTokens }: Props) {
  const [tokens, setTokens] = useState(initialTokens);
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const { id, token } = await createAgentToken(label.trim() || null);
        setNewToken(token);
        setLabel("");
        setTokens((prev) => [
          {
            id, // the real row id — a fabricated one would make a same-session Revoke silently no-op
            label: label.trim() || null,
            createdAt: new Date().toISOString(),
            revokedAt: null,
            lastUsedAt: null,
          },
          ...prev,
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Token creation failed");
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      await revokeAgentToken(id);
      setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, revokedAt: new Date().toISOString() } : t)));
    });
  }

  return (
    <Card className="jb-lift" data-testid="agent-token-placeholder-card">
      <CardHeader>
        <CardTitle className="text-sm">Agent &amp; API tokens</CardTitle>
        <CardDescription>
          Personal-agent/MCP access tokens with read-only, scoped permissions (DESIGN.md §14e).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!agentAccessOptedIn ? (
          <p className="text-sm text-muted-foreground" data-testid="agent-access-consent-required">
            Enable &quot;Personal agent / MCP access&quot; in{" "}
            <a href="/seeker/settings/privacy" className="underline">
              Privacy settings
            </a>{" "}
            before creating a token.
          </p>
        ) : newToken ? (
          <div className="space-y-2 rounded-lg border border-border p-3" data-testid="new-agent-token-card">
            <p className="text-xs text-muted-foreground">
              Copy this token now — it won&apos;t be shown again.
            </p>
            <Input readOnly value={newToken} data-testid="new-agent-token-value" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" onClick={() => setNewToken(null)} data-testid="agent-token-saved">
              I&apos;ve saved it
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. My career assistant)"
              data-testid="agent-token-label-input"
            />
            <Button onClick={create} disabled={pending} data-testid="create-agent-token">
              {pending ? "Creating…" : "Create token"}
            </Button>
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" data-testid="agent-token-error">
            {error}
          </p>
        )}

        {tokens.length > 0 && (
          <ul className="space-y-2" data-testid="agent-token-list">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                data-testid="agent-token-row"
              >
                <div className="flex flex-col">
                  <span>{t.label ?? "(unlabeled)"}</span>
                  <span className="text-xs text-muted-foreground">
                    Created {formatDate(t.createdAt)} · Last used {formatDate(t.lastUsedAt)}
                  </span>
                </div>
                {t.revokedAt ? (
                  <Badge variant="secondary" data-testid="agent-token-revoked-badge">
                    Revoked
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => revoke(t.id)}
                    data-testid="revoke-agent-token"
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
