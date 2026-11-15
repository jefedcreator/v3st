// SPDX-License-Identifier: MIT
// V3ST beta test fixture: local replica of a two-asset (settlement/stock) Hydrex-style
// liquidity pool. Deterministic constant-product reserves, a fixture trading fee in
// bps accrued to a per-share accumulator (manual, separately claimed fees), pro-rata
// LP shares with deposit/withdraw, a funded stock reward reserve with a conversion fee
// (rewards are NOT automatically USDC), and a deterministic loss fixture for exits.
// This is NOT a full Algebra/Hydrex implementation; recorded assumptions only.
pragma solidity 0.8.30;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract HydrexPoolReplica {
    address public owner;
    uint24 public constant FEE_BPS = 30;
    uint24 public constant REWARD_CONVERSION_FEE_BPS = 100; // 1% cost converting stock rewards to settlement
    // Fixed fixture conversion rate: 1 whole stock (1e18 raw) = 2 settlement (2e6 raw).
    uint256 public constant REWARD_RATE_NUM = 2_000_000;
    uint256 public constant REWARD_RATE_DEN = 10 ** 18;
    uint256 private constant ACC_SCALE = 10 ** 18;

    address public settlement;
    address public stock;

    uint256 public reserveSettlement;
    uint256 public reserveStock;
    // Fee backing balances (pulled in, not part of swap reserves) and per-share accumulators.
    uint256 public feeReserveSettlement;
    uint256 public feeReserveStock;
    uint256 public accFeePerShareSettlement;
    uint256 public accFeePerShareStock;
    // Funded stock rewards and the settlement sink that pays for conversions.
    uint256 public rewardReserveStock;
    uint256 public accRewardPerShare;
    uint256 public conversionSink;

    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(address => uint256) public feeDebtSettlement;
    mapping(address => uint256) public feeDebtStock;
    mapping(address => uint256) public rewardDebt;
    // Buckets hold accrued-but-unclaimed amounts so they survive a share burn on
    // withdraw (principal and fees stay separate until an explicit claim).
    mapping(address => uint256) public pendingFeeSettlement;
    mapping(address => uint256) public pendingFeeStock;
    mapping(address => uint256) public pendingRewardStock;

    event PoolSeeded(address indexed settlement, address indexed stock, uint256 settlementAmount, uint256 stockAmount);
    event Deposited(address indexed account, uint256 shares, uint256 settlementAmount, uint256 stockAmount);
    event SwapExecuted(address indexed sender, uint256 amountIn, uint256 fee, uint256 amountOut, address indexed recipient, bool settlementIn);
    event FeeClaimed(address indexed account, uint256 settlementOut, uint256 stockOut);
    event Withdrawn(address indexed account, uint256 shares, uint256 settlementOut, uint256 stockOut);
    event RewardsClaimed(address indexed account, uint256 stockOut);
    event RewardsConverted(address indexed account, uint256 stockIn, uint256 settlementOut, uint256 conversionFee);
    event LossApplied(uint256 bps, uint256 stockReserveBefore, uint256 stockReserveAfter);

    constructor(address settlement_, address stock_) {
        require(settlement_ != address(0) && stock_ != address(0), "zero asset");
        settlement = settlement_;
        stock = stock_;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function seed(uint256 settlementAmount, uint256 stockAmount) external onlyOwner {
        require(reserveSettlement == 0 && reserveStock == 0, "already seeded");
        require(IERC20(settlement).transferFrom(msg.sender, address(this), settlementAmount), "seed settlement failed");
        require(IERC20(stock).transferFrom(msg.sender, address(this), stockAmount), "seed stock failed");
        reserveSettlement = settlementAmount;
        reserveStock = stockAmount;
        emit PoolSeeded(settlement, stock, settlementAmount, stockAmount);
    }

    function quoteOut(uint256 amountInNet, bool settlementIn) public view returns (uint256) {
        uint256 reserveIn = settlementIn ? reserveSettlement : reserveStock;
        uint256 reserveOut = settlementIn ? reserveStock : reserveSettlement;
        if (reserveIn == 0 || reserveOut == 0) return 0;
        return (amountInNet * reserveOut) / (reserveIn + amountInNet);
    }

    function _accrueFees(address asset, uint256 fee) internal {
        if (totalShares == 0) return;
        if (asset == settlement) {
            feeReserveSettlement += fee;
            accFeePerShareSettlement += (fee * ACC_SCALE) / totalShares;
        } else {
            feeReserveStock += fee;
            accFeePerShareStock += (fee * ACC_SCALE) / totalShares;
        }
    }

    // Accrues the account's live per-share fees/rewards into its pending bucket
    // without paying out; claims pay from the bucket, bounded by the funded reserves.
    function _accrueFees(address account) internal {
        uint256 shares = sharesOf[account];
        uint256 pendingS = shares > 0 ? (shares * accFeePerShareSettlement) / ACC_SCALE - feeDebtSettlement[account] : 0;
        uint256 pendingK = shares > 0 ? (shares * accFeePerShareStock) / ACC_SCALE - feeDebtStock[account] : 0;
        pendingFeeSettlement[account] += pendingS;
        pendingFeeStock[account] += pendingK;
        feeDebtSettlement[account] = (shares * accFeePerShareSettlement) / ACC_SCALE;
        feeDebtStock[account] = (shares * accFeePerShareStock) / ACC_SCALE;
    }

    function _accrueRewards(address account) internal {
        uint256 shares = sharesOf[account];
        uint256 pending = shares > 0 ? (shares * accRewardPerShare) / ACC_SCALE - rewardDebt[account] : 0;
        pendingRewardStock[account] += pending;
        rewardDebt[account] = (shares * accRewardPerShare) / ACC_SCALE;
    }

    function deposit(uint256 settlementAmount, uint256 stockAmount, uint256 minShares, address recipient)
        external
        returns (uint256 shares)
    {
        require(recipient != address(0), "zero recipient");
        _accrueFees(recipient);
        _accrueRewards(recipient);
        if (totalShares == 0) {
            shares = settlementAmount;
        } else {
            uint256 bySettlement = (settlementAmount * totalShares) / reserveSettlement;
            uint256 byStock = (stockAmount * totalShares) / reserveStock;
            shares = bySettlement < byStock ? bySettlement : byStock;
        }
        require(shares >= minShares && shares > 0, "insufficient shares");
        require(IERC20(settlement).transferFrom(msg.sender, address(this), settlementAmount), "pull settlement failed");
        require(IERC20(stock).transferFrom(msg.sender, address(this), stockAmount), "pull stock failed");
        reserveSettlement += settlementAmount;
        reserveStock += stockAmount;
        totalShares += shares;
        sharesOf[recipient] += shares;
        feeDebtSettlement[recipient] = (sharesOf[recipient] * accFeePerShareSettlement) / ACC_SCALE;
        feeDebtStock[recipient] = (sharesOf[recipient] * accFeePerShareStock) / ACC_SCALE;
        rewardDebt[recipient] = (sharesOf[recipient] * accRewardPerShare) / ACC_SCALE;
        emit Deposited(recipient, shares, settlementAmount, stockAmount);
    }

    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address recipient,
        uint64 deadline
    ) external returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "deadline exceeded");
        require(amountIn > 0, "zero in");
        require(recipient != address(0), "zero recipient");
        bool settlementIn = tokenIn == settlement;
        require(settlementIn || tokenIn == stock, "unknown asset");
        require(tokenOut == (settlementIn ? stock : settlement), "bad tokenOut");
        uint256 fee = (amountIn * FEE_BPS) / 10_000;
        uint256 net = amountIn - fee;
        amountOut = quoteOut(net, settlementIn);
        require(amountOut >= minOut, "insufficient output");
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pull in failed");
        if (settlementIn) {
            reserveSettlement += net;
            reserveStock -= amountOut;
            require(IERC20(stock).transfer(recipient, amountOut), "pay out failed");
        } else {
            reserveStock += net;
            reserveSettlement -= amountOut;
            require(IERC20(settlement).transfer(recipient, amountOut), "pay out failed");
        }
        _accrueFees(tokenIn, fee);
        emit SwapExecuted(msg.sender, amountIn, fee, amountOut, recipient, settlementIn);
    }

    function claimFees(address account) external returns (uint256 settlementOut, uint256 stockOut) {
        _accrueFees(account);
        settlementOut = pendingFeeSettlement[account];
        stockOut = pendingFeeStock[account];
        require(
            sharesOf[account] > 0 || settlementOut > 0 || stockOut > 0,
            "not an LP"
        );
        pendingFeeSettlement[account] = 0;
        pendingFeeStock[account] = 0;
        if (settlementOut > 0) {
            require(feeReserveSettlement >= settlementOut, "fee reserve exceeded");
            feeReserveSettlement -= settlementOut;
            require(IERC20(settlement).transfer(account, settlementOut), "fee transfer failed");
        }
        if (stockOut > 0) {
            require(feeReserveStock >= stockOut, "fee reserve exceeded");
            feeReserveStock -= stockOut;
            require(IERC20(stock).transfer(account, stockOut), "fee transfer failed");
        }
        emit FeeClaimed(account, settlementOut, stockOut);
    }

    function claimableFees(address account) external view returns (uint256 settlementOut, uint256 stockOut) {
        uint256 shares = sharesOf[account];
        settlementOut =
            pendingFeeSettlement[account] +
            (shares > 0 ? (shares * accFeePerShareSettlement) / ACC_SCALE - feeDebtSettlement[account] : 0);
        stockOut =
            pendingFeeStock[account] +
            (shares > 0 ? (shares * accFeePerShareStock) / ACC_SCALE - feeDebtStock[account] : 0);
    }

    function claimRewards(address account) external returns (uint256 stockOut) {
        _accrueRewards(account);
        stockOut = pendingRewardStock[account];
        require(sharesOf[account] > 0 || stockOut > 0, "not an LP");
        pendingRewardStock[account] = 0;
        if (stockOut > 0) {
            require(rewardReserveStock >= stockOut, "reward reserve exceeded");
            rewardReserveStock -= stockOut;
            require(IERC20(stock).transfer(account, stockOut), "reward transfer failed");
        }
        emit RewardsClaimed(account, stockOut);
    }

    // Converts the account's pending stock rewards to settlement at the fixture rate,
    // minus the conversion fee. Only funded sink balances are ever paid out.
    function claimRewardsAsSettlement(address account) external returns (uint256 settlementOut, uint256 conversionFee) {
        _accrueRewards(account);
        uint256 stockIn = pendingRewardStock[account];
        require(sharesOf[account] > 0 || stockIn > 0, "not an LP");
        pendingRewardStock[account] = 0;
        if (stockIn > 0) {
            require(rewardReserveStock >= stockIn, "reward reserve exceeded");
            rewardReserveStock -= stockIn;
        }
        uint256 gross = (stockIn * REWARD_RATE_NUM) / REWARD_RATE_DEN;
        conversionFee = (gross * REWARD_CONVERSION_FEE_BPS) / 10_000;
        settlementOut = gross - conversionFee;
        if (settlementOut > 0) {
            require(conversionSink >= settlementOut, "conversion sink unfunded");
            conversionSink -= settlementOut;
            require(IERC20(settlement).transfer(account, settlementOut), "conversion transfer failed");
        }
        emit RewardsConverted(account, stockIn, settlementOut, conversionFee);
    }

    function claimableRewards(address account) external view returns (uint256 stockOut) {
        uint256 shares = sharesOf[account];
        stockOut =
            pendingRewardStock[account] +
            (shares > 0 ? (shares * accRewardPerShare) / ACC_SCALE - rewardDebt[account] : 0);
    }

    function _withdraw(address account, uint256 shares, uint256 minSettlement, uint256 minStock, address recipient)
        internal
        returns (uint256 settlementOut, uint256 stockOut)
    {
        require(sharesOf[account] >= shares && shares > 0, "insufficient shares");
        require(recipient != address(0), "zero recipient");
        // Accrue into pending buckets only: principal and fees stay separate.
        _accrueFees(account);
        _accrueRewards(account);
        settlementOut = (shares * reserveSettlement) / totalShares;
        stockOut = (shares * reserveStock) / totalShares;
        require(settlementOut >= minSettlement && stockOut >= minStock, "insufficient output");
        totalShares -= shares;
        sharesOf[account] -= shares;
        reserveSettlement -= settlementOut;
        reserveStock -= stockOut;
        feeDebtSettlement[account] = (sharesOf[account] * accFeePerShareSettlement) / ACC_SCALE;
        feeDebtStock[account] = (sharesOf[account] * accFeePerShareStock) / ACC_SCALE;
        rewardDebt[account] = (sharesOf[account] * accRewardPerShare) / ACC_SCALE;
        require(IERC20(settlement).transfer(recipient, settlementOut), "pay settlement failed");
        require(IERC20(stock).transfer(recipient, stockOut), "pay stock failed");
        emit Withdrawn(account, shares, settlementOut, stockOut);
    }

    function _payRewards(address account, address recipient) internal {
        uint256 stockOut = pendingRewardStock[account];
        if (stockOut > 0) {
            pendingRewardStock[account] = 0;
            require(rewardReserveStock >= stockOut, "reward reserve exceeded");
            rewardReserveStock -= stockOut;
            require(IERC20(stock).transfer(recipient, stockOut), "reward transfer failed");
            emit RewardsClaimed(recipient, stockOut);
        }
    }

    function withdraw(uint256 shares, uint256 minSettlement, uint256 minStock, address recipient)
        external
        returns (uint256 settlementOut, uint256 stockOut)
    {
        (settlementOut, stockOut) = _withdraw(msg.sender, shares, minSettlement, minStock, recipient);
    }

    // Exit-realized variant: principal plus all pending fees and stock rewards in one call.
    function withdrawAndClaim(uint256 shares, uint256 minSettlement, uint256 minStock, address recipient)
        external
        returns (uint256 settlementOut, uint256 stockOut)
    {
        (settlementOut, stockOut) = _withdraw(msg.sender, shares, minSettlement, minStock, recipient);
        // Exit-realized: fees and rewards are paid together with principal.
        _accrueFees(msg.sender);
        uint256 feeS = pendingFeeSettlement[msg.sender];
        uint256 feeK = pendingFeeStock[msg.sender];
        pendingFeeSettlement[msg.sender] = 0;
        pendingFeeStock[msg.sender] = 0;
        if (feeS > 0) {
            require(feeReserveSettlement >= feeS, "fee reserve exceeded");
            feeReserveSettlement -= feeS;
            require(IERC20(settlement).transfer(recipient, feeS), "fee transfer failed");
        }
        if (feeK > 0) {
            require(feeReserveStock >= feeK, "fee reserve exceeded");
            feeReserveStock -= feeK;
            require(IERC20(stock).transfer(recipient, feeK), "fee transfer failed");
        }
        emit FeeClaimed(recipient, feeS, feeK);
        _accrueRewards(msg.sender);
        _payRewards(msg.sender, recipient);
    }

    // Deterministic loss fixture: burns a fraction of the stock reserve so exits
    // can return less value than entry while fees stay separately claimable.
    function applyLoss(uint256 bps) external onlyOwner {
        require(bps <= 10_000, "bad bps");
        uint256 before = reserveStock;
        reserveStock = (reserveStock * (10_000 - bps)) / 10_000;
        emit LossApplied(bps, before, reserveStock);
    }

    function fundRewards(uint256 stockAmount) external onlyOwner {
        require(IERC20(stock).transferFrom(msg.sender, address(this), stockAmount), "pull rewards failed");
        rewardReserveStock += stockAmount;
        if (totalShares > 0) {
            accRewardPerShare += (stockAmount * ACC_SCALE) / totalShares;
        }
    }

    function fundConversionSink(uint256 settlementAmount) external onlyOwner {
        require(IERC20(settlement).transferFrom(msg.sender, address(this), settlementAmount), "pull sink failed");
        conversionSink += settlementAmount;
    }
}
