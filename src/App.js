import React, { useEffect, useState } from "react";
import { Buffer } from "buffer";
import algosdk from "algosdk";
import approval from "./contracts/approval";
import clear from "./contracts/clear";

import Wrapper from "./components/Wrapper";
import Screen from "./components/Screen";
import ButtonBox from "./components/ButtonBox";
import Button from "./components/Button";
import Spinner from "./components/Spinner";

const btnValues = [
	[7, 8, 9, "+"],
	[4, 5, 6, "-"],
	[1, 2, 3,"x"],
	[0, "C", "="],
];

const creatorMnemonic =
	"panda upset appear excess senior sunny dash pluck sand essence knife receive better category cloud bar purchase duck favorite illness still hope thing able acid";
const userMnemonic =
	"remain buzz merge spend cradle urban front asset mail noble frown intact pear time family please disorder staff zone print alley answer almost about fog";

// user declared algod connection parameters
const algodServer = "http://localhost";
const algodPort = 4001;
const algodToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// declare application state storage (immutable)
const localInts = 1;
const localBytes = 1;
const globalInts = 1;
const globalBytes = 1;

// user declared approval program (refactored)
let approvalProgramSourceRefactored = approval;

// declare clear state program source
let clearProgramSource = clear;

let algodClient;
let creatorAccount;
let userAccount;
let approvalProgram;
let clearProgram;
let appId;
let appArgs = [];

const App = () => {

	const [isLoading, setIsLoading] = useState(false);

	const [calc, setCalc] = useState({
		sign: "",
		num: 0,
		display: "0",
		res: 0,
		connect: false,
		status: "STATUS: DISCONNECTED",
	  });

	useEffect(() => {
		console.log("Current number: ",calc.num);
		console.log("Current result: ", calc.res);
		console.log("================")
	});

	const math = (a, b, sign) =>
			sign === "+"
			  ? (a + b)
			  : sign === "-"
			  ? a - b
			  : sign === "x"
			  ? a * b
			  : a / b;

	const numClickHandler = (e) => {
		e.preventDefault();
		const value = e.target.innerHTML;
	
		if (calc.num.toString().length < 16) {
		  setCalc({
			...calc,
			status: "",
			num: Number(calc.num + value),
			display: calc.display != "0" ? String(calc.display) + value : value,
			res: !calc.sign ? 0 : calc.res,
		  });
		}
	};
	
	const signClickHandler = (e) => {
		e.preventDefault();
		const value = e.target.innerHTML;

		if(!calc.sign) // if no sign selected previously
		{
			if(!calc.res)
			{
				calculate(calc.num,"set");
			}
			setCalc({
				...calc,
				sign: value,
				display: String(Number(calc.display) + value), //removes leading zero then back to string
				res: !calc.res && calc.num ? calc.num : calc.res,
				num: 0,
			});
		}
		else
		{
			if(calc.num)
			{
				calculate(calc.num,calc.sign);
			}
			if(value === "x")
			{
				setCalc({
					...calc,
					sign: value,
					res: math(calc.res,calc.num,calc.sign),
					display: String(calc.res) + value,
					num: 0,
				});
			}
			else{
				setCalc({
					...calc,
					sign: value,
					display: !calc.num ? calc.display.slice(0,-1) + value : calc.display + value,
					res: math(calc.res,calc.num,calc.sign),
					num: 0,
				});
			}
		}
	};
	
	const equalsClickHandler = () => {

		if (calc.sign && calc.num) {
			calculate(calc.num,calc.sign);
			setCalc({
				...calc,
				res: math(calc.res,calc.num,calc.sign),
				display: math(calc.res,calc.num,calc.sign),
				sign: "",
				num: 0,
			});
		}
		if(calc.sign && !calc.num)
		{
			setCalc({
				...calc,
				res: math(calc.res,calc.num,calc.sign),
				display: math(calc.res,calc.num,calc.sign),
				sign: "",
				num: 0,
			});
		}
	  };
	
	  const resetClickHandler = () => {
		calculate(0,"set");
		setCalc({
		  ...calc,
		  sign: "",
		  num: 0,
		  display: "0",
		  res: 0,
		});
	  };

	  function AssignOnClick(btn) {
		if (calc.connect === true) {
		  switch (btn) {
			case "C": return resetClickHandler;
			case "=": return equalsClickHandler;      
			case "+":   
			case "-":  
			case "x":  
			case "/": return signClickHandler;  
			default: return numClickHandler;
		  }
		}
	  }

	// helper function to compile program source
	async function compileProgram(client, programSource) {
		let encoder = new TextEncoder();
		let programBytes = encoder.encode(programSource);
		let compileResponse = await client.compile(programBytes).do();
		let compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, "base64"));
		return compiledBytes;
	}

	// helper function to await transaction confirmation
	// Function used to wait for a tx confirmation
	const waitForConfirmation = async function (algodclient, txId) {
		let status = await algodclient.status().do();
		let lastRound = status["last-round"];
		while (true) {
			const pendingInfo = await algodclient.pendingTransactionInformation(txId).do();
			if (pendingInfo["confirmed-round"] !== null && pendingInfo["confirmed-round"] > 0) {
				//Got the completed Transaction
				console.log("Transaction " + txId + " confirmed in round " + pendingInfo["confirmed-round"]);
				break;
			}
			lastRound++;
			await algodclient.statusAfterBlock(lastRound).do();
		}
	};

	// create new application
	async function createApp(client, creatorAccount, approvalProgram, clearProgram, localInts, localBytes, globalInts, globalBytes) {
		// define sender as creator
		let sender = creatorAccount.addr;
		// declare onComplete as NoOp
		let onComplete = algosdk.OnApplicationComplete.NoOpOC;

		// get node suggested parameters
		let params = await client.getTransactionParams().do();
		// comment out the next two lines to use suggested fee
		params.fee = 1000;
		params.flatFee = true;

		// create unsigned transaction
		let txn = algosdk.makeApplicationCreateTxn(sender, params, onComplete, approvalProgram, clearProgram, localInts, localBytes, globalInts, globalBytes);
		let txId = txn.txID().toString();

		// Sign the transaction
		let signedTxn = txn.signTxn(creatorAccount.sk);
		console.log("Signed transaction with txID: %s", txId);

		// Submit the transaction
		await client.sendRawTransaction(signedTxn).do();
		// Wait for confirmation
		await waitForConfirmation(client, txId);

		// display results
		let transactionResponse = await client.pendingTransactionInformation(txId).do();
		let appId = transactionResponse["application-index"];
		console.log("Created new app-id: ", appId);

		return appId;
	}

	// call application
	async function callApp(client, account, index, appArgs) {
		// define sender
		let sender = account.addr;

		// get node suggested parameters
		let params = await client.getTransactionParams().do();
		// comment out the next two lines to use suggested fee
		params.fee = 1000;
		params.flatFee = true;

		// create unsigned transaction
		let txn = algosdk.makeApplicationNoOpTxn(sender, params, index, appArgs);
		let txId = txn.txID().toString();

		// Sign the transaction
		let signedTxn = txn.signTxn(account.sk);
		console.log("Signed transaction with txID: %s", txId);

		// Submit the transaction
		await client.sendRawTransaction(signedTxn).do();

		// Wait for confirmation
		await waitForConfirmation(client, txId);

		// display results
		let transactionResponse = await client.pendingTransactionInformation(txId).do();
		console.log("Called app-id:", transactionResponse["txn"]["txn"]["apid"]);
		if (transactionResponse["global-state-delta"] !== undefined) {
			console.log("Global State updated:", transactionResponse["global-state-delta"]);
		}
		if (transactionResponse["local-state-delta"] !== undefined) {
			console.log("Local State updated:", transactionResponse["local-state-delta"]);
		}
	}

	// read global state of application
	async function readGlobalState(client, account, index) {
		let accountInfoResponse = await client.accountInformation(account.addr).do();
		for (let i = 0; i < accountInfoResponse["created-apps"].length; i++) {
			if (accountInfoResponse["created-apps"][i].id === index) {
				console.log("Application's global state:");
				for (let n = 0; n < accountInfoResponse["created-apps"][i]["params"]["global-state"].length; n++) {
					console.log(accountInfoResponse["created-apps"][i]["params"]["global-state"][n]);
				}
			}
		}
	}

	async function deleteApp(client, creatorAccount, index) {
		// define sender as creator
		let sender = creatorAccount.addr;

		// get node suggested parameters
		let params = await client.getTransactionParams().do();
		// comment out the next two lines to use suggested fee
		params.fee = 1000;
		params.flatFee = true;

		// create unsigned transaction
		let txn = algosdk.makeApplicationDeleteTxn(sender, params, index);
		let txId = txn.txID().toString();

		// Sign the transaction
		let signedTxn = txn.signTxn(creatorAccount.sk);
		console.log("Signed transaction with txID: %s", txId);

		// Submit the transaction
		await client.sendRawTransaction(signedTxn).do();

		// Wait for confirmation
		await waitForConfirmation(client, txId);

		// display results
		let transactionResponse = await client.pendingTransactionInformation(txId).do();
		let appId = transactionResponse["txn"]["txn"].apid;
		console.log("Deleted app-id: ", appId);
		return appId;
	}

	async function createApplication() {
		try {
			setCalc({
				...calc,
				connect: true,
				status: "STATUS: CONNECTING..",
			});
			setIsLoading(true);
			// initialize an algodClient
			algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

			// get accounts from mnemonic
			creatorAccount = algosdk.mnemonicToSecretKey(creatorMnemonic);
			userAccount = algosdk.mnemonicToSecretKey(userMnemonic);

			// compile programs
			approvalProgram = await compileProgram(algodClient, approvalProgramSourceRefactored);
			clearProgram = await compileProgram(algodClient, clearProgramSource);

			// create new application
			appId = await createApp(algodClient, creatorAccount, approvalProgram, clearProgram, localInts, localBytes, globalInts, globalBytes);
			setCalc({
				...calc,
				connect: true,
				status: "STATUS: CONNECTED",
				display: "0",
			});
			setIsLoading(false);
		} catch (err) {
			console.log("err", err);
		}
	}

	async function calculate(newNumber,operation) {
		appArgs.push(new Uint8Array(Buffer.from(operation)));
		appArgs.push(algosdk.encodeUint64(newNumber));
		console.log("Performing operation: ", operation);
		setIsLoading(true);
		await callApp(algodClient, userAccount, appId, appArgs);
		await readGlobalState(algodClient, userAccount, appId);
		appArgs = [];
		setIsLoading(false);
	}

	async function endApplication() {
		setIsLoading(true);
		await deleteApp(algodClient, creatorAccount, appId);
		setCalc({
			...calc,
			sign: "",
			res: 0,
			num: 0,
			connect: false,
			status: "STATUS: DISCONNECTED",
		});
		setIsLoading(false);
	}
	
	return (
		<>
		<Button
			value="Connect"
			className={"stop-start"}
			onClick={() => createApplication()}
		/>
		<Button
			value="Disconnect"
			className={"stop-start"}
			onClick={() => endApplication()}
	  	/>
		<Wrapper>
		{isLoading ? <Spinner /> : null}
		<Screen value={(calc.status != "") ? calc.status : calc.display}></Screen>
		<ButtonBox>
		  {btnValues.flat().map((btn, i) => {
			return (
			  <Button
				key={i}
				className={btn === "=" ? "equals" : ""}
				value={btn}
				onClick={AssignOnClick(btn)}
			  />
			);
		  })}
		</ButtonBox>
	  </Wrapper>
	</>
	);
}
export default App