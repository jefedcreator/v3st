import { policy } from "@/backend/config/policy";

export const SESSION_COOKIE_NAME = "sara-session";
export const SESSION_MAX_AGE_SECONDS = policy.auth.sessionTtlSeconds;
