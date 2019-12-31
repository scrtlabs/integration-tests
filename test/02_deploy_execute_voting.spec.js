const fs = require("fs");
const path = require("path");
const Web3 = require("web3");
const { Enigma, eeConstants } = require("./enigmaLoader");
const {
  EnigmaContractAddress,
  EnigmaTokenContractAddress,
  proxyAddress,
  ethNodeAddr,
  VotingETHContract,
  VotingETHContractAddress
} = require("./contractLoader");
const constants = require("./testConstants");

const { deploy, testComputeHelper, sleep, testComputeFailureHelper } = require("./scUtils");

describe("voting", () => {
  let accounts;
  let web3;
  let enigma;
  let scAddr;
  let VotingSmartContract;

  beforeAll(async () => {
    web3 = new Web3(new Web3.providers.HttpProvider(ethNodeAddr));
    accounts = await web3.eth.getAccounts();
    enigma = new Enigma(web3, EnigmaContractAddress, EnigmaTokenContractAddress, proxyAddress, {
      gas: 4712388,
      gasPrice: 100000000000,
      from: accounts[0]
    });
    enigma.admin();
    enigma.setTaskKeyPair("cupcake");
    expect(Enigma.version()).toEqual("0.0.1");

    VotingSmartContract = new enigma.web3.eth.Contract(VotingETHContract["abi"], VotingETHContractAddress);
    expect(VotingSmartContract.options.address).toEqual(VotingETHContractAddress);
  });

  it(
    "deploy",
    async () => {
      const deployTask = await deploy(
        enigma,
        accounts[0],
        path.resolve(__dirname, "secretContracts/voting.wasm"),
        "construct(address)",
        [[VotingETHContractAddress, "address"]],
        4000000
      );

      scAddr = deployTask.scAddr;
      fs.writeFileSync("/tmp/enigma/addr-voting.txt", deployTask.scAddr, "utf8");

      while (true) {
        const { ethStatus } = await enigma.getTaskRecordStatus(deployTask);
        if (ethStatus == eeConstants.ETH_STATUS_VERIFIED) {
          break;
        }

        expect(ethStatus).toEqual(eeConstants.ETH_STATUS_CREATED);
        await sleep(1000);
      }

      const isDeployed = await enigma.admin.isDeployed(deployTask.scAddr);
      expect(isDeployed).toEqual(true);

      const codeHash = await enigma.admin.getCodeHash(deployTask.scAddr);
      expect(codeHash).toBeTruthy();
    },
    constants.TIMEOUT_DEPLOY
  );

  let pollId;

  it("creates a new poll on Ethereum", async () => {
    const initialPollsLength = (await VotingSmartContract.methods.getPolls().call()).length;
    await VotingSmartContract.methods.createPoll(50, "Is privacy important?", 30).send({
      gas: 4712388,
      gasPrice: 100000000000,
      from: accounts[0]
    });
    const finalPollsLength = (await VotingSmartContract.methods.getPolls().call()).length;
    expect(finalPollsLength - initialPollsLength).toEqual(1);

    pollId = finalPollsLength - 1;
  });

  const addr1 = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const addr2 = "0x0000000000000000000000000000000000000000000000000000000000000002";

  it(
    "computeTask addr1 cast_vote",
    async () => {
      await testComputeHelper(
        enigma,
        accounts[0],
        scAddr,
        "cast_vote(uint256,bytes32,uint256)",
        [
          [pollId, "uint256"],
          [addr1, "bytes32"],
          [1, "uint256"]
        ],
        decryptedOutput => {
          expect(decryptedOutput).toEqual("");
        }
      );
    },
    constants.TIMEOUT_COMPUTE
  );

  it(
    "computeTask addr1 cannot cast_vote more than once",
    async () => {
      await testComputeFailureHelper(
        enigma,
        accounts[0],
        scAddr,
        "cast_vote(uint256,bytes32,uint256)",
        [
          [pollId, "uint256"],
          [addr1, "bytes32"],
          [0, "uint256"]
        ],
        eeConstants.ETH_STATUS_FAILED
      );
    },
    constants.TIMEOUT_COMPUTE
  );

  it(
    "computeTask addr2 cast_vote",
    async () => {
      await testComputeHelper(
        enigma,
        accounts[0],
        scAddr,
        "cast_vote(uint256,bytes32,uint256)",
        [
          [pollId, "uint256"],
          [addr2, "bytes32"],
          [0, "uint256"]
        ],
        decryptedOutput => {
          expect(decryptedOutput).toEqual("");
        }
      );
    },
    constants.TIMEOUT_COMPUTE
  );
});