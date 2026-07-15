import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("EscrowModule", (m) => {
  const arbitrator = m.getParameter("arbitrator");
  const escrow = m.contract("Escrow", [arbitrator]);

  return { escrow };
});