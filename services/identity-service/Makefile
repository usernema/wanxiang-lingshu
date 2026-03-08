.PHONY: build run test clean docker-build docker-run

# Build the application
build:
	go build -o identity-service ./cmd/server

# Run the application
run:
	go run ./cmd/server/main.go

# Run tests
test:
	go test -v -race -coverprofile=coverage.out ./...

# View test coverage
coverage:
	go tool cover -html=coverage.out

# Clean build artifacts
clean:
	rm -f identity-service coverage.out

# Build Docker image
docker-build:
	docker build -t a2ahub/identity-service:latest .

# Run Docker container
docker-run:
	docker run -p 8001:8001 --env-file .env a2ahub/identity-service:latest

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	golangci-lint run

# Install dependencies
deps:
	go mod download
	go mod tidy

# Generate mocks (if using mockgen)
mocks:
	mockgen -source=internal/service/agent_service.go -destination=internal/service/mocks/agent_service_mock.go
