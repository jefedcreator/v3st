// SPDX-License-Identifier: MIT
// Behavioral tests for the B20-behavior mock: raw quantities never change on a split,
// scheduled multipliers apply only at their effective time, and cancellations win.
pragma solidity 0.8.30;

import {Cheats} from "./Cheats.sol";
import {TestBase} from "./TestBase.sol";
import {TestStockToken} from "../testnet/TestStockToken.sol";
import {TestStockRegistry} from "../testnet/TestStockRegistry.sol";

contract StockActionsTest is TestBase, Cheats {
    TestStockToken token;
    TestStockRegistry registry;
    address holder = address(0xBEEF);

    function setUp() public {
        token = new TestStockToken("Test Stock A", "TSTA", 1_000_000e18);
        registry = new TestStockRegistry();
        token.transfer(holder, 2e18);
    }

    function test_splitPreservesRawQuantityAndValue() public {
        // Two raw tokens, multiplier 1 -> 2, underlying share price 100 -> 50:
        // four share equivalents, unchanged value of 200.
        uint256 rawBefore = token.balanceOf(holder);
        assertEqU(rawBefore, 2e18);
        uint256 id = token.scheduleMultiplier(2e18, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);
        token.applyDueActions();
        assertEqU(token.multiplierWad(), 2e18);
        // Raw quantity is untouched by the corporate action.
        assertEqU(token.balanceOf(holder), 2e18);
        uint256 shareEquivalent = (rawBefore * token.multiplierWad()) / 1e18;
        assertEqU(shareEquivalent, 4e18);
        uint256 sharePriceAfter = 50_000_000; // 50 USD in micro
        uint256 valueBefore = (rawBefore * 100_000_000) / 1e18; // share price 100 USD in micro
        uint256 valueAfter = (shareEquivalent * sharePriceAfter) / 1e18;
        assertEqU(valueBefore, 200_000_000);
        assertEqU(valueAfter, 200_000_000);
        assertEqU(id, 0);
    }

    function test_scheduledMultiplierDoesNotApplyBeforeEffectiveTime() public {
        token.scheduleMultiplier(3e18, uint64(block.timestamp + 1000));
        token.applyDueActions();
        assertEqU(token.multiplierWad(), 1e18);
        assertEqU(token.effectiveMultiplierAt(uint64(block.timestamp)), 1e18);
        vm.warp(block.timestamp + 1001);
        assertEqU(token.effectiveMultiplierAt(uint64(block.timestamp)), 3e18);
    }

    function test_cancelledScheduledUpdateNeverApplies() public {
        uint256 id = token.scheduleMultiplier(2e18, uint64(block.timestamp + 1));
        token.cancelAction(id);
        vm.warp(block.timestamp + 10);
        token.applyDueActions();
        assertEqU(token.multiplierWad(), 1e18);
        assertEqU(token.effectiveMultiplierAt(uint64(block.timestamp)), 1e18);
    }

    function test_applyIsIdempotent() public {
        token.scheduleMultiplier(2e18, uint64(block.timestamp));
        token.applyDueActions();
        token.applyDueActions();
        assertEqU(token.multiplierWad(), 2e18);
        (,,, bool cancelled, bool applied) = token.actions(0);
        assertTrue(!cancelled, "not cancelled");
        assertTrue(applied, "applied");
    }

    function test_registryReferencePriceAndFlags() public {
        bytes32 key = registry.registerInstrument(
            address(token),
            "testnet:31337:0xtsta",
            "TSTA",
            "Test Stock A",
            18,
            "stock",
            "V3ST fixture issuer",
            "tokenized stock exposure; no voting or redemption rights"
        );
        registry.setReferencePrice(key, 100_000_000, "share_price", uint64(block.timestamp));
        TestStockRegistry.Instrument memory inst = registry.getInstrument(key);
        assertEqU(inst.referencePriceMicroUsd, 100_000_000);
        assertTrue(inst.enabled, "enabled");
        registry.setTradingFlags(key, true, false, true);
        assertTrue(registry.getInstrument(key).paused, "paused");
    }
}
