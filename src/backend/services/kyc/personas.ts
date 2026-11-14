export type PersonaId = "ada_tier2" | "tunde_tier1" | "rejected";

export type Persona = {
  id: PersonaId;
  label: string;
  tier: 0 | 1 | 2;
  outcome: "verified" | "rejected";
  name: string | null;
  profile: {
    dateOfBirth: string | null;
    idType: "BVN";
    idNumber: string | null;
    address: string | null;
  };
};

export const BETA_PERSONAS: readonly Persona[] = [
  {
    id: "ada_tier2",
    label: "Adaeze Obi (tier 2, verified)",
    tier: 2,
    outcome: "verified",
    name: "ADAEZE OBI",
    profile: {
      dateOfBirth: "1990-04-12",
      idType: "BVN",
      idNumber: "22200000001",
      address: "1 Test Close, Lagos (simulated)",
    },
  },
  {
    id: "tunde_tier1",
    label: "Babatunde Adeyemi (tier 1, verified)",
    tier: 1,
    outcome: "verified",
    name: "BABATUNDE ADEYEMI",
    profile: {
      dateOfBirth: "1988-09-30",
      idType: "BVN",
      idNumber: "22200000002",
      address: null,
    },
  },
  {
    id: "rejected",
    label: "Rejected persona (simulated failure)",
    tier: 0,
    outcome: "rejected",
    name: null,
    profile: { dateOfBirth: null, idType: "BVN", idNumber: null, address: null },
  },
];
