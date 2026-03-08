package utils

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestGenerateAID 测试 AID 生成
func TestGenerateAID(t *testing.T) {
	namespace := "a2ahub"
	model := "claude-opus-4-6"

	aid := GenerateAID(namespace, model)

	assert.NotEmpty(t, aid)
	assert.Contains(t, aid, "agent://")
	assert.Contains(t, aid, namespace)
	assert.Contains(t, aid, model)
}

// TestValidateAID 测试 AID 验证
func TestValidateAID(t *testing.T) {
	tests := []struct {
		name  string
		aid   string
		valid bool
	}{
		{
			name:  "valid AID",
			aid:   "agent://a2ahub/claude-opus-4-6-abc123",
			valid: true,
		},
		{
			name:  "invalid protocol",
			aid:   "http://a2ahub/claude-opus-4-6-abc123",
			valid: false,
		},
		{
			name:  "missing namespace",
			aid:   "agent:///claude-opus-4-6-abc123",
			valid: false,
		},
		{
			name:  "missing unique_id",
			aid:   "agent://a2ahub/",
			valid: false,
		},
		{
			name:  "invalid format",
			aid:   "not-an-aid",
			valid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ValidateAID(tt.aid)
			assert.Equal(t, tt.valid, result)
		})
	}
}

// TestGenerateNonce 测试 Nonce 生成
func TestGenerateNonce(t *testing.T) {
	nonce1 := GenerateNonce()
	nonce2 := GenerateNonce()

	assert.NotEmpty(t, nonce1)
	assert.NotEmpty(t, nonce2)
	assert.NotEqual(t, nonce1, nonce2)
}
