import {
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js"
import * as crypto from "crypto"
import { PROGRAM_ID } from "./utils"

export const placePrediction = async (
  connection: Connection,
  wallet: any,
  marketPubkey: PublicKey,
  side: number,
  amountInSol: number
): Promise<string> => {
  try {
    if (!wallet?.publicKey) throw new Error("Wallet not connected")
    if (side !== 1 && side !== 2) throw new Error("Side must be 1 (Team A) or 2 (Team B)")
    if (amountInSol <= 0) throw new Error("Amount must be greater than 0")

    const predictor = wallet.publicKey
    const lamports = Math.floor(amountInSol * LAMPORTS_PER_SOL)

    // ✅ Derive vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), marketPubkey.toBuffer()],
      PROGRAM_ID
    )

    // ✅ Compute discriminator for "place_prediction"
    const discriminator = crypto
      .createHash("sha256")
      .update("global:place_prediction")
      .digest()
      .slice(0, 8)

    // ✅ Serialize instruction data: side (1 byte) + amount (8 bytes)
    const instructionData = Buffer.alloc(9)
    instructionData.writeUInt8(side, 0)
    instructionData.writeBigUInt64LE(BigInt(lamports), 1)

    const data = Buffer.concat([
      discriminator,
      instructionData
    ])

    // ✅ Build transaction instruction — order must match #[derive(Accounts)]
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: predictor, isSigner: true, isWritable: true }, // predictor
        { pubkey: marketPubkey, isSigner: false, isWritable: true }, // market_account
        { pubkey: vaultPda, isSigner: false, isWritable: true }, // vault_account
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      data,
    })

    // ✅ Build and send the transaction
    const tx = new Transaction().add(ix)
    tx.feePayer = predictor

    const signature = await wallet.sendTransaction(tx, connection)
    await connection.confirmTransaction(signature, "confirmed")

    console.log("✅ Prediction placed successfully!")
    console.log("📜 Tx signature:", signature)
    console.log("🏦 Vault PDA:", vaultPda.toBase58())

    return signature
  } catch (err) {
    console.error("❌ placePrediction failed:", err)
    throw err
  }
}

export const getSolscanUrl = (
  signature: string,
  cluster: "devnet" | "mainnet-beta" = "devnet"
): string => {
  const baseUrl =
    cluster === "mainnet-beta"
      ? "https://solscan.io/tx"
      : "https://solscan.io/tx"
  return `${baseUrl}/${signature}?cluster=${cluster}`
}
