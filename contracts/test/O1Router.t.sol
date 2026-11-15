// SPDX-License-Identifier: MIT
// Behavioral tests for the local o1-style router replica: fee math, min-out
// enforcement, deadline and the deterministic partial-fill fixture.
pragma solidity 0.8.30;

import {Cheats} from "./Cheats.sol";
import {TestBase} from "./TestBase.sol";
import {O1RouterReplica} from "../testnet/O1RouterReplica.sol";
import {TestSettlementToken} from "../testnet/TestSettlementToken.sol";
import {TestStockToken} from "../testnet/TestStockToken.sol";

contract O1RouterTest is TestBase, Cheats {
    O1RouterReplica router;
    TestSettlementToken usdc;
    TestStockToken stock;
    address buyer = address(0xB0B);

    function setUp() public {
        router = new O1RouterReplica();
        usdc = new TestSettlementToken("V3ST Test USDC", "tUSDC", 6);
        stock = new TestStockToken("Test Stock A", "TSTA", 1_000_000e18);
        usdc.mint(address(this), 1_000_000_000_000);
        stock.transfer(address(this), 500_000e18);
        usdc.approve(address(router), type(uint256).max);
        stock.approve(address(router), type(uint256).max);
        router.seedPool(address(usdc), address(stock), 1_000_000_000_000, 500_000e18);
        usdc.mint(buyer, 10_000_000);
        vm.prank(buyer);
        usdc.approve(address(router), type(uint256).max);
    }

    function test_feeIs50bpsAndMinOutFromNet() public {
        // 10,000,000 input with 50-bps fixture fee reports 50,000 fee.
        uint256 amountIn = 10_000_000;
        uint256 fee = (amountIn * 50) / 10_000;
        assertEqU(fee, 50_000);
        uint256 net = amountIn - fee;
        bytes32 key = router.pairKeyOf(address(usdc), address(stock));
        uint256 expected = router.quoteOut(key, net, true);
        vm.prank(buyer);
        (uint256 out, uint256 used) = router.swapExactIn(address(usdc), address(stock), amountIn, expected, buyer, uint64(block.timestamp + 60), false);
        assertEqU(out, expected);
        assertEqU(used, amountIn);
        assertTrue(out > 0, "positive output");
    }

    function test_revertsBelowMinOut() public {
        bytes32 key = router.pairKeyOf(address(usdc), address(stock));
        uint256 expected = router.quoteOut(key, 10_000_000 - 50_000, true);
        vm.prank(buyer);
        vm.expectRevert("insufficient output");
        router.swapExactIn(address(usdc), address(stock), 10_000_000, expected + 1, buyer, uint64(block.timestamp + 60), false);
    }

    function test_partialFillPullsOnlyFilledInputWithProRataMin() public {
        router.setPartialFillBps(5_000); // deterministic 50% fill
        bytes32 key = router.pairKeyOf(address(usdc), address(stock));
        // Only the filled portion is pulled; the fee is charged on it.
        uint256 fillIn = (10_000_000 * 5_000) / 10_000;
        uint256 expectedOut = router.quoteOut(key, fillIn - (fillIn * 50) / 10_000, true);
        uint256 full = router.quoteOut(key, 10_000_000 - 50_000, true);
        // Pro-rata minimum: ceil(minOut * fillIn / amountIn), rounded up.
        uint256 proRataMin = (full * fillIn + 10_000_000 - 1) / 10_000_000;
        vm.prank(buyer);
        (uint256 out, uint256 used) = router.swapExactIn(address(usdc), address(stock), 10_000_000, proRataMin, buyer, uint64(block.timestamp + 60), true);
        assertEqU(out, expectedOut);
        assertEqU(used, fillIn);
        assertTrue(out >= proRataMin, "pro-rata minimum met");
        // The sender was charged only the filled portion.
        assertEqU(usdc.balanceOf(buyer), 10_000_000 - fillIn);
    }

    function test_partialFillWithoutConsentRevertsMinOutputBreach() public {
        router.setPartialFillBps(5_000);
        vm.prank(buyer);
        vm.expectRevert("MIN_OUTPUT_BREACH");
        router.swapExactIn(address(usdc), address(stock), 10_000_000, 0, buyer, uint64(block.timestamp + 60), false);
    }

    function test_revertsAfterDeadline() public {
        vm.warp(block.timestamp + 1000);
        vm.prank(buyer);
        vm.expectRevert("deadline exceeded");
        router.swapExactIn(address(usdc), address(stock), 10_000_000, 0, buyer, uint64(block.timestamp - 1), false);
    }
}
