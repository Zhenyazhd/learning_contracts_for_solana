import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
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
                
                try {
                    const tx = await program.methods
                        .initToken(metadata)
                        .accounts(context)
                        .rpc();
                    
                    console.log("Transaction successful:", tx);
                    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                    
                    const newInfo = await provider.connection.getAccountInfo(mint);
                    assert(newInfo, "Mint should be initialized");
                } catch (err) {
                    console.error("Transaction failed:", err);
                    if ("logs" in err) {
                        console.log("Logs:", err.logs);
                    }
                    throw err;
                }
            } else {
                console.log("Mint already initialized");
            }
        });

        it("mint tokens", async () => {
            const destination = await anchor.utils.token.associatedAddress({
                mint: mint,
                owner: payer,
            });

            let initialBalance: number;
            try {
                const balance = await provider.connection.getTokenAccountBalance(destination);
                initialBalance = balance.value.uiAmount;
            } catch {
                initialBalance = 0;
            } 
            
            const context = {
                mint,
                destination,
                payer,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            };

            try {
                const tx = await program.methods
                    .mintTokens(mintAmount)
                    .accounts(context)
                    .rpc();
                
                console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
                
                const postBalance = (
                    await provider.connection.getTokenAccountBalance(destination)
                ).value.uiAmount;
                
                assert.equal(
                    initialBalance + 10,
                    postBalance,
                    "Post balance should equal initial plus mint amount"
                );
            } catch (err) {
                console.error("Minting failed:", err);
                if ("logs" in err) {
                    console.log("Logs:", err.logs);
                }
                throw err;
            }
        });
    });
});