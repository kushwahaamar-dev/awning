// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AwningMandate} from "../src/AwningMandate.sol";
import {AwningPool} from "../src/AwningPool.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// Deploys AwningMandate and AwningPool against `USDC_ADDRESS` if set, otherwise against a fresh
/// MockUSDC, then records the addresses in deployments/<chainId>.json. `MANDATE_ADDRESS` reuses a
/// mandate that is already deployed. `UNDERWRITER_ADDRESS` is the key that offers and resolves cover.
contract Deploy is Script {
    // Half the pool at most on any one market.
    uint16 constant MAX_MARKET_SHARE_BPS = 5_000;

    function run() external returns (AwningMandate mandate, AwningPool pool, address usdc) {
        address configured = vm.envOr("USDC_ADDRESS", address(0));
        address existing = vm.envOr("MANDATE_ADDRESS", address(0));
        address underwriter = vm.envAddress("UNDERWRITER_ADDRESS");
        bool mock = configured == address(0);

        vm.startBroadcast();
        usdc = mock ? address(new MockUSDC()) : configured;
        mandate = existing == address(0) ? new AwningMandate(IERC20(usdc)) : AwningMandate(existing);
        pool = new AwningPool(mandate, underwriter, underwriter, MAX_MARKET_SHARE_BPS);
        vm.stopBroadcast();

        console.log("AwningMandate:", address(mandate));
        console.log("AwningPool:", address(pool));
        console.log("USDC:", usdc, mock ? "(MockUSDC)" : "");

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "mandate", address(mandate));
        vm.serializeAddress(key, "pool", address(pool));
        vm.serializeAddress(key, "usdc", usdc);
        vm.serializeBool(key, "mockUsdc", mock);
        string memory json = vm.serializeUint(key, "deployedAtBlock", block.number);

        // only broadcast runs leave a record; a dry run must not overwrite a real deployment file
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return (mandate, pool, usdc);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
    }
}
