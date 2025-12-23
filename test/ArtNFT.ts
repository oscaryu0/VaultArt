import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ArtNFT, ArtNFT__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  carol: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ArtNFT")) as ArtNFT__factory;
  const artNFT = (await factory.deploy()) as ArtNFT;
  const artNFTAddress = await artNFT.getAddress();

  return { artNFT, artNFTAddress };
}

describe("ArtNFT", function () {
  let signers: Signers;
  let artNFT: ArtNFT;
  let artNFTAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2], carol: ethSigners[3] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ artNFT, artNFTAddress } = await deployFixture());
  });

  it("allows each wallet to mint only once", async function () {
    await artNFT.connect(signers.alice).mintArt("ipfs://first");

    await expect(artNFT.connect(signers.alice).mintArt("ipfs://second")).to.be.revertedWith("Already minted");
  });

  it("lists a token and transfers payment on purchase", async function () {
    await artNFT.connect(signers.alice).mintArt("ipfs://art");
    const price = ethers.parseEther("1");

    await artNFT.connect(signers.alice).listToken(1, price);

    const sellerBalanceBefore = await ethers.provider.getBalance(signers.alice.address);

    const buyTx = await artNFT.connect(signers.bob).buyListed(1, { value: price });
    await buyTx.wait();

    const sellerBalanceAfter = await ethers.provider.getBalance(signers.alice.address);

    expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(price);
    expect(await artNFT.ownerOf(1)).to.equal(signers.bob.address);

    const listing = await artNFT.getListing(1);
    expect(listing.active).to.equal(false);
    expect(listing.seller).to.equal(ethers.ZeroAddress);
  });

  it("stores encrypted bids decryptable by the listing owner", async function () {
    await artNFT.connect(signers.alice).mintArt("ipfs://art");
    await artNFT.connect(signers.alice).listToken(1, ethers.parseEther("1"));

    const bidValue = 3_400_000_000_000_000n;
    const encrypted = await fhevm.createEncryptedInput(artNFTAddress, signers.bob.address).add64(bidValue).encrypt();

    await artNFT.connect(signers.bob).placeBid(1, encrypted.handles[0], encrypted.inputProof);

    const bids = await artNFT.getBids(1);
    expect(bids.length).to.equal(1);
    expect(bids[0].bidder).to.equal(signers.bob.address);

    const clearBid = await fhevm.userDecryptEuint(FhevmType.euint64, bids[0].price, artNFTAddress, signers.alice);
    expect(clearBid).to.equal(bidValue);
  });
});
