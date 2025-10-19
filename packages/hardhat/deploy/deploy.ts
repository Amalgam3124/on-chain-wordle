import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as fs from 'fs';
import * as path from 'path';

async function writeAbiToFrontend(hre: HardhatRuntimeEnvironment, contractName: string, outRelPath: string) {
  const artifact = await hre.artifacts.readArtifact(contractName);
  fs.writeFileSync(outRelPath, JSON.stringify(artifact.abi, null, 2));
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const skipNft = (process.env.SKIP_NFT || '').toLowerCase() === 'true';

  console.log('Deploying Wordle (plaintext) with the account:', deployer);

  const deployedWordle = await deploy('Wordle', {
    from: deployer,
    log: true,
  });

  console.log(`Wordle contract deployed to: ${deployedWordle.address}`);
  console.log(`Transaction hash: ${deployedWordle.transactionHash}`);

  let deployedNFTAddress: string | '' = '';

  if (!skipNft) {
    // Deploy the DailyPuzzleNFT contract
    const deployedNFT = await deploy('DailyPuzzleNFT', {
      from: deployer,
      args: [deployer],
      log: true,
    });
    deployedNFTAddress = deployedNFT.address;
    console.log(`DailyPuzzleNFT contract deployed to: ${deployedNFT.address}`);

    // Set authorized signer
    const authSignerEnv = process.env.AUTH_SIGNER || process.env.SIGNER_ADDRESS || deployer;
    const nft = await hre.ethers.getContractAt('DailyPuzzleNFT', deployedNFT.address);
    const txSetSigner = await nft.connect(await hre.ethers.getSigner(deployer)).setAuthSigner(authSignerEnv);
    await txSetSigner.wait();
    console.log(`Auth signer set to: ${authSignerEnv}`);
  } else {
    console.log('Skipping DailyPuzzleNFT deployment due to SKIP_NFT=true');
  }

  // Read current network Chain ID
  const networkInfo = await hre.ethers.provider.getNetwork();
  const currentChainId = Number(networkInfo.chainId || hre.network.config.chainId);

  // Update hardhat .env with contract addresses and chain ID
  const hardhatEnvPath = path.join(__dirname, '../.env');
  let envContent = fs.readFileSync(hardhatEnvPath, 'utf8');

  // Update or add CONTRACT_ADDRESS
  if (envContent.includes('CONTRACT_ADDRESS=')) {
    envContent = envContent.replace(/CONTRACT_ADDRESS=.*/, `CONTRACT_ADDRESS=${deployedWordle.address}`);
  } else {
    envContent += `\nCONTRACT_ADDRESS=${deployedWordle.address}`;
  }
  // Add or update NFT contract address (empty if skipped)
  if (envContent.includes('NFT_ADDRESS=')) {
    envContent = envContent.replace(/NFT_ADDRESS=.*/, `NFT_ADDRESS=${deployedNFTAddress}`);
  } else {
    envContent += `\nNFT_ADDRESS=${deployedNFTAddress}`;
  }
  // Update or add CHAIN_ID
  if (envContent.includes('CHAIN_ID=')) {
    envContent = envContent.replace(/CHAIN_ID=.*/, `CHAIN_ID=${currentChainId}`);
  } else {
    envContent += `\nCHAIN_ID=${currentChainId}`;
  }
  // Update or add AUTH_SIGNER
  const authSignerEnv = process.env.AUTH_SIGNER || process.env.SIGNER_ADDRESS || deployer;
  if (envContent.includes('AUTH_SIGNER=')) {
    envContent = envContent.replace(/AUTH_SIGNER=.*/, `AUTH_SIGNER=${authSignerEnv}`);
  } else {
    envContent += `\nAUTH_SIGNER=${authSignerEnv}`;
  }

  fs.writeFileSync(hardhatEnvPath, envContent);
  console.log(`Contract address and chain id updated in: ${hardhatEnvPath}`);

  // Update frontend .env.local with addresses
  const frontendEnvPath = path.join(__dirname, '../../nextjs/.env.local');
  const frontendEnvContent = `NEXT_PUBLIC_CONTRACT_ADDRESS=${deployedWordle.address}\nNEXT_PUBLIC_NFT_ADDRESS=${deployedNFTAddress}\nNEXT_PUBLIC_CHAIN_ID=${currentChainId}\n`;

  fs.writeFileSync(frontendEnvPath, frontendEnvContent);
  console.log(`Contract address and chain id saved to frontend: ${frontendEnvPath}`);

  // Sync ABI to frontend
  const frontendAbiPathWordle = path.join(__dirname, '../../nextjs/contracts/Wordle.json');
  await writeAbiToFrontend(hre, 'Wordle', frontendAbiPathWordle);
  console.log('Synced Wordle ABI to frontend: ' + frontendAbiPathWordle);

  if (!skipNft) {
    const nftArtifact = await hre.artifacts.readArtifact('DailyPuzzleNFT');
    const frontendAbiPathNFT = path.join(__dirname, '../../nextjs/contracts/DailyPuzzleNFT.json');
    fs.writeFileSync(frontendAbiPathNFT, JSON.stringify(nftArtifact.abi, null, 2));
    console.log(`Synced DailyPuzzleNFT ABI to frontend: ${frontendAbiPathNFT}`);
  }
};

export default func;
func.id = 'deploy_wordle_plaintext';
func.tags = ['Wordle'];
