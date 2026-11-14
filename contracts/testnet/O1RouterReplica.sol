// SPDX-License-Identifier: MIT
// V3ST beta test fixture: local replica of an aggregator-style exact-input router
// (o1 Exchange shape). Deterministic reserves, a fixture fee in bps, deadline and
// minimum-output enforcement, plus a deterministic partial-fill fixture. This is NOT
// o1's deployed router; the actual provider adapter stays disabled until verified.
pragma solidity 0.8.30;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract O1RouterReplica {
    address public owner;
    uint24 public constant FEE_BPS = 50;
    uint256 public partialFillBps = 10_000;

    struct Pool {
        address settlement;
        address stock;
        uint256 reserveSettlement;
        uint256 reserveStock;
    }

    mapping(bytes32 => Pool) public pools;

    event PoolSeeded(bytes32 indexed pairKey, address indexed settlement, address indexed stock, uint256 settlementAmount, uint256 stockAmount);
    event SwapExecuted(
        address indexed sender,
        bytes32 indexed pairKey,
        uint256 amountIn,
        uint256 fee,
        uint256 amountOut,
        address indexed recipient
    );

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function pairKeyOf(address a, address b) public pure returns (bytes32) {
        (address x, address y) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encodePacked(x, y));
    }

    function seedPool(address settlement, address stock, uint256 settlementAmount, uint256 stockAmount) external onlyOwner {
        bytes32 key = pairKeyOf(settlement, stock);
        require(pools[key].settlement == address(0), "pool exists");
        pools[key] = Pool({
            settlement: settlement,
            stock: stock,
            reserveSettlement: settlementAmount,
            reserveStock: stockAmount
        });
        require(IERC20(settlement).transferFrom(msg.sender, address(this), settlementAmount), "seed settlement failed");
        require(IERC20(stock).transferFrom(msg.sender, address(this), stockAmount), "seed stock failed");
        emit PoolSeeded(key, settlement, stock, settlementAmount, stockAmount);
    }

    function setPartialFillBps(uint256 bps) external onlyOwner {
        require(bps > 0 && bps <= 10_000, "bad bps");
        partialFillBps = bps;
    }

    // Constant-product quote on the net (post-fee) input, floored.
    function quoteOut(bytes32 key, uint256 amountInNet, bool settlementIn) public view returns (uint256) {
        Pool storage pool = pools[key];
        uint256 reserveIn = settlementIn ? pool.reserveSettlement : pool.reserveStock;
        uint256 reserveOut = settlementIn ? pool.reserveStock : pool.reserveSettlement;
        if (reserveIn == 0 || reserveOut == 0) return 0;
        return (amountInNet * reserveOut) / (reserveIn + amountInNet);
    }

    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address recipient,
        uint64 deadline,
        bool allowPartialFill
    ) external returns (uint256 amountOut, uint256 amountInUsed) {
        require(block.timestamp <= deadline, "deadline exceeded");
        require(amountIn > 0, "zero in");
        require(recipient != address(0), "zero recipient");
        bytes32 key = pairKeyOf(tokenIn, tokenOut);
        Pool storage pool = pools[key];
        require(pool.settlement != address(0), "no pool");
        bool settlementIn = tokenIn == pool.settlement;
        require(settlementIn || tokenIn == pool.stock, "unknown pair asset");
        require(tokenOut == (settlementIn ? pool.stock : pool.settlement), "bad tokenOut");
        // Input-side partial fill: only the filled portion is pulled from the sender.
        uint256 fillIn = amountIn;
        if (partialFillBps < 10_000) {
            fillIn = (amountIn * partialFillBps) / 10_000;
            if (fillIn < amountIn && !allowPartialFill) {
                revert("MIN_OUTPUT_BREACH");
            }
        }
        require(fillIn > 0, "zero in");
        uint256 fee = (fillIn * FEE_BPS) / 10_000;
        uint256 net = fillIn - fee;
        amountOut = quoteOut(key, net, settlementIn);
        // Pro-rata minimum output for the filled portion, rounded up.
        uint256 requiredOut = (minOut * fillIn + amountIn - 1) / amountIn;
        require(amountOut >= requiredOut, "insufficient output");
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), fillIn), "pull in failed");
        if (settlementIn) {
            pool.reserveSettlement += fillIn;
            pool.reserveStock -= amountOut;
        } else {
            pool.reserveStock += fillIn;
            pool.reserveSettlement -= amountOut;
        }
        require(IERC20(tokenOut).transfer(recipient, amountOut), "push out failed");
        emit SwapExecuted(msg.sender, key, fillIn, fee, amountOut, recipient);
        return (amountOut, fillIn);
    }
}
