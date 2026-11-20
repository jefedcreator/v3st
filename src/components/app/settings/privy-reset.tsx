"use client";

import * as React from "react";
import {
  getIdentityToken,
  PrivyProvider,
  useLoginWithEmail,
  usePrivy,
} from "@privy-io/react-auth";

import { Button, InputOTP, InputOTPGroup, InputOTPSlot, Label } from "@/primitives";

export type PrivyResetResult = {
  access_token: string;
  identity_token: string;
};

const CODE_FAILED = "That code didn't work. Check it and try again.";

// A fresh Privy email sign-in for a PIN reset. Loaded only in sandbox mode,
// through a dynamic import, inside the Reset PIN modal.
export default function PrivyReset(props: {
  appId: string;
  email: string;
  onTokens: (tokens: PrivyResetResult) => void;
}) {
  return (
    <PrivyProvider
      appId={props.appId}
      config={{
        loginMethods: ["email"],
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      <PrivyResetFlow email={props.email} onTokens={props.onTokens} />
    </PrivyProvider>
  );
}

// The reset needs a session V3ST has not seen: any stored Privy session is
// logged out once, first; then a code goes to the profile email, and the new
// session's tokens are handed up exactly once.
function PrivyResetFlow({
  email,
  onTokens,
}: {
  email: string;
  onTokens: (tokens: PrivyResetResult) => void;
}) {
  const { ready, authenticated, logout, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [cleared, setCleared] = React.useState(false);
  const [stage, setStage] = React.useState<"send" | "code">("send");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const handedUp = React.useRef(false);
  const onTokensRef = React.useRef(onTokens);
  onTokensRef.current = onTokens;

  React.useEffect(() => {
    if (cleared || !ready) return;
    let cancelled = false;
    void (async () => {
      try {
        if (authenticated) await logout();
      } finally {
        if (!cancelled) setCleared(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cleared, ready, authenticated, logout]);

  React.useEffect(() => {
    if (!cleared || !authenticated || handedUp.current) return;
    handedUp.current = true;
    void (async () => {
      const [accessToken, identityToken] = await Promise.all([
        getAccessToken(),
        getIdentityToken(),
      ]);
      if (accessToken === null || identityToken === null) {
        handedUp.current = false;
        setPending(false);
        setError(CODE_FAILED);
        return;
      }
      onTokensRef.current({ access_token: accessToken, identity_token: identityToken });
    })();
  }, [cleared, authenticated, getAccessToken]);

  async function onSend() {
    setPending(true);
    setError(null);
    try {
      await sendCode({ email });
      setStage("code");
    } catch {
      setError("We couldn't send a code. Please try again.");
    }
    setPending(false);
  }

  async function onCode(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      await loginWithCode({ code });
    } catch {
      setError(CODE_FAILED);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {stage === "send" && (
        <>
          <p className="text-muted-foreground text-sm">
            To reset your PIN, sign in again with a code sent to {email}.
          </p>
          <Button disabled={!ready || !cleared || pending} onClick={() => void onSend()}>
            {pending ? "Sending…" : "Send code"}
          </Button>
        </>
      )}
      {stage === "code" && (
        <form className="flex flex-col gap-4" onSubmit={onCode} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-code">Code</Label>
            <InputOTP
              id="reset-code"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={setCode}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? "reset-code-error" : undefined}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button type="submit" disabled={code.length !== 6 || pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
      )}
      <p
        id="reset-code-error"
        role="status"
        aria-live="polite"
        className="text-loss text-sm empty:hidden"
      >
        {error}
      </p>
    </div>
  );
}
