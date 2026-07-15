// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

contract AttackEscrow is Test {
    address public immutable target;
    address public immutable victim;
    
    constructor(address target_, address victim_) {
        target = target_;
        victim = victim_;
    }
    
    // Receive function that receives ETH and tries to call the target
    receive() external payable {
        // Try to re-enter the target contract
        (bool success, ) = target.call{value: address(this).balance}("");
        if (!success) {
            revert("Reentrancy failed");
        }
    }
}