import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedArtNFT = await deploy("ArtNFT", {
    from: deployer,
    log: true,
  });

  console.log(`ArtNFT contract: `, deployedArtNFT.address);
};
export default func;
func.id = "deploy_artNFT"; // id required to prevent reexecution
func.tags = ["ArtNFT"];
