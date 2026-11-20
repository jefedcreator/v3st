// Privy loads this module for its wallet-registration side effect. Reject the
// import so Privy's optional loader handles the unavailable integration.
throw new Error("Farcaster wallet registration is disabled in the V3ST beta.");

export {};
