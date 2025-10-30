import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { IDL } from "./idl";
import { PROGRAM_ID, connection } from "./utils";

/**
 * Create a new market on-chain using the Anchor IDL abstraction.
 * Relies on your Anchor program's `create_market_from_api` instruction.
 */
export const createMarketFromApi = async (
  wallet: any,
  teamA: string,
  teamB: string,
  league: string,
  startTime: number,
  endTime: number,
  matchId: string
) => {
  try {
    if (!wallet?.publicKey) throw new Error("Wallet not connected");

    const authority = wallet.publicKey;
    const provider = new AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });

    // Initialize the program client from your IDL
    const program = new Program(IDL as Idl, PROGRAM_ID, provider);

    // Validate inputs
    const tA = teamA.trim();
    const tB = teamB.trim();
    const lg = league.trim();
    const mid = matchId.trim();

    if (!tA || !tB) throw new Error("Team names cannot be empty");
    if (Buffer.byteLength(tA, "utf8") > 32 || Buffer.byteLength(tB, "utf8") > 32)
      throw new Error("Team names must be <= 32 bytes");
    if (!mid) throw new Error("matchId cannot be empty");
    if (Buffer.byteLength(mid, "utf8") > 32)
      throw new Error("matchId must be <= 32 bytes (required for PDA seed)");

    // Derive PDAs (must match your Rust seeds)
    const [registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry"), authority.toBuffer()],
      PROGRAM_ID
    );

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), authority.toBuffer(), Buffer.from(mid, "utf8")],
      PROGRAM_ID
    );

    console.log("🪪 Market PDA:", marketPda.toBase58());
    console.log("📒 Registry PDA:", registryPda.toBase58());

    // Call the Anchor RPC method (auto handles encoding and discriminators)
    const txSig = await program.methods
      .createMarketFromApi(tA, tB, lg, new BN(startTime), new BN(endTime), mid)
      .accounts({
        authority,
        marketAccount: marketPda,
        registry: registryPda,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc({ commitment: "finalized" });

    console.log("✅ Market created successfully!");
    console.log("🧾 Transaction signature:", txSig);
    return txSig;
  } catch (err) {
    console.error("❌ createMarketFromApi (Anchor) failed:", err);
    throw err;
  }
};
