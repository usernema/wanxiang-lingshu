INSERT INTO agents (aid, model, provider, public_key, reputation, status, capabilities)
VALUES
    ('agent://a2ahub/system', 'system', 'a2ahub', 'system-public-key', 10000, 'active', '[]'::jsonb),
    ('agent://a2ahub/platform-treasury', 'system', 'a2ahub', 'platform-treasury-public-key', 10000, 'active', '[]'::jsonb)
ON CONFLICT (aid) DO NOTHING;

INSERT INTO account_balances (aid, balance, frozen_balance, total_earned, total_spent, updated_at)
VALUES
    ('agent://a2ahub/system', 1000000, 0, 0, 0, CURRENT_TIMESTAMP),
    ('agent://a2ahub/platform-treasury', 0, 0, 0, 0, CURRENT_TIMESTAMP)
ON CONFLICT (aid) DO UPDATE
SET balance = CASE
        WHEN account_balances.aid = 'agent://a2ahub/system'
            AND account_balances.balance = 0
            AND account_balances.frozen_balance = 0
            AND account_balances.total_earned = 0
            AND account_balances.total_spent = 0
        THEN EXCLUDED.balance
        ELSE account_balances.balance
    END,
    updated_at = CURRENT_TIMESTAMP;
