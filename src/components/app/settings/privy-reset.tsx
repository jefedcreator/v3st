"use client";

import * as React from "react";
import {
  getIdentityToken,
  PrivyProvider,
  usePrivy,
  useLoginWithEmail,
} from "@privy-io/react-auth";

import { appApi } from "@/utils/app-api";
import { isValidEmail } from "@/components/app/signin/signin";
import { Button, Input, Label } from "@/primitives";

export type PrivyResetResult = {
  access_token: string;
  identity_token: string;
};

export default function PrivyReset(props: {
  appId: string;
  email: string;
  onTokens: (tokens: { access_token: string; identity_token: string }) => void;
}) {
  return (
    <PrivyProvider
      appId={props.appId}
      config={{
        loginMethods: ["email"],
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      <PrivyResetFlow appId={props.appId} email={props.email} onTokens={props.onTokens} />
    </PrivyProvider>
  );
}

function PrivyResetFlow(props: { appId: string; email: string; onTokens: (tokens: { access_token: string; identity_token: string }) => void }) {
  const { authenticated, logout, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [stage, setStage] = React.useState<"email" | "code" | "done">("email");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<PrivyResetResult | null>(null);
  const exchanged = React.useRef(false);

  React.useEffect(() => {
    if (authenticated) void logout();
  }, [authenticated, logout]);

  React.useEffect(() => {
    if (!authenticated || exchanged.current) return;
    exchanged.current = true;
    void (async () => {
      const [accessToken, identityToken] = await Promise.all([
        getAccessToken(),
        getIdentityToken(),
      ]);
      if (accessToken === null || identityToken === null) {
        setError("That code didn't work. Check it and try again.");
        return;
      }
      setResult({ access_token: accessToken, identity_token: identityToken });
      props.onTokens({ access_token: accessToken, identity_token: identityToken });
      setStage("done");
    })();
  }, [authenticated, getAccessToken, props]);

  async function onSend(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email)) return;
    setPending(true);
    try {
      await sendCode({ email, disableSignup: true });
      setStage("code");
    } catch {
      setError("That code didn't work. Check it and try again.");
    }
    setPending(false);
  }

  async function onCode(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setPending(true);
    try {
      await loginWithCode({ code });
    } catch {
      setError("That code didn't work. Check it and try again.");
      setPending(false);
    }
  }

  if (stage === "done") {
    return <p className="text-gain text-sm">You're signed in again.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Sign in again with your email to reset your PIN.
      </p>
      {stage === "email" && (
        <form className="flex flex-col gap-4" onSubmit={onSend} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={!isValidEmail(email) || pending}>
            {pending ? "Sending…" : "Send code"}
          </Button>
        </form>
      )}
      {stage === "code" && (
        <form className="flex flex-col gap-4" onSubmit={onCode} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-code">Code</Label>
            <Input
              id="reset-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={code.length !== 6 || pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
      )}
      {error !== null && (
        <p role="status" aria-live="polite" className="text-loss text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
