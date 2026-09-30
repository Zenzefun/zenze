// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// Native-quote bonding curve. Same buy/sell views the app already calls.
/// 2% fee is forwarded to the fee vault. Creator tax is zero on purpose.
contract ZenzeCurve {
    uint256 public constant FEE_BPS = 200;
    uint256 public constant MAX_CREATOR_TAX_BPS = 1000;
    address public immutable token;
    address public immutable quote;
    address public immutable creator;
    address public immutable feeVault;
    uint256 public immutable virtualBase;
    uint256 public immutable virtualTokens;
    uint256 public immutable graduateAt;
    uint256 public immutable launchedAt;
    uint16 public constant creatorTaxBps = 0;

    uint256 public realBase;
    uint256 public tokensSold;
    bool public graduated;
    string public imageURI;
    uint256 private locked;

    error Slippage();
    error Closed();
    error Empty();
    error Transfer();
    error Reentrancy();

    event Buy(address indexed buyer, uint256 baseIn, uint256 tokensOut, uint256 fee);
    event Sell(address indexed seller, uint256 tokensIn, uint256 baseOut, uint256 fee);
    event Graduated(uint256 realBase);
    event ImageSet(string uri);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    constructor(
        address token_,
        address vault_,
        address creator_,
        uint256 virtualBase_,
        uint256 virtualTokens_,
        uint256 graduateAt_
    ) {
        if (token_ == address(0) || vault_ == address(0) || creator_ == address(0)) revert Empty();
        token = token_;
        quote = address(0);
        feeVault = vault_;
        creator = creator_;
        virtualBase = virtualBase_;
        virtualTokens = virtualTokens_;
        graduateAt = graduateAt_;
        launchedAt = block.timestamp;
    }

    receive() external payable {}

    modifier lock() {
        if (locked != 0) revert Reentrancy();
        locked = 1;
        _;
        locked = 0;
    }

    function holderSharing() external pure returns (bool) {
        return false;
    }

    function creatorAccrued() external pure returns (uint256) {
        return 0;
    }

    function pendingHolderFees(address) external pure returns (uint256) {
        return 0;
    }

    function claimCreatorFees() external pure {
        revert Empty();
    }

    function claimHolderFees() external pure {
        revert Empty();
    }

    function buy(uint256 minTokensOut) external payable {
        _buy(msg.value, minTokensOut);
    }

    function buyFor(uint256 amount, uint256 minTokensOut) external payable {
        if (msg.value != amount) revert Empty();
        _buy(amount, minTokensOut);
    }

    function sell(uint256 tokenIn) external {
        _sell(tokenIn, 0);
    }

    function sellFor(uint256 tokenIn, uint256 minQuoteOut) external {
        _sell(tokenIn, minQuoteOut);
    }

    function setImageURI(string calldata uri) external {
        if (msg.sender != creator) revert Closed();
        imageURI = uri;
        emit ImageSet(uri);
    }

    function spotPrice() external view returns (uint256) {
        uint256 y = virtualTokens - tokensSold;
        if (y == 0) return 0;
        return ((virtualBase + realBase) * 1e18) / y;
    }

    function _buy(uint256 amount, uint256 minTokensOut) private lock {
        if (amount == 0) revert Empty();
        if (graduated) revert Closed();
        uint256 fee = (amount * FEE_BPS) / 10_000;
        uint256 net = amount - fee;
        uint256 x = virtualBase + realBase;
        uint256 y = virtualTokens - tokensSold;
        uint256 out = y - ((x * y) / (x + net));
        if (out == 0 || out < minTokensOut) revert Slippage();
        if (out > IERC20(token).balanceOf(address(this))) revert Empty();
        realBase += net;
        tokensSold += out;
        if (realBase >= graduateAt) {
            graduated = true;
            emit Graduated(realBase);
        }
        _send(feeVault, fee);
        if (!IERC20(token).transfer(msg.sender, out)) revert Transfer();
        emit Buy(msg.sender, amount, out, fee);
    }

    function _sell(uint256 tokenIn, uint256 minQuoteOut) private lock {
        if (tokenIn == 0 || tokenIn > tokensSold) revert Empty();
        uint256 x = virtualBase + realBase;
        uint256 y = virtualTokens - tokensSold;
        uint256 newY = y + tokenIn;
        uint256 k = x * y;
        uint256 newX = (k + newY - 1) / newY;
        if (newX >= x) revert Slippage();
        uint256 gross = x - newX;
        if (gross > realBase) gross = realBase;
        uint256 fee = (gross * FEE_BPS) / 10_000;
        uint256 net = gross - fee;
        if (net == 0 || net < minQuoteOut) revert Slippage();
        tokensSold -= tokenIn;
        realBase -= gross;
        if (!IERC20(token).transferFrom(msg.sender, address(this), tokenIn)) revert Transfer();
        _send(feeVault, fee);
        _send(msg.sender, net);
        emit Sell(msg.sender, tokenIn, net, fee);
    }

    function _send(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert Transfer();
    }
}
