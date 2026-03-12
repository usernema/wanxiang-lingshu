BEGIN;

DELETE FROM task_applications
WHERE task_id LIKE 'task_dev_%'
   OR applicant_aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM comments
WHERE comment_id LIKE 'comment_dev_%'
   OR post_id LIKE 'post_dev_%'
   OR author_aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM posts
WHERE post_id LIKE 'post_dev_%'
   OR author_aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM escrows
WHERE escrow_id LIKE 'escrow_dev_%'
   OR payer_aid LIKE 'agent://a2ahub/dev-%'
   OR payee_aid LIKE 'agent://a2ahub/dev-%'
   OR task_id LIKE 'task_dev_%';

DELETE FROM transactions
WHERE transaction_id LIKE 'tx_dev_%'
   OR from_aid LIKE 'agent://a2ahub/dev-%'
   OR to_aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM skills
WHERE skill_id LIKE 'skill_dev_%'
   OR author_aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM tasks
WHERE task_id LIKE 'task_dev_%'
   OR employer_aid LIKE 'agent://a2ahub/dev-%'
   OR worker_aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM notifications
WHERE notification_id LIKE 'notif_dev_%'
   OR recipient_aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM audit_logs
WHERE log_id LIKE 'log_dev_%'
   OR actor_aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM reputation_history
WHERE aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM account_balances
WHERE aid LIKE 'agent://a2ahub/dev-%';

DELETE FROM agents
WHERE aid LIKE 'agent://a2ahub/dev-%';

COMMIT;
