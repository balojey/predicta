import { useEffect, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { TrendingUp, Clock, Trophy, AlertCircle, Sword, Shield, X, ExternalLink } from "lucide-react"
import { fetchUserMarkets, formatRelativeTime, formatDate, type Market, connection } from "../utils/utils"
import { placePrediction, getSolscanUrl } from "../utils/placePrediction"

export function Home() {
  const wallet = useWallet()
  const { publicKey, connected } = wallet
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null)
  const [selectedSide, setSelectedSide] = useState<1 | 2>(1)
  const [betAmount, setBetAmount] = useState("")
  const [placingBet, setPlacingBet] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error"; txHash?: string } | null>(null)

  useEffect(() => {
    if (!connected || !publicKey) {
      setMarkets([])
      setError(null)
      return
    }

    async function loadMarkets() {
      setLoading(true)
      setError(null)
      try {
        const userMarkets = await fetchUserMarkets(publicKey!)
        setMarkets(userMarkets)
      } catch (err) {
        console.error("Error fetching markets:", err)
        setError("Failed to load markets. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    loadMarkets()
  }, [publicKey, connected])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const getWinnerLabel = (winner: number): string => {
    if (winner === 1) return "Team A"
    if (winner === 2) return "Team B"
    return "Unresolved"
  }

  const openBetModal = (market: Market, side: 1 | 2) => {
    setSelectedMarket(market)
    setSelectedSide(side)
    setBetAmount("")
  }

  const closeBetModal = () => {
    setSelectedMarket(null)
    setBetAmount("")
    setPlacingBet(false)
  }

  const handlePlacePrediction = async () => {
    if (!selectedMarket || !betAmount || parseFloat(betAmount) <= 0) {
      setToast({ message: "Please enter a valid amount", type: "error" })
      return
    }

    setPlacingBet(true)
    try {
      const signature = await placePrediction(
        connection,
        wallet,
        selectedMarket.pubkey,
        selectedSide,
        parseFloat(betAmount)
      )

      setToast({
        message: "Prediction placed successfully!",
        type: "success",
        txHash: signature
      })

      closeBetModal()

      await new Promise(resolve => setTimeout(resolve, 2000))
      const userMarkets = await fetchUserMarkets(publicKey!)
      setMarkets(userMarkets)
    } catch (err: any) {
      console.error("Error placing prediction:", err)
      setToast({
        message: err.message || "Failed to place prediction. Please try again.",
        type: "error"
      })
    } finally {
      setPlacingBet(false)
    }
  }

  if (!connected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Sports Prediction Markets
          </h1>
          <p className="text-muted-foreground text-lg mb-12">
            Predict outcomes, earn rewards
          </p>

          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-semibold mb-4">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-6">
              Connect your wallet to view your created markets
            </p>
            <div className="flex justify-center">
              <WalletMultiButton />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Your Markets
          </h1>
          <p className="text-muted-foreground text-lg mb-12">
            Manage and track your prediction markets
          </p>

          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Fetching your markets...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Your Markets
          </h1>
          <p className="text-muted-foreground text-lg mb-12">
            Manage and track your prediction markets
          </p>

          <div className="bg-card border border-red-500 rounded-lg p-12 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2 text-red-500">Error</h2>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Your Markets
          </h1>
          <p className="text-muted-foreground text-lg mb-12">
            Manage and track your prediction markets
          </p>

          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-semibold mb-2">No Markets Created Yet</h2>
            <p className="text-muted-foreground">
              Create your first prediction market to get started
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
          Your Markets
        </h1>
        <p className="text-muted-foreground text-lg">
          You have created {markets.length} {markets.length === 1 ? "market" : "markets"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {markets.map((market) => {
          const endTime = market.endTime.toNumber()
          const isExpired = endTime < Date.now() / 1000

          return (
            <div
              key={market.pubkey.toBase58()}
              className="bg-card border border-border rounded-lg p-6 hover:shadow-lg hover:border-blue-500 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-1">
                    {market.teamA}
                    <span className="text-muted-foreground mx-2">vs</span>
                    {market.teamB}
                  </h3>
                </div>
                {market.resolved ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-sm font-medium">
                    <Trophy className="w-4 h-4" />
                    Winner: {getWinnerLabel(market.winner)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-sm font-medium">
                    <TrendingUp className="w-4 h-4" />
                    Active
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">
                    {isExpired ? "Ended " : "Ends "}
                    {formatRelativeTime(endTime)}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground">
                  {formatDate(endTime)}
                </div>

                {!market.resolved && (
                  <div className="pt-3 border-t border-border space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Team A Pool:</span>
                      <span className="font-medium">{market.totalYes.toString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Team B Pool:</span>
                      <span className="font-medium">{market.totalNo.toString()}</span>
                    </div>

                    {!isExpired && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => openBetModal(market, 1)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all hover:scale-105 active:scale-95"
                        >
                          <Sword className="w-4 h-4" />
                          Team A
                        </button>
                        <button
                          onClick={() => openBetModal(market, 2)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-all hover:scale-105 active:scale-95"
                        >
                          <Shield className="w-4 h-4" />
                          Team B
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedMarket && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">Place Prediction</h3>
              <button
                onClick={closeBetModal}
                disabled={placingBet}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">Market</div>
                <div className="font-semibold text-lg">
                  {selectedMarket.teamA} vs {selectedMarket.teamB}
                </div>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">Your Prediction</div>
                <div className="flex items-center gap-2 font-semibold text-lg">
                  {selectedSide === 1 ? (
                    <>
                      <Sword className="w-5 h-5 text-blue-500" />
                      <span className="text-blue-500">{selectedMarket.teamA}</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5 text-cyan-500" />
                      <span className="text-cyan-500">{selectedMarket.teamB}</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Amount (SOL)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={placingBet}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Minimum: 0.01 SOL
                </div>
              </div>

              <button
                onClick={handlePlacePrediction}
                disabled={placingBet || !betAmount || parseFloat(betAmount) <= 0}
                className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {placingBet ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Placing Prediction...
                  </span>
                ) : (
                  "Confirm Prediction"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 max-w-md z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div
            className={`rounded-lg p-4 shadow-lg border ${
              toast.type === "success"
                ? "bg-green-500/10 border-green-500 text-green-500"
                : "bg-red-500/10 border-red-500 text-red-500"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="font-medium">{toast.message}</p>
                {toast.txHash && (
                  <a
                    href={getSolscanUrl(toast.txHash, "devnet")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline flex items-center gap-1 mt-2 hover:opacity-80"
                  >
                    View on Solscan
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <button
                onClick={() => setToast(null)}
                className="p-1 hover:opacity-70 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
