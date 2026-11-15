// SPDX-License-Identifier: MIT
// V3ST beta test fixture: six-decimal settlement token (USDC-like) on the local
// isolated Anvil testnet. Minting is restricted to the deployer (test relayer).
// This is a labelled local replica, not a verified provider or issuer contract.
pragma solidity 0.8.30;

contract TestSettlementToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    address public owner;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    // Test-only managed transfer rail, modelling the beta wallet provider. The
    // application validates its bounded persisted transfer before the relayer
    // signs. Replaying a rail operation cannot move test funds twice.
    mapping(bytes32 => bytes32) public railOperations;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero to");
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function managedTransfer(bytes32 operationId, address from, address to, uint256 amount) external onlyOwner {
        bytes32 payload = keccak256(abi.encode(from, to, amount));
        if (railOperations[operationId] != bytes32(0)) {
            require(railOperations[operationId] == payload, "operation payload changed");
            return;
        }
        railOperations[operationId] = payload;
        _transfer(from, to, amount);
    }

    function managedMint(bytes32 operationId, address to, uint256 amount) external onlyOwner {
        bytes32 payload = keccak256(abi.encode(address(0), to, amount));
        if (railOperations[operationId] != bytes32(0)) {
            require(railOperations[operationId] == payload, "operation payload changed");
            return;
        }
        railOperations[operationId] = payload;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "zero to");
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
