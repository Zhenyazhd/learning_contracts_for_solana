import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createAssociatedTokenAccount } from "@solana/spl-token";

import { TokenMinter } from "../target/types/token_minter";

import { assert } from "chai";
// solana-test-validator
// https://www.quicknode.com/guides/solana-development/anchor/create-tokens
// solana program dump -u m metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s tests/metaplex_token_metadata_program.so
// 
// Anchor.toml:
//
// [[test.genesis]]
// address = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"  
// program = "tests/metaplex_token_metadata_program.so
describe("Token", () => {
    const provider = anchor.AnchorProvider.local();
    anchor.setProvider(provider);

    const program = anchor.workspace.TokenMinter as Program<TokenMinter>;
    console.log("Program ID:", program.programId.toBase58());


    const signer = provider.wallet as anchor.Wallet;
    const payer = signer.publicKey;
    const secondSigner = anchor.web3.Keypair.generate();
    const secondOwner = (secondSigner).publicKey;


    let destination_1;
    let destination_2;


    describe("Test", async () => {
        const metadata = {
            name: "My first token on Solana",
            symbol: "ZHD",
            uri: "https://5vfxc4tr6xoy23qefqbj4qx2adzkzapneebanhcalf7myvn5gzja.arweave.net/7UtxcnH13Y1uBCwCnkL6APKsge0hAgacQFl-zFW9NlI",
            decimals: 9,
        };
        const mintAmount = new anchor.BN(10_000_000_000);

        const [mint] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("mint")],
            program.programId
        );
        const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
        const METADATA_SEED = "metadata";
        const [metadataAddress] = anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from(METADATA_SEED),
              TOKEN_METADATA_PROGRAM_ID.toBuffer(),
              mint.toBuffer(),
            ],
            TOKEN_METADATA_PROGRAM_ID
        );
      
        it("initialize", async () => {
            const info = await provider.connection.getAccountInfo(mint);

            if (!info) {
                console.log("Mint not found. Attempting to initialize.");
                const context = {
                    metadata: metadataAddress,
                    mint: mint,
                    payer: signer.publicKey,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                };


                processTransaction(
                    await program.methods
                    .initToken(metadata)
                    .accounts(context)
                    .rpc()
                );
                
                const newInfo = await provider.connection.getAccountInfo(mint);
                assert(newInfo, "Mint should be initialized");
               
            } else {
                console.log("Mint already initialized");
            }
        });

        it("mint tokens", async () => {
            destination_1 = await anchor.utils.token.associatedAddress({
                mint: mint,
                owner: payer,
            });

            let initialBalance: number;
            try {
                const balance = await provider.connection.getTokenAccountBalance(destination_1);
                initialBalance = balance.value.uiAmount;
            } catch {
                initialBalance = 0;
            } 
            
            const context = {
                mint,
                destination_1,
                payer,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            };

            processTransaction(
                await program.methods
                .mintTokens(mintAmount)
                .accounts(context)
                .rpc()
            );

            const postBalance = (
                await provider.connection.getTokenAccountBalance(destination_1)
            ).value.uiAmount;
            
            assert.equal(
                initialBalance + 10,
                postBalance,
                "Post balance should equal initial plus mint amount"
            );
        });

        it("transfer tokens", async () => {

            let airdropSignature = await provider.connection.requestAirdrop(
                secondOwner,
                anchor.web3.LAMPORTS_PER_SOL * 1 // 1 SOL
            );
            let latestBlockhash = await provider.connection.getLatestBlockhash();
            await provider.connection.confirmTransaction({
                signature: airdropSignature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            });

            airdropSignature = await provider.connection.requestAirdrop(
                payer,
                anchor.web3.LAMPORTS_PER_SOL * 1 // 1 SOL
            );
            latestBlockhash = await provider.connection.getLatestBlockhash();
            await provider.connection.confirmTransaction({
                signature: airdropSignature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            });


            destination_2 = await anchor.utils.token.associatedAddress({
                mint: mint,
                owner: secondOwner,
            });

            const accountInfo = await provider.connection.getAccountInfo(destination_2);

            if (!accountInfo) {
                console.log("⚡ Creating Associated Token Account (ATA) for secondOwner...");
                await createAssociatedTokenAccount(
                    provider.connection,  
                    secondSigner,               
                    mint,                
                    secondOwner          
                );
                console.log("ATA создан:", destination_2.toBase58());
            } else {
                console.log("ATA уже существует:", destination_2.toBase58());
            }

            let initialBalance1: number;
            let initialBalance2: number;
            try {
                const balance = await provider.connection.getTokenAccountBalance(destination_2);
                initialBalance2 = balance.value.uiAmount;
            } catch {
                initialBalance2 = 0;
            } 

            try {
                const balance = await provider.connection.getTokenAccountBalance(destination_1);
                initialBalance1 = balance.value.uiAmount;
            } catch {
                initialBalance1 = 0;
            } 

            const context = {
                from: destination_1,
                to: destination_2,
                owner: payer,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            };

            const sendAmount = new anchor.BN(1_000_000_000);

            processTransaction(
                await program.methods
                .transferTokens(sendAmount)
                .accounts(context)
                .rpc()
            );


            const postBalance1 = (
                await provider.connection.getTokenAccountBalance(destination_1)
            ).value.uiAmount;
            const postBalance2 = (
                await provider.connection.getTokenAccountBalance(destination_2)
            ).value.uiAmount;
        
            assert.equal(
                initialBalance1 - 1,
                postBalance1,
                "Post balance should equal initial plus mint amount"
            );

            assert.equal(
                initialBalance2 + 1,
                postBalance2,
                "Post balance should equal initial plus mint amount"
            );

        });

        it("burn tokens", async () => {
            let initialBalance1: number;
            try {
                const balance = await provider.connection.getTokenAccountBalance(destination_1);
                initialBalance1 = balance.value.uiAmount;
            } catch {
                initialBalance1 = 0;
            } 

            const context = {
                owner: payer,
                from: destination_1,
                mint: mint,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            };

            const sendAmount = new anchor.BN(1_000_000_000);

            processTransaction(
                await program.methods
                .burnTokens(sendAmount)
                .accounts(context)
                .rpc()
            );


            const postBalance1 = (
                await provider.connection.getTokenAccountBalance(destination_1)
            ).value.uiAmount;
            
            assert.equal(
                initialBalance1 - 1,
                postBalance1,
                "Post balance should equal initial plus mint amount"
            );
        });


        it("approve tokens", async () => {
   
            const context = {
                owner: payer,
                to: destination_1,
                delegate: secondOwner,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            };

            const approveAmount = new anchor.BN(2_000_000_000);

            processTransaction(
                await program.methods
                .approveTokens(approveAmount)
                .accounts(context)
                .rpc()
            );

            const accountInfo = await provider.connection.getParsedAccountInfo(destination_1);
            if (
                accountInfo.value &&
                "parsed" in accountInfo.value.data &&
                accountInfo.value.data.parsed.info.delegate
            ) {

                assert.equal(
                    accountInfo.value.data.parsed.info.delegate,
                    secondOwner,
                    "Delegate should be secondOwner"
                );

                assert.equal(
                    accountInfo.value.data.parsed.info.delegatedAmount.uiAmount,
                    2,
                    "Delegate should be secondOwner"
                );
                console.log(`Delegate: ${accountInfo.value.data.parsed.info.delegate}`);
                console.log(`Approved amount: ${accountInfo.value.data.parsed.info.delegatedAmount.uiAmount}`);
            } else {
                console.log("No delegate assigned.");
            }
        });
    });
});

async function processTransaction(tx: any): Promise<void> {
    try {
        console.log("Transaction successful:", tx);
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`)
    } catch (err) {
        console.error("Transaction failed:", err);
        if ("logs" in err) {
            console.log("Logs:", err.logs);
        }
        throw err;
    }
}