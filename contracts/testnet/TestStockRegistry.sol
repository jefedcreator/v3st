// SPDX-License-Identifier: MIT
// V3ST beta test fixture: local stock reference registry. Stores instrument identity
// (chain + address asset key), rights summaries, reference price/basis/as-of and
// paused/delisted flags. Reference NAV is an indication, never an executable bid.
pragma solidity 0.8.30;

contract TestStockRegistry {
    struct Instrument {
        address token;
        string assetKey;
        string symbol;
        string name;
        uint8 decimals;
        string kind;
        string issuer;
        string rightsSummary;
        uint256 referencePriceMicroUsd;
        string referenceBasis;
        uint64 referenceAsOf;
        bool paused;
        bool delisted;
        bool enabled;
    }

    address public owner;
    mapping(bytes32 => Instrument) private instruments;
    bytes32[] public instrumentKeys;

    event InstrumentRegistered(bytes32 indexed key, address indexed token, string assetKey, string symbol);
    event ReferencePriceSet(bytes32 indexed key, uint256 priceMicroUsd, string basis, uint64 asOf);
    event TradingFlagSet(bytes32 indexed key, bool paused, bool delisted, bool enabled);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function registerInstrument(
        address token,
        string calldata assetKey,
        string calldata symbol,
        string calldata name,
        uint8 decimals,
        string calldata kind,
        string calldata issuer,
        string calldata rightsSummary
    ) external onlyOwner returns (bytes32 key) {
        require(token != address(0), "zero token");
        key = keccak256(bytes(assetKey));
        require(instruments[key].token == address(0), "already registered");
        Instrument storage inst = instruments[key];
        inst.token = token;
        inst.assetKey = assetKey;
        inst.symbol = symbol;
        inst.name = name;
        inst.decimals = decimals;
        inst.kind = kind;
        inst.issuer = issuer;
        inst.rightsSummary = rightsSummary;
        inst.referencePriceMicroUsd = 0;
        inst.referenceBasis = "";
        inst.referenceAsOf = 0;
        inst.paused = false;
        inst.delisted = false;
        inst.enabled = true;
        instrumentKeys.push(key);
        emit InstrumentRegistered(key, token, assetKey, symbol);
    }

    function setReferencePrice(bytes32 key, uint256 priceMicroUsd, string calldata basis, uint64 asOf) external onlyOwner {
        require(instruments[key].token != address(0), "unknown instrument");
        instruments[key].referencePriceMicroUsd = priceMicroUsd;
        instruments[key].referenceBasis = basis;
        instruments[key].referenceAsOf = asOf;
        emit ReferencePriceSet(key, priceMicroUsd, basis, asOf);
    }

    function setTradingFlags(bytes32 key, bool paused, bool delisted, bool enabled) external onlyOwner {
        require(instruments[key].token != address(0), "unknown instrument");
        instruments[key].paused = paused;
        instruments[key].delisted = delisted;
        instruments[key].enabled = enabled;
        emit TradingFlagSet(key, paused, delisted, enabled);
    }

    function getInstrument(bytes32 key) external view returns (Instrument memory) {
        return instruments[key];
    }

    function instrumentCount() external view returns (uint256) {
        return instrumentKeys.length;
    }

    function instrumentKeyAt(uint256 i) external view returns (bytes32) {
        return instrumentKeys[i];
    }
}
