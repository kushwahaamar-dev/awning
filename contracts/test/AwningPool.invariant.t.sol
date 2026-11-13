// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AwningMandate} from "../src/AwningMandate.sol";
import {AwningPool} from "../src/AwningPool.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// Drives the pool with a random mix of everything its participants can do.
contract PoolHandler is Test {
    MockUSDC public usdc;
    AwningMandate public mandate;
    AwningPool public pool;

    address public owner = makeAddr("owner");
    address public agent = makeAddr("agent");
    address public underwriter = makeAddr("underwriter");
    address public resolver = makeAddr("resolver");
    address public backer = makeAddr("backer");

    bytes32[] public ids;
    bytes32[] public strays;
    bytes32[3] public markets = [keccak256("m0"), keccak256("m1"), keccak256("m2")];
    uint256 public paidOut;
    uint256 public settled;

    constructor(MockUSDC usdc_, AwningMandate mandate_, AwningPool pool_) {
        (usdc, mandate, pool) = (usdc_, mandate_, pool_);
        usdc.mint(backer, 1_000_000e6);
        vm.prank(backer);
        usdc.approve(address(pool), type(uint256).max);

        usdc.mint(owner, 1_000_000e6);
        vm.startPrank(owner);
        usdc.approve(address(mandate), type(uint256).max);
        mandate.deposit(1_000_000e6);
        mandate.setPolicy(
            agent, type(uint64).max, 0, type(uint96).max, type(uint96).max, type(uint96).max
        );
        mandate.setVenue(address(pool), true);
        vm.stopPrank();
    }

    function count() external view returns (uint256) {
        return ids.length;
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 1e6, 50_000e6);
        vm.prank(backer);
        pool.deposit(amount, backer);
    }

    function withdraw(uint256 amount) external {
        uint256 most = pool.maxWithdraw(backer);
        if (most == 0) return;
        vm.prank(backer);
        pool.withdraw(bound(amount, 1, most), backer, backer);
    }

    function offer(uint96 premium, uint96 payout, uint8 market) external {
        uint256 free = pool.freeAssets();
        if (free < 2) return;
        payout = uint96(bound(payout, 2, free));
        premium = uint96(bound(premium, 1, payout - 1));
        bytes32 id = keccak256(abi.encode(ids.length));
        vm.prank(underwriter);
        try pool.offer(
            id,
            owner,
            premium,
            payout,
            markets[market % 3],
            uint64(block.timestamp + 5 minutes),
            uint64(block.timestamp + 3 days)
        ) {
            ids.push(id);
        } catch {}
    }

    /// The agent pays for an offer, sometimes on terms that don't match it, sometimes too late.
    function take(uint256 pick, bool exact, bool late) external {
        if (ids.length == 0) return;
        if (late) vm.warp(block.timestamp + 6 minutes);
        bytes32 id = ids[pick % ids.length];
        (, uint96 premium, uint96 payout,,, AwningPool.OfferStatus status, bytes32 market) =
            pool.offers(id);
        if (status != AwningPool.OfferStatus.Live) return;
        vm.prank(agent);
        try mandate.openHedge(
            owner, id, address(pool), premium, exact ? payout : uint256(payout) + 1, market, 0, ""
        ) {}
            catch {}
    }

    function settle(uint256 pick, bool happened) external {
        if (ids.length == 0) return;
        bytes32 id = ids[pick % ids.length];
        (,, uint96 payout,,,,) = pool.offers(id);
        vm.prank(resolver);
        try pool.settle(id, happened, bytes32(0)) {
            settled++;
            if (happened) paidOut += payout;
        } catch {}
    }

    /// The agent pays the pool for cover nobody offered.
    function stray(uint96 amount) external {
        bytes32 id = keccak256(abi.encode("stray", strays.length));
        amount = uint96(bound(amount, 1, 1_000e6));
        vm.prank(agent);
        try mandate.openHedge(owner, id, address(pool), amount, amount, bytes32(0), 0, "") {
            strays.push(id);
        } catch {}
    }

    function reject(uint256 pick, bool aStray) external {
        bytes32[] storage from = aStray ? strays : ids;
        if (from.length == 0) return;
        try pool.reject(owner, from[pick % from.length]) {} catch {}
    }

    function lapse(uint256 pick, uint32 wait) external {
        if (ids.length == 0) return;
        vm.warp(block.timestamp + bound(wait, 0, 10 minutes));
        try pool.lapse(ids[pick % ids.length]) {} catch {}
    }
}

contract AwningPoolInvariantTest is Test {
    MockUSDC usdc;
    AwningMandate mandate;
    AwningPool pool;
    PoolHandler handler;

    function setUp() public {
        vm.warp(680 * 30 days);
        usdc = new MockUSDC();
        mandate = new AwningMandate(usdc);
        handler = new PoolHandler(usdc, mandate, pool = _pool());
        targetContract(address(handler));
    }

    function _pool() private returns (AwningPool) {
        return new AwningPool(mandate, makeAddr("underwriter"), makeAddr("resolver"), 5_000);
    }

    /// Everything promised to open offers and covers is on the pool's books, and everything on
    /// its books is really in the pool.
    function invariant_holds_what_it_has_locked() public view {
        assertGe(pool.totalAssets(), pool.locked());
        assertGe(usdc.balanceOf(address(pool)), pool.totalAssets());
    }

    /// `locked` is exactly the payouts of the offers still live, and matches the per-market tally.
    function invariant_locked_is_the_sum_of_live_offers() public view {
        uint256 live;
        for (uint256 i; i < handler.count(); i++) {
            (,, uint96 payout,,, AwningPool.OfferStatus status,) = pool.offers(handler.ids(i));
            if (status == AwningPool.OfferStatus.Live) live += payout;
        }
        assertEq(pool.locked(), live);
        assertEq(
            pool.exposure(handler.markets(0)) + pool.exposure(handler.markets(1))
                + pool.exposure(handler.markets(2)),
            live
        );
    }

    /// A market's tally is part of what is locked, so it can never exceed what the pool holds.
    function invariant_no_market_exceeds_the_pool() public view {
        for (uint256 i; i < 3; i++) {
            assertLe(pool.exposure(handler.markets(i)), usdc.balanceOf(address(pool)));
        }
    }

    /// Payouts and refunds land in the owner's vault, and the mandate holds every dollar of it.
    function invariant_the_mandate_holds_the_owners_vault() public view {
        assertGe(usdc.balanceOf(address(mandate)), mandate.balanceOf(handler.owner()));
    }
}
