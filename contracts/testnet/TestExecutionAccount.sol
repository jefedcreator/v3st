// SPDX-License-Identifier: MIT
// V3ST beta test harness: per-customer test execution account. The restricted test
// relayer signs and pays gas; the account enforces operation nonce sequencing,
// deadline, authorization epoch and pre-approved call hashes. This is test
// scaffolding, not an audited Privy/ERC-4337 implementation.
pragma solidity 0.8.30;

contract TestExecutionAccount {
    struct Call {
        address target;
        bytes data;
        uint256 value;
    }

    address public owner;
    address public relayer;
    uint256 public nonce;
    uint64 public authorizationEpoch;
    mapping(bytes32 => bool) public approvedCalls;

    event CallApproved(bytes32 indexed callId);
    event Executed(bytes32 indexed operationId, uint256 indexed opNonce, bytes32 indexed callId, address target, uint256 value);
    event OperationExecuted(bytes32 indexed operationId, uint256 indexed opNonce, uint256 calls);
    event RelayerChanged(address indexed previous, address indexed next);
    event AuthorizationEpochBumped(uint64 newEpoch);

    constructor(address owner_, address relayer_) payable {
        require(owner_ != address(0) && relayer_ != address(0), "zero address");
        owner = owner_;
        relayer = relayer_;
    }

    receive() external payable {}

    modifier onlyRelayer() {
        require(msg.sender == relayer, "not relayer");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "zero relayer");
        emit RelayerChanged(relayer, newRelayer);
        relayer = newRelayer;
    }

    function bumpAuthorizationEpoch() external onlyOwner {
        authorizationEpoch += 1;
        emit AuthorizationEpochBumped(authorizationEpoch);
    }

    function callIdOf(bytes32 operationId, Call calldata call) public pure returns (bytes32) {
        return keccak256(abi.encode(operationId, call.target, keccak256(call.data), call.value));
    }

    function approveCalls(bytes32[] calldata callIds) external onlyRelayer {
        for (uint256 i = 0; i < callIds.length; i++) {
            approvedCalls[callIds[i]] = true;
            emit CallApproved(callIds[i]);
        }
    }

    function executeBatch(
        bytes32 operationId,
        uint256 opNonce,
        uint64 deadline,
        uint64 authEpoch,
        Call[] calldata calls
    ) external onlyRelayer {
        require(block.timestamp <= deadline, "deadline exceeded");
        require(opNonce == nonce + 1, "bad nonce");
        require(authEpoch == authorizationEpoch, "authorization epoch mismatch");
        nonce = opNonce;
        for (uint256 i = 0; i < calls.length; i++) {
            Call calldata call = calls[i];
            bytes32 callId = callIdOf(operationId, call);
            require(approvedCalls[callId], "call not approved");
            (bool ok, bytes memory ret) = call.target.call{value: call.value}(call.data);
            require(ok, _revertReason(ret));
            emit Executed(operationId, opNonce, callId, call.target, call.value);
        }
        emit OperationExecuted(operationId, opNonce, calls.length);
    }

    function _revertReason(bytes memory ret) internal pure returns (string memory) {
        if (ret.length == 0) return "call reverted";
        return "call reverted";
    }
}
