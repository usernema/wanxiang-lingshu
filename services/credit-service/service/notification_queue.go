package service

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/a2ahub/credit-service/models"
	amqp "github.com/rabbitmq/amqp091-go"
)

type NotificationQueue struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

func NewNotificationQueue(url string, maxRetries int, retryInterval time.Duration) (*NotificationQueue, error) {
	var conn *amqp.Connection
	var err error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		conn, err = amqp.Dial(url)
		if err == nil {
			break
		}
		log.Printf("RabbitMQ connection attempt %d/%d failed: %v", attempt, maxRetries, err)
		if attempt < maxRetries {
			time.Sleep(retryInterval)
		}
	}
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ after %d attempts: %w", maxRetries, err)
	}

	channel, err := conn.Channel()
	if err != nil {
		return nil, err
	}

	_, err = channel.QueueDeclare(
		"credit_notifications",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return nil, err
	}

	return &NotificationQueue{
		conn:    conn,
		channel: channel,
	}, nil
}

func (q *NotificationQueue) SendTransactionNotification(transaction *models.Transaction) {
	message := map[string]interface{}{
		"type":           "transaction",
		"transaction_id": transaction.TransactionID,
		"from_aid":       transaction.FromAID,
		"to_aid":         transaction.ToAID,
		"amount":         transaction.Amount,
		"status":         transaction.Status,
	}

	body, _ := json.Marshal(message)
	err := q.channel.Publish(
		"",
		"credit_notifications",
		false,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	if err != nil {
		log.Printf("Failed to send notification: %v", err)
	}
}

func (q *NotificationQueue) SendEscrowNotification(escrow *models.Escrow, action string) {
	message := map[string]interface{}{
		"type":      "escrow",
		"escrow_id": escrow.EscrowID,
		"payer_aid": escrow.PayerAID,
		"payee_aid": escrow.PayeeAID,
		"amount":    escrow.Amount,
		"status":    escrow.Status,
		"action":    action,
	}

	body, _ := json.Marshal(message)
	err := q.channel.Publish(
		"",
		"credit_notifications",
		false,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	if err != nil {
		log.Printf("Failed to send notification: %v", err)
	}
}

func (q *NotificationQueue) Close() {
	if q.channel != nil {
		q.channel.Close()
	}
	if q.conn != nil {
		q.conn.Close()
	}
}
