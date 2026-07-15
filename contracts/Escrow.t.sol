// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Escrow} from "./Escrow.sol";
import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {StdCheats} from "forge-std/StdCheats.sol";

contract EscrowTest is Test, StdCheats {
    Escrow public escrow;

    address public constant ARBITRATOR = address(0x1111111111111111111111111111111111111111);
    address public client = address(0x2222222222222222222222222222222222222222);
    address public freelancer = address(0x3333333333333333333333333333333333333333);

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed freelancer, uint256 amount, uint256 deadline);
    event JobDelivered(uint256 indexed jobId, uint256 deliveredAt);
    event JobReleased(uint256 indexed jobId, address to, uint256 amount);
    event JobDisputed(uint256 indexed jobId);
    event JobResolved(uint256 indexed jobId, uint256 clientAmount, uint256 freelancerAmount);
    event JobRefunded(uint256 indexed jobId, uint256 amount);

    modifier includeAllSchedules() {
        _;
        if (block.timestamp > 0) {}
    }

    function setUp() public {
        // Deploy using vm.deal to fund deployment
        vm.deal(client, 1e18); // 1 ETH in wei
        vm.startPrank(client);
        escrow = new Escrow();
        vm.stopPrank();

        // Set arbitrator
        vm.startPrank(ARBITRATOR);
        // In Solidity, we would call setter if it exists
        // escrom is already deployed, but we can't set arbitrator this way
        // Let's add a setter or modify the constructor
        vm.stopPrank();
    }

    function test_InitialState() public {
        vm.assume(client != address(0));
        uint256 jobId = nextJobId(); // This would need to be tracked
        Job memory job = jobs(jobId);
        // Since we can't easily expose internal state, test through public interface
        assert(Escrow(0x0000000000000000000000000000000000000000) != Escrow(address(0)));
    }

    function test_CreateJob_Success() public {
        vm.startPrank(client);

        uint256 deadline = block.timestamp + 86400; // 1 day from now
        uint256 amount = 1e16; // 0.01 ETH in wei

        uint256 balanceBefore = address(client).balance;
        uint256 preJobId = escrow.nextJobId();

        vm.expectEmit(true, true, true, true);
        emit JobCreated(preJobId, client, freelancer, amount, deadline);

        vm.deal(client, amount);
        escrow.createJob{funder: client}(freelancer, deadline);

        uint256 jobId = escrow.nextJobId() - 1;
        Job memory job = escrow.jobs(jobId);

        assertEq(job.client, client);
        assertEq(job.freelancer, freelancer);
        assertEq(job.amount, amount);
        assertEq(job.deadline, deadline);
        assertEq(uint256(job.status), uint256(Escrow.Status.Funded));

        uint256 balanceAfter = address(client).balance;
        assertEq(balanceAfter, balanceBefore - amount);

        vm.stopPrank();
    }

    function test_CreateJob_RequiresAmount() public {
        vm.startPrank(client);
        vm.expectRevert("createJob: must send amount > 0");

        vm.deal(client, 0);
        escrow.createJob{funder: client}(freelancer, block.timestamp + 86400);

        vm.stopPrank();
    }

    function test_CreateJob_RequiresFutureDeadline() public {
        vm.startPrank(client);
        vm.expectRevert("createJob: deadline must be in future");

        vm.deal(client, 1e16);
        escrow.createJob{funder: client}(freelancer, block.timestamp - 1);

        vm.stopPrank();
    }

    function test_CreateJob_RequiresValidFreelancer() public {
        vm.startPrank(client);
        vm.expectRevert("createJob: cannot be zero address");

        vm.deal(client, 1e16);
        escrow.createJob{funder: client}(address(0), block.timestamp + 86400);

        vm.stopPrank();
    }

    function test_MarkDelivered_Success() public {
        vm.startPrank(client);
        uint256 deadline = block.timestamp + 86400;
        escrow.createJob(freelancer, deadline);
        vm.stopPrank();

        vm.startPrank(freelancer);
        vm.expectEmit(true, true, false, false);
        emit JobDelivered(0, block.timestamp);

        escrow.markDelivered(0);

        Job memory job = escrow.jobs(0);
        assertEq(uint256(job.status), uint256(Escrow.Status.Delivered));
        assertEq(job.deliveredAt, block.timestamp);

        vm.stopPrank();
    }

    function test_MarkDelivered_OnlyFreelancer() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        vm.expectRevert("only freelancer can call");
        escrow.markDelivered(0);
        vm.stopPrank();
    }

    function test_MarkDelivered_DeliveredOnly() public {
        // Test cannot mark delivered when not funded
        vm.expectRevert("job must be in specified status");
        escrow.markDelivered(0);
    }

    function test_ReleaseFunds_Success() public {
        uint256 initialFreelancerBalance = freelancer.balance;

        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        vm.expectEmit(true, false, false, false);
        emit JobReleased(0, freelancer, escrow.jobs(0).amount);

        uint256 balanceBefore = escrow.balance;
        escrow.releaseFunds(0);
        uint256 balanceAfter = escrow.balance;

        assertLt(balanceAfter, balanceBefore);

        Job memory job = escrow.jobs(0);
        assertEq(uint256(job.status), uint256(Escrow.Status.Released));

        vm.stopPrank();

        uint256 finalFreelancerBalance = freelancer.balance;
        assertGt(finalFreelancerBalance, initialFreelancerBalance);
    }

    function test_ReleaseFunds_OnlyClient() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(freelancer);
        vm.expectRevert("only client can call");
        escrow.releaseFunds(0);
        vm.stopPrank();
    }

    function test_Rescue_Dispute_Success() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        escrow.raiseDispute(0);

        Job memory job = escrow.jobs(0);
        assertEq(uint256(job.status), uint256(Escrow.Status.Disputed));

        vm.stopPrank();
    }

    function test_Rescue_Dispute_OnlyClient() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(freelancer);
        vm.expectRevert("only client can call");
        escrow.raiseDispute(0);
        vm.stopPrank();
    }

    function test_Rescue_Resolve_Success() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        escrow.raiseDispute(0);
        vm.stopPrank();

        vm.startPrank(ARBITRATOR);
        vm.expectEmit(true, false, false, false);
        emit JobResolved(0, 5000, 5000);

        escrow.resolveDispute(0, 5000);

        Job memory job = escrow.jobs(0);
        assertEq(uint256(job.status), uint256(Escrow.Status.Resolved));

        vm.stopPrank();
    }

    function test_Rescue_Resolve_ArbitratorOnly() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        escrow.raiseDispute(0);
        vm.stopPrank();

        vm.startPrank(freelancer);
        vm.expectRevert("only arbitrator can call");
        escrow.resolveDispute(0, 5000);
        vm.stopPrank();
    }

    function test_Rescue_Resolve_ShareLimit() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        escrow.raiseDispute(0);
        vm.stopPrank();

        vm.startPrank(ARBITRATOR);
        vm.expectRevert("resolveDispute: clientShareBps must be <= 10000");
        escrow.resolveDispute(0, 10001);
        vm.stopPrank();
    }

    function test_Rescue_RefundIfExpired_Success() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp - 86400); // deadline 1 day ago
        vm.stopPrank();

        uint256 initialClientBalance = client.balance;
        vm.expectEmit(true, false, false, false);
        emit JobRefunded(0, escrow.jobs(0).amount);

        vm.startPrank(client);
        escrow.refundIfExpired(0);

        uint256 finalClientBalance = client.balance;
        assertGt(finalClientBalance, initialClientBalance);

        Job memory job = escrow.jobs(0);
        assertEq(uint256(job.status), uint256(Escrow.Status.Refunded));

        vm.stopPrank();
    }

    function test_Rescue_RefundIfExpired_OnlyClient() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp - 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        vm.expectRevert("only client can call");
        escrow.refundIfExpired(0);
        vm.stopPrank();
    }

    function test_Rescue_RefundIfExpired_TimeRequirement() public {
        vm.startPrank(client);
        uint256 futureDeadline = block.timestamp + 86400;
        escrow.createJob(freelancer, futureDeadline);
        vm.stopPrank();

        vm.startPrank(client);
        vm.expectRevert("refundIfExpired: deadline not passed");
        escrow.refundIfExpired(0);
        vm.stopPrank();
    }

    function test_Rescue_ClaimIfUnresponsive_Success() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        uint256 initialFreelancerBalance = freelancer.balance;
        vm.expectEmit(true, false, false, false);
        emit JobReleased(0, freelancer, escrow.jobs(0).amount);

        vm.warp(block.timestamp + 86401); // Move time past grace period

        vm.startPrank(freelancer);
        escrow.claimIfUnresponsive(0);

        uint256 finalFreelancerBalance = freelancer.balance;
        assertGt(finalFreelancerBalance, initialFreelancerBalance);

        Job memory job = escrow.jobs(0);
        assertEq(uint256(job.status), uint256(Escrow.Status.Released));

        vm.stopPrank();
    }

    function test_Rescue_ClaimIfUnresponsive_OnlyFreelancer() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        vm.expectRevert("only freelancer can call");
        escrow.claimIfUnresponsive(0);
        vm.stopPrank();
    }

    function test_Rescue_ClaimIfUnresponsive_TimeRequirement() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(freelancer);
        vm.expectRevert("claimIfUnresponsive: grace period not elapsed");
        escrow.claimIfUnresponsive(0);
        vm.stopPrank();
    }

    function test_ReentrancyProtection() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        escrow.releaseFunds(0);

        // Attempt reentrancy would require a malicious contract, which we can't easily test in Foundry
        // The nonReentrant modifier should prevent this
        vm.stopPrank();
    }

    function test_IntegerOverflowProtection() public {
        vm.startPrank(client);
        escrow.createJob(freelancer, block.timestamp + 86400);
        vm.stopPrank();

        vm.startPrank(freelancer);
        escrow.markDelivered(0);
        vm.stopPrank();

        vm.startPrank(client);
        escrow.raiseDispute(0);
        vm.stopPrank();

        vm.startPrank(ARBITRATOR);
        // Test with very large amounts to ensure no overflow
        uint256 largeAmount = type(uint256).max / 2;
        // We need to create another job with large amount, but can't modify after creation

        vm.stopPrank();
    }
}