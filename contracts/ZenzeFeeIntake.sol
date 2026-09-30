// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IERC20Mini {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IZenzeSplitterNote {
    function note(address asset) external;
}

/// First stop for protocol fees. Nothing is priced or swapped here.
/// The owner forwards a held asset to the buyback splitter.
contract ZenzeFeeIntake {
    address public owner;
    address public splitter;
    address[] public assets;
    mapping(address => bool) public listed;

    error NotOwner();
    error Zero();
    error Eth();
    error Transfer();

    event OwnerSet(address indexed owner);
    event SplitterSet(address indexed splitter);
    event Forwarded(address indexed asset, address indexed to, uint256 amount);

    constructor(address owner_) {
        if (owner_ == address(0)) revert Zero();
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

    function setSplitter(address next) external onlyOwner {
        if (next == address(0)) revert Zero();
        splitter = next;
        emit SplitterSet(next);
    }

    function assetCount() external view returns (uint256) {
        return assets.length;
    }

    /// Index an ERC-20 that was transferred in. The balance itself is the inventory.
    function note(address asset) external {
        if (asset == address(0)) revert Zero();
        if (IERC20Mini(asset).balanceOf(address(this)) == 0) revert Zero();
        _list(asset);
    }

    /// Push inventory to the splitter. address(0) is native ETH.
    function forward(address asset, uint256 amount) external onlyOwner {
        address to = splitter;
        if (to == address(0) || amount == 0) revert Zero();
        if (asset == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert Eth();
        } else {
            if (!IERC20Mini(asset).transfer(to, amount)) revert Transfer();
            IZenzeSplitterNote(to).note(asset);
        }
        emit Forwarded(asset, to, amount);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function _list(address asset) private {
        if (listed[asset]) return;
        listed[asset] = true;
        assets.push(asset);
    }
}
