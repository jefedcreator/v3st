import { parseAbi } from "viem";

export const settlementTokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function mint(address,uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

export const stockTokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function multiplierWad() view returns (uint256)",
  "function scheduleMultiplier(uint256 toWad, uint64 effectiveAt) returns (uint256)",
  "function cancelAction(uint256 actionId)",
  "function applyDueActions()",
  "function effectiveMultiplierAt(uint64) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event MultiplierScheduled(uint256 indexed actionId, uint256 fromWad, uint256 toWad, uint64 effectiveAt)",
  "event ActionCancelled(uint256 indexed actionId)",
  "event MultiplierApplied(uint256 indexed actionId, uint256 newWad)",
]);

export const stockRegistryAbi = parseAbi([
  "function registerInstrument(address token, string assetKey, string symbol, string name, uint8 decimals, string kind, string issuer, string rightsSummary) returns (bytes32)",
  "function setReferencePrice(bytes32 key, uint256 priceMicroUsd, string basis, uint64 asOf)",
  "function setTradingFlags(bytes32 key, bool paused, bool delisted, bool enabled)",
  "function instrumentCount() view returns (uint256)",
  "function instrumentKeyAt(uint256) view returns (bytes32)",
  "event InstrumentRegistered(bytes32 indexed key, address indexed token, string assetKey, string symbol)",
  "event ReferencePriceSet(bytes32 indexed key, uint256 priceMicroUsd, string basis, uint64 asOf)",
  "event TradingFlagSet(bytes32 indexed key, bool paused, bool delisted, bool enabled)",
]);

const callTuple = {
  type: "tuple",
  name: "call",
  components: [
    { type: "address", name: "target" },
    { type: "bytes", name: "data" },
    { type: "uint256", name: "value" },
  ],
} as const;

export const executionAccountAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address", name: "" }] },
  { type: "function", name: "relayer", stateMutability: "view", inputs: [], outputs: [{ type: "address", name: "" }] },
  { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256", name: "" }] },
  { type: "function", name: "authorizationEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint64", name: "" }] },
  { type: "function", name: "approvedCalls", stateMutability: "view", inputs: [{ type: "bytes32", name: "" }], outputs: [{ type: "bool", name: "" }] },
  {
    type: "function",
    name: "callIdOf",
    stateMutability: "view",
    inputs: [{ type: "bytes32", name: "operationId" }, callTuple],
    outputs: [{ type: "bytes32", name: "" }],
  },
  {
    type: "function",
    name: "approveCalls",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32[]", name: "callIds" }],
    outputs: [],
  },
  {
    type: "function",
    name: "executeBatch",
    stateMutability: "nonpayable",
    inputs: [
      { type: "bytes32", name: "operationId" },
      { type: "uint256", name: "opNonce" },
      { type: "uint64", name: "deadline" },
      { type: "uint64", name: "authEpoch" },
      { ...callTuple, name: "calls", type: "tuple[]" },
    ],
    outputs: [],
  },
  { type: "function", name: "bumpAuthorizationEpoch", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "event", name: "CallApproved", inputs: [{ type: "bytes32", name: "callId", indexed: true }] },
  {
    type: "event",
    name: "Executed",
    inputs: [
      { type: "bytes32", name: "operationId", indexed: true },
      { type: "uint256", name: "opNonce", indexed: true },
      { type: "bytes32", name: "callId", indexed: true },
      { type: "address", name: "target" },
      { type: "uint256", name: "value" },
    ],
  },
  {
    type: "event",
    name: "OperationExecuted",
    inputs: [
      { type: "bytes32", name: "operationId", indexed: true },
      { type: "uint256", name: "opNonce", indexed: true },
      { type: "uint256", name: "calls" },
    ],
  },
] as const;
