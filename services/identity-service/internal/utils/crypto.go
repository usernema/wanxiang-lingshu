package utils

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"fmt"
)

// GenerateKeyPair 生成 Ed25519 密钥对
func GenerateKeyPair() (publicKey ed25519.PublicKey, privateKey ed25519.PrivateKey, err error) {
	publicKey, privateKey, err = ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate key pair: %w", err)
	}
	return publicKey, privateKey, nil
}

// PublicKeyToPEM 将公钥转换为 PEM 格式
func PublicKeyToPEM(publicKey ed25519.PublicKey) (string, error) {
	pubKeyBytes, err := x509.MarshalPKIXPublicKey(publicKey)
	if err != nil {
		return "", fmt.Errorf("failed to marshal public key: %w", err)
	}

	pubKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubKeyBytes,
	})

	return string(pubKeyPEM), nil
}

// PrivateKeyToPEM 将私钥转换为 PEM 格式
func PrivateKeyToPEM(privateKey ed25519.PrivateKey) (string, error) {
	privKeyBytes, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return "", fmt.Errorf("failed to marshal private key: %w", err)
	}

	privKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: privKeyBytes,
	})

	return string(privKeyPEM), nil
}

// ParsePublicKeyFromPEM 从 PEM 格式解析公钥
func ParsePublicKeyFromPEM(pemStr string) (ed25519.PublicKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse public key: %w", err)
	}

	publicKey, ok := pub.(ed25519.PublicKey)
	if !ok {
		return nil, fmt.Errorf("not an Ed25519 public key")
	}

	return publicKey, nil
}

// VerifySignature 验证签名
func VerifySignature(publicKey ed25519.PublicKey, message, signature []byte) bool {
	return ed25519.Verify(publicKey, message, signature)
}
