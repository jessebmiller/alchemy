import * as Arc from "@daostack/arc.js";
import * as BigNumber from "bignumber.js";
import promisify = require("es6-promisify");
import * as Redux from "redux";
import { Web3 } from "web3";

import { ActionTypes } from "constants/web3Constants";
import Util from "lib/util";
import { IWeb3State } from "reducers/web3Reducer";
import { IAsyncAction, AsyncActionSequence } from "./async";
import { IRootState } from "reducers";

export type ConnectAction = IAsyncAction<'WEB3_CONNECT', void, IWeb3State>;

export function initializeWeb3() {
  return async (dispatch: Redux.Dispatch<any>, getState: Function): Promise<any> => {
    dispatch({
      type: ActionTypes.WEB3_CONNECT,
      sequence: AsyncActionSequence.Pending,
      operation: {
        message: 'Connecting...',
        totalSteps: 1,
      },
    } as ConnectAction);

    let web3: Web3;

    try {
      web3 = await Arc.Utils.getWeb3();
    } catch (e) {
      console.error(e);
      dispatch({
        type: ActionTypes.WEB3_CONNECT,
        sequence: AsyncActionSequence.Failure,
        operation: {
          message: `Failed to connect to web3`
        },
      } as ConnectAction);

      return;
    }

    const networkId = Number(await Arc.Utils.getNetworkId());

    const payload: IWeb3State = {
      accounts: web3.eth.accounts,
      currentAccountGenBalance: 0,
      currentAccountGenStakingAllowance: 0,
      ethAccountAddress: null as string,
      ethAccountBalance: 0,
      networkId,
    };

    try {
      payload.ethAccountAddress = (await Arc.Utils.getDefaultAccount()).toLowerCase();
    } catch (e) {
      dispatch({
        type: ActionTypes.WEB3_CONNECT,
        sequence: AsyncActionSequence.Success,
        operation: {
          message: `Connected to web3, but no default account selected.`
        },
        payload
      } as ConnectAction);

      return;
    }

    const getBalance = promisify(web3.eth.getBalance);
    payload.ethAccountBalance = Util.fromWei(await getBalance(payload.ethAccountAddress));

    dispatch({
      type: ActionTypes.WEB3_CONNECT,
      sequence: AsyncActionSequence.Success,
      operation: {
        message: 'Connected to web3!'
      },
      payload
    } as ConnectAction);
  };
}

export function setCurrentAccount(accountAddress: string, daoAddress: string = null) {
  return async (dispatch: Redux.Dispatch<any>, getState: Function) => {
    const web3 = await Arc.Utils.getWeb3();

    let payload = {
      currentAccountGenBalance: 0,
      currentAccountGenStakingAllowance: 0,
      ethAccountAddress: accountAddress,
      ethAccountBalance: 0,
    }

    const getBalance = promisify(web3.eth.getBalance);
    const balance = await getBalance(accountAddress);
    payload.ethAccountBalance = Util.fromWei(balance);

    let votingMachineInstance: Arc.GenesisProtocolWrapper;
    if (daoAddress !== null) {
      const contributionRewardInstance = await Arc.ContributionRewardFactory.deployed();
      const votingMachineAddress = (await contributionRewardInstance.getSchemeParameters(daoAddress)).votingMachineAddress;
      votingMachineInstance = await Arc.GenesisProtocolFactory.at(votingMachineAddress);
    } else {
      votingMachineInstance = await Arc.GenesisProtocolFactory.deployed();
    }
    const stakingTokenAddress = await votingMachineInstance.contract.stakingToken();
    const stakingToken = await (await Arc.Utils.requireContract("StandardToken")).at(stakingTokenAddress) as any;
    payload.currentAccountGenBalance = Util.fromWei(await stakingToken.balanceOf(accountAddress));
    payload.currentAccountGenStakingAllowance = Util.fromWei(await stakingToken.allowance(accountAddress, votingMachineInstance.address));

    const action = {
      type: ActionTypes.WEB3_SET_ACCOUNT,
      payload
    };
    dispatch(action);
  };
}

export function onEthBalanceChanged(balance: Number) {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    const ethBalance = getState().web3.ethAccountBalance;
    if (ethBalance !== balance) {
      dispatch({
        type: ActionTypes.WEB3_ON_ETH_BALANCE_CHANGE,
        payload: balance
      });
    }
  };
}

export function onGenBalanceChanged(balance: Number) {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    const genBalance = getState().web3.currentAccountGenBalance;
    if (genBalance !== balance) {
      dispatch({
        type: ActionTypes.WEB3_ON_GEN_BALANCE_CHANGE,
        payload: balance
      });
    }
  };
}

export function onGenStakingAllowanceChanged(balance: Number) {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
  const genAllowance = getState().web3.currentAccountGenStakingAllowance;
  if (genAllowance !== balance) {
      dispatch({
        type: ActionTypes.WEB3_ON_GEN_STAKING_ALLOWANCE_CHANGE,
        payload: balance
      });
    }
  };
}

