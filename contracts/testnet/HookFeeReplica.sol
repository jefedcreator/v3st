// SPDX-License-Identifier: MIT
// V3ST beta test fixture: local replica of a BaseStonk-style hook/fee launch
// (Uniswap v4 hook shape) with per-launch FROZEN rules and a current fee recipient.
// All schema/ABI names here are V3ST replica definitions. Unknown hook versions are
// unavailable. No public holder claim API is invented: accrued fees are paid to the
// launch's current fee recipient only.
pragma solidity 0.8.30;

interface IERC20H {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract HookFeeReplica {
    address public owner;

    mapping(bytes32 => bool) public knownHookVersions;

    struct Launch {
        bytes32 hookVersion;
        uint24 feeBps;
        address feeRecipient;
        uint256 pendingFees;
        bool exists;
    }

    mapping(bytes32 => Launch) public launches;
    mapping(bytes32 => address) public feeTokenOf;

    event HookVersionKnown(bytes32 version);
    event LaunchRegistered(bytes32 indexed launchId, bytes32 hookVersion, uint24 feeBps, address feeRecipient);
    event FeeRecipientChanged(bytes32 indexed launchId, address recipient);
    event FeesAccrued(bytes32 indexed launchId, uint256 amount);
    event FeesClaimed(bytes32 indexed launchId, address indexed recipient, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function addHookVersion(bytes32 version) external onlyOwner {
        require(version != bytes32(0), "zero version");
        knownHookVersions[version] = true;
        emit HookVersionKnown(version);
    }

    // Per-launch rules are frozen at registration; only the recipient may change.
    function registerLaunch(bytes32 launchId, bytes32 hookVersion, uint24 feeBps, address feeRecipient, address feeToken)
        external
        onlyOwner
    {
        require(knownHookVersions[hookVersion], "unknown hook version");
        require(!launches[launchId].exists, "launch exists");
        require(feeBps <= 10_000, "bad bps");
        require(feeRecipient != address(0) && feeToken != address(0), "zero address");
        launches[launchId] = Launch({hookVersion: hookVersion, feeBps: feeBps, feeRecipient: feeRecipient, pendingFees: 0, exists: true});
        feeTokenOf[launchId] = feeToken;
        emit LaunchRegistered(launchId, hookVersion, feeBps, feeRecipient);
    }

    function setFeeRecipient(bytes32 launchId, address recipient) external onlyOwner {
        require(launches[launchId].exists, "no launch");
        require(recipient != address(0), "zero recipient");
        launches[launchId].feeRecipient = recipient;
        emit FeeRecipientChanged(launchId, recipient);
    }

    function accrueFees(bytes32 launchId, uint256 amount) external onlyOwner {
        Launch storage l = launches[launchId];
        require(l.exists, "no launch");
        require(IERC20H(feeTokenOf[launchId]).transferFrom(msg.sender, address(this), amount), "fee pull failed");
        l.pendingFees += amount;
        emit FeesAccrued(launchId, amount);
    }

    // Pays the CURRENT fee recipient; only funded pending balances are ever paid.
    function claimFees(bytes32 launchId) external returns (uint256 amount) {
        Launch storage l = launches[launchId];
        require(l.exists, "no launch");
        amount = l.pendingFees;
        require(amount > 0, "no fees");
        l.pendingFees = 0;
        address recipient = l.feeRecipient;
        require(IERC20H(feeTokenOf[launchId]).transfer(recipient, amount), "fee transfer failed");
        emit FeesClaimed(launchId, recipient, amount);
    }

    function pendingFeesOf(bytes32 launchId) external view returns (uint256) {
        return launches[launchId].pendingFees;
    }

    function hookVersionOf(bytes32 launchId) external view returns (bytes32) {
        return launches[launchId].hookVersion;
    }
}
