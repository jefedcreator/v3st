// SPDX-License-Identifier: MIT
// Minimal assertion base so forge tests run without external libraries.
pragma solidity 0.8.30;

contract TestBase {
    function assertTrue(bool cond, string memory label) internal pure {
        require(cond, label);
    }

    function assertEq(uint256 a, uint256 b, string memory label) internal pure {
        require(a == b, label);
    }

    function assertEq(address a, address b, string memory label) internal pure {
        require(a == b, label);
    }

    function assertEqU(uint256 a, uint256 b) internal pure {
        require(a == b, "uint mismatch");
    }

    function assertEqA(address a, address b) internal pure {
        require(a == b, "address mismatch");
    }
}
