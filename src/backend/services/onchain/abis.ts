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
  "function getInstrument(bytes32 key) view returns (tuple(address token, string assetKey, string symbol, string name, uint8 decimals, string kind, string issuer, string rightsSummary, uint256 referencePriceMicroUsd, string referenceBasis, uint64 referenceAsOf, bool paused, bool delisted, bool enabled))",
  "function instrumentCount() view returns (uint256)",
  "function instrumentKeyAt(uint256) view returns (bytes32)",
  "event InstrumentRegistered(bytes32 indexed key, address indexed token, string assetKey, string symbol)",
  "event ReferencePriceSet(bytes32 indexed key, uint256 priceMicroUsd, string basis, uint64 asOf)",
  "event TradingFlagSet(bytes32 indexed key, bool paused, bool delisted, bool enabled)",
]);
