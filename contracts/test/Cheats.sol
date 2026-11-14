// SPDX-License-Identifier: MIT
// Minimal cheatcode interface (forge injects the implementation at 0x7109...D12D).
pragma solidity 0.8.30;

interface Vm {
    function warp(uint256 newTimestamp) external;
}

abstract contract Cheats {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
}
