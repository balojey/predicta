import { useWallet } from "@solana/wallet-adapter-react"
import { useEffect, useState } from "react"
import { createMarketFromApi } from "../utils/createMarket"

export function CreateMarket() {
  const wallet = useWallet()
  const { publicKey } = wallet
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // ⚽ Fetch upcoming matches (using football-data.org via CORS proxy)
  useEffect(() => {
    const fetchMatches = async () => {
      try {
        setLoading(true)
        setError("")

        const res = await fetch(
          "https://corsproxy.io/?https://api.football-data.org/v4/matches",
          {
            headers: {
              "X-Auth-Token": import.meta.env.VITE_FOOTBALL_DATA_API_KEY,
            },
          }
        )

        const data = await res.json()
        console.log("Fetched matches:", data)

        if (data?.matches?.length) {
          const filtered = data.matches.filter(
            (m: any) => ["TIMED", "SCHEDULED"].includes(m.status)
          )
          setMatches(filtered)
        } else {
          setError("No upcoming matches found.")
        }
      } catch (err: any) {
        console.error(err)
        setError("Failed to fetch matches.")
      } finally {
        setLoading(false)
      }
    }

    fetchMatches()
  }, [])

  // 🪙 Create market when user clicks "Create Market"
  const handleCreate = async (match: any) => {
    if (!publicKey || !wallet.wallet?.adapter) {
      setError("Connect wallet first")
      return
    }

    const teamA = match.homeTeam.name
    const teamB = match.awayTeam.name
    const league = match.competition.name
    const startTime = Math.floor(new Date(match.utcDate).getTime() / 1000)
    const endTime = startTime + 2 * 60 * 60 // add 2 hours
    const matchId = String(match.id)

    try {
      setLoading(true)
      setError("")
      await createMarketFromApi(
        wallet.wallet.adapter,
        teamA,
        teamB,
        league,
        startTime,
        endTime,
        matchId
      )
      alert(`✅ Market created for ${teamA} vs ${teamB}`)
    } catch (err: any) {
      console.error(err)
      setError(err?.message || "Failed to create market")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8 text-center">⚽ Create Prediction Market</h1>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm mb-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center text-muted-foreground py-6">
          Fetching live matches...
        </div>
      )}

      {!loading && matches.length > 0 && (
        <div className="bg-card border border-border rounded-lg divide-y divide-border/40">
          {matches.map((m) => (
            <div
              key={m.id}
              className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 hover:bg-muted/10 transition-all"
            >
              {/* Match Info */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* League Emblem */}
                <img
                  src={m.competition.emblem || m.area.flag}
                  alt={m.competition.name}
                  className="w-10 h-10 rounded-full border border-border object-contain"
                />

                <div className="flex flex-col">
                  <p className="font-semibold text-lg">
                    {m.homeTeam.name} <span className="text-muted-foreground">vs</span> {m.awayTeam.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.competition.name} •{" "}
                    {new Date(m.utcDate).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>

              {/* Team Crests */}
              <div className="flex items-center gap-4">
                <img
                  src={m.homeTeam.crest}
                  alt={m.homeTeam.name}
                  className="w-8 h-8 object-contain"
                />
                <span className="text-muted-foreground text-sm">vs</span>
                <img
                  src={m.awayTeam.crest}
                  alt={m.awayTeam.name}
                  className="w-8 h-8 object-contain"
                />
              </div>

              {/* Action Button */}
              <div>
                <button
                  onClick={() => handleCreate(m)}
                  disabled={!publicKey || loading}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Processing..." : "Create Market"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && matches.length === 0 && !error && (
        <div className="text-center text-muted-foreground py-6">
          No matches available right now.
        </div>
      )}
    </div>
  )
}
