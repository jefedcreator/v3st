// SPDX-License-Identifier: MIT
// Behavioral tests for the test execution account policy: nonce sequencing, deadline,
// authorization epoch and pre-approved call hashes.
pragma solidity 0.8.30;

import {Cheats} from "./Cheats.sol";
import {TestBase} from "./TestBase.sol";
import {TestExecutionAccount} from "../testnet/TestExecutionAccount.sol";
import {TestSettlementToken} from "../testnet/TestSettlementToken.sol";

contract Target {
    uint256 public hits;
    function ping() external { hits += 1; }
}

contract ExecutionPolicyTest is TestBase, Cheats {
    TestExecutionAccount account;
    TestSettlementToken token;
    Target target;
    address owner = address(0xA11CE);
    address relayer = address(0x9E11);

    function setUp() public {
        account = new TestExecutionAccount(owner, relayer);
        token = new TestSettlementToken("V3ST Test USDC", "tUSDC", 6);
        target = new Target();
    }

    function _call() internal view returns (TestExecutionAccount.Call memory) {
        return TestExecutionAccount.Call({target: address(target), data: abi.encodeWithSignature("ping()"), value: 0});
    }

    function test_executesApprovedCallWithSequencedNonce() public {
        TestExecutionAccount.Call[] memory calls = new TestExecutionAccount.Call[](1);
        calls[0] = _call();
        bytes32 cid = account.callIdOf(bytes32(uint256(1)), calls[0]);
        vm.prank(relayer);
        account.approveCalls(_arr(cid));
        vm.prank(relayer);
        account.executeBatch(bytes32(uint256(1)), 1, uint64(block.timestamp + 100), 0, calls);
        assertEqU(target.hits(), 1);
        assertEqU(account.nonce(), 1);
    }

    function test_rejectsUnapprovedCall() public {
        TestExecutionAccount.Call[] memory calls = new TestExecutionAccount.Call[](1);
        calls[0] = _call();
        vm.prank(relayer);
        vm.expectRevert("call not approved");
        account.executeBatch(bytes32(uint256(1)), 1, uint64(block.timestamp + 100), 0, calls);
    }

    function test_rejectsBadNonce() public {
        TestExecutionAccount.Call[] memory calls = new TestExecutionAccount.Call[](1);
        calls[0] = _call();
        bytes32 cid = account.callIdOf(bytes32(uint256(1)), calls[0]);
        vm.prank(relayer);
        account.approveCalls(_arr(cid));
        vm.prank(relayer);
        vm.expectRevert("bad nonce");
        account.executeBatch(bytes32(uint256(1)), 5, uint64(block.timestamp + 100), 0, calls);
    }

    function test_rejectsExpiredDeadline() public {
        TestExecutionAccount.Call[] memory calls = new TestExecutionAccount.Call[](1);
        calls[0] = _call();
        bytes32 cid = account.callIdOf(bytes32(uint256(1)), calls[0]);
        vm.prank(relayer);
        account.approveCalls(_arr(cid));
        vm.warp(block.timestamp + 1000);
        vm.prank(relayer);
        vm.expectRevert("deadline exceeded");
        account.executeBatch(bytes32(uint256(1)), 1, uint64(block.timestamp - 1), 0, calls);
    }

    function test_rejectsStaleAuthorizationEpoch() public {
        TestExecutionAccount.Call[] memory calls = new TestExecutionAccount.Call[](1);
        calls[0] = _call();
        bytes32 cid = account.callIdOf(bytes32(uint256(1)), calls[0]);
        vm.prank(relayer);
        account.approveCalls(_arr(cid));
        vm.prank(owner);
        account.bumpAuthorizationEpoch();
        vm.prank(relayer);
        vm.expectRevert("authorization epoch mismatch");
        account.executeBatch(bytes32(uint256(1)), 1, uint64(block.timestamp + 100), 0, calls);
    }

    function test_rejectsForeignCaller() public {
        TestExecutionAccount.Call[] memory calls = new TestExecutionAccount.Call[](1);
        calls[0] = _call();
        vm.prank(address(0xBAD));
        vm.expectRevert("not relayer");
        account.executeBatch(bytes32(uint256(1)), 1, uint64(block.timestamp + 100), 0, calls);
    }

    function _arr(bytes32 v) internal pure returns (bytes32[] memory a) {
        a = new bytes32[](1);
        a[0] = v;
    }
}
