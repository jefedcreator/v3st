// SPDX-License-Identifier: MIT
// V3ST beta test fixture: local replica of a Hydropump-style launch locker.
// Principal is PERMANENTLY locked (withdraw always reverts); creator fees accrue
// per lock and are claimable by the lock's beneficiary only. This fixture exists
// for provenance/eligibility tests and is never registered as a redeemable
// income strategy. No HYDX acquisition, governance lock or public launch.
pragma solidity 0.8.30;

interface IERC20L {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract HydropumpLockerReplica {
    address public owner;

    struct Lock {
        address settlement;
        address stock;
        uint256 principal;
        address beneficiary;
        uint256 accruedFees;
    }

    Lock[] public locks;

    event Locked(uint256 indexed lockId, address indexed stock, uint256 principal, address indexed beneficiary);
    event FeesFunded(uint256 indexed lockId, uint256 amount);
    event FeesClaimed(uint256 indexed lockId, address indexed beneficiary, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function lock(address settlement, address stock, uint256 principal, address beneficiary)
        external
        onlyOwner
        returns (uint256 lockId)
    {
        require(beneficiary != address(0), "zero beneficiary");
        require(principal > 0, "zero principal");
        require(IERC20L(stock).transferFrom(msg.sender, address(this), principal), "lock pull failed");
        locks.push(Lock({settlement: settlement, stock: stock, principal: principal, beneficiary: beneficiary, accruedFees: 0}));
        lockId = locks.length - 1;
        emit Locked(lockId, stock, principal, beneficiary);
    }

    function fundFees(uint256 lockId, uint256 amount) external onlyOwner {
        Lock storage l = locks[lockId];
        require(IERC20L(l.settlement).transferFrom(msg.sender, address(this), amount), "fee pull failed");
        l.accruedFees += amount;
        emit FeesFunded(lockId, amount);
    }

    function claimFees(uint256 lockId) external returns (uint256 amount) {
        Lock storage l = locks[lockId];
        require(msg.sender == l.beneficiary, "beneficiary only");
        amount = l.accruedFees;
        l.accruedFees = 0;
        require(IERC20L(l.settlement).transfer(msg.sender, amount), "fee transfer failed");
        emit FeesClaimed(lockId, msg.sender, amount);
    }

    function principalLocked(uint256 lockId) external view returns (uint256) {
        return locks[lockId].principal;
    }

    function beneficiaryOf(uint256 lockId) external view returns (address) {
        return locks[lockId].beneficiary;
    }

    // Hydropump principal is permanently locked: any withdrawal attempt reverts.
    function withdraw(uint256) external pure {
        revert("permanently locked");
    }
}
