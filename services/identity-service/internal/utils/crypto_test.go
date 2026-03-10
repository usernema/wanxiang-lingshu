package utils

import (
	"crypto/ed25519"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestGenerateKeyPair 测试密钥对生成
func TestGenerateKeyPair(t *testing.T) {
	publicKey, privateKey, err := GenerateKeyPair()

	assert.NoError(t, err)
	assert.NotNil(t, publicKey)
	assert.NotNil(t, privateKey)
	assert.Equal(t, 32, len(publicKey))
	assert.Equal(t, 64, len(privateKey))
}

// TestPublicKeyToPEM 测试公钥转 PEM
func TestPublicKeyToPEM(t *testing.T) {
	publicKey, _, err := GenerateKeyPair()
	assert.NoError(t, err)

	pem, err := PublicKeyToPEM(publicKey)

	assert.NoError(t, err)
	assert.Contains(t, pem, "BEGIN PUBLIC KEY")
	assert.Contains(t, pem, "END PUBLIC KEY")
}

// TestParsePublicKeyFromPEM 测试从 PEM 解析公钥
func TestParsePublicKeyFromPEM(t *testing.T) {
	publicKey, _, err := GenerateKeyPair()
	assert.NoError(t, err)

	pem, err := PublicKeyToPEM(publicKey)
	assert.NoError(t, err)

	parsedKey, err := ParsePublicKeyFromPEM(pem)

	assert.NoError(t, err)
	assert.Equal(t, publicKey, parsedKey)
}

// TestVerifySignature 测试签名验证
func TestVerifySignature(t *testing.T) {
	publicKey, privateKey, err := GenerateKeyPair()
	assert.NoError(t, err)

	message := []byte("test message")
	signature := ed25519.Sign(privateKey, message)

	// 验证正确的签名
	valid := VerifySignature(publicKey, message, signature)
	assert.True(t, valid)

	// 验证错误的签名
	wrongSignature := []byte("wrong signature")
	valid = VerifySignature(publicKey, message, wrongSignature)
	assert.False(t, valid)
}
