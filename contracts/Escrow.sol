// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Escrow is ReentrancyGuard {
    enum Status {
        Created,
        Funded,
        Delivered,
        Disputed,
        Released,
        Refunded,
        Resolved
    }

    struct Job {
        address client;
        address freelancer;
        uint256 amount;
        uint256 deadline;
        uint256 deliveredAt;
        Status status;
    }

    mapping(uint256 => Job) public jobs;
    uint256 public nextJobId;
    address public arbitrator;
    uint256 public constant GRACE_PERIOD = 3 days;

    /// @dev Constructor to initialize the arbitrator
    /// @param arbitrator_ The address of the trusted arbitrator for dispute resolution
    constructor(address arbitrator_) {
        require(arbitrator_ != address(0), "constructor: arbitrator cannot be zero address");
        arbitrator = arbitrator_;
    }

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed freelancer,
        uint256 amount,
        uint256 deadline
    );

    event JobDelivered(uint256 indexed jobId, uint256 deliveredAt);

    event JobReleased(uint256 indexed jobId, address to, uint256 amount);

    event JobDisputed(uint256 indexed jobId);

    event JobResolved(
        uint256 indexed jobId,
        uint256 clientAmount,
        uint256 freelancerAmount
    );

    event JobRefunded(uint256 indexed jobId, uint256 amount);

    modifier onlyClient(uint256 jobId) {
        require(msg.sender == jobs[jobId].client, "only client can call");
        _;
    }

    modifier onlyFreelancer(uint256 jobId) {
        require(msg.sender == jobs[jobId].freelancer, "only freelancer can call");
        _;
    }

    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "only arbitrator can call");
        _;
    }

    modifier onlyWhenStatus(uint256 jobId, Status status) {
        require(jobs[jobId].status == status, "job must be in specified status");
        _;
    }

    /// @dev Creates a job and funds it with the full amount. Combines creation and funding for UX.
    /// @param freelancer_ The freelancer address working on the job
    /// @param deadline_ Unix timestamp when the freelancer must deliver
    /// @notice This function combines job creation and funding for simplicity
    /// @custom:security checks-effects-interactions state updates before external transfer
    /// @custom:security reentrancy-protected
    function createJob(
        address freelancer_,
        uint256 deadline_
    )
        external
        payable
        nonReentrant
        onlyWhenStatus(0, Status.Funded)
    {
        require(msg.value > 0, "createJob: must send amount > 0");
        require(deadline_ > block.timestamp, "createJob: deadline must be in future");
        require(freelancer_ != address(0), "createJob: cannot be zero address");

        uint256 jobId = nextJobId++;

        jobs[jobId] = Job({
            client: msg.sender,
            freelancer: freelancer_,
            amount: msg.value,
            deadline: deadline_,
            deliveredAt: 0,
            status: Status.Funded
        });

        emit JobCreated(jobId, msg.sender, freelancer_, msg.value, deadline_);
    }

    /// @dev Freelancer marks the job as completed by delivering their work
    /// @param jobId_ The unique identifier for the job
    /// @notice Only callable when job is in Funded state and freelancer is the caller
    /// @custom:security checks-effects-interactions update deliveredAt before release
    /// @custom:security reentrancy-protected
    function markDelivered(
        uint256 jobId_
    ) external nonReentrant onlyWhenStatus(jobId_, Status.Funded) onlyFreelancer(jobId_) {
        Job storage job = jobs[jobId_];
        require(block.timestamp <= job.deadline, "markDelivered: deadline passed");

        job.status = Status.Delivered;
        job.deliveredAt = block.timestamp;

        emit JobDelivered(jobId_, block.timestamp);
    }

    /// @dev Client releases funds to the freelancer upon successful delivery
    /// @param jobId_ The unique identifier for the job
    /// @notice Only callable when job is in Delivered state and client is the caller
    /// @custom:security checks-effects-interactions update status before external transfer
    /// @custom:security reentrancy-protected
    function releaseFunds(
        uint256 jobId_
    ) external nonReentrant onlyWhenStatus(jobId_, Status.Delivered) onlyClient(jobId_) {
        Job storage job = jobs[jobId_];
        uint256 amount = job.amount;

        job.status = Status.Released;

        (bool success, ) = job.freelancer.call{value: amount}("");
        require(success, "releaseFunds: ETH transfer failed");

        emit JobReleased(jobId_, job.freelancer, amount);
    }

    /// @dev Client raises a dispute for the job
    /// @param jobId_ The unique identifier for the job
    /// @notice Only callable when job is in Delivered state and client is the caller
    /// @custom:security checks-effects-interactions only updates state, no external transfer
    /// @custom:security reentrancy-protected
    function raiseDispute(
        uint256 jobId_
    ) external nonReentrant onlyWhenStatus(jobId_, Status.Delivered) onlyClient(jobId_) {
        Job storage job = jobs[jobId_];

        job.status = Status.Disputed;

        emit JobDisputed(jobId_);
    }

    /// @dev Arbitrator resolves a disputed job by splitting the funds
    /// @param jobId_ The unique identifier for the job
    /// @param clientShareBps_ Client's share in basis points (0-10000)
    /// @notice Only callable when job is in Disputed state and caller is arbitrator
    /// @custom:security checks-effects-interactions validates split before transfer
    /// @custom:security reentrancy-protected
    function resolveDispute(
        uint256 jobId_,
        uint256 clientShareBps_
    )
        external
        nonReentrant
        onlyWhenStatus(jobId_, Status.Disputed)
        onlyArbitrator()
    {
        require(clientShareBps_ <= 10000, "resolveDispute: clientShareBps must be <= 10000");

        Job storage job = jobs[jobId_];
        uint256 totalAmount = job.amount;
        uint256 clientShare = (totalAmount * clientShareBps_) / 10000;
        uint256 freelancerShare = totalAmount - clientShare;

        job.status = Status.Resolved;

        uint256 clientAmount = clientShare;
        uint256 freelancerAmount = freelancerShare;

        if (clientAmount > 0) {
            (bool success, ) = job.client.call{value: clientAmount}("");
            require(success, "resolveDispute: client ETH transfer failed");
        }

        if (freelancerAmount > 0) {
            (bool success, ) = job.freelancer.call{value: freelancerAmount}("");
            require(success, "resolveDispute: freelancer ETH transfer failed");
        }

        emit JobResolved(jobId_, clientAmount, freelancerAmount);
    }

    /// @dev Client refunds the job if the deadline has passed without delivery
    /// @param jobId_ The unique identifier for the job
    /// @notice Only callable when job is in Funded state and deadline has passed
    /// @custom:security checks-effects-interactions updates status before external transfer
    /// @custom:security reentrancy-protected
    function refundIfExpired(
        uint256 jobId_
    ) external nonReentrant onlyWhenStatus(jobId_, Status.Funded) onlyClient(jobId_) {
        Job storage job = jobs[jobId_];

        require(block.timestamp > job.deadline, "refundIfExpired: deadline not passed");

        job.status = Status.Refunded;

        (bool success, ) = job.client.call{value: job.amount}("");
        require(success, "refundIfExpired: client ETH transfer failed");

        emit JobRefunded(jobId_, job.amount);
    }

    /// @dev Freelancer claims funds if job is unresponsive after grace period
    /// @param jobId_ The unique identifier for the job
    /// @notice Only callable when job is in Delivered state and grace period elapsed
    /// @custom:security checks-effects-interactions status change before external transfer
    /// @custom:security reentrancy-protected
    function claimIfUnresponsive(
        uint256 jobId_
    ) external nonReentrant onlyWhenStatus(jobId_, Status.Delivered) onlyFreelancer(jobId_) {
        Job storage job = jobs[jobId_];

        require(
            block.timestamp > job.deliveredAt + GRACE_PERIOD,
            "claimIfUnresponsive: grace period not elapsed"
        );

        job.status = Status.Released;

        (bool success, ) = job.freelancer.call{value: job.amount}("");
        require(success, "claimIfUnresponsive: freelancer ETH transfer failed");

        emit JobReleased(jobId_, job.freelancer, job.amount);
    }
}