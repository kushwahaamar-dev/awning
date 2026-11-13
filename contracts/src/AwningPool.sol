// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AwningMandate} from "./AwningMandate.sol";

/// @title AwningPool
/// @notice A USDC pool that writes cover. The underwriter posts an offer, which locks the whole
/// payout in this contract. An owner's agent accepts it by paying the premium through
/// AwningMandate with this pool as the venue. When the resolver reports whether the event
/// happened, the pool pays the owner's vault or keeps the premium. Depositors hold ERC-4626
/// shares and can only withdraw what is not locked behind open cover.
/// @dev The pool never learns of a premium arriving; it reads the mandate to see whether an offer
/// was taken. Terms that don't match an offer exactly can be sent back by anyone with `reject`.
contract AwningPool is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum OfferStatus {
        None,
        Live,
        Closed
    }

    struct Offer {
        address owner;
        uint96 premium;
        uint96 payout;
        /// The offer lapses if the premium hasn't been paid by this time.
        uint64 takeBy;
        /// If nobody has reported a result by this time, the owner may claim the payout.
        uint64 resolveBy;
        OfferStatus status;
        bytes32 marketRef;
    }

    AwningMandate public immutable mandate;
    address public immutable underwriter;
    address public immutable resolver;
    /// Most of the pool that may ride on a single market, in basis points of its assets.
    uint16 public immutable maxMarketShareBps;

    /// USDC promised to open offers and covers. Never more than the pool holds.
    uint256 public locked;
    mapping(bytes32 hedgeId => Offer) public offers;
    mapping(bytes32 marketRef => uint256) public exposure;

    event Offered(
        bytes32 indexed hedgeId,
        address indexed owner,
        uint256 premium,
        uint256 payout,
        bytes32 marketRef,
        uint64 takeBy,
        uint64 resolveBy
    );
    event Settled(
        bytes32 indexed hedgeId,
        address indexed owner,
        bool happened,
        uint256 payout,
        bytes32 evidence
    );
    event Voided(
        bytes32 indexed hedgeId, address indexed owner, uint256 refunded, bytes32 evidence
    );
    event Lapsed(bytes32 indexed hedgeId);
    event Rejected(bytes32 indexed hedgeId, address indexed owner, uint256 refunded);
    event ClaimedUnresolved(bytes32 indexed hedgeId, address indexed owner, uint256 payout);

    error NotUnderwriter();
    error NotResolver();
    error ZeroAddress();
    error BadTerms();
    error OfferExists();
    error OfferNotLive();
    error NotEnoughFree();
    error TooMuchOnOneMarket();
    error NotTaken();
    error AlreadyTaken();
    error StillOpen();
    error NothingToReject();

    constructor(
        AwningMandate mandate_,
        address underwriter_,
        address resolver_,
        uint16 maxMarketShareBps_
    ) ERC20("Awning Pool", "awnUSDC") ERC4626(mandate_.usdc()) {
        if (underwriter_ == address(0) || resolver_ == address(0)) {
            revert ZeroAddress();
        }
        if (maxMarketShareBps_ == 0 || maxMarketShareBps_ > 10_000) revert BadTerms();
        mandate = mandate_;
        underwriter = underwriter_;
        resolver = resolver_;
        maxMarketShareBps = maxMarketShareBps_;
    }

    /// @notice USDC in the pool that isn't promised to anyone.
    function freeAssets() public view returns (uint256) {
        uint256 held = totalAssets();
        return held > locked ? held - locked : 0;
    }

    /// @notice Whether the owner's agent has paid the premium for this offer, on exactly its terms.
    function taken(bytes32 hedgeId) public view returns (bool) {
        Offer storage o = offers[hedgeId];
        if (o.status != OfferStatus.Live) return false;
        (bool open, bool matches,,) = _onMandate(hedgeId, o);
        return open && matches;
    }

    /// @notice Underwriter only. Offer cover and lock its whole payout until the offer lapses or
    /// the cover settles.
    function offer(
        bytes32 hedgeId,
        address owner,
        uint96 premium,
        uint96 payout,
        bytes32 marketRef,
        uint64 takeBy,
        uint64 resolveBy
    ) external nonReentrant {
        if (msg.sender != underwriter) revert NotUnderwriter();
        if (owner == address(0)) revert ZeroAddress();
        if (premium == 0 || payout <= premium || takeBy <= block.timestamp || resolveBy <= takeBy) {
            revert BadTerms();
        }
        if (offers[hedgeId].status != OfferStatus.None) revert OfferExists();
        if (payout > freeAssets()) revert NotEnoughFree();

        uint256 onMarket = exposure[marketRef] + payout;
        if (onMarket > (totalAssets() * maxMarketShareBps) / 10_000) revert TooMuchOnOneMarket();

        exposure[marketRef] = onMarket;
        locked += payout;
        offers[hedgeId] = Offer({
            owner: owner,
            premium: premium,
            payout: payout,
            takeBy: takeBy,
            resolveBy: resolveBy,
            status: OfferStatus.Live,
            marketRef: marketRef
        });
        emit Offered(hedgeId, owner, premium, payout, marketRef, takeBy, resolveBy);
    }

    /// @notice Resolver only. Report whether the event happened. If it did, the payout goes to the
    /// owner's vault; if not, the pool keeps the premium. `evidence` is only emitted.
    function settle(bytes32 hedgeId, bool happened, bytes32 evidence) external nonReentrant {
        if (msg.sender != resolver) revert NotResolver();
        Offer storage o = _takenOffer(hedgeId);
        uint256 payout = happened ? o.payout : 0;
        address owner = o.owner;
        _release(o);
        _close(
            hedgeId,
            happened ? AwningMandate.HedgeStatus.Paid : AwningMandate.HedgeStatus.Expired,
            payout,
            evidence
        );
        emit Settled(hedgeId, owner, happened, payout, evidence);
    }

    /// @notice Resolver only. The market was cancelled, so the premium goes back.
    function refund(bytes32 hedgeId, bytes32 evidence) external nonReentrant {
        if (msg.sender != resolver) revert NotResolver();
        Offer storage o = _takenOffer(hedgeId);
        (address owner, uint256 premium) = (o.owner, o.premium);
        _release(o);
        _close(hedgeId, AwningMandate.HedgeStatus.Refunded, premium, evidence);
        emit Voided(hedgeId, owner, premium, evidence);
    }

    /// @notice Anyone. If no result has been reported by the deadline, the owner gets the payout,
    /// so a resolver that disappears can't leave cover unpaid.
    function claimUnresolved(bytes32 hedgeId) external nonReentrant {
        Offer storage o = _takenOffer(hedgeId);
        if (block.timestamp <= o.resolveBy) revert StillOpen();
        (address owner, uint256 payout) = (o.owner, o.payout);
        _release(o);
        _close(hedgeId, AwningMandate.HedgeStatus.Paid, payout, bytes32(0));
        emit ClaimedUnresolved(hedgeId, owner, payout);
    }

    /// @notice Anyone. Unlock an offer nobody took in time.
    function lapse(bytes32 hedgeId) external nonReentrant {
        Offer storage o = offers[hedgeId];
        if (o.status != OfferStatus.Live) revert OfferNotLive();
        if (block.timestamp <= o.takeBy) revert StillOpen();
        (bool open,,,) = _onMandate(hedgeId, o);
        if (open) revert AlreadyTaken();
        _release(o);
        emit Lapsed(hedgeId);
    }

    /// @notice Anyone. Send back a premium that reached the pool without a matching live offer,
    /// which is what a stolen agent key paying the pool directly would produce.
    function reject(bytes32 hedgeId) external nonReentrant {
        Offer storage o = offers[hedgeId];
        (bool open, bool matches, uint256 premium, address owner) = _onMandate(hedgeId, o);
        if (!open) revert NothingToReject();
        if (o.status == OfferStatus.Live) {
            if (matches) revert AlreadyTaken();
            // the hedge id is spent on the mandate, so this offer can never be taken
            _release(o);
        }
        _close(hedgeId, AwningMandate.HedgeStatus.Refunded, premium, bytes32(0));
        emit Rejected(hedgeId, owner, premium);
    }

    /// @dev Depositors can only take out what isn't locked behind cover.
    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 free = freeAssets();
        uint256 owned = super.maxWithdraw(owner);
        return owned < free ? owned : free;
    }

    /// @dev See `maxWithdraw`.
    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 free = convertToShares(freeAssets());
        uint256 owned = super.maxRedeem(owner);
        return owned < free ? owned : free;
    }

    function _takenOffer(bytes32 hedgeId) private view returns (Offer storage o) {
        o = offers[hedgeId];
        if (o.status != OfferStatus.Live) revert OfferNotLive();
        (bool open, bool matches,,) = _onMandate(hedgeId, o);
        if (!open || !matches) revert NotTaken();
    }

    /// @dev What the mandate holds under this id: whether it is an open hedge paid to this pool,
    /// whether its terms are exactly the offer's, the premium it paid, and whose vault paid it.
    function _onMandate(bytes32 hedgeId, Offer storage o)
        private
        view
        returns (bool open, bool matches, uint256 premium, address owner)
    {
        address venue;
        uint96 maxPayout;
        AwningMandate.HedgeStatus status;
        bytes32 marketRef;
        (owner, venue, premium, maxPayout,, status, marketRef) = mandate.hedges(hedgeId);
        open = status == AwningMandate.HedgeStatus.Open && venue == address(this);
        matches = owner == o.owner && premium == o.premium && maxPayout == o.payout
            && marketRef == o.marketRef;
    }

    function _release(Offer storage o) private {
        o.status = OfferStatus.Closed;
        locked -= o.payout;
        exposure[o.marketRef] -= o.payout;
    }

    function _close(
        bytes32 hedgeId,
        AwningMandate.HedgeStatus outcome,
        uint256 amount,
        bytes32 evidence
    ) private {
        if (amount != 0) IERC20(asset()).forceApprove(address(mandate), amount);
        mandate.closeHedge(hedgeId, outcome, amount, evidence);
    }
}
