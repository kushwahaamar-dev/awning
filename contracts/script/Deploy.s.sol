// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AwningMandate} from "../src/AwningMandate.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// Deploys AwningMandate against `USDC_ADDRESS` if set, otherwise against a fresh MockUSDC,
/// then records the addresses in deployments/<chainId>.json.
contract Deploy is Script {
    function run() external returns (AwningMandate mandate, address usdc) {
        address configured = vm.envOr("USDC_ADDRESS", address(0));
        bool mock = configured == address(0);

        vm.startBroadcast();
        usdc = mock ? address(new MockUSDC()) : configured;
        mandate = new AwningMandate(IERC20(usdc));
        vm.stopBroadcast();

        console.log("AwningMandate:", address(mandate));
        console.log("USDC:", usdc, mock ? "(MockUSDC)" : "");

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "mandate", address(mandate));
        vm.serializeAddress(key, "usdc", usdc);
        vm.serializeBool(key, "mockUsdc", mock);
        string memory json = vm.serializeUint(key, "deployedAtBlock", block.number);

        // only broadcast runs leave a record; a dry run must not overwrite a real deployment file
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return (mandate, usdc);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
    }
}
