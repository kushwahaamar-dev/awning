// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AwningMandate} from "../src/AwningMandate.sol";
import {AwningPool} from "../src/AwningPool.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract AwningPoolTest is Test {
    uint256 constant T0 = 680 * 30 days;
    uint256 constant SEED = 10_000e6;
    uint96 constant PREMIUM = 6e6;
    uint96 constant PAYOUT = 300e6;

    MockUSDC usdc;
    AwningMandate mandate;
    AwningPool pool;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address underwriter = makeAddr("underwriter");
    address resolver = makeAddr("resolver");
    address backer = makeAddr("backer");
    address stranger = makeAddr("stranger");

    bytes32 constant H1 = keccak256("hedge-1");
    bytes32 constant H2 = keccak256("hedge-2");
    bytes32 constant MARKET = keccak256("gemini:austin-high");
    bytes32 constant EVIDENCE = keccak256("resolution");

    uint64 takeBy;
    uint64 resolveBy;

    function setUp() public {
        vm.warp(T0);
        usdc = new MockUSDC();
        mandate = new AwningMandate(usdc);
        pool = new AwningPool(mandate, underwriter, resolver, 5_000);
        takeBy = uint64(block.timestamp + 5 minutes);
        resolveBy = uint64(block.timestamp + 3 days);

        usdc.mint(backer, SEED);
        vm.startPrank(backer);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(SEED, backer);
        vm.stopPrank();

        usdc.mint(owner, 1_000e6);
        vm.startPrank(owner);
        usdc.approve(address(mandate), type(uint256).max);
        mandate.deposit(1_000e6);
        mandate.setPolicy(agent, uint64(block.timestamp + 90 days), 2e6, 500e6, 1_500e6, 100e6);
        mandate.setVenue(address(pool), true);
        vm.stopPrank();
    }

    function _offer(bytes32 id) internal {
        vm.prank(underwriter);
        pool.offer(id, owner, PREMIUM, PAYOUT, MARKET, takeBy, resolveBy);
    }

    function _take(bytes32 id, uint256 premium, uint256 payout, bytes32 market) internal {
        vm.prank(agent);
        assertTrue(mandate.openHedge(owner, id, address(pool), premium, payout, market, 0, ""));
    }

    function _status(bytes32 id) internal view returns (AwningPool.OfferStatus status) {
        (,,,,, status,) = pool.offers(id);
    }

    // --- offering ---

    function test_offer_locks_the_whole_payout() public {
        _offer(H1);
        assertEq(pool.locked(), PAYOUT);
        assertEq(pool.exposure(MARKET), PAYOUT);
        assertEq(pool.freeAssets(), SEED - PAYOUT);
        assertFalse(pool.taken(H1));
    }

    function test_offer_only_from_the_underwriter() public {
        vm.prank(stranger);
        vm.expectRevert(AwningPool.NotUnderwriter.selector);
        pool.offer(H1, owner, PREMIUM, PAYOUT, MARKET, takeBy, resolveBy);
    }

    function test_offer_rejects_bad_terms() public {
        vm.startPrank(underwriter);
        vm.expectRevert(AwningPool.BadTerms.selector);
        pool.offer(H1, owner, 0, PAYOUT, MARKET, takeBy, resolveBy);
        vm.expectRevert(AwningPool.BadTerms.selector);
        pool.offer(H1, owner, PAYOUT, PAYOUT, MARKET, takeBy, resolveBy);
        vm.expectRevert(AwningPool.BadTerms.selector);
        pool.offer(H1, owner, PREMIUM, PAYOUT, MARKET, uint64(block.timestamp), resolveBy);
        vm.expectRevert(AwningPool.BadTerms.selector);
        pool.offer(H1, owner, PREMIUM, PAYOUT, MARKET, takeBy, takeBy);
        vm.expectRevert(AwningPool.ZeroAddress.selector);
        pool.offer(H1, address(0), PREMIUM, PAYOUT, MARKET, takeBy, resolveBy);
        vm.stopPrank();
    }

    function test_offer_cannot_reuse_an_id() public {
        _offer(H1);
        vm.prank(underwriter);
        vm.expectRevert(AwningPool.OfferExists.selector);
        pool.offer(H1, owner, PREMIUM, PAYOUT, MARKET, takeBy, resolveBy);
    }

    function test_offer_cannot_promise_more_than_is_free() public {
        vm.prank(underwriter);
        vm.expectRevert(AwningPool.NotEnoughFree.selector);
        pool.offer(H1, owner, PREMIUM, uint96(SEED + 1), MARKET, takeBy, resolveBy);
    }

    function test_offer_caps_what_rides_on_one_market() public {
        vm.startPrank(underwriter);
        pool.offer(H1, owner, PREMIUM, uint96(SEED / 2), MARKET, takeBy, resolveBy);
        vm.expectRevert(AwningPool.TooMuchOnOneMarket.selector);
        pool.offer(H2, owner, PREMIUM, 7e6, MARKET, takeBy, resolveBy);
        // a different market still has room
        pool.offer(H2, owner, PREMIUM, 7e6, keccak256("other"), takeBy, resolveBy);
        vm.stopPrank();
    }

    // --- taking and settling ---

    function test_taken_once_the_mandate_pays_on_exact_terms() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        assertTrue(pool.taken(H1));
        assertEq(usdc.balanceOf(address(pool)), SEED + PREMIUM);
        assertEq(pool.locked(), PAYOUT);
    }

    function test_settle_pays_the_owners_vault_when_it_happened() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        uint256 vaultBefore = mandate.balanceOf(owner);

        vm.prank(resolver);
        pool.settle(H1, true, EVIDENCE);

        assertEq(mandate.balanceOf(owner), vaultBefore + PAYOUT);
        assertEq(usdc.balanceOf(address(pool)), SEED + PREMIUM - PAYOUT);
        assertEq(pool.locked(), 0);
        assertEq(pool.exposure(MARKET), 0);
        assertEq(uint8(_status(H1)), uint8(AwningPool.OfferStatus.Closed));
    }

    function test_settle_keeps_the_premium_when_it_did_not_happen() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        uint256 vaultBefore = mandate.balanceOf(owner);

        vm.prank(resolver);
        pool.settle(H1, false, EVIDENCE);

        assertEq(mandate.balanceOf(owner), vaultBefore);
        assertEq(pool.totalAssets(), SEED + PREMIUM);
        assertEq(pool.freeAssets(), SEED + PREMIUM);
    }

    function test_settle_only_from_the_resolver_and_only_once() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        vm.prank(underwriter);
        vm.expectRevert(AwningPool.NotResolver.selector);
        pool.settle(H1, false, EVIDENCE);

        vm.startPrank(resolver);
        pool.settle(H1, true, EVIDENCE);
        vm.expectRevert(AwningPool.OfferNotLive.selector);
        pool.settle(H1, true, EVIDENCE);
        vm.stopPrank();
    }

    function test_settle_needs_the_premium_to_have_been_paid() public {
        _offer(H1);
        vm.prank(resolver);
        vm.expectRevert(AwningPool.NotTaken.selector);
        pool.settle(H1, true, EVIDENCE);
    }

    function test_refund_returns_the_premium_for_a_cancelled_market() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        uint256 vaultBefore = mandate.balanceOf(owner);

        vm.prank(resolver);
        pool.refund(H1, EVIDENCE);

        assertEq(mandate.balanceOf(owner), vaultBefore + PREMIUM);
        assertEq(pool.totalAssets(), SEED);
        assertEq(pool.locked(), 0);
    }

    function test_claimUnresolved_pays_out_if_the_resolver_goes_quiet() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        uint256 vaultBefore = mandate.balanceOf(owner);

        vm.prank(stranger);
        vm.expectRevert(AwningPool.StillOpen.selector);
        pool.claimUnresolved(H1);

        vm.warp(resolveBy + 1);
        vm.prank(stranger);
        pool.claimUnresolved(H1);
        assertEq(mandate.balanceOf(owner), vaultBefore + PAYOUT);
        assertEq(pool.locked(), 0);
    }

    // --- offers nobody took ---

    function test_lapse_unlocks_an_offer_after_its_deadline() public {
        _offer(H1);
        vm.expectRevert(AwningPool.StillOpen.selector);
        pool.lapse(H1);

        vm.warp(takeBy + 1);
        vm.prank(stranger);
        pool.lapse(H1);
        assertEq(pool.locked(), 0);
        assertEq(pool.freeAssets(), SEED);
    }

    function test_lapse_cannot_strip_cover_that_was_paid_for() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        vm.warp(takeBy + 1);
        vm.expectRevert(AwningPool.AlreadyTaken.selector);
        pool.lapse(H1);
    }

    // --- premiums that reach the pool without a matching offer ---

    function test_reject_refunds_a_premium_sent_with_no_offer() public {
        uint256 vaultBefore = mandate.balanceOf(owner);
        _take(H1, 50e6, 50e6, MARKET);
        assertEq(mandate.balanceOf(owner), vaultBefore - 50e6);

        vm.prank(stranger);
        pool.reject(H1);
        assertEq(mandate.balanceOf(owner), vaultBefore);
        assertEq(pool.totalAssets(), SEED);
    }

    function test_reject_refunds_and_unlocks_when_terms_differ_from_the_offer() public {
        _offer(H1);
        uint256 vaultBefore = mandate.balanceOf(owner);
        _take(H1, PREMIUM, PAYOUT + 1, MARKET);
        assertFalse(pool.taken(H1));

        pool.reject(H1);
        assertEq(mandate.balanceOf(owner), vaultBefore);
        assertEq(pool.locked(), 0);
    }

    function test_reject_cannot_undo_cover_taken_on_exact_terms() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        vm.expectRevert(AwningPool.AlreadyTaken.selector);
        pool.reject(H1);
    }

    function test_reject_needs_an_open_hedge_paid_to_this_pool() public {
        vm.expectRevert(AwningPool.NothingToReject.selector);
        pool.reject(H1);
    }

    // --- depositors ---

    function test_backers_cannot_withdraw_what_is_locked() public {
        vm.prank(underwriter);
        pool.offer(H1, owner, PREMIUM, uint96(SEED / 2), MARKET, takeBy, resolveBy);

        assertEq(pool.maxWithdraw(backer), SEED / 2);
        vm.startPrank(backer);
        vm.expectRevert();
        pool.withdraw(SEED / 2 + 1, backer, backer);
        pool.withdraw(SEED / 2, backer, backer);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(pool)), pool.locked());
    }

    function test_backers_earn_the_premium_on_cover_that_did_not_pay() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        vm.prank(resolver);
        pool.settle(H1, false, EVIDENCE);

        vm.startPrank(backer);
        uint256 out = pool.redeem(pool.maxRedeem(backer), backer, backer);
        vm.stopPrank();
        assertApproxEqAbs(out, SEED + PREMIUM, 1);
    }

    function test_backers_bear_the_loss_on_cover_that_paid() public {
        _offer(H1);
        _take(H1, PREMIUM, PAYOUT, MARKET);
        vm.prank(resolver);
        pool.settle(H1, true, EVIDENCE);
        assertApproxEqAbs(pool.maxWithdraw(backer), SEED + PREMIUM - PAYOUT, 1);
    }

    // --- fuzz ---

    function testFuzz_the_pool_always_holds_what_it_has_locked(
        uint96 payout,
        uint96 premium,
        uint256 withdrawal,
        bool happened
    ) public {
        payout = uint96(bound(payout, 2, SEED / 2));
        premium = uint96(bound(premium, 1, payout - 1));
        premium = uint96(bound(premium, 1, 100e6));

        vm.prank(underwriter);
        pool.offer(H1, owner, premium, payout, MARKET, takeBy, resolveBy);
        _take(H1, premium, payout, MARKET);

        withdrawal = bound(withdrawal, 0, pool.maxWithdraw(backer));
        if (withdrawal > 0) {
            vm.prank(backer);
            pool.withdraw(withdrawal, backer, backer);
        }
        assertGe(usdc.balanceOf(address(pool)), pool.locked());

        uint256 vaultBefore = mandate.balanceOf(owner);
        vm.prank(resolver);
        pool.settle(H1, happened, EVIDENCE);
        assertEq(mandate.balanceOf(owner), vaultBefore + (happened ? payout : 0));
        assertEq(pool.locked(), 0);
    }
}
