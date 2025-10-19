// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title Daily Puzzle Solved NFT (ERC1155)
/// @notice One-time deployment; use YYYYMMDD as tokenId for each day; users can mint once after solving that day
contract DailyPuzzleNFT is ERC1155, Ownable, EIP712 {
  // Record whether an address has minted on a given day
  mapping(uint256 => mapping(address => bool)) public minted;
  // Authorized signer (for signature-based mint)
  address public authSigner;

  event AuthSignerUpdated(address indexed signer);

  constructor(
    address initialOwner
  ) ERC1155("") Ownable(initialOwner) EIP712("DailyPuzzleNFT", "1") {}

  /// @notice Set the authorized signer address (only owner)
  function setAuthSigner(address signer) external onlyOwner {
    authSigner = signer;
    emit AuthSignerUpdated(signer);
  }

  /// @notice User self-mint for the current or specified day
  /// @param yyyymmdd Date (e.g., 20251003)
  function mintSolved(uint256 yyyymmdd) external {
    require(!minted[yyyymmdd][msg.sender], "Already minted for this day");
    minted[yyyymmdd][msg.sender] = true;
    _mint(msg.sender, yyyymmdd, 1, "");
  }

  // EIP-712 type hash (include contract address and chain ID to prevent cross-chain/contract reuse; include deadline to avoid long-lived signatures)
  bytes32 private constant SOLVED_TYPEHASH =
    keccak256(
      "Solved(address player,uint256 day,address contract,uint256 chainId,uint256 deadline)"
    );

  /// @notice Signature-based mint: backend issues an EIP-712 signature after verifying user solved for the day; player mints on-chain using it
  /// @param yyyymmdd Date (e.g., 20251003)
  /// @param deadline Signature expiry (UNIX timestamp in seconds)
  /// @param signature EIP-712 signature (type Solved)
  function mintSolvedWithSig(
    uint256 yyyymmdd,
    uint256 deadline,
    bytes calldata signature
  ) external {
    require(block.timestamp <= deadline, "Signature expired");
    require(!minted[yyyymmdd][msg.sender], "Already minted for this day");
    require(authSigner != address(0), "Auth signer not set");

    bytes32 structHash = keccak256(
      abi.encode(SOLVED_TYPEHASH, msg.sender, yyyymmdd, address(this), block.chainid, deadline)
    );
    bytes32 digest = _hashTypedDataV4(structHash);
    address signer = ECDSA.recover(digest, signature);
    require(signer == authSigner, "Invalid signature");

    minted[yyyymmdd][msg.sender] = true;
    _mint(msg.sender, yyyymmdd, 1, "");
  }

  /// @notice Return metadata for a given tokenId (data URI stored on-chain)
  function uri(uint256 id) public view override returns (string memory) {
    string memory name = string.concat("DailyPuzzleSolved - ", Strings.toString(id));
    string memory description = string.concat(
      "Wordle daily puzzle solved on ",
      Strings.toString(id)
    );
    string memory json = string.concat(
      "{",
      '"name":"',
      name,
      '",',
      '"description":"',
      description,
      '",',
      '"attributes":[{"trait_type":"Day","value":"',
      Strings.toString(id),
      '"}]',
      "}"
    );
    string memory encoded = Base64.encode(bytes(json));
    return string.concat("data:application/json;base64,", encoded);
  }
}
