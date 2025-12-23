import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the ArtNFT address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const artNFT = await deployments.get("ArtNFT");

  console.log("ArtNFT address is " + artNFT.address);
});

task("task:mint", "Mint your ArtNFT for free")
  .addOptionalParam("uri", "Optional token URI, leave empty for none", "")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("ArtNFT");

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ArtNFT", deployment.address);

    const tx = await contract.connect(signer).mintArt(taskArguments.uri ?? "");
    console.log(`Minting with tx: ${tx.hash}`);
    await tx.wait();

    const tokenId = await contract.tokenOf(signer.address);
    console.log(`Minted tokenId: ${tokenId}`);
  });

task("task:list", "List your ArtNFT for sale")
  .addParam("tokenid", "Token id to list")
  .addParam("price", "Listing price in wei")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("ArtNFT");

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ArtNFT", deployment.address);

    const tokenId = BigInt(taskArguments.tokenid);
    const price = BigInt(taskArguments.price);

    const tx = await contract.connect(signer).listToken(tokenId, price);
    console.log(`Listing token ${tokenId} at ${price} wei. tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:buy", "Buy a listed ArtNFT")
  .addParam("tokenid", "Token id to buy")
  .addParam("price", "Amount of wei to send (should be at least listing price)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("ArtNFT");

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ArtNFT", deployment.address);

    const tokenId = BigInt(taskArguments.tokenid);
    const value = BigInt(taskArguments.price);

    const tx = await contract.connect(signer).buyListed(tokenId, { value });
    console.log(`Buying token ${tokenId} with tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:place-bid", "Place an encrypted bid on a listed ArtNFT")
  .addParam("tokenid", "Token id to bid on")
  .addParam("value", "Bid value as uint64 (wei)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const deployment = await deployments.get("ArtNFT");

    const tokenId = BigInt(taskArguments.tokenid);
    const bidValue = BigInt(taskArguments.value);

    await fhevm.initializeCLIApi();

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ArtNFT", deployment.address);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add64(bidValue)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .placeBid(tokenId, encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Placed encrypted bid on token ${tokenId} with tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:decrypt-bids", "Decrypt bids for a token as the owner")
  .addParam("tokenid", "Token id to decrypt bids for")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const deployment = await deployments.get("ArtNFT");

    await fhevm.initializeCLIApi();

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ArtNFT", deployment.address);

    const tokenId = BigInt(taskArguments.tokenid);
    const bids = await contract.getBids(tokenId);

    console.log(`Found ${bids.length} bids for token ${tokenId}`);
    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i];
      const clearValue = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        bid.price,
        deployment.address,
        signer,
      );

      console.log(`Bid #${i} bidder=${bid.bidder} value=${clearValue} timestamp=${bid.timestamp}`);
    }
  });
