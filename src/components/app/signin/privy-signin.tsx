"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import {
  getIdentityToken,
  PrivyProvider,
  useLoginWithEmail,
  usePrivy,
} from "@privy-io/react-auth";

import { appApi } from "@/utils/app-api";
import { afterSignInPath } from "@/utils/app-paths";
import {
  Button,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Label,
} from "@/primitives";
import { canResend, isValidEmail, signinErrorMessage } from "./signin";

type PrivySigninProps = {
  appId: string;
  next: string | null;
  signedOut: boolean;
};

export default function PrivySignin(props: PrivySigninProps) {
  return (
    <PrivyProvider
      appId={props.appId}
      config={{
        loginMethods: ["email"],
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      <PrivyFlow {...props} />
    </PrivyProvider>
  );
}

function PrivyFlow({ next, signedOut }: PrivySigninProps) {
  const { ready, authenticated, logout, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sentAt, setSentAt] = React.useState<number | null>(null);
  const [stage, setStage] = React.useState<"email" | "code">("email");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const exchanged = React.useRef(false);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // After a V3ST sign-out, a stored Privy session must never sign anyone back
  // in: log it out first, and only then allow the token exchange. Without the
  // signed-out flag a stored session is a welcome shortcut back in.
  const [storedSessionCleared, setStoredSessionCleared] = React.useState(!signedOut);
  React.useEffect(() => {
    if (storedSessionCleared || !ready) return;
    let cancelled = false;
    void (async () => {
      try {
        if (authenticated) await logout();
      } finally {
        if (!cancelled) setStoredSessionCleared(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storedSessionCleared, ready, authenticated, logout]);

  // Exchange both tokens with V3ST exactly once per Privy sign-in, then leave.
  React.useEffect(() => {
    if (!storedSessionCleared || !ready || !authenticated || exchanged.current) return;
    exchanged.current = true;
    void (async () => {
      try {
        const [accessToken, identityToken] = await Promise.all([
          getAccessToken(),
          getIdentityToken(),
        ]);
        if (accessToken === null || identityToken === null) {
          exchanged.current = false;
          setPending(false);
          setError("That code didn't work. Check it and try again.");
          return;
        }
        const res = await appApi.auth.privy({
          access_token: accessToken,
          identity_token: identityToken,
        });
        router.replace(afterSignInPath(res.next_step, next));
      } catch (caught) {
        // V3ST refused this sign-in (not on the beta list, for one): end the
        // Privy session too, so another email can be tried.
        setPending(false);
        setError(signinErrorMessage(caught));
        try {
          await logout();
        } finally {
          exchanged.current = false;
        }
      }
    })();
  }, [storedSessionCleared, ready, authenticated, getAccessToken, logout, next, router]);

  async function onSendCode(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email)) return;
    setPending(true);
    setError(null);
    try {
      await sendCode({ email });
      setSentAt(Date.now());
      setStage("code");
    } catch (caught) {
      setError(signinErrorMessage(caught));
    }
    setPending(false);
  }

  async function onResend() {
    setError(null);
    setCode("");
    try {
      await sendCode({ email });
      setSentAt(Date.now());
    } catch (caught) {
      setError(signinErrorMessage(caught));
    }
  }

  async function onCode(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      await loginWithCode({ code });
    } catch (caught) {
      setError(signinErrorMessage(caught));
      setPending(false);
    }
  }

  const errorId = "signin-code-error";

  if (stage === "email") {
    return (
      <form className="flex flex-col gap-4" onSubmit={onSendCode} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="signin-email">Email</Label>
          <Input
            id="signin-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            aria-invalid={error !== null}
            aria-describedby={error !== null ? errorId : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={!isValidEmail(email) || pending || !ready || !storedSessionCleared}
        >
          {pending ? "Sending…" : "Send code"}
        </Button>
        <PrivyError id={errorId} error={error} />
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onCode} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signin-code">Code</Label>
        <InputOTP
          id="signin-code"
          maxLength={6}
          autoComplete="one-time-code"
          value={code}
          onChange={setCode}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
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
        {pending ? "Signing you in…" : "Sign in"}
      </Button>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={sentAt === null || !canResend(sentAt, now) || pending}
          onClick={() => void onResend()}
        >
          Send a new code
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setStage("email");
            setCode("");
            setError(null);
          }}
        >
          Use a different email
        </Button>
      </div>
      <PrivyError id={errorId} error={error} />
    </form>
  );
}

function PrivyError({ id, error }: { id: string; error: string | null }) {
  if (error === null) return null;
  return (
    <p id={id} role="status" aria-live="polite" className="text-loss text-sm">
      {error}
    </p>
  );
}
