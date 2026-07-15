import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture } from "hardhat/fixtures";

// TX type for the counter test
export type CounterTestType = typeof import("../contracts/Counter.sol/Counter.t.sol/ContractTest");

async function deployEscrowFixture() {
  const [client, freelancer, arbitrator] = await ethers.getSigners();

  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(arbitrator.address);
  await escrow.waitForDeployment();

  return { escrow, client, freelancer, arbitrator };
}

// Create an attack contract for reentrancy testing
const { ethers: ethers0 } = await network.create();

const AttackEscrow = await ethers0.getContractFactory("AttackEscrow");

export const AttackEscrow = AttackEscrow;

//TX: _1, _2
function test_Reentrancy() {
  const target = "0x0000000000000000000000000000000000000000";
  const victim = "0x0000000000000000000000000000000000000000";
  
  AttackEscrow.deploy(target, victim);
}
describe("Escrow Contract - Adversarial Tests", function () {
  describe("Reentrancy Tests", function () {
    it("Should protect against reentrancy in releaseFunds", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(freelancer).markDelivered(0);

      const attackContract = await AttackEscrow.deploy(escrow.target, freelancer.address);
      await attackContract.waitForDeployment();

      await expect(escrow.connect(client).releaseFunds(0))
        .to.emit(escrow, "JobReleased")
        .withArgs(0, freelancer.address, amount);

      await attackContract.sendTransaction({ value: amount });

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(5); // Status.Released
    });

    it("Should protect against reentrancy in refundIfExpired", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) - 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      const attackContract = await AttackEscrow.deploy(escrow.target, client.address);
      await attackContract.waitForDeployment();

      await expect(escrow.connect(client).refundIfExpired(0))
        .to.emit(escrow, "JobRefunded")
        .withArgs(0, amount);

      await attackContract.sendTransaction({ value: amount });

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(6); // Status.Refunded
    });

    it("Should protect against reentrancy in resolveDispute", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(freelancer).markDelivered(0);
      await escrow.connect(client).raiseDispute(0);

      const attackContract = await AttackEscrow.deploy(escrow.target, arbitrator.address);
      await attackContract.waitForDeployment();

      await expect(escrow.connect(arbitrator).resolveDispute(0, 5000))
        .to.emit(escrow, "JobResolved")
        .withArgs(0, ethers.parseEther("0.05"), ethers.parseEther("0.05"));

      await attackContract.sendTransaction({ value: amount });

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(7); // Status.Resolved
    });

    it("Should protect against reentrancy in claimIfUnresponsive", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(freelancer).markDelivered(0);
      await expect(escrow.connect(freelancer).claimIfUnresponsive(0))
        .to.emit(escrow, "JobReleased")
        .withArgs(0, freelancer.address, amount);

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(5); // Status.Released
    });
  });

  describe("Double-Release Tests", function () {
    it("Should reject double release attempt after successful release", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(freelancer).markDelivered(0);
      await escrow.connect(client).releaseFunds(0);

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(5); // Status.Released

      await expect(escrow.connect(client).releaseFunds(0))
        .to.be.revertedWith("job must be in specified status");
    });

    it("Should reject second release after refund", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) - 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(client).refundIfExpired(0);

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(6); // Status.Refunded

      await expect(escrow.connect(client).releaseFunds(0))
        .to.be.revertedWith("job must be in specified status");
    });

    it("Should reject third release after claim unresponsive", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(freelancer).markDelivered(0);
      await escrow.connect(freelancer).claimIfUnresponsive(0);

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(5); // Status.Released

      await expect(escrow.connect(client).releaseFunds(0))
        .to.be.revertedWith("job must be in specified status");
    });

    it("Should reject second resolveDispute after resolution", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(freelancer).markDelivered(0);
      await escrow.connect(client).raiseDispute(0);
      await escrow.connect(arbitrator).resolveDispute(0, 5000);

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(7); // Status.Resolved

      await expect(escrow.connect(arbitrator).resolveDispute(0, 5000))
        .to.be.revertedWith("job must be in specified status");
    });

    it("Should reject release after dispute resolution", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(freelancer).markDelivered(0);
      await escrow.connect(client).raiseDispute(0);
      await escrow.connect(arbitrator).resolveDispute(0, 5000);

      const job = await escrow.jobs(0);
      expect(job.status).to.equal(7); // Status.Resolved

      await expect(escrow.connect(client).releaseFunds(0))
        .to.be.revertedWith("job must be in specified status");
    });

    it("Should reject claimIfUnresponsive after second release attempt", async function () {
      const { escrow, client, freelancer, arbitrator } = await loadFixture(deployEscrowFixture);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseEther("0.1");

      await escrow.connect(client).createJob(freelancer.address, deadline, {
        value: amount
      });

      await escrow.connect(freelancer).markDelivered(0);
      await expect(escrow.connect(client).releaseFunds(0))
        .to.emit(escrow, "JobReleased")
        .withArgs(0, freelancer.address, amount);

      await expect(escrow.connect(freelancer).claimIfUnresponsive(0))
        .to.be.revertedWith("job must be in specified status");
    });
  });
}