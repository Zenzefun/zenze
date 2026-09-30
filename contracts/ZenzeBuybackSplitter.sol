// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IERC20Mini {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IZenzeBurner {
    function buyback(uint256 minTokensOut) external payable;
    function buybackHeld(uint256 minTokensOut) external;
    function sweepEth(address to, uint256 amount) external;
}

/// Holds the buyback share. Native ETH can be sent to the burner, which buys
/// $ZNZF and burns it in the same transaction. Pair assets stay here until the
/// owner moves them. This contract does not swap them.
contract ZenzeBuybackSplitter {
    address public owner;
    address public intake;
    IZenzeBurner public immutable burner;
    address[] public assets;
    mapping(address => bool) public listed;

    error NotAllowed();
    error Zero();
    error Eth();
    error Transfer();

    event OwnerSet(address indexed owner);
    event IntakeSet(address indexed intake);
    event BuybackSent(uint256 amount, uint256 minOut);

    constructor(address burner_, address owner_) {
        if (burner_ == address(0) || owner_ == address(0)) revert Zero();
        burner = IZenzeBurner(burner_);
        owner = owner_;
        emit OwnerSet(owner_);
    }

    receive() external payable {
        _list(address(0));
    }

    function setOwner(address next) external onlyOwner {
        if (next == address(0)) revert Zero();
        owner = next;
        emit OwnerSet(next);
    }

    function setIntake(address next) external onlyOwner {
        if (next == address(0)) revert Zero();
        intake = next;
        emit IntakeSet(next);
    }

    function assetCount() external view returns (uint256) {
        return assets.length;
    }

    function note(address asset) external {
        if (asset == address(0)) revert Zero();
        if (IERC20Mini(asset).balanceOf(address(this)) == 0) revert Zero();
        _list(asset);
    }

    /// Spend native inventory through the burner. The burner owner must be this contract.
    function executeBuyback(uint256 amount, uint256 minTokensOut) external onlyOwner {
        if (amount == 0 || amount > address(this).balance) revert Zero();
        burner.buyback{value: amount}(minTokensOut);
        emit BuybackSent(amount, minTokensOut);
    }

    /// Spend ETH sent with this call. It does not sit in the splitter.
    function executeBuybackValue(uint256 minTokensOut) external payable onlyOwner {
        if (msg.value == 0) revert Zero();
        burner.buyback{value: msg.value}(minTokensOut);
        emit BuybackSent(msg.value, minTokensOut);
    }

    /// Burn ETH that is already on the burner.
    function executeHeld(uint256 minTokensOut) external onlyOwner {
        burner.buybackHeld(minTokensOut);
    }

    /// Pull ETH back off the burner. Only works after this contract is the burner owner.
    function recoverBurner(address to, uint256 amount) external onlyOwner {
        if (to == address(0) || amount == 0) revert Zero();
        burner.sweepEth(to, amount);
    }

    /// Explicit owner move. There is no router and no automatic sale.
    function move(address asset, address to, uint256 amount) external onlyOwner {
        if (to == address(0) || amount == 0) revert Zero();
        if (asset == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert Eth();
            return;
        }
        if (!IERC20Mini(asset).transfer(to, amount)) revert Transfer();
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAllowed();
        _;
    }

    function _list(address asset) private {
        if (listed[asset]) return;
        listed[asset] = true;
        assets.push(asset);
    }
}
