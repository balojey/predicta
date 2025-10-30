import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { PublicKey, Connection, AccountInfo } from "@solana/web3.js"
import { BN } from "@coral-xyz/anchor"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PROGRAM_ID = new PublicKey("2hakTPzFyYLXDE2WRw2aJBaTmC8wEGpinLLmECd8CGNR")
export const NETWORK = "https://api.devnet.solana.com"

export const connection = new Connection(NETWORK, "confirmed")

export const getMarketPDA = async (
  authority: PublicKey,
  teamA: string,
  teamB: string
) => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      authority.toBuffer(),
      Buffer.from(teamA),
      Buffer.from(teamB)
    ],
    PROGRAM_ID
  )
}

export interface Market {
  pubkey: PublicKey
  authority: PublicKey
  teamA: string
  teamB: string
  endTime: BN
  resolved: boolean
  winner: number
  totalYes: BN
  totalNo: BN
  bump: number
}

function readPublicKey(buffer: Buffer, offset: number): { value: PublicKey; offset: number } {
  const bytes = buffer.slice(offset, offset + 32)
  return { value: new PublicKey(bytes), offset: offset + 32 }
}

function readString(buffer: Buffer, offset: number): { value: string; offset: number } {
  const length = buffer.readUInt32LE(offset)
  offset += 4
  const value = buffer.slice(offset, offset + length).toString("utf-8")
  return { value, offset: offset + length }
}

function readI64(buffer: Buffer, offset: number): { value: BN; offset: number } {
  const bytes = buffer.slice(offset, offset + 8)
  return { value: new BN(bytes, "le"), offset: offset + 8 }
}

function readU64(buffer: Buffer, offset: number): { value: BN; offset: number } {
  const bytes = buffer.slice(offset, offset + 8)
  return { value: new BN(bytes, "le"), offset: offset + 8 }
}

function readU8(buffer: Buffer, offset: number): { value: number; offset: number } {
  return { value: buffer.readUInt8(offset), offset: offset + 1 }
}

function readBool(buffer: Buffer, offset: number): { value: boolean; offset: number } {
  return { value: buffer.readUInt8(offset) !== 0, offset: offset + 1 }
}

export function decodeMarketAccount(
  pubkey: PublicKey,
  accountInfo: AccountInfo<Buffer>
): Market | null {
  try {
    let offset = 8
    const data = accountInfo.data

    const authority = readPublicKey(data, offset)
    offset = authority.offset

    const teamA = readString(data, offset)
    offset = teamA.offset

    const teamB = readString(data, offset)
    offset = teamB.offset

    const endTime = readI64(data, offset)
    offset = endTime.offset

    const resolved = readBool(data, offset)
    offset = resolved.offset

    const winner = readU8(data, offset)
    offset = winner.offset

    const totalYes = readU64(data, offset)
    offset = totalYes.offset

    const totalNo = readU64(data, offset)
    offset = totalNo.offset

    const bump = readU8(data, offset)

    return {
      pubkey,
      authority: authority.value,
      teamA: teamA.value,
      teamB: teamB.value,
      endTime: endTime.value,
      resolved: resolved.value,
      winner: winner.value,
      totalYes: totalYes.value,
      totalNo: totalNo.value,
      bump: bump.value,
    }
  } catch (error) {
    console.error("Failed to decode market account:", error)
    return null
  }
}

export async function fetchUserMarkets(
  authority: PublicKey
): Promise<Market[]> {
  try {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8,
            bytes: authority.toBase58(),
          },
        },
      ],
    })

    const markets: Market[] = []
    for (const { pubkey, account } of accounts) {
      const market = decodeMarketAccount(pubkey, account)
      if (market) {
        markets.push(market)
      }
    }

    return markets.sort((a, b) => b.endTime.toNumber() - a.endTime.toNumber())
  } catch (error) {
    console.error("Failed to fetch user markets:", error)
    throw error
  }
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = timestamp - now

  if (diff < 0) {
    const absDiff = Math.abs(diff)
    if (absDiff < 3600) return `${Math.floor(absDiff / 60)}m ago`
    if (absDiff < 86400) return `${Math.floor(absDiff / 3600)}h ago`
    return `${Math.floor(absDiff / 86400)}d ago`
  }

  if (diff < 3600) return `in ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`
  return `in ${Math.floor(diff / 86400)}d`
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
