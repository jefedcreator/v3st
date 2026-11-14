// SPDX-License-Identifier: MIT
// V3ST beta test fixture: local replica of a chain-backed stock-reward distribution
// contract (Stonks/Feel-style holder distributions). Distribution epochs carry a
// snapshot of entitled holders (set by the fixture owner at epoch creation), a
// preserved reward asset, per-epoch funding from the local fixture treasury and a
// claimed bitmap. Labelled replica; not a verified provider contract.
pragma solidity 0.8.30;

interface IERC20D {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract StockDistributionReplica {
    address public owner;
    // Stonks-style version marker: legacy vs newer contract generations must not mix.
    uint8 public currentGeneration;

    struct Epoch {
        address rewardToken;
        uint256 funded;
        uint256 claimed;
        uint8 generation;
        bool exists;
    }

    mapping(bytes32 => Epoch) public epochs;
    mapping(bytes32 => mapping(address => uint256)) public entitlementOf;
    mapping(bytes32 => mapping(uint256 => uint256)) private claimedWords;

    event EpochCreated(bytes32 indexed epochKey, address indexed rewardToken, uint8 generation);
    event EntitlementSet(bytes32 indexed epochKey, address indexed account, uint256 amount);
    event Funded(bytes32 indexed epochKey, uint256 amount);
    event Claimed(bytes32 indexed epochKey, address indexed account, uint256 amount);
    event GenerationBumped(uint8 newGeneration);

    constructor() {
        owner = msg.sender;
        currentGeneration = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function bumpGeneration(uint8 newGeneration) external onlyOwner {
        require(newGeneration > 0, "bad generation");
        currentGeneration = newGeneration;
        emit GenerationBumped(newGeneration);
    }

    function createEpoch(bytes32 epochKey, address rewardToken, uint8 generation) external onlyOwner {
        require(!epochs[epochKey].exists, "epoch exists");
        require(rewardToken != address(0), "zero reward token");
        epochs[epochKey] = Epoch({rewardToken: rewardToken, funded: 0, claimed: 0, generation: generation, exists: true});
        emit EpochCreated(epochKey, rewardToken, generation);
    }

    // Snapshot step: entitlements are fixed here; later balance changes do not
    // alter them.
    function setEntitlement(bytes32 epochKey, address account, uint256 amount) external onlyOwner {
        require(epochs[epochKey].exists, "no epoch");
        require(account != address(0), "zero account");
        entitlementOf[epochKey][account] = amount;
        emit EntitlementSet(epochKey, account, amount);
    }

    function fundEpoch(bytes32 epochKey, uint256 amount) external onlyOwner {
        Epoch storage e = epochs[epochKey];
        require(e.exists, "no epoch");
        require(IERC20D(e.rewardToken).transferFrom(msg.sender, address(this), amount), "fund pull failed");
        e.funded += amount;
        emit Funded(epochKey, amount);
    }

    function _wordIndex(address account) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(account))) / 256;
    }

    function _bit(address account) internal pure returns (uint256) {
        return uint256(1) << (uint256(keccak256(abi.encode(account))) % 256);
    }

    function hasClaimed(bytes32 epochKey, address account) public view returns (bool) {
        return (claimedWords[epochKey][_wordIndex(account)] & _bit(account)) != 0;
    }

    function claim(bytes32 epochKey) external returns (uint256 amount) {
        Epoch storage e = epochs[epochKey];
        require(e.exists, "no epoch");
        require(!hasClaimed(epochKey, msg.sender), "already claimed");
        amount = entitlementOf[epochKey][msg.sender];
        require(amount > 0, "no entitlement");
        require(e.funded - e.claimed >= amount, "unfunded");
        claimedWords[epochKey][_wordIndex(msg.sender)] |= _bit(msg.sender);
        e.claimed += amount;
        require(IERC20D(e.rewardToken).transfer(msg.sender, amount), "claim transfer failed");
        emit Claimed(epochKey, msg.sender, amount);
    }

    function rewardTokenOf(bytes32 epochKey) external view returns (address) {
        return epochs[epochKey].rewardToken;
    }

    function generationOf(bytes32 epochKey) external view returns (uint8) {
        return epochs[epochKey].generation;
    }

    function fundedOf(bytes32 epochKey) external view returns (uint256) {
        return epochs[epochKey].funded;
    }

    function claimedTotalOf(bytes32 epochKey) external view returns (uint256) {
        return epochs[epochKey].claimed;
    }
}
