// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IVault {
    function BUYBACK_BPS() external view returns (uint256);
    function sweep(address to, uint256 amount) external;
}

interface IIntake {
    function forward(address asset, uint256 amount) external;
}

interface ISplitter {
    function executeBuyback(uint256 amount, uint256 minTokensOut) external;
}

/// One call: vault buyback share → intake → splitter → burner.
/// The vault, intake, and splitter must name this contract as owner.
contract ZenzeFeeRouter {
    address public owner;
    IVault public immutable vault;
    IIntake public immutable intake;
    ISplitter public immutable splitter;

    error NotOwner();
    error Zero();

    event OwnerSet(address indexed owner);
    event Ran(uint256 swept, uint256 burnedEth);

    constructor(address vault_, address intake_, address splitter_, address owner_) {
        if (vault_ == address(0) || intake_ == address(0) || splitter_ == address(0) || owner_ == address(0)) revert Zero();
        vault = IVault(vault_);
        intake = IIntake(intake_);
        splitter = ISplitter(splitter_);
        owner = owner_;
        emit OwnerSet(owner_);
    }

    function setOwner(address next) external {
        if (msg.sender != owner) revert NotOwner();
        if (next == address(0)) revert Zero();
        owner = next;
        emit OwnerSet(next);
    }

    function run(uint256 minTokensOut) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 share = address(vault).balance * vault.BUYBACK_BPS() / 10_000;
        if (share > 0) vault.sweep(address(intake), share);
        uint256 held = address(intake).balance;
        if (held > 0) intake.forward(address(0), held);
        uint256 pile = address(splitter).balance;
        if (pile == 0) revert Zero();
        splitter.executeBuyback(pile, minTokensOut);
        emit Ran(share, pile);
    }
}
