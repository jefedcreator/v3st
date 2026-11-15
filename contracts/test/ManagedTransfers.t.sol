// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TestBase} from "./TestBase.sol";
import {TestSettlementToken} from "../testnet/TestSettlementToken.sol";

contract ManagedTransfersTest is TestBase {
    function testManagedTransferReplaysWithoutMovingTwice() public {
        TestSettlementToken token = new TestSettlementToken("Beta", "TEST", 6);
        token.mint(address(this), 100);
        bytes32 key = keccak256("fixture-transfer");
        token.managedTransfer(key, address(this), address(0xBEEF), 40);
        token.managedTransfer(key, address(this), address(0xBEEF), 40);
        assertEqU(token.balanceOf(address(0xBEEF)), 40);
        assertEqU(token.balanceOf(address(this)), 60);
        (bool changed,) = address(token).call(abi.encodeCall(token.managedTransfer, (key, address(this), address(0xBEEF), 50)));
        assertTrue(!changed, "changed payload rejected");
        assertEqU(token.balanceOf(address(this)), 60);
    }
}
