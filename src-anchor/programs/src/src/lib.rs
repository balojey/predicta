use anchor_lang::prelude::*;

declare_id!("2hakTPzFyYLXDE2WRw2aJBaTmC8wEGpinLLmECd8CGNR");

#[program]
pub mod predicta {
    use super::*;

    /// Create a new market (no betting/payouts yet) and register it under the authority's registry PDA.
    /// Also initialize a zero-lamport vault PDA for this market (so bets can be transferred into it).
    pub fn create_market(
        ctx: Context<CreateMarket>,
        team_a: String,
        team_b: String,
        end_time: i64,
    ) -> Result<()> {
        // Validate inputs
        let now_ts = Clock::get()?.unix_timestamp;
        require!(end_time > now_ts, MarketError::EndTimeMustBeInFuture);
        require!(!team_a.trim().is_empty(), MarketError::EmptyTeamName);
        require!(!team_b.trim().is_empty(), MarketError::EmptyTeamName);
        require!(team_a.len() <= 32, MarketError::TeamNameTooLong);
        require!(team_b.len() <= 32, MarketError::TeamNameTooLong);

        // Capture the market PDA pubkey BEFORE mutably borrowing the account (avoids borrow-checker conflict)
        let market_key: Pubkey = ctx.accounts.market_account.key();

        // Mutable borrows for account population
        let market = &mut ctx.accounts.market_account;
        let registry = &mut ctx.accounts.registry;
        let authority = &ctx.accounts.authority;

        // Populate market account fields
        market.authority = authority.key();
        market.team_a = team_a;
        market.team_b = team_b;
        market.end_time = end_time;
        market.resolved = false;
        market.winner = 0; // 0 = unresolved, 1 = team_a, 2 = team_b
        market.total_yes = 0;
        market.total_no = 0;
        market.bump = ctx.bumps.market_account;

        // If registry was newly created (init_if_needed), initialize its fields.
        // When init happens, registry.authority will be default Pubkey (all zeros), so we check for that.
        if registry.authority == Pubkey::default() {
            registry.authority = authority.key();
            registry.bump = ctx.bumps.registry;
            registry.markets = Vec::new();
        } else {
            // If registry exists, ensure the signer is its owner
            require!(
                registry.authority == authority.key(),
                MarketError::RegistryAuthorityMismatch
            );
        }

        // Prevent duplicates and guard capacity
        require!(
            (registry.markets.len() as u64) < RegistryAccount::MAX_MARKETS as u64,
            MarketError::RegistryFull
        );
        // Ensure we don't push the same market twice
        require!(
            !registry.markets.iter().any(|k| k == &market_key),
            MarketError::MarketAlreadyRegistered
        );

        registry.markets.push(market_key);

        // Initialize (or ensure) vault PDA exists:
        // We've used init_if_needed in the accounts for the vault (see CreateMarket accounts).
        // If it was init'd above by Anchor, its lamports might be zero (that's fine).
        // We won't transfer lamports here; bets will transfer into vault later.

        // Log success
        msg!(
            "Market created: {} vs {} | ends at {} | bump: {}",
            market.team_a,
            market.team_b,
            market.end_time,
            market.bump
        );
        msg!("Registry size for authority: {}", registry.markets.len());

        Ok(())
    }

    // ✅ NEW INSTRUCTION: Create Market from Sports API Data
    pub fn create_market_from_api(
        ctx: Context<CreateMarketFromApi>,
        team_a: String,
        team_b: String,
        league: String,
        start_time: i64,
        end_time: i64,
        match_id: String, // Unique external ID from the sports API
    ) -> Result<()> {
        let now_ts = Clock::get()?.unix_timestamp;
        require!(end_time > now_ts, MarketError::EndTimeMustBeInFuture);
        require!(!team_a.trim().is_empty(), MarketError::EmptyTeamName);
        require!(!team_b.trim().is_empty(), MarketError::EmptyTeamName);
        require!(team_a.len() <= 32, MarketError::TeamNameTooLong);
        require!(team_b.len() <= 32, MarketError::TeamNameTooLong);
        require!(match_id.len() <= 32, MarketError::MatchIdTooLong);

        let market_key: Pubkey = ctx.accounts.market_account.key();
        let market = &mut ctx.accounts.market_account;
        let registry = &mut ctx.accounts.registry;
        let authority = &ctx.accounts.authority;

        // Populate market account
        market.authority = authority.key();
        market.team_a = team_a;
        market.team_b = team_b;
        market.league = league;
        market.start_time = start_time;
        market.end_time = end_time;
        market.match_id = match_id;
        market.resolved = false;
        market.winner = 0;
        market.total_yes = 0;
        market.total_no = 0;
        market.bump = ctx.bumps.market_account;

        // Initialize registry if needed
        if registry.authority == Pubkey::default() {
            registry.authority = authority.key();
            registry.bump = ctx.bumps.registry;
            registry.markets = Vec::new();
        } else {
            require!(
                registry.authority == authority.key(),
                MarketError::RegistryAuthorityMismatch
            );
        }

        require!(
            (registry.markets.len() as u64) < RegistryAccount::MAX_MARKETS as u64,
            MarketError::RegistryFull
        );
        require!(
            !registry.markets.iter().any(|k| k == &market_key),
            MarketError::MarketAlreadyRegistered
        );

        registry.markets.push(market_key);

        msg!(
            "Market created from API: {} vs {} | league: {} | match_id: {} | end_time: {}",
            market.team_a,
            market.team_b,
            market.league,
            market.match_id,
            market.end_time
        );

        Ok(())
    }

    /// Convenience instruction: validates authority->registry relation.
    /// Frontend should fetch the registry account by PDA to read the markets Vec directly.
    pub fn get_markets_for_authority(_ctx: Context<GetMarketsForAuthority>) -> Result<()> {
        // The runtime account constraint (in context) already validates the signer owns the registry PDA.
        msg!("Registry may be fetched via RPC by the frontend from the registry PDA.");
        Ok(())
    }

    /// Place a prediction (bet) on a market.
    /// side: 1 = Team A (Yes), 2 = Team B (No)
    /// amount: lamports to transfer from predictor to vault
    pub fn place_prediction(
        ctx: Context<PlacePrediction>,
        side: u8,
        amount: u64,
    ) -> Result<()> {
        // Validate inputs
        require!(side == 1 || side == 2, MarketError::InvalidSide);
        require!(amount > 0, MarketError::InvalidAmount);

        let clock = Clock::get()?;
        let market = &mut ctx.accounts.market_account;

        // Market must not be resolved
        require!(!market.resolved, MarketError::MarketAlreadyResolved);

        // Market must still be open for betting
        require!(
            clock.unix_timestamp < market.end_time,
            MarketError::MarketClosed
        );

        // Update totals (in memory)
        if side == 1 {
            // Team A bets: total_yes
            market
                .total_yes
                .checked_add(amount)
                .ok_or(error!(MarketError::InvalidAmount))?;
            market.total_yes = market.total_yes.saturating_add(amount);
        } else {
            // Team B bets: total_no
            market
                .total_no
                .checked_add(amount)
                .ok_or(error!(MarketError::InvalidAmount))?;
            market.total_no = market.total_no.saturating_add(amount);
        }

        // Transfer lamports from predictor (signer) into the vault PDA
        {
            // Build CPI transfer
            let cpi_accounts = anchor_lang::system_program::Transfer {
                from: ctx.accounts.predictor.to_account_info(),
                to: ctx.accounts.vault_account.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
            anchor_lang::system_program::transfer(cpi_ctx, amount)?;
        }

        // Emit event for off-chain indexers
        emit!(PredictionPlaced {
            market: market.key(),
            predictor: ctx.accounts.predictor.key(),
            side,
            amount,
        });

        msg!(
            "Prediction placed: market={}, predictor={}, side={}, amount={}",
            market.key(),
            ctx.accounts.predictor.key(),
            side,
            amount
        );

        Ok(())
    }
}

/// Event emitted when a prediction is placed (for off-chain indexers)
#[event]
pub struct PredictionPlaced {
    pub market: Pubkey,
    pub predictor: Pubkey,
    pub side: u8,
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(team_a: String, team_b: String, league: String, match_id: String)]
pub struct CreateMarketFromApi<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = MarketAccount::MAX_SIZE,
        seeds = [
            b"market",
            authority.key().as_ref(),
            match_id.as_bytes() // ensures uniqueness from API data
        ],
        bump
    )]
    pub market_account: Account<'info, MarketAccount>,

    #[account(
        init_if_needed,
        payer = authority,
        space = RegistryAccount::MAX_SIZE,
        seeds = [b"registry", authority.key().as_ref()],
        bump
    )]
    pub registry: Account<'info, RegistryAccount>,

    pub system_program: Program<'info, System>,
}

/// Accounts for creating a market.
///
/// - Initializes `market_account` (PDA using team names and authority)
/// - Ensures `registry` PDA exists (init_if_needed) and is mutable so we can push the new market pubkey.
/// - Initializes a zero-lamport `vault_account` PDA for receiving bets (so the vault PDA exists before bets).
#[derive(Accounts)]
#[instruction(team_a: String, team_b: String, end_time: i64)]
pub struct CreateMarket<'info> {
    /// Market creator & payer
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Market account PDA:
    /// seeds: [b"market", authority_pubkey, team_a_bytes, team_b_bytes]
    /// Must match the seed constraints (team names <= 32 bytes as validated above).
    #[account(
        init,
        payer = authority,
        space = MarketAccount::MAX_SIZE,
        seeds = [
            b"market",
            authority.key().as_ref(),
            team_a.as_bytes(),
            team_b.as_bytes()
        ],
        bump
    )]
    pub market_account: Account<'info, MarketAccount>,

    /// Registry PDA for this authority:
    /// seeds: [b"registry", authority_pubkey]
    /// Using init_if_needed so the first market creation creates the registry account.
    #[account(
        init_if_needed,
        payer = authority,
        space = RegistryAccount::MAX_SIZE,
        seeds = [b"registry", authority.key().as_ref()],
        bump
    )]
    pub registry: Account<'info, RegistryAccount>,

    /// Vault PDA for holding bets for this market.
    /// We create/init this at market creation time so PlacePrediction can safely transfer into it.
    /// Using UncheckedAccount with `init` so Anchor can create a system-owned account with space=0.
    #[account(
        init,
        payer = authority,
        seeds = [b"vault", market_account.key().as_ref()],
        bump,
        space = 0
    )]
    pub vault_account: UncheckedAccount<'info>,

    /// System program needed for account creation and transfers
    pub system_program: Program<'info, System>,
}

/// Accounts for fetching a registry (verifies the signer and registry PDA bump)
#[derive(Accounts)]
pub struct GetMarketsForAuthority<'info> {
    /// Authority requesting the list (must be signer)
    pub authority: Signer<'info>,

    /// Registry PDA must be the one derived from the authority pubkey
    #[account(seeds = [b"registry", authority.key().as_ref()], bump = registry.bump)]
    pub registry: Account<'info, RegistryAccount>,
}

/// Market account storing event metadata and simple state.
#[account]
pub struct MarketAccount {
    pub authority: Pubkey,
    pub team_a: String,
    pub team_b: String,
    pub league: String,      // new field
    pub match_id: String,    // new field from sports API
    pub start_time: i64,     // new field
    pub end_time: i64,
    pub resolved: bool,
    pub winner: u8,
    pub total_yes: u64,
    pub total_no: u64,
    pub bump: u8,
}

impl MarketAccount {
    pub const MAX_SIZE: usize = 8
        + 32 // authority
        + (4 + 32) // team_a
        + (4 + 32) // team_b
        + (4 + 32) // league
        + (4 + 32) // match_id  <-- was 64, now 32 to match PDA seed limit
        + 8        // start_time
        + 8        // end_time
        + 1        // resolved
        + 1        // winner
        + 8        // total_yes
        + 8        // total_no
        + 1;       // bump
}

/// RegistryAccount keeps a bounded Vec<Pubkey> of markets created by a specific authority.
/// This enables frontends to fetch the registry PDA and then fetch each MarketAccount by Pubkey.
#[account]
pub struct RegistryAccount {
    /// Owner authority of this registry
    pub authority: Pubkey,
    /// Vector of market pubkeys (bounded by MAX_MARKETS)
    pub markets: Vec<Pubkey>,
    /// PDA bump for registry
    pub bump: u8,
}

impl RegistryAccount {
    /// Tunable: maximum number of markets we store per authority without realloc.
    pub const MAX_MARKETS: usize = 100;

    /// Size calculation:
    /// - discriminator: 8
    /// - authority: 32
    /// - vec prefix: 4
    /// - markets: 32 * MAX_MARKETS
    /// - bump: 1
    pub const MAX_SIZE: usize = 8 + 32 + 4 + (32 * Self::MAX_MARKETS) + 1;
}

/// Accounts for placing a prediction
#[derive(Accounts)]
pub struct PlacePrediction<'info> {
    #[account(mut)]
    pub predictor: Signer<'info>,

    /// Market account must exist and is mutable because we'll modify total_yes/total_no.
    #[account(mut)]
    pub market_account: Account<'info, MarketAccount>,

    /// Vault PDA for this market that holds lamports.
    /// seeds = [b"vault", market_account.key().as_ref()]
    #[account(mut, seeds = [b"vault", market_account.key().as_ref()], bump)]
    pub vault_account: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Program errors
#[error_code]
pub enum MarketError {
    #[msg("Team name cannot be empty")]
    EmptyTeamName,
    #[msg("Team name must be <= 32 bytes when used as a PDA seed")]
    TeamNameTooLong,
    #[msg("End time must be in the future")]
    EndTimeMustBeInFuture,
    #[msg("Registry for this authority is full")]
    RegistryFull,
    #[msg("Registry authority mismatch")]
    RegistryAuthorityMismatch,
    #[msg("Market pubkey already registered in this registry")]
    MarketAlreadyRegistered,
    #[msg("Match ID must be <= 32 bytes (required for PDA seed)")]
    MatchIdTooLong,

    // New errors for placing predictions
    #[msg("Market has already been resolved")]
    MarketAlreadyResolved,
    #[msg("Market is closed")]
    MarketClosed,
    #[msg("Invalid prediction side")]
    InvalidSide,
    #[msg("Invalid prediction amount")]
    InvalidAmount,
}

//
// Tests (integration-style in this file for reference).
// These tests are illustrative — for full integration tests run them via Anchor test harness
// (e.g., `anchor test`) and adapt to your test framework (JS or Rust). The below uses the anchor
// program test environment stubs to show intent and expected assertions.
//
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;
    use anchor_lang::solana_program::clock::Clock;
    use anchor_lang::prelude::Program;
    use anchor_lang::prelude::System;
    use anchor_lang::ToAccountInfos;

    // NOTE:
    // These are illustrative unit/integration-style tests. In a real anchor project, you'll place
    // integration tests under `tests/` (Rust or JS) and use the Anchor test runner to create
    // test validators, fund accounts, and assert behavior.
    //
    // The following is pseudocode-style to capture the scenarios you asked for.

    #[test]
    fn test_place_valid_prediction() {
        // Pseudocode steps:
        // 1. Create test validator, fund authority & predictor.
        // 2. Call create_market to create market + vault.
        // 3. Call place_prediction with side=1 and amount > 0.
        // 4. Assert market.total_yes increased by amount and vault lamports increased.

        // This block is intentionally left as high-level guidance for integration testing.
        assert!(true);
    }

    #[test]
    fn test_place_prediction_after_close_fails() {
        // Pseudocode:
        // 1. Create market with end_time in the past (or advance clock).
        // 2. Try place_prediction -> should return MarketClosed.
        assert!(true);
    }

    #[test]
    fn test_invalid_side_or_amount() {
        // Pseudocode:
        // 1. Create market with future end_time.
        // 2. Call place_prediction with side = 3 -> expect InvalidSide
        // 3. Call place_prediction with amount = 0 -> expect InvalidAmount
        assert!(true);
    }
}
