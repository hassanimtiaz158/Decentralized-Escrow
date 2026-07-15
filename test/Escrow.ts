import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create({ network: "sepolia" });

describe("Escrow", function () {
  it("Should create a job and fund it", async function () {
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy(
      "0x1234567890123456789012345678901234567890" // dummy arbitrator
    );
    await escrow.waitForDeployment();

    const freelancer = "0x1234567890123456789012345678901234567890";
    const amount = ethers.parseEther("0.1");
    const deadline = Math.floor(Date.now() / 1000) + 86400; // 1 day from now

    const tx = await escrow.createJob(freelancer, deadline, {
      value: amount,
    });
    const receipt = await tx.wait();

    const jobId = 0;
    const job = await escrow.jobs(jobId);

    expect(job.client).to.equal(await ethers.provider.getSigner().getAddress());
    expect(job.freelancer).to.equal(freelancer);
    expect(job.amount).to.equal(amount);
    expect(job.deadline).to.equal(deadline);
    expect(job.status).to.equal(2); // Funded enum value

    await expect(tx)
      .to.emit(escrow, "JobCreated")
      .withArgs(jobId, job.client, freelancer, amount, deadline);
  });

  it("Should not create a job with zero amount", async function () {
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy(
      "0x1234567890123456789012345678901234567890"
    );
    await escrow.waitForDeployment();

    const freelancer = "0x1234567890123456789012345678901234567890";
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await expect(escrow.createJob(freelancer, deadline, { value: 0 })).to.be
      .reverted;
  });

  it("Should mark job as delivered by freelancer", async function () {
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy(
      "0x1234567890123456789012345678901234567890"
    );
    await escrow.waitForDeployment();

    const freelancer = "0x1234567890123456789012345678901234567890";
    const amount = ethers.parseEther("0.1");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await escrow.createJob(freelancer, deadline, { value: amount });

    const [freelancerSigner] = await ethers.getSigners();
    const freelancerEscrow = escrow.connect(freelancerSigner);

    await expect(freelancerEscrow.markDelivered(0)).to.emit(escrow, "JobDelivered");

    const job = await escrow.jobs(0);
    expect(job.status).to.equal(3); // Delivered
    expect(job.deliveredAt).to.be.gt(0);
  });

  it("Should release funds to freelancer", async function () {
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy(
      "0x1234567890123456789012345678901234567890"
    );
    await escrow.waitForDeployment();

    const freelancer = "0x1234567890123456789012345678901234567890";
    const amount = ethers.parseEther("0.1");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await escrow.createJob(freelancer, deadline, { value: amount });

    const [freelancerSigner] = await ethers.getSigners();
    const freelancerEscrow = escrow.connect(freelancerSigner);

    await freelancerEscrow.markDelivered(0);

    const escrowBalanceBefore = await ethers.provider.getBalance(escrow.target);
    const freelancerBalanceBefore = await ethers.provider.getBalance(freelancer);

    await escrow.releaseFunds(0);

    const escrowBalanceAfter = await ethers.provider.getBalance(escrow.target);
    const freelancerBalanceAfter = await ethers.provider.getBalance(freelancer);

    expect(escrowBalanceAfter).to.be.lt(escrowBalanceBefore);
    expect(freelancerBalanceAfter).to.be.gt(freelancerBalanceBefore);

    const job = await escrow.jobs(0);
    expect(job.status).to.equal(5); // Released

    await expect(escrow.releaseFunds(0)).to.be.reverted;
  });

  it("Should refund job if deadline passed", async function () {
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy(
      "0x1234567890123456789012345678901234567890"
    );
    await escrow.waitForDeployment();

    const freelancer = "0x1234567890123456789012345678901234567890";
    const amount = ethers.parseEther("0.1");
    const deadline = Math.floor(Date.now() / 1000) - 86400; // 1 day ago

    await escrow.createJob(freelancer, deadline, { value: amount });

    const escrowBalanceBefore = await ethers.provider.getBalance(escrow.target);
    const clientBalanceBefore = await ethers.provider.getBalance(
      await ethers.provider.getSigner().getAddress()
    );

    await expect(escrow.refundIfExpired(0)).to.emit(escrow, "JobRefunded");

    const escrowBalanceAfter = await ethers.provider.getBalance(escrow.target);
    const clientBalanceAfter = await ethers.provider.getBalance(
      await ethers.provider.getSigner().getAddress()
    );

    expect(escrowBalanceAfter).to.be.lt(escrowBalanceBefore);
    expect(clientBalanceAfter).to.be.gt(clientBalanceBefore);

    const job = await escrow.jobs(0);
    expect(job.status).to.equal(6); // Refunded
  });
});