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
/// was taken. Anything else an owner's vault paid here can be sent back by anyone with `reject`.
/// For the same reason the pool keeps its own books: a premium counts as the pool's only once the
/// cover it paid for has settled, so money that merely landed here can't be withdrawn or promised.
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

    /// USDC promised to open offers and covers. Never more than the pool has booked.
    uint256 public locked;
    /// What the pool counts as its own: deposits, less withdrawals and payouts, plus premiums earned.
    uint256 private booked;
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

    /// @notice What depositors' shares are worth in total. Premiums for cover still open, and
    /// anything sent here that the pool didn't ask for, are held but not counted.
    function totalAssets() public view override returns (uint256) {
        return booked;
    }

    /// @notice USDC in the pool that isn't promised to anyone.
    function freeAssets() public view returns (uint256) {
        return booked - locked;
    }

    /// @notice Whether the owner's agent paid the premium for this offer, on exactly its terms and
    /// before it lapsed.
    function taken(bytes32 hedgeId) public view returns (bool) {
        Offer storage o = offers[hedgeId];
        if (o.status != OfferStatus.Live) return false;
        (bool open, bool matches,) = _onMandate(o.owner, hedgeId, o);
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
        if (onMarket > (booked * maxMarketShareBps) / 10_000) revert TooMuchOnOneMarket();

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
        (address owner, uint256 payout) = (o.owner, happened ? o.payout : 0);
        _release(o);
        // the premium is earned now, whichever way it went
        booked = booked + o.premium - payout;
        _close(
            owner,
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
        _close(owner, hedgeId, AwningMandate.HedgeStatus.Refunded, premium, evidence);
        emit Voided(hedgeId, owner, premium, evidence);
    }

    /// @notice Anyone. If no result has been reported by the deadline, the owner gets the payout,
    /// so a resolver that disappears can't leave cover unpaid.
    function claimUnresolved(bytes32 hedgeId) external nonReentrant {
        Offer storage o = _takenOffer(hedgeId);
        if (block.timestamp <= o.resolveBy) revert StillOpen();
        (address owner, uint256 payout) = (o.owner, o.payout);
        _release(o);
        booked = booked + o.premium - payout;
        _close(owner, hedgeId, AwningMandate.HedgeStatus.Paid, payout, bytes32(0));
        emit ClaimedUnresolved(hedgeId, owner, payout);
    }

    /// @notice Anyone. Unlock an offer nobody took in time. A premium paid late, or on other terms,
    /// doesn't count as taking it; `reject` sends that back.
    function lapse(bytes32 hedgeId) external nonReentrant {
        Offer storage o = offers[hedgeId];
        if (o.status != OfferStatus.Live) revert OfferNotLive();
        if (block.timestamp <= o.takeBy) revert StillOpen();
        (bool open, bool matches,) = _onMandate(o.owner, hedgeId, o);
        if (open && matches) revert AlreadyTaken();
        _release(o);
        emit Lapsed(hedgeId);
    }

    /// @notice Anyone. Send back a premium an owner's vault paid the pool without taking a live
    /// offer: no offer at all, different terms, or too late. A stolen agent key paying the pool
    /// directly produces exactly this.
    function reject(address owner, bytes32 hedgeId) external nonReentrant {
        Offer storage o = offers[hedgeId];
        (bool open, bool matches, uint256 premium) = _onMandate(owner, hedgeId, o);
        if (!open) revert NothingToReject();
        if (o.status == OfferStatus.Live && o.owner == owner) {
            if (matches) revert AlreadyTaken();
            // this owner's id is spent on the mandate, so the offer made to them can never be taken
            _release(o);
        }
        _close(owner, hedgeId, AwningMandate.HedgeStatus.Refunded, premium, bytes32(0));
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

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
    {
        super._deposit(caller, receiver, assets, shares);
        booked += assets;
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        booked -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _takenOffer(bytes32 hedgeId) private view returns (Offer storage o) {
        o = offers[hedgeId];
        if (o.status != OfferStatus.Live) revert OfferNotLive();
        (bool open, bool matches,) = _onMandate(o.owner, hedgeId, o);
        if (!open || !matches) revert NotTaken();
    }

    /// @dev What the mandate holds for this owner under this id: whether it is an open hedge paid
    /// to this pool, whether it took the offer (same owner and terms, paid before the offer
    /// lapsed), and the premium it paid.
    function _onMandate(address owner, bytes32 hedgeId, Offer storage o)
        private
        view
        returns (bool open, bool matches, uint256 premium)
    {
        address venue;
        uint96 maxPayout;
        uint64 openedAt;
        AwningMandate.HedgeStatus status;
        bytes32 marketRef;
        (, venue, premium, maxPayout, openedAt, status, marketRef) =
            mandate.hedges(mandate.hedgeKey(owner, hedgeId));
        open = status == AwningMandate.HedgeStatus.Open && venue == address(this);
        matches = owner == o.owner && premium == o.premium && maxPayout == o.payout
            && marketRef == o.marketRef && openedAt <= o.takeBy;
    }

    function _release(Offer storage o) private {
        o.status = OfferStatus.Closed;
        locked -= o.payout;
        exposure[o.marketRef] -= o.payout;
    }

    function _close(
        address owner,
        bytes32 hedgeId,
        AwningMandate.HedgeStatus outcome,
        uint256 amount,
        bytes32 evidence
    ) private {
        if (amount != 0) {
            IERC20(asset()).forceApprove(address(mandate), amount);
        }
        mandate.closeHedge(owner, hedgeId, outcome, amount, evidence);
    }
}
