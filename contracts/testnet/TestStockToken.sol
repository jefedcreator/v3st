// SPDX-License-Identifier: MIT
// V3ST beta test fixture: 18-decimal stock-like token with a B20-behavior corporate
// action mock (WAD multiplier, scheduled effective times, cancellation). This is NOT
// the native Base B20 precompile; verification for native assets needs registry
// evidence and semantic probes instead of a getCode check.
pragma solidity 0.8.30;

contract TestStockToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    address public owner;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 public multiplierWad = 1e18;

    struct CorporateAction {
        uint256 fromWad;
        uint256 toWad;
        uint64 effectiveAt;
        bool cancelled;
        bool applied;
    }

    CorporateAction[] public actions;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MultiplierScheduled(uint256 indexed actionId, uint256 fromWad, uint256 toWad, uint64 effectiveAt);
    event ActionCancelled(uint256 indexed actionId);
    event MultiplierApplied(uint256 indexed actionId, uint256 newWad);

    constructor(string memory name_, string memory symbol_, uint256 initialSupply) {
        name = name_;
        symbol = symbol_;
        owner = msg.sender;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function scheduleMultiplier(uint256 toWad, uint64 effectiveAt) external onlyOwner returns (uint256 actionId) {
        require(toWad > 0, "zero multiplier");
        actionId = actions.length;
        actions.push(CorporateAction({
            fromWad: multiplierWad,
            toWad: toWad,
            effectiveAt: effectiveAt,
            cancelled: false,
            applied: false
        }));
        emit MultiplierScheduled(actionId, multiplierWad, toWad, effectiveAt);
    }

    function cancelAction(uint256 actionId) external onlyOwner {
        require(actionId < actions.length, "unknown action");
        require(!actions[actionId].applied, "already applied");
        actions[actionId].cancelled = true;
        emit ActionCancelled(actionId);
    }

    // Applies every non-cancelled action whose effective time has passed, in order.
    // Raw token balances are never rewritten: only the display/conversion multiplier moves.
    function applyDueActions() external {
        for (uint256 i = 0; i < actions.length; i++) {
            CorporateAction storage a = actions[i];
            if (a.applied || a.cancelled) continue;
            if (block.timestamp >= a.effectiveAt) {
                multiplierWad = a.toWad;
                a.applied = true;
                emit MultiplierApplied(i, a.toWad);
            }
        }
    }

    function effectiveMultiplierAt(uint64 t) public view returns (uint256) {
        uint256 wad = 1e18;
        for (uint256 i = 0; i < actions.length; i++) {
            CorporateAction storage a = actions[i];
            if (!a.cancelled && a.effectiveAt <= t) {
                wad = a.toWad;
            }
        }
        return wad;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
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
