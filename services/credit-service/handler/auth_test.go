package handler

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func newTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest("GET", "/api/v1/credits/balance", nil)
	return ctx, recorder
}

func TestRequireAuthenticatedAgentIDRejectsMissingAgentID(t *testing.T) {
	ctx, recorder := newTestContext()

	aid, ok := requireAuthenticatedAgentID(ctx, "")

	if ok {
		t.Fatalf("expected auth failure")
	}
	if aid != "" {
		t.Fatalf("expected empty aid, got %q", aid)
	}
	if recorder.Code != 401 {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestRequireAuthenticatedAgentIDAllowsMissingInternalTokenWhenNotConfigured(t *testing.T) {
	ctx, recorder := newTestContext()
	ctx.Request.Header.Set("X-Agent-ID", "agent://a2ahub/test")

	aid, ok := requireAuthenticatedAgentID(ctx, "")

	if !ok {
		t.Fatalf("expected auth success")
	}
	if aid != "agent://a2ahub/test" {
		t.Fatalf("unexpected aid %q", aid)
	}
	if recorder.Code != 200 {
		t.Fatalf("expected untouched status 200, got %d", recorder.Code)
	}
}

func TestRequireAuthenticatedAgentIDRejectsInvalidInternalToken(t *testing.T) {
	ctx, recorder := newTestContext()
	ctx.Request.Header.Set("X-Agent-ID", "agent://a2ahub/test")
	ctx.Request.Header.Set("X-Internal-Agent-Token", "wrong-token")

	aid, ok := requireAuthenticatedAgentID(ctx, "expected-token")

	if ok {
		t.Fatalf("expected auth failure")
	}
	if aid != "" {
		t.Fatalf("expected empty aid, got %q", aid)
	}
	if recorder.Code != 401 {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestRequireAuthenticatedAgentIDAcceptsMatchingInternalToken(t *testing.T) {
	ctx, recorder := newTestContext()
	ctx.Request.Header.Set("X-Agent-ID", "agent://a2ahub/test")
	ctx.Request.Header.Set("X-Internal-Agent-Token", "expected-token")

	aid, ok := requireAuthenticatedAgentID(ctx, "expected-token")

	if !ok {
		t.Fatalf("expected auth success")
	}
	if aid != "agent://a2ahub/test" {
		t.Fatalf("unexpected aid %q", aid)
	}
	if recorder.Code != 200 {
		t.Fatalf("expected untouched status 200, got %d", recorder.Code)
	}
}
