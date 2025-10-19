// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title On-chain Wordle Game (plaintext)
/// @notice Purely on-chain Wordle without FHE; uses daily pseudo-random word from a curated list
contract Wordle {
  uint8 internal constant WORD_LENGTH = 5;
  uint8 internal constant MAX_GUESSES = 6;

  struct Game {
    bool initialized;
    uint8 guessCount;
    bool completed;
    bool won;
    uint256 gameDay;
  }

  mapping(address => Game) private games;

  // Store the target word of the current day (as bytes5)
  bytes5 private targetWord;

  // Owner
  address private owner;

  // Daily seed bookkeeping
  uint256 private dailySeed;
  uint256 private lastSeedDay;

  // Events
  event GameInitialized(address player);
  event GuessSubmitted(address player, uint8 guessNumber);
  event GameCompleted(address player, bool won);
  event DailyWordUpdated(uint256 indexed day);
  event GameReset(address player);

  constructor() {
    owner = msg.sender;
    updateDailySeed();
    // Initialize target word immediately based on seed
    _setTodayWord();
  }

  // ========================
  // Word list and selection
  // ========================

  string[] private wordList = [
    // A
    "AWOKE","ALIEN","ALIGN","AGLOW","ADORE","ABHOR","ACTOR","ACUTE","ADEPT","ALBUM",
    // B
    "BLANK","BRISK","BOUND","BANJO","BLUSH","BRUTE","BICEP","BELOW","BLOAT","BRAIN",
    // C
    "CRANE","CHALK","COVET","CUMIN","COBRA","CANDY","CLONE","COUNT","CURLY","CEDAR",
    // D
    "DRAFT","DRONE","DRINK","DOUBT","DROWN","DUVET","DROPS","DINGO","DIMLY","DECAL",
    // E
    "EPOCH","ELBOW","ENACT","EQUIP","EXULT","EMPTY","ETHIC","EXTRA","ENJOY","EQUAL",
    // F
    "FROST","FLING","FLUTE","FJORD","FRAUD","FABLE","FEINT","FOCUS","FRAME","FLAKY",
    // G
    "GLINT","GROUP","GRACE","GUMBO","GUIDE","GRAIN","GLADE","GRIND","GRAPH","GROWN",
    // H
    "HEART","HANDY","HASTE","HAVEN","HORSE","HOUND","HUMID","HINGE","HOTEL","HYPER",
    // I
    "INDEX","IVORY","IDEAL","INPUT","INLET","IRATE","IMAGE","IMBUE","INFER","INBOX",
    // J
    "JUMBO","JOUST","JUMPY","JOKER","JAUNT","JERKY","JUDGE","JOINT","JOINS","JUMPS",
    // K
    "KNAVE","KNIFE","KIOSK","KNELT","KNURL","KRAIT","KUDOS","KAPUT","KNEAD","KARST",
    // L
    "LIGHT","LASER","LEMON","LAPIS","LUNAR","LYMPH","LOCUS","LOGIC","LODGE","LATCH",
    // M
    "MOUSE","MINTY","MAGIC","MAPLE","MANGO","MOCHA","MOVIE","MOUND","MINOR","MURAL",
    // N
    "NOVEL","NURSE","NIGHT","NEXUS","NOBLE","NUDGE","NORTH","NIFTY","NADIR","NOISE",
    // O
    "ORBIT","OCEAN","OLIVE","OPTIC","OUTER","OUGHT","OPERA","OKAPI","OPIUM","OWING",
    // P
    "PINGS","PAVED","PIANO","PEACH","PLUME","PRISM","PARTY","PLANT","PROVE","PUNCH",
    // Q
    "QUACK","QUICK","QUEST","QUILT","QUARK","QUOTA","QUIET","QUOTE","QUAIL","QUASH",
    // R
    "RADIO","ROGUE","RIDGE","REALM","RANCH","RATIO","ROAST","RUINS","RAVEN","ROUND",
    // S
    "STORM","SNAKE","SMILE","SOLAR","SWIFT","SQUIB","SPUNK","STAGE","SOUND","STERN",
    // T
    "TIGER","TOWER","TULIP","TEMPO","TORCH","THWAX","THORN","TREND","TRUNK","TANGO",
    // U
    "UNCLE","UNITY","ULTRA","UNBOX","URBAN","USAGE","UNTIL","UPSET","USHER","UTILE",
    // V
    "VELDT","VIRUS","VIPER","VAPOR","VOWEL","VALOR","VIGOR","VISTA","VENOM","VIXEN",
    // W
    "WALTZ","WORLD","WHALE","WHEAT","WOVEN","WRUNG","WACKY","WOMAN","WATER","WINDY",
    // X
    "XYLEM","XERUS","XENIA","XENIC","XERIC","XENOS","XYSTI","XYLAN","XYSTE","XEROS",
    // Y
    "YOUTH","YACHT","YOUNG","YODEL","YIELD","YOKEL","YEARN","YAWNS","YEAST","YELPS",
    // Z
    "ZEBRA","ZESTY","ZONAL","ZONED","ZONER","ZILCH","ZLOTY","ZYMIC","ZYGON","ZEBUS"
  ];

  function hasUniqueLetters(string memory word) internal pure returns (bool) {
    bytes memory w = bytes(word);
    if (w.length != WORD_LENGTH) return false;
    bool[26] memory seen;
    for (uint256 i = 0; i < w.length; ++i) {
      uint8 c = uint8(w[i]);
      if (c < 65 || c > 90) return false; // uppercase A..Z
      uint8 idx = c - 65;
      if (seen[idx]) return false;
      seen[idx] = true;
    }
    return true;
  }

  function _getTodayUniqueWordIndex() internal view returns (uint256) {
    uint256 base = dailySeed % wordList.length;
    for (uint256 i = 0; i < wordList.length; i++) {
      uint256 idx = (base + i) % wordList.length;
      if (hasUniqueLetters(wordList[idx])) {
        return idx;
      }
    }
    revert("No unique-letter word available");
  }

  function _setTodayWord() internal {
    string memory todayWord = wordList[_getTodayUniqueWordIndex()];
    bytes memory b = bytes(todayWord);
    // Convert to bytes5
    targetWord = bytes5(b);
  }

  /// @notice Update the daily seed and target word (idempotent if same day)
  function updateDailySeed() public {
    uint256 currentDay = block.timestamp / 86400;
    if (currentDay != lastSeedDay) {
      dailySeed = uint256(
        keccak256(abi.encodePacked(currentDay, blockhash(block.number - 1)))
      );
      lastSeedDay = currentDay;
      emit DailyWordUpdated(currentDay);
      _setTodayWord();
    }
  }

  /// @notice Initialize today's game for caller
  function initializeDailyGame() external {
    uint256 currentDay = block.timestamp / 86400;
    require(
      !games[msg.sender].initialized || games[msg.sender].gameDay != currentDay,
      "Game already initialized today"
    );

    updateDailySeed();
    _setTodayWord();

    games[msg.sender] = Game({
      initialized: true,
      guessCount: 0,
      completed: false,
      won: false,
      gameDay: currentDay
    });

    emit GameInitialized(msg.sender);
  }

  /// @notice Submit a plaintext guess and get per-position results
  /// @param guess 5-letter uppercase ASCII word
  /// @return results array: 0 = not in word, 1 = in word wrong position, 2 = correct position
  function submitGuess(string calldata guess) external returns (uint8[5] memory) {
    require(games[msg.sender].initialized, "Game not initialized");
    require(!games[msg.sender].completed, "Game already completed");
    require(games[msg.sender].guessCount < MAX_GUESSES, "Maximum guesses reached");

    bytes memory g = bytes(guess);
    require(g.length == WORD_LENGTH, "Guess must be 5 letters");
    for (uint256 i = 0; i < WORD_LENGTH; i++) {
      uint8 c = uint8(g[i]);
      require(c >= 65 && c <= 90, "Only uppercase A..Z allowed");
    }

    // Compare with target
    uint8[5] memory results;
    bool allCorrect = true;

    // Access target bytes
    bytes5 tw = targetWord;

    for (uint8 i = 0; i < WORD_LENGTH; i++) {
      uint8 gc = uint8(g[i]);
      uint8 tc = uint8(tw[i]);

      if (gc == tc) {
        results[i] = 2; // correct position
      } else {
        // Check existence in other positions (unique-letter list simplifies handling)
        bool inWord = false;
        for (uint8 j = 0; j < WORD_LENGTH; j++) {
          if (j == i) continue;
          if (gc == uint8(tw[j])) {
            inWord = true;
            break;
          }
        }
        results[i] = inWord ? 1 : 0;
        allCorrect = false;
      }
    }

    // Update game state
    games[msg.sender].guessCount++;
    if (allCorrect) {
      games[msg.sender].completed = true;
      games[msg.sender].won = true;
      emit GameCompleted(msg.sender, true);
    } else if (games[msg.sender].guessCount >= MAX_GUESSES) {
      games[msg.sender].completed = true;
      emit GameCompleted(msg.sender, false);
    }

    emit GuessSubmitted(msg.sender, games[msg.sender].guessCount);
    return results;
  }

  /// @notice Returns true if a new daily word is available for caller
  function hasNewDailyWord() external view returns (bool) {
    uint256 currentDay = block.timestamp / 86400;
    return !games[msg.sender].initialized || games[msg.sender].gameDay != currentDay;
  }

  /// @notice Reset the caller's game state
  function resetGame() external {
    if (games[msg.sender].initialized) {
      games[msg.sender].initialized = false;
      games[msg.sender].guessCount = 0;
      games[msg.sender].completed = false;
      games[msg.sender].won = false;
    }
    emit GameReset(msg.sender);
  }

  /// @notice Owner can add new unique-letter word to the list
  function addWord(string calldata newWord) external {
    require(msg.sender == owner, "Only owner");
    require(bytes(newWord).length == WORD_LENGTH, "Word must be 5 letters");

    bool[] memory seen = new bool[](26);
    bytes memory w = bytes(newWord);
    for (uint256 i = 0; i < w.length; i++) {
      uint8 c = uint8(w[i]);
      require(c >= 65 && c <= 90, "Invalid character");
      uint8 idx = c - 65;
      require(!seen[idx], "Duplicate letter");
      seen[idx] = true;
    }

    wordList.push(newWord);
  }
}